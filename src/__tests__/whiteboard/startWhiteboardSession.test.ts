/**
 * @jest-environment node
 */

const dbUpdateManyMock = jest.fn();
const dbStudentFindUniqueMock = jest.fn();
const dbErasureJobFindFirstMock = jest.fn();
const dbConsentRecordFindFirstMock = jest.fn();
const dbLearnerProfileFindUniqueMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardSession: {
      updateMany: (...args: unknown[]) => dbUpdateManyMock(...args),
    },
    student: {
      findUnique: (...args: unknown[]) => dbStudentFindUniqueMock(...args),
    },
    consentRecord: {
      findFirst: (...args: unknown[]) => dbConsentRecordFindFirstMock(...args),
    },
    learnerProfile: {
      findUnique: (...args: unknown[]) => dbLearnerProfileFindUniqueMock(...args),
    },
    erasureJob: {
      findFirst: (...args: unknown[]) => dbErasureJobFindFirstMock(...args),
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
import { ConsentError } from "@/lib/consent-scope";

const ownedSession = {
  id: "wb_42",
  studentId: "stu_1",
  adminUserId: "admin_1",
  endedAt: null,
  eventsBlobUrl: "https://blob.example.com/events.json",
  consentAcknowledged: true,
};

function mockConsentRecordExists() {
  dbStudentFindUniqueMock.mockResolvedValue({
    erasedAt: null,
    learnerProfileId: "lp-1",
    learnerProfile: {
      tombstonedAt: null,
      accountHolderId: null,
      accountHolder: { tombstonedAt: null },
    },
  });
  dbConsentRecordFindFirstMock.mockResolvedValue({
    id: "cr-1",
    learnerProfile: { isSelfLearner: false },
  });
}

beforeEach(() => {
  dbUpdateManyMock.mockReset();
  assertOwnsWhiteboardSessionMock.mockReset();
  dbStudentFindUniqueMock.mockReset();
  dbErasureJobFindFirstMock.mockReset();
  dbErasureJobFindFirstMock.mockResolvedValue(null);
  dbConsentRecordFindFirstMock.mockReset();
  dbLearnerProfileFindUniqueMock.mockReset();
  mockConsentRecordExists();
});

describe("startWhiteboardSession", () => {
  it("flips PENDING→ACTIVE for an owned session", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
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
      ...ownedSession,
      endedAt: new Date("2026-04-24T11:00:00Z"),
    });
    dbUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await startWhiteboardSession("wb_42");

    expect(result).toEqual({ ok: true, phase: "active" });
  });

  it("T-new-B / T4: legacy PENDING row, claimed, no record → ConsentError, phase stays PENDING", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbConsentRecordFindFirstMock.mockResolvedValue(null);
    dbLearnerProfileFindUniqueMock.mockResolvedValue({ isSelfLearner: false });

    await expect(startWhiteboardSession("wb_42")).rejects.toThrow(ConsentError);
    expect(dbUpdateManyMock).not.toHaveBeenCalled();
  });
});
