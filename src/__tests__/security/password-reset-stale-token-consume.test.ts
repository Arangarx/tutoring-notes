/**
 * @jest-environment node
 *
 * Security test — S1: AH realm password-reset stale-token invalidation.
 *
 * The issuance path (forgot-password route) already deletes prior unused tokens
 * before minting a new one. However, two concurrent forgot-password requests can
 * race: both see zero existing tokens, both create a token, and both tokens
 * coexist. Without a corresponding cleanup in the CONSUME path, the stale token
 * from the losing request could be used to reset the password a SECOND time after
 * the winner's token was already consumed.
 *
 * Fix: the consume path (reset-password route) must also call deleteMany on
 * remaining unused PASSWORD_RESET tokens for the same account as part of its
 * transaction. This is defense-in-depth that mirrors the pattern already used by
 * the legacy tutor realm's completePasswordReset().
 *
 * RED-BEFORE proof:
 *   On pre-fix code the transaction contains only 3 ops (update password, mark
 *   consumed, revoke sessions). deleteMany for remaining tokens is ABSENT.
 *   → test "consume path calls deleteMany..." FAILS.
 *
 * GREEN-AFTER:
 *   The transaction now includes a 4th op: deleteMany remaining unused tokens.
 *   → all tests in this file PASS.
 *
 * Also tests that the stale-token race-condition scenario is fully blocked by
 * the fix using a stateful mock that simulates actual DB token deletion.
 */

// ---------------------------------------------------------------------------
// Mocks — must precede all imports that load the route under test
// ---------------------------------------------------------------------------

// Stateful in-memory token store. Allows deleteMany to actually remove tokens
// so that a subsequent findUnique returns null — proving the race is blocked.
interface TokenRow {
  id: string;
  tokenHash: string;
  accountHolderId: string;
  purpose: string;
  consumedAt: Date | null;
  expiresAt: Date;
  accountHolder: { id: string; email: string; passwordHash: string };
}
const tokenStore = new Map<string, TokenRow>();

