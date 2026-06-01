/**
 * TOTP secret encryption/decryption — Identity Phase 1.
 *
 * Uses AES-256-GCM with a random 12-byte IV.
 * Format stored in DB: `base64url(iv).base64url(ciphertext+authTag)`
 *
 * The key is loaded from TOTP_ENCRYPTION_KEY (32 bytes, base64url encoded)
 * and is validated at boot time via src/lib/env.ts.
 *
 * SERVER-ONLY: this module must never be imported on the client side.
 * The decrypted plaintext is never sent to the browser.
 *
 * Key-rotation note: rotating the key requires re-enrolling all tutors —
 * see docs/PLATFORM-ASSUMPTIONS.md. A future dual-key decrypt path is
 * documented there but intentionally NOT built in V1.
 */

import { createSecretKey, createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;    // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag

/** Load and validate the encryption key from env once at module init. */
function loadKey(): ReturnType<typeof createSecretKey> {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("[tfa] TOTP_ENCRYPTION_KEY is not set. Boot aborted.");
  }
  const keyBytes = Buffer.from(raw, "base64url");
  if (keyBytes.length !== 32) {
    throw new Error(
      `[tfa] TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes; got ${keyBytes.length}.`
    );
  }
  return createSecretKey(keyBytes);
}

/**
 * Encrypts a TOTP secret (base32 string) with AES-256-GCM.
 * Returns a string safe to persist in AdminUser2FA.totpSecretEnc.
 * Never throws on valid input — throws on crypto failure (indicates bad key/env).
 */
export function encryptTotpSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const ciphertextAndTag = Buffer.concat([encrypted, authTag]);
  return (
    iv.toString("base64url") +
    "." +
    ciphertextAndTag.toString("base64url")
  );
}

/**
 * Decrypts a value produced by encryptTotpSecret().
 * Throws if the format is wrong, the key is wrong, or the tag is invalid
 * (tampered ciphertext) — caller must handle.
 * The returned string is the original base32 TOTP secret.
 * NEVER log or send this return value to the client.
 */
export function decryptTotpSecret(stored: string): string {
  const key = loadKey();
  const dotIndex = stored.indexOf(".");
  if (dotIndex === -1) {
    throw new Error("[tfa] Invalid stored format: missing IV separator");
  }
  const iv = Buffer.from(stored.slice(0, dotIndex), "base64url");
  const ciphertextAndTag = Buffer.from(stored.slice(dotIndex + 1), "base64url");
  if (iv.length !== IV_LENGTH) {
    throw new Error(`[tfa] Invalid IV length: ${iv.length}`);
  }
  if (ciphertextAndTag.length < TAG_LENGTH) {
    throw new Error("[tfa] Stored blob too short to contain auth tag");
  }
  const authTag = ciphertextAndTag.slice(ciphertextAndTag.length - TAG_LENGTH);
  const ciphertext = ciphertextAndTag.slice(0, ciphertextAndTag.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
