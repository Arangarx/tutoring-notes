/**
 * POST /api/students/[studentId]/claim-invites
 *
 * Tutor mints a claim invite for a student. Requires AdminUser (NextAuth) session.
 * Stores SHA-256 hash of the raw token (§6.4 hash-only storage).
 *
 * Guards:
 *   - AdminUser session required (NextAuth, Operator realm)
 *   - 404 if student not owned by this tutor
 *   - 409 if student already has a LearnerProfile (already claimed)
 *   - 429 if ≥ 3 pending (non-expired, non-revoked) invites exist
 *
 * P2a: email send is stubbed (logs invite link to console).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { generateRawToken, hashToken, CLAIM_INVITE_TTL_MS } from "@/lib/crypto/session-tokens";
import { stubSendClaimInviteEmail } from "@/lib/account-holder-email";
import { getPublicBaseUrl } from "@/lib/public-url";

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

  // Verify tutor owns this student
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, adminUserId: true, learnerProfileId: true, parentEmail: true, name: true },
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

  const now = new Date();

  // Count pending (non-expired, non-revoked, unused) invites
  const pendingCount = await db.studentClaimInvite.count({
    where: {
      studentId,
      claimedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
  });

  if (pendingCount >= 3) {
    return NextResponse.json(
      { error: "too_many_pending_invites" },
      { status: 429 }
    );
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + CLAIM_INVITE_TTL_MS);

  const invite = await db.studentClaimInvite.create({
    data: {
      studentId,
      adminUserId,
      tokenHash,
      expiresAt,
    },
  });

  console.log(
    `[clm] clm=${invite.id} action=invited studentId=${studentId} adminUserId=${adminUserId}`
  );

  const base = getPublicBaseUrl();
  const inviteLink = `/claim/${rawToken}`;
  const inviteUrl = `${base}${inviteLink}`;

  // Send invite email if student has parentEmail
  if (student.parentEmail) {
    await stubSendClaimInviteEmail(student.parentEmail, inviteUrl, student.name);
  }

  return NextResponse.json({ inviteLink });
}
