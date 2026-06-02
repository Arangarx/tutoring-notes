/**
 * POST /api/claim/[token]/setup
 *
 * Post-claim onboarding: sets up the child's login credentials.
 * Two sub-actions via `action` body field:
 *   "credentials" — create LearnerCredential (username + PIN)
 *
 * Consent setup (Panel A) is Phase 3 — ConsentRecord model not yet implemented.
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

  const { action, username, pin } = body as {
    action?: string;
    username?: string;
    pin?: string;
  };

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

    // Check username uniqueness
    const existingCred = await db.learnerCredential.findUnique({
      where: { username: normalizedUsername },
    });
    if (existingCred) {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }

    const secretHash = await hashLearnerPin(pin);

    await db.learnerCredential.create({
      data: {
        learnerProfileId,
        username: normalizedUsername,
        secretHash,
      },
    });

    console.log(`[lpr] lpr=${learnerProfileId} action=credential_created`);

    return NextResponse.json({ ok: true });
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
