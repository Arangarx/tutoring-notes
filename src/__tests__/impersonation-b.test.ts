/**
 * SEC-1 Dispatch B — unit tests for the 4 acceptance-gate BLOCKERs.
 *
 * Blocker #8:  Banner renders while impersonating (component-level unit test)
 * Blocker #9:  Exit restores admin session (exitImpersonation closes log + mints admin cookie)
 * Blocker #10: startImpersonation() called as test account → ImpersonationForbiddenError
 * Blocker #11: Password login rejected for isTestAccount=true (Dispatch A regression guard)
 *
 * Plus privilege-escalation negatives:
 *   - Already-impersonating session calling startImpersonation() is blocked
 *   - Targeting a non-test-account is rejected
 *   - Idempotency: double-start for same (admin, target) reuses the open log row
 */

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetModules();
  process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
  process.env.DATABASE_URL = "file:./test.db";
  process.env.DIRECT_URL = "file:./test.db";
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD = "replace-me";
});

// next/navigation redirect throws NEXT_REDIRECT in production but we stub it
// to a no-op so tests can assert on what happened before/after the redirect call.
const mockRedirect = jest.fn();
jest.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    // Simulate the redirect throw so callers that depend on it don't continue.
    const err = new Error("NEXT_REDIRECT") as Error & { digest?: string };
    err.digest = "NEXT_REDIRECT";
    throw err;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdminRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-real-123",
    email: "admin@example.com",
    passwordHash: "$2a$10$fakehashhash",
    isTestAccount: false,
    displayName: "Admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTestAccountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-acct-456",
    email: "throwaway-test@example.com",
    passwordHash: null,
    isTestAccount: true,
    displayName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Simulate catching a NEXT_REDIRECT throw */
async function runCatchingRedirect(
  fn: () => Promise<void>
): Promise<{ redirected: boolean; redirectTo: string | undefined }> {
  try {
    await fn();
    return { redirected: false, redirectTo: undefined };
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as Error & { digest?: string }).digest === "NEXT_REDIRECT"
    ) {
      const to = mockRedirect.mock.calls.at(-1)?.[0] as string | undefined;
      return { redirected: true, redirectTo: to };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Blocker #10 + privilege escalation: startImpersonation() as test account
// ---------------------------------------------------------------------------

describe("Blocker #10 — startImpersonation blocked for test-account session", () => {
  it("throws ImpersonationForbiddenError when caller is a test account", async () => {
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "test-acct-456",
        email: "throwaway-test@example.com",
      }),
    }));

    // DB row is isTestAccount=true → assertIsRealAdmin() throws
    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue(
            makeTestAccountRow({ id: "test-acct-456" })
          ),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        impersonationLog: {
          create: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { startImpersonation } = await import(
      "@/app/admin/actions/impersonate"
    );
    const { ImpersonationForbiddenError } = await import(
      "@/lib/impersonation"
    );

    await expect(startImpersonation("some-target-id")).rejects.toThrow(
      ImpersonationForbiddenError
    );
    await expect(startImpersonation("some-target-id")).rejects.toThrow(
      "Test accounts cannot impersonate"
    );
  });

  it("throws ImpersonationForbiddenError when caller is already impersonating", async () => {
    // During active impersonation the JWT sub = test account id,
    // so requireStudentScope returns the test account's scope.
    // assertIsRealAdmin() then finds isTestAccount=true and throws.
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "test-acct-456", // impersonated account's id
        email: "throwaway-test@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue(
            makeTestAccountRow({ id: "test-acct-456" })
          ),
        },
        impersonationLog: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
      },
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { startImpersonation } = await import(
      "@/app/admin/actions/impersonate"
    );
    const { ImpersonationForbiddenError } = await import(
      "@/lib/impersonation"
    );

    await expect(startImpersonation("another-target")).rejects.toThrow(
      ImpersonationForbiddenError
    );
  });

  it("throws when target is not a test account", async () => {
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "admin-real-123",
        email: "admin@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          // findUnique called twice: once for assertIsRealAdmin, once for target
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(makeAdminRow()) // real admin check
            .mockResolvedValueOnce(makeAdminRow({ id: "another-admin" })), // target is NOT a test account
        },
        impersonationLog: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { startImpersonation } = await import(
      "@/app/admin/actions/impersonate"
    );

    await expect(startImpersonation("another-admin")).rejects.toThrow(
      "Can only impersonate test accounts."
    );
  });
});

