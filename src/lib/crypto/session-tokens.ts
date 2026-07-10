/**
 * Session token primitives — shared across AccountHolder and Learner realms.
 *
 * Both realms use the same HMAC-SHA-256 pattern:
 *   1. Server generates rawToken = crypto.randomBytes(32).hex()
 *   2. tokenHash = HMAC-SHA-256(rawToken, secret) is stored in the DB
 *   3. rawToken is issued to the client in an HttpOnly cookie
 *   4. On each request: hash the cookie value and look up the row by tokenHash
 *
 * Why HMAC over plain SHA-256:
 *   - Keyed: an attacker with DB read access cannot forge valid tokens without the secret
 *   - SHA-256 alone (as used for email tokens) is fine for short-lived single-use tokens;
 *     for persistent session tokens, HMAC adds defense-in-depth against DB compromise
 *
 * Fail-closed: if the HMAC secret is missing at request time, auth functions must reject
 * the request rather than fall back to a weaker scheme. This is enforced by the callers
 * (getAccountHolderSession, getLearnerSession) reading the secret before each operation.
 *
 * SERVER-ONLY: never import on the client.
 */

import { createHmac, randomBytes, createHash } from "node:crypto";

const TOKEN_BYTES = 32;

/** Generate a cryptographically random hex token string (64 hex chars = 256 bits). */
export function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * HMAC-SHA-256(rawToken, secret) → hex string.
 * Throws if secret is empty/missing — fail-closed design.
 */
export function hmacToken(rawToken: string, secret: string): string {
  if (!secret) {
    throw new Error("[auth] HMAC secret is not set — refusing to sign token (fail-closed).");
  }
  return createHmac("sha256", secret).update(rawToken, "utf8").digest("hex");
}

/**
 * SHA-256(rawToken) → hex string.
 * Used for single-use email tokens (same pattern as PasswordResetToken and AccountHolderEmailToken).
 * No secret needed: these tokens are short-lived and single-use; the hash prevents
 * raw-token leakage from DB reads.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** 30 days in milliseconds */
export const AH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 90 days in milliseconds (Q-4 LOCKED) */
export const LEARNER_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** 1 hour in milliseconds */
export const EMAIL_TOKEN_TTL_MS_1H = 60 * 60 * 1000;

/** 24 hours in milliseconds */
export const EMAIL_TOKEN_TTL_MS_24H = 24 * 60 * 60 * 1000;

/** 48 hours in milliseconds */
export const CLAIM_INVITE_TTL_MS = 48 * 60 * 60 * 1000;
