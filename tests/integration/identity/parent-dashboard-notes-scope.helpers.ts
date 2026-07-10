import { PrismaClient } from "@prisma/client";

import { seedParentAccountHolder } from "./identity.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

function uniqSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type ParentChildNoteFixture = {
  accountHolderId: string;
  adminUserId: string;
  learnerProfileId: string;
  studentId: string;
  childName: string;
  noteId: string;
  noteTopics: string;
};

export type OtherFamilyNoteFixture = {
  accountHolderId: string;
  adminUserId: string;
  learnerProfileId: string;
  studentId: string;
  childName: string;
  noteId: string;
  noteTopics: string;
};

export type LearnerOwnershipOracle = {
  accountHolderId: string;
  displayName: string;
  tombstonedAt: Date | null;
};

export type SessionNoteOracle = {
  studentId: string;
  status: string;
  topics: string;
};

/**
 * Learner profile + tutor-linked student + READY SessionNote under the given parent.
 * Default parent: TEST_PARENT from identity-e2e storageState.
 */
export async function seedParentChildWithNote(opts?: {
  accountHolderId?: string;
  childName?: string;
  noteTopics?: string;
}): Promise<ParentChildNoteFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const suffix = uniqSuffix();
  const childName = opts?.childName ?? `E2E Parent Scope Child ${suffix}`;
  const noteTopics = opts?.noteTopics ?? `E2E parent-owned note topics ${suffix}`;

  try {
    const accountHolderId =
      opts?.accountHolderId ?? (await seedParentAccountHolder());

    const tutor = await prisma.adminUser.create({
      data: {
        email: `pw-parent-scope-tutor-${suffix}@test.local`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
      },
      select: { id: true },
    });

    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId,
        displayName: childName,
        isSelfLearner: false,
      },
      select: { id: true },
    });

    const student = await prisma.student.create({
      data: {
        name: childName,
        adminUserId: tutor.id,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });

    const note = await prisma.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date("2026-06-01T00:00:00Z"),
        topics: noteTopics,
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: "READY",
      },
      select: { id: true },
    });

    return {
      accountHolderId,
      adminUserId: tutor.id,
      learnerProfileId: profile.id,
      studentId: student.id,
      childName,
      noteId: note.id,
      noteTopics,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Isolated second family (distinct AccountHolder) with child + READY note.
 * Used for cross-tenant negative scoping oracles.
 */
export async function seedOtherFamilyChildWithNote(opts?: {
  childName?: string;
  noteTopics?: string;
}): Promise<OtherFamilyNoteFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const suffix = uniqSuffix();
  const childName = opts?.childName ?? `E2E Other Family Child ${suffix}`;
  const noteTopics = opts?.noteTopics ?? `E2E other-family note topics ${suffix}`;

  try {
    const ah = await prisma.accountHolder.create({
      data: {
        email: `pw-other-family-${suffix}@test.local`,
        displayName: `Other Family Parent ${suffix}`,
        emailVerifiedAt: new Date("2026-01-01"),
        familyId: `othfam${suffix}`,
      },
      select: { id: true },
    });

    const tutor = await prisma.adminUser.create({
      data: {
        email: `pw-other-family-tutor-${suffix}@test.local`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
      },
      select: { id: true },
    });

    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: ah.id,
        displayName: childName,
        isSelfLearner: false,
      },
      select: { id: true },
    });

    const student = await prisma.student.create({
      data: {
        name: childName,
        adminUserId: tutor.id,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });

    const note = await prisma.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date("2026-06-01T00:00:00Z"),
        topics: noteTopics,
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: "READY",
      },
      select: { id: true },
    });

    return {
      accountHolderId: ah.id,
      adminUserId: tutor.id,
      learnerProfileId: profile.id,
      studentId: student.id,
      childName,
      noteId: note.id,
      noteTopics,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/** DB oracle — LearnerProfile ownership row for assertOwnsLearnerProfile surface. */
export async function readLearnerOwnershipOracle(
  learnerProfileId: string
): Promise<LearnerOwnershipOracle> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const profile = await prisma.learnerProfile.findUniqueOrThrow({
      where: { id: learnerProfileId },
      select: {
        accountHolderId: true,
        displayName: true,
        tombstonedAt: true,
      },
    });
    return profile;
  } finally {
    await prisma.$disconnect();
  }
}

/** DB oracle — SessionNote persistence for parent notes scoping. */
export async function readSessionNoteOracle(
  noteId: string
): Promise<SessionNoteOracle> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const note = await prisma.sessionNote.findUniqueOrThrow({
      where: { id: noteId },
      select: { studentId: true, status: true, topics: true },
    });
    return note;
  } finally {
    await prisma.$disconnect();
  }
}
