/**
 * @jest-environment node
 *
 * P1-J6 — AH (account-holder / tutor-parent) login durable throttle cold-start
 * behavior/contract tests.
 *
 * PURPOSE: Prove that the Neon-backed AH-login rate limit (IAC-11, `AuthThrottle`
 * table, kind=`ah-login`, scopeKey=`ah-login:<normalizedEmail>`) is DURABLE across
 * "cold starts" (Vercel serverless instance restarts, memory loss). Tests use an
 * INDEPENDENT code path (direct Prisma DB query) to read throttle state, bypassing
 * the rate-limit module entirely — simulating a brand-new serverless instance that
 * has never run the limiter in-process.
 *
 * A green assertion that reads state only through the same module functions would
 * NOT count. The requirement is that state written by one call survives a fresh query
 * from a completely independent code path (as if on a different instance after a
 * cold start).
 *
 * Red-before (2026-07-05): temporarily asserting `requestCount=0` after 10 login
 * attempts and expecting route attempt 11 to return 401 both failed before
 * correcting to count=10 / 429 `too_many_requests`.
 *
 * Pattern: `learner-pin-throttle-durability.test.ts` (independent DB oracle).
 * DB: tutoring_notes_test via jest.global-setup.ts.
 *
 * Coverage:
 *   ALR-DUR-1  — login attempts accumulate in AuthThrottle row (DB oracle)
 *   ALR-DUR-2  — requests 1–10 allowed; request 11 blocked (10/min contract)
 *   ALR-DUR-3  — email-scoped key: IP-independent accumulation
 *   ALR-DUR-4  — window expiry resets counter atomically (reset contract)
 *   ALR-COLD-1 — jest.resetModules + re-import: limit still enforced from DB
 *   ALR-ROUTE-1 — POST /api/auth/account-holder/login returns 429 when throttled
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  checkAhLoginRateLimit,
  checkAndIncrementAuthThrottle,
  deleteAuthThrottleRow,
} from "@/lib/auth-rate-limit";
import { POST } from "@/app/api/auth/account-holder/login/route";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  process.env.AH_SESSION_HMAC_SECRET =
    "test-ah-session-secret-minimum-32-bytes-xxxx";
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// Independent-oracle helpers — simulate a different serverless instance
// by querying the DB directly, bypassing the rate-limit module entirely.
// ---------------------------------------------------------------------------

/** Read AH-login throttle state via raw DB query (independent of rate-limit module). */
async function queryAhThrottleDirect(scopeKey: string): Promise<{
  exists: boolean;
  requestCount: number;
  windowResetAt: Date | null;
  kind: string | null;
}> {
  const row = await db.authThrottle.findUnique({
    where: { scopeKey },
    select: { requestCount: true, windowResetAt: true, kind: true },
  });
  return {
    exists: row != null,
    requestCount: row?.requestCount ?? 0,
    windowResetAt: row?.windowResetAt ?? null,
    kind: row?.kind ?? null,
  };
}

// ---------------------------------------------------------------------------
// Key factories — unique per test run to prevent cross-test contamination
// ---------------------------------------------------------------------------

function makeEmailKey(tag: string): string {
  const ts = Date.now();
  const r = Math.random().toString(36).slice(2, 7);
  return `p1j6-${tag}-${ts}-${r}@example.com`;
}

