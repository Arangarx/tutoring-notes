/**
 * @jest-environment node
 */

/**
 * Unit coverage for `createWhiteboardSession`.
 *
 * The per-session tutor attestation gate (consent checkbox) has been removed
 * (Concern 1). The action now takes only `studentId` — no FormData. It still
 * enforces:
 *   1. DB-backed admin scope (no env-only login).
 *   2. Tutor approval (B1 cost gate).
 *   3. B2 allowLiveSession check (unconditional, from ConsentRecord).
 *
 * All IO (db, blob, auth, redirect) is mocked so tests run without Postgres
 * or network access.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  redirect: jest.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT to ${url}`);
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(),
}));

const dbCreateMock = jest.fn();
const dbStudentFindUniqueMock = jest.fn();
const dbConsentRecordFindFirstMock = jest.fn();
const dbSessionParticipantCreateManyMock = jest.fn();
// Minimal $transaction: just invokes the callback with a proxy tx object
const dbTransactionMock = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    whiteboardSession: { create: (...args: unknown[]) => dbCreateMock(...args) },
    consentRecord: { findFirst: (...args: unknown[]) => dbConsentRecordFindFirstMock(...args) },
    consentRestriction: { findUnique: jest.fn().mockResolvedValue(null) },
    sessionConsentSnapshot: { create: jest.fn().mockResolvedValue({}) },
    sessionParticipant: {
      createMany: (...args: unknown[]) => dbSessionParticipantCreateManyMock(...args),
    },
  };
  return fn(tx);
});
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    // B1: default APPROVED so existing tests are unaffected by the approval gate.
    adminUser: { findUnique: jest.fn().mockResolvedValue({ approvalStatus: "APPROVED" }) },
    student: {
      findUnique: (...args: unknown[]) => dbStudentFindUniqueMock(...args),
    },
    consentRecord: {
      findFirst: (...args: unknown[]) => dbConsentRecordFindFirstMock(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => dbTransactionMock(fn),
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const requireStudentScopeMock = jest.fn();
const assertOwnsStudentMock = jest.fn(async (..._args: unknown[]) => {});
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: () => requireStudentScopeMock(),
  assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
}));

// Mock consent-scope so unit tests don't hit the real DB for consent checks.
// The consent-scope logic itself is tested in consent-b2.test.ts (integration).
jest.mock("@/lib/consent-scope", () => ({
  __esModule: true,
  assertEffectiveConsent: jest.fn().mockResolvedValue(undefined),
  createSessionConsentSnapshot: jest.fn().mockResolvedValue(undefined),
  ConsentError: class ConsentError extends Error {
    constructor(public permission: string, message?: string) {
      super(message ?? permission);
      this.name = "ConsentError";
    }
  },
}));

import { createWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { put } from "@vercel/blob";
import { redirect } from "next/navigation";

const putMock = put as jest.MockedFunction<typeof put>;
const redirectMock = redirect as jest.MockedFunction<typeof redirect>;

const defaultAdminScope = {
  kind: "admin" as const,
  adminId: "admin-1",
  email: "tutor@example.com",
};

const defaultBlobResult = {
  url: "https://blob.example.com/whiteboard-sessions/admin-1/student-1/123-events.json",
  pathname: "x",
  contentType: "application/json",
  contentDisposition: "",
  downloadUrl: "x",
} as Awaited<ReturnType<typeof put>>;

beforeEach(() => {
  putMock.mockReset();
  dbCreateMock.mockReset();
  dbTransactionMock.mockClear();
  dbStudentFindUniqueMock.mockReset();
  dbConsentRecordFindFirstMock.mockReset();
  dbSessionParticipantCreateManyMock.mockReset();
  dbSessionParticipantCreateManyMock.mockResolvedValue({ count: 0 });
  requireStudentScopeMock.mockReset();
  assertOwnsStudentMock.mockClear();
  redirectMock.mockClear();

  // Default: unclaimed student (learnerProfileId null) → no B2 consent check path
  dbStudentFindUniqueMock.mockResolvedValue({ learnerProfileId: null });
  // Default: no consent record
  dbConsentRecordFindFirstMock.mockResolvedValue(null);
});

describe("createWhiteboardSession — session creation (modal removed)", () => {
  /**
   * RED-BEFORE / GREEN-AFTER (Concern 1):
   * Before removing the modal, calling createWhiteboardSession without
   * consentAcknowledged would throw "You must acknowledge the recording
   * consent". After removing, the call succeeds (redirects to workspace).
   */
  test("creates session without any consent field — per-session modal removed", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    putMock.mockResolvedValue(defaultBlobResult);
    dbCreateMock.mockResolvedValue({ id: "wb-session-xyz", studentId: "student-1" });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(dbCreateMock).toHaveBeenCalledTimes(1);
    const createArgs = dbCreateMock.mock.calls[0]?.[0] as {
      data: { consentAcknowledged: boolean; eventsBlobUrl: string; adminUserId: string };
    };
    // consentAcknowledged is still stored as true (server-side default, column kept)
    expect(createArgs.data.consentAcknowledged).toBe(true);
    expect(createArgs.data.adminUserId).toBe("admin-1");
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/students/student-1/whiteboard/wb-session-xyz/workspace"
    );
  });

  test("rejects an env-only admin (no AdminUser row)", async () => {
    requireStudentScopeMock.mockResolvedValue({
      kind: "env",
      email: "env-admin@example.com",
    });
    await expect(createWhiteboardSession("student-1")).rejects.toThrow(
      /registered admin account/i
    );
    expect(putMock).not.toHaveBeenCalled();
    expect(dbCreateMock).not.toHaveBeenCalled();
  });

  test("claimed student: creates SessionParticipant row in the same transaction", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    dbStudentFindUniqueMock.mockResolvedValue({ learnerProfileId: "lp-1" });
    putMock.mockResolvedValue({ ...defaultBlobResult, url: "https://blob.example.com/x.json" });
    dbCreateMock.mockResolvedValue({ id: "wb-claimed", studentId: "student-1" });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(dbSessionParticipantCreateManyMock).toHaveBeenCalledWith({
      data: [{ whiteboardSessionId: "wb-claimed", learnerProfileId: "lp-1" }],
      skipDuplicates: true,
    });
  });

  test("unclaimed student: skips SessionParticipant row", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    putMock.mockResolvedValue({ ...defaultBlobResult, url: "https://blob.example.com/x.json" });
    dbCreateMock.mockResolvedValue({ id: "wb-unclaimed", studentId: "student-1" });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(dbSessionParticipantCreateManyMock).not.toHaveBeenCalled();
  });

  test("does not insert a row if Blob put fails", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    putMock.mockRejectedValue(new Error("blob storage 500"));

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(
      /whiteboard session storage/i
    );
    expect(dbCreateMock).not.toHaveBeenCalled();
  });

  test("B2: claimed student with allowLiveSession=false is rejected before Blob write", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    dbStudentFindUniqueMock.mockResolvedValue({ learnerProfileId: "lp-1" });
    // Consent record says live session not allowed
    dbConsentRecordFindFirstMock.mockResolvedValue({
      id: "cr-1",
      allowLiveSession: false,
      learnerProfile: { isSelfLearner: false },
    });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(
      /live sessions.*not been granted|allowLiveSession/i
    );
    expect(putMock).not.toHaveBeenCalled();
    expect(dbCreateMock).not.toHaveBeenCalled();
  });
});
