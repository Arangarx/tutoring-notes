/**
 * POST /api/learner-profiles/[id]/credentials
 *
 * Creates the initial LearnerCredential (username + PIN) for a parent-created
 * learner that has no credential yet. Mirrors the claim setup flow but without
 * the claim-token gate.
 *
 * Requires AccountHolder session + assertOwnsLearnerProfile.
 * On success: sets accessMode to "child_pin_required", lazily assigns familyId.
 *
 * PATCH /api/learner-profiles/[id]/credentials
 *
 * Updates the child's PIN (hashes new PIN, revokes all device sessions).
 * Requires AccountHolder session + assertOwnsLearnerProfile.
 *
 * Design §4.6: PIN change bulk-revokes all LearnerDeviceSession rows so
 * child must re-authenticate on all devices with the new PIN.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { hashLearnerPin } from "@/lib/account-holder-auth";
import {
  validateLearnerPin,
  validateLearnerUsername,
} from "@/lib/learner-credential-validation";
import { ensureFamilyId, formatLearnerLoginHandle } from "@/lib/family-id";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ahSession = await getAccountHolderSession(req);
  if (!ahSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: learnerProfileId } = await params;

  // Ownership assertion — notFound() (→ 404) if not owned or tombstoned.
  await assertOwnsLearnerProfile(ahSession.accountHolderId, learnerProfileId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { username, pin } = body as { username?: string; pin?: string };

  if (!username || !pin) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const usernameCheck = validateLearnerUsername(username);
  if (!usernameCheck.ok) {
    return NextResponse.json(
      { error: "invalid_username", message: usernameCheck.error },
      { status: 400 }
    );
  }
  const normalizedUsername = usernameCheck.normalized!;

  // PIN validation: 6 numeric digits, block obvious patterns.
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
  const existingCred = await db.learnerCredential.findUnique({
    where: {
      accountHolderId_username: {
        accountHolderId: ahSession.accountHolderId,
        username: normalizedUsername,
      },
    },
  });
  if (existingCred) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

  // Ensure no credential already exists for this learner.
  const existingProfileCred = await db.learnerCredential.findUnique({
    where: { learnerProfileId },
  });
  if (existingProfileCred) {
    return NextResponse.json({ error: "credential_already_exists" }, { status: 409 });
  }

  const secretHash = await hashLearnerPin(pin);

  // IAC-6: set accessMode to child_pin_required when credential is created.
  // IAC-7: denormalize accountHolderId for per-family unique index.
  await db.$transaction(async (tx) => {
    await tx.learnerProfile.update({
      where: { id: learnerProfileId },
      data: { accessMode: "child_pin_required" },
    });
    await tx.learnerCredential.create({
      data: {
        learnerProfileId,
        accountHolderId: ahSession.accountHolderId,
        username: normalizedUsername,
        secretHash,
      },
    });
  });

  // IAC-7: lazily assign familyId to AccountHolder if not already set.
  const familyId = await ensureFamilyId(ahSession.accountHolderId);
  const loginHandle = formatLearnerLoginHandle(normalizedUsername, familyId);

  console.log(`[lpr] lpr=${learnerProfileId} action=credential_created accountHolderId=${ahSession.accountHolderId}`);

  return NextResponse.json({ ok: true, familyId, loginHandle });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ahSession = await getAccountHolderSession(req);
  if (!ahSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: learnerProfileId } = await params;

  // Verify ownership — notFound() if not owned
  await assertOwnsLearnerProfile(ahSession.accountHolderId, learnerProfileId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { newPin } = body as { newPin?: string };

  if (!newPin) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // PIN validation (§4.1): 6+ numeric digits OR 8+ chars alphanumeric
  const isNumericPin = /^\d+$/.test(newPin);
  if (isNumericPin && newPin.length < 6) {
    return NextResponse.json({ error: "pin_too_short" }, { status: 400 });
  }
  if (!isNumericPin && newPin.length < 8) {
    return NextResponse.json({ error: "pin_too_short" }, { status: 400 });
  }

  // Verify credential exists for this learner
  const credential = await db.learnerCredential.findUnique({
    where: { learnerProfileId },
    select: { id: true },
  });

  if (!credential) {
    return NextResponse.json({ error: "no_credential" }, { status: 404 });
  }

  const newSecretHash = await hashLearnerPin(newPin);
  const now = new Date();

  // Update PIN + bulk-revoke all device sessions in one transaction
  await db.$transaction([
    db.learnerCredential.update({
      where: { learnerProfileId },
      data: { secretHash: newSecretHash },
    }),
    db.learnerDeviceSession.updateMany({
      where: { learnerProfileId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  console.log(`[lpr] lpr=${learnerProfileId} action=pin_changed revokedAllSessions=true`);

  return NextResponse.json({ ok: true });
}
