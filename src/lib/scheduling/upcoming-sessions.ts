/**
 * Upcoming scheduled appointments — shared read paths for tutor student detail
 * and family dashboards. Join-window eligibility uses `isWithinJoinWindow` only.
 *
 * SERVER-ONLY.
 */

import { db, withDbRetry } from "@/lib/db";
import { isWithinJoinWindow } from "@/lib/scheduling/join-window";

export type UpcomingScheduledSessionRow = {
  id: string;
  startAt: Date;
  endAt: Date;
  subject: string;
  studentId: string;
  learnerDisplayName: string | null;
  joinWindowOpen: boolean;
};

const upcomingSelect = {
  id: true,
  startAt: true,
  endAt: true,
  subject: true,
  studentId: true,
  student: {
    select: {
      name: true,
      learnerProfile: { select: { displayName: true } },
    },
  },
} as const;

function toRow(
  row: {
    id: string;
    startAt: Date | null;
    endAt: Date | null;
    subject: string;
    studentId: string;
    student: {
      name: string;
      learnerProfile: { displayName: string } | null;
    };
  },
  now: Date
): UpcomingScheduledSessionRow | null {
  if (!row.startAt || !row.endAt) return null;
  if (row.endAt.getTime() <= now.getTime()) return null;
  return {
    id: row.id,
    startAt: row.startAt,
    endAt: row.endAt,
    subject: row.subject,
    studentId: row.studentId,
    learnerDisplayName:
      row.student.learnerProfile?.displayName?.trim() || row.student.name,
    joinWindowOpen: isWithinJoinWindow(
      { startAt: row.startAt, endAt: row.endAt },
      now
    ),
  };
}

/** Tutor student detail — future appointments for one student. */
export async function listUpcomingForStudent(
  adminUserId: string,
  studentId: string,
  now: Date = new Date()
): Promise<UpcomingScheduledSessionRow[]> {
  const rows = await withDbRetry(
    () =>
      db.scheduledSession.findMany({
        where: {
          adminUserId,
          studentId,
          endAt: { gt: now },
        },
        orderBy: { startAt: "asc" },
        select: upcomingSelect,
      }),
    { label: "listUpcomingForStudent" }
  );
  return rows
    .map((r) => toRow(r, now))
    .filter((r): r is UpcomingScheduledSessionRow => r !== null);
}

/** Family dashboards — appointments for learners this account can act for. */
export async function listUpcomingForLearnerProfiles(
  learnerProfileIds: string[],
  now: Date = new Date()
): Promise<UpcomingScheduledSessionRow[]> {
  if (learnerProfileIds.length === 0) return [];
  const rows = await withDbRetry(
    () =>
      db.scheduledSession.findMany({
        where: {
          endAt: { gt: now },
          student: {
            learnerProfileId: { in: learnerProfileIds },
            learnerProfile: { tombstonedAt: null },
          },
        },
        orderBy: { startAt: "asc" },
        select: upcomingSelect,
      }),
    { label: "listUpcomingForLearnerProfiles" }
  );
  return rows
    .map((r) => toRow(r, now))
    .filter((r): r is UpcomingScheduledSessionRow => r !== null);
}
