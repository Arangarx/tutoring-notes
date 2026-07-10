/**
 * Durable auth rate limiters — IAC-11 (MEDIUM-severity, Neon-backed).
 *
 * Ports two in-memory `rateLimit()` buckets from middleware into Neon Postgres
 * so accumulated failure counts survive Vercel cold starts and are shared across
 * concurrent serverless instances.
 *
 * Rate limits (preserve existing middleware thresholds exactly):
 *   AH login:   10 req / 60s window  — keyed on `ah-login:<normalizedEmail>`
 *   2FA verify: 20 req / 60s window  — keyed on `2fa-verify:<adminUserId>`
 *
 * Stable-key rationale (same lesson as LearnerLoginThrottle, commit c3df351):
 *   Vercel's x-forwarded-for can return different values across proxy hops,
 *   making a per-IP key effectively per-request — the counter resets every call
 *   and never accumulates. Email (AH login) and adminUserId (2FA verify) are
 *   stable per-session identity keys that accumulate reliably regardless of which
 *   edge node proxied the request.
 *
 * Architecture decision — shared AuthThrottle table (not per-purpose tables):
 *   Both limiters share a single `AuthThrottle` table distinguished by `kind`
 *   ("ah-login" | "2fa-verify") and a kind-prefixed `scopeKey`. This mirrors
 *   the LearnerLoginThrottle pattern (soft/hard rows in one table) and keeps the
 *   atomic upsert SQL identical for both limiters. Adding a third limiter in the
 *   future costs one enum value and zero schema migrations.
 *
 * Behavior change vs. current in-memory limiter:
 *   - Primary key is now stable identity (email / adminUserId) instead of IP.
 *     An attacker with many IPs can no longer reset the counter by rotating IPs.
 *   - IP-coarse check in middleware is preserved as defense-in-depth (LOW, no change).
 *   - User-observable: the window counter now accumulates across Vercel cold starts
 *     (previously a cold start silently reset the counter to 0). Legitimate users
 *     hitting the limit from different devices/locations now share one counter per
 *     identity, but the generous thresholds (10/min AH, 20/min 2FA) mean real
 *     users are not affected in practice.
 *
 * Concurrency: requestCount increments are atomic (single SQL INSERT … ON CONFLICT
 *   DO UPDATE … RETURNING) to prevent lost-update races across concurrent instances.
 *
 * Log prefixes (registered in docs/RECORDER-LIFECYCLE.md):
 *   alr — AH-login durable rate limiter
 *   tfr — 2FA-verify durable rate limiter
 *
 * Usage:
 *   const result = await checkAndIncrementAuthThrottle("ah-login", `ah-login:${email}`, 10, 60_000);
 *   if (!result.allowed) return 429;
 */

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthThrottleResult {
  allowed: boolean;
  /** Requests counted in the current window (including this one). */
  requestCount: number;
  /** ms until the window resets. 0 if the request was allowed. */
  retryAfterMs: number;
}

// ---------------------------------------------------------------------------
// Core: atomic window increment + check
// ---------------------------------------------------------------------------

/**
 * Atomically increment the request counter for `scopeKey` and check whether
 * `maxRequests` has been exceeded within `windowMs`.
 *
 * On the first request (or after window expiry): creates/resets the row with
 * count=1, windowResetAt=NOW()+windowMs.
 *
 * On subsequent requests within the window: increments requestCount.
 *
 * Returns `allowed=false` when requestCount > maxRequests.
 *
 * @param kind       - Row kind label ("ah-login" | "2fa-verify") for queries/cleanup.
 * @param scopeKey   - Stable identity key ("ah-login:<email>" | "2fa-verify:<userId>").
 * @param maxRequests - Max requests allowed in the window.
 * @param windowMs   - Window duration in milliseconds.
 */