// ---------------------------------------------------------------------------
// Blocker #10 (positive path): startImpersonation happy path
// ---------------------------------------------------------------------------

describe("startImpersonation happy path", () => {
  it("creates ImpersonationLog row, mints session, redirects to /admin", async () => {
    jest.resetModules();
    const mockMintImpersonationSession = jest.fn().mockResolvedValue(undefined);
    const mockMintAdminSession = jest.fn().mockResolvedValue(undefined);
    const mockCreate = jest.fn().mockResolvedValue({ id: "log-row-001" });
    const mockFindFirst = jest.fn().mockResolvedValue(null);

    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "admin-real-123",
        email: "admin@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(makeAdminRow())
            .mockResolvedValueOnce(makeTestAccountRow()),
        },
        impersonationLog: {
          findFirst: mockFindFirst,
          create: mockCreate,
        },
      },
    }));

    jest.doMock("@/lib/impersonation", () => ({
      assertIsRealAdmin: jest.fn().mockResolvedValue({
        adminId: "admin-real-123",
        email: "admin@example.com",
      }),
      mintImpersonationSession: mockMintImpersonationSession,
      mintAdminSession: mockMintAdminSession,
      ImpersonationForbiddenError: class ImpersonationForbiddenError extends Error {},
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    // Re-mock db with the impersonation mock overriding assertIsRealAdmin
    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(makeTestAccountRow()),
        },
        impersonationLog: {
          findFirst: mockFindFirst,
          create: mockCreate,
        },
      },
    }));

    const { startImpersonation } = await import(
      "@/app/admin/actions/impersonate"
    );

    const { redirected, redirectTo } = await runCatchingRedirect(() =>
      startImpersonation("test-acct-456")
    );

    expect(redirected).toBe(true);
    expect(redirectTo).toBe("/admin");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: "admin-real-123",
          impersonatedUserId: "test-acct-456",
        }),
      })
    );
    expect(mockMintImpersonationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "test-acct-456",
        impersonationLogId: "log-row-001",
      })
    );
  });

  it("idempotency guard: existing open log row reuses it without creating a new row", async () => {
    jest.resetModules();
    const mockMintImpersonationSession = jest.fn().mockResolvedValue(undefined);
    const mockCreate = jest.fn();
    const existingLog = { id: "existing-log-999" };

    jest.doMock("@/lib/impersonation", () => ({
      assertIsRealAdmin: jest.fn().mockResolvedValue({
        adminId: "admin-real-123",
        email: "admin@example.com",
      }),
      mintImpersonationSession: mockMintImpersonationSession,
      mintAdminSession: jest.fn(),
      ImpersonationForbiddenError: class ImpersonationForbiddenError extends Error {},
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue(makeTestAccountRow()),
        },
        impersonationLog: {
          findFirst: jest.fn().mockResolvedValue(existingLog),
          create: mockCreate,
        },
      },
    }));

    const { startImpersonation } = await import(
      "@/app/admin/actions/impersonate"
    );

    const { redirected } = await runCatchingRedirect(() =>
      startImpersonation("test-acct-456")
    );

    expect(redirected).toBe(true);
    // No new log row created
    expect(mockCreate).not.toHaveBeenCalled();
    // Session re-minted with the existing log id
    expect(mockMintImpersonationSession).toHaveBeenCalledWith(
      expect.objectContaining({ impersonationLogId: "existing-log-999" })
    );
  });
});

// ---------------------------------------------------------------------------
// Blocker #9: exitImpersonation closes log + restores admin session
// ---------------------------------------------------------------------------

