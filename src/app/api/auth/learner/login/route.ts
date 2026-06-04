/**
 * POST /api/auth/learner/login
 *
 * Authenticates a LearnerProfile via username@familyid + PIN (IAC-7).
 *
 * Handle format: `username@familyid` (e.g. "dragon@mortensen1847").
 * The `@` is REQUIRED as a separator (IAC-7 supersedes round-3 leading-@-strip).
 * A leading `@` strip is kept defensively (e.g. if someone types "@dragon@mortensen1847").
 *
 * Resolution: parse handle → look up AccountHolder by familyId → look up
 * LearnerCredential by (accountHolderId, username) → verify PIN.
 *
 * IAC-6: accessMode enforcement — `account_holder_session` learners are rejected
 * (they authenticate via the owning AccountHolder session, not independent PIN).
 *
 * IAC-10: layered lockout — gentle early tiers (soft cooldown) → hard lock
 * (IP-independent per-credential counter) → parent unlock required.
 *
 * On success: creates (or re-uses) a LearnerDeviceSession; issues cookie.
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
  isCredentialHardLocked,
} from "@/lib/learner-pin-rate-limit";

const isDev = process.env.NODE_ENV === "development";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Parse `username@familyid` handle.
 * Returns null if no `@` separator is found (invalid format).
 * Strips a leading `@` defensively before parsing.
 */
function parseLoginHandle(raw: string): { username: string; familyId: string } | null {
  // Strip leading @ defensively (typo guard)
  const handle = raw.startsWith("@") ? raw.slice(1) : raw;
  const atIdx = handle.lastIndexOf("@");
  if (atIdx <= 0) return null; // no separator, or username is empty
  const username = handle.slice(0, atIdx).trim().toLowerCase();
  const familyId = handle.slice(atIdx + 1).trim().toLowerCase();
  if (!username || !familyId) return null;
  return { username, familyId };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { username: rawHandle, pin } = body as { username?: string; pin?: string };

  if (!rawHandle || !pin) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const normalizedHandle = rawHandle.trim().toLowerCase();
  const parsed = parseLoginHandle(normalizedHandle);

  // If handle doesn't contain @familyid, return invalid_credentials (anti-enumeration)
  if (!parsed) {
    await dummyLearnerHashCompare();
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const { username, familyId } = parsed;
  const ip = getClientIp(req);

  // IAC-10: check per-credential hard lock FIRST (IP-independent)
  // Use a stable key based on the handle for hard lock lookup
  const hardLockKey = `${familyId}:${username}`;
  if (await isCredentialHardLocked(hardLockKey)) {
    return NextResponse.json(
      { error: "account_locked", message: "Too many failed attempts. Ask a parent/guardian to unlock your account." },
      { status: 423 }
    );
  }

  // Check soft cooldown BEFORE attempting bcrypt (fail fast)
  // credKey is stable (familyId:username) — same as hard tier, IP-independent.
  const cooldown = await checkLearnerPinCooldown(hardLockKey, ip);
  if (cooldown.inCooldown) {
    return NextResponse.json(
      { error: "too_many_attempts" },
      {
        status: 429,
        headers: { "Retry-After": String(cooldown.retryAfterSeconds) },
      }
    );
  }

  // Resolve AccountHolder by familyId → then look up credential by (accountHolderId, username)
  const accountHolder = await db.accountHolder.findUnique({
    where: { familyId },
    select: { id: true, tombstonedAt: true },
  });

  let matched = false;
  let credentialResult: {
    id: string;
    learnerProfileId: string;
    secretHash: string;
    learnerProfile: { id: string; tombstonedAt: Date | null; accountHolderId: string; accessMode: import("@prisma/client").LearnerAccessMode };
  } | null = null;

  if (accountHolder && !accountHolder.tombstonedAt) {
    const cred = await db.learnerCredential.findUnique({
      where: {
        accountHolderId_username: {
          accountHolderId: accountHolder.id,
          username,
        },
      },
      select: {
        id: true,
        learnerProfileId: true,
        secretHash: true,
        learnerProfile: {
          select: {
            id: true,
            tombstonedAt: true,
            accountHolderId: true,
            accessMode: true,
          },
        },
      },
    });

    if (cred && !cred.learnerProfile.tombstonedAt) {
      // IAC-6: reject account_holder_session learners at PIN login
      if (cred.learnerProfile.accessMode === "account_holder_session" ||
          cred.learnerProfile.accessMode === "parent_session_select") {
        // This learner authenticates via parent's session, not independent PIN
        console.log(
          `[lpr] lpr=${cred.learnerProfileId} action=login_rejected reason=wrong_access_mode accessMode=${cred.learnerProfile.accessMode}`
        );
        await dummyLearnerHashCompare();
        return NextResponse.json(
          { error: "access_mode_mismatch", message: "This account does not use PIN login. Ask your parent/guardian to sign in." },
          { status: 403 }
        );
      }

      matched = await verifyLearnerPin(pin, cred.secretHash);
      if (matched) {
        credentialResult = cred;
      }
    } else {
      await dummyLearnerHashCompare();
    }
  } else {
    // Always run bcrypt to prevent timing side-channel
    await dummyLearnerHashCompare();
  }

  if (!matched) {
    const failResult = await recordLearnerPinFailure(hardLockKey);

    console.log(
      `[lpr] lpr=unknown action=login_failed handle=${familyId}:${username} attempt=${failResult.failureCount}`
    );

    if (failResult.hardLockTriggered) {
      console.log(
        `[lpr] lpr=unknown action=hard_lock_triggered handle=${familyId}:${username}`
      );
    } else if (failResult.lockoutThresholdReached) {
      console.log(
        `[lpr] lpr=unknown action=lockout_threshold_reached handle=${familyId}:${username}`
      );
    }

    if (failResult.hardLockTriggered) {
      return NextResponse.json(
        { error: "account_locked", message: "Too many failed attempts. Ask a parent/guardian to unlock your account." },
        { status: 423 }
      );
    }

    if (failResult.newCooldownSeconds > 0) {
      const errorMsg = failResult.failureCount >= 5
        ? "Too many attempts — try again later. Ask a parent/guardian if you need help."
        : undefined;
      return NextResponse.json(
        { error: "too_many_attempts", ...(errorMsg ? { message: errorMsg } : {}) },
        {
          status: 429,
          headers: { "Retry-After": String(failResult.newCooldownSeconds) },
        }
      );
    }

    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // Success: reset failure counts
  await resetLearnerPinFailures(hardLockKey);

  const existingRawToken = req.cookies.get(LEARNER_SESSION_COOKIE)?.value ?? null;
  const deviceInfo = req.headers.get("user-agent")?.substring(0, 128) ?? null;

  const { rawToken, sessionId } = await createLearnerSession(
    credentialResult!.learnerProfileId,
    existingRawToken,
    deviceInfo
  );

  const expiresAt = new Date(Date.now() + LEARNER_SESSION_TTL_MS);
  const cookie = buildLearnerSessionCookie(rawToken, expiresAt, isDev);

  console.log(`[lpr] lpr=${credentialResult!.learnerProfileId} action=login device=${sessionId}`);

  return NextResponse.json(
    { next: "session" },
    { headers: { "Set-Cookie": cookie } }
  );
}
