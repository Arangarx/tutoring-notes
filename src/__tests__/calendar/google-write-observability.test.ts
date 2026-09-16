/**
 * @jest-environment node
 *
 * B3: gcw structured logs on success and failure (including invalid_grant).
 */
import { parseDateOnlyInput } from "@/lib/date-only";
import {
  setGoogleCalendarSyncDepsForTests,
  syncScheduledSessionInsertToGoogle,
  type GoogleCalendarWriteClient,
} from "@/lib/calendar/google-calendar-write";

const sessionRow = {
  id: "sess-gcw-obs",
  adminUserId: "admin-gcw",
  date: parseDateOnlyInput("2026-08-20")!,
  startTime: "09:00",
  endTime: "10:00",
  subject: "Reading",
  notes: "",
  location: "",
  googleEventId: null as string | null,
  student: { name: "Sam Lee", icsShowFullName: false },
};

describe("B3 — gcw observability", () => {
  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

  afterEach(() => {
    setGoogleCalendarSyncDepsForTests(null);
    logSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  function gcwLines(): string[] {
    return logSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((line) => line.startsWith("[gcw]"));
  }

  it("logs insert_start and insert_success on happy path", async () => {
    const client: GoogleCalendarWriteClient = {
      listEventsByICalUid: jest.fn().mockResolvedValue(null),
      insertEvent: jest.fn().mockResolvedValue({ id: "ev-ok-1" }),
      patchEvent: jest.fn(),
      deleteEvent: jest.fn(),
    };

    setGoogleCalendarSyncDepsForTests({
      getClient: async () => ({ ok: true, client }),
      persistEventId: jest.fn(),
    });

    await syncScheduledSessionInsertToGoogle({
      refreshToken: "refresh-test",
      adminTimezone: "America/Denver",
      session: sessionRow,
    });

    const lines = gcwLines();
    expect(lines.some((l) => l.includes("action=insert_start"))).toBe(true);
    expect(lines.some((l) => l.includes("action=insert_success"))).toBe(true);
    expect(lines.some((l) => l.includes("adminUserId=admin-gcw"))).toBe(true);
    expect(lines.some((l) => l.includes("sessionId=sess-gcw-obs"))).toBe(true);
    expect(lines.some((l) => l.includes("googleEventId=ev-ok-1"))).toBe(true);
  });

  it("logs insert_error on injected Google failure", async () => {
    const client: GoogleCalendarWriteClient = {
      listEventsByICalUid: jest.fn().mockResolvedValue(null),
      insertEvent: jest.fn().mockRejectedValue(new Error("quota exceeded")),
      patchEvent: jest.fn(),
      deleteEvent: jest.fn(),
    };

    setGoogleCalendarSyncDepsForTests({
      getClient: async () => ({ ok: true, client }),
      persistEventId: jest.fn(),
    });

    await syncScheduledSessionInsertToGoogle({
      refreshToken: "refresh-test",
      adminTimezone: "America/Denver",
      session: sessionRow,
    });

    const lines = gcwLines();
    expect(lines.some((l) => l.includes("action=insert_error"))).toBe(true);
    expect(lines.some((l) => l.includes("sessionId=sess-gcw-obs"))).toBe(true);
  });

  it("logs invalid_grant when token refresh is revoked", async () => {
    setGoogleCalendarSyncDepsForTests({
      getClient: async () => {
        throw Object.assign(new Error("invalid_grant"), { code: "invalid_grant" });
      },
      persistEventId: jest.fn(),
    });

    await syncScheduledSessionInsertToGoogle({
      refreshToken: "bad-refresh",
      adminTimezone: "America/Denver",
      session: sessionRow,
    });

    const lines = gcwLines();
    expect(lines.some((l) => l.includes("action=invalid_grant"))).toBe(true);
  });
});
