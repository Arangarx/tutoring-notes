/**
 * Wall-clock session times (DATE + HH:MM) in a resolved IANA zone.
 * Shared by ICS feed (WS1) and Google Calendar insert payloads (WS2).
 */

import { Temporal } from "@js-temporal/polyfill";

import { resolveTutorTimezone } from "@/lib/billing/defaults";
import { formatDateOnlyInput } from "@/lib/date-only";

export type ResolvedSessionWallClock = {
  timeZone: string;
  /** ICS local form `YYYYMMDDTHHMMSS` (use with TZID=). */
  startIcsLocal: string;
  endIcsLocal: string;
  /** UTC instants for API clients (Google `dateTime` + `timeZone`). */
  startInstant: Temporal.Instant;
  endInstant: Temporal.Instant;
};

function hhmmToPlainTime(hhmm: string): Temporal.PlainTime {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) {
    throw new Error(`Invalid HH:MM: ${hhmm}`);
  }
  return Temporal.PlainTime.from({
    hour: Number(m[1]),
    minute: Number(m[2]),
    second: 0,
  });
}

function plainDateTimeToIcsLocal(pdt: Temporal.PlainDateTime): string {
  const y = String(pdt.year).padStart(4, "0");
  const mo = String(pdt.month).padStart(2, "0");
  const d = String(pdt.day).padStart(2, "0");
  const h = String(pdt.hour).padStart(2, "0");
  const mi = String(pdt.minute).padStart(2, "0");
  const s = String(pdt.second).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}`;
}

/**
 * Combine a Postgres DATE row, local HH:MM strings, and tutor/session timezone policy.
 */
export function resolveScheduledSessionWallClock(
  calendarDate: Date,
  startTime: string,
  endTime: string,
  sessionTimezone: string | null | undefined,
  adminTimezone: string | null | undefined
): ResolvedSessionWallClock {
  const timeZone = resolveTutorTimezone(sessionTimezone, adminTimezone);
  const ymd = formatDateOnlyInput(calendarDate);
  const plainDate = Temporal.PlainDate.from(ymd);

  const startPdt = plainDate.toPlainDateTime(hhmmToPlainTime(startTime));
  const endPdt = plainDate.toPlainDateTime(hhmmToPlainTime(endTime));

  const startZ = startPdt.toZonedDateTime(timeZone);
  const endZ = endPdt.toZonedDateTime(timeZone);

  return {
    timeZone,
    startIcsLocal: plainDateTimeToIcsLocal(startZ.toPlainDateTime()),
    endIcsLocal: plainDateTimeToIcsLocal(endZ.toPlainDateTime()),
    startInstant: startZ.toInstant(),
    endInstant: endZ.toInstant(),
  };
}

/** Format a UTC instant as ICS DTSTAMP (`YYYYMMDDTHHMMSSZ`). */
export function instantToIcsUtcStamp(instant: Temporal.Instant): string {
  const pdt = instant.toZonedDateTimeISO("UTC").toPlainDateTime();
  return `${plainDateTimeToIcsLocal(pdt)}Z`;
}

/** Oracle helper: wall-clock hour/minute in a zone for a UTC instant. */
export function formatInstantWallClockInZone(
  instant: Temporal.Instant,
  timeZone: string
): { hour: number; minute: number } {
  const pdt = instant.toZonedDateTimeISO(timeZone).toPlainDateTime();
  return { hour: pdt.hour, minute: pdt.minute };
}
