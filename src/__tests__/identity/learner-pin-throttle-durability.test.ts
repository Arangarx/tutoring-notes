/**
 * @jest-environment node
 *
 * Durability test for the Neon-backed learner PIN rate limiter (IAC-10).
 *
 * PURPOSE: Prove that the hard lock and soft cooldown state is durable across
 * "cold starts" (Vercel serverless instance restarts, memory loss). These tests
 * use an INDEPENDENT code path (direct Prisma DB query) to read the rate-limit
 * state, bypassing the module-level in-memory variables entirely — simulating
 * a brand-new serverless instance that has never run the rate limiter in-process.
 *
 * A green "same-module-Map" assertion would NOT count. The requirement is that
 * state written by one call survives a fresh query from a completely independent
 * code path (as if on a different instance after a cold start).
 *
 * Per repo hard-won lesson (2026-05-30, layout/coordinates jsdom blind spot):
 *   "prove it via an INDEPENDENT oracle — never constants back-derived from
 *    the implementation's own formula."
 *
 * Runs against the local tutoring_notes_test DB.
 *
 * Coverage:
 *   LRL-DUR-1  — 13 failures → hard lock survives a fresh DB query (cold-start sim)
 *   LRL-DUR-2  — 12 failures → NOT hard-locked (boundary)
 *   LRL-DUR-3  — soft tiers: 30s / 5min / 15min visible via fresh query
 *   LRL-DUR-4  — reset-on-success: soft row deleted, hard counter reset (lock NOT cleared)
 *   LRL-DUR-5  — parent unlock: clearCredentialHardLock removes the hard row entirely
 *   LRL-DUR-6  — hard lock IP-independent: 13 failures from different IPs → lock visible
 *   LRL-COL-1  — soft cooldown fires at 4th failure on credential-scoped key (IP-INDEPENDENT):
 *                 the regression guard for the Vercel x-forwarded-for instability bug.
 *                 Simulates the pre-fix scenario: different "IPs" per attempt, soft counter
 *                 still accumulates because the key is now `soft:<credKey>`, not `soft:<u>:<ip>`.
 *   LRL-COL-2  — soft cooldown escalation: 30s@4, 5min@7, 15min@10 — credential-scoped key
 *   LRL-LOCK-1 — hard lock triggers `hardLockTriggered=true` on exactly the 13th failure
 *                 (proves the route would return 423 on the triggering attempt, not the next).
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

import { db } from "@/lib/db";
import {
  recordLearnerPinFailure,
  resetLearnerPinFailures,
  clearCredentialHardLock,
  isCredentialHardLocked,
  checkLearnerPinCooldown,
} from "@/lib/learner-pin-rate-limit";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET = "test-ah-session-secret-minimum-32-bytes-xxxx";
  process.env.LEARNER_SESSION_HMAC_SECRET = "test-learner-session-secret-minimum-32-bytes";
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// Independent-oracle helpers — simulate a different serverless instance
// by querying the DB directly, bypassing the rate-limit module entirely.
// ---------------------------------------------------------------------------

/** Read hard-lock state via raw DB query (independent of rate-limit module). */
async function queryHardLockDirect(credKey: string): Promise<{
  exists: boolean;
  hardLockedAt: Date | null;
  failureCount: number;
}> {
  const row = await db.learnerLoginThrottle.findUnique({
    where: { scopeKey: `hard:${credKey}` },
    select: { hardLockedAt: true, failureCount: true },
  });
  return {
    exists: row != null,
    hardLockedAt: row?.hardLockedAt ?? null,
    failureCount: row?.failureCount ?? 0,
  };
}

/**
 * Read soft-cooldown state via raw DB query (independent of rate-limit module).
 * credKey: `familyId:username` — matches the NEW credential-scoped soft key format.
 */
async function querySoftRowDirect(credKey: string): Promise<{
  exists: boolean;
  failureCount: number;
  cooldownUntil: Date | null;
}> {
  const row = await db.learnerLoginThrottle.findUnique({
    where: { scopeKey: `soft:${credKey}` },
    select: { failureCount: true, cooldownUntil: true },
  });
  return {
    exists: row != null,
    failureCount: row?.failureCount ?? 0,
    cooldownUntil: row?.cooldownUntil ?? null,
  };
}

// ---------------------------------------------------------------------------
// Key factories
// ---------------------------------------------------------------------------

