/**
 * Server-held live-session relay key (org + QoL branch, Andrew chose
 * server-held so a learner can join from their dashboard without a link).
 *
 * Minted once at session create, stored encrypted at rest, decrypted only
 * when rendering a page for an already-authorized participant. The relay
 * itself still only sees ciphertext. Never log the key.
 *
 * SERVER-ONLY.
 */

import { randomBytes } from "crypto";
import { decryptAtRest, encryptAtRest } from "@/lib/crypto/at-rest";

/**
 * Same shape as the browser mint: 32 random bytes, unpadded base64url.
 * Null when the at-rest root key is not configured (optional in local dev):
 * the session then falls back to the browser-minted link-fragment key.
 */
export function mintServerLiveKey(
  sessionLabel: string
): { liveKey: string; liveKeyEnc: string } | null {
  if (!process.env.TOTP_ENCRYPTION_KEY) {
    console.warn(`[slc] ${sessionLabel} action=live_key_unavailable reason=no_root_key`);
    return null;
  }
  const liveKey = randomBytes(32).toString("base64url");
  return { liveKey, liveKeyEnc: encryptAtRest("wb-live-key", liveKey) };
}

/** Null for legacy sessions (no stored key) or an undecryptable value. */
export function readServerLiveKey(
  sessionId: string,
  liveKeyEnc: string | null | undefined
): string | null {
  if (!liveKeyEnc) return null;
  try {
    return decryptAtRest("wb-live-key", liveKeyEnc);
  } catch {
    console.error(`[slc] wbsid=${sessionId} action=live_key_decrypt_failed`);
    return null;
  }
}
