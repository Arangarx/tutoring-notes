"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { parseDateOnlyInput } from "@/lib/date-only";
import { seedTutorTimezoneIfUnset } from "@/lib/billing/seed-tutor-timezone";
import { DEFAULT_TUTOR_TIMEZONE } from "@/lib/billing/defaults";
import { getGoogleCalendarConnectionForTutor } from "@/lib/calendar-oauth";
import { utcBoundsFromWallClock } from "@/lib/calendar/scheduled-session-datetime";
import {
  afterScheduledSessionCreated,
  afterScheduledSessionUpdated,
  beforeScheduledSessionDeleted,
} from "@/lib/calendar/google-calendar-write";
import { db, withDbRetry } from "@/lib/db";
import type { GoogleCalendarUiState } from "@/lib/schedule/google-calendar-ui-state";
import { toScheduledSessionView } from "@/lib/schedule/scheduled-session-mapper";
import type { ScheduleStudentOption, ScheduledSessionView } from "@/lib/schedule/types";
import {
  assertOwnsStudent,
  requireStudentScope,
  studentsWhereForScope,
} from "@/lib/student-scope";

export type ScheduledSessionInput = {
  studentId: string;
  date: string;
  startTime: string;
  endTime: string;
  plannedDurationMinutes: number;
  subject: string;
  notes?: string;
  /** Browser IANA zone — seeds AdminUser.tutorTimezone when still unset. */
  clientTimeZone?: string | null;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseScheduledSessionInput(input: ScheduledSessionInput) {
  const date = parseDateOnlyInput(input.date);
  if (!date) return null;
  const subject = input.subject.trim();
  if (!subject) return null;
  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) return null;
  const plannedDurationMinutes = Number(input.plannedDurationMinutes);
  if (![45, 60, 90].includes(plannedDurationMinutes)) return null;
  return {
    date,
    subject,
    startTime: input.startTime,
    endTime: input.endTime,
    plannedDurationMinutes,
    notes: input.notes?.trim() ?? "",
  };
}

async function requireAdminScope() {
  const scope = await requireStudentScope();
  if (scope.kind !== "admin") notFound();
  return scope;
}

async function assertOwnsScheduledSession(sessionId: string) {
  const scope = await requireAdminScope();
  const session = await withDbRetry(
    () =>
      db.scheduledSession.findUnique({
        where: { id: sessionId },
        select: { adminUserId: true, studentId: true, googleEventId: true },
      }),
    { label: "assertOwnsScheduledSession" }
  );
  if (!session || session.adminUserId !== scope.adminId) notFound();
  await assertOwnsStudent(session.studentId);
  return session;
}

async function calendarRefreshTokenForAdmin(adminUserId: string): Promise<string | null> {
  const conn = await getGoogleCalendarConnectionForTutor(adminUserId);
  return conn?.refreshToken ?? null;
}

async function utcFieldsForWrite(
  adminUserId: string,
  parsed: { date: Date; startTime: string; endTime: string },
  clientTimeZone?: string | null
) {
  const seeded = await seedTutorTimezoneIfUnset(adminUserId, clientTimeZone);
  const bounds = utcBoundsFromWallClock(
    parsed.date,
    parsed.startTime,
    parsed.endTime,
    null,
    seeded.timeZone
  );
  return { startAt: bounds.startAt, endAt: bounds.endAt };
}

/** Lists sessions for the authenticated tutor only (`adminUserId` = scope.adminId). */
export async function listScheduledSessionsForTutor(
  googleState: GoogleCalendarUiState
): Promise<ScheduledSessionView[]> {
  const scope = await requireAdminScope();
  const [rows, admin] = await Promise.all([
    withDbRetry(
      () =>
        db.scheduledSession.findMany({
          where: { adminUserId: scope.adminId },
          include: { student: { select: { name: true } } },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
      { label: "listScheduledSessionsForTutor" }
    ),
    withDbRetry(
      () =>
        db.adminUser.findUnique({
          where: { id: scope.adminId },
          select: { tutorTimezone: true },
        }),
      { label: "listScheduledSessionsForTutor.tz" }
    ),
  ]);
  const displayTimeZone = admin?.tutorTimezone ?? DEFAULT_TUTOR_TIMEZONE;
  return rows.map((row) => toScheduledSessionView(row, googleState, displayTimeZone));
}

export async function listScheduleStudentOptions(): Promise<ScheduleStudentOption[]> {
  const scope = await requireStudentScope();
  return withDbRetry(
    () =>
      db.student.findMany({
        where: studentsWhereForScope(scope),
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    { label: "listScheduleStudentOptions" }
  );
}

export async function createScheduledSession(
  input: ScheduledSessionInput
): Promise<{ id: string }> {
  const scope = await requireAdminScope();
  await assertOwnsStudent(input.studentId);
  const parsed = parseScheduledSessionInput(input);
  if (!parsed) notFound();
  const utc = await utcFieldsForWrite(scope.adminId, parsed, input.clientTimeZone);

  const row = await withDbRetry(
    () =>
      db.scheduledSession.create({
        data: {
          adminUserId: scope.adminId,
          studentId: input.studentId,
          ...parsed,
          ...utc,
        },
      }),
    { label: "createScheduledSession" }
  );

  revalidatePath("/admin/schedule");

  const refreshToken = await calendarRefreshTokenForAdmin(scope.adminId);
  await afterScheduledSessionCreated(scope.adminId, row.id, refreshToken);

  return { id: row.id };
}

export async function updateScheduledSession(
  sessionId: string,
  input: ScheduledSessionInput
): Promise<void> {
  const owned = await assertOwnsScheduledSession(sessionId);
  await assertOwnsStudent(input.studentId);
  const parsed = parseScheduledSessionInput(input);
  if (!parsed) notFound();
  const utc = await utcFieldsForWrite(owned.adminUserId, parsed, input.clientTimeZone);

  await withDbRetry(
    () =>
      db.scheduledSession.update({
        where: { id: sessionId },
        data: {
          studentId: input.studentId,
          ...parsed,
          ...utc,
        },
      }),
    { label: "updateScheduledSession" }
  );

  revalidatePath("/admin/schedule");

  const refreshToken = await calendarRefreshTokenForAdmin(owned.adminUserId);
  await afterScheduledSessionUpdated(owned.adminUserId, sessionId, refreshToken);
}

export async function deleteScheduledSession(sessionId: string): Promise<void> {
  const owned = await assertOwnsScheduledSession(sessionId);
  const refreshToken = await calendarRefreshTokenForAdmin(owned.adminUserId);
  await beforeScheduledSessionDeleted(
    owned.adminUserId,
    sessionId,
    owned.googleEventId,
    refreshToken
  );
  await withDbRetry(
    () => db.scheduledSession.delete({ where: { id: sessionId } }),
    { label: "deleteScheduledSession" }
  );
  revalidatePath("/admin/schedule");
}
