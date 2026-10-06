/**
 * @jest-environment node
 *
 * A session that starts before midnight and ends after it: the end instant
 * is on the next calendar day. Oracle is plain wall-clock arithmetic in UTC
 * (no DST in UTC) plus a fixed-offset zone check.
 */

import { utcBoundsFromWallClock } from "@/lib/calendar/scheduled-session-datetime";

const day = new Date(Date.UTC(2026, 9, 6));

describe("utcBoundsFromWallClock — midnight crossing", () => {
  it("23:30 → 01:00 lasts 90 minutes, ending on the next day", () => {
    const { startAt, endAt } = utcBoundsFromWallClock(day, "23:30", "01:00", "UTC", null);
    expect(startAt.toISOString()).toBe("2026-10-06T23:30:00.000Z");
    expect(endAt.toISOString()).toBe("2026-10-07T01:00:00.000Z");
    expect(endAt.getTime() - startAt.getTime()).toBe(90 * 60_000);
  });

  it("23:00 → 00:00 ends exactly at the next midnight", () => {
    const { startAt, endAt } = utcBoundsFromWallClock(day, "23:00", "00:00", "UTC", null);
    expect(endAt.getTime() - startAt.getTime()).toBe(60 * 60_000);
  });

  it("a same-day session is unchanged", () => {
    const { startAt, endAt } = utcBoundsFromWallClock(day, "15:00", "16:30", "UTC", null);
    expect(endAt.getTime() - startAt.getTime()).toBe(90 * 60_000);
    expect(endAt.toISOString()).toBe("2026-10-06T16:30:00.000Z");
  });

  it("crossing midnight in a tutor zone keeps the end after the start", () => {
    // Asia/Kolkata is a fixed +05:30 zone (no DST).
    const { startAt, endAt } = utcBoundsFromWallClock(day, "23:45", "00:30", "Asia/Kolkata", null);
    expect(startAt.toISOString()).toBe("2026-10-06T18:15:00.000Z");
    expect(endAt.getTime() - startAt.getTime()).toBe(45 * 60_000);
  });
});
