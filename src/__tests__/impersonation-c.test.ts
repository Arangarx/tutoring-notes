/**
 * SEC-1 Dispatch C — admin dashboard + routing acceptance tests.
 *
 * Blocker #12: no "Log in as" while impersonating (panel requires real admin).
 * Blocker #13: test-account list query filters isTestAccount=true only.
 *
 * Plus routing requirements: real admin → /admin; impersonating → tutor landing;
 * exit → /admin; impersonating cannot load dashboard controls.
 */

beforeEach(() => {
  jest.resetModules();
  process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
  process.env.DATABASE_URL = "file:./test.db";
  process.env.DIRECT_URL = "file:./test.db";
});

const mockNavRedirect = jest.fn();
jest.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockNavRedirect(...args);
    const err = new Error("NEXT_REDIRECT") as Error & { digest?: string };
    err.digest = "NEXT_REDIRECT";
    throw err;
  },
}));

// ---------------------------------------------------------------------------
// Blocker #12 — dashboard controls hidden from impersonating sessions
// ---------------------------------------------------------------------------

describe("Blocker #12 — impersonating session cannot use dashboard Log in as", () => {
  it("AdminTestAccountsPanel rejects impersonating callers via assertIsRealAdmin", async () => {
    jest.doMock("@/lib/impersonation", () => ({
      assertIsRealAdmin: jest.fn().mockRejectedValue(
        Object.assign(new Error("Test accounts cannot impersonate other users."), {
          name: "ImpersonationForbiddenError",
        })
      ),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: { findMany: jest.fn() },
      },
    }));

    const { AdminTestAccountsPanel } = await import(
      "@/app/admin/AdminTestAccountsPanel"
    );

    await expect(AdminTestAccountsPanel()).rejects.toThrow(
      "Test accounts cannot impersonate"
    );
  });
});

// ---------------------------------------------------------------------------
// Blocker #13 — only isTestAccount=true rows are listed
// ---------------------------------------------------------------------------

describe("Blocker #13 — test account list filters isTestAccount=true only", () => {
  it("queries only test accounts and renders each listed email", async () => {
    const mockFindMany = jest.fn().mockResolvedValue([
      {
        id: "test-1",
        email: "throwaway-test@example.com",
        createdAt: new Date("2026-01-01"),
      },
    ]);

    jest.doMock("@/lib/impersonation", () => ({
      assertIsRealAdmin: jest.fn().mockResolvedValue({
        adminId: "admin-real-123",
        email: "admin@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: { findMany: mockFindMany },
      },
    }));

    jest.doMock("@/app/admin/actions/impersonate", () => ({
      startImpersonation: jest.fn(),
    }));

    const { AdminTestAccountsPanel } = await import(
      "@/app/admin/AdminTestAccountsPanel"
    );
    const element = await AdminTestAccountsPanel();
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(element);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isTestAccount: true },
      })
    );
    expect(html).toContain("throwaway-test@example.com");
    expect(html).toContain("Log in as");
    expect(html).not.toContain("admin@example.com");
  });
});

// ---------------------------------------------------------------------------
// Admin home routing
// ---------------------------------------------------------------------------

describe("Admin home page routing", () => {
  it("redirects impersonating sessions to the tutor landing", async () => {
    jest.resetModules();
    mockNavRedirect.mockClear();

    jest.doMock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({
        user: {
          id: "test-acct-456",
          email: "throwaway-test@example.com",
          isImpersonating: true,
          isTestAccount: true,
        },
      }),
    }));

    jest.doMock("@/app/admin/AdminTestAccountsPanel", () => ({
      AdminTestAccountsPanel: jest.fn(),
    }));

    const page = await import("@/app/admin/page");

    await expect(page.default()).rejects.toMatchObject({ digest: "NEXT_REDIRECT" });
    expect(mockNavRedirect).toHaveBeenCalledWith("/admin/students");
  });

  it("does not redirect a non-impersonating real admin away from /admin", async () => {
    jest.resetModules();
    mockNavRedirect.mockClear();

    jest.doMock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({
        user: {
          id: "admin-real-123",
          email: "admin@example.com",
          isImpersonating: false,
          isTestAccount: false,
        },
      }),
    }));

    jest.doMock("@/lib/impersonation", () => ({
      assertIsRealAdmin: jest.fn().mockResolvedValue({
        adminId: "admin-real-123",
        email: "admin@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: { findMany: jest.fn().mockResolvedValue([]) },
      },
    }));

    jest.doMock("@/app/admin/actions/impersonate", () => ({
      startImpersonation: jest.fn(),
    }));

    const page = await import("@/app/admin/page");
    await page.default();

    expect(mockNavRedirect).not.toHaveBeenCalled();
  });
});