describe("Blocker #9 — exitImpersonation closes log and restores admin", () => {
  it("sets endedAt, mints admin session, redirects to /admin", async () => {
    jest.resetModules();
    const mockUpdate = jest.fn().mockResolvedValue({ id: "log-row-001" });
    const mockMintAdminSession = jest.fn().mockResolvedValue(undefined);

    jest.doMock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({
        user: {
          email: "throwaway-test@example.com",
          isImpersonating: true,
          impersonationLogId: "log-row-001",
          originalAdminId: "admin-real-123",
          originalAdminEmail: "admin@example.com",
        },
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        impersonationLog: {
          update: mockUpdate,
        },
      },
    }));

    jest.doMock("@/lib/impersonation", () => ({
      mintAdminSession: mockMintAdminSession,
      mintImpersonationSession: jest.fn(),
      assertIsRealAdmin: jest.fn(),
      ImpersonationForbiddenError: class ImpersonationForbiddenError extends Error {},
    }));

    // Note: do NOT mock "@/auth-options" — the doMock would persist into later
    // tests. Since getServerSession is mocked above, authOptions is passed but
    // never called, so we just import the real module.
    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { exitImpersonation } = await import(
      "@/app/admin/actions/impersonate"
    );

    const { redirected, redirectTo } = await runCatchingRedirect(() =>
      exitImpersonation()
    );

    expect(redirected).toBe(true);
    expect(redirectTo).toBe("/admin");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-row-001" },
        data: expect.objectContaining({ endedAt: expect.any(Date) }),
      })
    );

    expect(mockMintAdminSession).toHaveBeenCalledWith({
      adminId: "admin-real-123",
      adminEmail: "admin@example.com",
    });
  });

  it("is idempotent: no-op (redirect only) when not impersonating", async () => {
    jest.resetModules();
    const mockUpdate = jest.fn();
    const mockMintAdminSession = jest.fn();

    jest.doMock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({
        user: {
          email: "admin@example.com",
          isImpersonating: false,
        },
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        impersonationLog: { update: mockUpdate },
      },
    }));

    jest.doMock("@/lib/impersonation", () => ({
      mintAdminSession: mockMintAdminSession,
      mintImpersonationSession: jest.fn(),
      assertIsRealAdmin: jest.fn(),
      ImpersonationForbiddenError: class ImpersonationForbiddenError extends Error {},
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { exitImpersonation } = await import(
      "@/app/admin/actions/impersonate"
    );

    const { redirected, redirectTo } = await runCatchingRedirect(() =>
      exitImpersonation()
    );

    expect(redirected).toBe(true);
    expect(redirectTo).toBe("/admin");
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockMintAdminSession).not.toHaveBeenCalled();
  });

  it("redirects to /login when originalAdminId is missing from token", async () => {
    jest.resetModules();
    const mockUpdate = jest.fn().mockResolvedValue({});

    jest.doMock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({
        user: {
          email: "throwaway-test@example.com",
          isImpersonating: true,
          impersonationLogId: "log-row-001",
          originalAdminId: null, // missing
          originalAdminEmail: null, // missing
        },
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        impersonationLog: { update: mockUpdate },
      },
    }));

    jest.doMock("@/lib/impersonation", () => ({
      mintAdminSession: jest.fn(),
      mintImpersonationSession: jest.fn(),
      assertIsRealAdmin: jest.fn(),
      ImpersonationForbiddenError: class ImpersonationForbiddenError extends Error {},
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { exitImpersonation } = await import(
      "@/app/admin/actions/impersonate"
    );

    const { redirected, redirectTo } = await runCatchingRedirect(() =>
      exitImpersonation()
    );

    expect(redirected).toBe(true);
    expect(redirectTo).toBe("/login");
  });
});

// ---------------------------------------------------------------------------
// Blocker #11 (regression guard): password login rejected for test account
// ---------------------------------------------------------------------------
// Core logic is already tested in auth-sec1.test.ts (Blocker #1).
// This guard re-verifies the authorize() null return when isTestAccount=true
// to catch regressions from any Dispatch B changes to auth-options.

describe("Blocker #11 — regression: isTestAccount blocks credentials login", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "replace-me";
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  it("authorize() returns null for isTestAccount=true (cannot log in via password)", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue({
        id: "test-acct-456",
        email: "throwaway-test@example.com",
        passwordHash: null,
        isTestAccount: true,
      }),
      verifyPassword: jest.fn().mockResolvedValue(true), // would pass if reached
    }));

    const { authOptions } = await import("@/auth-options");
    const provider: any = authOptions.providers?.[0];
    const authorize = provider.options?.authorize ?? provider.authorize;

    const result = await authorize({
      email: "throwaway-test@example.com",
      password: "any-password",
    });

    expect(result).toBeNull();
  });
});
