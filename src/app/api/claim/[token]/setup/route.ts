/**
 * POST /api/claim/[token]/setup
 *
 * Post-claim onboarding: sets up the child's login credentials and consent.
 * Sub-actions via `action` body field:
 *   "credentials" — create LearnerCredential (username + PIN)
 *   "consent"     — create/update ConsentRecord for this (learner, tutor) pair (B2)
 *
 * Requires: AccountHolder session + claim must be completed by this AccountHolder.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { hashToken } from "@/lib/crypto/session-tokens";
import { hashLearnerPin } from "@/lib/account-holder-auth";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { validateLearnerPin } from "@/lib/pin-strength";
import { ensureFamilyId, formatLearnerLoginHandle } from "@/lib/family-id";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ahSession = await getAccountHolderSession(req);
  if (!ahSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { token: rawToken } = await params;
  if (!rawToken) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const tokenHash = hashToken(rawToken);

  // Verify the invite belongs to a claim completed by this AccountHolder
  const invite = await db.studentClaimInvite.findUnique({
    where: { tokenHash },
    include: {
      student: { select: { learnerProfileId: true } },
    },
  });

  if (
    !invite ||
    !invite.claimedAt ||
    invite.claimedByAccountHolderId !== ahSession.accountHolderId
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const learnerProfileId = invite.student.learnerProfileId;
  if (!learnerProfileId) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  // Verify this AccountHolder owns the LearnerProfile
  await assertOwnsLearnerProfile(ahSession.accountHolderId, learnerProfileId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const bodyObj = body as {
    action?: string;
    username?: string;
    pin?: string;
    allowLiveSession?: boolean;
    allowAudioRecording?: boolean;
    allowWhiteboardRecording?: boolean;
    allowNoteSending?: boolean;
  };
  const { action, username, pin } = bodyObj;

  // B2: consent action — create/update ConsentRecord for this (learner, tutor) pair.
  if (action === "consent") {
    const allowLiveSession = Boolean(bodyObj.allowLiveSession);
    const allowAudioRecording = Boolean(bodyObj.allowAudioRecording);
    const allowWhiteboardRecording = Boolean(bodyObj.allowWhiteboardRecording);
    const allowNoteSending = Boolean(bodyObj.allowNoteSending);

    // Cross-tenant safety: setByAccountHolderId must equal the learner's accountHolderId.
    const learnerProfile = await db.learnerProfile.findUnique({
      where: { id: learnerProfileId },
      select: { accountHolderId: true, isSelfLearner: true },
    });
    if (!learnerProfile) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
    if (learnerProfile.accountHolderId !== ahSession.accountHolderId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Compute next version: MAX(existing version) + 1, or 1 for first record.
    const maxVersion = await db.consentRecord.aggregate({
      where: { learnerProfileId, adminUserId: invite.adminUserId },
      _max: { version: true },
    });
    const nextVersion = (maxVersion._max.version ?? 0) + 1;

    await db.consentRecord.create({
      data: {
        learnerProfileId,
        adminUserId: invite.adminUserId,
        version: nextVersion,
        allowLiveSession,
        allowAudioRecording,
        allowWhiteboardRecording,
        allowNoteSending,
        setByAccountHolderId: ahSession.accountHolderId,
        captureMethod: "electronic",
      },
    });

    console.log(
      `[cns] learnerProfileId=${learnerProfileId} adminUserId=${invite.adminUserId} action=consent_set version=${nextVersion} accountHolderId=${ahSession.accountHolderId}`
    );

    return NextResponse.json({ ok: true, version: nextVersion });
  }

  if (action === "credentials") {
    if (!username || !pin) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const normalizedUsername = username.trim().toLowerCase();

    // Username validation: alphanumeric + underscore, 3–20 chars
    if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
      return NextResponse.json({ error: "invalid_username" }, { status: 400 });
    }

    // PIN validation: 6 numeric digits, block obvious patterns
    const pinCheck = validateLearnerPin(pin);
    if (!pinCheck.ok) {
      const errorCode =
        pinCheck.error?.includes("6 digits") ? "pin_too_short" : "pin_too_weak";
      return NextResponse.json(
        { error: errorCode, message: pinCheck.error },
        { status: 400 }
      );
    }

    // IAC-7: username uniqueness is per-family (accountHolderId), not global.
    // Fetch accountHolderId from the LearnerProfile to resolve the composite unique.
    const learnerProfile = await db.learnerProfile.findUnique({
      where: { id: learnerProfileId },
      select: { accountHolderId: true },
    });
    if (!learnerProfile) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const existingCred = await db.learnerCredential.findUnique({
      where: {
        accountHolderId_username: {
          accountHolderId: learnerProfile.accountHolderId,
          username: normalizedUsername,
        },
      },
    });
    if (existingCred) {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }

    const secretHash = await hashLearnerPin(pin);

    // IAC-7: must set accountHolderId (denormalized) for per-family unique index.
    // IAC-6: set accessMode to child_pin_required when credential is created.
    await db.$transaction(async (tx) => {
      await tx.learnerProfile.update({
        where: { id: learnerProfileId },
        data: { accessMode: "child_pin_required" },
      });
      await tx.learnerCredential.create({
        data: {
          learnerProfileId,
          accountHolderId: learnerProfile.accountHolderId,
          username: normalizedUsername,
          secretHash,
        },
      });
    });

    // IAC-7: lazily assign familyId to AccountHolder if not already set.
    const familyId = await ensureFamilyId(learnerProfile.accountHolderId);
    const loginHandle = formatLearnerLoginHandle(normalizedUsername, familyId);

    console.log(`[lpr] lpr=${learnerProfileId} action=credential_created`);

    return NextResponse.json({ ok: true, familyId, loginHandle });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

/**
 * GET /api/claim/[token]/setup
 *
 * Returns setup state: which panels are complete.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ahSession = await getAccountHolderSession(req);
  if (!ahSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { token: rawToken } = await params;
  const tokenHash = hashToken(rawToken);

  const invite = await db.studentClaimInvite.findUnique({
    where: { tokenHash },
    include: {
      student: {
        include: {
          learnerProfile: {
            include: { credential: { select: { id: true } } },
          },
        },
      },
    },
  });

  if (
    !invite ||
    !invite.claimedAt ||
    invite.claimedByAccountHolderId !== ahSession.accountHolderId
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const profile = invite.student.learnerProfile;
  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    learnerProfileId: profile.id,
    displayName: profile.displayName,
    credentialsSetUp: !!profile.credential,
  });
}
