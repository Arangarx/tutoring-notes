/**
 * Upcoming scheduled appointments — shared read paths for tutor student detail
 * and family dashboards. The join window uses `isWithinJoinWindow`.
 * `entry` is the one entry rule (`sessionEntryState`): whether, and in which
 * mode, the room can be opened for this appointment.
 *
 * SERVER-ONLY.
 */

import { db, withDbRetry } from "@/lib/db";
import { isWithinJoinWindow } from "@/lib/scheduling/join-window";
import { familySafeEntryState, type SessionEntryState } from "@/lib/scheduling/session-entry";
import { loadSessionEntryStates } from "@/lib/scheduling/session-entry-loader";

export type UpcomingScheduledSessionRow = {
  id: string;
  startAt: Date;
  endAt: Date;
  subject: string;
  studentId: string;
  learnerDisplayName: string | null;
  joinWindowOpen: boolean;
  /** Whether the room can be opened, online and in person, and why not. */
  entry: SessionEntryState;
};

const upcomingSelect = {
  id: true,
  startAt: true,
  endAt: true,
  subject: true,
  studentId: true,
  adminUserId: true,
  student: {
    select: {
      name: true,
      adminUserId: true,
      organizationId: true,
      learnerProfileId: true,
      learnerProfile: { select: { displayName: true, isSelfLearner: true } },
    },
  },
} as const;

type UpcomingSource = {
  id: string;
  startAt: Date | null;
  endAt: Date | null;
  subject: string;
  studentId: string;
  adminUserId: string;
  student: {
    name: string;
    adminUserId: string | null;
    organizationId: string | null;
    learnerProfileId: string | null;
    learnerProfile: { displayName: string; isSelfLearner: boolean } | null;
  };
};

function toRow(
  row: UpcomingSource,
  now: Date
): Omit<UpcomingScheduledSessionRow, "entry"> | null {
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

/**
 * Attach the entry state to each kept row. For the family audience the reasons are
 * collapsed HERE, on the server, before the rows become component props (RSC payload):
 * a family never receives org-internal state (suspended org, removed instructor) or
 * tutor-only codes, only the codes `familySafeReason` allows.
 */
async function withEntry(
  sources: UpcomingSource[],
  now: Date,
  audience: "tutor" | "family"
): Promise<UpcomingScheduledSessionRow[]> {
  const kept = sources.flatMap((source) => {
    const row = toRow(source, now);
    return row ? [{ source, row }] : [];
  });
  const states = await loadSessionEntryStates(kept.map(({ source }) => source));
  return kept.map(({ row }, index) => {
    const state = states[index] as SessionEntryState;
    return { ...row, entry: audience === "family" ? familySafeEntryState(state) : state };
  });
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
  return withEntry(rows, now, "tutor");
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
  return withEntry(rows, now, "family");
}
