/** Visual-only placeholder data for Group F scheduler surface — no DB wiring. */

export type CalendarSyncState = "synced" | "pending" | "not-connected";

export type CalendarProvider = "google" | "apple" | "other";

export type MockCalendarConnection = {
  provider: CalendarProvider;
  label: string;
  connected: boolean;
  accountLabel?: string;
};

export type MockScheduledSession = {
  id: string;
  studentName: string;
  subject: string;
  /** ISO date string (local date portion used for calendar) */
  date: string;
  startTime: string;
  endTime: string;
  /** Soft duration label — planning metadata only */
  durationLabel: string;
  syncState: CalendarSyncState;
  location?: string;
  notes?: string;
};

/** Mock integration state — Google connected, Apple disconnected. */
export const mockCalendarConnections: MockCalendarConnection[] = [
  {
    provider: "google",
    label: "Google Calendar",
    connected: true,
    accountLabel: "tutor@example.com",
  },
  {
    provider: "apple",
    label: "Apple Calendar",
    connected: false,
  },
  {
    provider: "other",
    label: "Other calendar",
    connected: false,
  },
];

export const mockScheduledSessions: MockScheduledSession[] = [
  {
    id: "sess-1",
    studentName: "Aiden K.",
    subject: "Algebra II",
    date: "2026-06-11",
    startTime: "4:00 PM",
    endTime: "5:00 PM",
    durationLabel: "~60 min (soft)",
    syncState: "synced",
    location: "Whiteboard",
    notes: "Review chapter 7 homework",
  },
  {
    id: "sess-2",
    studentName: "Maya R.",
    subject: "SAT Math",
    date: "2026-06-12",
    startTime: "10:00 AM",
    endTime: "11:30 AM",
    durationLabel: "~90 min (soft)",
    syncState: "pending",
    location: "Whiteboard",
  },
  {
    id: "sess-3",
    studentName: "Jordan P.",
    subject: "Chemistry",
    date: "2026-06-12",
    startTime: "3:30 PM",
    endTime: "4:30 PM",
    durationLabel: "~60 min (soft)",
    syncState: "not-connected",
  },
  {
    id: "sess-4",
    studentName: "Aiden K.",
    subject: "Algebra II",
    date: "2026-06-14",
    startTime: "4:00 PM",
    endTime: "5:00 PM",
    durationLabel: "~60 min (soft)",
    syncState: "synced",
    location: "Whiteboard",
  },
  {
    id: "sess-5",
    studentName: "Elena S.",
    subject: "AP Physics",
    date: "2026-06-16",
    startTime: "5:00 PM",
    endTime: "6:00 PM",
    durationLabel: "~60 min (soft)",
    syncState: "synced",
  },
];

export const mockStudentOptions = [
  "Aiden K.",
  "Maya R.",
  "Jordan P.",
  "Elena S.",
] as const;

export function sessionsOnDate(
  sessions: MockScheduledSession[],
  date: Date
): MockScheduledSession[] {
  const key = date.toISOString().slice(0, 10);
  return sessions.filter((s) => s.date === key);
}

export function parseSessionDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function datesWithSessions(sessions: MockScheduledSession[]): Date[] {
  return sessions.map((s) => parseSessionDate(s.date));
}
