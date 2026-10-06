/**
 * POST /api/students/[studentId]/claim-invites
 *
 * Tutor mints a claim invite for a student. Requires AdminUser (NextAuth) session.
 * Stores SHA-256 hash of the raw token (§6.4 hash-only storage).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { assertStudentNotErasedApi } from "@/lib/erasure/assert-student-not-erased";
import { mintStudentClaimInvite } from "@/lib/claim-invite-service";
import { rosterPendingDisplayLabel } from "@/lib/roster-invite-target";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminUserId = session.user.id;
  const { studentId } = await params;

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      adminUserId: true,
      learnerProfileId: true,
      parentEmail: true,
      name: true,
    },
  });

  if (!student || student.adminUserId !== adminUserId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (student.learnerProfileId) {
    return NextResponse.json(
      { error: "student_already_claimed" },
      { status: 409 }
    );
  }

  const erasureBlockedResponse = await assertStudentNotErasedApi(studentId);
  if (erasureBlockedResponse) return erasureBlockedResponse;

  if (!student.parentEmail) {
    return NextResponse.json({ error: "missing_invite_email" }, { status: 422 });
  }

  const inviteLabel = rosterPendingDisplayLabel(student);

  try {
    const minted = await mintStudentClaimInvite({
      studentId,
      adminUserId,
      recipientEmail: student.parentEmail,
      studentDisplayName: inviteLabel,
      sendEmail: true,
    });

    return NextResponse.json({
      inviteLink: minted.inviteLink,
      emailSent: minted.emailSent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "too_many_pending_invites") {
      return NextResponse.json(
        { error: "too_many_pending_invites" },
        { status: 429 }
      );
    }
    throw err;
  }
}
