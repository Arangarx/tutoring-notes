"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { parseDateOnlyInput } from "@/lib/date-only";
import { seedTutorTimezoneIfUnset } from "@/lib/billing/seed-tutor-timezone";
import { DEFAULT_TUTOR_TIMEZONE } from "@/lib/billing/defaults";
import { getGoogleCalendarConnectionForTutor } from "@/lib/calendar-oauth";
import { utcBoundsFromWallClock } from "@/lib/calendar/scheduled-session-datetime";
import { scheduledSessionsOverlap } from "@/lib/calendar/scheduled-session-overlap";
import {
  activeOrgInstructorMemberWhere,
  orgAppointmentListScope,
  orgLearnerFilterForViewer,
  STAFF_HOME_ROLES,
} from "@/lib/org-appointment-scope";
import { assertOrgRole, orgInstructorAdmitted, orgLog } from "@/lib/org-scope";
import {
  afterScheduledSessionCreated,
  afterScheduledSessionUpdated,
  beforeScheduledSessionDeleted,
} from "@/lib/calendar/google-calendar-write";
import { db, withDbRetry } from "@/lib/db";
import type { GoogleCalendarUiState } from "@/lib/schedule/google-calendar-ui-state";
import { sessionSpanMinutes } from "@/lib/schedule/planned-end-time";
import { toScheduledSessionView } from "@/lib/schedule/scheduled-session-mapper";
import type { ScheduleStudentOption, ScheduledSessionView } from "@/lib/schedule/types";
import { isOrgOwnedStudent, tutorAppointmentsWhere } from "@/lib/scheduling/tutor-appointments";
import type { SessionEntryState } from "@/lib/scheduling/session-entry";
import { loadSessionEntryStates } from "@/lib/scheduling/session-entry-loader";
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
  /** Org booking only. The appointment's tutor, not the scheduler. */
  instructorAdminUserId?: string;
};

const ORG_INSTRUCTOR_REFUSAL = "That instructor cannot take this appointment.";

export type ScheduledSessionWriteResult = {
  id: string;
  adminUserId: string;
  overlapWarning: string | null;
  refusal?: string;
};

