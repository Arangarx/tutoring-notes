import type { ScheduledSession, Student } from "@prisma/client";
import { isOrgOwnedStudent } from "@/lib/scheduling/tutor-appointments";
import { formatInstantWallClockFields } from "@/lib/calendar/scheduled-session-datetime";
import { formatDateOnlyInput } from "@/lib/date-only";
import type { GoogleCalendarUiState } from "@/lib/schedule/google-calendar-ui-state";
import type {
  CalendarSyncState,
  ScheduledSessionSource,
  ScheduledSessionView,
} from "@/lib/schedule/types";
import { durationLabelForMinutes, formatTimeDisplay } from "@/lib/schedule/time-format";

type ScheduledSessionRow = ScheduledSession & {
  student: Pick<Student, "name" | "adminUserId" | "organizationId"> & {
    organization: { id: string; name: string } | null;
  };
};

function resolveSource(student: ScheduledSessionRow["student"]): ScheduledSessionSource {
  if (!isOrgOwnedStudent(student)) return { kind: "personal" };
  return {
    kind: "org",
    organizationId: student.organizationId,
    organizationName: student.organization?.name ?? "",
  };
}

export function resolveSyncPresentation(
  googleState: GoogleCalendarUiState,
  googleEventId: string | null
): Pick<ScheduledSessionView, "showSyncBadge" | "syncState"> {
  if (googleState.reconnectRequired) {
    return { showSyncBadge: true, syncState: "needs-reconnect" };
  }
  if (googleEventId) {
    return { showSyncBadge: true, syncState: "synced" };
  }
  if (googleState.connected) {
    return { showSyncBadge: true, syncState: "pending" };
  }
  return { showSyncBadge: false, syncState: "not-connected" };
}

export function toScheduledSessionView(
  row: ScheduledSessionRow,
  googleState: GoogleCalendarUiState,
  displayTimeZone: string
): ScheduledSessionView {
  const sync = resolveSyncPresentation(googleState, row.googleEventId);
  const startFields = row.startAt
    ? formatInstantWallClockFields(row.startAt, displayTimeZone)
    : { date: formatDateOnlyInput(row.date), hhmm: row.startTime };
  const endFields = row.endAt
    ? formatInstantWallClockFields(row.endAt, displayTimeZone)
    : { date: formatDateOnlyInput(row.date), hhmm: row.endTime };
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.name,
    subject: row.subject,
    date: startFields.date,
    startTime: formatTimeDisplay(startFields.hhmm),
    endTime: formatTimeDisplay(endFields.hhmm),
    startTimeInput: startFields.hhmm,
    endTimeInput: endFields.hhmm,
    plannedDurationMinutes: row.plannedDurationMinutes,
    durationLabel: durationLabelForMinutes(row.plannedDurationMinutes),
    showSyncBadge: sync.showSyncBadge,
    syncState: sync.syncState as CalendarSyncState,
    location: row.location || undefined,
    notes: row.notes || undefined,
    source: resolveSource(row.student),
  };
}
