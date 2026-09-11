/**
 * Google signup waitlist — unit tests (Priority #3 chunk).
 *
 * - createAdminFromGoogle → WAITLISTED, null passwordHash, TUTOR role
 * - signup-intent token mint/validate
 * - signIn callback: provision with valid intent; reject without intent; login unchanged
 * - notifyOperatorsOfNewSignup on credentials + Google create (mocked sendMail)
 */

import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// signup-intent (pure)
// ---------------------------------------------------------------------------
describe("signup-intent token", () => {
  const SECRET = "test-secret-32-chars-minimum-pad";

  it("valid token passes validation within TTL", async () => {
    const { mintSignupIntentToken, isValidSignupIntentToken } = await import(
      "@/lib/signup-intent"
    );
    const now = 1_700_000_000_000;
    const token = await mintSignupIntentToken(SECRET, now);
    expect(await isValidSignupIntentToken(token, SECRET, now + 60_000)).toBe(true);
  });

  it("expired token fails validation", async () => {
    const {
      mintSignupIntentToken,
      isValidSignupIntentToken,
      SIGNUP_INTENT_TTL_MS,
    } = await import("@/lib/signup-intent");
    const now = 1_700_000_000_000;
    const token = await mintSignupIntentToken(SECRET, now);
    expect(
      await isValidSignupIntentToken(token, SECRET, now + SIGNUP_INTENT_TTL_MS + 1)
    ).toBe(false);
  });

  it("tampered signature fails validation", async () => {
    const { mintSignupIntentToken, isValidSignupIntentToken } = await import(
      "@/lib/signup-intent"
    );
    const token = await mintSignupIntentToken(SECRET);
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(await isValidSignupIntentToken(tampered, SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createAdminFromGoogle
// ---------------------------------------------------------------------------
describe("createAdminFromGoogle", () => {
  const mockCreate = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockCreate.mockReset();
    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: { create: mockCreate },
      },
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/db");
  });

  it("creates WAITLISTED TUTOR with null passwordHash", async () => {
    mockCreate.mockResolvedValue({
      id: "g-1",
      email: "pilot@gmail.com",
      displayName: "Pilot",
      approvalStatus: "WAITLISTED",
      passwordHash: null,
      role: "TUTOR",
      isTestAccount: false,
    });

    const { createAdminFromGoogle } = await import("@/lib/auth-db");
    await createAdminFromGoogle("pilot@gmail.com", "Pilot");

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        email: "pilot@gmail.com",
        passwordHash: null,
        displayName: "Pilot",
        role: "TUTOR",
        isTestAccount: false,
        approvalStatus: "WAITLISTED",
        emailVerifiedAt: expect.any(Date),
      },
    });
  });
});

