/**
 * @jest-environment node
 */

// Order of the statements the Start transaction runs, recorded across mocks (consent wave C3a, S14(b)).
const callOrder: string[] = [];

const dbUpdateManyMock = jest.fn();
const dbSessionFindUniqueMock = jest.fn();
const dbStudentFindUniqueMock = jest.fn();
const dbAdminUserFindUniqueMock = jest.fn();
const dbErasureJobFindFirstMock = jest.fn();
const dbConsentRecordFindFirstMock = jest.fn();
const dbLearnerProfileFindUniqueMock = jest.fn();
const dbSnapshotFindUniqueMock = jest.fn();
const dbSnapshotUpsertMock = jest.fn();

jest.mock("@/lib/db", () => {
  const db = {
    whiteboardSession: {
      updateMany: (...args: unknown[]) => {
        callOrder.push("updateMany");
        return dbUpdateManyMock(...args);
      },
      findUnique: (...args: unknown[]) => dbSessionFindUniqueMock(...args),
    },
    sessionConsentSnapshot: {
      findUnique: (...args: unknown[]) => dbSnapshotFindUniqueMock(...args),
      upsert: (...args: unknown[]) => {
        callOrder.push("snapshotUpsert");
        return dbSnapshotUpsertMock(...args);
      },
    },
    student: {
      findUnique: (...args: unknown[]) => dbStudentFindUniqueMock(...args),
    },
    consentRecord: {
      findFirst: (...args: unknown[]) => {
        callOrder.push("consentRead");
        return dbConsentRecordFindFirstMock(...args);
      },
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
    // The interactive transaction: the callback runs against the same mocks. A throw propagates, exactly as
    // Prisma rolls back and rethrows.
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { __esModule: true, db, withDbRetry: <T,>(fn: () => Promise<T>) => fn() };
});

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

const CLAIMED_STUDENT = {
  adminUserId: "admin_1",
  organizationId: null,
  learnerProfileId: "lp-1",
};

/** The session row every in-transaction read shares (phase, mode, student and any frozen snapshot). */
function mockSessionRow(over: Record<string, unknown> = {}) {
  dbSessionFindUniqueMock.mockResolvedValue({
    sessionPhase: "PENDING",
    sessionMode: "LIVE",
    notesForbidden: false,
    adminUserId: "admin_1",
    consentSnapshot: null,
    student: CLAIMED_STUDENT,
    ...over,
  });
}

function mockConsentRecordExists(over: Record<string, boolean> = {}) {
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
    version: 3,
    allowLiveSession: true,
    allowAudioRecording: true,
    allowWhiteboardRecording: true,
    allowNoteSending: true,
    learnerProfile: { isSelfLearner: false },
    ...over,
  });
}

