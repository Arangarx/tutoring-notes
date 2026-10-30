/** Calendar integration panel row — real Google state + static placeholders. */
export type CalendarProvider = "google" | "apple" | "other";

export type CalendarConnectionView = {
  provider: CalendarProvider;
  label: string;
  connected: boolean;
  accountLabel?: string;
};

/** Honest sync badge states for scheduled sessions. */
export type CalendarSyncState =
  | "synced"
  | "pending"
  | "needs-reconnect"
  | "not-connected";

export type ScheduleStudentOption = {
  id: string;
  name: string;
};

/** Where a scheduled session comes from: the tutor's own student, or an organization's learner. */
export type ScheduledSessionSource =
  | { kind: "personal" }
  | { kind: "org"; organizationId: string; organizationName: string };

/** Client-facing scheduled session row for schedule views. */
export type ScheduledSessionView = {
  id: string;
  studentId: string;
  studentName: string;
  subject: string;
  /** YYYY-MM-DD for calendar matching and form defaults. */
  date: string;
  startTime: string;
  endTime: string;
  durationLabel: string;
  /** When false, SessionSyncBadge is not rendered (Google not connected). */
  showSyncBadge: boolean;
  syncState: CalendarSyncState;
  location?: string;
  notes?: string;
  /** Raw HH:MM for edit form round-trip. */
  startTimeInput: string;
  endTimeInput: string;
  plannedDurationMinutes: number;
  /** Set on organization appointments. Absent on the personal tutor schedule. */
  instructorAdminUserId?: string;
  /** Always set by the mapper. Org rows are read-only on the tutor Schedule. */
  source: ScheduledSessionSource;
  /**
   * Org rows on the tutor Schedule only: whether consent allows opening the room.
   * Absent on personal rows, which start from the student page.
   */
  liveEntryAllowed?: boolean;
};
