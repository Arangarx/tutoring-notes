/**
 * @jest-environment node
 */
import { db } from "@/lib/db";
import { uniq } from "../helpers/unique-test-token";
import { seedTutorTimezoneIfUnset } from "@/lib/billing/seed-tutor-timezone";
import {
  afterStudentCalendarTitlePolicyChanged,
  syncUpcomingUnsyncedScheduledSessions,
} from "@/lib/calendar/google-calendar-connect-backfill";
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

  it("patches already-synced upcoming events when device timezone is first seeded", async () => {
    const tutor = await db.adminUser.create({
      data: {
        email: `${uniq("seed-patch-tutor")}@example.com`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        tutorTimezone: null,
      },
    });
    const student = await db.student.create({
      data: {
        name: "Seed Patch Student",
        adminUserId: tutor.id,
        parentEmail: `${uniq("parent")}@example.com`,
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
        subject: "Already on Google",
        googleEventId: "google-ev-existing",
      },
    });
    await db.oAuthCalendarConnection.create({
      data: {
        provider: "google",
        refreshToken: "refresh-seed-patch",
        email: "seed-patch@example.com",
        adminUserId: tutor.id,
      },
    });

    const patchMock = jest.fn().mockResolvedValue(undefined);
    const client: GoogleCalendarWriteClient = {
      listEventsByICalUid: jest.fn(),
      insertEvent: jest.fn(),
      patchEvent: patchMock,
      deleteEvent: jest.fn(),
    };
    setGoogleCalendarSyncDepsForTests({
      getClient: async () => ({ ok: true, client }),
      persistEventId: jest.fn(),
    });

    const seeded = await seedTutorTimezoneIfUnset(tutor.id, "America/Los_Angeles");
    expect(seeded).toEqual({ seeded: true, timeZone: "America/Los_Angeles" });
    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(patchMock.mock.calls[0]?.[0]).toBe("google-ev-existing");
    const resource = patchMock.mock.calls[0]?.[1] as { start?: { dateTime?: string } };
    expect(resource.start?.dateTime).toMatch(/Z$/);

    const reloaded = await db.scheduledSession.findUnique({ where: { id: upcoming.id } });
    expect(reloaded?.startAt).not.toBeNull();
  });
});

describe("afterStudentCalendarTitlePolicyChanged", () => {
  afterEach(() => {
    setGoogleCalendarSyncDepsForTests(null);
  });

  it("does not Google-patch when the student has no owning tutor", async () => {
    const student = await db.student.create({
      data: {
        name: "Unowned Student",
        adminUserId: null,
        parentEmail: `${uniq("parent")}@example.com`,
      },
    });

    const patchMock = jest.fn();
    setGoogleCalendarSyncDepsForTests({
      getClient: async () => ({
        ok: true,
        client: {
          listEventsByICalUid: jest.fn(),
          insertEvent: jest.fn(),
          patchEvent: patchMock,
          deleteEvent: jest.fn(),
        },
      }),
      persistEventId: jest.fn(),
    });

    await afterStudentCalendarTitlePolicyChanged(student.id);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("patches upcoming Google events after a title-policy change", async () => {
    const tutor = await db.adminUser.create({
      data: {
        email: `${uniq("title-tutor")}@example.com`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        tutorTimezone: "America/Los_Angeles",
      },
    });
    const student = await db.student.create({
      data: {
        name: "Title Student",
        adminUserId: tutor.id,
        parentEmail: `${uniq("parent")}@example.com`,
        icsShowFullName: true,
      },
    });
    await db.scheduledSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        date: new Date("2026-12-20T00:00:00.000Z"),
        startTime: "16:00",
        endTime: "17:00",
        plannedDurationMinutes: 60,
        subject: "Retitle me",
        googleEventId: "google-ev-retitle",
      },
    });
    await db.oAuthCalendarConnection.create({
      data: {
        provider: "google",
        refreshToken: "refresh-retitle",
        email: "retitle@example.com",
        adminUserId: tutor.id,
      },
    });

    const patchMock = jest.fn().mockResolvedValue(undefined);
    setGoogleCalendarSyncDepsForTests({
      getClient: async () => ({
        ok: true,
        client: {
          listEventsByICalUid: jest.fn(),
          insertEvent: jest.fn(),
          patchEvent: patchMock,
          deleteEvent: jest.fn(),
        },
      }),
      persistEventId: jest.fn(),
    });

    await afterStudentCalendarTitlePolicyChanged(student.id);
    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(patchMock.mock.calls[0]?.[0]).toBe("google-ev-retitle");
  });
});