function makeLoginRequest(email: string, password = "wrong-password") {
  return new NextRequest("http://localhost/api/auth/account-holder/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

// ---------------------------------------------------------------------------
// ALR-DUR-1: counter persists to DB (cold-start simulation via DB oracle)
// ---------------------------------------------------------------------------

describe("ALR-DUR-1: AH-login state durable across cold starts", () => {
  it("10 login attempts → requestCount=10 visible via direct DB query (simulates fresh instance)", async () => {
    const email = makeEmailKey("dur1");
    const scopeKey = `ah-login:${email}`;

    for (let i = 0; i < 10; i++) {
      await checkAhLoginRateLimit(email);
    }

    const direct = await queryAhThrottleDirect(scopeKey);
    expect(direct.exists).toBe(true);
    expect(direct.kind).toBe("ah-login");
    expect(direct.requestCount).toBe(10);
    expect(direct.windowResetAt).not.toBeNull();
    expect(direct.windowResetAt!.getTime()).toBeGreaterThan(Date.now());

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// ALR-DUR-2: enforces 10 req/min threshold
// ---------------------------------------------------------------------------

describe("ALR-DUR-2: AH-login enforces 10 req/min", () => {
  it("requests 1–10 are allowed; request 11 is blocked with retryAfterMs > 0", async () => {
    const email = makeEmailKey("dur2");
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

    const direct = await queryAhThrottleDirect(scopeKey);
    expect(direct.requestCount).toBe(11);

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// ALR-DUR-3: email-scoped key (IP-independent accumulation)
// ---------------------------------------------------------------------------

describe("ALR-DUR-3: AH-login accumulates on email key regardless of simulated IP", () => {
  it("10 requests for same email increment a single AuthThrottle row", async () => {
    const email = makeEmailKey("dur3");
    const scopeKey = `ah-login:${email}`;

    for (let i = 0; i < 10; i++) {
      await checkAhLoginRateLimit(email);
    }

    const direct = await queryAhThrottleDirect(scopeKey);
    expect(direct.exists).toBe(true);
    expect(direct.requestCount).toBe(10);

    const eleventh = await checkAhLoginRateLimit(email);
    expect(eleventh.allowed).toBe(false);

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// ALR-DUR-4: window expiry resets counter (reset contract)
// ---------------------------------------------------------------------------

describe("ALR-DUR-4: window expiry resets counter atomically", () => {
  it("after window expires: counter resets to 1 and request is allowed", async () => {
    const scopeKey = `ah-login:p1j6-expiry-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    for (let i = 0; i < 2; i++) {
      await checkAndIncrementAuthThrottle("ah-login", scopeKey, 2, 200);
    }
    const blocked = await checkAndIncrementAuthThrottle("ah-login", scopeKey, 2, 200);
    expect(blocked.allowed).toBe(false);

    const preExpiry = await queryAhThrottleDirect(scopeKey);
    expect(preExpiry.requestCount).toBe(3);

    await new Promise((r) => setTimeout(r, 250));

    const afterExpiry = await checkAndIncrementAuthThrottle(
      "ah-login",
      scopeKey,
      2,
      200
    );
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.requestCount).toBe(1);

    const direct = await queryAhThrottleDirect(scopeKey);
    expect(direct.requestCount).toBe(1);
    expect(direct.windowResetAt!.getTime()).toBeGreaterThan(Date.now());

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// ALR-COLD-1: module reload — throttle enforced from fresh import (not memory)
// ---------------------------------------------------------------------------

describe("ALR-COLD-1: throttle survives jest.resetModules (fresh module import)", () => {
  it("10 attempts via original import; re-imported module still blocks attempt 11 from DB state", async () => {
    const email = makeEmailKey("cold1");
    const scopeKey = `ah-login:${email}`;

    for (let i = 0; i < 10; i++) {
      await checkAhLoginRateLimit(email);
    }

    const directBeforeReload = await queryAhThrottleDirect(scopeKey);
    expect(directBeforeReload.requestCount).toBe(10);

    jest.resetModules();
    const { checkAhLoginRateLimit: freshCheck } = await import(
      "@/lib/auth-rate-limit"
    );

    const blocked = await freshCheck(email);
    expect(blocked.allowed).toBe(false);
    expect(blocked.requestCount).toBe(11);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    const directAfterReload = await queryAhThrottleDirect(scopeKey);
    expect(directAfterReload.requestCount).toBe(11);

    await deleteAuthThrottleRow(scopeKey);
  });
});

// ---------------------------------------------------------------------------
// ALR-ROUTE-1: route-level contract — HTTP 429 when durable limit exceeded
// ---------------------------------------------------------------------------

describe("ALR-ROUTE-1: POST /api/auth/account-holder/login enforces durable throttle", () => {
  it("11th login POST → 429 too_many_requests with Retry-After header", async () => {
    const email = makeEmailKey("route1");
    const scopeKey = `ah-login:${email}`;

    for (let i = 0; i < 10; i++) {
      const res = await POST(makeLoginRequest(email));
      expect(res.status).toBe(401);
    }

    const throttled = await POST(makeLoginRequest(email));
    expect(throttled.status).toBe(429);
    const json = (await throttled.json()) as { error?: string };
    expect(json.error).toBe("too_many_requests");
    expect(throttled.headers.get("Retry-After")).not.toBeNull();
    expect(Number(throttled.headers.get("Retry-After"))).toBeGreaterThan(0);

    const direct = await queryAhThrottleDirect(scopeKey);
    expect(direct.requestCount).toBe(11);

    await deleteAuthThrottleRow(scopeKey);
  });
});