function parseScheduledSessionInput(input: ScheduledSessionInput) {
  const date = parseDateOnlyInput(input.date);
  if (!date) return null;
  const subject = input.subject.trim();
  if (!subject) return null;
  // An end clock before the start crosses midnight (utcBoundsFromWallClock
  // puts the end on the next day). Null is malformed; 0 is zero-length.
  if (!sessionSpanMinutes(input.startTime, input.endTime)) return null;
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

function utcFieldsForZone(
  parsed: { date: Date; startTime: string; endTime: string },
  timeZone: string
) {
  const bounds = utcBoundsFromWallClock(
    parsed.date,
    parsed.startTime,
    parsed.endTime,
    null,
    timeZone
  );
  return { startAt: bounds.startAt, endAt: bounds.endAt };
}

async function overlapWarningFor(
  adminUserId: string,
  startAt: Date,
  endAt: Date,
  excludeId?: string
): Promise<string | null> {
  const others = await db.scheduledSession.findMany({
    where: {
      adminUserId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startAt: { not: null },
      endAt: { not: null },
    },
    select: { startAt: true, endAt: true },
  });
  const overlaps = others.some(
    (row) =>
      row.startAt != null &&
      row.endAt != null &&
      scheduledSessionsOverlap({ startAt, endAt }, { startAt: row.startAt, endAt: row.endAt })
  );
  return overlaps ? "This overlaps another appointment." : null;
}

/**
 * Lists the authenticated tutor's appointments: their own private students, and
 * organization appointments assigned to them while they are an active instructor
 * (`tutorAppointmentsWhere`). Org rows carry `source` and `entry` (the one entry rule's answer).
 * Never selects parent email, brief, consent, or claim fields.
 */
export async function listScheduledSessionsForTutor(
  googleState: GoogleCalendarUiState
): Promise<ScheduledSessionView[]> {
  const scope = await requireAdminScope();
  const [rows, admin] = await Promise.all([
    withDbRetry(
      () =>
        db.scheduledSession.findMany({
          where: tutorAppointmentsWhere(scope.adminId),
          include: {
            student: {
              select: {
                name: true,
                adminUserId: true,
                organizationId: true,
                learnerProfileId: true,
                learnerProfile: { select: { isSelfLearner: true } },
                organization: { select: { id: true, name: true } },
              },
            },
          },
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
  const views = rows.map((row) => toScheduledSessionView(row, googleState, displayTimeZone));
  const orgRows = rows.filter((row) => isOrgOwnedStudent(row.student));
  const orgStates = await loadSessionEntryStates(orgRows);
  const entryById = new Map<string, SessionEntryState>(
    orgRows.map((row, index) => [row.id, orgStates[index] as SessionEntryState])
  );
  return views.map((view) =>
    view.source.kind === "org" ? { ...view, entry: entryById.get(view.id) } : view
  );
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
): Promise<ScheduledSessionWriteResult> {
  const scope = await requireAdminScope();
  const parsed = parseScheduledSessionInput(input);
  if (!parsed) notFound();
  const student = await db.student.findUnique({
    where: { id: input.studentId },
    select: { adminUserId: true, organizationId: true },
  });
  if (!student) notFound();

  let appointmentAdminId = scope.adminId;
  let utc: { startAt: Date; endAt: Date };
  let organizationId: string | null = null;
  if (isOrgOwnedStudent(student)) {
    organizationId = student.organizationId;
    await assertOrgRole(organizationId, STAFF_HOME_ROLES);
    const instructorId = input.instructorAdminUserId;
    if (!instructorId) notFound();
    const admitted = await orgInstructorAdmitted(db, organizationId, instructorId);
    if (!admitted) {
      return {
        id: "",
        adminUserId: instructorId,
        overlapWarning: null,
        refusal: ORG_INSTRUCTOR_REFUSAL,
      };
    }
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    if (!org) notFound();
    appointmentAdminId = instructorId;
    utc = utcFieldsForZone(parsed, org.timezone);
  } else {
    await assertOwnsStudent(input.studentId);
    utc = await utcFieldsForWrite(scope.adminId, parsed, input.clientTimeZone);
  }

  const overlapWarning = await overlapWarningFor(appointmentAdminId, utc.startAt, utc.endAt);
  const row = await withDbRetry(
    () =>
      db.scheduledSession.create({
        data: {
          adminUserId: appointmentAdminId,
          studentId: input.studentId,
          ...parsed,
          ...utc,
        },
      }),
    { label: "createScheduledSession" }
  );

  revalidatePath("/admin/schedule");
  if (organizationId) revalidatePath(`/admin/organization/${organizationId}`);

  const refreshToken = await calendarRefreshTokenForAdmin(appointmentAdminId);
  await afterScheduledSessionCreated(appointmentAdminId, row.id, refreshToken);
  if (organizationId) {
    orgLog(organizationId, "appointment_created", {
      scheduledSessionId: row.id,
      studentId: input.studentId,
      adminUserId: appointmentAdminId,
    });
  }

  return { id: row.id, adminUserId: appointmentAdminId, overlapWarning };
}

export async function updateScheduledSession(
  sessionId: string,
  input: ScheduledSessionInput
): Promise<{ overlapWarning: string | null; refusal?: string }> {
  const parsed = parseScheduledSessionInput(input);
  if (!parsed) notFound();
  const existing = await db.scheduledSession.findUnique({
    where: { id: sessionId },
    select: {
      adminUserId: true,
      studentId: true,
      student: { select: { adminUserId: true, organizationId: true } },
    },
  });
  if (!existing) notFound();

  let appointmentAdminId = existing.adminUserId;
  let utc: { startAt: Date; endAt: Date };
  let organizationId: string | null = null;
  if (isOrgOwnedStudent(existing.student)) {
    organizationId = existing.student.organizationId;
    await assertOrgRole(organizationId, STAFF_HOME_ROLES);
    const nextStudent = await db.student.findUnique({
      where: { id: input.studentId },
      select: { adminUserId: true, organizationId: true },
    });
    if (!nextStudent || !isOrgOwnedStudent(nextStudent) || nextStudent.organizationId !== organizationId) {
      notFound();
    }
    const instructorId = input.instructorAdminUserId;
    if (!instructorId) notFound();
    const admitted = await orgInstructorAdmitted(db, organizationId, instructorId);
    if (!admitted) {
      return { overlapWarning: null, refusal: ORG_INSTRUCTOR_REFUSAL };
    }
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    if (!org) notFound();
    appointmentAdminId = instructorId;
    utc = utcFieldsForZone(parsed, org.timezone);
  } else {
    if (existing.adminUserId !== (await requireAdminScope()).adminId) notFound();
    await assertOwnsStudent(existing.studentId);
    await assertOwnsStudent(input.studentId);
    utc = await utcFieldsForWrite(existing.adminUserId, parsed, input.clientTimeZone);
  }

  const overlapWarning = await overlapWarningFor(
    appointmentAdminId,
    utc.startAt,
    utc.endAt,
    sessionId
  );
  await withDbRetry(
    () =>
      db.scheduledSession.update({
        where: { id: sessionId },
        data: {
          adminUserId: appointmentAdminId,
          studentId: input.studentId,
          ...parsed,
          ...utc,
        },
      }),
    { label: "updateScheduledSession" }
  );

  revalidatePath("/admin/schedule");
  if (organizationId) revalidatePath(`/admin/organization/${organizationId}`);

  const refreshToken = await calendarRefreshTokenForAdmin(appointmentAdminId);
  await afterScheduledSessionUpdated(appointmentAdminId, sessionId, refreshToken);
  if (organizationId) {
    orgLog(organizationId, "appointment_changed", {
      scheduledSessionId: sessionId,
      studentId: input.studentId,
      adminUserId: appointmentAdminId,
    });
  }
  return { overlapWarning };
}

export async function deleteScheduledSession(sessionId: string): Promise<void> {
  const existing = await db.scheduledSession.findUnique({
    where: { id: sessionId },
    select: {
      adminUserId: true,
      studentId: true,
      googleEventId: true,
      student: { select: { adminUserId: true, organizationId: true } },
    },
  });
  if (!existing) notFound();
  let organizationId: string | null = null;
  if (isOrgOwnedStudent(existing.student)) {
    organizationId = existing.student.organizationId;
    await assertOrgRole(organizationId, STAFF_HOME_ROLES);
  } else {
    const owned = await assertOwnsScheduledSession(sessionId);
    existing.adminUserId = owned.adminUserId;
  }
  const refreshToken = await calendarRefreshTokenForAdmin(existing.adminUserId);
  await beforeScheduledSessionDeleted(
    existing.adminUserId,
    sessionId,
    existing.googleEventId,
    refreshToken
  );
  await withDbRetry(
    () => db.scheduledSession.delete({ where: { id: sessionId } }),
    { label: "deleteScheduledSession" }
  );
  revalidatePath("/admin/schedule");
  if (organizationId) {
    revalidatePath(`/admin/organization/${organizationId}`);
    orgLog(organizationId, "appointment_cancelled", {
      scheduledSessionId: sessionId,
      studentId: existing.studentId,
      adminUserId: existing.adminUserId,
    });
  }
}

export type OrganizationAppointmentRow = {
  id: string;
  learnerName: string;
  instructorName: string;
  instructorAdminUserId: string;
  whenLabel: string;
  subject: string;
  availability: "available" | "unavailable";
  /** The one entry rule's answer for opening this appointment's room. */
  entry: SessionEntryState;
  view: ScheduledSessionView;
};

export async function listScheduledSessionsForOrganization(
  organizationId: string,
  learnerId?: string
): Promise<OrganizationAppointmentRow[]> {
  const actor = await assertOrgRole(organizationId, ["owner", "admin", "scheduler", "instructor"]);
  const scope = orgAppointmentListScope(actor.roles);
  const learnerFilter = orgLearnerFilterForViewer(actor.roles, learnerId);
  orgLog(organizationId, "appointment_list", {
    actor: actor.adminId,
    scope,
    learner: learnerFilter ? "requested" : "all",
  });
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true, status: true },
  });
  if (!org) notFound();
  const rows = await db.scheduledSession.findMany({
    where: {
      ...(scope === "instructor" ? { adminUserId: actor.adminId } : {}),
      student: {
        organizationId,
        adminUserId: null,
        ...(learnerFilter ? { id: learnerFilter } : {}),
      },
    },
    orderBy: [{ startAt: "asc" }, { date: "asc" }, { startTime: "asc" }],
    include: {
      student: {
        select: {
          name: true,
          adminUserId: true,
          organizationId: true,
          learnerProfileId: true,
          learnerProfile: { select: { isSelfLearner: true } },
          organization: { select: { id: true, name: true } },
          organizationLearner: { select: { givenName: true, familyName: true } },
        },
      },
      adminUser: { select: { displayName: true, email: true } },
    },
  });
  const googleState: GoogleCalendarUiState = { connected: false, reconnectRequired: false };
  const entryStates = await loadSessionEntryStates(rows);
  return rows.map((row, index) => {
    const learner = row.student.organizationLearner;
    const learnerName = learner
      ? `${learner.givenName.trim()} ${learner.familyName.trim()}`.trim()
      : row.student.name;
    const view = {
      ...toScheduledSessionView(row, googleState, org.timezone),
      instructorAdminUserId: row.adminUserId,
    };
    return {
      id: row.id,
      learnerName,
      instructorName: row.adminUser.displayName?.trim() || row.adminUser.email,
      instructorAdminUserId: row.adminUserId,
      whenLabel: `${view.date} ${view.startTime}–${view.endTime}`,
      subject: row.subject,
      availability: org.status === "active" ? ("available" as const) : ("unavailable" as const),
      entry: entryStates[index] as SessionEntryState,
      view,
    };
  });
}

export async function listOrganizationBookingChoices(organizationId: string): Promise<{
  students: ScheduleStudentOption[];
  instructors: Array<{ id: string; name: string }>;
  timeZone: string;
}> {
  await assertOrgRole(organizationId, STAFF_HOME_ROLES);
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  if (!org) notFound();
  const [learners, members] = await Promise.all([
    db.organizationLearner.findMany({
      where: { organizationId, student: { adminUserId: null } },
      select: { studentId: true, givenName: true, familyName: true },
      orderBy: [{ givenName: "asc" }, { familyName: "asc" }],
    }),
    db.organizationMember.findMany({
      where: { organizationId, ...activeOrgInstructorMemberWhere() },
      select: { adminUser: { select: { id: true, displayName: true, email: true } } },
      orderBy: { adminUser: { displayName: "asc" } },
    }),
  ]);
  return {
    timeZone: org.timezone,
    students: learners.map((learner) => ({
      id: learner.studentId,
      name: `${learner.givenName.trim()} ${learner.familyName.trim()}`.trim(),
    })),
    instructors: members.map((member) => ({
      id: member.adminUser.id,
      name: member.adminUser.displayName?.trim() || member.adminUser.email,
    })),
  };
}
