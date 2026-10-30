import { PrismaClient } from "@prisma/client";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

export type BridgeScheduledFixture = {
  scheduledSessionId: string;
  adminUserId: string;
  studentId: string;
  learnerProfileId: string;
  accountHolderId: string;
};

/**
 * Scheduled appointment for bridge UI tests — relative to wall clock now.
 */
export async function seedBridgeScheduledSession(opts: {
  adminUserId: string;
  studentId: string;
  learnerProfileId: string;
  accountHolderId: string;
  /** Ms from now until startAt (negative = already started). */
  startsInMs: number;
  durationMs?: number;
  subject?: string;
}): Promise<BridgeScheduledFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const durationMs = opts.durationMs ?? 60 * 60_000;
  const startAt = new Date(Date.now() + opts.startsInMs);
  const endAt = new Date(startAt.getTime() + durationMs);
  const date = new Date(
    Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate())
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  const startTime = `${pad(startAt.getUTCHours())}:${pad(startAt.getUTCMinutes())}`;
  const endTime = `${pad(endAt.getUTCHours())}:${pad(endAt.getUTCMinutes())}`;

  try {
    const sched = await prisma.scheduledSession.create({
      data: {
        adminUserId: opts.adminUserId,
        studentId: opts.studentId,
        date,
        startTime,
        endTime,
        startAt,
        endAt,
        plannedDurationMinutes: Math.round(durationMs / 60_000),
        subject: opts.subject ?? "Bridge PW session",
      },
      select: { id: true },
    });
    return {
      scheduledSessionId: sched.id,
      adminUserId: opts.adminUserId,
      studentId: opts.studentId,
      learnerProfileId: opts.learnerProfileId,
      accountHolderId: opts.accountHolderId,
    };
  } finally {
    await prisma.$disconnect();
  }
}

const ORG_FAMILY_SUBJECT = "Org family PW session";

export type OrgBookedFamilyFixture = BridgeScheduledFixture & {
  organizationId: string;
  instructorId: string;
  learnerName: string;
};

/**
 * An org-booked appointment the family sees on their dashboard: the learner is an
 * org-owned student (no personal tutor), the instructor teaches it, and the parent
 * has saved privacy preferences (live sessions on), so the ONLY thing that can block
 * entry is the org-side state the test sets: a suspended org, or a removed instructor.
 */
export async function seedOrgBookedFamilyAppointment(opts: {
  accountHolderId: string;
  orgStatus: "active" | "suspended";
  instructorRemoved: boolean;
  startsInMs?: number;
}): Promise<OrgBookedFamilyFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const learnerName = `OrgFam ${suffix.slice(-6)}`;
  try {
    // The family dashboard lists every upcoming appointment for the shared test parent.
    // Drop earlier org-family rows so one scenario's body never carries another's state.
    await prisma.scheduledSession.deleteMany({ where: { subject: ORG_FAMILY_SUBJECT } });
    const instructor = await prisma.adminUser.create({
      data: {
        email: `pw-orgfam-instructor-${suffix}@test.local`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        emailVerifiedAt: new Date("2026-01-01"),
        displayName: "Org Family Instructor",
        isTestAccount: false,
      },
      select: { id: true },
    });
    const org = await prisma.organization.create({
      data: {
        name: `Org ${suffix}`,
        status: opts.orgStatus,
        timezone: "America/Denver",
        statusChangedAt: new Date(),
        createdByOperatorId: "org-operator@example.com",
        members: {
          create: [
            {
              adminUserId: instructor.id,
              roles: ["instructor"],
              removedAt: opts.instructorRemoved ? new Date() : null,
            },
          ],
        },
      },
      select: { id: true },
    });
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: opts.accountHolderId,
        displayName: learnerName,
        isSelfLearner: false,
      },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        name: learnerName,
        adminUserId: null,
        organizationId: org.id,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });
    await prisma.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: null,
        organizationId: org.id,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: opts.accountHolderId,
        captureMethod: "electronic",
      },
    });
    const sched = await seedBridgeScheduledSession({
      adminUserId: instructor.id,
      studentId: student.id,
      learnerProfileId: profile.id,
      accountHolderId: opts.accountHolderId,
      startsInMs: opts.startsInMs ?? 5 * 60_000,
      subject: ORG_FAMILY_SUBJECT,
    });
    return { ...sched, organizationId: org.id, instructorId: instructor.id, learnerName };
  } finally {
    await prisma.$disconnect();
  }
}
