/**
 * Learner PIN rate limiter — IAC-10 LOCKED (supersedes AH-4).
 *
 * Layered policy:
 *   Soft tiers (per username+IP, Neon-backed):
 *     1–3 failures:  no delay (fat-finger grace)
 *     4–6 failures:  30s cooldown
 *     7–9 failures:  5 min cooldown; nudge "ask a parent"
 *     10–12:         15 min cooldown
 *   Hard lock (per credential handle `familyId:username`, IP-INDEPENDENT, Neon-backed):
 *     13+ failures:  HARD LOCK — returns `account_locked`; requires parent-side unlock.
 *     Hard lock survives cold starts (Neon Postgres-backed, shared across instances).
 *
 * Per-IP global limit (all handles): `learner_ip:<ip>` — max 30 req/min (in-memory;
 *   lower severity, separate from PIN throttle — see BACKLOG [SECURITY]).
 *
 * Reliability: hard lock is parent-recoverable, not support-ticket permanent (IAC-10).
 *
 * Concurrency: failure increments are atomic (single SQL INSERT … ON CONFLICT DO UPDATE
 *   … RETURNING) to prevent lost-update races across concurrent serverless instances.
 *
 * Usage in login handler:
 *   0. await isCredentialHardLocked(credKey)     → if true, 423 immediately
 *   1. await checkLearnerPinCooldown(u, ip)     → if in cooldown, 429
 *   2. Attempt bcrypt comparison
 *   3a. On failure: await recordLearnerPinFailure(u, ip, credKey) → check result
 *   3b. On success: await resetLearnerPinFailures(u, ip, credKey)
 *
 * Parent unlock: await clearCredentialHardLock(credKey) — called from parent-side server action.
 *
 * DB keying (VERIFIED here):
 *   Soft: scopeKey = "soft:<normalizedUsername>:<ip>"      kind = "soft"
 *   Hard: scopeKey = "hard:<familyId>:<username>"          kind = "hard"
 *   IP:   learner_ip:<ip> (in-memory rateLimit, unchanged)
 */

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the soft cooldown duration (seconds) for a given failure count.
 * Count 13+ is handled by the hard lock; this returns 0 for that range.
 */
function softCooldownSecondsForCount(count: number): number {
  if (count <= 3) return 0;    // fat-finger grace (free attempts)
  if (count <= 6) return 30;   // tier 2: 30s
  if (count <= 9) return 300;  // tier 3: 5 min (+ "ask a parent" nudge)
  if (count <= 12) return 900; // tier 4: 15 min
  return 0;                     // 13+ → hard lock (handled separately)
}

/** Hard lock threshold: IP-independent failures before account is locked. */
const HARD_LOCK_THRESHOLD = 13;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearnerPinCooldownResult {
  inCooldown: boolean;
  retryAfterSeconds: number;
}

export interface LearnerPinRecordResult {
  newCooldownSeconds: number;
  failureCount: number;
  lockoutThresholdReached: boolean;
  hardLockTriggered: boolean;
}

// ---------------------------------------------------------------------------
// Soft cooldown check (per username+IP)
// ---------------------------------------------------------------------------

/**
 * Check whether username+IP is currently in a soft cooldown period.
 * Does NOT increment the failure count — call this before the bcrypt attempt.
 *
 * Also enforces the per-IP 30 req/min guard (in-memory; separate lower-severity bucket).
 */
