/**
 * @jest-environment node
 */

const dbUpdateManyMock = jest.fn();
const dbSessionFindUniqueMock = jest.fn();
const dbStudentFindUniqueMock = jest.fn();
const dbAdminUserFindUniqueMock = jest.fn();
const dbErasureJobFindFirstMock = jest.fn();
const dbConsentRecordFindFirstMock = jest.fn();
const dbLearnerProfileFindUniqueMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardSession: {
      updateMany: (...args: unknown[]) => dbUpdateManyMock(...args),
      findUnique: (...args: unknown[]) => dbSessionFindUniqueMock(...args),
    },
    student: {
      findUnique: (...args: unknown[]) => dbStudentFindUniqueMock(...args),
    },
    consentRecord: {
      findFirst: (...args: unknown[]) => dbConsentRecordFindFirstMock(...args),
    },
    consentRestriction: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    learnerProfile: {
      findUnique: (...args: unknown[]) => dbLearnerProfileFindUniqueMock(...args),
    },
    erasureJob: {
      findFirst: (...args: unknown[]) => dbErasureJobFindFirstMock(...args),
    },
    adminUser: {
      findUnique: (...args: unknown[]) => dbAdminUserFindUniqueMock(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) => assertOwnsWhiteboardSessionMock(id),
}));

const mockLogProductEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/observability/product-events", () => ({
  __esModule: true,
  logProductEvent: (...args: unknown[]) => mockLogProductEvent(...args),
}));

import { startWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";

const ownedSession = {
  id: "wb_42",
  studentId: "stu_1",
  adminUserId: "admin_1",
  endedAt: null,
  eventsBlobUrl: "https://blob.example.com/events.json",
  consentAcknowledged: true,
};

function mockConsentRecordExists(allowLiveSession = true) {
  dbStudentFindUniqueMock.mockResolvedValue({
    name: "Maya",
    erasedAt: null,
    adminUserId: "admin_1",
    organizationId: null,
    learnerProfileId: "lp-1",
    learnerProfile: {
      isSelfLearner: false,
      tombstonedAt: null,
      accountHolderId: null,
      accountHolder: { tombstonedAt: null },
    },
  });
  dbConsentRecordFindFirstMock.mockResolvedValue({
    id: "cr-1",
    allowLiveSession,
    allowAudioRecording: true,
    allowWhiteboardRecording: true,
    allowNoteSending: true,
    learnerProfile: { isSelfLearner: false },
  });
}

beforeEach(() => {
  dbUpdateManyMock.mockReset();
  dbSessionFindUniqueMock.mockReset();
  dbSessionFindUniqueMock.mockResolvedValue({ sessionPhase: "PENDING" });
  mockLogProductEvent.mockReset();
  assertOwnsWhiteboardSessionMock.mockReset();
  dbStudentFindUniqueMock.mockReset();
  dbErasureJobFindFirstMock.mockReset();
  dbErasureJobFindFirstMock.mockResolvedValue(null);
  dbConsentRecordFindFirstMock.mockReset();
  dbLearnerProfileFindUniqueMock.mockReset();
  dbAdminUserFindUniqueMock.mockReset();
  dbAdminUserFindUniqueMock.mockResolvedValue({
    defaultRoundingIncrementMin: 5,
    defaultRoundingMode: "nearest",
    tutorTimezone: "America/Denver",
  });
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
        data: expect.objectContaining({
          sessionPhase: "ACTIVE",
          activatedAt: expect.any(Date),
          roundingIncrementMin: 5,
          roundingMode: "nearest",
          tutorTimezone: "America/Denver",
        }),
      })
    );
    expect(result).toEqual({ ok: true, phase: "active" });
    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "SESSION_STARTED",
      adminUserId: ownedSession.adminUserId,
      studentId: ownedSession.studentId,
      whiteboardSessionId: ownedSession.id,
      metadata: { mode: "LIVE", noop: false },
    });
  });

  it("is idempotent when already active or ended", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      ...ownedSession,
      endedAt: new Date("2026-04-24T11:00:00Z"),
    });
    dbUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await startWhiteboardSession("wb_42");

    expect(result).toEqual({ ok: true, phase: "active" });
    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "SESSION_STARTED",
      adminUserId: ownedSession.adminUserId,
      studentId: ownedSession.studentId,
      whiteboardSessionId: ownedSession.id,
      metadata: { mode: "LIVE", noop: true },
    });
  });

  // An expected refusal is RETURNED as data. Next redacts a thrown server-action error in
  // a production build (generic message + digest), so the tutor could never read a thrown
  // reason there; a resolved value survives serialization. Expected values are hand-written.
  it("T-new-B / T4: legacy PENDING row, claimed, no record → resolves {ok:false, parent line reason}, phase stays PENDING", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbConsentRecordFindFirstMock.mockResolvedValue(null);
    dbLearnerProfileFindUniqueMock.mockResolvedValue({ isSelfLearner: false });

    await expect(startWhiteboardSession("wb_42")).resolves.toEqual({
      ok: false,
      reason: "consent_missing_parent",
    });
    expect(dbUpdateManyMock).not.toHaveBeenCalled();
    expect(mockLogProductEvent).not.toHaveBeenCalled();
  });

  it("no consent record refuses an IN_PERSON start too (Andrew 2026-10-28 lock)", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbConsentRecordFindFirstMock.mockResolvedValue(null);
    dbLearnerProfileFindUniqueMock.mockResolvedValue({ isSelfLearner: false });

    await expect(startWhiteboardSession("wb_42", "IN_PERSON")).resolves.toEqual({
      ok: false,
      reason: "consent_missing_parent",
    });
    expect(dbUpdateManyMock).not.toHaveBeenCalled();
  });

  it("self-learner with no record resolves {ok:false, consent_missing_self}", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbConsentRecordFindFirstMock.mockResolvedValue(null);
    dbLearnerProfileFindUniqueMock.mockResolvedValue({ isSelfLearner: true });
    dbStudentFindUniqueMock.mockResolvedValue({
      name: "Maya",
      erasedAt: null,
      adminUserId: "admin_1",
      organizationId: null,
      learnerProfileId: "lp-1",
      learnerProfile: {
        isSelfLearner: true,
        tombstonedAt: null,
        accountHolderId: null,
        accountHolder: { tombstonedAt: null },
      },
    });

    await expect(startWhiteboardSession("wb_42", "IN_PERSON")).resolves.toEqual({
      ok: false,
      reason: "consent_missing_self",
    });
    expect(dbUpdateManyMock).not.toHaveBeenCalled();
  });

  it("unclaimed learner resolves {ok:false, unclaimed}", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbStudentFindUniqueMock.mockResolvedValue({
      name: "Maya",
      erasedAt: null,
      adminUserId: "admin_1",
      organizationId: null,
      learnerProfileId: null,
      learnerProfile: null,
    });

    await expect(startWhiteboardSession("wb_42", "IN_PERSON")).resolves.toEqual({
      ok: false,
      reason: "unclaimed",
    });
    expect(dbUpdateManyMock).not.toHaveBeenCalled();
  });

  it("still throws (rather than returning data) when the caller does not own the session", async () => {
    assertOwnsWhiteboardSessionMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(startWhiteboardSession("wb_42")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(dbUpdateManyMock).not.toHaveBeenCalled();
  });
});

