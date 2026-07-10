/**
 * AccountHolder session helpers — separate auth realm (AH-1 LOCKED).
 *
 * Design (§3.2, §5.2 — identity-phase2-auth-session-design-2026-06-01.md):
 *   - Session stored in AccountHolderSession table (DB-backed, immediately revocable)
 *   - Raw token in HttpOnly cookie `mynk_ah_session`; only HMAC hash persisted in DB
 *   - Sliding renewal: if expiresAt < now + 15d → extend to now + 30d in-place (AH-5)
 *   - No cross-principal fallback: this helper reads ONLY mynk_ah_session
 *
 * Fail-closed: if AH_SESSION_HMAC_SECRET is unset at request time, returns null → 401.
 * This does NOT crash next build (secret is optional in env schema).
 *
 * SERVER-ONLY: never import on the client.
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hmacToken, generateRawToken, AH_SESSION_TTL_MS } from "@/lib/crypto/session-tokens";
import { getCookieFromRequest } from "@/lib/http/cookies";

export const AH_SESSION_COOKIE = "mynk_ah_session";
export { AH_SESSION_TTL_MS };

/** Sliding renewal threshold: renew if less than 15 days remain. */
const SLIDE_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export interface AccountHolderSessionData {
  accountHolderId: string;
  sessionId: string;
  twoFactorVerified: boolean;
}

function getHmacSecret(): string | null {
  return process.env.AH_SESSION_HMAC_SECRET ?? null;
}

/**
 * Validate the AccountHolder session from a raw token string.
 *
 * This is the canonical session-validation entry point for server components
 * (Q3-A fix): callers obtain the raw token via the cookies() Map API (last-value)
 * and pass it directly here, bypassing the first-match linear-scan path.
 *
 * Side effect: same sliding renewal as getAccountHolderSession (AH-5).
 */
export async function validateAccountHolderSessionFromRawToken(
  rawToken: string
): Promise<AccountHolderSessionData | null> {
  const secret = getHmacSecret();
  if (!secret) {
    console.error("[ahx] ahx=unknown action=session_invalid reason=missing_hmac_secret");
    return null;
  }

  let tokenHash: string;
  try {
    tokenHash = hmacToken(rawToken, secret);
  } catch {
    console.error("[ahx] ahx=unknown action=session_invalid reason=hmac_error");
    return null;
  }

  return validateSessionByHash(tokenHash);
}

/**
 * Validate the AccountHolder session from the request cookie.
 * Returns session data on success; null on any failure (expired, revoked, missing).
 *
 * Side effect: extends expiresAt in-place when within the sliding threshold (AH-5).
 *
 * Checks AccountHolder.tombstonedAt — a tombstoned AccountHolder is treated as
 * revoked even if the session row itself has revokedAt IS NULL.
 */
export async function getAccountHolderSession(
  req: NextRequest | Request
): Promise<AccountHolderSessionData | null> {
  const secret = getHmacSecret();
  if (!secret) {
    console.error("[ahx] ahx=unknown action=session_invalid reason=missing_hmac_secret");
    return null;
  }

  // Read cookie from request
  const rawToken = getCookieFromRequest(req, AH_SESSION_COOKIE);
  if (!rawToken) return null;

  let tokenHash: string;
  try {
    tokenHash = hmacToken(rawToken, secret);
  } catch {
    console.error("[ahx] ahx=unknown action=session_invalid reason=hmac_error");
    return null;
  }

  return validateSessionByHash(tokenHash);
}

/**
 * Internal: validate by pre-computed HMAC hash.
 * Shared by getAccountHolderSession and validateAccountHolderSessionFromRawToken.
 */
async function validateSessionByHash(
  tokenHash: string
): Promise<AccountHolderSessionData | null> {
  const now = new Date();

  const row = await db.accountHolderSession.findUnique({
    where: { tokenHash },
    include: {
      accountHolder: {
        select: { tombstonedAt: true },
      },
    },
  });

  if (!row) {
    console.error(`[ahx] ahx=unknown action=session_invalid reason=notfound`);
    return null;
  }
  if (row.revokedAt) {
    console.error(`[ahx] ahx=${row.accountHolderId} action=session_invalid reason=revoked`);
    return null;
  }
  if (row.expiresAt < now) {
    console.error(`[ahx] ahx=${row.accountHolderId} action=session_invalid reason=expired`);
    return null;
  }
  if (row.accountHolder.tombstonedAt) {
    console.error(`[ahx] ahx=${row.accountHolderId} action=session_invalid reason=tombstoned`);
    return null;
  }

  // Sliding renewal (AH-5): extend in-place if within threshold
  const timeUntilExpiry = row.expiresAt.getTime() - now.getTime();
  if (timeUntilExpiry < SLIDE_THRESHOLD_MS) {
    await db.accountHolderSession.update({
      where: { id: row.id },
      data: {
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + AH_SESSION_TTL_MS),
      },
    });
  }

  return {
    accountHolderId: row.accountHolderId,
    sessionId: row.id,
    twoFactorVerified: row.twoFactorVerified,
  };
}

/**
 * Create a new AccountHolder session and return the raw token to issue in the cookie.
 * The raw token is NEVER stored in the DB — only the HMAC hash.
 *
 * BLOCKER-P2-S1 (session fixation): always creates a fresh token on login.
 */
export async function createAccountHolderSession(
  accountHolderId: string,
  deviceInfo?: string | null
): Promise<{ rawToken: string; sessionId: string }> {
  const secret = getHmacSecret();
  if (!secret) {
    throw new Error("[ahx] AH_SESSION_HMAC_SECRET is not set — cannot create session.");
  }

  const rawToken = generateRawToken();
  const tokenHash = hmacToken(rawToken, secret);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AH_SESSION_TTL_MS);

  const session = await db.accountHolderSession.create({
    data: {
      accountHolderId,
      tokenHash,
      twoFactorVerified: false,
      deviceInfo: deviceInfo?.substring(0, 128) ?? null,
      expiresAt,
      lastUsedAt: now,
    },
  });

  return { rawToken, sessionId: session.id };
}

/**
 * Revoke a single AccountHolder session (logout).
 */
export async function revokeAccountHolderSession(sessionId: string): Promise<void> {
  await db.accountHolderSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

/** Prisma client or interactive-transaction client (E2 erasure tombstone). */
export type AccountHolderSessionDbClient =
  | typeof db
  | Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Bulk-revoke all active sessions for an AccountHolder.
 * Called on password reset (BLOCKER-P2-S2) and tombstone.
 */
export async function revokeAllAccountHolderSessions(
  accountHolderId: string,
  client: AccountHolderSessionDbClient = db
): Promise<number> {
  const result = await client.accountHolderSession.updateMany({
    where: { accountHolderId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * Build the Set-Cookie header value for the AccountHolder session cookie.
 * isDev: omit Secure flag in local development.
 */
export function buildAhSessionCookie(
  rawToken: string,
  expiresAt: Date,
  isDev: boolean
): string {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const parts = [
    `${AH_SESSION_COOKIE}=${rawToken}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (!isDev) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Build the Set-Cookie header to clear the AccountHolder session cookie.
 */
export function clearAhSessionCookie(): string {
  return `${AH_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
