import type { ScheduledSession, Student } from "@prisma/client";
import { formatDateOnlyInput } from "@/lib/date-only";
import type { GoogleCalendarUiState } from "@/lib/schedule/google-calendar-ui-state";
import type { CalendarSyncState, ScheduledSessionView } from "@/lib/schedule/types";
import { durationLabelForMinutes, formatTimeDisplay } from "@/lib/schedule/time-format";

type ScheduledSessionRow = ScheduledSession & {
  student: Pick<Student, "name">;
};

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
  googleState: GoogleCalendarUiState
): ScheduledSessionView {
  const sync = resolveSyncPresentation(googleState, row.googleEventId);
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.name,
    subject: row.subject,
    date: formatDateOnlyInput(row.date),
    startTime: formatTimeDisplay(row.startTime),
    endTime: formatTimeDisplay(row.endTime),
    startTimeInput: row.startTime,
    endTimeInput: row.endTime,
    plannedDurationMinutes: row.plannedDurationMinutes,
    durationLabel: durationLabelForMinutes(row.plannedDurationMinutes),
    showSyncBadge: sync.showSyncBadge,
    syncState: sync.syncState as CalendarSyncState,
    location: row.location || undefined,
    notes: row.notes || undefined,
  };
}
