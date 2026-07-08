import { PrismaClient } from "@prisma/client";

import {
  generateRawToken,
  hashToken,
  CLAIM_INVITE_TTL_MS,
} from "@/lib/crypto/session-tokens";
import { formatLearnerLoginHandle } from "@/lib/family-id";
import { seedParentAccountHolder } from "./identity.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

export type UnclaimedClaimInviteFixture = {
  rawToken: string;
  tokenHash: string;
  inviteId: string;
  adminUserId: string;
  studentId: string;
  studentName: string;
};

export type ClaimWizardOracle = {
  inviteClaimed: boolean;
  claimedByAccountHolderId: string | null;
  studentLearnerProfileId: string | null;
  learnerProfileAccountHolderId: string | null;
};

export type LearnerCredentialOracle = {
  username: string;
  familyId: string;
  handle: string;
  credKey: string;
} | null;

function uniqSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Pending StudentClaimInvite + unclaimed Student (learnerProfileId null).
 * Parent session (TEST_PARENT) completes the claim via the browser wizard.
 */
export async function seedUnclaimedClaimInvite(opts?: {
  studentName?: string;
  adminUserId?: string;
}): Promise<UnclaimedClaimInviteFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const suffix = uniqSuffix();
  const studentName = opts?.studentName ?? `E2E Claim Wizard ${suffix}`;

  try {
    let adminUserId = opts?.adminUserId;
    if (!adminUserId) {
      const tutor = await prisma.adminUser.create({
        data: {
          email: `pw-claim-wizard-tutor-${suffix}@test.local`,
          role: "TUTOR",
          approvalStatus: "APPROVED",
        },
        select: { id: true },
      });
      adminUserId = tutor.id;
    }

    const student = await prisma.student.create({
      data: {
        name: studentName,
        adminUserId,
        learnerProfileId: null,
      },
      select: { id: true },
    });

    const rawToken = await generateRawToken();
    const tokenHash = hashToken(rawToken);
    const invite = await prisma.studentClaimInvite.create({
      data: {
        studentId: student.id,
        adminUserId,
        tokenHash,
        expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
      },
      select: { id: true },
    });

    return {
      rawToken,
      tokenHash,
      inviteId: invite.id,
      adminUserId,
      studentId: student.id,
      studentName,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/** DB oracle — invite + student linkage after claim wizard steps. */
export async function readClaimWizardOracle(
  inviteId: string,
  studentId: string
): Promise<ClaimWizardOracle> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const invite = await prisma.studentClaimInvite.findUnique({
      where: { id: inviteId },
      select: { claimedAt: true, claimedByAccountHolderId: true },
    });
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { learnerProfileId: true },
    });

    let learnerProfileAccountHolderId: string | null = null;
    if (student?.learnerProfileId) {
      const profile = await prisma.learnerProfile.findUnique({
        where: { id: student.learnerProfileId },
        select: { accountHolderId: true },
      });
      learnerProfileAccountHolderId = profile?.accountHolderId ?? null;
    }

    return {
      inviteClaimed: invite?.claimedAt != null,
      claimedByAccountHolderId: invite?.claimedByAccountHolderId ?? null,
      studentLearnerProfileId: student?.learnerProfileId ?? null,
      learnerProfileAccountHolderId,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/** DB oracle — LearnerCredential + login handle after setup wizard. */
export async function readLearnerCredentialOracle(
  learnerProfileId: string
): Promise<LearnerCredentialOracle> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const cred = await prisma.learnerCredential.findUnique({
      where: { learnerProfileId },
      select: {
        username: true,
        accountHolder: { select: { familyId: true } },
      },
    });
    if (!cred?.accountHolder.familyId) return null;

    const familyId = cred.accountHolder.familyId;
    const handle = formatLearnerLoginHandle(cred.username, familyId);
    return {
      username: cred.username,
      familyId,
      handle,
      credKey: `${familyId}:${cred.username}`,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/** Ensure TEST_PARENT exists — identity-e2e parent storageState depends on it. */
export async function ensureParentForClaimWizard(): Promise<string> {
  return seedParentAccountHolder();
}
