/**
 * @jest-environment node
 *
 * B2: insert succeeds but local googleEventId persist fails — retry must not duplicate events.
 */
import { parseDateOnlyInput } from "@/lib/date-only";
import {
  scheduledSessionIcalUid,
  setGoogleCalendarSyncDepsForTests,
  syncScheduledSessionInsertToGoogle,
  type GoogleCalendarWriteClient,
} from "@/lib/calendar/google-calendar-write";

const sessionRow = {
  id: "sess-b2-idempotency",
  adminUserId: "admin-b2",
  date: parseDateOnlyInput("2026-08-20")!,
  startTime: "16:00",
  endTime: "17:00",
  subject: "Algebra",
  notes: "Review",
  location: "",
  googleEventId: null as string | null,
  student: { name: "Maya Chen", icsShowFullName: false },
};

describe("B2 — Google insert idempotency", () => {
  afterEach(() => {
    setGoogleCalendarSyncDepsForTests(null);
  });

  it("insert success + local persist throws → retry calls insert at most once", async () => {
    const iCalUID = scheduledSessionIcalUid(sessionRow.id);
    const insertMock = jest.fn().mockResolvedValue({ id: "google-event-abc" });
    const listMock = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "google-event-abc" });

    const client: GoogleCalendarWriteClient = {
      listEventsByICalUid: listMock,
      insertEvent: insertMock,
      patchEvent: jest.fn(),
      deleteEvent: jest.fn(),
    };

    let persistAttempts = 0;
    setGoogleCalendarSyncDepsForTests({
      getClient: async () => ({ ok: true, client }),
      persistEventId: async () => {
        persistAttempts += 1;
        if (persistAttempts === 1) {
          throw new Error("simulated local persist failure");
        }
      },
    });

    await syncScheduledSessionInsertToGoogle({
      refreshToken: "refresh-test",
      adminTimezone: "America/Denver",
      session: sessionRow,
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledWith(iCalUID);

    await syncScheduledSessionInsertToGoogle({
      refreshToken: "refresh-test",
      adminTimezone: "America/Denver",
      session: { ...sessionRow, googleEventId: null },
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(persistAttempts).toBe(2);
  });
});
