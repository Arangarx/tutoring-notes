/**
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
