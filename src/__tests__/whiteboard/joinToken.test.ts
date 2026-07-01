/**
 * @jest-environment node
 */

/**
 * Unit coverage for the whiteboard join-token lifecycle:
 *   - `issueJoinToken` enforces ownership, refuses ended sessions,
 *     enforces the active-token cap, and returns a fresh token + path.
 *   - `revokeJoinTokensForSession` mass-revokes all live tokens for
 *     a session and is idempotent.
 *
 * Same trust posture as `createWhiteboardSession.test.ts`: we mock
 * the entire IO surface (db, scope guard) so the test runs without
 * Postgres and surfaces the action's logic, not the framework's.
 */

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) =>
    assertOwnsWhiteboardSessionMock(id),
}));

// `createWhiteboardSession` (in the same file) imports student-scope.
// Stub it so the import doesn't blow up; we never invoke that action
// in this file.
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: jest.fn(),
  assertOwnsStudent: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  __esModule: true,
  redirect: jest.fn(),
}));

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(),
}));

const tokenCountMock = jest.fn();
const tokenCreateMock = jest.fn();
const tokenFindFirstMock = jest.fn();
const tokenUpdateManyMock = jest.fn();
const dbStudentFindUniqueMock = jest.fn();
const dbConsentRecordFindFirstMock = jest.fn();
const dbLearnerProfileFindUniqueMock = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardJoinToken: {
      count: (...args: unknown[]) => tokenCountMock(...args),
      create: (...args: unknown[]) => tokenCreateMock(...args),
      findFirst: (...args: unknown[]) => tokenFindFirstMock(...args),
      updateMany: (...args: unknown[]) => tokenUpdateManyMock(...args),
    },
    whiteboardSession: {
      create: jest.fn(),
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
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

import {
  issueJoinToken,
  revokeJoinTokensForSession,
} from "@/app/admin/students/[id]/whiteboard/actions";
import { ConsentError } from "@/lib/consent-scope";

function mockConsentRecordExists() {
  dbStudentFindUniqueMock.mockResolvedValue({ learnerProfileId: "lp-1" });
  dbConsentRecordFindFirstMock.mockResolvedValue({
    id: "cr-1",
    learnerProfile: { isSelfLearner: false },
  });
}

beforeEach(() => {
  assertOwnsWhiteboardSessionMock.mockReset();
  tokenCountMock.mockReset();
  tokenCreateMock.mockReset();
  tokenFindFirstMock.mockReset();
  tokenUpdateManyMock.mockReset();
  dbStudentFindUniqueMock.mockReset();
  dbConsentRecordFindFirstMock.mockReset();
  dbLearnerProfileFindUniqueMock.mockReset();
  mockConsentRecordExists();
  // Default: no existing token. Tests that want idempotency to
  // return an existing row override this in-line.
  tokenFindFirstMock.mockResolvedValue(null);
});

const liveSession = {
  id: "wb-session-1",
  adminUserId: "admin-1",
  studentId: "student-1",
  consentAcknowledged: true,
  eventsBlobUrl: "https://blob/x.json",
  endedAt: null,
};

describe("issueJoinToken", () => {
  test("issues a fresh token for a live session within the cap", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(liveSession);
    tokenCountMock.mockResolvedValue(2);
    tokenCreateMock.mockResolvedValue({});

    const result = await issueJoinToken("wb-session-1");

    expect(assertOwnsWhiteboardSessionMock).toHaveBeenCalledWith("wb-session-1");
    expect(tokenCreateMock).toHaveBeenCalledTimes(1);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/); // base64url, 32 bytes ≈ 43 chars
    expect(result.joinPath).toBe(`/w/${result.token}`);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // create() got the same token + a future expiresAt
    const args = tokenCreateMock.mock.calls[0]?.[0] as {
      data: { whiteboardSessionId: string; token: string; expiresAt: Date };
    };
    expect(args.data.whiteboardSessionId).toBe("wb-session-1");
    expect(args.data.token).toBe(result.token);
    expect(args.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("idempotency: two consecutive calls for the same live session return the SAME token (no second mint)", async () => {
    // The regression this test pins down: the pilot saw "Copy student
    // link" mint a NEW token every click, so a tutor who clicked twice
    // and pasted the second URL accidentally left wife on a stale
    // copy of the first URL — both worked server-side (same session)
    // but the proliferation of links muddied debugging.
    //
    // Contract: when an active non-revoked non-expired token exists
    // for the session, issueJoinToken returns it as-is, with NO call
    // to db.whiteboardJoinToken.create and NO change to expiresAt.
    assertOwnsWhiteboardSessionMock.mockResolvedValue(liveSession);
    const futureExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
    tokenFindFirstMock.mockResolvedValue({
      token: "existing-token-abcdefghij_already_minted_earlier",
      expiresAt: futureExpiry,
    });

    const result = await issueJoinToken("wb-session-1");

    expect(result.token).toBe(
      "existing-token-abcdefghij_already_minted_earlier"
    );
    expect(result.joinPath).toBe(
      `/w/existing-token-abcdefghij_already_minted_earlier`
    );
    // No mint, no count check needed when an existing token won.
    expect(tokenCreateMock).not.toHaveBeenCalled();
    expect(tokenCountMock).not.toHaveBeenCalled();
    // expiresAt is the EXISTING expiry — we do NOT extend it. This is
    // intentional: extending on reuse would let a tutor keep a link
    // alive indefinitely by re-copying it, breaking the 24h cap.
    expect(result.expiresAt).toBe(futureExpiry.toISOString());
  });

  test("idempotency: findFirst filters by non-revoked + non-expired so a stale revoked row never wins", async () => {
    // If a tutor explicitly revoked the previous token (via End-
    // session, say) and then a tab somehow re-asks for a token, we
    // must NOT hand back the revoked one. The query's filter is the
    // guard; this test pins that filter shape.
    assertOwnsWhiteboardSessionMock.mockResolvedValue(liveSession);
    // findFirst with revokedAt=null + expiresAt:gt now returns null
    // because the only row in this scenario is revoked.
    tokenFindFirstMock.mockResolvedValue(null);
    tokenCountMock.mockResolvedValue(0);
    tokenCreateMock.mockResolvedValue({});

    const result = await issueJoinToken("wb-session-1");

    // findFirst was called WITH the safety filter.
    const findFirstArgs = tokenFindFirstMock.mock.calls[0]?.[0] as {
      where: {
        whiteboardSessionId: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      orderBy: { createdAt: "desc" };
    };
    expect(findFirstArgs.where.whiteboardSessionId).toBe("wb-session-1");
    expect(findFirstArgs.where.revokedAt).toBeNull();
    expect(findFirstArgs.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(findFirstArgs.orderBy.createdAt).toBe("desc");

    // Because findFirst returned null, the existing mint path ran.
    expect(tokenCreateMock).toHaveBeenCalledTimes(1);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  test("refuses to issue a token for a session that has already ended", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      ...liveSession,
      endedAt: new Date("2026-04-20T00:00:00Z"),
    });
    await expect(issueJoinToken("wb-session-1")).rejects.toThrow(
      /already ended/i
    );
    expect(tokenCountMock).not.toHaveBeenCalled();
    expect(tokenCreateMock).not.toHaveBeenCalled();
  });

  test("refuses when the active-token cap is reached", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(liveSession);
    tokenCountMock.mockResolvedValue(10); // == MAX_ACTIVE_JOIN_TOKENS_PER_SESSION

    await expect(issueJoinToken("wb-session-1")).rejects.toThrow(
      /too many active join links/i
    );
    expect(tokenCreateMock).not.toHaveBeenCalled();
  });

  test("retries on a P2002 unique-collision and succeeds with a fresh token", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(liveSession);
    tokenCountMock.mockResolvedValue(0);
    const collision = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    tokenCreateMock
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({});

    const result = await issueJoinToken("wb-session-1");

    expect(tokenCreateMock).toHaveBeenCalledTimes(2);
    // The two attempts MUST have used different tokens — the retry
    // logic regenerates the token on collision.
    const t1 = (tokenCreateMock.mock.calls[0]?.[0] as { data: { token: string } })
      .data.token;
    const t2 = (tokenCreateMock.mock.calls[1]?.[0] as { data: { token: string } })
      .data.token;
    expect(t1).not.toBe(t2);
    expect(result.token).toBe(t2);
  });

  test("propagates a non-P2002 db error as a friendly message", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(liveSession);
    tokenCountMock.mockResolvedValue(0);
    tokenCreateMock.mockRejectedValue(new Error("connection refused"));

    await expect(issueJoinToken("wb-session-1")).rejects.toThrow(
      /Could not issue a join link/i
    );
  });

  test("propagates a notFound() from assertOwnsWhiteboardSession", async () => {
    // notFound() throws a NEXT_NOT_FOUND digest
    assertOwnsWhiteboardSessionMock.mockImplementation(async () => {
      const err = new Error("NEXT_NOT_FOUND");
      (err as Error & { digest?: string }).digest = "NEXT_NOT_FOUND";
      throw err;
    });
    await expect(issueJoinToken("wb-session-bad")).rejects.toThrow(
      /NEXT_NOT_FOUND/
    );
    expect(tokenCountMock).not.toHaveBeenCalled();
  });

  test("M-2: claimed minor with no ConsentRecord → ConsentError, no token minted", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(liveSession);
    dbConsentRecordFindFirstMock.mockResolvedValue(null);
    dbLearnerProfileFindUniqueMock.mockResolvedValue({ isSelfLearner: false });

    await expect(issueJoinToken("wb-session-1")).rejects.toThrow(ConsentError);
    expect(tokenCreateMock).not.toHaveBeenCalled();
    expect(tokenCountMock).not.toHaveBeenCalled();
  });
});

