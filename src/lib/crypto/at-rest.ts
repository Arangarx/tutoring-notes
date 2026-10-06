/**
 * Server-side secret encryption at rest — AES-256-GCM, random 12-byte IV.
 * Stored format: `base64url(iv).base64url(ciphertext+authTag)`.
 *
 * One root key (TOTP_ENCRYPTION_KEY, 32 bytes base64url). Each purpose other
 * than `totp` gets its own HKDF-SHA256 subkey so a ciphertext for one purpose
 * never decrypts under another. `totp` uses the root key directly because
 * enrolled tutors' secrets were written that way before purposes existed.
 *
 * SERVER-ONLY: never import from client code. Never log a plaintext.
 */

import {
  createSecretKey,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "crypto";

export type AtRestPurpose = "totp" | "wb-live-key";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function loadRootKeyBytes(): Buffer {
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
  return keyBytes;
}

function loadKey(purpose: AtRestPurpose): KeyObject {
  const root = loadRootKeyBytes();
  if (purpose === "totp") return createSecretKey(root);
  const sub = Buffer.from(
    hkdfSync("sha256", root, Buffer.alloc(0), `mynk-at-rest:${purpose}`, 32)
  );
  return createSecretKey(sub);
}

export function encryptAtRest(purpose: AtRestPurpose, plaintext: string): string {
  const key = loadKey(purpose);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const ciphertextAndTag = Buffer.concat([encrypted, cipher.getAuthTag()]);
  return iv.toString("base64url") + "." + ciphertextAndTag.toString("base64url");
}

/** Throws on bad format, wrong key, wrong purpose, or tampering. */
export function decryptAtRest(purpose: AtRestPurpose, stored: string): string {
  const key = loadKey(purpose);
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
  const authTag = ciphertextAndTag.subarray(ciphertextAndTag.length - TAG_LENGTH);
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
