/**
 * @jest-environment node
 *
 * Integration-style tests for the server-session multi-cookie read path.
 *
 * Purpose: close the blind spot identified in the auth-wall diagnosis where
 * the existing share-access-scope tests mock `getAccountHolderSessionFromHeaders`
 * entirely and never exercise the real cookie-read + DB-validate path.
 *
 * Scope: tests for `getAccountHolderSessionFromHeaders`, `getLearnerSessionFromHeaders`,
 * `hasAccountHolderSessionCookie`, and `hasLearnerSessionCookie` from
 * `@/lib/server-session`.
 *
 * Mocks: only the DB layer (`@/lib/db`) and `next/headers` are mocked.
 * The real `validateAccountHolderSessionFromRawToken` and
 * `validateLearnerSessionFromRawToken` run, exercising the full HMAC + DB path.
 *
 * Independent oracle principle: session IDs and accountHolder IDs in fixture
 * data are distinct and not back-derived from the implementation.
 *
 * Test groups:
 *   1. getAccountHolderSessionFromHeaders — single valid cookie
 *   2. getAccountHolderSessionFromHeaders — duplicate cookies, stale is last
 *      (regression for Q3-A: stale last → still resolves valid first)
 *   3. getAccountHolderSessionFromHeaders — all cookies stale → returns null
 *   4. getAccountHolderSessionFromHeaders — no cookie → returns null
 *   5. getLearnerSessionFromHeaders — single valid cookie
 *   6. getLearnerSessionFromHeaders — duplicate cookies, stale is last
 *   7. hasAccountHolderSessionCookie / hasLearnerSessionCookie — presence detection
 */

// ---------------------------------------------------------------------------
// Environment setup — must run before imports.
// ---------------------------------------------------------------------------

const TEST_AH_SECRET = "test-ah-hmac-secret-32-chars-min!";
const TEST_LRN_SECRET = "test-lrn-hmac-secret-32-chars-min";

beforeAll(() => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_AH_SECRET;
  process.env.LEARNER_SESSION_HMAC_SECRET = TEST_LRN_SECRET;
});

