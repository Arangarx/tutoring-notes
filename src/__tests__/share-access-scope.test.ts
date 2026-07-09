/**
 * @jest-environment node
 *
 * Auth-critical tests for Phase 1 notes-login auth wall.
 *
 * Tests the `checkApiShareAccess` API-route variant (does NOT throw Next.js
 * navigation signals; returns structured verdict objects suitable for assertion).
 *
 * Design contract (authed-session-access-design-2026-06-10.md §3.2 + §7 Axis 4):
 *   - Wall OFF: any valid (non-revoked) share token grants access anonymously.
 *   - Wall ON: AccountHolder owning the linked LearnerProfile → access granted.
 *   - Wall ON: Learner whose learnerProfileId matches the student → access granted.
 *   - Wall ON: AccountHolder whose child is NOT the linked learner → denied (403).
 *   - Wall ON: Learner who is NOT the linked learner → denied (403).
 *   - Wall ON: No session at all → redirect 401 to /account/login.
 *   - Wall ON: Unclaimed student (learnerProfileId null) → redirect 401 to claim flow.
 *   - Revoked share link → 403 regardless of wall state.
 *
 * P1 BLOCKERs covered:
 *   BLOCKER-P1-A1: Negative test for notes without auth → redirect (not 200)
 *   BLOCKER-P1-A2: Parent B cannot access student whose learnerProfile belongs to Parent A
 *   BLOCKER-P1-A3: Learner A cannot access share page for learner B's student
 *   BLOCKER-P1-A4: Unclaimed student notes without auth → not anonymous 200
 *   BLOCKER-P1-O1: sal= events emitted on all access decisions
 */

// ---------------------------------------------------------------------------
// Mock NOTES_AUTH_WALL env var — must be set BEFORE module imports.
// ---------------------------------------------------------------------------

const originalEnv = { ...process.env };

