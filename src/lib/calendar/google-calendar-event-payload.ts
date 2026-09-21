import type { calendar_v3 } from "googleapis";

import { buildIcsEventSummary } from "@/lib/calendar/ics-feed";
import {
  instantToRfc3339Utc,
  instantsForScheduledSession,
} from "@/lib/calendar/scheduled-session-datetime";

export const SCHEDULED_SESSION_ICS_DOMAIN = "usemynk.com";

export function scheduledSessionIcalUid(sessionId: string): string {
  return `${sessionId}@${SCHEDULED_SESSION_ICS_DOMAIN}`;
}

export type GoogleEventSessionInput = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  startAt?: Date | null;
  endAt?: Date | null;
  subject: string;
  notes: string;
  location: string;
  student: {
    name: string;
    icsShowFullName: boolean;
  };
};

/** Pure builder — UTC `dateTime` so Google converts to the viewer's calendar TZ. */
export function buildScheduledSessionGoogleEventResource(
  session: GoogleEventSessionInput,
  adminTimezone: string | null | undefined
): calendar_v3.Schema$Event {
  const wall = instantsForScheduledSession(session, adminTimezone);
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
      dateTime: instantToRfc3339Utc(wall.startInstant),
    },
    end: {
      dateTime: instantToRfc3339Utc(wall.endInstant),
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
