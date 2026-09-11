/**
 * JWT / session emailVerified claim — independent of 2FA.
 * isTestAccount must NOT auto-true emailVerified; env-only sub=admin does.
 */
describe("auth-options: emailVerified claim in JWT + session", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "replace-me";
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  it("credentials login copies emailVerified from authorize() user", async () => {
    jest.doMock("@/lib/playwright-harness", () => ({
      isPlaywrightHarnessActive: () => false,
      isPlaywrightHarnessAdminEmail: () => false,
    }));
    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const result = await jwtCallback({
      token: { sub: "admin-123" },
      user: {
        id: "admin-123",
        email: "tutor@example.com",
        isTestAccount: false,
        role: "TUTOR",
        emailVerified: true,
      },
      account: { provider: "credentials", type: "credentials" },
    });
    expect(result.emailVerified).toBe(true);
  });

  it("isTestAccount does not auto-true emailVerified", async () => {
    jest.doMock("@/lib/playwright-harness", () => ({
      isPlaywrightHarnessActive: () => false,
      isPlaywrightHarnessAdminEmail: () => false,
    }));
    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const result = await jwtCallback({
      token: { sub: "test-123" },
      user: {
        id: "test-123",
        email: "test@example.com",
        isTestAccount: true,
        role: "TUTOR",
        emailVerified: false,
      },
      account: { provider: "credentials", type: "credentials" },
    });
    expect(result.twoFactorVerified).toBe(true);
    expect(result.emailVerified).toBe(false);
  });

  it("env-only sub=admin is treated as emailVerified", async () => {
    jest.doMock("@/lib/playwright-harness", () => ({
      isPlaywrightHarnessActive: () => false,
      isPlaywrightHarnessAdminEmail: () => false,
    }));
    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const result = await jwtCallback({
      token: { sub: "admin" },
      user: {
        id: "admin",
        email: "admin@example.com",
        isTestAccount: false,
        role: "ADMIN",
        emailVerified: true,
      },
      account: { provider: "credentials", type: "credentials" },
    });
    expect(result.emailVerified).toBe(true);
  });

  it("session callback mirrors emailVerified from the token", async () => {
    jest.doMock("@/lib/playwright-harness", () => ({
      isPlaywrightHarnessActive: () => false,
      isPlaywrightHarnessAdminEmail: () => false,
    }));
    const { authOptions } = await import("@/auth-options");
    const sessionCallback = authOptions.callbacks?.session as Function;
    const result = await sessionCallback({
      session: { user: { id: "u1" }, expires: "2099-01-01" },
      token: { sub: "u1", emailVerified: true },
    });
    expect(result.user.emailVerified).toBe(true);
  });

  it("role refresh copies emailVerified from emailVerifiedAt", async () => {
    jest.doMock("@/lib/playwright-harness", () => ({
      isPlaywrightHarnessActive: () => false,
      isPlaywrightHarnessAdminEmail: () => false,
    }));
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn(),
      getAdminById: jest.fn().mockResolvedValue({
        id: "tutor-uuid",
        role: "TUTOR",
        isTestAccount: false,
        approvalStatus: "WAITLISTED",
        emailVerifiedAt: new Date("2026-01-01"),
      }),
      verifyPassword: jest.fn(),
    }));

    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const result = await jwtCallback({
      token: {
        sub: "tutor-uuid",
        role: "TUTOR",
        isTestAccount: false,
        approvalStatus: "WAITLISTED",
        emailVerified: false,
        _roleCheckedAt: 0,
      },
      user: undefined,
      account: null,
    });
    expect(result.emailVerified).toBe(true);
  });
});
