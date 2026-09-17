/**
 * @jest-environment node
 */
import { db } from "@/lib/db";
import { uniq } from "../helpers/unique-test-token";
import { syncUpcomingUnsyncedScheduledSessions } from "@/lib/calendar/google-calendar-connect-backfill";
import {
  setGoogleCalendarSyncDepsForTests,
  type GoogleCalendarWriteClient,
} from "@/lib/calendar/google-calendar-write";

describe("syncUpcomingUnsyncedScheduledSessions", () => {
  afterEach(() => {
    setGoogleCalendarSyncDepsForTests(null);
  });

  it("inserts upcoming unsynced sessions and skips past ones", async () => {
    const tutor = await db.adminUser.create({
      data: {
        email: `${uniq("backfill-tutor")}@example.com`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        tutorTimezone: "America/Los_Angeles",
      },
    });
    const student = await db.student.create({
      data: {
        name: "Backfill Student",
        adminUserId: tutor.id,
        parentEmail: `${uniq("parent")}@example.com`,
      },
    });

    await db.scheduledSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        date: new Date("2026-01-02T00:00:00.000Z"),
        startTime: "10:00",
        endTime: "11:00",
        plannedDurationMinutes: 60,
        subject: "Past session",
      },
    });
    const upcoming = await db.scheduledSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        date: new Date("2026-12-20T00:00:00.000Z"),
        startTime: "16:00",
        endTime: "17:00",
        plannedDurationMinutes: 60,
        subject: "Upcoming session",
      },
    });

    const insertMock = jest.fn().mockResolvedValue({ id: "google-ev-upcoming" });
    const client: GoogleCalendarWriteClient = {
      listEventsByICalUid: jest.fn().mockResolvedValue(null),
      insertEvent: insertMock,
      patchEvent: jest.fn(),
      deleteEvent: jest.fn(),
    };
    setGoogleCalendarSyncDepsForTests({
      getClient: async () => ({ ok: true, client }),
      persistEventId: async (sessionId, googleEventId) => {
        await db.scheduledSession.update({
          where: { id: sessionId },
          data: { googleEventId },
        });
      },
    });

    const result = await syncUpcomingUnsyncedScheduledSessions(tutor.id, "refresh-test");
    expect(result.attempted).toBe(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const resource = insertMock.mock.calls[0]?.[0] as { start?: { dateTime?: string } };
    expect(resource.start?.dateTime).toMatch(/Z$/);

    const reloaded = await db.scheduledSession.findUnique({ where: { id: upcoming.id } });
    expect(reloaded?.googleEventId).toBe("google-ev-upcoming");
    expect(reloaded?.startAt).not.toBeNull();
  });
});