export async function checkLearnerPinCooldown(
  normalizedUsername: string,
  ip: string
): Promise<LearnerPinCooldownResult> {
  // Per-IP overflow guard (in-memory; lower severity — see BACKLOG [SECURITY])
  const ipBucket = rateLimit(`learner_ip:${ip}`, 30, 60_000);
  if (!ipBucket.allowed) {
    return {
      inCooldown: true,
      retryAfterSeconds: Math.ceil(ipBucket.retryAfterMs / 1000),
    };
  }

  const scopeKey = `soft:${normalizedUsername}:${ip}`;
  const row = await db.learnerLoginThrottle.findUnique({
    where: { scopeKey },
    select: { cooldownUntil: true, failureCount: true },
  });

  if (!row) return { inCooldown: false, retryAfterSeconds: 0 };

  const now = new Date();
  if (row.cooldownUntil && row.cooldownUntil > now) {
    return {
      inCooldown: true,
      retryAfterSeconds: Math.ceil((row.cooldownUntil.getTime() - now.getTime()) / 1000),
    };
  }

  // Opportunistic cleanup: expired cooldown with low failure count (fat-finger noise).
  // Runs async — failure is benign (row will be overwritten on next failure increment).
  if (row.failureCount <= 3) {
    db.learnerLoginThrottle.delete({ where: { scopeKey } }).catch(() => {});
  }

  return { inCooldown: false, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Hard lock check (per credential handle, IP-independent)
// ---------------------------------------------------------------------------

/**
 * Check whether a credential handle is hard-locked (parent unlock required).
 * Returns true if hard-locked; false otherwise.
 * credKey: `familyId:username`
 */
export async function isCredentialHardLocked(credKey: string): Promise<boolean> {
  const row = await db.learnerLoginThrottle.findUnique({
    where: { scopeKey: `hard:${credKey}` },
    select: { hardLockedAt: true },
  });
  return row?.hardLockedAt != null;
}

/**
 * Clear the hard lock for a credential (parent-side unlock).
 * Deletes the hard row entirely, resetting both the lock and the counter.
 * credKey: `familyId:username`
 */
export async function clearCredentialHardLock(credKey: string): Promise<void> {
  await db.learnerLoginThrottle.deleteMany({
    where: { scopeKey: `hard:${credKey}` },
  });
}

// ---------------------------------------------------------------------------
// Record failure (atomic DB upsert — both soft + hard counters)
// ---------------------------------------------------------------------------

/**
 * Record a failed login attempt. Call this AFTER the bcrypt comparison fails.
 * Updates both the soft (username+IP) and hard (credential-level) counters via
 * atomic INSERT … ON CONFLICT DO UPDATE … RETURNING to prevent lost-update races.
 *
 * Concurrency contract:
 *   Two concurrent failures on the same key both land an atomic increment.
 *   The DB serializes the updates: one gets count N, the other N+1.
 *   Both derive their own cooldownUntil / hardLockedAt from the returned count.
 *   For hardLockedAt: the CASE expression preserves the first-set value
 *   (idempotent once non-null), so concurrent triggers at threshold both
 *   observe a locked account without double-setting or clearing.
 *
 * credKey: `familyId:username` — the IP-independent hard-lock key.
 */
export async function recordLearnerPinFailure(
  normalizedUsername: string,
  ip: string,
  credKey: string
): Promise<LearnerPinRecordResult> {
  // --- Soft counter (username+IP scoped) ---
  // Single atomic SQL: increment failureCount and compute cooldownUntil in one round-trip.
  // The CASE in the UPDATE refers to the PRE-increment value so "+ 1" gives the new count.
  const softScopeKey = `soft:${normalizedUsername}:${ip}`;

  type SoftRow = { failureCount: number | bigint; cooldownUntil: Date | null };
  const softRows = await db.$queryRaw<SoftRow[]>(Prisma.sql`
    INSERT INTO "LearnerLoginThrottle"
      ("id", "scopeKey", "kind", "failureCount", "cooldownUntil", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      ${softScopeKey},
      'soft',
      1,
      CASE
        WHEN 1 <= 3  THEN NULL
        WHEN 1 <= 6  THEN NOW() + INTERVAL '30 seconds'
        WHEN 1 <= 9  THEN NOW() + INTERVAL '5 minutes'
        WHEN 1 <= 12 THEN NOW() + INTERVAL '15 minutes'
        ELSE NULL
      END,
      NOW(), NOW()
    )
    ON CONFLICT ("scopeKey") DO UPDATE
      SET
        "failureCount"  = "LearnerLoginThrottle"."failureCount" + 1,
        "cooldownUntil" = CASE
          WHEN "LearnerLoginThrottle"."failureCount" + 1 <= 3  THEN NULL
          WHEN "LearnerLoginThrottle"."failureCount" + 1 <= 6  THEN NOW() + INTERVAL '30 seconds'
          WHEN "LearnerLoginThrottle"."failureCount" + 1 <= 9  THEN NOW() + INTERVAL '5 minutes'
          WHEN "LearnerLoginThrottle"."failureCount" + 1 <= 12 THEN NOW() + INTERVAL '15 minutes'
          ELSE "LearnerLoginThrottle"."cooldownUntil"
        END,
        "updatedAt" = NOW()
    RETURNING "failureCount"::int, "cooldownUntil"
  `);

  if (!softRows || softRows.length === 0) {
    throw new Error("[lrl] recordLearnerPinFailure: soft upsert returned no rows");
  }
  const newSoftCount = Number(softRows[0]!.failureCount);
  const newCooldownSeconds = softCooldownSecondsForCount(newSoftCount);
  const lockoutThresholdReached = newSoftCount === 10;

  // --- Hard counter (credential-scoped, IP-independent) ---
  // Atomic upsert: increment and idempotently set hardLockedAt at threshold.
  // Once hardLockedAt is non-null, the CASE preserves it (idempotent lock).
  const hardScopeKey = `hard:${credKey}`;

  type HardRow = { failureCount: number | bigint; hardLockedAt: Date | null };
  const hardRows = await db.$queryRaw<HardRow[]>(Prisma.sql`
    INSERT INTO "LearnerLoginThrottle"
      ("id", "scopeKey", "kind", "failureCount", "hardLockedAt", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      ${hardScopeKey},
      'hard',
      1,
      CASE WHEN 1 >= ${HARD_LOCK_THRESHOLD} THEN NOW() ELSE NULL END,
      NOW(), NOW()
    )
    ON CONFLICT ("scopeKey") DO UPDATE
      SET
        "failureCount" = "LearnerLoginThrottle"."failureCount" + 1,
        "hardLockedAt" = CASE
          WHEN "LearnerLoginThrottle"."hardLockedAt" IS NOT NULL
            THEN "LearnerLoginThrottle"."hardLockedAt"
          WHEN "LearnerLoginThrottle"."failureCount" + 1 >= ${HARD_LOCK_THRESHOLD}
            THEN NOW()
          ELSE NULL
        END,
        "updatedAt" = NOW()
    RETURNING "failureCount"::int, "hardLockedAt"
  `);

  if (!hardRows || hardRows.length === 0) {
    throw new Error("[lrl] recordLearnerPinFailure: hard upsert returned no rows");
  }
  // hardLockTriggered: true if the hard row is now locked (hardLockedAt set).
  // Covers both "just triggered" and "concurrent trigger" — either way the account is locked.
  const hardLockTriggered = hardRows[0]!.hardLockedAt != null;

  return {
    newCooldownSeconds,
    failureCount: newSoftCount,
    lockoutThresholdReached,
    hardLockTriggered,
  };
}

// ---------------------------------------------------------------------------
// Reset on successful login
// ---------------------------------------------------------------------------

/**
 * Reset failure counts on successful login. Call AFTER bcrypt succeeds.
 *
 * Clears soft counter (deletes the soft row).
 * Resets hard failure counter to 0 but does NOT clear hardLockedAt —
 * that requires explicit parent unlock via clearCredentialHardLock().
 *
 * (If the account were hard-locked, isCredentialHardLocked would have rejected
 *  the attempt before bcrypt; this path is only reachable for unlocked accounts.)
 */
export async function resetLearnerPinFailures(
  normalizedUsername: string,
  ip: string,
  credKey: string
): Promise<void> {
  // Delete soft row (clear cooldown + counter for this username+IP)
  await db.learnerLoginThrottle.deleteMany({
    where: { scopeKey: `soft:${normalizedUsername}:${ip}` },
  });

  // Reset hard counter but preserve hardLockedAt (defensive: hard-locked accounts
  // shouldn't reach this path, but if they do the lock must not be silently cleared)
  await db.learnerLoginThrottle.updateMany({
    where: { scopeKey: `hard:${credKey}` },
    data: { failureCount: 0 },
  });
}

// ---------------------------------------------------------------------------
// Testing helpers
// ---------------------------------------------------------------------------

/** Get current soft failure count for testing. */
export async function getLearnerPinFailureCount(
  normalizedUsername: string,
  ip: string
): Promise<number> {
  const row = await db.learnerLoginThrottle.findUnique({
    where: { scopeKey: `soft:${normalizedUsername}:${ip}` },
    select: { failureCount: true },
  });
  return row?.failureCount ?? 0;
}

/** Get current hard (credential-level) failure count for testing. */
export async function getCredentialFailureCount(credKey: string): Promise<number> {
  const row = await db.learnerLoginThrottle.findUnique({
    where: { scopeKey: `hard:${credKey}` },
    select: { failureCount: true },
  });
  return row?.failureCount ?? 0;
}

// ---------------------------------------------------------------------------
// Legacy compat shim (kept for import compatibility; now async)
// ---------------------------------------------------------------------------

export interface LearnerPinRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  failureCount: number;
  lockoutThresholdReached: boolean;
}

/**
 * @deprecated Use checkLearnerPinCooldown + recordLearnerPinFailure separately.
 * Kept for backward compatibility. credKey defaults to normalizedUsername.
 */
export async function checkLearnerPinRateLimit(
  normalizedUsername: string,
  ip: string,
  success = false
): Promise<LearnerPinRateLimitResult> {
  const credKey = normalizedUsername;
  if (success) {
    await resetLearnerPinFailures(normalizedUsername, ip, credKey);
    return { allowed: true, retryAfterSeconds: 0, failureCount: 0, lockoutThresholdReached: false };
  }

  const cooldown = await checkLearnerPinCooldown(normalizedUsername, ip);
  if (cooldown.inCooldown) {
    const count = await getLearnerPinFailureCount(normalizedUsername, ip);
    return { allowed: false, retryAfterSeconds: cooldown.retryAfterSeconds, failureCount: count, lockoutThresholdReached: false };
  }

  const recorded = await recordLearnerPinFailure(normalizedUsername, ip, credKey);
  const allowed = recorded.newCooldownSeconds === 0 && !recorded.hardLockTriggered;
  return {
    allowed,
    retryAfterSeconds: recorded.newCooldownSeconds,
    failureCount: recorded.failureCount,
    lockoutThresholdReached: recorded.lockoutThresholdReached,
  };
}
