/**
 * POST /api/claim/[token]/complete
 *
 * Completes a claim: creates a LearnerProfile, links it to the Student,
 * marks the invite used, and revokes all sibling pending invites.
 *
 * ALL four DB writes are inside ONE transaction (BLOCKER-P2-R1).
 * Concurrent-claim race handled by `AND learnerProfileId IS NULL` in
 * the Student update — second concurrent call returns 0 affected rows → 409.
 *
 * BLOCKER-P2-C1: unique constraint on Student.learnerProfileId prevents
 * double-claim; the UPDATE WHERE learnerProfileId IS NULL is the idempotency key.
 * BLOCKER-P2-S3: post-claim sibling invite revoke in same transaction (step d).
 *
 * Requires: AccountHolder session (mynk_ah_session cookie) + emailVerifiedAt.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { hashToken } from "@/lib/crypto/session-tokens";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ahSession = await getAccountHolderSession(req);
  if (!ahSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Verify the AccountHolder's email is confirmed before allowing a claim
  const accountHolder = await db.accountHolder.findUnique({
    where: { id: ahSession.accountHolderId },
    select: { emailVerifiedAt: true, tombstonedAt: true },
  });
  if (!accountHolder?.emailVerifiedAt) {
    return NextResponse.json({ error: "email_not_verified" }, { status: 403 });
  }
  if (accountHolder.tombstonedAt) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { token: rawToken } = await params;
  if (!rawToken) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Look up invite
  const invite = await db.studentClaimInvite.findUnique({
    where: { tokenHash },
    include: {
      student: { select: { id: true, learnerProfileId: true, name: true } },
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  }
  if (invite.claimedAt) {
    return NextResponse.json({ error: "student_already_claimed" }, { status: 409 });
  }
  if (invite.revokedAt) {
    return NextResponse.json({ error: "link_revoked" }, { status: 410 });
  }
  if (invite.expiresAt < now) {
    console.log(`[clm] clm=${invite.id} action=expired_on_read`);
    return NextResponse.json({ error: "link_expired" }, { status: 410 });
  }

  console.log(`[clm] clm=${invite.id} action=viewed`);

  // BLOCKER-P2-R1: all four steps in ONE transaction
  let newProfileId: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      // Step a: create LearnerProfile
      const newProfile = await tx.learnerProfile.create({
        data: {
          accountHolderId: ahSession.accountHolderId,
          displayName: invite.student.name,
        },
      });
      newProfileId = newProfile.id;

      // Step b: link Student to new LearnerProfile — only if not already claimed
      // (the AND learnerProfileId IS NULL check via Prisma update + whereNull)
      const updatedCount = await tx.student.updateMany({
        where: { id: invite.studentId, learnerProfileId: null },
        data: { learnerProfileId: newProfile.id },
      });

      if (updatedCount.count === 0) {
        // Another transaction won the race
        throw new ClaimRaceError("student_already_claimed");
      }

      // Step c: mark invite used
      const markedCount = await tx.studentClaimInvite.updateMany({
        where: { id: invite.id, claimedAt: null },
        data: {
          claimedAt: now,
          claimedByAccountHolderId: ahSession.accountHolderId,
        },
      });

      if (markedCount.count === 0) {
        throw new ClaimRaceError("claim_already_completed");
      }

      // Step d: revoke sibling pending invites (BLOCKER-P2-S3)
      const revoked = await tx.studentClaimInvite.updateMany({
        where: {
          studentId: invite.studentId,
          id: { not: invite.id },
          claimedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      if (revoked.count > 0) {
        console.log(
          `[clm] clm=${invite.id} action=revoked reason=post_claim_cleanup count=${revoked.count}`
        );
      }
    });
  } catch (err) {
    if (err instanceof ClaimRaceError) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    throw err;
  }

  console.log(
    `[clm] clm=${invite.id} action=claimed learnerProfileId=${newProfileId} accountHolderId=${ahSession.accountHolderId}`
  );

  return NextResponse.json({
    ok: true,
    learnerProfileId: newProfileId,
    setupPath: `/claim/${rawToken}/setup`,
  });
}

class ClaimRaceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ClaimRaceError";
  }
}
