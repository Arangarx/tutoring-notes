import { utcBoundsFromWallClock } from "@/lib/calendar/scheduled-session-datetime";
import {
  afterScheduledSessionCreated,
  afterScheduledSessionUpdated,
} from "@/lib/calendar/google-calendar-write";
import { logGcw } from "@/lib/calendar/google-calendar-write-log";
import { db, withDbRetry } from "@/lib/db";
import { resolveTutorTimezone } from "@/lib/billing/defaults";

/** One-time Connect: upcoming sessions only (today forward), not years of history. */
export const UPCOMING_GOOGLE_BACKFILL_LIMIT = 50;

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function loadTutorTimezone(adminUserId: string): Promise<string> {
  const row = await withDbRetry(
    () =>
      db.adminUser.findUnique({
        where: { id: adminUserId },
        select: { tutorTimezone: true },
      }),
    { label: "syncUpcoming.loadTutorTimezone" }
  );
  return resolveTutorTimezone(null, row?.tutorTimezone);
}

/**
 * Recompute UTC instants from DATE+HH:MM in the tutor's current zone.
 * Used on first timezone seed and Connect so naive wall-clock rows match intent.
 */
export async function rewriteUpcomingSessionInstants(
  adminUserId: string,
  timeZone: string,
  opts?: { unsyncedOnly?: boolean }
): Promise<number> {
  const fromDay = startOfUtcDay();
  const rows = await withDbRetry(
    () =>
      db.scheduledSession.findMany({
        where: {
          adminUserId,
          date: { gte: fromDay },
          ...(opts?.unsyncedOnly ? { googleEventId: null } : {}),
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: UPCOMING_GOOGLE_BACKFILL_LIMIT,
        select: { id: true, date: true, startTime: true, endTime: true },
      }),
    { label: "rewriteUpcomingSessionInstants.list" }
  );

  for (const row of rows) {
    const bounds = utcBoundsFromWallClock(
      row.date,
      row.startTime,
      row.endTime,
      null,
      timeZone
    );
    await withDbRetry(
      () =>
        db.scheduledSession.update({
          where: { id: row.id },
          data: { startAt: bounds.startAt, endAt: bounds.endAt },
        }),
      { label: "rewriteUpcomingSessionInstants.update" }
    );
  }
  return rows.length;
}

/**
 * After Google Calendar Connect: insert unsynced upcoming sessions and patch
 * already-synced upcoming ones (UTC instants + current event titles). Fail-soft.
 */
export async function syncUpcomingUnsyncedScheduledSessions(
  adminUserId: string,
  refreshToken: string
): Promise<{ attempted: number }> {
  const timeZone = await loadTutorTimezone(adminUserId);
  await rewriteUpcomingSessionInstants(adminUserId, timeZone);

  const fromDay = startOfUtcDay();
  const rows = await withDbRetry(
    () =>
      db.scheduledSession.findMany({
        where: { adminUserId, date: { gte: fromDay } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: UPCOMING_GOOGLE_BACKFILL_LIMIT,
        select: { id: true, googleEventId: true },
      }),
    { label: "syncUpcomingUnsyncedScheduledSessions.list" }
  );

  logGcw({
    adminUserId,
    sessionId: "connect_backfill",
    action: "connect_backfill",
    detail: `attempted=${rows.length}`,
  });

  for (const row of rows) {
    try {
      if (row.googleEventId) {
        await afterScheduledSessionUpdated(adminUserId, row.id, refreshToken);
      } else {
        await afterScheduledSessionCreated(adminUserId, row.id, refreshToken);
      }
    } catch {
      // fail-soft per session
    }
  }
  return { attempted: rows.length };
}

/** Fail-soft Google title/time patch after the per-student full-name toggle. */
export async function afterStudentCalendarTitlePolicyChanged(
  studentId: string
): Promise<void> {
  try {
    const student = await withDbRetry(
      () =>
        db.student.findUnique({
          where: { id: studentId },
          select: { adminUserId: true },
        }),
      { label: "afterStudentCalendarTitlePolicyChanged.student" }
    );
    if (!student) return;

    const conn = await withDbRetry(
      () =>
        db.oAuthCalendarConnection.findFirst({
          where: { provider: "google", adminUserId: student.adminUserId },
          select: { refreshToken: true, reconnectRequiredAt: true },
        }),
      { label: "afterStudentCalendarTitlePolicyChanged.conn" }
    );
    if (!conn?.refreshToken || conn.reconnectRequiredAt) return;

    const fromDay = startOfUtcDay();
    const rows = await withDbRetry(
      () =>
        db.scheduledSession.findMany({
          where: {
            studentId,
            googleEventId: { not: null },
            date: { gte: fromDay },
          },
          select: { id: true },
          take: UPCOMING_GOOGLE_BACKFILL_LIMIT,
        }),
      { label: "afterStudentCalendarTitlePolicyChanged.list" }
    );

    for (const row of rows) {
      await afterScheduledSessionUpdated(student.adminUserId, row.id, conn.refreshToken);
    }
  } catch {
    // fail-soft — toggle already persisted
  }
}