export async function checkAndIncrementAuthThrottle(
  kind: string,
  scopeKey: string,
  maxRequests: number,
  windowMs: number
): Promise<AuthThrottleResult> {
  // Build the interval string for Postgres (e.g. "60000 milliseconds").
  // Using milliseconds directly avoids floating-point precision issues.
  const intervalSql = Prisma.sql`(${windowMs} || ' milliseconds')::interval`;

  type ThrottleRow = { requestCount: number | bigint; windowResetAt: Date };
  const rows = await db.$queryRaw<ThrottleRow[]>(Prisma.sql`
    INSERT INTO "AuthThrottle"
      ("id", "scopeKey", "kind", "requestCount", "windowResetAt", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      ${scopeKey},
      ${kind},
      1,
      NOW() + ${intervalSql},
      NOW(),
      NOW()
    )
    ON CONFLICT ("scopeKey") DO UPDATE
      SET
        "requestCount"  = CASE
          WHEN "AuthThrottle"."windowResetAt" <= NOW() THEN 1
          ELSE "AuthThrottle"."requestCount" + 1
        END,
        "windowResetAt" = CASE
          WHEN "AuthThrottle"."windowResetAt" <= NOW() THEN NOW() + ${intervalSql}
          ELSE "AuthThrottle"."windowResetAt"
        END,
        "updatedAt"     = NOW()
    RETURNING "requestCount"::int, "windowResetAt"
  `);

  if (!rows || rows.length === 0) {
    throw new Error(`[auth-rate-limit] checkAndIncrementAuthThrottle: upsert returned no rows for ${scopeKey}`);
  }

  const row = rows[0]!;
  const count = Number(row.requestCount);
  const now = Date.now();
  const resetAt = row.windowResetAt.getTime();
  const retryAfterMs = count > maxRequests ? Math.max(0, resetAt - now) : 0;

  return {
    allowed: count <= maxRequests,
    requestCount: count,
    retryAfterMs,
  };
}

// ---------------------------------------------------------------------------
// Named helpers for each limiter — thin wrappers with stable keys + logging
// ---------------------------------------------------------------------------

/**
 * AH-login durable rate limiter (IAC-11).
 * 10 req / 60s per normalized email address.
 *
 * @param normalizedEmail - Lowercase-trimmed email from the login request body.
 * Log prefix: alr
 */
export async function checkAhLoginRateLimit(
  normalizedEmail: string
): Promise<AuthThrottleResult> {
  const scopeKey = `ah-login:${normalizedEmail}`;
  const result = await checkAndIncrementAuthThrottle("ah-login", scopeKey, 10, 60_000);

  if (!result.allowed) {
    console.log(
      `[alr] alr=${scopeKey} action=rate-limited count=${result.requestCount} retryAfterSec=${Math.ceil(result.retryAfterMs / 1000)}`
    );
  } else {
    // Log only at the threshold boundary so logs aren't noisy on every request.
    if (result.requestCount >= 8) {
      console.log(
        `[alr] alr=${scopeKey} action=approaching-limit count=${result.requestCount}/10`
      );
    }
  }

  return result;
}

/**
 * 2FA-verify durable rate limiter (IAC-11).
 * 20 req / 60s per adminUserId.
 *
 * @param adminUserId - The DB id of the admin/tutor attempting 2FA verification.
 * Log prefix: tfr
 */
export async function check2faVerifyRateLimit(
  adminUserId: string
): Promise<AuthThrottleResult> {
  const scopeKey = `2fa-verify:${adminUserId}`;
  const result = await checkAndIncrementAuthThrottle("2fa-verify", scopeKey, 20, 60_000);

  if (!result.allowed) {
    console.log(
      `[tfr] tfr=${scopeKey} action=rate-limited count=${result.requestCount} retryAfterSec=${Math.ceil(result.retryAfterMs / 1000)}`
    );
  } else {
    if (result.requestCount >= 16) {
      console.log(
        `[tfr] tfr=${scopeKey} action=approaching-limit count=${result.requestCount}/20`
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Testing helpers (direct DB reads — independent oracle for durability tests)
// ---------------------------------------------------------------------------

/** Get the current requestCount for a scopeKey directly from DB. */
export async function getAuthThrottleCount(scopeKey: string): Promise<number> {
  const row = await db.authThrottle.findUnique({
    where: { scopeKey },
    select: { requestCount: true },
  });
  return row?.requestCount ?? 0;
}

/** Get the full throttle row for a scopeKey (null if absent). */
export async function getAuthThrottleRow(scopeKey: string): Promise<{
  requestCount: number;
  windowResetAt: Date;
} | null> {
  const row = await db.authThrottle.findUnique({
    where: { scopeKey },
    select: { requestCount: true, windowResetAt: true },
  });
  return row ?? null;
}

/** Delete a throttle row (test cleanup only). */
export async function deleteAuthThrottleRow(scopeKey: string): Promise<void> {
  await db.authThrottle.deleteMany({ where: { scopeKey } });
}