afterAll(() => {
  delete process.env.AH_SESSION_HMAC_SECRET;
  delete process.env.LEARNER_SESSION_HMAC_SECRET;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// DB mock — controls what the DB returns for a given tokenHash lookup.
// ---------------------------------------------------------------------------

const ahSessionFindUniqueMock = jest.fn();
const learnerDeviceSessionFindUniqueMock = jest.fn();
const learnerDeviceSessionUpdateMock = jest.fn();
const ahSessionUpdateMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    accountHolderSession: {
      findUnique: (...args: unknown[]) => ahSessionFindUniqueMock(...args),
      update: (...args: unknown[]) => ahSessionUpdateMock(...args),
    },
    learnerDeviceSession: {
      findUnique: (...args: unknown[]) => learnerDeviceSessionFindUniqueMock(...args),
      update: (...args: unknown[]) => learnerDeviceSessionUpdateMock(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// next/headers mock — controls what cookies() returns.
// Mutable variable lets each test inject its own cookie list.
// ---------------------------------------------------------------------------

type FakeCookie = { name: string; value: string };
let fakeCookies: FakeCookie[] = [];

jest.mock("next/headers", () => ({
  __esModule: true,
  cookies: jest.fn(async () => ({
    getAll: (name?: string) =>
      name
        ? fakeCookies.filter((c) => c.name === name)
        : fakeCookies,
    get: (name: string) => {
      const matches = fakeCookies.filter((c) => c.name === name);
      return matches.length > 0 ? matches[matches.length - 1] : undefined;
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helpers — build real HMAC tokens so we can set up DB mocks to match.
// ---------------------------------------------------------------------------

import { hmacToken } from "@/lib/crypto/session-tokens";

function makeAhSessionRow(overrides: {
  tokenHash: string;
  accountHolderId?: string;
  revokedAt?: Date | null;
  expiresAt?: Date;
  tombstonedAt?: Date | null;
}) {
  return {
    id: "sess-row-001",
    accountHolderId: overrides.accountHolderId ?? "ah-uuid-001",
    tokenHash: overrides.tokenHash,
    twoFactorVerified: false,
    revokedAt: overrides.revokedAt ?? null,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
    accountHolder: { tombstonedAt: overrides.tombstonedAt ?? null },
  };
}

function makeLearnerSessionRow(overrides: {
  tokenHash: string;
  learnerProfileId?: string;
  accountHolderId?: string;
  revokedAt?: Date | null;
  expiresAt?: Date;
  tombstonedAt?: Date | null;
}) {
  return {
    id: "lrn-sess-row-001",
    learnerProfileId: overrides.learnerProfileId ?? "lp-uuid-001",
    tokenHash: overrides.tokenHash,
    revokedAt: overrides.revokedAt ?? null,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
    learnerProfile: {
      accountHolderId: overrides.accountHolderId ?? "ah-uuid-001",
      tombstonedAt: overrides.tombstonedAt ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Import under test (after all mocks).
// ---------------------------------------------------------------------------

import {
  getAccountHolderSessionFromHeaders,
  getLearnerSessionFromHeaders,
  hasAccountHolderSessionCookie,
  hasLearnerSessionCookie,
} from "@/lib/server-session";

const AH_COOKIE = "mynk_ah_session";
const LEARNER_COOKIE = "mynk_learner_session";

// ---------------------------------------------------------------------------
// Group 1 — getAccountHolderSessionFromHeaders: single valid cookie
// ---------------------------------------------------------------------------

describe("getAccountHolderSessionFromHeaders — single valid cookie", () => {
  const rawToken = "valid-token-abcdef1234567890abcdef";

  beforeEach(() => {
    const hash = hmacToken(rawToken, TEST_AH_SECRET);
    fakeCookies = [{ name: AH_COOKIE, value: rawToken }];
    ahSessionFindUniqueMock.mockResolvedValue(makeAhSessionRow({ tokenHash: hash }));
    ahSessionUpdateMock.mockResolvedValue({});
  });

  it("returns session data for a single valid AH cookie", async () => {
    const result = await getAccountHolderSessionFromHeaders();
    expect(result).not.toBeNull();
    expect(result!.accountHolderId).toBe("ah-uuid-001");
  });

  it("queries DB with the HMAC hash of the cookie value (not the raw value)", async () => {
    await getAccountHolderSessionFromHeaders();
    const expectedHash = hmacToken(rawToken, TEST_AH_SECRET);
    expect(ahSessionFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: expectedHash } })
    );
  });
});

// ---------------------------------------------------------------------------
// Group 2 — getAccountHolderSessionFromHeaders: duplicate cookies, stale last
//
// Regression test for the loop root cause: stale token is the LAST value
// (Map-API / last-set-wins), but the valid token appears earlier. The fix
// tries ALL candidates; returning the first that validates means the valid
// earlier token is found even when the stale one is tried first.
// ---------------------------------------------------------------------------

describe("getAccountHolderSessionFromHeaders — duplicate cookies, stale token is last (loop root cause regression)", () => {
  const validRaw = "valid-raw-token-abcdef1234567890x";
  const staleRaw = "stale-raw-token-zyxwvu9876543210x";

  beforeEach(() => {
    const validHash = hmacToken(validRaw, TEST_AH_SECRET);
    const staleHash = hmacToken(staleRaw, TEST_AH_SECRET);

    // stale cookie is LAST (Map-API last-value = the one tried first in reverse)
    fakeCookies = [
      { name: AH_COOKIE, value: validRaw },  // index 0 — tried second
      { name: AH_COOKIE, value: staleRaw },  // index 1 — tried first (last-set)
    ];

    ahSessionFindUniqueMock.mockImplementation(({ where }: { where: { tokenHash: string } }) => {
      if (where.tokenHash === staleHash) {
        // Stale: return null (revoked / not found)
        return Promise.resolve(null);
      }
      if (where.tokenHash === validHash) {
        // Valid: return a good row
        return Promise.resolve(makeAhSessionRow({ tokenHash: validHash, accountHolderId: "ah-valid-001" }));
      }
      return Promise.resolve(null);
    });
    ahSessionUpdateMock.mockResolvedValue({});
  });

  it("resolves the valid session even when the stale token is tried first (loop regression)", async () => {
    const result = await getAccountHolderSessionFromHeaders();
    // Must NOT return null — the valid cookie was found despite the stale one being tried first
    expect(result).not.toBeNull();
    expect(result!.accountHolderId).toBe("ah-valid-001");
  });

  it("queries the DB at least twice (once for stale, once for valid)", async () => {
    await getAccountHolderSessionFromHeaders();
    // Should have tried both candidates
    expect(ahSessionFindUniqueMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Group 3 — getAccountHolderSessionFromHeaders: all cookies invalid → null
//
// Verifies the loop-break trigger: cookie IS present but all candidates fail
// validation → returns null so assertCanAccessShareLink can detect "stale cookie"
// and route through clear-stale-session instead of looping.
// ---------------------------------------------------------------------------

describe("getAccountHolderSessionFromHeaders — all cookies invalid (expired/revoked) → null", () => {
  const staleRaw1 = "stale-token-one-abcdef1234567890ab";
  const staleRaw2 = "stale-token-two-zyxwvu9876543210cd";

  beforeEach(() => {
    fakeCookies = [
      { name: AH_COOKIE, value: staleRaw1 },
      { name: AH_COOKIE, value: staleRaw2 },
    ];
    // Both hashes → DB returns null (session not found / expired)
    ahSessionFindUniqueMock.mockResolvedValue(null);
  });

  it("returns null when all cookie candidates fail validation", async () => {
    const result = await getAccountHolderSessionFromHeaders();
    expect(result).toBeNull();
  });

  it("tries every candidate before returning null", async () => {
    await getAccountHolderSessionFromHeaders();
    expect(ahSessionFindUniqueMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Group 4 — getAccountHolderSessionFromHeaders: no cookie → null
// ---------------------------------------------------------------------------

describe("getAccountHolderSessionFromHeaders — no cookie → null", () => {
  beforeEach(() => {
    fakeCookies = [];
  });

  it("returns null immediately when no AH session cookie is present", async () => {
    const result = await getAccountHolderSessionFromHeaders();
    expect(result).toBeNull();
  });

  it("does not query the DB when no cookie is present", async () => {
    await getAccountHolderSessionFromHeaders();
    expect(ahSessionFindUniqueMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Group 5 — getLearnerSessionFromHeaders: single valid cookie
// ---------------------------------------------------------------------------

describe("getLearnerSessionFromHeaders — single valid cookie", () => {
  const rawToken = "valid-learner-token-abcdef1234xyzw";

  beforeEach(() => {
    const hash = hmacToken(rawToken, TEST_LRN_SECRET);
    fakeCookies = [{ name: LEARNER_COOKIE, value: rawToken }];
    learnerDeviceSessionFindUniqueMock.mockResolvedValue(
      makeLearnerSessionRow({ tokenHash: hash, learnerProfileId: "lp-uuid-002" })
    );
    learnerDeviceSessionUpdateMock.mockResolvedValue({});
  });

  it("returns session data for a single valid learner cookie", async () => {
    const result = await getLearnerSessionFromHeaders();
    expect(result).not.toBeNull();
    expect(result!.learnerProfileId).toBe("lp-uuid-002");
  });
});

// ---------------------------------------------------------------------------
// Group 6 — getLearnerSessionFromHeaders: duplicate cookies, stale last
// ---------------------------------------------------------------------------

describe("getLearnerSessionFromHeaders — duplicate cookies, stale token is last", () => {
  const validRaw = "valid-lrn-token-abcdef12345678901";
  const staleRaw = "stale-lrn-token-zyxwvu98765432101";

  beforeEach(() => {
    const validHash = hmacToken(validRaw, TEST_LRN_SECRET);
    const staleHash = hmacToken(staleRaw, TEST_LRN_SECRET);

    fakeCookies = [
      { name: LEARNER_COOKIE, value: validRaw },
      { name: LEARNER_COOKIE, value: staleRaw }, // last — tried first
    ];

    learnerDeviceSessionFindUniqueMock.mockImplementation(({ where }: { where: { tokenHash: string } }) => {
      if (where.tokenHash === staleHash) return Promise.resolve(null);
      if (where.tokenHash === validHash) {
        return Promise.resolve(
          makeLearnerSessionRow({ tokenHash: validHash, learnerProfileId: "lp-valid-002" })
        );
      }
      return Promise.resolve(null);
    });
    learnerDeviceSessionUpdateMock.mockResolvedValue({});
  });

  it("resolves the valid session even when the stale token is tried first", async () => {
    const result = await getLearnerSessionFromHeaders();
    expect(result).not.toBeNull();
    expect(result!.learnerProfileId).toBe("lp-valid-002");
  });
});

// ---------------------------------------------------------------------------
// Group 7 — hasAccountHolderSessionCookie / hasLearnerSessionCookie
// ---------------------------------------------------------------------------

describe("hasAccountHolderSessionCookie — cookie presence detection", () => {
  it("returns true when a non-empty AH session cookie is present", async () => {
    fakeCookies = [{ name: AH_COOKIE, value: "some-token-value" }];
    expect(await hasAccountHolderSessionCookie()).toBe(true);
  });

  it("returns false when no AH session cookie is present", async () => {
    fakeCookies = [];
    expect(await hasAccountHolderSessionCookie()).toBe(false);
  });

  it("returns false when AH cookie has an empty value", async () => {
    fakeCookies = [{ name: AH_COOKIE, value: "" }];
    expect(await hasAccountHolderSessionCookie()).toBe(false);
  });

  it("returns true when multiple AH cookies are present (at least one non-empty)", async () => {
    fakeCookies = [
      { name: AH_COOKIE, value: "stale-but-non-empty" },
      { name: AH_COOKIE, value: "also-stale" },
    ];
    expect(await hasAccountHolderSessionCookie()).toBe(true);
  });

  it("returns false for cookies with different names", async () => {
    fakeCookies = [{ name: "other_cookie", value: "unrelated" }];
    expect(await hasAccountHolderSessionCookie()).toBe(false);
  });
});

describe("hasLearnerSessionCookie — cookie presence detection", () => {
  it("returns true when a non-empty learner session cookie is present", async () => {
    fakeCookies = [{ name: LEARNER_COOKIE, value: "some-learner-token" }];
    expect(await hasLearnerSessionCookie()).toBe(true);
  });

  it("returns false when no learner session cookie is present", async () => {
    fakeCookies = [];
    expect(await hasLearnerSessionCookie()).toBe(false);
  });

  it("AH cookie presence does not affect learner cookie detection", async () => {
    fakeCookies = [{ name: AH_COOKIE, value: "ah-token" }];
    expect(await hasLearnerSessionCookie()).toBe(false);
  });
});