beforeEach(() => {
  callOrder.length = 0;
  dbUpdateManyMock.mockReset();
  dbSessionFindUniqueMock.mockReset();
  mockSessionRow();
  dbSnapshotFindUniqueMock.mockReset();
  dbSnapshotFindUniqueMock.mockResolvedValue(null);
  dbSnapshotUpsertMock.mockReset();
  dbSnapshotUpsertMock.mockResolvedValue({});
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
  it("flips PENDING→ACTIVE for an owned session and freezes the snapshot", async () => {
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
    expect(result).toMatchObject({ ok: true, phase: "active", sessionMode: "LIVE" });
    expect(dbSnapshotUpsertMock).toHaveBeenCalledTimes(1);
    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "SESSION_STARTED",
      adminUserId: ownedSession.adminUserId,
      studentId: ownedSession.studentId,
      whiteboardSessionId: ownedSession.id,
      metadata: { mode: "LIVE", noop: false },
    });
  });

  it("is idempotent when already active or ended, and never touches the snapshot", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      ...ownedSession,
      endedAt: new Date("2026-04-24T11:00:00Z"),
    });
    mockSessionRow({ sessionPhase: "ENDED" });
    dbUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await startWhiteboardSession("wb_42");

    expect(result).toMatchObject({ ok: true, phase: "active" });
    expect(dbSnapshotUpsertMock).not.toHaveBeenCalled();
    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "SESSION_STARTED",
      adminUserId: ownedSession.adminUserId,
      studentId: ownedSession.studentId,
      whiteboardSessionId: ownedSession.id,
      metadata: { mode: "LIVE", noop: true },
    });
  });

  // S4 (spec): the frozen row is the record's switches, and the returned capabilities follow them.
  it("freezes the record's switches and returns the capabilities they imply (audio and board off)", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbUpdateManyMock.mockResolvedValue({ count: 1 });
    mockConsentRecordExists({ allowAudioRecording: false, allowWhiteboardRecording: false });

    const result = await startWhiteboardSession("wb_42", "LIVE");

    expect(dbSnapshotUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          allowLiveSession: true,
          allowAudioRecording: false,
          allowWhiteboardRecording: false,
          allowNoteSending: true,
          consentRecordId: "cr-1",
          consentRecordVersion: 3,
        }),
      })
    );
    expect(result).toMatchObject({
      ok: true,
      capabilities: {
        audio: { mode: "tutor_only" },
        whiteboard: { persist: false },
        notes: { draft: true },
      },
    });
  });

  // S14(b): the consent read comes first, the conditional update second, the freeze last.
  it("runs the statements in order: consent read, then the update, then the snapshot write", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbUpdateManyMock.mockResolvedValue({ count: 1 });

    await startWhiteboardSession("wb_42");

    const firstRead = callOrder.indexOf("consentRead");
    const update = callOrder.indexOf("updateMany");
    const write = callOrder.indexOf("snapshotUpsert");
    expect(firstRead).toBeGreaterThanOrEqual(0);
    expect(update).toBeGreaterThan(firstRead);
    expect(write).toBeGreaterThan(update);
    // The freeze re-reads the record after the update, so a read also follows it.
    expect(callOrder.lastIndexOf("consentRead")).toBeGreaterThan(update);
  });

  // S13 (spec): a record deleted between the first read and the freeze refuses the Start; the refusal throws
  // inside the transaction, so Prisma rolls the activation back (the real rollback is proven in the DB spec).
  it("refuses with the parent line when the record vanishes before the freeze, and writes no snapshot", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbUpdateManyMock.mockResolvedValue({ count: 1 });
    let reads = 0;
    dbConsentRecordFindFirstMock.mockImplementation(async () => {
      reads += 1;
      return reads === 1
        ? {
            id: "cr-1",
            version: 3,
            allowLiveSession: true,
            allowAudioRecording: true,
            allowWhiteboardRecording: true,
            allowNoteSending: true,
            learnerProfile: { isSelfLearner: false },
          }
        : null;
    });

    await expect(startWhiteboardSession("wb_42")).resolves.toEqual({
      ok: false,
      reason: "consent_missing_parent",
    });
    expect(dbSnapshotUpsertMock).not.toHaveBeenCalled();
    expect(mockLogProductEvent).not.toHaveBeenCalled();
  });

  // S5 (spec): live sessions turned off between the first read and the freeze refuse an online Start.
  it("refuses a LIVE start with live_off when the family turns live off before the freeze", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(ownedSession);
    dbUpdateManyMock.mockResolvedValue({ count: 1 });
    let reads = 0;
    dbConsentRecordFindFirstMock.mockImplementation(async () => {
      reads += 1;
      return {
        id: "cr-1",
        version: reads === 1 ? 3 : 4,
        allowLiveSession: reads === 1,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        learnerProfile: { isSelfLearner: false },
      };
    });

    await expect(startWhiteboardSession("wb_42", "LIVE")).resolves.toEqual({
      ok: false,
      reason: "live_off",
    });
    expect(mockLogProductEvent).not.toHaveBeenCalled();
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
    mockConsentRecordExists({ allowLiveSession: false });
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
    expect(result).toMatchObject({ ok: true, phase: "active" });
    expect(dbUpdateManyMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw for a session that is already past PENDING (idempotent end/active stay safe)", async () => {
    mockSessionRow({ sessionPhase: "ACTIVE" });
    dbUpdateManyMock.mockResolvedValue({ count: 0 });
    await expect(startWhiteboardSession("wb_42", "LIVE")).resolves.toMatchObject({
      ok: true,
      phase: "active",
    });
    expect(dbSnapshotUpsertMock).not.toHaveBeenCalled();
  });
});
