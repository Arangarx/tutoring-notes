import { db } from "@/lib/db";
import {
  generateRawToken,
  hashToken,
  CLAIM_INVITE_TTL_MS,
} from "@/lib/crypto/session-tokens";
import { sendClaimInviteEmail } from "@/lib/account-holder-email";
import { getPublicBaseUrl } from "@/lib/public-url";

export type MintClaimInviteResult = {
  inviteId: string;
  rawToken: string;
  inviteLink: string;
  emailSent: boolean;
  emailError?: string;
};

/**
 * Mint a claim invite and optionally email the recipient.
 * Caller must verify student ownership and unclaimed state.
 */
export async function mintStudentClaimInvite(params: {
  studentId: string;
  adminUserId: string;
  recipientEmail: string;
  studentDisplayName: string;
  sendEmail: boolean;
}): Promise<MintClaimInviteResult> {
  const now = new Date();

  const pendingCount = await db.studentClaimInvite.count({
    where: {
      studentId: params.studentId,
      claimedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
  });

  if (pendingCount >= 3) {
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
