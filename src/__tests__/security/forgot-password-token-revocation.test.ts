/**
 * Security regression: POST /api/auth/account-holder/forgot-password must
 * revoke any existing unused PASSWORD_RESET tokens before issuing a new one.
 *
 * Without this, an attacker who can rotate IPs (bypassing the in-memory rate
 * limit) could accumulate many valid reset tokens for the same account. Each
 * token is valid for 1 hour, so multiple active tokens widen the attack window.
 *
 * Asserts:
 *  - deleteMany is called with purpose=PASSWORD_RESET + consumedAt=null
 *    BEFORE the new token is created.
 *  - create is still called to mint the new token.
 *  - The route always returns 200 (anti-enumeration preserved).
 */

const mockFindUnique = jest.fn();
const mockDeleteMany = jest.fn();
const mockCreate = jest.fn();
const mockStubSendEmail = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    accountHolder: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    accountHolderEmailToken: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

jest.mock("@/lib/account-holder-email", () => ({
  stubSendAccountHolderEmail: (...args: unknown[]) => mockStubSendEmail(...args),
}));

jest.mock("@/lib/public-url", () => ({
  getPublicBaseUrl: () => "https://app.example.com",
  getRequestBaseUrlSafe: () => "https://app.example.com",
}));

import { POST } from "@/app/api/auth/account-holder/forgot-password/route";
import { NextRequest } from "next/server";

function makeRequest(email: string): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/account-holder/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/auth/account-holder/forgot-password — token revocation", () => {
  const VERIFIED_ACCOUNT = {
    id: "ah-test-001",
    email: "test@example.com",
    emailVerifiedAt: new Date("2026-01-01"),
    tombstonedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteMany.mockResolvedValue({ count: 2 });
    mockCreate.mockResolvedValue({ id: "tok-001" });
    mockStubSendEmail.mockResolvedValue(undefined);
  });

  test("deleteMany revokes existing PASSWORD_RESET tokens before creating a new one", async () => {
    mockFindUnique.mockResolvedValue(VERIFIED_ACCOUNT);

    const callOrder: string[] = [];
    mockDeleteMany.mockImplementation(() => {
      callOrder.push("deleteMany");
      return Promise.resolve({ count: 1 });
    });
    mockCreate.mockImplementation(() => {
      callOrder.push("create");
      return Promise.resolve({ id: "tok-new" });
    });

    const res = await POST(makeRequest("test@example.com"));
    expect(res.status).toBe(200);

    // deleteMany must be called before create
    expect(callOrder).toEqual(["deleteMany", "create"]);
  });

  test("deleteMany is called with the correct scope: account + PURPOSE + unconsumed", async () => {
    mockFindUnique.mockResolvedValue(VERIFIED_ACCOUNT);

    await POST(makeRequest("test@example.com"));

    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountHolderId: VERIFIED_ACCOUNT.id,
          purpose: "PASSWORD_RESET",
          consumedAt: null,
        }),
      })
    );
  });

  test("returns 200 even when account does not exist (anti-enumeration)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest("noone@example.com"));
    expect(res.status).toBe(200);
    // deleteMany and create must NOT be called for nonexistent accounts
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("returns 200 when account exists but email is not verified (anti-enumeration)", async () => {
    mockFindUnique.mockResolvedValue({ ...VERIFIED_ACCOUNT, emailVerifiedAt: null });
    const res = await POST(makeRequest("test@example.com"));
    expect(res.status).toBe(200);
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
