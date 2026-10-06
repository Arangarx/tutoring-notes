/**
 * TOTP secret encryption/decryption — Identity Phase 1.
 * Thin wrapper over `at-rest.ts` (purpose `totp`, root key, unchanged format).
 *
 * Key-rotation note: rotating the key requires re-enrolling all tutors —
 * see docs/PLATFORM-ASSUMPTIONS.md.
 *
 * SERVER-ONLY: this module must never be imported on the client side.
 */

import { decryptAtRest, encryptAtRest } from "./at-rest";

export function encryptTotpSecret(plaintext: string): string {
  return encryptAtRest("totp", plaintext);
}

/** Throws on bad format, wrong key, or tampering. NEVER log the result. */
export function decryptTotpSecret(stored: string): string {
  return decryptAtRest("totp", stored);
}
