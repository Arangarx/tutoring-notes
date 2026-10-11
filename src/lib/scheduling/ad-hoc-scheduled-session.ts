/**
 * Ad-hoc whiteboard starts for a personal student become one ScheduledSession
 * so the existing parent and child upcoming lists show them. Booking's Google
 * write, invite email, and list query stay on the schedule action.
 *
 * SERVER-ONLY.
 */

import { parseDateOnlyInput } from "@/lib/date-only";
import { resolveTutorTimezone } from "@/lib/billing/defaults";
import { seedTutorTimezoneIfUnset } from "@/lib/billing/seed-tutor-timezone";
import {
  formatInstantWallClockFields,
  utcBoundsFromWallClock,
} from "@/lib/calendar/scheduled-session-datetime";
import { db, withDbRetry } from "@/lib/db";

/** Same soft length the schedule dialog uses when the tutor does not change it. */
const AD_HOC_PLANNED_MINUTES = 60;

/**
 * Students do not store a subject, and a new booking does not copy one.
 * Plain sentence shown on the parent and child upcoming rows.
 */
export const AD_HOC_SESSION_SUBJECT = "Tutoring session.";

export async function ensureAdHocScheduledSession(input: {
  adminUserId: string;
  studentId: string;
  /** This start is already linked. Do not insert another appointment. */
  scheduledSessionId?: string | null;
}): Promise<string | null> {
  if (input.scheduledSessionId) return input.scheduledSessionId;

  const student = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: input.studentId },
        select: { adminUserId: true, organizationId: true },
      }),
    { label: "ensureAdHocScheduledSession.student" }
  );
  // Organization-owned learners stay on the existing start path. No org booking.
  if (
    !student ||
    student.organizationId != null ||
    student.adminUserId !== input.adminUserId
  ) {
    return null;
  }

  const seeded = await seedTutorTimezoneIfUnset(input.adminUserId, null);
  const timeZone = resolveTutorTimezone(null, seeded.timeZone);
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + AD_HOC_PLANNED_MINUTES * 60_000);
  const startWall = formatInstantWallClockFields(startAt, timeZone);
  const endWall = formatInstantWallClockFields(endAt, timeZone);
  const date = parseDateOnlyInput(startWall.date);
  if (!date) {
    throw new Error("Could not resolve the ad-hoc session date.");
  }
  // Same converter booking uses for DATE + HH:MM. Sub-minute precision stays
  // on the captured instants so the row is listed at the true start.
  const bounds = utcBoundsFromWallClock(
    date,
    startWall.hhmm,
    endWall.hhmm,
    null,
    timeZone
  );
  if (
    Math.abs(bounds.startAt.getTime() - startAt.getTime()) >= 60_000 ||
    Math.abs(bounds.endAt.getTime() - endAt.getTime()) >= 60_000
  ) {
    throw new Error("Ad-hoc wall clock does not match the session instants.");
  }

  const row = await withDbRetry(
    () =>
      db.scheduledSession.create({
        data: {
          adminUserId: input.adminUserId,
          studentId: input.studentId,
          date,
          startTime: startWall.hhmm,
          endTime: endWall.hhmm,
          plannedDurationMinutes: AD_HOC_PLANNED_MINUTES,
          subject: AD_HOC_SESSION_SUBJECT,
          notes: "",
          startAt,
          endAt,
        },
      }),
    { label: "ensureAdHocScheduledSession.create" }
  );
  console.info(
    `[slc] action=adhoc_scheduled_session scheduledSessionId=${row.id} studentId=${input.studentId}`
  );
  return row.id;
}
