/**
 * POST /api/learner-profiles/[id]/device-sessions/revoke-all
 *
 * Revokes ALL active LearnerDeviceSessions for a LearnerProfile.
 * Requires AccountHolder session + assertOwnsLearnerProfile.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";

export async function POST(
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

  const now = new Date();
  const result = await db.learnerDeviceSession.updateMany({
    where: { learnerProfileId, revokedAt: null },
    data: { revokedAt: now },
  });

  console.log(
    `[lpr] lpr=${learnerProfileId} action=device_revoked session=all revokedBy=parent count=${result.count}`
  );

  return NextResponse.json({ ok: true, revokedCount: result.count });
}
