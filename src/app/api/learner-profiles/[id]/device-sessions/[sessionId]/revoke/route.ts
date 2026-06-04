/**
 * POST /api/learner-profiles/[id]/device-sessions/[sessionId]/revoke
 *
 * Revokes a single LearnerDeviceSession for a LearnerProfile.
 * Requires AccountHolder session + assertOwnsLearnerProfile.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const ahSession = await getAccountHolderSession(req);
  if (!ahSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: learnerProfileId, sessionId } = await params;

  // Verify ownership — notFound() if not owned
  await assertOwnsLearnerProfile(ahSession.accountHolderId, learnerProfileId);

  // Verify the device session belongs to this learner profile
  const deviceSession = await db.learnerDeviceSession.findUnique({
    where: { id: sessionId },
    select: { id: true, learnerProfileId: true, revokedAt: true },
  });

  if (!deviceSession || deviceSession.learnerProfileId !== learnerProfileId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (deviceSession.revokedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await db.learnerDeviceSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });

  console.log(
    `[lpr] lpr=${learnerProfileId} action=device_revoked session=${sessionId} revokedBy=parent`
  );

  return NextResponse.json({ ok: true });
}
