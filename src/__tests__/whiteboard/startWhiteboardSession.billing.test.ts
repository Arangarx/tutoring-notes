/**
 * @jest-environment node
 */

const updateManyMock = jest.fn();
const adminFindUniqueMock = jest.fn();
const studentFindUniqueMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    student: {
      findUnique: (...args: unknown[]) => studentFindUniqueMock(...args),
    },
    whiteboardSession: {
      updateMany: (...args: unknown[]) => updateManyMock(...args),
    },
    adminUser: {
      findUnique: (...args: unknown[]) => adminFindUniqueMock(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) =>
    assertOwnsWhiteboardSessionMock(id),
}));

jest.mock("@/lib/erasure/active-erasure-scope", () => ({
  __esModule: true,
  isWhiteboardSessionBlockedByErasure: jest.fn().mockResolvedValue({ blocked: false }),
  ErasureAccessSuspendedError: class ErasureAccessSuspendedError extends Error {},
}));

jest.mock("@/lib/consent-scope", () => ({
  __esModule: true,
  assertConsentRecordExists: jest.fn().mockResolvedValue(undefined),
  ConsentError: class ConsentError extends Error {
    permission = "consentRecord";
  },
}));

import { startWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";

beforeEach(() => {
  updateManyMock.mockReset();
  adminFindUniqueMock.mockReset();
  studentFindUniqueMock.mockReset();
  assertOwnsWhiteboardSessionMock.mockReset();
  assertOwnsWhiteboardSessionMock.mockResolvedValue({
    id: "wb_1",
    adminUserId: "admin_1",
    studentId: "stu_1",
    endedAt: null,
    eventsBlobUrl: "placeholder",
    consentAcknowledged: true,
  });
  studentFindUniqueMock.mockResolvedValue({ learnerProfileId: "lp_1" });
  adminFindUniqueMock.mockResolvedValue({
    defaultRoundingIncrementMin: 15,
    defaultRoundingMode: "up",
    tutorTimezone: "America/Chicago",
  });
  updateManyMock.mockResolvedValue({ count: 1 });
});

describe("startWhiteboardSession — WS-J copy-at-start", () => {
  it("copies AdminUser billing defaults onto the session row at activation", async () => {
    await startWhiteboardSession("wb_1", "IN_PERSON");

    expect(adminFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "admin_1" } })
    );
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionPhase: "ACTIVE",
          roundingIncrementMin: 15,
          roundingMode: "up",
          tutorTimezone: "America/Chicago",
        }),
      })
    );
  });
});
