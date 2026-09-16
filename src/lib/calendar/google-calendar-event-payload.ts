import type { calendar_v3 } from "googleapis";

import { buildIcsEventSummary } from "@/lib/calendar/ics-feed";
import { resolveScheduledSessionWallClock } from "@/lib/calendar/scheduled-session-datetime";

export const SCHEDULED_SESSION_ICS_DOMAIN = "usemynk.com";

export function scheduledSessionIcalUid(sessionId: string): string {
  return `${sessionId}@${SCHEDULED_SESSION_ICS_DOMAIN}`;
}

export type GoogleEventSessionInput = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  subject: string;
  notes: string;
  location: string;
  student: {
    name: string;
    icsShowFullName: boolean;
  };
};

function icsLocalToGoogleDateTime(icsLocal: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(icsLocal);
  if (!m) {
    throw new Error(`Invalid ICS local datetime: ${icsLocal}`);
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

/** Pure builder — shared oracle for ICS + Google wall-clock tests (B1). */
export function buildScheduledSessionGoogleEventResource(
  session: GoogleEventSessionInput,
  adminTimezone: string | null | undefined
): calendar_v3.Schema$Event {
  const wall = resolveScheduledSessionWallClock(
    session.date,
    session.startTime,
    session.endTime,
    null,
    adminTimezone
  );
  const summary = buildIcsEventSummary(session.student);
  const descriptionParts: string[] = [];
  const subject = session.subject.trim();
  if (subject) {
    descriptionParts.push(`Subject: ${subject}`);
  }
  const notes = session.notes.trim();
  if (notes) {
    descriptionParts.push(notes);
  }
  const description = descriptionParts.join("\n\n");

  const resource: calendar_v3.Schema$Event = {
    summary,
    iCalUID: scheduledSessionIcalUid(session.id),
    start: {
      dateTime: icsLocalToGoogleDateTime(wall.startIcsLocal),
      timeZone: wall.timeZone,
    },
    end: {
      dateTime: icsLocalToGoogleDateTime(wall.endIcsLocal),
      timeZone: wall.timeZone,
    },
  };
  const location = session.location.trim();
  if (location) {
    resource.location = location;
  }
  if (description) {
    resource.description = description;
  }
  return resource;
}
