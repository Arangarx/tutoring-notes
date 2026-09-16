import { Temporal } from "@js-temporal/polyfill";

import {
  instantToIcsUtcStamp,
  resolveScheduledSessionWallClock,
} from "@/lib/calendar/scheduled-session-datetime";

export type IcsFeedSessionInput = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  subject: string;
  notes: string;
  location: string;
  updatedAt: Date;
  student: {
    name: string;
    icsShowFullName: boolean;
  };
};

const ICS_DOMAIN = "usemynk.com";
const PRODID = "-//Mortensen Apps//Tutoring Notes//EN";

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
}

function foldIcsLine(line: string): string {
  const utf8 = Buffer.from(line, "utf8");
  if (utf8.length <= 75) {
    return line;
  }
  const chunks: string[] = [];
  let offset = 0;
  while (offset < utf8.length) {
    let end = Math.min(offset + 75, utf8.length);
    while (end > offset && (utf8[end]! & 0xc0) === 0x80) {
      end -= 1;
    }
    if (end === offset) {
      end = Math.min(offset + 75, utf8.length);
    }
    chunks.push(Buffer.from(utf8.subarray(offset, end)).toString("utf8"));
    offset = end;
  }
  return chunks.join("\r\n ");
}

function buildSummary(student: IcsFeedSessionInput["student"]): string {
  if (student.icsShowFullName) {
    return student.name.trim();
  }
  const first = student.name.trim().split(/\s+/)[0] ?? student.name.trim();
  return `Tutoring — ${first}`;
}

/** Shared ICS + Google Calendar event title (B6 / WS2). */
export function buildIcsEventSummary(student: {
  name: string;
  icsShowFullName: boolean;
}): string {
  return buildSummary(student);
}

function buildDescription(session: IcsFeedSessionInput): string {
  const parts: string[] = [];
  const subject = session.subject.trim();
  if (subject) {
    parts.push(`Subject: ${subject}`);
  }
  const notes = session.notes.trim();
  if (notes) {
    parts.push(notes);
  }
  return parts.join("\\n\\n");
}

function buildVevent(
  session: IcsFeedSessionInput,
  adminTimezone: string | null | undefined
): string[] {
  const wall = resolveScheduledSessionWallClock(
    session.date,
    session.startTime,
    session.endTime,
    null,
    adminTimezone
  );
  const uid = `${session.id}@${ICS_DOMAIN}`;
  const dtstamp = instantToIcsUtcStamp(
    Temporal.Instant.from(session.updatedAt.toISOString())
  );

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${wall.timeZone}:${wall.startIcsLocal}`,
    `DTEND;TZID=${wall.timeZone}:${wall.endIcsLocal}`,
    `SUMMARY:${escapeIcsText(buildSummary(session.student))}`,
  ];

  const description = buildDescription(session);
  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  const location = session.location.trim();
  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }

  lines.push("END:VEVENT");
  return lines.map(foldIcsLine);
}

/** Pure ICS builder — no database access. */
export function buildIcsCalendarBody(
  sessions: IcsFeedSessionInput[],
  adminTimezone: string | null | undefined
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const session of sessions) {
    lines.push(...buildVevent(session, adminTimezone));
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