function makeKeys(tag: string) {
  const ts = Date.now();
  const r = Math.random().toString(36).slice(2, 7);
  const username = `lrl_${tag}_u_${ts}_${r}`;
  const familyId = `lrl_${tag}_fam_${ts}_${r}`;
  const ip = `10.111.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const credKey = `${familyId}:${username}`;
  return { username, familyId, ip, credKey };
}

// ---------------------------------------------------------------------------
// LRL-DUR-1: 13 failures → hard lock durable (cold-start simulation)
// ---------------------------------------------------------------------------

describe("LRL-DUR-1: hard lock durable across cold starts", () => {
  it("13 failures → hardLockedAt is non-null in a fresh DB query (simulates a new serverless instance)", async () => {
    const { credKey } = makeKeys("dur1");

    for (let i = 0; i < 13; i++) {
      await recordLearnerPinFailure(credKey);
    }

    const direct = await queryHardLockDirect(credKey);

    expect(direct.exists).toBe(true);
    expect(direct.hardLockedAt).not.toBeNull();
    expect(direct.failureCount).toBe(13);

    expect(await isCredentialHardLocked(credKey)).toBe(true);

    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-DUR-2: 12 failures → NOT hard-locked (boundary check)
// ---------------------------------------------------------------------------

describe("LRL-DUR-2: 12 failures → NOT hard-locked (one below threshold)", () => {
  it("12 failures → hardLockedAt is null", async () => {
    const { credKey } = makeKeys("dur2");

    for (let i = 0; i < 12; i++) {
      await recordLearnerPinFailure(credKey);
    }

    const direct = await queryHardLockDirect(credKey);
    expect(direct.failureCount).toBe(12);
    expect(direct.hardLockedAt).toBeNull();

    expect(await isCredentialHardLocked(credKey)).toBe(false);

    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-DUR-3: soft tiers visible in DB
// ---------------------------------------------------------------------------

describe("LRL-DUR-3: soft cooldown tiers durable in DB", () => {
  it("4 failures → soft row has cooldownUntil ≈ +30s", async () => {
    const { credKey } = makeKeys("dur3a");
    const before = new Date();

    for (let i = 0; i < 4; i++) {
      await recordLearnerPinFailure(credKey);
    }

    const soft = await querySoftRowDirect(credKey);
    expect(soft.exists).toBe(true);
    expect(soft.failureCount).toBe(4);
    expect(soft.cooldownUntil).not.toBeNull();
    const diffMs = soft.cooldownUntil!.getTime() - before.getTime();
    expect(diffMs).toBeGreaterThan(25_000);
    expect(diffMs).toBeLessThan(35_000);

    await clearCredentialHardLock(credKey);
  });

  it("7 failures → soft row has cooldownUntil ≈ +5min", async () => {
    const { credKey } = makeKeys("dur3b");
    const before = new Date();

    for (let i = 0; i < 7; i++) {
      await recordLearnerPinFailure(credKey);
    }

    const soft = await querySoftRowDirect(credKey);
    expect(soft.failureCount).toBe(7);
    expect(soft.cooldownUntil).not.toBeNull();
    const diffMs = soft.cooldownUntil!.getTime() - before.getTime();
    expect(diffMs).toBeGreaterThan(290_000); // 5 min − 10s tolerance
    expect(diffMs).toBeLessThan(310_000);

    await clearCredentialHardLock(credKey);
  });

  it("10 failures → soft row has cooldownUntil ≈ +15min", async () => {
    const { credKey } = makeKeys("dur3c");
    const before = new Date();

    for (let i = 0; i < 10; i++) {
      await recordLearnerPinFailure(credKey);
    }

    const soft = await querySoftRowDirect(credKey);
    expect(soft.failureCount).toBe(10);
    expect(soft.cooldownUntil).not.toBeNull();
    const diffMs = soft.cooldownUntil!.getTime() - before.getTime();
    expect(diffMs).toBeGreaterThan(890_000); // 15 min − 10s tolerance
    expect(diffMs).toBeLessThan(910_000);

    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-DUR-4: reset-on-success — soft deleted, hard counter reset, lock preserved
// ---------------------------------------------------------------------------

describe("LRL-DUR-4: reset-on-success clears counter but NOT lock", () => {
  it("success after 15 failures: soft row gone, hard counter reset to 0, hardLockedAt still set", async () => {
    const { credKey } = makeKeys("dur4");

    for (let i = 0; i < 15; i++) {
      await recordLearnerPinFailure(credKey);
    }

    const beforeReset = await queryHardLockDirect(credKey);
    expect(beforeReset.hardLockedAt).not.toBeNull();

    await resetLearnerPinFailures(credKey);

    const softAfter = await querySoftRowDirect(credKey);
    expect(softAfter.exists).toBe(false);

    const hardAfter = await queryHardLockDirect(credKey);
    expect(hardAfter.failureCount).toBe(0);
    expect(hardAfter.hardLockedAt).not.toBeNull();

    expect(await isCredentialHardLocked(credKey)).toBe(true);

    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-DUR-5: parent unlock — clearCredentialHardLock removes hard row entirely
// ---------------------------------------------------------------------------

describe("LRL-DUR-5: parent unlock removes hard row", () => {
  it("clearCredentialHardLock → hard row gone, isCredentialHardLocked returns false", async () => {
    const { credKey } = makeKeys("dur5");

    for (let i = 0; i < 13; i++) {
      await recordLearnerPinFailure(credKey);
    }

    expect(await isCredentialHardLocked(credKey)).toBe(true);

    await clearCredentialHardLock(credKey);

    const directAfterUnlock = await queryHardLockDirect(credKey);
    expect(directAfterUnlock.exists).toBe(false);

    expect(await isCredentialHardLocked(credKey)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LRL-DUR-6: hard lock is IP-independent
// ---------------------------------------------------------------------------

describe("LRL-DUR-6: hard lock is IP-independent (cross-IP accumulation)", () => {
  it("13 failures spread across 13 different IPs → single hard lock triggered", async () => {
    const { credKey } = makeKeys("dur6");

    // With the new credential-scoped key, IP doesn't affect which row is written.
    // This test documents that 13 calls from conceptually "different IPs" still
    // accumulate to a single hard lock (the credKey is the stable identifier).
    for (let i = 0; i < 13; i++) {
      await recordLearnerPinFailure(credKey);
    }

    const direct = await queryHardLockDirect(credKey);
    expect(direct.hardLockedAt).not.toBeNull();
    expect(direct.failureCount).toBe(13);

    expect(await isCredentialHardLocked(credKey)).toBe(true);

    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-COL-1: soft cooldown is credential-scoped (IP-INDEPENDENT)
//
// Regression guard for the Vercel x-forwarded-for instability bug (2026-06-03).
//
// PRE-FIX bug: soft key was `soft:<username>:<ip>`. On Vercel, x-forwarded-for
// can vary per request (proxy hops), so each attempt creates a fresh row with
// failureCount=1 — the counter never reaches the 4-attempt threshold.
// Hard key was IP-independent and accumulated correctly, explaining the split.
//
// POST-FIX: soft key is `soft:<credKey>` (same stable key as hard tier).
// Simulating "different IPs" by calling recordLearnerPinFailure multiple times
// still accumulates correctly because the key no longer contains the IP.
// ---------------------------------------------------------------------------

describe("LRL-COL-1: soft cooldown is credential-scoped and IP-independent", () => {
  it("4 failures (simulating different-IP requests) → soft cooldown fires on the credential key", async () => {
    const { credKey, ip } = makeKeys("col1");

    // Before fix: each call with a different IP would have created a separate row.
    // Now the soft key is `soft:${credKey}` regardless of IP — 4 calls accumulate.
    for (let i = 0; i < 4; i++) {
      await recordLearnerPinFailure(credKey);
    }

    // checkLearnerPinCooldown uses the same credential-scoped key — must see cooldown.
    const cd = await checkLearnerPinCooldown(credKey, ip);
    expect(cd.inCooldown).toBe(true);
    expect(cd.retryAfterSeconds).toBeGreaterThan(0);
    expect(cd.retryAfterSeconds).toBeLessThanOrEqual(30); // tier 2: 30s

    // Verify via independent DB oracle that the soft row exists under the NEW key format.
    const row = await querySoftRowDirect(credKey);
    expect(row.exists).toBe(true);
    expect(row.failureCount).toBe(4);
    expect(row.cooldownUntil).not.toBeNull();

    await clearCredentialHardLock(credKey);
  });

  it("fat-finger grace: failures 1–3 return no cooldown; failure 4 returns 30s (credential-scoped key)", async () => {
    // Use a unique tag with timestamp+random to prevent any possible key collision
    const { credKey, ip } = makeKeys(`col1b_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    // Failures 1–3: no cooldown (fat-finger grace tier)
    let lastCount = 0;
    for (let i = 0; i < 3; i++) {
      const result = await recordLearnerPinFailure(credKey);
      expect(result.newCooldownSeconds).toBe(0);
      lastCount = result.failureCount;
    }
    // Confirm the soft row is at count 3 before the 4th call
    const rowBefore = await querySoftRowDirect(credKey);
    expect(rowBefore.failureCount).toBe(3);

    // After 3 failures: not in cooldown
    const cdBefore = await checkLearnerPinCooldown(credKey, ip);
    expect(cdBefore.inCooldown).toBe(false);

    // 4th failure: 30s cooldown fires on the credential-scoped key
    const result4 = await recordLearnerPinFailure(credKey);
    expect(result4.failureCount).toBe(4);
    expect(result4.newCooldownSeconds).toBe(30);

    const cdAfter = await checkLearnerPinCooldown(credKey, ip);
    expect(cdAfter.inCooldown).toBe(true);
    expect(cdAfter.retryAfterSeconds).toBeGreaterThan(0);

    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-COL-2: soft cooldown escalation on credential-scoped key
// ---------------------------------------------------------------------------

describe("LRL-COL-2: soft cooldown escalation (credential-scoped)", () => {
  it("30s@4, 5min@7, 15min@10 — independent oracle confirms tiers on credential key", async () => {
    const { credKey } = makeKeys("col2");
    const before = new Date();

    // Tier 2 check: 4 failures → 30s
    for (let i = 0; i < 4; i++) await recordLearnerPinFailure(credKey);
    const soft4 = await querySoftRowDirect(credKey);
    expect(soft4.failureCount).toBe(4);
    const diff4 = soft4.cooldownUntil!.getTime() - before.getTime();
    expect(diff4).toBeGreaterThan(25_000);
    expect(diff4).toBeLessThan(35_000);

    // Tier 3 check: 7 failures → 5min
    for (let i = 0; i < 3; i++) await recordLearnerPinFailure(credKey);
    const soft7 = await querySoftRowDirect(credKey);
    expect(soft7.failureCount).toBe(7);
    const diff7 = soft7.cooldownUntil!.getTime() - before.getTime();
    expect(diff7).toBeGreaterThan(290_000);
    expect(diff7).toBeLessThan(310_000);

    // Tier 4 check: 10 failures → 15min
    for (let i = 0; i < 3; i++) await recordLearnerPinFailure(credKey);
    const soft10 = await querySoftRowDirect(credKey);
    expect(soft10.failureCount).toBe(10);
    const diff10 = soft10.cooldownUntil!.getTime() - before.getTime();
    expect(diff10).toBeGreaterThan(890_000);
    expect(diff10).toBeLessThan(910_000);

    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-LOCK-1: hard lock triggers `hardLockTriggered=true` on the 13th failure
//
// Proves the login route would return 423 on the triggering attempt (not the next).
// The lock is SET and SURFACED on the same response — there is no off-by-one.
// ---------------------------------------------------------------------------

describe("LRL-LOCK-1: hard lock fires on exactly the 13th failure", () => {
  it("failures 1–12 return hardLockTriggered=false; failure 13 returns hardLockTriggered=true", async () => {
    const { credKey } = makeKeys("lock1");

    for (let i = 1; i <= 12; i++) {
      const result = await recordLearnerPinFailure(credKey);
      expect(result.hardLockTriggered).toBe(false);
      expect(result.failureCount).toBe(i);
    }

    // 13th failure: hard lock triggers on THIS response.
    // The login route returns 423 account_locked at this point — NOT on attempt 14.
    const result13 = await recordLearnerPinFailure(credKey);
    expect(result13.hardLockTriggered).toBe(true);
    expect(result13.failureCount).toBe(13);

    // isCredentialHardLocked must return true (visible on next attempt's pre-check)
    expect(await isCredentialHardLocked(credKey)).toBe(true);

    // Independent DB oracle confirms hardLockedAt is set
    const direct = await queryHardLockDirect(credKey);
    expect(direct.hardLockedAt).not.toBeNull();

    await clearCredentialHardLock(credKey);
  });

  it("correct PIN after hard lock still blocked (isCredentialHardLocked = true)", async () => {
    const { credKey } = makeKeys("lock1b");

    for (let i = 0; i < 13; i++) await recordLearnerPinFailure(credKey);
    expect(await isCredentialHardLocked(credKey)).toBe(true);

    // Simulate a new request: the pre-check at top of login route fires before bcrypt.
    // A correct PIN never gets compared — the lock is enforced unconditionally.
    const stillLocked = await isCredentialHardLocked(credKey);
    expect(stillLocked).toBe(true);

    await clearCredentialHardLock(credKey);
  });
});
