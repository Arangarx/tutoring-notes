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

/** Read soft-cooldown state via raw DB query (independent of rate-limit module). */
async function querySoftRowDirect(username: string, ip: string): Promise<{
  exists: boolean;
  failureCount: number;
  cooldownUntil: Date | null;
}> {
  const row = await db.learnerLoginThrottle.findUnique({
    where: { scopeKey: `soft:${username}:${ip}` },
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
    const { username, ip, credKey } = makeKeys("dur1");

    // Record 13 failures via the rate-limit module
    for (let i = 0; i < 13; i++) {
      await recordLearnerPinFailure(username, ip, credKey);
    }

    // --- COLD-START SIMULATION ---
    // Read the hard-lock state via an independent DB query that bypasses the
    // rate-limit module entirely (no module-level Map/Set involved).
    // This proves the lock is in the DB, not just in process memory.
    const direct = await queryHardLockDirect(credKey);

    expect(direct.exists).toBe(true);
    expect(direct.hardLockedAt).not.toBeNull();
    expect(direct.failureCount).toBe(13);

    // Also verify via the module itself (belt-and-suspenders)
    expect(await isCredentialHardLocked(credKey)).toBe(true);

    // Cleanup
    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-DUR-2: 12 failures → NOT hard-locked (boundary check)
// ---------------------------------------------------------------------------

describe("LRL-DUR-2: 12 failures → NOT hard-locked (one below threshold)", () => {
  it("12 failures → hardLockedAt is null", async () => {
    const { username, ip, credKey } = makeKeys("dur2");

    for (let i = 0; i < 12; i++) {
      await recordLearnerPinFailure(username, ip, credKey);
    }

    const direct = await queryHardLockDirect(credKey);
    expect(direct.failureCount).toBe(12);
    expect(direct.hardLockedAt).toBeNull();

    expect(await isCredentialHardLocked(credKey)).toBe(false);

    // Cleanup
    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-DUR-3: soft tiers visible in DB
// ---------------------------------------------------------------------------

describe("LRL-DUR-3: soft cooldown tiers durable in DB", () => {
  it("4 failures → soft row has cooldownUntil ≈ +30s", async () => {
    const { username, ip, credKey } = makeKeys("dur3a");
    const before = new Date();

    for (let i = 0; i < 4; i++) {
      await recordLearnerPinFailure(username, ip, credKey);
    }

    const soft = await querySoftRowDirect(username, ip);
    expect(soft.exists).toBe(true);
    expect(soft.failureCount).toBe(4);
    expect(soft.cooldownUntil).not.toBeNull();
    // cooldownUntil should be ~30s in the future (allow ±5s for test execution time)
    const diffMs = soft.cooldownUntil!.getTime() - before.getTime();
    expect(diffMs).toBeGreaterThan(25_000);
    expect(diffMs).toBeLessThan(35_000);

    await clearCredentialHardLock(credKey);
  });

  it("7 failures → soft row has cooldownUntil ≈ +5min", async () => {
    const { username, ip, credKey } = makeKeys("dur3b");
    const before = new Date();

    for (let i = 0; i < 7; i++) {
      await recordLearnerPinFailure(username, ip, credKey);
    }

    const soft = await querySoftRowDirect(username, ip);
    expect(soft.failureCount).toBe(7);
    expect(soft.cooldownUntil).not.toBeNull();
    const diffMs = soft.cooldownUntil!.getTime() - before.getTime();
    expect(diffMs).toBeGreaterThan(290_000); // 5 min − 10s tolerance
    expect(diffMs).toBeLessThan(310_000);

    await clearCredentialHardLock(credKey);
  });

  it("10 failures → soft row has cooldownUntil ≈ +15min", async () => {
    const { username, ip, credKey } = makeKeys("dur3c");
    const before = new Date();

    for (let i = 0; i < 10; i++) {
      await recordLearnerPinFailure(username, ip, credKey);
    }

    const soft = await querySoftRowDirect(username, ip);
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
    const { username, ip, credKey } = makeKeys("dur4");

    for (let i = 0; i < 15; i++) {
      await recordLearnerPinFailure(username, ip, credKey);
    }

    // Verify lock is set before reset
    const beforeReset = await queryHardLockDirect(credKey);
    expect(beforeReset.hardLockedAt).not.toBeNull();

    // Simulate successful login (reset)
    await resetLearnerPinFailures(username, ip, credKey);

    // Soft row should be gone
    const softAfter = await querySoftRowDirect(username, ip);
    expect(softAfter.exists).toBe(false);

    // Hard row: counter reset to 0 but lock PRESERVED
    const hardAfter = await queryHardLockDirect(credKey);
    expect(hardAfter.failureCount).toBe(0);
    expect(hardAfter.hardLockedAt).not.toBeNull(); // lock still set!

    // isCredentialHardLocked must still return true
    expect(await isCredentialHardLocked(credKey)).toBe(true);

    // Cleanup
    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// LRL-DUR-5: parent unlock — clearCredentialHardLock removes hard row entirely
// ---------------------------------------------------------------------------

describe("LRL-DUR-5: parent unlock removes hard row", () => {
  it("clearCredentialHardLock → hard row gone, isCredentialHardLocked returns false", async () => {
    const { username, ip, credKey } = makeKeys("dur5");

    for (let i = 0; i < 13; i++) {
      await recordLearnerPinFailure(username, ip, credKey);
    }

    expect(await isCredentialHardLocked(credKey)).toBe(true);

    await clearCredentialHardLock(credKey);

    // Independent DB query: row should be gone
    const directAfterUnlock = await queryHardLockDirect(credKey);
    expect(directAfterUnlock.exists).toBe(false);

    // Module-level check must also reflect the unlock
    expect(await isCredentialHardLocked(credKey)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LRL-DUR-6: hard lock is IP-independent
// ---------------------------------------------------------------------------

describe("LRL-DUR-6: hard lock is IP-independent (cross-IP accumulation)", () => {
  it("13 failures spread across 13 different IPs → single hard lock triggered", async () => {
    const { username, credKey } = makeKeys("dur6");

    // Each failure comes from a different IP — they all count toward the same hard key
    for (let i = 0; i < 13; i++) {
      await recordLearnerPinFailure(username, `10.200.${i}.1`, credKey);
    }

    // Hard lock must be set despite IP diversity
    const direct = await queryHardLockDirect(credKey);
    expect(direct.hardLockedAt).not.toBeNull();
    expect(direct.failureCount).toBe(13);

    expect(await isCredentialHardLocked(credKey)).toBe(true);

    // Cleanup
    await clearCredentialHardLock(credKey);
  });
});
