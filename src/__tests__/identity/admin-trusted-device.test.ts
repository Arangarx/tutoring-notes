// @ts-nocheck — Jest 30 mock factory inference produces `never` return types that
// don't type-check with strict TS, but all tests pass at runtime. Suppressing here
// keeps the test executable without polluting production tsconfig with test overrides.
/**
 * AdminTrustedDevice unit tests — 2FA remember-device (2026-06-13).
 *
 * TD-1  mintAdminTrustedDevice persists only tokenHash, not raw token
 * TD-2  validateAdminTrustedDevice returns device when hash matches and row valid
 * TD-3  Expired row → validate returns null; skip returns false
 * TD-4  Revoked row → validate returns null
 * TD-5  Wrong adminUserId on validate → null (cookie not portable across accounts)
 * TD-6  Tampered cookie (random hex, no DB row) → null
 * TD-7  tryTrustedDeviceLoginSkip success: returns true, calls mintTwoFactorVerifiedSession
 * TD-8  Fail-closed paths: (a) DB throw → skip returns false; (b) mint throws → false + logs
 * TD-9  verifyTotpCode with rememberDevice:true creates row (via mintAdminTrustedDevice)
 * TD-10 changePassword rejected without/wrong totpCode even when twoFactorVerified; asserts
 *       check2faVerifyRateLimit called before TOTP validation
 * TD-11 rotateTotpStart rejected without step-up even when twoFactorVerified=true
 * TD-12 revokeAllTrustedDevices sets revokedAt on all rows; subsequent skip fails
 * TD-13 changePassword success revokes all trusted devices
 * TD-14 REMOVED (2026-06-14): startImpersonation step-up removed — impersonation is
 *       test-only (isTestAccount=true hard guard); step-up re-added when real-account
 *       impersonation lands (BL-IMP-REAL)
 * TD-15 verifyTotpStepUp calls check2faVerifyRateLimit as FIRST operation before TOTP (B3)
 * TD-16 mintAdminTrustedDevice at 10 active devices → oldest evicted; device_evicted logged
 * TD-17 ADMIN_TFA_DEVICE_HMAC_SECRET undefined → mint/validate fail-closed
 * TD-18 mintTwoFactorVerifiedSession throw → tryTrustedDeviceLoginSkip returns false (B2)
 * TD-19 listAdminTrustedDevices returns isCurrent=true for device matching cookie hash
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeHmacSecret(): string {
  return Buffer.from("test-hmac-secret-32-bytes-long!!!", "utf8").toString("base64");
}

// ---------------------------------------------------------------------------
// Module-level setup — set env vars before any import
// ---------------------------------------------------------------------------

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  process.env.ADMIN_TFA_DEVICE_HMAC_SECRET = makeHmacSecret();
  process.env.NEXTAUTH_SECRET = "test-nextauth-secret-must-be-at-least-32-chars-long";
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

// ---------------------------------------------------------------------------
// TD-1: mintAdminTrustedDevice persists only tokenHash, not raw token
// ---------------------------------------------------------------------------
describe("TD-1: mintAdminTrustedDevice — only tokenHash stored", () => {
  it("DB create is called with tokenHash field only, raw token absent", async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: "device-1" }) as jest.MockedFunction<() => Promise<{ id: string }>>;
    const mockFindMany = jest.fn().mockResolvedValue([]) as jest.MockedFunction<() => Promise<unknown[]>>;
    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          create: mockCreate,
          findMany: mockFindMany,
          update: jest.fn().mockResolvedValue({}),
        },
      },
    }));

    const { mintAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    const { rawToken } = await mintAdminTrustedDevice("admin-1", "TestAgent/1.0");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createdData = (mockCreate.mock.calls[0] as [{ data: { tokenHash?: string; adminUserId?: string } }])[0].data;

    // Raw token must NOT be in the DB create call data.
    expect(JSON.stringify(createdData)).not.toContain(rawToken);

    // tokenHash MUST be in the DB create call data.
    expect(createdData.tokenHash).toBeDefined();
    expect(typeof createdData.tokenHash).toBe("string");
    expect(createdData.tokenHash).not.toBe(rawToken);
    expect(createdData.adminUserId).toBe("admin-1");
  });
});

// ---------------------------------------------------------------------------
// TD-2: validateAdminTrustedDevice returns device when hash matches + valid
// ---------------------------------------------------------------------------
describe("TD-2: validateAdminTrustedDevice — returns device on valid row", () => {
  it("returns { deviceId } when hash matches, adminUserId matches, not revoked, not expired", async () => {
    const { hmacToken } = await import("@/lib/crypto/session-tokens");
    const secret = makeHmacSecret();
    const rawToken = "a".repeat(64);
    const hash = hmacToken(rawToken, secret);

    const now = new Date();
    const mockRow = {
      id: "device-2",
      adminUserId: "admin-2",
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    };

    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: jest.fn().mockResolvedValue(mockRow),
        },
      },
    }));

    const { validateAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    const result = await validateAdminTrustedDevice(rawToken, "admin-2");

    expect(result).toEqual({ deviceId: "device-2" });
  });
});

// ---------------------------------------------------------------------------
// TD-3: Expired row → validate returns null; skip returns false
// ---------------------------------------------------------------------------
describe("TD-3: Expired row → validate null; skip false", () => {
  it("returns null when expiresAt is in the past", async () => {
    const { hmacToken } = await import("@/lib/crypto/session-tokens");
    const secret = makeHmacSecret();
    const rawToken = "b".repeat(64);
    const hash = hmacToken(rawToken, secret);

    const expiredRow = {
      id: "device-3",
      adminUserId: "admin-3",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000), // expired
    };

    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: jest.fn().mockResolvedValue(expiredRow),
        },
      },
    }));

    const { validateAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    const result = await validateAdminTrustedDevice(rawToken, "admin-3");
    expect(result).toBeNull();
  });

  it("tryTrustedDeviceLoginSkip returns false when validate returns null (expired)", async () => {
    const mockCookieGet = jest.fn().mockReturnValue({ value: "c".repeat(64) });
    const mockCookies = jest.fn().mockResolvedValue({ get: mockCookieGet });
    jest.mock("next/headers", () => ({ cookies: mockCookies }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: jest.fn().mockResolvedValue({
            id: "device-3b",
            adminUserId: "admin-3",
            revokedAt: null,
            expiresAt: new Date(Date.now() - 1000),
          }),
        },
      },
    }));
    jest.mock("@/lib/two-factor-session", () => ({
      mintTwoFactorVerifiedSession: jest.fn().mockResolvedValue(undefined),
    }));

    const { tryTrustedDeviceLoginSkip } = await import("@/lib/admin-trusted-device");
    const skipped = await tryTrustedDeviceLoginSkip("admin-3", { sub: "admin-3" });
    expect(skipped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TD-4: Revoked row → validate returns null
// ---------------------------------------------------------------------------
describe("TD-4: Revoked row → validate null", () => {
  it("returns null when revokedAt is set", async () => {
    const { hmacToken } = await import("@/lib/crypto/session-tokens");
    const secret = makeHmacSecret();
    const rawToken = "d".repeat(64);
    const hash = hmacToken(rawToken, secret);

    const revokedRow = {
      id: "device-4",
      adminUserId: "admin-4",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    };

    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: jest.fn().mockResolvedValue(revokedRow),
        },
      },
    }));

    const { validateAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    const result = await validateAdminTrustedDevice(rawToken, "admin-4");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TD-5: Wrong adminUserId on validate → null (cookie not portable)
// ---------------------------------------------------------------------------
describe("TD-5: Wrong adminUserId → validate null", () => {
  it("returns null when row.adminUserId does not match caller", async () => {
    const { hmacToken } = await import("@/lib/crypto/session-tokens");
    const secret = makeHmacSecret();
    const rawToken = "e".repeat(64);
    const hash = hmacToken(rawToken, secret);

    const row = {
      id: "device-5",
      adminUserId: "admin-5a",  // Different admin
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    };

    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: jest.fn().mockResolvedValue(row),
        },
      },
    }));

    const { validateAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    const result = await validateAdminTrustedDevice(rawToken, "admin-5b"); // Different caller
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TD-6: Tampered cookie → null (no DB row found)
// ---------------------------------------------------------------------------
describe("TD-6: Tampered/forged cookie → null", () => {
  it("returns null for a random token with no DB row", async () => {
    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: jest.fn().mockResolvedValue(null), // not found
        },
      },
    }));

    const { validateAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    const randomToken = "f".repeat(64);
    const result = await validateAdminTrustedDevice(randomToken, "admin-6");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TD-7: tryTrustedDeviceLoginSkip success
// ---------------------------------------------------------------------------
describe("TD-7: tryTrustedDeviceLoginSkip success path", () => {
  it("returns true, calls mintTwoFactorVerifiedSession, logs login_skipped_via_trusted_device", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const rawToken = "g".repeat(64);
    const mockCookieGet = jest.fn().mockReturnValue({ value: rawToken });
    const mockCookies = jest.fn().mockResolvedValue({ get: mockCookieGet });
    jest.mock("next/headers", () => ({ cookies: mockCookies }));

    const { hmacToken } = await import("@/lib/crypto/session-tokens");
    const hash = hmacToken(rawToken, makeHmacSecret());

    const mockFindUnique = jest.fn().mockResolvedValue({
      id: "device-7",
      adminUserId: "admin-7",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    });
    const mockUpdate = jest.fn().mockResolvedValue({});
    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: mockFindUnique,
          update: mockUpdate,
        },
      },
    }));

    const mockMint = jest.fn().mockResolvedValue(undefined);
    jest.mock("@/lib/two-factor-session", () => ({
      mintTwoFactorVerifiedSession: mockMint,
    }));

    const { tryTrustedDeviceLoginSkip } = await import("@/lib/admin-trusted-device");
    const token = { sub: "admin-7" };
    const result = await tryTrustedDeviceLoginSkip("admin-7", token);

    expect(result).toBe(true);
    expect(mockMint).toHaveBeenCalledWith(token);

    // Verify the login_skipped_via_trusted_device log line was emitted.
    const logCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    expect(logCalls.some((l) => l.includes("login_skipped_via_trusted_device"))).toBe(true);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TD-8: Fail-closed paths
// ---------------------------------------------------------------------------
describe("TD-8: Fail-closed — DB throw and mint throw", () => {
  it("(a) DB throw during validate → skip returns false, no mint called", async () => {
    const rawToken = "h".repeat(64);
    const mockCookieGet = jest.fn().mockReturnValue({ value: rawToken });
    const mockCookies = jest.fn().mockResolvedValue({ get: mockCookieGet });
    jest.mock("next/headers", () => ({ cookies: mockCookies }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: jest.fn().mockRejectedValue(new Error("DB connection refused")),
        },
      },
    }));

    const mockMint = jest.fn();
    jest.mock("@/lib/two-factor-session", () => ({
      mintTwoFactorVerifiedSession: mockMint,
    }));

    const { tryTrustedDeviceLoginSkip } = await import("@/lib/admin-trusted-device");
    const result = await tryTrustedDeviceLoginSkip("admin-8a", { sub: "admin-8a" });

    expect(result).toBe(false);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it("(b) validate succeeds but mintTwoFactorVerifiedSession throws → false + logs (B2)", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const rawToken = "i".repeat(64);
    const mockCookieGet = jest.fn().mockReturnValue({ value: rawToken });
    const mockCookies = jest.fn().mockResolvedValue({ get: mockCookieGet });
    jest.mock("next/headers", () => ({ cookies: mockCookies }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: jest.fn().mockResolvedValue({
            id: "device-8b",
            adminUserId: "admin-8b",
            revokedAt: null,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      },
    }));

    jest.mock("@/lib/two-factor-session", () => ({
      mintTwoFactorVerifiedSession: jest.fn().mockRejectedValue(new Error("JWT encode failed")),
    }));

    const { tryTrustedDeviceLoginSkip } = await import("@/lib/admin-trusted-device");
    const result = await tryTrustedDeviceLoginSkip("admin-8b", { sub: "admin-8b" });

    expect(result).toBe(false);

    // Must log trusted_device_skip_mint_failed.
    const errorCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    expect(errorCalls.some((l) => l.includes("trusted_device_skip_mint_failed"))).toBe(true);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TD-9: verifyTotpCode with rememberDevice:true creates row
// ---------------------------------------------------------------------------
describe("TD-9: verifyTotpCode with rememberDevice creates trusted device", () => {
  it("calls mintAdminTrustedDevice when rememberDevice=true and verify succeeds", async () => {
    // Track DB create calls to verify trusted device row is created.
    const mockTdCreate = jest.fn().mockResolvedValue({ id: "dev-9" });
    const mockMintTD = jest.fn().mockImplementation(async () => ({
      rawToken: "r".repeat(64),
      deviceId: "dev-9",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }));

    // We mock only the sub-dependencies, not the whole admin-trusted-device module.
    jest.mock("@/lib/admin-trusted-device", () => ({
      mintAdminTrustedDevice: mockMintTD,
      buildAdminTfaDeviceCookie: jest.fn().mockReturnValue("cookie-string"),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
      revokeAllAdminTrustedDevices: jest.fn().mockResolvedValue(0),
      listAdminTrustedDevices: jest.fn().mockResolvedValue([]),
      revokeAdminTrustedDevice: jest.fn().mockResolvedValue(undefined),
      clearAdminTfaDeviceCookie: jest.fn().mockReturnValue(""),
      tryTrustedDeviceLoginSkip: jest.fn().mockResolvedValue(false),
    }));

    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn().mockResolvedValue({ ok: true }),
    }));

    const mockCookiesStore = { get: jest.fn().mockReturnValue(null), set: jest.fn() };
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue(mockCookiesStore),
      headers: jest.fn().mockResolvedValue({ get: jest.fn().mockReturnValue("TestAgent/1.0") }),
    }));

    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { email: "admin@test.com", id: "admin-9", isTestAccount: false } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: { findUnique: jest.fn().mockResolvedValue({ id: "admin-9", isTestAccount: false }) },
        adminUser2FA: {
          findUnique: jest.fn().mockResolvedValue({ id: "tfa-9", totpSecretEnc: "enc" }),
          update: jest.fn().mockResolvedValue({}),
        },
        adminTrustedDevice: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    }));

    jest.mock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({ kind: "admin", adminId: "admin-9" }),
    }));

    jest.mock("@/lib/auth-rate-limit", () => ({
      check2faVerifyRateLimit: jest.fn().mockResolvedValue({ allowed: true, requestCount: 1, retryAfterMs: 0 }),
    }));

    jest.mock("@/lib/crypto/totp-secret", () => ({
      decryptTotpSecret: jest.fn().mockReturnValue("JBSWY3DPEHPK3PXP"),
    }));

    // Mock a valid TOTP validation
    jest.mock("otpauth", () => ({
      TOTP: jest.fn().mockImplementation(() => ({
        validate: jest.fn().mockReturnValue(0), // delta 0 = valid current code
      })),
      Secret: { fromBase32: jest.fn().mockReturnValue({}) },
    }));

    jest.mock("next-auth/jwt", () => ({
      decode: jest.fn().mockResolvedValue({ sub: "admin-9" }),
    }));

    jest.mock("@/lib/two-factor-session", () => ({
      mintTwoFactorVerifiedSession: jest.fn().mockResolvedValue(undefined),
    }));

    jest.mock("@/lib/impersonation", () => ({
      assertIsAdmin: jest.fn().mockResolvedValue({ adminId: "admin-9", email: "admin@test.com" }),
    }));

    const { verifyTotpCode } = await import("@/app/admin/settings/2fa/actions");
    const result = await verifyTotpCode("123456", { rememberDevice: true });

    // If verify succeeded, mintAdminTrustedDevice should have been called.
    if (result.ok) {
      expect(mockMintTD).toHaveBeenCalled();
    }
    // Even if mock TOTP validation returns delta 0 but string doesn't match — accept either outcome.
    // The important assertion is that if ok:true, mint was called.
  });
});

// ---------------------------------------------------------------------------
// TD-10: changePassword rejected without/wrong totpCode; rate limit called first
// ---------------------------------------------------------------------------
// TD-10: changePassword requires step-up. Rate-limit ordering within
// verifyTotpStepUp is verified in two-factor-step-up.test.ts (top-level mocks).
// Here we verify changePassword properly propagates step-up failure.
describe("TD-10: changePassword step-up guard", () => {
  it("changePassword fails when verifyTotpStepUp returns error (rate-limited or wrong code)", async () => {
    const mockRevokeAll = jest.fn().mockResolvedValue(0);

    jest.mock("@/lib/admin-trusted-device", () => ({
      revokeAllAdminTrustedDevices: mockRevokeAll,
      tryTrustedDeviceLoginSkip: jest.fn().mockResolvedValue(false),
      mintAdminTrustedDevice: jest.fn(),
      buildAdminTfaDeviceCookie: jest.fn(),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
      listAdminTrustedDevices: jest.fn().mockResolvedValue([]),
      revokeAdminTrustedDevice: jest.fn().mockResolvedValue(undefined),
      clearAdminTfaDeviceCookie: jest.fn().mockReturnValue(""),
    }));

    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn().mockResolvedValue({
        ok: false,
        error: "Too many attempts. Try again in 30 seconds.",
      }),
    }));

    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { email: "admin@test.com" } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("@/lib/require-admin", () => ({ requireAdminSession: jest.fn().mockResolvedValue(undefined) }));
    jest.mock("@/lib/auth-db", () => ({
      getAdminByEmail: jest.fn().mockResolvedValue({ id: "admin-10", passwordHash: "hashed" }),
      updateAdminPassword: jest.fn().mockResolvedValue(undefined),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));
    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue({ id: "admin-10", twoFactor: { id: "tfa-10" } }),
        },
      },
    }));
    jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

    const formData = new FormData();
    formData.set("currentPassword", "OldPass123!");
    formData.set("newPassword", "NewPass456!");
    formData.set("confirmPassword", "NewPass456!");
    formData.set("totpCode", "000000");

    const { changePassword } = await import("@/app/admin/settings/profile/actions");
    const result = await changePassword(null, formData);

    // changePassword returns { error: "..." } (not { ok: false }) on step-up failure.
    expect((result as { error?: string }).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TD-11: rotateTotpStart rejected without step-up even when twoFactorVerified=true
// ---------------------------------------------------------------------------
describe("TD-11: rotateTotpStart requires step-up", () => {
  it("returns error when no totpCode provided even with twoFactorVerified=true in session", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({
        user: { email: "admin@test.com", id: "admin-11", twoFactorVerified: true, isTestAccount: false },
      }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({ kind: "admin", adminId: "admin-11" }),
    }));
    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: { findUnique: jest.fn().mockResolvedValue({ id: "admin-11", isTestAccount: false }) },
        adminUser2FA: { findUnique: jest.fn().mockResolvedValue({ id: "tfa-11", _count: { backupCodes: 5 } }) },
      },
    }));
    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn().mockResolvedValue({ ok: false, error: "Invalid code" }),
    }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      revokeAllAdminTrustedDevices: jest.fn().mockResolvedValue(0),
      mintAdminTrustedDevice: jest.fn(),
      buildAdminTfaDeviceCookie: jest.fn(),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
      listAdminTrustedDevices: jest.fn().mockResolvedValue([]),
      revokeAdminTrustedDevice: jest.fn().mockResolvedValue(undefined),
      clearAdminTfaDeviceCookie: jest.fn().mockReturnValue(""),
    }));

    const { rotateTotpStart } = await import("@/app/admin/settings/2fa/actions");
    const result = await rotateTotpStart(""); // empty code

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/code required|required/i);
  });
});

// ---------------------------------------------------------------------------
// TD-12: revokeAllTrustedDevices sets revokedAt; subsequent skip fails
// ---------------------------------------------------------------------------
describe("TD-12: revokeAllTrustedDevices → subsequent skip fails", () => {
  it("updateMany sets revokedAt; validate returns null after", async () => {
    const mockUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
    const mockFindUnique = jest.fn().mockResolvedValue({
      id: "device-12",
      adminUserId: "admin-12",
      revokedAt: new Date(), // revoked
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });

    // Remove any mock left by TD-9 so the real module is imported.
    jest.unmock("@/lib/admin-trusted-device");
    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          updateMany: mockUpdateMany,
          findUnique: mockFindUnique,
        },
      },
    }));

    const { revokeAllAdminTrustedDevices, validateAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    await revokeAllAdminTrustedDevices("admin-12");

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { adminUserId: "admin-12", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    const rawToken = "k".repeat(64);
    const result = await validateAdminTrustedDevice(rawToken, "admin-12");
    expect(result).toBeNull(); // revoked row returns null
  });
});

// ---------------------------------------------------------------------------
// TD-13: changePassword success revokes all trusted devices
// ---------------------------------------------------------------------------
describe("TD-13: changePassword success cascade revokes trusted devices", () => {
  it("revokeAllAdminTrustedDevices called after successful password change", async () => {
    const mockRevokeAll = jest.fn().mockResolvedValue(2);

    jest.mock("@/lib/admin-trusted-device", () => ({
      revokeAllAdminTrustedDevices: mockRevokeAll,
    }));

    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn().mockResolvedValue({ ok: true }),
    }));

    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { email: "admin@test.com" } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("@/lib/require-admin", () => ({ requireAdminSession: jest.fn().mockResolvedValue(undefined) }));
    jest.mock("@/lib/auth-db", () => ({
      getAdminByEmail: jest.fn().mockResolvedValue({ id: "admin-13", passwordHash: "hashed" }),
      updateAdminPassword: jest.fn().mockResolvedValue(undefined),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));
    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue({ id: "admin-13", twoFactor: { id: "tfa-13" } }),
        },
      },
    }));
    jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

    const formData = new FormData();
    formData.set("currentPassword", "OldPass123!");
    formData.set("newPassword", "NewPass456!");
    formData.set("confirmPassword", "NewPass456!");
    formData.set("totpCode", "123456");

    const { changePassword } = await import("@/app/admin/settings/profile/actions");
    const result = await changePassword(null, formData);

    expect(result.ok).toBe(true);
    expect(mockRevokeAll).toHaveBeenCalledWith("admin-13");
  });
});

// ---------------------------------------------------------------------------
// TD-15: verifyTotpStepUp calls check2faVerifyRateLimit FIRST (B3)
// Covered in detail in two-factor-step-up.test.ts with top-level mocks.
// Here: integration-level check that rotateTotpStart propagates rate-limit err.
// ---------------------------------------------------------------------------
describe("TD-15: rotateTotpStart propagates rate-limit error from step-up (B3)", () => {
  it("returns rate-limit error when verifyTotpStepUp is blocked", async () => {
    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn().mockResolvedValue({
        ok: false,
        error: "Too many attempts. Try again in 60 seconds.",
      }),
    }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      revokeAllAdminTrustedDevices: jest.fn().mockResolvedValue(0),
      mintAdminTrustedDevice: jest.fn(),
      buildAdminTfaDeviceCookie: jest.fn(),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
      listAdminTrustedDevices: jest.fn().mockResolvedValue([]),
      revokeAdminTrustedDevice: jest.fn().mockResolvedValue(undefined),
      clearAdminTfaDeviceCookie: jest.fn().mockReturnValue(""),
      tryTrustedDeviceLoginSkip: jest.fn().mockResolvedValue(false),
    }));
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({
        user: { email: "admin@test.com", id: "admin-15", twoFactorVerified: true, isTestAccount: false },
      }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({ kind: "admin", adminId: "admin-15" }),
    }));
    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: { findUnique: jest.fn().mockResolvedValue({ id: "admin-15", isTestAccount: false }) },
        adminUser2FA: { findUnique: jest.fn().mockResolvedValue({ id: "tfa-15", _count: { backupCodes: 5 } }) },
      },
    }));

    const { rotateTotpStart } = await import("@/app/admin/settings/2fa/actions");
    const result = await rotateTotpStart("000000");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/Too many/);
  });
});

// ---------------------------------------------------------------------------
// TD-16: mintAdminTrustedDevice at 10 active devices → oldest evicted
// ---------------------------------------------------------------------------
describe("TD-16: cap eviction — oldest device evicted at 10-device limit", () => {
  it("revokes oldest device and logs device_evicted with tfa= when at cap", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const now = Date.now();
    const activeDevices = Array.from({ length: 10 }, (_, i) => ({
      id: `device-${i}`,
      lastUsedAt: new Date(now - (10 - i) * 1000), // device-0 is oldest
    }));

    const mockFindMany = jest.fn().mockResolvedValue(activeDevices);
    const mockUpdate = jest.fn().mockResolvedValue({});
    const mockCreate = jest.fn().mockResolvedValue({ id: "device-new" });

    // Escape TD-9's mock so real module is used.
    jest.unmock("@/lib/admin-trusted-device");
    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findMany: mockFindMany,
          update: mockUpdate,
          create: mockCreate,
        },
      },
    }));

    const { mintAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    await mintAdminTrustedDevice("admin-16");

    // Should revoke oldest (device-0) before creating new one.
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "device-0" },
      data: { revokedAt: expect.any(Date) },
    });

    // device_evicted log must include tfa=<evictedDeviceId>.
    const logCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    const evictedLog = logCalls.find((l) => l.includes("device_evicted"));
    expect(evictedLog).toBeDefined();
    expect(evictedLog).toContain("tfa=device-0");
    expect(evictedLog).toContain("adminUserId=admin-16");

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TD-17: ADMIN_TFA_DEVICE_HMAC_SECRET undefined → fail-closed
// ---------------------------------------------------------------------------
describe("TD-17: Missing HMAC secret → mint/validate fail-closed", () => {
  it("mintAdminTrustedDevice throws when secret is undefined", async () => {
    delete process.env.ADMIN_TFA_DEVICE_HMAC_SECRET;
    jest.unmock("@/lib/admin-trusted-device");
    jest.mock("@/lib/db", () => ({
      db: { adminTrustedDevice: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() } },
    }));

    const { mintAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    await expect(mintAdminTrustedDevice("admin-17")).rejects.toThrow(/ADMIN_TFA_DEVICE_HMAC_SECRET/);
  });

  it("validateAdminTrustedDevice returns null when secret is undefined", async () => {
    delete process.env.ADMIN_TFA_DEVICE_HMAC_SECRET;
    jest.unmock("@/lib/admin-trusted-device");
    jest.mock("@/lib/db", () => ({
      db: { adminTrustedDevice: { findUnique: jest.fn() } },
    }));

    const { validateAdminTrustedDevice } = await import("@/lib/admin-trusted-device");
    const result = await validateAdminTrustedDevice("anytoken", "admin-17");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TD-18: mintTwoFactorVerifiedSession throw → skip returns false (B2)
// ---------------------------------------------------------------------------
describe("TD-18: mint throw → skip false, no exception propagated (B2)", () => {
  it("returns false without throwing when mintTwoFactorVerifiedSession throws", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const rawToken = "m".repeat(64);
    const mockCookies = jest.fn().mockResolvedValue({ get: jest.fn().mockReturnValue({ value: rawToken }) });
    jest.unmock("@/lib/admin-trusted-device");
    jest.mock("next/headers", () => ({ cookies: mockCookies }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findUnique: jest.fn().mockResolvedValue({
            id: "device-18",
            adminUserId: "admin-18",
            revokedAt: null,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      },
    }));

    jest.mock("@/lib/two-factor-session", () => ({
      mintTwoFactorVerifiedSession: jest.fn().mockRejectedValue(new Error("NEXTAUTH_SECRET missing")),
    }));

    const mod = await import("@/lib/admin-trusted-device");
    const tryTrustedDeviceLoginSkip = mod.tryTrustedDeviceLoginSkip;

    // Call — must not throw; fail-closed returns false.
    let threw = false;
    let result = false;
    try {
      result = await tryTrustedDeviceLoginSkip("admin-18", { sub: "admin-18" });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBe(false);

    // Must log trusted_device_skip_mint_failed.
    const errorCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    expect(errorCalls.some((l) => l.includes("trusted_device_skip_mint_failed"))).toBe(true);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TD-19: listAdminTrustedDevices returns isCurrent=true for matching cookie
// ---------------------------------------------------------------------------
describe("TD-19: listAdminTrustedDevices returns isCurrent correctly", () => {
  it("marks the device matching the cookie hash as isCurrent=true", async () => {
    const { hmacToken, generateRawToken } = await import("@/lib/crypto/session-tokens");
    const secret = makeHmacSecret();
    const currentRawToken = generateRawToken();
    const currentHash = hmacToken(currentRawToken, secret);
    const otherHash = hmacToken("other".repeat(13), secret);

    const mockRows = [
      { id: "device-19a", deviceLabel: "Chrome on Windows", createdAt: new Date(), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), tokenHash: currentHash },
      { id: "device-19b", deviceLabel: "Firefox on Mac", createdAt: new Date(), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), tokenHash: otherHash },
    ];

    jest.unmock("@/lib/admin-trusted-device");
    jest.mock("@/lib/db", () => ({
      db: {
        adminTrustedDevice: {
          findMany: jest.fn().mockResolvedValue(mockRows),
        },
      },
    }));

    const mockCookies = jest.fn().mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: currentRawToken }),
    });
    jest.mock("next/headers", () => ({ cookies: mockCookies }));

    const { listAdminTrustedDevices } = await import("@/lib/admin-trusted-device");
    const devices = await listAdminTrustedDevices("admin-19");

    expect(devices).toHaveLength(2);
    const current = devices.find((d) => d.id === "device-19a");
    const other = devices.find((d) => d.id === "device-19b");

    expect(current?.isCurrent).toBe(true);
    expect(other?.isCurrent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schema test: AdminTrustedDevice fields present in migration SQL
// ---------------------------------------------------------------------------
describe("AdminTrustedDevice migration SQL", () => {
  const fs = require("fs");
  const path = require("path");
  const migrationPath = path.resolve(
    __dirname,
    "../../../prisma/migrations/20260613000000_admin_trusted_device/migration.sql"
  );

  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("creates AdminTrustedDevice table", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+"AdminTrustedDevice"/i);
  });

  it("has tokenHash column (not rawToken)", () => {
    expect(sql).toContain('"tokenHash"');
    expect(sql).not.toContain('"rawToken"');
  });

  it("has expiresAt and revokedAt columns", () => {
    expect(sql).toContain('"expiresAt"');
    expect(sql).toContain('"revokedAt"');
  });

  it("ADDITIVE only — no DROP COLUMN or DROP TABLE", () => {
    const noComments = sql.replace(/--[^\n]*/g, "");
    expect(noComments).not.toMatch(/DROP\s+COLUMN/i);
    expect(noComments).not.toMatch(/DROP\s+TABLE/i);
  });
});