describe("revokeJoinTokensForSession", () => {
  test("revokes all non-revoked tokens for the session", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(liveSession);
    tokenUpdateManyMock.mockResolvedValue({ count: 3 });

    const result = await revokeJoinTokensForSession("wb-session-1");
    expect(result.revoked).toBe(3);

    const args = tokenUpdateManyMock.mock.calls[0]?.[0] as {
      where: { whiteboardSessionId: string; revokedAt: null };
      data: { revokedAt: Date };
    };
    expect(args.where.whiteboardSessionId).toBe("wb-session-1");
    expect(args.where.revokedAt).toBeNull();
    expect(args.data.revokedAt).toBeInstanceOf(Date);
  });

  test("is idempotent — second call with no live tokens returns 0", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue(liveSession);
    tokenUpdateManyMock.mockResolvedValue({ count: 0 });
    const result = await revokeJoinTokensForSession("wb-session-1");
    expect(result.revoked).toBe(0);
  });

  test("requires session ownership before mutating", async () => {
    assertOwnsWhiteboardSessionMock.mockImplementation(async () => {
      const err = new Error("NEXT_NOT_FOUND");
      (err as Error & { digest?: string }).digest = "NEXT_NOT_FOUND";
      throw err;
    });
    await expect(
      revokeJoinTokensForSession("wb-session-someone-elses")
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(tokenUpdateManyMock).not.toHaveBeenCalled();
  });
});
