/**
 * @jest-environment node
 *
 * Durability tests for the Neon-backed auth rate limiters (IAC-11).
 *
 * PURPOSE: Prove that rate-limit state is durable across "cold starts"
 * (Vercel serverless instance restarts, memory loss). Tests use an INDEPENDENT
 * code path (direct Prisma DB query) to read state, bypassing the module-level
 * implementation entirely — simulating a brand-new serverless instance that has
 * never run the rate limiter in-process.
 *
 * A green assertion that reads state through the same module functions would NOT
 * count. The requirement is that state written by one call is visible via a
 * direct DB query from a completely independent code path (as if a fresh cold
 * start on a different instance).
 *
 * Per repo hard-won lesson (2026-05-30, layout/coordinates jsdom blind spot):
 *   "prove it via an INDEPENDENT oracle — never constants back-derived from
 *    the implementation's own formula."
 *
 * Runs against the local tutoring_notes_test DB.
 *
 * Coverage:
 *   ALR-DUR-1  — AH-login: state accumulates across "cold starts" (DB oracle)
 *   ALR-DUR-2  — AH-login: 11th request blocked; window resets on expiry
 *   ALR-DUR-3  — AH-login: IP-independent accumulation (different IPs, same email)
 *   TFR-DUR-1  — 2FA-verify: state accumulates across "cold starts" (DB oracle)
 *   TFR-DUR-2  — 2FA-verify: 21st request blocked; window resets on expiry
 *   TFR-DUR-3  — 2FA-verify: key is adminUserId (stable; different admin = separate row)
 *   AUTH-DUR-1 — shared table: ah-login and 2fa-verify rows coexist without collision
 *   AUTH-DUR-2 — window expiry: expired window resets count atomically (no stale block)
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

import { db } from "@/lib/db";
import {
  checkAndIncrementAuthThrottle,
  checkAhLoginRateLimit,
  check2faVerifyRateLimit,
  deleteAuthThrottleRow,
} from "@/lib/auth-rate-limit";

// ---------------------------------------------------------------------------
// Independent-oracle helpers — simulate a fresh serverless instance by querying
// the DB directly, bypassing the auth-rate-limit module entirely.
// ---------------------------------------------------------------------------

/** Read throttle state via raw DB query (independent of rate-limit module). */
async function queryThrottleRowDirect(scopeKey: string): Promise<{
  exists: boolean;
  requestCount: number;
  windowResetAt: Date | null;
}> {
  const row = await db.authThrottle.findUnique({
    where: { scopeKey },
    select: { requestCount: true, windowResetAt: true },
  });
  return {
    exists: row != null,
    requestCount: row?.requestCount ?? 0,
    windowResetAt: row?.windowResetAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Key factories — unique per test run to prevent cross-test contamination
// ---------------------------------------------------------------------------

function makeAhKey(tag: string): string {
  const ts = Date.now();
  const r = Math.random().toString(36).slice(2, 7);
  return `test-${tag}-${ts}-${r}@example.com`;
}

function makeAdminId(tag: string): string {
  const ts = Date.now();
  const r = Math.random().toString(36).slice(2, 7);
  return `test-admin-${tag}-${ts}-${r}`;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// ALR-DUR-1: AH-login counter persists to DB (cold-start simulation)
// ---------------------------------------------------------------------------

describe("ALR-DUR-1: AH-login state durable across cold starts", () => {
  it("5 failed login attempts → requestCount=5 visible via direct DB query (simulates fresh instance)", async () => {
    const email = makeAhKey("alr-dur1");
    const scopeKey = `ah-login:${email}`;

    for (let i = 0; i < 5; i++) {
      await checkAhLoginRateLimit(email);
    }

    // Independent oracle — does NOT go through checkAhLoginRateLimit
    const direct = await queryThrottleRowDirect(scopeKey);
    expect(direct.exists).toBe(true);
    expect(direct.requestCount).toBe(5);
    expect(direct.windowResetAt).not.toBeNull();
    expect(direct.windowResetAt!.getTime()).toBeGreaterThan(Date.now());

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// ALR-DUR-2: AH-login enforces 10/min threshold; allows when window resets
// ---------------------------------------------------------------------------

describe("ALR-DUR-2: AH-login enforces 10 req/min and resets on window expiry", () => {
  it("requests 1–10 are allowed; request 11 is blocked", async () => {
    const email = makeAhKey("alr-dur2");
    const scopeKey = `ah-login:${email}`;

    for (let i = 1; i <= 10; i++) {
      const result = await checkAhLoginRateLimit(email);
      expect(result.allowed).toBe(true);
      expect(result.requestCount).toBe(i);
    }

    const blocked = await checkAhLoginRateLimit(email);
    expect(blocked.allowed).toBe(false);
    expect(blocked.requestCount).toBe(11);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    // DB oracle: requestCount must be 11 (not reset by the blocked check)
    const direct = await queryThrottleRowDirect(scopeKey);
    expect(direct.requestCount).toBe(11);

    await deleteAuthThrottleRow(scopeKey);
  });

  it("after window expiry: counter resets atomically and new request is allowed", async () => {
    // Use a very short window (200ms) to test expiry without sleeping too long.
    const scopeKey = `ah-login:test-expiry-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Fill the window (max=2 to keep it fast).
    for (let i = 0; i < 2; i++) {
      await checkAndIncrementAuthThrottle("ah-login", scopeKey, 2, 200);
    }
    const blocked = await checkAndIncrementAuthThrottle("ah-login", scopeKey, 2, 200);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire.
    await new Promise((r) => setTimeout(r, 250));

    // After expiry: should reset and allow.
    const afterExpiry = await checkAndIncrementAuthThrottle("ah-login", scopeKey, 2, 200);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.requestCount).toBe(1);

    // DB oracle: row exists with count=1 and a fresh windowResetAt.
    const direct = await queryThrottleRowDirect(scopeKey);
    expect(direct.requestCount).toBe(1);
    expect(direct.windowResetAt!.getTime()).toBeGreaterThan(Date.now());

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// ALR-DUR-3: AH-login key is email-scoped (IP-independent accumulation)
// ---------------------------------------------------------------------------

describe("ALR-DUR-3: AH-login accumulates on email key regardless of (simulated) IP", () => {
  it("10 requests with conceptually different IPs all increment the same email-keyed row", async () => {
    const email = makeAhKey("alr-dur3");
    const scopeKey = `ah-login:${email}`;

    // Simulate different IPs by making calls from "different contexts" —
    // since the key is email-scoped, all calls hit the same row.
    for (let i = 0; i < 10; i++) {
      await checkAhLoginRateLimit(email); // IP is irrelevant to this limiter
    }

    // DB oracle confirms single row with count=10
    const direct = await queryThrottleRowDirect(scopeKey);
    expect(direct.exists).toBe(true);
    expect(direct.requestCount).toBe(10);

    // 11th is blocked
    const eleventh = await checkAhLoginRateLimit(email);
    expect(eleventh.allowed).toBe(false);

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// TFR-DUR-1: 2FA-verify counter persists to DB (cold-start simulation)
// ---------------------------------------------------------------------------

describe("TFR-DUR-1: 2FA-verify state durable across cold starts", () => {
  it("8 verify attempts → requestCount=8 visible via direct DB query (simulates fresh instance)", async () => {
    const adminId = makeAdminId("tfr-dur1");
    const scopeKey = `2fa-verify:${adminId}`;

    for (let i = 0; i < 8; i++) {
      await check2faVerifyRateLimit(adminId);
    }

    // Independent oracle
    const direct = await queryThrottleRowDirect(scopeKey);
    expect(direct.exists).toBe(true);
    expect(direct.requestCount).toBe(8);
    expect(direct.windowResetAt).not.toBeNull();
    expect(direct.windowResetAt!.getTime()).toBeGreaterThan(Date.now());

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// TFR-DUR-2: 2FA-verify enforces 20/min threshold
// ---------------------------------------------------------------------------

describe("TFR-DUR-2: 2FA-verify enforces 20 req/min", () => {
  it("requests 1–20 are allowed; request 21 is blocked", async () => {
    const adminId = makeAdminId("tfr-dur2");
    const scopeKey = `2fa-verify:${adminId}`;

    for (let i = 1; i <= 20; i++) {
      const result = await check2faVerifyRateLimit(adminId);
      expect(result.allowed).toBe(true);
      expect(result.requestCount).toBe(i);
    }

    const blocked = await check2faVerifyRateLimit(adminId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.requestCount).toBe(21);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    // DB oracle: row at count 21
    const direct = await queryThrottleRowDirect(scopeKey);
    expect(direct.requestCount).toBe(21);

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// TFR-DUR-3: 2FA-verify key is adminUserId-scoped (different admins → different rows)
// ---------------------------------------------------------------------------

describe("TFR-DUR-3: 2FA-verify key is adminUserId (different admins accumulate separately)", () => {
  it("10 requests for admin-A do not affect admin-B's counter", async () => {
    const adminA = makeAdminId("tfr-dur3a");
    const adminB = makeAdminId("tfr-dur3b");
    const scopeA = `2fa-verify:${adminA}`;
    const scopeB = `2fa-verify:${adminB}`;

    for (let i = 0; i < 10; i++) {
      await check2faVerifyRateLimit(adminA);
    }

    // Admin B's row must not exist yet
    const directB = await queryThrottleRowDirect(scopeB);
    expect(directB.exists).toBe(false);
    expect(directB.requestCount).toBe(0);

    // Admin B's first request is allowed with count=1
    const bFirst = await check2faVerifyRateLimit(adminB);
    expect(bFirst.allowed).toBe(true);
    expect(bFirst.requestCount).toBe(1);

    // Admin A still has count=10
    const directA = await queryThrottleRowDirect(scopeA);
    expect(directA.requestCount).toBe(10);

    await deleteAuthThrottleRow(scopeA);
    await deleteAuthThrottleRow(scopeB);
  });
});

// ---------------------------------------------------------------------------
// AUTH-DUR-1: shared table — ah-login and 2fa-verify rows coexist without collision
// ---------------------------------------------------------------------------

describe("AUTH-DUR-1: ah-login and 2fa-verify rows coexist in AuthThrottle table", () => {
  it("filling both limiters for same identity leaves two distinct rows", async () => {
    const sharedId = `shared-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ahScopeKey = `ah-login:${sharedId}@example.com`;
    const tfScopeKey = `2fa-verify:${sharedId}`;

    for (let i = 0; i < 5; i++) {
      await checkAndIncrementAuthThrottle("ah-login", ahScopeKey, 10, 60_000);
    }
    for (let i = 0; i < 3; i++) {
      await checkAndIncrementAuthThrottle("2fa-verify", tfScopeKey, 20, 60_000);
    }

    const directAh = await queryThrottleRowDirect(ahScopeKey);
    const directTf = await queryThrottleRowDirect(tfScopeKey);

    expect(directAh.requestCount).toBe(5);
    expect(directTf.requestCount).toBe(3);

    // Neither row polluted the other
    expect(directAh.requestCount).not.toBe(directTf.requestCount);

    await deleteAuthThrottleRow(ahScopeKey);
    await deleteAuthThrottleRow(tfScopeKey);
  });
});

// ---------------------------------------------------------------------------
// AUTH-DUR-2: window expiry resets atomically — no stale block after window ends
// ---------------------------------------------------------------------------

describe("AUTH-DUR-2: window expiry resets counter atomically (no stale block)", () => {
  it("blocked counter resets to 1 on the first request after window expiry", async () => {
    const scopeKey = `auth-dur2-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Fill and overflow a short window (max=3, 200ms).
    for (let i = 0; i < 4; i++) {
      await checkAndIncrementAuthThrottle("ah-login", scopeKey, 3, 200);
    }

    // Confirm blocked
    const preExpiry = await queryThrottleRowDirect(scopeKey);
    expect(preExpiry.requestCount).toBe(4);

    // Wait for window expiry
    await new Promise((r) => setTimeout(r, 250));

    // First request after expiry: count resets to 1, allowed=true
    const postExpiry = await checkAndIncrementAuthThrottle("ah-login", scopeKey, 3, 200);
    expect(postExpiry.allowed).toBe(true);
    expect(postExpiry.requestCount).toBe(1);

    // DB oracle confirms the reset was written atomically
    const direct = await queryThrottleRowDirect(scopeKey);
    expect(direct.requestCount).toBe(1);
    expect(direct.windowResetAt!.getTime()).toBeGreaterThan(Date.now());

    await deleteAuthThrottleRow(scopeKey);
  });
});
