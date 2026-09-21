/**
 * @jest-environment node
 *
 * B1 (ICS side): wall-clock hour in resolved IANA zone via independent parser.
 * B1: ICS parser and Google insert payload share wall-clock policy (DST week).
 */
import { Temporal } from "@js-temporal/polyfill";
import ical from "node-ical";

import { buildIcsCalendarBody } from "@/lib/calendar/ics-feed";
import { buildScheduledSessionGoogleEventResource } from "@/lib/calendar/google-calendar-event-payload";
import {
  formatInstantWallClockInZone,
  resolveScheduledSessionWallClock,
} from "@/lib/calendar/scheduled-session-datetime";
import { parseDateOnlyInput } from "@/lib/date-only";

function parseGoogleDateTimeWallClock(
  dateTime: string,
  timeZone: string
): { hour: number; minute: number } {
  const instant = Temporal.Instant.from(dateTime);
  return formatInstantWallClockInZone(instant, timeZone);
}

function parsedStartWallClock(
  icsBody: string,
  timeZone: string
): { hour: number; minute: number } {
  const parsed = ical.parseICS(icsBody);
  const event = Object.values(parsed).find(
    (e) => e && typeof e === "object" && "type" in e && e.type === "VEVENT"
  ) as ical.VEvent | undefined;
  if (!event?.start) {
    throw new Error("No VEVENT start in feed");
  }
  const start =
    event.start instanceof Date
      ? event.start
      : new Date(event.start as string);
  return formatInstantWallClockInZone(
    Temporal.Instant.from(start.toISOString()),
    timeZone
  );
}

describe("B1 — ICS timezone wall-clock (DST transition week)", () => {
  const timeZone = "America/Denver";

  it("spring-forward week session matches HH:MM in tutor zone (2026-03-08)", () => {
    const date = parseDateOnlyInput("2026-03-08")!;
    const startTime = "10:00";
    const body = buildIcsCalendarBody(
      [
        {
          id: "dst-spring",
          date,
          startTime,
          endTime: "11:00",
          subject: "Calc",
          notes: "",
          location: "",
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          student: { name: "Jordan Smith", icsShowFullName: false },
        },
      ],
      timeZone
    );

    const wall = parsedStartWallClock(body, timeZone);
    expect(wall.hour).toBe(10);
    expect(wall.minute).toBe(0);

    const direct = resolveScheduledSessionWallClock(
      date,
      startTime,
      "11:00",
      null,
      timeZone
    );
    const directWall = formatInstantWallClockInZone(
      direct.startInstant,
      timeZone
    );
    expect(directWall).toEqual(wall);

    const googleResource = buildScheduledSessionGoogleEventResource(
      {
        id: "dst-spring",
        date,
        startTime,
        endTime: "11:00",
        subject: "Calc",
        notes: "",
        location: "",
        student: { name: "Jordan Smith", icsShowFullName: false },
      },
      timeZone
    );
    expect(googleResource.start?.dateTime).toMatch(/Z$/);
    expect(googleResource.start?.timeZone).toBeUndefined();
    expect(googleResource.end?.timeZone).toBeUndefined();
    const googleStartWall = parseGoogleDateTimeWallClock(
      googleResource.start!.dateTime!,
      timeZone
    );
    expect(googleStartWall).toEqual(wall);
  });

  it("fall-back week session matches HH:MM in tutor zone (2026-11-01)", () => {
    const date = parseDateOnlyInput("2026-11-01")!;
    const startTime = "15:30";
    const body = buildIcsCalendarBody(
      [
        {
          id: "dst-fall",
          date,
          startTime,
          endTime: "16:30",
          subject: "Physics",
          notes: "",
          location: "",
          updatedAt: new Date("2026-10-20T00:00:00.000Z"),
          student: { name: "Taylor Jones", icsShowFullName: false },
        },
      ],
      timeZone
    );

    const wall = parsedStartWallClock(body, timeZone);
    expect(wall.hour).toBe(15);
    expect(wall.minute).toBe(30);
  });
});
