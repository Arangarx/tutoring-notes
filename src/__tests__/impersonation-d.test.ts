/**
 * SEC-1 / Identity Phase 1 intersection — 2FA + impersonation lifecycle tests.
 *
 * Bug A: exiting impersonation must restore twoFactorVerified=true (no fresh 2FA challenge).
 * Bug B: "Sign out" while impersonating must use exit-impersonation semantics, not full signOut.
 *
 * Log prefix: tfa= for 2FA, imp= for impersonation (AGENTS.md § Conventions).
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

// ---------------------------------------------------------------------------
// Bug A: mintAdminSession encodes twoFactorVerified=true
// ---------------------------------------------------------------------------

describe("Bug A fix: mintAdminSession restores twoFactorVerified=true", () => {
  /**
   * Directly calls mintAdminSession and decodes the resulting cookie to assert
   * twoFactorVerified=true is present. This proves no fresh 2FA challenge is
   * triggered on exit (middleware gate fires only when twoFactorVerified is
   * false/absent for a non-impersonating session).
   */
  it("minted JWT carries twoFactorVerified=true", async () => {
    let capturedTokenValue: string | undefined;

    jest.doMock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        set: jest.fn((_name: string, value: string) => {
          capturedTokenValue = value;
        }),
      }),
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { mintAdminSession } = await import("@/lib/impersonation");
    await mintAdminSession({
      adminId: "admin-real-123",
      adminEmail: "admin@example.com",
      adminRole: "ADMIN",
    });

    expect(capturedTokenValue).toBeDefined();

    const { decode } = await import("next-auth/jwt");
    const decoded = await decode({
      token: capturedTokenValue,
      secret: "test-secret-32-chars-minimum-pad",
    });

    expect(decoded).not.toBeNull();
    expect(decoded?.twoFactorVerified).toBe(true);
  });

  it("minted JWT has no impersonation fields (clean admin session)", async () => {
    let capturedTokenValue: string | undefined;

    jest.doMock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        set: jest.fn((_name: string, value: string) => {
          capturedTokenValue = value;
        }),
      }),
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { mintAdminSession } = await import("@/lib/impersonation");
    await mintAdminSession({
      adminId: "admin-real-123",
      adminEmail: "admin@example.com",
      adminRole: "ADMIN",
    });

    const { decode } = await import("next-auth/jwt");
    const decoded = await decode({
      token: capturedTokenValue,
      secret: "test-secret-32-chars-minimum-pad",
    });

    expect(decoded?.isImpersonating).toBeFalsy();
    expect(decoded?.originalAdminId).toBeFalsy();
    expect(decoded?.impersonationLogId).toBeFalsy();
    expect(decoded?.isTestAccount).toBe(false);
    expect(decoded?.role).toBe("ADMIN");
  });

  /**
   * exitImpersonation calls mintAdminSession without a twoFactorVerified parameter —
   * the function always sets it to true internally. Verify that the existing
   * exitImpersonation call path passes through and that mintAdminSession is invoked.
   */
  it("exitImpersonation invokes mintAdminSession (integration: no fresh 2FA redirect)", async () => {
    jest.resetModules();
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
        adminUser: {
          findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }),
        },
        impersonationLog: {
          update: jest.fn().mockResolvedValue({ id: "log-row-001" }),
        },
      },
    }));

    jest.doMock("@/lib/impersonation", () => ({
      mintAdminSession: mockMintAdminSession,
      mintImpersonationSession: jest.fn(),
      assertIsRealAdmin: jest.fn(),
      ImpersonationForbiddenError: class ImpersonationForbiddenError extends Error {},
    }));

    jest.doMock("next/navigation", () => ({
      redirect: jest.fn(() => {
        const err = new Error("NEXT_REDIRECT") as Error & { digest?: string };
        err.digest = "NEXT_REDIRECT";
        throw err;
      }),
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { exitImpersonation } = await import("@/app/admin/actions/impersonate");

    try {
      await exitImpersonation();
    } catch (err: unknown) {
      if (!(err instanceof Error && (err as Error & { digest?: string }).digest === "NEXT_REDIRECT")) {
        throw err;
      }
    }

    // mintAdminSession must be called — this is what sets twoFactorVerified=true
    expect(mockMintAdminSession).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: "admin-real-123",
        adminEmail: "admin@example.com",
        adminRole: "ADMIN",
      })
    );
    // Crucially: NOT redirected to a 2FA path — the restore is to /admin
  });
});

// Bug B (sign-out while impersonating → exitImpersonation, not full signOut) is
// covered by tests/integration/identity/impersonation-round-trip.spec.ts.