afterEach(() => {
  // Restore env between tests.
  Object.keys(process.env).forEach((k) => {
    if (!(k in originalEnv)) delete process.env[k];
    else process.env[k] = originalEnv[k];
  });
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mock next/navigation so notFound() throws instead of doing RSC magic.
// ---------------------------------------------------------------------------
jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// ---------------------------------------------------------------------------
// DB mock — intercept all queries used by checkApiShareAccess.
// ---------------------------------------------------------------------------

const shareLinkFindUniqueMock = jest.fn();
const learnerProfileFindUniqueMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    shareLink: {
      findUnique: (...args: unknown[]) => shareLinkFindUniqueMock(...args),
    },
    learnerProfile: {
      findUnique: (...args: unknown[]) => learnerProfileFindUniqueMock(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

// ---------------------------------------------------------------------------
// Session helpers mock — control which principal is "logged in".
// ---------------------------------------------------------------------------

const getAccountHolderSessionMock = jest.fn();
const getLearnerSessionMock = jest.fn();

jest.mock("@/lib/account-holder-session", () => ({
  __esModule: true,
  getAccountHolderSession: (...args: unknown[]) =>
    getAccountHolderSessionMock(...args),
}));

jest.mock("@/lib/learner-session", () => ({
  __esModule: true,
  getLearnerSession: (...args: unknown[]) => getLearnerSessionMock(...args),
}));

// ---------------------------------------------------------------------------
// server-session mock — for the page variant (assertCanAccessShareLink).
// Uses header-based session helpers (no req arg).
// ---------------------------------------------------------------------------

const getAccountHolderSessionFromHeadersMock = jest.fn();
const getLearnerSessionFromHeadersMock = jest.fn();
const hasAccountHolderSessionCookieMock = jest.fn();
const hasLearnerSessionCookieMock = jest.fn();

jest.mock("@/lib/server-session", () => ({
  __esModule: true,
  getAccountHolderSessionFromHeaders: () => getAccountHolderSessionFromHeadersMock(),
  getLearnerSessionFromHeaders: () => getLearnerSessionFromHeadersMock(),
  hasAccountHolderSessionCookie: () => hasAccountHolderSessionCookieMock(),
  hasLearnerSessionCookie: () => hasLearnerSessionCookieMock(),
}));

// ---------------------------------------------------------------------------
// Import under test (after all mocks are in place).
// ---------------------------------------------------------------------------
import {
  checkApiShareAccess,
  assertCanAccessShareLink,
  isNotesAuthWallEnabled,
} from "@/lib/share-access-scope";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TOKEN_VALID = "tok-valid-1234567890";
const TOKEN_REVOKED = "tok-revoked-abcdef";
const STUDENT_A = "student-a-uuid";
const STUDENT_B = "student-b-uuid";
const LEARNER_PROFILE_A = "lp-a-uuid";
const LEARNER_PROFILE_B = "lp-b-uuid";
const ACCOUNT_HOLDER_A = "ah-a-uuid";
const ACCOUNT_HOLDER_B = "ah-b-uuid";
const SHARE_PAGE_PATH = `/s/${TOKEN_VALID}`;

/** A valid share link for StudentA whose LearnerProfile is linked. */
const validLinkClaimed = {
  revokedAt: null,
  studentId: STUDENT_A,
  student: { learnerProfileId: LEARNER_PROFILE_A },
};

/** A valid share link for StudentA whose student is NOT yet claimed. */
const validLinkUnclaimed = {
  revokedAt: null,
  studentId: STUDENT_A,
  student: { learnerProfileId: null },
};

/** AccountHolder A session (owns LEARNER_PROFILE_A). */
const ahSessionA = { accountHolderId: ACCOUNT_HOLDER_A, sessionId: "sess-ah-a", twoFactorVerified: false };
/** AccountHolder B session (owns LEARNER_PROFILE_B — different child). */
const ahSessionB = { accountHolderId: ACCOUNT_HOLDER_B, sessionId: "sess-ah-b", twoFactorVerified: false };

/** LearnerProfile A as returned from DB. */
const learnerProfileA = {
  accountHolderId: ACCOUNT_HOLDER_A,
  tombstonedAt: null,
};

/** Learner A device session. */
const learnerSessionA = { learnerProfileId: LEARNER_PROFILE_A, accountHolderId: ACCOUNT_HOLDER_A, sessionId: "sess-lrn-a" };
/** Learner B device session. */
const learnerSessionB = { learnerProfileId: LEARNER_PROFILE_B, accountHolderId: ACCOUNT_HOLDER_B, sessionId: "sess-lrn-b" };

function makeRequest(): Request {
  return new Request("http://localhost/");
}

// ---------------------------------------------------------------------------
// isNotesAuthWallEnabled
// ---------------------------------------------------------------------------

describe("isNotesAuthWallEnabled()", () => {
  test("returns TRUE when NOTES_AUTH_WALL is unset (secure-by-default)", () => {
    delete process.env.NOTES_AUTH_WALL;
    expect(isNotesAuthWallEnabled()).toBe(true);
  });

  test("returns FALSE when NOTES_AUTH_WALL=false (explicit local-dev sentinel)", () => {
    process.env.NOTES_AUTH_WALL = "false";
    expect(isNotesAuthWallEnabled()).toBe(false);
  });

  test("returns FALSE when NOTES_AUTH_WALL=0 (explicit local-dev sentinel)", () => {
    process.env.NOTES_AUTH_WALL = "0";
    expect(isNotesAuthWallEnabled()).toBe(false);
  });

  test("returns true when NOTES_AUTH_WALL=true", () => {
    process.env.NOTES_AUTH_WALL = "true";
    expect(isNotesAuthWallEnabled()).toBe(true);
  });

  test("returns true when NOTES_AUTH_WALL=1", () => {
    process.env.NOTES_AUTH_WALL = "1";
    expect(isNotesAuthWallEnabled()).toBe(true);
  });

  test("returns TRUE for unrecognized string values (secure-by-default, only false/0 disables)", () => {
    process.env.NOTES_AUTH_WALL = "yes";
    expect(isNotesAuthWallEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wall OFF — anonymous grace mode (P1-AC-12)
// ---------------------------------------------------------------------------

describe("checkApiShareAccess — wall OFF (grace window, P1-AC-12)", () => {
  beforeEach(() => {
    // Wall explicitly disabled for local dev — use the sentinel value.
    // (After the secure-by-default fix, deleting the env would turn the wall ON.)
    process.env.NOTES_AUTH_WALL = "false";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(null);
  });

  test("allows anonymous access when wall is off — preserves today's behavior", async () => {
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.studentId).toBe(STUDENT_A);
    }
  });

  test("wall=0 also allows anonymous access (both sentinels work)", async () => {
    process.env.NOTES_AUTH_WALL = "0";

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(true);
  });

  test("emits sal=access_granted_anon_grace log when wall is off", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("access_granted_anon_grace")
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[sal]"));
  });

  test("still returns 403 on revoked token when wall is off (revocation always applies)", async () => {
    shareLinkFindUniqueMock.mockResolvedValue({
      revokedAt: new Date("2026-01-01"),
      studentId: STUDENT_A,
      student: { learnerProfileId: LEARNER_PROFILE_A },
    });

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(403);
  });

  test("returns 403 for missing share link when wall is off", async () => {
    shareLinkFindUniqueMock.mockResolvedValue(null);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Wall ON — no session (BLOCKER-P1-A1 + P1-AC-1)
// ---------------------------------------------------------------------------

describe("checkApiShareAccess — wall ON, no session (BLOCKER-P1-A1)", () => {
  beforeEach(() => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(null);
  });

  test("denies (401) when no session cookie is present", async () => {
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.status).toBe(401);
    }
  });

  test("provides redirectTo pointing to /account/login", async () => {
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.redirectTo).toMatch(/\/account\/login/);
    }
  });

  test("includes source=notes_email in redirectTo URL", async () => {
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.redirectTo).toMatch(/source=notes_email/);
    }
  });

  test("includes returnTo with the share page path in redirectTo URL", async () => {
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.redirectTo).toMatch(/returnTo=/);
    }
  });

  test("emits sal=access_denied_redirect log on anonymous denial", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("access_denied_redirect")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("reason=no_session")
    );
  });
});