// ---------------------------------------------------------------------------
// notifyOperatorsOfNewSignup
// ---------------------------------------------------------------------------
describe("notifyOperatorsOfNewSignup", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.OPERATOR_EMAILS = "ops@example.com";
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.NEXTAUTH_URL = "https://app.example.com";
  });

  it("sends to OPERATOR_EMAILS ∪ ADMIN_EMAIL (fail-open on sendMail error)", async () => {
    const sendMail = jest.fn().mockResolvedValue({ sent: false, error: "no smtp" });
    jest.doMock("@/lib/email", () => ({ sendMail }));

    const { notifyOperatorsOfNewSignup } = await import(
      "@/lib/notify-operator-new-signup"
    );
    await notifyOperatorsOfNewSignup({
      email: "new@example.com",
      displayName: "New Tutor",
      method: "credentials",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toContain("ops@example.com");
    expect(call.to).toContain("admin@example.com");
    expect(call.subject).toMatch(/WAITLISTED/i);
    expect(call.text).toMatch(/tutor-approvals/);
    expect(call.text).toMatch(/email and password/i);
  });

  it("labels Google method in notification body", async () => {
    const sendMail = jest.fn().mockResolvedValue({ sent: true });
    jest.doMock("@/lib/email", () => ({ sendMail }));

    const { notifyOperatorsOfNewSignup } = await import(
      "@/lib/notify-operator-new-signup"
    );
    await notifyOperatorsOfNewSignup({
      email: "google@example.com",
      method: "google",
    });

    expect(sendMail.mock.calls[0][0].text).toMatch(/Google OAuth/i);
  });

  it("no-ops when operator set is empty", async () => {
    delete process.env.OPERATOR_EMAILS;
    delete process.env.ADMIN_EMAIL;

    const sendMail = jest.fn();
    jest.doMock("@/lib/email", () => ({ sendMail }));
    jest.doMock("@/lib/env", () => ({
      env: {
        OPERATOR_EMAILS: undefined,
        ADMIN_EMAIL: undefined,
        NEXTAUTH_URL: "https://app.example.com",
      },
    }));

    const { notifyOperatorsOfNewSignup } = await import(
      "@/lib/notify-operator-new-signup"
    );
    await notifyOperatorsOfNewSignup({
      email: "new@example.com",
      method: "credentials",
    });

    expect(sendMail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signIn callback — Google dual path (login reject vs signup provision)
// ---------------------------------------------------------------------------
describe("Google signIn — signup intent dual path", () => {
  function makeAdminRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "admin-123",
      email: "admin@example.com",
      passwordHash: null,
      isTestAccount: false,
      role: "TUTOR",
      displayName: "Admin",
      approvalStatus: "APPROVED",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  const mockGetAdminByEmail = jest.fn();
  const mockCreateAdminFromGoogle = jest.fn();
  const mockFindEmailRealmPresence = jest.fn();
  const mockNotify = jest.fn();
  const mockClearIntent = jest.fn();
  const mockCookiesGet = jest.fn();
  const mockLogProductEvent = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockGetAdminByEmail.mockReset();
    mockCreateAdminFromGoogle.mockReset();
    mockFindEmailRealmPresence.mockReset();
    mockNotify.mockReset();
    mockClearIntent.mockReset();
    mockCookiesGet.mockReset();
    mockLogProductEvent.mockReset();

    mockFindEmailRealmPresence.mockImplementation(async (email: string) => ({
      normalizedEmail: email.trim().toLowerCase(),
      inAdmin: false,
      inAccountHolder: false,
    }));

    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "replace-me";
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

    jest.doMock("@/lib/env", () => ({
      env: {
        NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad",
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "replace-me",
      },
    }));

    jest.doMock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: mockCookiesGet,
        delete: jest.fn(),
      }),
    }));

    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: mockGetAdminByEmail,
      getAdminById: jest.fn(),
      verifyPassword: jest.fn().mockResolvedValue(false),
      createAdminFromGoogle: mockCreateAdminFromGoogle,
    }));

    jest.doMock("@/lib/cross-realm-email", () => ({
      findEmailRealmPresence: mockFindEmailRealmPresence,
      isEmailTakenInOtherRealm: jest.requireActual("@/lib/cross-realm-email")
        .isEmailTakenInOtherRealm,
    }));

    jest.doMock("@/lib/notify-operator-new-signup", () => ({
      notifyOperatorsOfNewSignup: mockNotify,
    }));

    jest.doMock("@/lib/signup-intent", () => {
      const actual = jest.requireActual("@/lib/signup-intent");
      return {
        ...actual,
        clearSignupIntentCookie: mockClearIntent,
      };
    });

    jest.doMock("@/lib/observability/product-events", () => ({
      logProductEvent: (...args: unknown[]) => mockLogProductEvent(...args),
    }));
  });

  async function getSignInCallback() {
    const { authOptions } = await import("@/auth-options");
    const signIn = authOptions.callbacks?.signIn;
    expect(typeof signIn).toBe("function");
    return signIn!;
  }

  it("rejects unknown email without signup intent (login path — no row created)", async () => {
    mockGetAdminByEmail.mockResolvedValue(null);
    mockCookiesGet.mockReturnValue(undefined);

    const signIn = await getSignInCallback();
    const result = await signIn({
      user: { id: "x", email: "stranger@gmail.com" },
      account: { provider: "google", type: "oauth" } as any,
      profile: {} as any,
    });

    expect(result).not.toBe(true);
    expect(result).toContain("not_authorized");
    expect(mockCreateAdminFromGoogle).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("provisions WAITLISTED account with valid signup intent", async () => {
    const { mintSignupIntentToken, SIGNUP_INTENT_COOKIE } = await import(
      "@/lib/signup-intent"
    );
    const intent = await mintSignupIntentToken("test-secret-32-chars-minimum-pad");

    mockGetAdminByEmail.mockResolvedValueOnce(null);
    mockCookiesGet.mockReturnValue({ name: SIGNUP_INTENT_COOKIE, value: intent });
    mockCreateAdminFromGoogle.mockResolvedValue(
      makeAdminRow({
        id: "new-google",
        email: "new@gmail.com",
        approvalStatus: "WAITLISTED",
        isTestAccount: false,
      })
    );

    const signIn = await getSignInCallback();
    const result = await signIn({
      user: { id: "x", email: "new@gmail.com", name: "New User" },
      account: { provider: "google", type: "oauth" } as any,
      profile: {} as any,
    });

    expect(result).toBe(true);
    expect(mockCreateAdminFromGoogle).toHaveBeenCalledWith(
      "new@gmail.com",
      "New User"
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@gmail.com", method: "google" })
    );
    expect(mockClearIntent).toHaveBeenCalled();
    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "TUTOR_SIGNUP",
      adminUserId: "new-google",
      metadata: { method: "google" },
    });
  });

  it("rejects test-account email even when row exists", async () => {
    mockGetAdminByEmail.mockResolvedValue(
      makeAdminRow({ isTestAccount: true, email: "test@gmail.com" })
    );

    const signIn = await getSignInCallback();
    const result = await signIn({
      user: { id: "t1", email: "test@gmail.com" },
      account: { provider: "google", type: "oauth" } as any,
      profile: {} as any,
    });

    expect(result).not.toBe(true);
    expect(result).toContain("not_authorized");
  });

  it("allows existing non-test admin (login path)", async () => {
    mockGetAdminByEmail.mockResolvedValue(
      makeAdminRow({ email: "existing@gmail.com", isTestAccount: false })
    );

    const signIn = await getSignInCallback();
    const result = await signIn({
      user: { id: "e1", email: "existing@gmail.com" },
      account: { provider: "google", type: "oauth" } as any,
      profile: {} as any,
    });

    expect(result).toBe(true);
    expect(mockCreateAdminFromGoogle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// credentials signup action notifies operators
// ---------------------------------------------------------------------------
describe("signup server action — operator notification", () => {
  afterEach(() => {
    jest.dontMock("@/lib/db");
    jest.resetModules();
  });

  it("calls notifyOperatorsOfNewSignup after createAdmin", async () => {
    jest.resetModules();

    const notify = jest.fn().mockResolvedValue(undefined);
    const createAdmin = jest.fn().mockResolvedValue({ id: "u1" });
    const getAdminByEmail = jest.fn().mockResolvedValue(null);
    const findEmailRealmPresence = jest.fn().mockResolvedValue({
      normalizedEmail: "brand-new@example.com",
      inAdmin: false,
      inAccountHolder: false,
    });
    const logProductEvent = jest.fn().mockResolvedValue(undefined);

    const sendTutorSignupVerifyEmail = jest.fn().mockResolvedValue({ sent: true, tokenId: "tok1" });
    const getRequestBaseUrlSafeFromHeaders = jest.fn().mockResolvedValue("https://app.example.com");

    jest.doMock("@/lib/auth-db", () => ({
      createAdmin,
      getAdminByEmail,
    }));
    jest.doMock("@/lib/cross-realm-email", () => ({
      findEmailRealmPresence,
    }));
    jest.doMock("@/lib/notify-operator-new-signup", () => ({
      notifyOperatorsOfNewSignup: notify,
    }));
    jest.doMock("@/lib/observability/product-events", () => ({
      logProductEvent,
    }));
    jest.doMock("@/lib/admin-email-verify", () => ({
      sendTutorSignupVerifyEmail,
    }));
    jest.doMock("@/lib/public-url", () => ({
      getRequestBaseUrlSafeFromHeaders,
    }));
    jest.doMock("next/navigation", () => ({
      redirect: jest.fn(() => {
        throw new Error("REDIRECT");
      }),
    }));

    const { signup } = await import("@/app/signup/actions");

    const form = new FormData();
    form.set("email", "brand-new@example.com");
    form.set("password", "StrongPassphrase!99");
    form.set("passwordConfirm", "StrongPassphrase!99");
    form.set("displayName", "Brand New");

    await expect(signup(null, form)).rejects.toThrow("REDIRECT");

    expect(createAdmin).toHaveBeenCalled();
    expect(sendTutorSignupVerifyEmail).toHaveBeenCalledWith({
      adminUserId: "u1",
      email: "brand-new@example.com",
      baseUrl: "https://app.example.com",
    });
    expect(notify).toHaveBeenCalledWith({
      email: "brand-new@example.com",
      displayName: "Brand New",
      method: "credentials",
    });
    expect(logProductEvent).toHaveBeenCalledWith({
      kind: "TUTOR_SIGNUP",
      adminUserId: "u1",
      metadata: { method: "credentials" },
    });
  });

  it("rolls back the AdminUser when confirm mail cannot be sent", async () => {
    jest.resetModules();

    const notify = jest.fn().mockResolvedValue(undefined);
    const createAdmin = jest.fn().mockResolvedValue({ id: "u-rollback" });
    const deleteAdmin = jest.fn().mockResolvedValue({ id: "u-rollback" });
    const findEmailRealmPresence = jest.fn().mockResolvedValue({
      normalizedEmail: "rollback@example.com",
      inAdmin: false,
      inAccountHolder: false,
    });
    const logProductEvent = jest.fn().mockResolvedValue(undefined);
    const sendTutorSignupVerifyEmail = jest.fn().mockResolvedValue({
      sent: false,
      error: "Platform SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.",
      tokenId: "tok-fail",
    });

    jest.doMock("@/lib/auth-db", () => ({
      createAdmin,
      getAdminByEmail: jest.fn(),
    }));
    jest.doMock("@/lib/db", () => ({
      db: { adminUser: { delete: deleteAdmin } },
    }));
    jest.doMock("@/lib/cross-realm-email", () => ({
      findEmailRealmPresence,
    }));
    jest.doMock("@/lib/notify-operator-new-signup", () => ({
      notifyOperatorsOfNewSignup: notify,
    }));
    jest.doMock("@/lib/observability/product-events", () => ({
      logProductEvent,
    }));
    jest.doMock("@/lib/admin-email-verify", () => ({
      sendTutorSignupVerifyEmail,
    }));
    jest.doMock("@/lib/public-url", () => ({
      getRequestBaseUrlSafeFromHeaders: jest.fn().mockResolvedValue("https://app.example.com"),
    }));
    const redirect = jest.fn(() => {
      throw new Error("REDIRECT");
    });
    jest.doMock("next/navigation", () => ({ redirect }));

    const { signup } = await import("@/app/signup/actions");
    const form = new FormData();
    form.set("email", "rollback@example.com");
    form.set("password", "StrongPassphrase!99");
    form.set("passwordConfirm", "StrongPassphrase!99");

    const result = await signup(null, form);
    expect(result?.error).toMatch(/couldn't send a confirmation email|SMTP is not configured/i);
    expect(deleteAdmin).toHaveBeenCalledWith({ where: { id: "u-rollback" } });
    expect(notify).not.toHaveBeenCalled();
    expect(logProductEvent).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Integration oracle: createAdminFromGoogle against real test DB (when available)
// ---------------------------------------------------------------------------
describe("createAdminFromGoogle — DB integration", () => {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isLocalHarnessDb =
    (dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://")) &&
    (dbUrl.includes("127.0.0.1") || dbUrl.includes("localhost"));

  const itDb = isLocalHarnessDb ? it : it.skip;

  itDb("persists WAITLISTED row with null passwordHash", async () => {
    const harnessUrl = process.env.DATABASE_URL ?? "";
    if (
      !harnessUrl.startsWith("postgresql://") &&
      !harnessUrl.startsWith("postgres://")
    ) {
      return;
    }

    const prisma = new PrismaClient({ datasources: { db: { url: harnessUrl } } });
    const email = `jest-google-signup-${Date.now()}@test.local`;
    try {
      const { createAdminFromGoogle } = await import("@/lib/auth-db");
      const row = await createAdminFromGoogle(email, "Jest Google");
      expect(row.approvalStatus).toBe("WAITLISTED");
      expect(row.passwordHash).toBeNull();
      expect(row.role).toBe("TUTOR");
      expect(row.isTestAccount).toBe(false);
      expect(row.emailVerifiedAt).toBeInstanceOf(Date);

      const fetched = await prisma.adminUser.findUnique({ where: { email } });
      expect(fetched?.approvalStatus).toBe("WAITLISTED");
      expect(fetched?.passwordHash).toBeNull();
      expect(fetched?.emailVerifiedAt).toBeInstanceOf(Date);
    } finally {
      await prisma.adminUser.deleteMany({ where: { email } });
      await prisma.$disconnect();
    }
  });
});
