/**
 * POST /api/claim/[token]/complete
 *
 * Completes a claim: creates (or attaches) a LearnerProfile to a Student,
 * marks the invite used, and revokes all sibling pending invites.
 *
 * IAC-3: attach-to-existing-first. Request body can include:
 *   `action: "create_child"` — create a new LearnerProfile (default for new children)
 *   `action: "attach_existing"` + `learnerProfileId` — attach an owned existing profile
 *   `action: "connect_self"` — create/attach the AccountHolder's own isSelfLearner profile
 *
 * ALL DB writes are inside ONE transaction (BLOCKER-P2-R1).
 * Concurrent-claim race handled by @@unique([adminUserId, learnerProfileId]) on Student:
 *   second concurrent call hits constraint violation → 409.
 *
 * Requires: AccountHolder session (mynk_ah_session cookie) + emailVerifiedAt.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isPrismaUniqueViolation } from "@/lib/db/prisma-errors";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { hashToken } from "@/lib/crypto/session-tokens";

type ClaimAction = "create_child" | "attach_existing" | "connect_self";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ahSession = await getAccountHolderSession(req);
  if (!ahSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  // Parse action from body
  let body: { action?: ClaimAction; learnerProfileId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Default to create_child for backward compat (no body = old flow)
    body = { action: "create_child" };
  }

  const action: ClaimAction = body.action ?? "create_child";

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const invite = await db.studentClaimInvite.findUnique({
    where: { tokenHash },
    include: {
      student: { select: { id: true, adminUserId: true, learnerProfileId: true, name: true } },
    },
  });

  if (!invite) return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  if (invite.claimedAt) return NextResponse.json({ error: "student_already_claimed" }, { status: 409 });
  if (invite.revokedAt) return NextResponse.json({ error: "link_revoked" }, { status: 410 });
  if (invite.expiresAt < now) {
    console.log(`[clm] clm=${invite.id} action=expired_on_read`);
    return NextResponse.json({ error: "link_expired" }, { status: 410 });
  }

  console.log(`[clm] clm=${invite.id} action=viewed`);

  let newProfileId: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      let profileId: string;

      if (action === "attach_existing") {
        // IAC-3: attach to an existing owned LearnerProfile
        const profileToAttach = body.learnerProfileId;
        if (!profileToAttach) throw new ValidationError("missing_learner_profile_id");

        const profile = await tx.learnerProfile.findUnique({
          where: { id: profileToAttach },
          select: { accountHolderId: true, tombstonedAt: true },
        });
        if (!profile || profile.accountHolderId !== ahSession.accountHolderId || profile.tombstonedAt) {
          throw new ValidationError("profile_not_owned");
        }

        profileId = profileToAttach;
        console.log(`[clm] clm=${invite.id} action=attach_existing learnerProfileId=${profileId} accountHolderId=${ahSession.accountHolderId}`);

      } else if (action === "connect_self") {
        // IAC-8: connect the AccountHolder themselves as a learner
        // Find or create the isSelfLearner profile for this AccountHolder
        const existingSelf = await tx.learnerProfile.findFirst({
          where: { accountHolderId: ahSession.accountHolderId, isSelfLearner: true, tombstonedAt: null },
          select: { id: true },
        });

        if (existingSelf) {
          profileId = existingSelf.id;
        } else {
          const selfAH = await tx.accountHolder.findUnique({
            where: { id: ahSession.accountHolderId },
            select: { displayName: true, email: true },
          });
          const selfName = selfAH?.displayName ?? selfAH?.email.split("@")[0] ?? "Me";
          const selfProfile = await tx.learnerProfile.create({
            data: {
              accountHolderId: ahSession.accountHolderId,
              displayName: selfName,
              isSelfLearner: true,
              accessMode: "account_holder_session",
            },
          });
          await tx.accountHolder.update({
            where: { id: ahSession.accountHolderId },
            data: { isSelfLearner: true },
          });
          profileId = selfProfile.id;
        }
        console.log(`[clm] clm=${invite.id} action=connect_self learnerProfileId=${profileId} accountHolderId=${ahSession.accountHolderId}`);

      } else {
        // Default: create_child — create a new LearnerProfile
        const newProfile = await tx.learnerProfile.create({
          data: {
            accountHolderId: ahSession.accountHolderId,
            displayName: invite.student.name,
            isSelfLearner: false,
            accessMode: "account_holder_session",
          },
        });
        profileId = newProfile.id;
        console.log(`[clm] clm=${invite.id} action=create_child learnerProfileId=${profileId} accountHolderId=${ahSession.accountHolderId}`);
      }

      newProfileId = profileId;

      // Link Student to the LearnerProfile — IAC-2: unique per (adminUserId, learnerProfileId)
      // Use updateMany with WHERE learnerProfileId IS NULL (race safety for the same profile-tutor pair)
      const updatedCount = await tx.student.updateMany({
        where: {
          id: invite.studentId,
          learnerProfileId: null,
          // Also check the composite unique is not already violated (same tutor + same profile)
        },
        data: { learnerProfileId: profileId },
      });

      if (updatedCount.count === 0) {
        // Either already claimed by another transaction, or already linked to a profile
        throw new ClaimRaceError("student_already_claimed");
      }

      // Mark invite used
      const markedCount = await tx.studentClaimInvite.updateMany({
        where: { id: invite.id, claimedAt: null },
        data: {
          claimedAt: now,
          claimedByAccountHolderId: ahSession.accountHolderId,
        },
      });
      if (markedCount.count === 0) throw new ClaimRaceError("claim_already_completed");

      // Revoke sibling pending invites (BLOCKER-P2-S3)
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
        console.log(`[clm] clm=${invite.id} action=revoked reason=post_claim_cleanup count=${revoked.count}`);
      }
    });
  } catch (err) {
    if (err instanceof ClaimRaceError) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.code }, { status: 422 });
    }
    // Check for Prisma unique constraint violation (concurrent attach to same tutor-profile pair)
    const e = err as { code?: string };
    if (isPrismaUniqueViolation(e)) {
      return NextResponse.json({ error: "already_linked_to_tutor" }, { status: 409 });
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

class ValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ValidationError";
  }
}
