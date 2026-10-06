import { db } from "@/lib/db";
import {
  generateRawToken,
  hashToken,
  CLAIM_INVITE_TTL_MS,
} from "@/lib/crypto/session-tokens";
import { sendClaimInviteEmail } from "@/lib/account-holder-email";
import { getPublicBaseUrl } from "@/lib/public-url";
import { normalizeEmail } from "@/lib/normalize-email";
import {
  inviteTargetKind,
  type RosterInviteTargetKind,
} from "@/lib/roster-invite-target";

export type MintClaimInviteResult = {
  inviteId: string;
  rawToken: string;
  inviteLink: string;
  emailSent: boolean;
  emailError?: string;
};

/** Per-student cap on unclaimed, unexpired invites. Shared by mint and createStudent. */
export const MAX_PENDING_CLAIM_INVITES = 3;

export async function countPendingClaimInvites(
  studentId: string,
  now: Date = new Date()
): Promise<number> {
  return db.studentClaimInvite.count({
    where: {
      studentId,
      claimedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
  });
}

/**
 * Target kind for a re-sent invite: the kind stored on the student's most
 * recent invite, else the legacy roster heuristic (pre-migration students).
 */
export async function reinviteTargetKind(student: {
  id: string;
  name: string;
  parentEmail: string | null;
  learnerProfileId: string | null;
}): Promise<RosterInviteTargetKind> {
  const prior = await db.studentClaimInvite.findFirst({
    where: { studentId: student.id, inviteTargetKind: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { inviteTargetKind: true },
  });
  return inviteTargetKind(
    { intendedEmail: null, inviteTargetKind: prior?.inviteTargetKind ?? null },
    student
  );
}

/**
 * Mint a claim invite and optionally email the recipient.
 * Caller must verify student ownership and unclaimed state.
 */
export async function mintStudentClaimInvite(params: {
  studentId: string;
  adminUserId: string;
  /** Becomes the only email allowed to complete the claim. */
  recipientEmail: string;
  targetKind: RosterInviteTargetKind;
  studentDisplayName: string;
  sendEmail: boolean;
}): Promise<MintClaimInviteResult> {
  const now = new Date();

  const pendingCount = await countPendingClaimInvites(params.studentId, now);

  if (pendingCount >= MAX_PENDING_CLAIM_INVITES) {
    throw new Error("too_many_pending_invites");
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + CLAIM_INVITE_TTL_MS);

  const invite = await db.studentClaimInvite.create({
    data: {
      studentId: params.studentId,
      adminUserId: params.adminUserId,
      tokenHash,
      expiresAt,
      intendedEmail: normalizeEmail(params.recipientEmail),
      inviteTargetKind: params.targetKind,
    },
  });

  console.log(
    `[clm] clm=${invite.id} action=invited studentId=${params.studentId} adminUserId=${params.adminUserId}`
  );

  const inviteLink = `/claim/${rawToken}`;
  const inviteUrl = `${getPublicBaseUrl()}${inviteLink}`;

  let emailSent = false;
  let emailError: string | undefined;

  if (params.sendEmail) {
    const mailed = await sendClaimInviteEmail(
      params.recipientEmail,
      inviteUrl,
      params.studentDisplayName,
      { inviteId: invite.id }
    );
    emailSent = mailed.sent;
    emailError = mailed.error;
    if (!mailed.sent) {
      console.error(
        `[clm] clm=${invite.id} action=send_fail studentId=${params.studentId}`
      );
    }
  }

  return {
    inviteId: invite.id,
    rawToken,
    inviteLink,
    emailSent,
    emailError,
  };
}
