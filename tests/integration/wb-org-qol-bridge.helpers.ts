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