// ---------------------------------------------------------------------------
// Wall ON — unclaimed student (BLOCKER-P1-A4 + P1-AC-4)
// ---------------------------------------------------------------------------

describe("checkApiShareAccess — wall ON, unclaimed student (BLOCKER-P1-A4)", () => {
  beforeEach(() => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkUnclaimed);
  });

  test("denies (401) for AccountHolder session when student is unclaimed", async () => {
    getAccountHolderSessionMock.mockResolvedValue(ahSessionA);
    getLearnerSessionMock.mockResolvedValue(null);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.status).toBe(401);
    }
  });

  test("denies (401) for Learner session when student is unclaimed", async () => {
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(learnerSessionA);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.status).toBe(401);
    }
  });

  test("emits sal=claim_required log for unclaimed student", async () => {
    getAccountHolderSessionMock.mockResolvedValue(ahSessionA);
    getLearnerSessionMock.mockResolvedValue(null);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("claim_required")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("reason=unclaimed")
    );
  });

  test("does NOT return allowed=true anonymously for unclaimed student (no anonymous fallback)", async () => {
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(null);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    // Even unclaimed, anonymous access must be DENIED (P1-AC-4: BLOCKER)
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wall ON — AccountHolder owns the learner (P1-AC-2)
// ---------------------------------------------------------------------------

describe("checkApiShareAccess — wall ON, owner AccountHolder (P1-AC-2)", () => {
  beforeEach(() => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(ahSessionA);
    getLearnerSessionMock.mockResolvedValue(null);
    // LearnerProfile A is owned by AccountHolder A
    learnerProfileFindUniqueMock.mockResolvedValue(learnerProfileA);
  });

  test("grants access to owner AccountHolder (P1-AC-2)", async () => {
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.studentId).toBe(STUDENT_A);
      expect(result.learnerProfileId).toBe(LEARNER_PROFILE_A);
    }
  });

  test("emits sal=access_granted principal=account_holder log on success", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("access_granted")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("principal=account_holder")
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[sal]"));
  });

  test("queries DB for learnerProfile to verify ownership", async () => {
    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(learnerProfileFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LEARNER_PROFILE_A } })
    );
  });
});

