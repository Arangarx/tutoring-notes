import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  generateRawToken,
  hashToken,
  CLAIM_INVITE_TTL_MS,
} from "@/lib/crypto/session-tokens";
import { TEST_ADMIN } from "../../visual/helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

/**
 * Parent AccountHolder credentials for identity e2e (password login via
 * /api/auth/account-holder/login). Distinct from TEST_LEARNER.parentEmail
 * which is PIN-only child flow without a parent password.
 */
export const TEST_PARENT = {
  email: "playwright-parent-login@test.local",
  password: "ParentLoginPw!456",
  displayName: "Playwright Parent Login",
} as const;

/** Erasure-admin fixture — role ADMIN (default TEST_ADMIN is TUTOR). */
export const TEST_ERASURE_ADMIN = {
  email: "playwright-erasure-admin@test.local",
  password: "ErasureAdminPw!789",
  displayName: "Playwright Erasure Admin",
} as const;

export type ClaimInviteFixture = {
  rawToken: string;
  adminUserId: string;
  accountHolderId: string;
  learnerProfileId: string;
  studentId: string;
  studentName: string;
};

export type ParentConsentFixture = {
  adminUserId: string;
  accountHolderId: string;
  learnerProfileId: string;
  studentId: string;
  learnerName: string;
};

/**
 * AccountHolder with usable passwordHash for /api/auth/account-holder/login.
 * Idempotent — safe at setup and per-test.
 */
export async function seedParentAccountHolder(): Promise<string> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(TEST_PARENT.password, 10);
    const ah = await prisma.accountHolder.upsert({
      where: { email: TEST_PARENT.email },
      create: {
        email: TEST_PARENT.email,
        displayName: TEST_PARENT.displayName,
        passwordHash,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      update: {
        passwordHash,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });
    return ah.id;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Seed admin user with explicit role (e.g. ADMIN for erasure UI follow-on).
 * Idempotent by email.
 */
export async function seedTestAdminWithRole(
  role: "ADMIN" | "TUTOR"
): Promise<string> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const creds =
    role === "ADMIN"
      ? TEST_ERASURE_ADMIN
      : { ...TEST_ADMIN, displayName: TEST_ADMIN.displayName };

  try {
    const passwordHash = await bcrypt.hash(creds.password, 10);
    const user = await prisma.adminUser.upsert({
      where: { email: creds.email },
      create: {
        email: creds.email,
        passwordHash,
        displayName: creds.displayName,
        role,
        approvalStatus: "APPROVED",
      },
      update: {
        passwordHash,
        role,
        approvalStatus: "APPROVED",
      },
      select: { id: true },
    });
    return user.id;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Mirror Jest claim-setup fixture: StudentClaimInvite + claimed state + raw token.
 * Parent must already exist (accountHolderId) — typically TEST_PARENT from setup.
 */
export async function seedClaimInvite(opts: {
  accountHolderId: string;
  adminUserId?: string;
  studentName?: string;
}): Promise<ClaimInviteFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const studentName = opts.studentName ?? "E2E Claim Student";
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    let adminUserId = opts.adminUserId;
    if (!adminUserId) {
      const tutor = await prisma.adminUser.create({
        data: {
          email: `pw-claim-tutor-${suffix}@test.local`,
          role: "TUTOR",
          approvalStatus: "APPROVED",
        },
        select: { id: true },
      });
      adminUserId = tutor.id;
    }

    const student = await prisma.student.create({
      data: { name: studentName, adminUserId },
      select: { id: true },
    });

    const rawToken = await generateRawToken();
    await prisma.studentClaimInvite.create({
      data: {
        studentId: student.id,
        adminUserId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
        claimedAt: new Date(),
        claimedByAccountHolderId: opts.accountHolderId,
      },
    });

    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: opts.accountHolderId,
        displayName: studentName,
        isSelfLearner: false,
      },
      select: { id: true },
    });

    await prisma.student.update({
      where: { id: student.id },
      data: { learnerProfileId: profile.id },
    });

    return {
      rawToken,
      adminUserId,
      accountHolderId: opts.accountHolderId,
      learnerProfileId: profile.id,
      studentId: student.id,
      studentName,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Parent + learner + tutor-linked student for /account/children/[id]/consent.
 * No ConsentRecord pre-seeded — tests drive first save.
 */
export async function seedParentConsentFixture(opts?: {
  adminUserId?: string;
  accountHolderId?: string;
}): Promise<ParentConsentFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const learnerName = "E2E Consent Child";

  try {
    const accountHolderId =
      opts?.accountHolderId ?? (await seedParentAccountHolder());

    let adminUserId = opts?.adminUserId;
    if (!adminUserId) {
      const tutor = await prisma.adminUser.create({
        data: {
          email: `pw-consent-tutor-${suffix}@test.local`,
          role: "TUTOR",
          displayName: "E2E Consent Tutor",
          approvalStatus: "APPROVED",
        },
        select: { id: true },
      });
      adminUserId = tutor.id;
    }

    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId,
        displayName: learnerName,
        isSelfLearner: false,
      },
      select: { id: true },
    });

    const student = await prisma.student.create({
      data: {
        name: learnerName,
        adminUserId,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });

    return {
      adminUserId,
      accountHolderId,
      learnerProfileId: profile.id,
      studentId: student.id,
      learnerName,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export type ConsentRecordSnapshot = {
  version: number;
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
  setByAccountHolderId: string | null;
  captureMethod: string | null;
};

/** Read latest ConsentRecord for (learner, tutor) — DB persistence oracle. */
export async function readLatestConsentRecord(
  learnerProfileId: string,
  adminUserId: string
): Promise<ConsentRecordSnapshot | null> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const record = await prisma.consentRecord.findFirst({
      where: { learnerProfileId, adminUserId },
      orderBy: { version: "desc" },
      select: {
        version: true,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: true,
        captureMethod: true,
      },
    });
    return record;
  } finally {
    await prisma.$disconnect();
  }
}
