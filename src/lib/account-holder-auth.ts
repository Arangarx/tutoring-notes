/**
 * AccountHolder password helpers — thin wrapper over bcrypt with the
 * correct round count for external-facing accounts.
 *
 * Per-realm round counts (§3.3):
 *   AdminUser (tutor/admin) — 10 rounds  (src/lib/auth-db.ts)
 *   AccountHolder (parent)  — 12 rounds  (this file)
 *   LearnerCredential (PIN) — 10 rounds  (adequate; rate-limit is primary defense)
 *
 * Shared bcrypt import: both realms use bcryptjs; no duplication — each realm
 * has its own thin wrapper (this file vs src/lib/auth-db.ts).
 *
 * SERVER-ONLY: never import on the client.
 */

import bcrypt from "bcryptjs";

const AH_SALT_ROUNDS = 12;

/** Hash an AccountHolder password (12 bcrypt rounds). */
export async function hashAccountHolderPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, AH_SALT_ROUNDS);
}

/** Verify an AccountHolder password. Returns false for null hashes (anti-timing safe). */
export async function verifyAccountHolderPassword(
  plain: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Compare against a dummy hash to prevent timing side-channels when the
 * account doesn't exist. Call this instead of short-circuiting on "not found".
 */
const DUMMY_HASH = "$2a$12$abcdefghijklmnopqrstuuAbCdEfGhIjKlMnOpQrStUvWxYz012345";

export async function dummyHashCompare(): Promise<void> {
  await bcrypt.compare("x", DUMMY_HASH);
}

/** 10-round bcrypt for learner PIN (rate-limiting is the primary brute-force defense). */
const LEARNER_SALT_ROUNDS = 10;

/** Hash a learner PIN. */
export async function hashLearnerPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, LEARNER_SALT_ROUNDS);
}

/** Verify a learner PIN. */
export async function verifyLearnerPin(
  pin: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}

const LEARNER_DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuuAbCdEfGhIjKlMnOpQrStUvWxYz01234";

export async function dummyLearnerHashCompare(): Promise<void> {
  await bcrypt.compare("x", LEARNER_DUMMY_HASH);
}