// ---------------------------------------------------------------------------
// Wall ON — wrong AccountHolder (BLOCKER-P1-A2 + P1-AC-5)
// ---------------------------------------------------------------------------

describe("checkApiShareAccess — wall ON, non-owner AccountHolder (BLOCKER-P1-A2)", () => {
  beforeEach(() => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    // AccountHolder B is logged in but the student's learnerProfile belongs to A
    getAccountHolderSessionMock.mockResolvedValue(ahSessionB);
    getLearnerSessionMock.mockResolvedValue(null);
    // DB returns profile owned by A
    learnerProfileFindUniqueMock.mockResolvedValue(learnerProfileA); // owned by ACCOUNT_HOLDER_A
  });

  test("denies (403) when AccountHolder B tries to access AccountHolder A's child notes", async () => {
    // ahSessionB.accountHolderId = ACCOUNT_HOLDER_B; learnerProfileA.accountHolderId = ACCOUNT_HOLDER_A
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.status).toBe(403);
    }
  });

  test("emits sal=ownership_denied principal=account_holder log on cross-tenant denial", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ownership_denied")
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("principal=account_holder")
    );
  });

  test("denies (403) when LearnerProfile is tombstoned even for the owner", async () => {
    // Tombstoned profile — even the correct owner is denied
    learnerProfileFindUniqueMock.mockResolvedValue({
      accountHolderId: ACCOUNT_HOLDER_B, // B is logged in and IS the owner
      tombstonedAt: new Date("2026-05-01"),
    });
    getAccountHolderSessionMock.mockResolvedValue(ahSessionB);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.status).toBe(403);
    }
  });
});

// ---------------------------------------------------------------------------
// Wall ON — learner session, matching learner (P1-AC-3)
// ---------------------------------------------------------------------------

describe("checkApiShareAccess — wall ON, matching Learner session (P1-AC-3)", () => {
  beforeEach(() => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(learnerSessionA); // learnerProfileId = LEARNER_PROFILE_A
  });

  test("grants access to the matching learner (P1-AC-3)", async () => {
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.studentId).toBe(STUDENT_A);
    }
  });

  test("emits sal=access_granted principal=learner log", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("access_granted")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("principal=learner")
    );
  });
});

// ---------------------------------------------------------------------------
// Wall ON — wrong learner session (BLOCKER-P1-A3 + P1-AC-6)
// ---------------------------------------------------------------------------

describe("checkApiShareAccess — wall ON, wrong Learner session (BLOCKER-P1-A3)", () => {
  beforeEach(() => {
    process.env.NOTES_AUTH_WALL = "true";
    // Share link for Student A, whose learnerProfileId = LEARNER_PROFILE_A
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    // Learner B is logged in — wrong learner
    getLearnerSessionMock.mockResolvedValue(learnerSessionB);
  });

  test("denies (403) when Learner B tries to access Learner A's notes (BLOCKER-P1-A3)", async () => {
    // learnerSessionB.learnerProfileId = LEARNER_PROFILE_B ≠ validLinkClaimed.student.learnerProfileId = LEARNER_PROFILE_A
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.status).toBe(403);
    }
  });

  test("emits sal=ownership_denied principal=learner log on learner cross-access", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ownership_denied")
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("principal=learner")
    );
  });
});

// ---------------------------------------------------------------------------
// sal= observability: all paths emit [sal] prefix (BLOCKER-P1-O1)
// ---------------------------------------------------------------------------

