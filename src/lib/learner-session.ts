/**
 * LearnerProfile (child) session helpers — device-bound PIN session.
 *
 * Design (§4.3, §4.5, §5.2):
 *   - Session stored in LearnerDeviceSession table (DB-backed, parent-revocable)
 *   - Raw token in HttpOnly cookie `mynk_learner_session`; only HMAC hash persisted
 *   - Sliding renewal (AH-5 pattern): if expiresAt < now + 30d → extend to now + 90d
 *   - Returns accountHolderId (joined from LearnerProfile) for guard calls
 *   - Tombstoned profiles → null → 401 (BLOCKER I-6)
 *
 * Fail-closed: if LEARNER_SESSION_HMAC_SECRET is unset, returns null.
 *
 * SERVER-ONLY: never import on the client.
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hmacToken, generateRawToken, LEARNER_SESSION_TTL_MS } from "@/lib/crypto/session-tokens";
import { getCookieFromRequest } from "@/lib/http/cookies";

export const LEARNER_SESSION_COOKIE = "mynk_learner_session";
export { LEARNER_SESSION_TTL_MS };

/** Sliding renewal threshold: renew if less than 30 days remain */
const SLIDE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

export interface LearnerSessionData {
  learnerProfileId: string;
  /** Joined from LearnerProfile — needed for assertOwnsLearnerProfile calls */
  accountHolderId: string;
  sessionId: string;
}

function getHmacSecret(): string | null {
  return process.env.LEARNER_SESSION_HMAC_SECRET ?? null;
}

/**
 * Validate the Learner session from a raw token string.
 *
 * Parallel to validateAccountHolderSessionFromRawToken in account-holder-session.ts.
 * Used by getLearnerSessionFromHeaders (server-component multi-cookie path) so we
 * can try each duplicate-cookie candidate without going through getCookieFromRequest.
 *
 * Side effect: same sliding renewal as getLearnerSession.
 */
export async function validateLearnerSessionFromRawToken(
  rawToken: string
): Promise<LearnerSessionData | null> {
  const secret = getHmacSecret();
  if (!secret) {
    console.error("[lpr] lpr=unknown action=session_invalid reason=missing_hmac_secret");
    return null;
  }

  let tokenHash: string;
  try {
    tokenHash = hmacToken(rawToken, secret);
  } catch {
    return null;
  }

  const now = new Date();

  const row = await db.learnerDeviceSession.findUnique({
    where: { tokenHash },
    include: {
      learnerProfile: {
        select: { accountHolderId: true, tombstonedAt: true },
      },
    },
  });

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt < now) return null;
  if (row.learnerProfile.tombstonedAt) return null;

  const timeUntilExpiry = row.expiresAt.getTime() - now.getTime();
  if (timeUntilExpiry < SLIDE_THRESHOLD_MS) {
    await db.learnerDeviceSession.update({
      where: { id: row.id },
      data: {
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + LEARNER_SESSION_TTL_MS),
      },
    });
  }

  return {
    learnerProfileId: row.learnerProfileId,
    accountHolderId: row.learnerProfile.accountHolderId,
    sessionId: row.id,
  };
}

/**
 * Validate the learner session from the request cookie.
 * Returns session data on success; null on any failure.
 *
 * I-6: tombstoned LearnerProfile → null (same as revoked session — no enumeration).
 */
export async function getLearnerSession(
  req: NextRequest | Request
): Promise<LearnerSessionData | null> {
  const secret = getHmacSecret();
  if (!secret) {
    console.error("[lpr] lpr=unknown action=session_invalid reason=missing_hmac_secret");
    return null;
  }

  const rawToken = getCookieFromRequest(req, LEARNER_SESSION_COOKIE);
  if (!rawToken) return null;

  let tokenHash: string;
  try {
    tokenHash = hmacToken(rawToken, secret);
  } catch {
    return null;
  }

  const now = new Date();

  const row = await db.learnerDeviceSession.findUnique({
    where: { tokenHash },
    include: {
      learnerProfile: {
        select: { accountHolderId: true, tombstonedAt: true },
      },
    },
  });

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt < now) return null;
  if (row.learnerProfile.tombstonedAt) {
    // I-6: tombstoned profile — same response as invalid session (no enumeration)
    return null;
  }

  // Sliding renewal: extend in-place
  const timeUntilExpiry = row.expiresAt.getTime() - now.getTime();
  if (timeUntilExpiry < SLIDE_THRESHOLD_MS) {
    await db.learnerDeviceSession.update({
      where: { id: row.id },
      data: {
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + LEARNER_SESSION_TTL_MS),
      },
    });
  }

  return {
    learnerProfileId: row.learnerProfileId,
    accountHolderId: row.learnerProfile.accountHolderId,
    sessionId: row.id,
  };
}

/**
 * Create a new LearnerDeviceSession and return the raw token.
 * Re-uses an existing valid session for the same learnerProfileId if cookie present.
 */
export async function createLearnerSession(
  learnerProfileId: string,
  existingRawToken: string | null,
  deviceInfo?: string | null
): Promise<{ rawToken: string; sessionId: string }> {
  const secret = getHmacSecret();
  if (!secret) {
    throw new Error("[lpr] LEARNER_SESSION_HMAC_SECRET is not set — cannot create session.");
  }

  const now = new Date();

  // Re-use if the existing token is still valid for the same learner
  if (existingRawToken) {
    try {
      const existingHash = hmacToken(existingRawToken, secret);
      const existing = await db.learnerDeviceSession.findUnique({
        where: { tokenHash: existingHash },
      });
      if (
        existing &&
        existing.learnerProfileId === learnerProfileId &&
        !existing.revokedAt &&
        existing.expiresAt > now
      ) {
        // Slide the existing session
        await db.learnerDeviceSession.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: now,
            expiresAt: new Date(now.getTime() + LEARNER_SESSION_TTL_MS),
          },
        });
        return { rawToken: existingRawToken, sessionId: existing.id };
      }
    } catch {
      // Invalid existing token — fall through to create new
    }
  }

  const rawToken = generateRawToken();
  const tokenHash = hmacToken(rawToken, secret);
  const expiresAt = new Date(now.getTime() + LEARNER_SESSION_TTL_MS);

  const session = await db.learnerDeviceSession.create({
    data: {
      learnerProfileId,
      tokenHash,
      expiresAt,
      lastSeenAt: now,
      deviceInfo: deviceInfo?.substring(0, 128) ?? null,
    },
  });

  return { rawToken, sessionId: session.id };
}

/**
 * Build the Set-Cookie header for the learner session cookie.
 */
export function buildLearnerSessionCookie(
  rawToken: string,
  expiresAt: Date,
  isDev: boolean
): string {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const parts = [
    `${LEARNER_SESSION_COOKIE}=${rawToken}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (!isDev) parts.push("Secure");
  return parts.join("; ");
}

/** Build the Set-Cookie header to clear the learner session cookie. */
export function clearLearnerSessionCookie(): string {
  return `${LEARNER_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Prisma client or interactive-transaction client (E2 erasure tombstone). */
export type LearnerSessionDbClient =
  | typeof db
  | Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Bulk-revoke all active device sessions for a LearnerProfile.
 * Mirrors revokeAllAccountHolderSessions — called on learner tombstone.
 */
export async function revokeAllLearnerDeviceSessions(
  learnerProfileId: string,
  client: LearnerSessionDbClient = db
): Promise<number> {
  const result = await client.learnerDeviceSession.updateMany({
    where: { learnerProfileId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
