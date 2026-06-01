/**
 * POST /api/auth/learner/login
 *
 * Authenticates a LearnerProfile via username + PIN.
 * Soft-lockout policy (AH-4 LOCKED): tiered cooldowns, NEVER hard-lock.
 * Timing-safe: always runs bcrypt.compare even when username is not found.
 *
 * On success: creates (or re-uses) a LearnerDeviceSession; issues cookie.
 * On failure: increments failure count, applies cooldown, logs attempt.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyLearnerPin, dummyLearnerHashCompare } from "@/lib/account-holder-auth";
import {
  createLearnerSession,
  buildLearnerSessionCookie,
  LEARNER_SESSION_COOKIE,
  LEARNER_SESSION_TTL_MS,
} from "@/lib/learner-session";
import {
  checkLearnerPinCooldown,
  recordLearnerPinFailure,
  resetLearnerPinFailures,
} from "@/lib/learner-pin-rate-limit";

const isDev = process.env.NODE_ENV === "development";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { username, pin } = body as { username?: string; pin?: string };

  const normalizedUsername = (username ?? "").trim().toLowerCase();
  if (!normalizedUsername || !pin) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const ip = getClientIp(req);

  // Check cooldown BEFORE attempting bcrypt (fail fast)
  const cooldown = checkLearnerPinCooldown(normalizedUsername, ip);
  if (cooldown.inCooldown) {
    return NextResponse.json(
      { error: "too_many_attempts" },
      {
        status: 429,
        headers: { "Retry-After": String(cooldown.retryAfterSeconds) },
      }
    );
  }

  const cred = await db.learnerCredential.findUnique({
    where: { username: normalizedUsername },
    include: {
      learnerProfile: {
        select: { id: true, tombstonedAt: true, accountHolderId: true },
      },
    },
  });

  // Always run bcrypt to prevent timing side-channel
  let matched: boolean;
  if (cred && !cred.learnerProfile.tombstonedAt) {
    matched = await verifyLearnerPin(pin, cred.secretHash);
  } else {
    await dummyLearnerHashCompare();
    matched = false;
  }

  if (!matched) {
    const failResult = recordLearnerPinFailure(normalizedUsername, ip);

    console.log(
      `[lpr] lpr=unknown action=login_failed username=${normalizedUsername} attempt=${failResult.failureCount}`
    );

    if (failResult.lockoutThresholdReached) {
      console.log(
        `[lpr] lpr=unknown action=lockout_threshold_reached username=${normalizedUsername}`
      );
      // TODO P2b: queue notification email to AccountHolder.email
    }

    if (failResult.newCooldownSeconds > 0) {
      return NextResponse.json(
        { error: "too_many_attempts" },
        {
          status: 429,
          headers: { "Retry-After": String(failResult.newCooldownSeconds) },
        }
      );
    }

    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // Success: reset failure count
  resetLearnerPinFailures(normalizedUsername, ip);

  const existingRawToken =
    req.cookies.get(LEARNER_SESSION_COOKIE)?.value ?? null;
  const deviceInfo = req.headers.get("user-agent")?.substring(0, 128) ?? null;

  const { rawToken, sessionId } = await createLearnerSession(
    cred!.learnerProfile.id,
    existingRawToken,
    deviceInfo
  );

  const expiresAt = new Date(Date.now() + LEARNER_SESSION_TTL_MS);
  const cookie = buildLearnerSessionCookie(rawToken, expiresAt, isDev);

  console.log(`[lpr] lpr=${cred!.learnerProfile.id} action=login device=${sessionId}`);

  return NextResponse.json(
    { next: "session" },
    { headers: { "Set-Cookie": cookie } }
  );
}