describe("sal= observability — all access decisions emit [sal] prefix (BLOCKER-P1-O1)", () => {
  test("emits [sal] prefix on anonymous denial (wall on, no session)", async () => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(null);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[sal]"));
  });

  test("emits [sal] prefix on successful AH grant (wall on)", async () => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(ahSessionA);
    getLearnerSessionMock.mockResolvedValue(null);
    learnerProfileFindUniqueMock.mockResolvedValue(learnerProfileA);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[sal]"));
  });

  test("emits [sal] prefix on successful learner grant (wall on)", async () => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(learnerSessionA);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[sal]"));
  });

  test("emits [sal] prefix on anon grace (wall off, explicit local-dev sentinel)", async () => {
    process.env.NOTES_AUTH_WALL = "false"; // explicit local-dev sentinel
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(null);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[sal]"));
  });

  test("includes sal=<token:8> in log messages", async () => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(null);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    // Token prefix (first 8 chars) should appear in the log
    const tokenPrefix = TOKEN_VALID.slice(0, 8);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`sal=${tokenPrefix}`)
    );
  });
});

// ---------------------------------------------------------------------------
// Revocation: always applies (P1-AC-9)
// ---------------------------------------------------------------------------

describe("checkApiShareAccess — revocation always applies regardless of wall state", () => {
  test("returns 403 for revoked link when wall is off (explicit local-dev sentinel)", async () => {
    process.env.NOTES_AUTH_WALL = "false"; // explicit local-dev sentinel
    shareLinkFindUniqueMock.mockResolvedValue({
      revokedAt: new Date(),
      studentId: STUDENT_A,
      student: { learnerProfileId: LEARNER_PROFILE_A },
    });

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(403);
  });

  test("returns 403 for revoked link when wall is on and session is valid", async () => {
    process.env.NOTES_AUTH_WALL = "true";
    shareLinkFindUniqueMock.mockResolvedValue({
      revokedAt: new Date(),
      studentId: STUDENT_A,
      student: { learnerProfileId: LEARNER_PROFILE_A },
    });
    getAccountHolderSessionMock.mockResolvedValue(ahSessionA);
    learnerProfileFindUniqueMock.mockResolvedValue(learnerProfileA);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(403);
  });

  test("returns 403 for missing link token", async () => {
    // Missing link check happens before wall check — wall state is irrelevant.
    process.env.NOTES_AUTH_WALL = "false"; // local dev sentinel for clarity
    shareLinkFindUniqueMock.mockResolvedValue(null);

    const result = await checkApiShareAccess(makeRequest(), "no-such-token", SHARE_PAGE_PATH);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// API route guard tests — verify public-events/snapshot/audio routes
// use the correct studentId from access result.
// ---------------------------------------------------------------------------

describe("API route integration — studentId comes from access result, not re-fetched link", () => {
  test("checkApiShareAccess returns studentId matching the ShareLink (wall off, local dev)", async () => {
    process.env.NOTES_AUTH_WALL = "false"; // explicit local-dev sentinel
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.studentId).toBe(STUDENT_A);
    }
  });

  test("checkApiShareAccess returns learnerProfileId from the linked student (wall off, local dev)", async () => {
    process.env.NOTES_AUTH_WALL = "false"; // explicit local-dev sentinel
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.learnerProfileId).toBe(LEARNER_PROFILE_A);
    }
  });
});

// ---------------------------------------------------------------------------
// SECURE-BY-DEFAULT fix tests
//
// These tests document the NEW required behavior after fix/sec-share-wall-secure-default:
//   - NOTES_AUTH_WALL unset (env not set) must behave as wall=ON, not wall=OFF.
//   - Only explicit NOTES_AUTH_WALL="false" or "0" disables the wall (local dev).
//
// RED BEFORE: these assertions FAIL against the pre-fix code (env unset = wall OFF = anon
//   access returns allowed:true / resolves without redirect).
// GREEN AFTER: pass once isNotesAuthWallEnabled() is inverted to secure-by-default.
// ---------------------------------------------------------------------------

