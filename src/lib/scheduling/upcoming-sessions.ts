/**
 * Upcoming scheduled appointments — shared read paths for tutor student detail
 * and family dashboards. The join window uses `isWithinJoinWindow`.
 * `liveEntryAllowed` matches whether the tutor can start a live session.
 *
 * SERVER-ONLY.
 */

import { resolveEffectiveConsentForStudent } from "@/lib/consent-scope";
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
  /** True only when the tutor can start a live session for this appointment. */
  liveEntryAllowed: boolean;
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
      learnerProfile: { select: { displayName: true } },
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
    learnerProfile: { displayName: string } | null;
  };
};

function toRow(row: UpcomingSource, now: Date): UpcomingScheduledSessionRow | null {
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
    liveEntryAllowed: false,
  };
}

async function appointmentLiveEntryAllowed(input: {
  learnerProfileId: string | null;
  studentAdminUserId: string | null;
  organizationId: string | null;
  appointmentAdminUserId: string;
}): Promise<boolean> {
  if (!input.learnerProfileId) return false;
  const effective = await resolveEffectiveConsentForStudent(
    input.learnerProfileId,
    {
      adminUserId: input.studentAdminUserId,
      organizationId: input.organizationId,
    },
    input.appointmentAdminUserId,
    undefined,
    "appointmentLiveEntry"
  );
  return effective?.allowLiveSession === true;
}

/** The fields `liveEntryAllowedBatch` needs from an appointment row. */
export type LiveEntrySource = {
  studentId: string;
  adminUserId: string;
  student: {
    adminUserId: string | null;
    organizationId: string | null;
    learnerProfileId: string | null;
  };
};

/**
 * Whether each appointment's tutor may open a live session, in input order.
 * One consent lookup per (student, tutor) pair, however many rows share it.
 * The one place that decides `liveEntryAllowed` for a list of appointments.
 */
export async function liveEntryAllowedBatch(
  sources: readonly LiveEntrySource[]
): Promise<boolean[]> {
  const cache = new Map<string, Promise<boolean>>();
  const flags = await Promise.all(
    sources.map((source) => {
      const key = `${source.studentId}:${source.adminUserId}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = appointmentLiveEntryAllowed({
          learnerProfileId: source.student.learnerProfileId,
          studentAdminUserId: source.student.adminUserId,
          organizationId: source.student.organizationId,
          appointmentAdminUserId: source.adminUserId,
        });
        cache.set(key, pending);
      }
      return pending;
    })
  );
  return flags.map((flag) => flag === true);
}

async function withLiveEntry(
  sources: UpcomingSource[],
  now: Date
): Promise<UpcomingScheduledSessionRow[]> {
  const kept = sources.flatMap((source) => {
    const row = toRow(source, now);
    return row ? [{ source, row }] : [];
  });
  const flags = await liveEntryAllowedBatch(kept.map(({ source }) => source));
  return kept.map(({ row }, index) => ({
    ...row,
    liveEntryAllowed: flags[index] === true,
  }));
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
  return withLiveEntry(rows, now);
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
  return withLiveEntry(rows, now);
}