describe("startWhiteboardSession — online sessions off (server enforces the entry rule)", () => {
  beforeEach(() => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbUpdateManyMock.mockResolvedValue({ count: 1 });
    mockConsentRecordExists(false);
  });

  it("refuses a LIVE start called directly, with the live-sessions reason, and flips nothing", async () => {
    await expect(startWhiteboardSession("wb_42", "LIVE")).resolves.toEqual({
      ok: false,
      reason: "live_off",
    });
    expect(dbUpdateManyMock).not.toHaveBeenCalled();
    expect(mockLogProductEvent).not.toHaveBeenCalled();
  });

  it("refuses the default (no mode given) start as LIVE", async () => {
    await expect(startWhiteboardSession("wb_42")).resolves.toEqual({
      ok: false,
      reason: "live_off",
    });
    expect(dbUpdateManyMock).not.toHaveBeenCalled();
  });

  it("still starts an IN_PERSON session (Decision 5: the switch governs online only)", async () => {
    const result = await startWhiteboardSession("wb_42", "IN_PERSON");
    expect(result).toEqual({ ok: true, phase: "active" });
    expect(dbUpdateManyMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw for a session that is already past PENDING (idempotent end/active stay safe)", async () => {
    dbSessionFindUniqueMock.mockResolvedValue({ sessionPhase: "ACTIVE" });
    dbUpdateManyMock.mockResolvedValue({ count: 0 });
    await expect(startWhiteboardSession("wb_42", "LIVE")).resolves.toEqual({
      ok: true,
      phase: "active",
    });
  });
});