describe("isNotesAuthWallEnabled — SECURE-BY-DEFAULT new semantics (fix/sec-share-wall-secure-default)", () => {
  test("returns TRUE when NOTES_AUTH_WALL is unset (secure-by-default)", () => {
    delete process.env.NOTES_AUTH_WALL;
    // PRE-FIX: returns false (FAIL). POST-FIX: returns true (PASS).
    expect(isNotesAuthWallEnabled()).toBe(true);
  });

  test("returns TRUE for unrecognized value like 'yes' (only false/0 turns it off)", () => {
    process.env.NOTES_AUTH_WALL = "yes";
    // PRE-FIX: returns false (FAIL). POST-FIX: returns true (PASS).
    expect(isNotesAuthWallEnabled()).toBe(true);
  });

  test("returns FALSE for NOTES_AUTH_WALL=0 (explicit local-dev override)", () => {
    process.env.NOTES_AUTH_WALL = "0";
    // PRE-FIX: returns false (coincidentally passes — 0 was never truthy). POST-FIX: returns false (PASS).
    expect(isNotesAuthWallEnabled()).toBe(false);
  });
});

describe("checkApiShareAccess — SECURE-BY-DEFAULT: env unset → wall ON (fix/sec-share-wall-secure-default)", () => {
  test("[BLOCKER] logged-out + valid token → API returns 401 when NOTES_AUTH_WALL is unset", async () => {
    delete process.env.NOTES_AUTH_WALL; // env unset = new secure default = wall ON
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(null);

    // PRE-FIX: allowed=true (anonymous grace). POST-FIX: allowed=false, status=401.
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(401);
  });

  test("entitled AccountHolder → still access_granted when env is unset (regression guard)", async () => {
    delete process.env.NOTES_AUTH_WALL;
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(ahSessionA);
    getLearnerSessionMock.mockResolvedValue(null);
    learnerProfileFindUniqueMock.mockResolvedValue(learnerProfileA);

    // Should be access_granted in BOTH old and new code (different path, same outcome).
    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(true);
  });

  test("entitled Learner → still access_granted when env is unset (regression guard)", async () => {
    delete process.env.NOTES_AUTH_WALL;
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(learnerSessionA); // matches LEARNER_PROFILE_A

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(true);
  });

  test("NOTES_AUTH_WALL=false → anon grace still reachable (local dev override)", async () => {
    process.env.NOTES_AUTH_WALL = "false"; // explicit local-dev override
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(null);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(true); // anon path still works in local dev
  });

  test("NOTES_AUTH_WALL=0 → anon grace still reachable (local dev override)", async () => {
    process.env.NOTES_AUTH_WALL = "0";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionMock.mockResolvedValue(null);
    getLearnerSessionMock.mockResolvedValue(null);

    const result = await checkApiShareAccess(makeRequest(), TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.allowed).toBe(true);
  });
});

describe("assertCanAccessShareLink — SECURE-BY-DEFAULT: env unset → wall ON (fix/sec-share-wall-secure-default)", () => {
  test("[BLOCKER] PAGE: logged-out + valid token → redirect to login when NOTES_AUTH_WALL is unset", async () => {
    delete process.env.NOTES_AUTH_WALL;
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);
    getLearnerSessionFromHeadersMock.mockResolvedValue(null);
    hasAccountHolderSessionCookieMock.mockResolvedValue(false);
    hasLearnerSessionCookieMock.mockResolvedValue(false);

    // PRE-FIX: resolves successfully (anon access). POST-FIX: throws redirect.
    await expect(
      assertCanAccessShareLink(TOKEN_VALID, SHARE_PAGE_PATH)
    ).rejects.toThrow(/NEXT_REDIRECT:.*\/account\/login/);
  });

  test("NOTES_AUTH_WALL=false → anon grace still works on page route (local dev override)", async () => {
    process.env.NOTES_AUTH_WALL = "false";
    shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
    getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);
    getLearnerSessionFromHeadersMock.mockResolvedValue(null);

    // Should resolve successfully (wall off for local dev)
    const result = await assertCanAccessShareLink(TOKEN_VALID, SHARE_PAGE_PATH);
    expect(result.studentId).toBe(STUDENT_A);
  });
});

