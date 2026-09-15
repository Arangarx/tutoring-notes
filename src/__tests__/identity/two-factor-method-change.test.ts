// @ts-nocheck — Jest 30 mock factory inference produces `never` return types.
/**
 * Change-method (WS3 punch list item 1) — real-DB integration tests.
 *
 * Covers the atomic-swap invariants that were previously UNTESTED:
 *   - startSmsOtpMethodChange on send-fail leaves the OLD method fully enrolled
 *     (enrolledAt unchanged, phoneE164 still null) — no partial mutation.
 *   - startSmsOtpMethodChange started but NEVER confirmed leaves the OLD method
 *     fully enrolled (pending* fields are shadow-only until confirm).
 *   - confirmSmsOtpMethodChange flips method=SMS_OTP, sets phoneE164, clears the
 *     old TOTP secret + backup codes, and leaves exactly ONE AdminUser2FA row.
 *   - startSmsOtpEnrollment (first-time path) REFUSES to blow away an
 *     already-confirmed enrollment (the deleteMany-without-guard bug).
 *
 * Uses the real @/lib/db (local test Postgres, self-provisioned by jest) +
 * the real @/lib/sms injectable sender seam — only next-auth/session-scope
 * plumbing and the TOTP step-up check are mocked, mirroring the pattern in
 * src/__tests__/identity/email-otp-actions.test.ts and
 * src/__tests__/identity/otp-challenge.test.ts.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const ORIG_ENV = { ...process.env };
const ADMIN_ID = "method-change-test-admin";
const TEST_PHONE_INPUT = "5551234567";
const TEST_PHONE_E164 = "+15551234567";

function makeCookieStore() {
  const store = new Map<string, string>();
  return {
    get: (name: string) => (store.has(name) ? { value: store.get(name) } : undefined),
    set: (name: string, value: string) => {
      if (value === "") store.delete(name);
      else store.set(name, value);
    },
  };
}

function setupAuthMocks(): void {
  jest.mock("next-auth", () => ({
    getServerSession: jest.fn().mockResolvedValue({
      user: { email: "method-change@example.com", id: ADMIN_ID, isTestAccount: false },
    }),
  }));
  jest.mock("@/auth-options", () => ({ authOptions: {} }));
  jest.mock("@/lib/student-scope", () => ({
    requireStudentScope: jest.fn().mockResolvedValue({ kind: "admin", adminId: ADMIN_ID }),
  }));
  jest.mock("next/navigation", () => ({
    redirect: jest.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
  }));
}

async function ensureAdmin(): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.adminUser.upsert({
    where: { id: ADMIN_ID },
    create: {
      id: ADMIN_ID,
      email: "method-change@example.com",
      passwordHash: "test",
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
    update: {},
  });
}

/** Seeds a confirmed EMAIL_OTP enrollment. Returns the AdminUser2FA row id. */
async function seedConfirmedEmailOtp(): Promise<string> {
  const { db } = await import("@/lib/db");
  await db.adminUser2FA.deleteMany({ where: { adminUserId: ADMIN_ID } });
  const row = await db.adminUser2FA.create({
    data: {
      adminUserId: ADMIN_ID,
      method: "EMAIL_OTP",
      totpSecretEnc: null,
      phoneE164: null,
      enrolledAt: new Date("2026-01-01T00:00:00Z"),
    },
    select: { id: true },
  });
  return row.id;
}

/** Seeds a confirmed TOTP enrollment with 2 backup codes. Returns the row id. */
async function seedConfirmedTotpWithBackupCodes(): Promise<string> {
  const { db } = await import("@/lib/db");
  await db.adminUser2FA.deleteMany({ where: { adminUserId: ADMIN_ID } });
  const row = await db.adminUser2FA.create({
    data: {
      adminUserId: ADMIN_ID,
      method: "TOTP",
      totpSecretEnc: "fake-enc-blob",
      phoneE164: null,
      enrolledAt: new Date("2026-01-01T00:00:00Z"),
    },
    select: { id: true },
  });
  await db.adminUser2FABackupCode.createMany({
    data: [
      { twoFaId: row.id, codeHash: "hash1" },
      { twoFaId: row.id, codeHash: "hash2" },
    ],
  });
  return row.id;
}

async function cleanupAll(): Promise<void> {
  const { db } = await import("@/lib/db");
  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: ADMIN_ID },
    select: { id: true },
  });
  if (row) {
    await db.adminUser2FABackupCode.deleteMany({ where: { twoFaId: row.id } });
  }
  await db.adminUser2FAEmailChallenge.deleteMany({ where: { adminUserId: ADMIN_ID } });
  await db.authThrottle.deleteMany({
    where: {
      OR: [
        { scopeKey: { startsWith: "2fa-otp-send:" } },
        { scopeKey: `2fa-verify:${ADMIN_ID}` },
      ],
    },
  });
  await db.adminTrustedDevice.deleteMany({ where: { adminUserId: ADMIN_ID } });
  await db.adminUser2FA.deleteMany({ where: { adminUserId: ADMIN_ID } });
}

