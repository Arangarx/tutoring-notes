/**
 * @jest-environment node
 *
 * Tests for requireAccountHolderSession() — the 3-way auth guard for
 * /account/* dashboard server components.
 *
 * Covers the three branches:
 *   Branch 1 (valid session)   → returns the session object, no redirect.
 *   Branch 2 (stale cookie)    → redirects through /api/auth/clear-stale-session
 *                                 with source=session_expired in the nested login URL.
 *   Branch 3 (no cookie)       → plain /account/login?returnTo=... redirect,
 *                                 no source param (matches prior hand-rolled behavior).
 *
 * Mocks: next/headers (cookie store), @/lib/db (session validation), next/navigation.
 * The real validateAccountHolderSessionFromRawToken (HMAC + DB) runs so that
 * the cookie-read → DB-validate → branch path is exercised end-to-end.
 *
 * Independent oracle: session IDs are distinct fixtures, not back-derived from
 * the implementation's own redirect formula.
 */

// ---------------------------------------------------------------------------
// Environment — before imports so validators pick up the test secret.
// ---------------------------------------------------------------------------

const TEST_AH_SECRET = "test-ah-hmac-secret-32-chars-min!";

beforeAll(() => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_AH_SECRET;
});

afterAll(() => {
  delete process.env.AH_SESSION_HMAC_SECRET;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// next/navigation mock — redirect throws so we can catch + assert the URL.
// ---------------------------------------------------------------------------

jest.mock("next/navigation", () => ({
  __esModule: true,
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// ---------------------------------------------------------------------------
// DB mock — controls what the session-validation DB query returns.
// ---------------------------------------------------------------------------

const ahSessionFindUniqueMock = jest.fn();
const ahSessionUpdateMock = jest.fn().mockResolvedValue({});

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    accountHolderSession: {
      findUnique: (...args: unknown[]) => ahSessionFindUniqueMock(...args),
      update: (...args: unknown[]) => ahSessionUpdateMock(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// next/headers mock — mutable cookie store, reset per test.
// ---------------------------------------------------------------------------

type FakeCookie = { name: string; value: string };
let fakeCookies: FakeCookie[] = [];

jest.mock("next/headers", () => ({
  __esModule: true,
  cookies: jest.fn(async () => ({
    getAll: (name?: string) =>
      name ? fakeCookies.filter((c) => c.name === name) : fakeCookies,
    get: (name: string) => {
      const matches = fakeCookies.filter((c) => c.name === name);
      return matches.length > 0 ? matches[matches.length - 1] : undefined;
    },
  })),
}));

// ---------------------------------------------------------------------------
// Imports after mocks.
// ---------------------------------------------------------------------------

import { hmacToken } from "@/lib/crypto/session-tokens";
import { requireAccountHolderSession } from "@/lib/server-session";

const AH_COOKIE = "mynk_ah_session";

function makeValidAhSessionRow(tokenHash: string) {
  return {
    id: "sess-row-fixture-001",
    accountHolderId: "ah-uuid-fixture-001",
    tokenHash,
    twoFactorVerified: false,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    accountHolder: { tombstonedAt: null },
  };
}

/** Helper: call requireAccountHolderSession and capture the thrown redirect URL. */
async function captureRedirect(returnTo: string): Promise<string> {
  try {
    await requireAccountHolderSession(returnTo);
    throw new Error("Expected a NEXT_REDIRECT but function returned normally");
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.startsWith("NEXT_REDIRECT:")) throw e;
    return msg.slice("NEXT_REDIRECT:".length);
  }
}

// ---------------------------------------------------------------------------
// Branch 1 — valid session: returns session, no redirect.
// ---------------------------------------------------------------------------

describe("requireAccountHolderSession — branch 1: valid session", () => {
  const validRawToken = "valid-token-abcdef1234567890abcdef";

  beforeEach(() => {
    const hash = hmacToken(validRawToken, TEST_AH_SECRET);
    fakeCookies = [{ name: AH_COOKIE, value: validRawToken }];
    ahSessionFindUniqueMock.mockResolvedValue(makeValidAhSessionRow(hash));
  });

  it("returns the session object (non-null) for a valid cookie", async () => {
    const result = await requireAccountHolderSession("/account/dashboard");
    expect(result).not.toBeNull();
    expect(result.accountHolderId).toBe("ah-uuid-fixture-001");
  });

  it("does not redirect when the session is valid", async () => {
    const { redirect } = await import("next/navigation");
    await requireAccountHolderSession("/account/dashboard");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns the same session for deeper paths (children/[id]/notes)", async () => {
    const result = await requireAccountHolderSession("/account/children/lp-abc/notes");
    expect(result.accountHolderId).toBe("ah-uuid-fixture-001");
  });
});

// ---------------------------------------------------------------------------
// Branch 2 — stale cookie: cookie present but DB validation returns null.
// ---------------------------------------------------------------------------

describe("requireAccountHolderSession — branch 2: stale cookie → clear-stale-session redirect", () => {
  const staleRawToken = "stale-token-zyxwvu9876543210abcdef";

  beforeEach(() => {
    fakeCookies = [{ name: AH_COOKIE, value: staleRawToken }];
    // DB returns null → token not found / revoked / expired.
    ahSessionFindUniqueMock.mockResolvedValue(null);
  });

  it("redirects (throws NEXT_REDIRECT) when cookie is present but invalid", async () => {
    await expect(
      requireAccountHolderSession("/account/dashboard")
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("routes through /api/auth/clear-stale-session", async () => {
    const url = await captureRedirect("/account/dashboard");
    expect(url).toMatch(/^\/api\/auth\/clear-stale-session\?then=/);
  });

  it("includes source=session_expired in the decoded login URL", async () => {
    const url = await captureRedirect("/account/dashboard");
    const thenEncoded = new URL(`http://localhost${url}`).searchParams.get("then")!;
    expect(thenEncoded).toContain("source=session_expired");
  });

  it("includes the returnTo path inside the decoded login URL", async () => {
    const url = await captureRedirect("/account/dashboard");
    const thenEncoded = new URL(`http://localhost${url}`).searchParams.get("then")!;
    // thenEncoded is the full /account/login URL — it should contain an encoded returnTo
    expect(thenEncoded).toContain("returnTo=");
    // Decoding the returnTo from the inner URL gives back the original path
    const innerLoginUrl = new URL(`http://localhost${thenEncoded}`);
    const innerReturnTo = innerLoginUrl.searchParams.get("returnTo")!;
    expect(innerReturnTo).toBe("/account/dashboard");
  });

  it("encodes the returnTo for a deeper path (children/[id]/notes) correctly", async () => {
    fakeCookies = [{ name: AH_COOKIE, value: staleRawToken }];
    ahSessionFindUniqueMock.mockResolvedValue(null);

    const url = await captureRedirect("/account/children/lp-abc123/notes");
    const thenEncoded = new URL(`http://localhost${url}`).searchParams.get("then")!;
    const innerLoginUrl = new URL(`http://localhost${thenEncoded}`);
    const innerReturnTo = innerLoginUrl.searchParams.get("returnTo")!;
    expect(innerReturnTo).toBe("/account/children/lp-abc123/notes");
  });

  it("produces exactly the same URL structure as assertCanAccessShareLink (mirror test)", async () => {
    const returnTo = "/account/dashboard";
    const url = await captureRedirect(returnTo);
    // Construct the expected URL independently (oracle — not back-derived from impl).
    const expectedThen = `/account/login?returnTo=${encodeURIComponent(returnTo)}&source=session_expired`;
    const expected = `/api/auth/clear-stale-session?then=${encodeURIComponent(expectedThen)}`;
    expect(url).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Branch 3 — no cookie: plain login redirect, no source param.
// ---------------------------------------------------------------------------

describe("requireAccountHolderSession — branch 3: no cookie → plain login redirect", () => {
  beforeEach(() => {
    fakeCookies = [];
  });

  it("redirects (throws NEXT_REDIRECT) when no cookie is present", async () => {
    await expect(
      requireAccountHolderSession("/account/dashboard")
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("redirects to /account/login", async () => {
    const url = await captureRedirect("/account/dashboard");
    expect(url).toMatch(/^\/account\/login\?/);
  });

  it("includes returnTo in the redirect URL for /account/dashboard", async () => {
    const url = await captureRedirect("/account/dashboard");
    const params = new URL(`http://localhost${url}`).searchParams;
    expect(params.get("returnTo")).toBe("/account/dashboard");
  });

  it("does NOT include a source param in the no-cookie redirect", async () => {
    const url = await captureRedirect("/account/dashboard");
    expect(url).not.toContain("source=");
  });

  it("does NOT route through clear-stale-session when no cookie is present", async () => {
    const url = await captureRedirect("/account/dashboard");
    expect(url).not.toContain("clear-stale-session");
  });

  it("correctly encodes a dynamic returnTo path (children/[id]/devices)", async () => {
    const url = await captureRedirect("/account/children/lp-abc123/devices");
    const params = new URL(`http://localhost${url}`).searchParams;
    expect(params.get("returnTo")).toBe("/account/children/lp-abc123/devices");
  });

  it("does not query the DB when no cookie is present", async () => {
    await captureRedirect("/account/dashboard");
    expect(ahSessionFindUniqueMock).not.toHaveBeenCalled();
  });
});