// ---------------------------------------------------------------------------
// assertCanAccessShareLink (page variant) — S-2 coverage
//
// Uses DIFFERENT session helpers than checkApiShareAccess:
//   getAccountHolderSessionFromHeaders() and getLearnerSessionFromHeaders()
//   from @/lib/server-session (no req argument — reads from request headers
//   via Next.js's headers() API).
//
// On deny: throws NEXT_NOT_FOUND (notFound()) or NEXT_REDIRECT:... (redirect()).
// On allow: returns { studentId, learnerProfileId }.
// ---------------------------------------------------------------------------

describe("assertCanAccessShareLink (page variant)", () => {
  const TOKEN = TOKEN_VALID;
  const PAGE_PATH = `/s/${TOKEN}`;

  // -------------------------------------------------------------------------
  // Wall OFF: anonymous grace — must pass through without auth check
  // -------------------------------------------------------------------------

  describe("wall OFF — anonymous grace (explicit local-dev sentinel)", () => {
    beforeEach(() => {
      // Must use explicit sentinel after secure-by-default fix.
      process.env.NOTES_AUTH_WALL = "false";
      shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
      getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);
      getLearnerSessionFromHeadersMock.mockResolvedValue(null);
    });

    test("allows anonymous access and returns studentId + learnerProfileId", async () => {
      const result = await assertCanAccessShareLink(TOKEN, PAGE_PATH);

      expect(result.studentId).toBe(STUDENT_A);
      expect(result.learnerProfileId).toBe(LEARNER_PROFILE_A);
    });

    test("does NOT call header-based session helpers in grace mode", async () => {
      await assertCanAccessShareLink(TOKEN, PAGE_PATH);

      expect(getAccountHolderSessionFromHeadersMock).not.toHaveBeenCalled();
      expect(getLearnerSessionFromHeadersMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Wall ON: no session → redirect to /account/login
  // -------------------------------------------------------------------------

  describe("wall ON — no session cookie at all → notes_email redirect", () => {
    beforeEach(() => {
      process.env.NOTES_AUTH_WALL = "true";
      shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
      // Independent oracles: session IDs distinct from student/profile IDs
      getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);
      getLearnerSessionFromHeadersMock.mockResolvedValue(null);
      // No cookie present at all → notes_email path
      hasAccountHolderSessionCookieMock.mockResolvedValue(false);
      hasLearnerSessionCookieMock.mockResolvedValue(false);
    });

    test("throws redirect signal pointing to /account/login", async () => {
      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT:.*\/account\/login/
      );
    });

    test("redirect includes source=notes_email", async () => {
      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT:.*source=notes_email/
      );
    });

    test("redirect includes returnTo with the share page path", async () => {
      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT:.*returnTo=/
      );
    });

    test("uses header-based session helpers (not req-arg helpers)", async () => {
      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT/
      );
      // Confirms server-session helpers were invoked, not the API-route helpers
      expect(getAccountHolderSessionFromHeadersMock).toHaveBeenCalled();
    });
  });

  describe("wall ON — stale/revoked cookie present → session_expired loop-break", () => {
    beforeEach(() => {
      process.env.NOTES_AUTH_WALL = "true";
      shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
      // Sessions resolve to null (expired/revoked token) despite cookie being present
      getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);
      getLearnerSessionFromHeadersMock.mockResolvedValue(null);
      // AH cookie IS present (stale value that failed validation)
      hasAccountHolderSessionCookieMock.mockResolvedValue(true);
      hasLearnerSessionCookieMock.mockResolvedValue(false);
    });

    test("redirects through clear-stale-session handler (breaks the loop)", async () => {
      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT:.*\/api\/auth\/clear-stale-session/
      );
    });

    test("clear-stale-session ?then includes source=session_expired", async () => {
      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /session_expired/
      );
    });

    test("clear-stale-session ?then includes returnTo with share page path", async () => {
      // returnTo is double-encoded inside the ?then= param, so match the key only
      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /returnTo/
      );
    });

    test("emits sal=access_denied_redirect reason=stale_session_cleared log", async () => {
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT/
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("stale_session_cleared")
      );
    });

    test("learner stale cookie also triggers the loop-break path", async () => {
      hasAccountHolderSessionCookieMock.mockResolvedValue(false);
      hasLearnerSessionCookieMock.mockResolvedValue(true);

      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT:.*\/api\/auth\/clear-stale-session/
      );
    });
  });

  // -------------------------------------------------------------------------
  // Wall ON: owning AccountHolder → allowed
  // -------------------------------------------------------------------------

  describe("wall ON — owning AccountHolder → allowed", () => {
    beforeEach(() => {
      process.env.NOTES_AUTH_WALL = "true";
      shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed);
      // AH A owns LearnerProfile A — independent ids, not back-derived from impl
      getAccountHolderSessionFromHeadersMock.mockResolvedValue(ahSessionA);
      getLearnerSessionFromHeadersMock.mockResolvedValue(null);
      learnerProfileFindUniqueMock.mockResolvedValue(learnerProfileA);
    });

    test("grants access and returns studentId", async () => {
      const result = await assertCanAccessShareLink(TOKEN, PAGE_PATH);

      expect(result.studentId).toBe(STUDENT_A);
      expect(result.learnerProfileId).toBe(LEARNER_PROFILE_A);
    });
  });

  // -------------------------------------------------------------------------
  // Wall ON: non-owner AccountHolder → neutral /account/not-my-notes redirect
  // -------------------------------------------------------------------------

  describe("wall ON — non-owner AccountHolder → neutral denial (not-my-notes)", () => {
    beforeEach(() => {
      process.env.NOTES_AUTH_WALL = "true";
      shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed); // StudentA → LearnerProfileA → AH A
      // AH B is logged in — does NOT own LearnerProfile A
      getAccountHolderSessionFromHeadersMock.mockResolvedValue(ahSessionB);
      getLearnerSessionFromHeadersMock.mockResolvedValue(null);
      // DB confirms profile is owned by AH A, not AH B
      learnerProfileFindUniqueMock.mockResolvedValue(learnerProfileA);
    });

    test("redirects to /account/not-my-notes (neutral denial, not generic 404)", async () => {
      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT:.*\/account\/not-my-notes/
      );
    });

    test("emits sal=ownership_denied principal=account_holder log", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT/
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("ownership_denied")
      );
    });
  });

  // -------------------------------------------------------------------------
  // Wall ON: matching learner → allowed
  // -------------------------------------------------------------------------

  describe("wall ON — matching Learner session → allowed", () => {
    beforeEach(() => {
      process.env.NOTES_AUTH_WALL = "true";
      shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed); // learnerProfileId = LEARNER_PROFILE_A
      getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);
      getLearnerSessionFromHeadersMock.mockResolvedValue(learnerSessionA); // learnerProfileId = LEARNER_PROFILE_A
    });

    test("grants access to matching learner and returns studentId", async () => {
      const result = await assertCanAccessShareLink(TOKEN, PAGE_PATH);

      expect(result.studentId).toBe(STUDENT_A);
    });
  });

  // -------------------------------------------------------------------------
  // Wall ON: wrong learner → neutral /account/not-my-notes redirect
  // -------------------------------------------------------------------------

  describe("wall ON — wrong Learner session → neutral denial (not-my-notes)", () => {
    beforeEach(() => {
      process.env.NOTES_AUTH_WALL = "true";
      shareLinkFindUniqueMock.mockResolvedValue(validLinkClaimed); // studentA → LEARNER_PROFILE_A
      getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);
      // Learner B has LEARNER_PROFILE_B — mismatch against LEARNER_PROFILE_A
      getLearnerSessionFromHeadersMock.mockResolvedValue(learnerSessionB);
    });

    test("redirects to /account/not-my-notes when learner does not match the link's student", async () => {
      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT:.*\/account\/not-my-notes/
      );
    });

    test("emits sal=ownership_denied principal=learner log", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(assertCanAccessShareLink(TOKEN, PAGE_PATH)).rejects.toThrow(
        /NEXT_REDIRECT/
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("ownership_denied")
      );
    });
  });
});