beforeEach(async () => {
  jest.resetModules();
  process.env.NEXTAUTH_SECRET = "test-nextauth-secret-must-be-at-least-32-chars-long";
  process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 0xaa).toString("base64url");
  await ensureAdmin();
  await cleanupAll();

  const { db } = await import("@/lib/db");
  // Re-seed nothing here — each test seeds its own starting state after mocks
  // are installed, since jest.resetModules() means @/lib/db is a fresh module
  // instance per test and we want the DB clean going in.
  void db;
});

afterEach(async () => {
  await cleanupAll();
  const { db } = await import("@/lib/db");
  await db.adminUser.deleteMany({ where: { id: ADMIN_ID } });
  process.env = { ...ORIG_ENV };
});

describe("change-method atomic-swap invariants (WS3 punch list item 1)", () => {
  beforeEach(() => {
    // startSmsOtpMethodChange fails closed via isSms2faEnrollmentAvailable() same as
    // the first-time enroll path — these tests target the atomic-swap invariants
    // downstream of that gate, so configure Twilio to reach them.
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "test_token";
    process.env.TWILIO_FROM_NUMBER = "+15559999999";
  });

  it("startSmsOtpMethodChange send-fail: old EMAIL_OTP method stays fully enrolled, phoneE164 stays null", async () => {
    setupAuthMocks();
    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn().mockResolvedValue({ ok: true }),
    }));
    jest.mock("next/headers", () => {
      const cookieStore = makeCookieStore();
      return {
        cookies: jest.fn().mockResolvedValue(cookieStore),
        headers: jest.fn().mockResolvedValue({ get: jest.fn() }),
      };
    });

    await seedConfirmedEmailOtp();

    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(jest.fn().mockResolvedValue({ sent: false, error: "Twilio down" }));

    const { startMethodChangeStepUp, startSmsOtpMethodChange } = await import(
      "@/app/admin/settings/2fa/actions"
    );

    const stepUp = await startMethodChangeStepUp("111111");
    expect(stepUp.ok).toBe(true);

    const changeResult = await startSmsOtpMethodChange(TEST_PHONE_INPUT);
    expect(changeResult.ok).toBe(false);

    const { db } = await import("@/lib/db");
    const row = await db.adminUser2FA.findUnique({ where: { adminUserId: ADMIN_ID } });
    expect(row.method).toBe("EMAIL_OTP");
    expect(row.phoneE164).toBeNull();
    expect(row.enrolledAt).not.toBeNull();
    expect(row.pendingMethod).toBeNull();
    expect(row.pendingPhoneE164).toBeNull();

    setSmsSenderForTests(null);
  });

  it("startSmsOtpMethodChange started but never confirmed: old TOTP method stays fully enrolled", async () => {
    setupAuthMocks();
    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn().mockResolvedValue({ ok: true }),
    }));
    jest.mock("next/headers", () => {
      const cookieStore = makeCookieStore();
      return {
        cookies: jest.fn().mockResolvedValue(cookieStore),
        headers: jest.fn().mockResolvedValue({ get: jest.fn() }),
      };
    });

    await seedConfirmedTotpWithBackupCodes();

    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(jest.fn().mockResolvedValue({ sent: true }));

    const { startMethodChangeStepUp, startSmsOtpMethodChange } = await import(
      "@/app/admin/settings/2fa/actions"
    );

    const stepUp = await startMethodChangeStepUp("111111");
    expect(stepUp.ok).toBe(true);

    const changeResult = await startSmsOtpMethodChange(TEST_PHONE_INPUT);
    expect(changeResult.ok).toBe(true); // send succeeded — pending state written

    // Never confirmed. Old method must still be the live, enrolled one.
    const { db } = await import("@/lib/db");
    const row = await db.adminUser2FA.findUnique({ where: { adminUserId: ADMIN_ID } });
    expect(row.method).toBe("TOTP");
    expect(row.phoneE164).toBeNull();
    expect(row.totpSecretEnc).toBe("fake-enc-blob");
    expect(row.enrolledAt).not.toBeNull();
    // Pending shadow fields ARE set (that's the point — shadow, not live).
    expect(row.pendingMethod).toBe("SMS_OTP");
    expect(row.pendingPhoneE164).toBe(TEST_PHONE_E164);

    const backupCount = await db.adminUser2FABackupCode.count({ where: { twoFaId: row.id } });
    expect(backupCount).toBe(2); // untouched — old method's recovery codes still valid

    setSmsSenderForTests(null);
  });

  it("confirmSmsOtpMethodChange: flips to SMS_OTP, sets phoneE164, clears old TOTP secret + backup codes, exactly one row", async () => {
    setupAuthMocks();
    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn().mockResolvedValue({ ok: true }),
    }));
    jest.mock("next/headers", () => {
      const cookieStore = makeCookieStore();
      return {
        cookies: jest.fn().mockResolvedValue(cookieStore),
        headers: jest.fn().mockResolvedValue({ get: jest.fn() }),
      };
    });

    await seedConfirmedTotpWithBackupCodes();

    let capturedCode = "";
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(
      jest.fn().mockImplementation(async (opts: { body: string }) => {
        const match = opts.body.match(/(\d{6})/);
        if (match) capturedCode = match[1];
        return { sent: true };
      })
    );

    const {
      startMethodChangeStepUp,
      startSmsOtpMethodChange,
      confirmSmsOtpMethodChange,
    } = await import("@/app/admin/settings/2fa/actions");

    expect((await startMethodChangeStepUp("111111")).ok).toBe(true);
    expect((await startSmsOtpMethodChange(TEST_PHONE_INPUT)).ok).toBe(true);
    expect(capturedCode).toMatch(/^\d{6}$/);

    const confirmResult = await confirmSmsOtpMethodChange(capturedCode);
    expect(confirmResult.ok).toBe(true);

    const { db } = await import("@/lib/db");
    const rows = await db.adminUser2FA.findMany({ where: { adminUserId: ADMIN_ID } });
    expect(rows).toHaveLength(1); // exactly one row — atomic swap, not a second insert

    const row = rows[0];
    expect(row.method).toBe("SMS_OTP");
    expect(row.phoneE164).toBe(TEST_PHONE_E164);
    expect(row.totpSecretEnc).toBeNull();
    expect(row.pendingMethod).toBeNull();
    expect(row.pendingPhoneE164).toBeNull();
    expect(row.pendingTotpSecretEnc).toBeNull();
    expect(row.enrolledAt).not.toBeNull();

    const backupCount = await db.adminUser2FABackupCode.count({ where: { twoFaId: row.id } });
    expect(backupCount).toBe(0); // old TOTP recovery codes invalidated on method change

    setSmsSenderForTests(null);
  });
});

