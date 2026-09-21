// @ts-nocheck
/**
 * SMS A2P consent — server actions refuse send without explicit smsConsent.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const ORIG_ENV = { ...process.env };
const ADMIN_ID = "sms-a2p-consent-admin";
const TEST_PHONE_INPUT = "5551234567";

function setupAuthMocks(): void {
  jest.mock("next-auth", () => ({
    getServerSession: jest.fn().mockResolvedValue({
      user: { email: "sms-a2p@example.com", id: ADMIN_ID, isTestAccount: false },
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
  jest.mock("next/headers", () => ({
    cookies: jest.fn().mockResolvedValue({ get: jest.fn(), set: jest.fn(), delete: jest.fn() }),
    headers: jest.fn().mockResolvedValue({ get: jest.fn() }),
  }));
}

async function ensureAdmin(): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.adminUser.upsert({
    where: { id: ADMIN_ID },
    create: {
      id: ADMIN_ID,
      email: "sms-a2p@example.com",
      passwordHash: "test",
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
    update: {},
  });
  await db.adminUser2FA.deleteMany({ where: { adminUserId: ADMIN_ID } });
}

describe("SMS A2P consent — startSmsOtpEnrollment / startSmsOtpMethodChange", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "test_token";
    process.env.TWILIO_FROM_NUMBER = "+15559999999";
    process.env.NEXTAUTH_SECRET = "test-nextauth-secret-must-be-at-least-32-chars-long";
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 0xaa).toString("base64url");
  });

  afterEach(async () => {
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(null);
    const { db } = await import("@/lib/db");
    await db.adminUser2FA.deleteMany({ where: { adminUserId: ADMIN_ID } });
    process.env = { ...ORIG_ENV };
  });

  it("startSmsOtpEnrollment without consent does not call sendSms", async () => {
    setupAuthMocks();
    await ensureAdmin();

    const mockSender = jest.fn().mockResolvedValue({ sent: true });
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(mockSender);

    const { startSmsOtpEnrollment } = await import("@/app/admin/settings/2fa/actions");
    const result = await startSmsOtpEnrollment(TEST_PHONE_INPUT, false);

    expect(result.ok).toBe(false);
    expect(mockSender).not.toHaveBeenCalled();

    const { db } = await import("@/lib/db");
    const row = await db.adminUser2FA.findUnique({ where: { adminUserId: ADMIN_ID } });
    expect(row).toBeNull();
  });

  it("startSmsOtpEnrollment with consent sends SMS body containing Mynk and STOP", async () => {
    setupAuthMocks();
    await ensureAdmin();

    let capturedBody = "";
    const mockSender = jest.fn().mockImplementation(async (opts: { body: string }) => {
      capturedBody = opts.body;
      return { sent: true };
    });
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(mockSender);

    const { startSmsOtpEnrollment } = await import("@/app/admin/settings/2fa/actions");
    const result = await startSmsOtpEnrollment(TEST_PHONE_INPUT, true);

    expect(result.ok).toBe(true);
    expect(mockSender).toHaveBeenCalledTimes(1);
    expect(capturedBody).toMatch(/Mynk/);
    expect(capturedBody).toMatch(/Reply STOP to opt out\./);
  });

  it("startSmsOtpMethodChange without consent does not call sendSms", async () => {
    setupAuthMocks();
    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn().mockResolvedValue({ ok: true }),
    }));

    await ensureAdmin();
    const { db } = await import("@/lib/db");
    await db.adminUser2FA.create({
      data: {
        adminUserId: ADMIN_ID,
        method: "EMAIL_OTP",
        enrolledAt: new Date("2026-01-01"),
        totpSecretEnc: null,
      },
    });

    const mockSender = jest.fn().mockResolvedValue({ sent: true });
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(mockSender);

    const { startMethodChangeStepUp, startSmsOtpMethodChange } = await import(
      "@/app/admin/settings/2fa/actions"
    );
    expect((await startMethodChangeStepUp("111111")).ok).toBe(true);

    const result = await startSmsOtpMethodChange(TEST_PHONE_INPUT, false);
    expect(result.ok).toBe(false);
    expect(mockSender).not.toHaveBeenCalled();
  });
});