const mockFindUnique = jest.fn();
const mockAccountHolderUpdate = jest.fn();
const mockEmailTokenUpdate = jest.fn();
const mockSessionUpdateMany = jest.fn();
const mockDeleteMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    accountHolder: {
      update: (...args: unknown[]) => mockAccountHolderUpdate(...args),
    },
    accountHolderEmailToken: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockEmailTokenUpdate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    accountHolderSession: {
      updateMany: (...args: unknown[]) => mockSessionUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const mockHashPassword = jest.fn();
jest.mock("@/lib/account-holder-auth", () => ({
  hashAccountHolderPassword: (...args: unknown[]) => mockHashPassword(...args),
}));

const mockCreateSession = jest.fn();
const mockBuildCookie = jest.fn();
jest.mock("@/lib/account-holder-session", () => ({
  createAccountHolderSession: (...args: unknown[]) => mockCreateSession(...args),
  buildAhSessionCookie: (...args: unknown[]) => mockBuildCookie(...args),
  AH_SESSION_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/auth/account-holder/reset-password/route";
import { NextRequest } from "next/server";
import { hashToken } from "@/lib/crypto/session-tokens";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Use fixed raw token strings so we can pre-compute their hashes
const T3_RAW = "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";
const T1_RAW = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const T3_HASH = hashToken(T3_RAW);
const T1_HASH = hashToken(T1_RAW);

const ACCOUNT_HOLDER = {
  id: "ah-consume-test-001",
  email: "reset-test@example.com",
  passwordHash: "old_hash",
};

function makeTokenRow(id: string, tokenHash: string): TokenRow {
  return {
    id,
    tokenHash,
    accountHolderId: ACCOUNT_HOLDER.id,
    purpose: "PASSWORD_RESET",
    consumedAt: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    accountHolder: ACCOUNT_HOLDER,
  };
}

const T3_ROW = makeTokenRow("tok-T3", T3_HASH);
const T1_ROW = makeTokenRow("tok-T1", T1_HASH);

// Strong password that passes validatePasswordStrength
const STRONG_PASSWORD = "Correct-Horse-Battery!1";

function makeConsumeRequest(rawToken: string, password: string): NextRequest {
  return new NextRequest(
    "https://app.example.com/api/auth/account-holder/reset-password",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: password }),
    }
  );
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupStatefulMocks() {
  // findUnique: looks up from the stateful tokenStore
  mockFindUnique.mockImplementation(
    ({ where: { tokenHash } }: { where: { tokenHash: string } }) =>
      Promise.resolve(tokenStore.get(tokenHash) ?? null)
  );

  // deleteMany: removes matching tokens from the store (simulates real DB).
  // Matches the exact where clause the consume path must use.
  mockDeleteMany.mockImplementation(
    ({
      where,
    }: {
      where: {
        accountHolderId: string;
        purpose: string;
        consumedAt: null;
        NOT?: { id: string };
      };
    }) => {
      let count = 0;
      for (const [hash, tok] of tokenStore.entries()) {
        if (
          tok.accountHolderId === where.accountHolderId &&
          tok.purpose === where.purpose &&
          tok.consumedAt === null &&
          (!where.NOT || tok.id !== where.NOT.id)
        ) {
          tokenStore.delete(hash);
          count++;
        }
      }
      return Promise.resolve({ count });
    }
  );

  // $transaction: runs in-sequence so individual mocks execute
  // (Prisma array-style: each op is already called when building the array,
  //  so the mock just needs to return a resolved promise)
  mockTransaction.mockImplementation(async (ops: Promise<unknown>[]) => {
    return Promise.all(ops);
  });

  // emailToken.update: mark token consumed in the store
  mockEmailTokenUpdate.mockImplementation(
    ({
      where: { id },
      data: { consumedAt },
    }: {
      where: { id: string };
      data: { consumedAt: Date };
    }) => {
      for (const [hash, tok] of tokenStore.entries()) {
        if (tok.id === id) {
          tokenStore.set(hash, { ...tok, consumedAt });
        }
      }
      return Promise.resolve({});
    }
  );

  mockAccountHolderUpdate.mockResolvedValue({});
  mockSessionUpdateMany.mockResolvedValue({ count: 0 });
  mockHashPassword.mockResolvedValue("new_password_hash");
  mockCreateSession.mockResolvedValue({
    rawToken: "fresh-session-tok",
    sessionId: "sess-new-001",
  });
  mockBuildCookie.mockReturnValue("mynk_ah_session=fresh; HttpOnly");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AH realm — reset-password consume path stale-token invalidation (S1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tokenStore.clear();
    process.env.AH_SESSION_HMAC_SECRET = "test-hmac-secret-32-chars-minimum-ok";
    setupStatefulMocks();
  });

  afterEach(() => {
    delete process.env.AH_SESSION_HMAC_SECRET;
  });

  // -------------------------------------------------------------------------
  // RED-BEFORE proof: deleteMany must be called in the consume transaction
  // -------------------------------------------------------------------------

  test(
    "consume path calls deleteMany for remaining unused PASSWORD_RESET tokens " +
      "(RED on pre-fix code, GREEN after fix)",
    async () => {
      tokenStore.set(T3_HASH, T3_ROW);

      const res = await POST(makeConsumeRequest(T3_RAW, STRONG_PASSWORD));
      expect(res.status).toBe(200);

      // deleteMany MUST be called with the correct scope:
      //   - same accountHolderId
      //   - purpose = PASSWORD_RESET
      //   - unconsumed only (consumedAt: null)
      //   - NOT the token we just consumed (NOT: { id: tokenRow.id })
      //
      // On pre-fix code: deleteMany is NOT in the consume transaction → FAILS (RED).
      // On fixed code:   deleteMany IS called → PASSES (GREEN).
      expect(mockDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountHolderId: ACCOUNT_HOLDER.id,
            purpose: "PASSWORD_RESET",
            consumedAt: null,
            NOT: { id: T3_ROW.id },
          }),
        })
      );
    }
  );

  // -------------------------------------------------------------------------
  // Race-condition / stale-token scenario
  // -------------------------------------------------------------------------

  test(
    "stale token from race condition cannot complete reset after the valid token is consumed",
    async () => {
      // Simulate: two concurrent forgot-password requests raced.
      // T1 was minted first; T3 was minted second (T1 should have been deleted
      // but survived the race).  Both tokens are in the DB simultaneously.
      tokenStore.set(T3_HASH, T3_ROW);
      tokenStore.set(T1_HASH, T1_ROW);

      // Step 1: Consume the most-recently-issued token (T3) — should succeed.
      const res3 = await POST(makeConsumeRequest(T3_RAW, STRONG_PASSWORD));
      expect(res3.status).toBe(200);

      // Step 2: After consuming T3 the fix must have deleted T1.
      // Resetting mocks that track calls but keeping the stateful store.
      // T1 should now be absent from the store (deleted by the consume's deleteMany).
      // On pre-fix code: T1 remains → consume returns 200 (SECURITY BUG).
      // On fixed code:   T1 is deleted → consume returns 400 (SECURE).
      const res1 = await POST(makeConsumeRequest(T1_RAW, STRONG_PASSWORD));
      expect(res1.status).toBe(400);

      const body1 = (await res1.json()) as { error?: string };
      expect(body1.error).toBe("link_expired");
    }
  );

  // -------------------------------------------------------------------------
  // Sanity: latest token still completes successfully
  // -------------------------------------------------------------------------

  test("the consumed token completes the reset and returns ok + session", async () => {
    tokenStore.set(T3_HASH, T3_ROW);

    const res = await POST(makeConsumeRequest(T3_RAW, STRONG_PASSWORD));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok?: boolean; sessionId?: string };
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBe("sess-new-001");
  });

  // -------------------------------------------------------------------------
  // Already-consumed token is rejected
  // -------------------------------------------------------------------------

  test("already-consumed token returns 400 (link_expired)", async () => {
    // T3 is consumed (consumedAt set)
    tokenStore.set(T3_HASH, {
      ...T3_ROW,
      consumedAt: new Date(Date.now() - 1000),
    });

    const res = await POST(makeConsumeRequest(T3_RAW, STRONG_PASSWORD));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("link_expired");
  });

  // -------------------------------------------------------------------------
  // Non-existent token is rejected
  // -------------------------------------------------------------------------

  test("non-existent token returns 400 (link_expired)", async () => {
    // tokenStore is empty — no token to find
    const res = await POST(makeConsumeRequest(T1_RAW, STRONG_PASSWORD));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("link_expired");
  });

  // -------------------------------------------------------------------------
  // Expired token is rejected
  // -------------------------------------------------------------------------

  test("expired token returns 400 (link_expired)", async () => {
    tokenStore.set(T3_HASH, {
      ...T3_ROW,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await POST(makeConsumeRequest(T3_RAW, STRONG_PASSWORD));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("link_expired");
  });
});
