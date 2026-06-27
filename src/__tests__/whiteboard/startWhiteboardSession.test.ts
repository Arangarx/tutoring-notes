/**
 * @jest-environment node
 */

const dbUpdateManyMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardSession: {
      updateMany: (...args: unknown[]) => dbUpdateManyMock(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) => assertOwnsWhiteboardSessionMock(id),
}));

import { startWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";

beforeEach(() => {
  dbUpdateManyMock.mockReset();
  assertOwnsWhiteboardSessionMock.mockReset();
});

describe("startWhiteboardSession", () => {
  it("flips PENDING→ACTIVE for an owned session", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      id: "wb_42",
      studentId: "stu_1",
      adminUserId: "admin_1",
      endedAt: null,
      eventsBlobUrl: "https://blob.example.com/events.json",
      consentAcknowledged: true,
    });
    dbUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await startWhiteboardSession("wb_42");

    expect(assertOwnsWhiteboardSessionMock).toHaveBeenCalledWith("wb_42");
    expect(dbUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "wb_42",
          adminUserId: "admin_1",
          sessionPhase: "PENDING",
          endedAt: null,
        },
        data: {
          sessionPhase: "ACTIVE",
          activatedAt: expect.any(Date),
        },
      })
    );
    expect(result).toEqual({ ok: true, phase: "active" });
  });

  it("is idempotent when already active or ended", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      id: "wb_42",
      studentId: "stu_1",
      adminUserId: "admin_1",
      endedAt: new Date("2026-04-24T11:00:00Z"),
      eventsBlobUrl: "https://blob.example.com/events.json",
      consentAcknowledged: true,
    });
    dbUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await startWhiteboardSession("wb_42");

    expect(result).toEqual({ ok: true, phase: "active" });
  });
});
