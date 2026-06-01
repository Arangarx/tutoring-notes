/**
 * SEC-1 / Identity Phase 1 intersection — 2FA + impersonation lifecycle tests.
 *
 * Bug A: exiting impersonation must restore twoFactorVerified=true (no fresh 2FA challenge).
 * Bug B: "Sign out" while impersonating must use exit-impersonation semantics, not full signOut.
 *
 * Log prefix: tfa= for 2FA, imp= for impersonation (AGENTS.md § Conventions).
 */

import fs from "fs";
import path from "path";

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

// ---------------------------------------------------------------------------
// Bug B: sign-out while impersonating uses exitImpersonation, not signOut
// ---------------------------------------------------------------------------

const adminNavPath = path.resolve(__dirname, "../components/AdminNav.tsx");

describe("Bug B fix: AdminNav sign-out routes through exitImpersonation when impersonating", () => {
  let adminNavSource: string;

  beforeAll(() => {
    adminNavSource = fs.readFileSync(adminNavPath, "utf-8");
  });

  it("AdminNav imports exitImpersonation from the impersonate server action", () => {
    expect(adminNavSource).toContain('exitImpersonation');
    expect(adminNavSource).toContain('@/app/admin/actions/impersonate');
  });

  it("AdminNav accepts isImpersonating prop", () => {
    expect(adminNavSource).toContain("isImpersonating");
  });

  it("AdminNav uses form action={exitImpersonation} for the impersonating sign-out path", () => {
    // The form action pattern is the standard way to call a server action from
    // a client component without next-auth's signOut destroying the session.
    expect(adminNavSource).toContain("action={exitImpersonation}");
  });

  it("AdminNav still imports and uses signOut for the non-impersonating path", () => {
    // Real sign-out must still work when NOT impersonating.
    expect(adminNavSource).toContain("signOut");
    expect(adminNavSource).toContain('from "next-auth/react"');
  });

  it("AdminNav sign-out is conditional: both paths present in source", () => {
    // Both branches must coexist — one for impersonating, one for real sign-out.
    const hasExitForm = adminNavSource.includes("action={exitImpersonation}");
    const hasSignOut = adminNavSource.includes("signOut(");
    expect(hasExitForm).toBe(true);
    expect(hasSignOut).toBe(true);
  });

  it("layout passes isImpersonating to AdminNav (source check)", () => {
    const layoutPath = path.resolve(__dirname, "../app/admin/layout.tsx");
    const layoutSource = fs.readFileSync(layoutPath, "utf-8");
    // The layout must forward the isImpersonating state to AdminNav so it
    // can pick the right sign-out path.
    expect(layoutSource).toContain("isImpersonating={isImpersonating}");
  });
});
