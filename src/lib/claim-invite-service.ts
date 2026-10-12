import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  generateRawToken,
  hashToken,
  CLAIM_INVITE_TTL_MS,
} from "@/lib/crypto/session-tokens";
import { sendClaimInviteEmail } from "@/lib/account-holder-email";
import { getPublicBaseUrl } from "@/lib/public-url";
import { normalizeEmail } from "@/lib/normalize-email";
import { DEFAULT_TUTOR_TIMEZONE } from "@/lib/billing/defaults";
import { startOfZonedDay } from "@/lib/org-scope";
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

/** Tutor-owned claim invites since the start of that tutor's day. Org invites are not counted. */
const TUTOR_DAILY_CLAIM_EMAIL_CAP = 30;

type ClaimWriteClient = Prisma.TransactionClient;

/**
 * Midnight that opened `now`'s calendar day in the tutor's zone.
 * Calls startOfZonedDay. Falls back to DEFAULT_TUTOR_TIMEZONE when tutorTimezone is null.
 */
export async function startOfTutorDay(
  adminUserId: string,
  now: Date,
  client: ClaimWriteClient | typeof db = db
): Promise<Date> {
  const admin = await client.adminUser.findUnique({
    where: { id: adminUserId },
    select: { tutorTimezone: true },
  });
  const timeZone = admin?.tutorTimezone || DEFAULT_TUTOR_TIMEZONE;
  return startOfZonedDay(now, timeZone);
}

async function assertTutorOwnedClaimEmailCap(
  client: ClaimWriteClient,
  adminUserId: string,
  now: Date
): Promise<void> {
  const start = await startOfTutorDay(adminUserId, now, client);
  const sentToday = await client.studentClaimInvite.count({
    where: {
      adminUserId,
      createdAt: { gte: start },
      student: { organizationId: null },
    },
  });
  if (sentToday >= TUTOR_DAILY_CLAIM_EMAIL_CAP) {
    throw new Error("tutor_daily_claim_cap");
  }
}

export async function countPendingClaimInvites(
  studentId: string,
  now: Date = new Date(),
  client: Prisma.TransactionClient | typeof db = db
): Promise<number> {
  return client.studentClaimInvite.count({
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
  client?: Prisma.TransactionClient;
}): Promise<MintClaimInviteResult> {
  const now = new Date();
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + CLAIM_INVITE_TTL_MS);

  const writeInvite = async (client: ClaimWriteClient) => {
    const pendingCount = await countPendingClaimInvites(params.studentId, now, client);
    if (pendingCount >= MAX_PENDING_CLAIM_INVITES) {
      throw new Error("too_many_pending_invites");
    }

    const rosterStudent = await client.student.findUnique({
      where: { id: params.studentId },
      select: { organizationId: true },
    });
    // Org learners stay on assertCanSendOrgClaimEmail. This personal cap does not run for them.
    if (rosterStudent && rosterStudent.organizationId == null) {
      await client.$queryRaw`SELECT id FROM "AdminUser" WHERE id = ${params.adminUserId} FOR UPDATE`;
      await assertTutorOwnedClaimEmailCap(client, params.adminUserId, now);
    }

    return client.studentClaimInvite.create({
      data: {
        studentId: params.studentId,
        adminUserId: params.adminUserId,
        tokenHash,
        expiresAt,
        intendedEmail: normalizeEmail(params.recipientEmail),
        inviteTargetKind: params.targetKind,
      },
    });
  };

  const invite = params.client
    ? await writeInvite(params.client)
    : await db.$transaction((tx) => writeInvite(tx));

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
