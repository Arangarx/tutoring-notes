/**
 * @jest-environment node
 */
import { Temporal } from "@js-temporal/polyfill";

import { GOOGLE_CALENDAR_DISCONNECTED } from "@/lib/schedule/google-calendar-ui-state";
import { toScheduledSessionView } from "@/lib/schedule/scheduled-session-mapper";
import type { ScheduledSession, Student } from "@prisma/client";

describe("toScheduledSessionView UTC display", () => {
  it("formats startAt in the tutor display zone, not denormalized HH:MM", () => {
    const startAt = new Date("2026-12-15T18:00:00.000Z");
    const endAt = new Date("2026-12-15T19:00:00.000Z");
    const pacific = Temporal.Instant.from(startAt.toISOString()).toZonedDateTimeISO(
      "America/Los_Angeles"
    );
    expect(pacific.hour).toBe(10);

    const row = {
      id: "sess-utc",
      adminUserId: "admin-1",
      studentId: "stu-1",
      date: new Date("2026-12-15T00:00:00.000Z"),
      startTime: "16:00",
      endTime: "17:00",
      startAt,
      endAt,
      plannedDurationMinutes: 60,
      subject: "Algebra",
      notes: "",
      location: "",
      googleEventId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      student: { name: "Jordan Test" } satisfies Pick<Student, "name">,
    } as ScheduledSession & { student: Pick<Student, "name"> };

    const view = toScheduledSessionView(
      row,
      GOOGLE_CALENDAR_DISCONNECTED,
      "America/Los_Angeles"
    );
    expect(view.startTimeInput).toBe("10:00");
    expect(view.endTimeInput).toBe("11:00");
    expect(view.date).toBe("2026-12-15");
  });
});