describe("startSmsOtpEnrollment guard — must not blow away a confirmed enrollment (WS3 punch list item 1)", () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "test_token";
    process.env.TWILIO_FROM_NUMBER = "+15559999999";
  });

  it("refuses when a CONFIRMED EMAIL_OTP enrollment already exists — old row untouched", async () => {
    setupAuthMocks();

    const twoFaId = await seedConfirmedEmailOtp();

    const { startSmsOtpEnrollment } = await import("@/app/admin/settings/2fa/actions");
    const result = await startSmsOtpEnrollment(TEST_PHONE_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/already have two-factor authentication|change method/i);
    }

    const { db } = await import("@/lib/db");
    const row = await db.adminUser2FA.findUnique({ where: { id: twoFaId } });
    expect(row).not.toBeNull(); // NOT deleted by the guard
    expect(row.method).toBe("EMAIL_OTP");
    expect(row.enrolledAt).not.toBeNull();
  });

  it("refuses when a CONFIRMED TOTP enrollment already exists — old row + backup codes untouched", async () => {
    setupAuthMocks();

    const twoFaId = await seedConfirmedTotpWithBackupCodes();

    const { startSmsOtpEnrollment } = await import("@/app/admin/settings/2fa/actions");
    const result = await startSmsOtpEnrollment(TEST_PHONE_INPUT);

    expect(result.ok).toBe(false);

    const { db } = await import("@/lib/db");
    const row = await db.adminUser2FA.findUnique({ where: { id: twoFaId } });
    expect(row).not.toBeNull();
    expect(row.method).toBe("TOTP");
    const backupCount = await db.adminUser2FABackupCode.count({ where: { twoFaId } });
    expect(backupCount).toBe(2);
  });

  it("still allows enrollment when the existing row is UNCONFIRMED (enrolledAt null) — no live enrollment to protect", async () => {
    setupAuthMocks();
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue(makeCookieStore()),
      headers: jest.fn().mockResolvedValue({ get: jest.fn() }),
    }));

    const { db } = await import("@/lib/db");
    await db.adminUser2FA.deleteMany({ where: { adminUserId: ADMIN_ID } });
    await db.adminUser2FA.create({
      data: {
        adminUserId: ADMIN_ID,
        method: "TOTP",
        totpSecretEnc: "abandoned-mid-enroll",
        enrolledAt: null, // never confirmed — abandoned enrollment
      },
    });

    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(jest.fn().mockResolvedValue({ sent: true }));

    const { startSmsOtpEnrollment } = await import("@/app/admin/settings/2fa/actions");
    const result = await startSmsOtpEnrollment(TEST_PHONE_INPUT);
    expect(result.ok).toBe(true);

    const row = await db.adminUser2FA.findUnique({ where: { adminUserId: ADMIN_ID } });
    expect(row.method).toBe("SMS_OTP");
    expect(row.pendingPhoneE164).toBe(TEST_PHONE_E164);

    setSmsSenderForTests(null);
  });
});
