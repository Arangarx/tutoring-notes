// @ts-nocheck — Jest 30 mock factory inference produces `never` return types.
/**
 * Generalized OTP challenge module — channel isolation, SMS send, rate limits.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const ORIG_ENV = { ...process.env };
const adminUserId = "otp-challenge-test-admin";
const twoFaId = "otp-challenge-test-twofa";
const testPhone = "+15551234567";

async function ensureTestAdmin(): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.adminUser.upsert({
    where: { id: adminUserId },
    create: {
      id: adminUserId,
      email: "otp-challenge-test@example.com",
      passwordHash: "test",
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
    update: {},
  });
  await db.adminUser2FA.upsert({
    where: { adminUserId },
    create: {
      id: twoFaId,
      adminUserId,
      method: "SMS_OTP",
      totpSecretEnc: null,
      enrolledAt: new Date(),
    },
    update: { method: "SMS_OTP", totpSecretEnc: null },
  });
}

async function cleanupTestData(): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.adminUser2FAEmailChallenge.deleteMany({ where: { adminUserId } });
  await db.authThrottle.deleteMany({
    where: { scopeKey: { startsWith: "2fa-otp-send:" } },
  });
}

describe("otp-challenge DB behaviour", () => {
  beforeEach(async () => {
    jest.resetModules();
    process.env.NEXTAUTH_SECRET = "test-nextauth-secret-must-be-at-least-32-chars-long";
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 0xaa).toString("base64url");
    await ensureTestAdmin();
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
    const { db } = await import("@/lib/db");
    await db.adminUser2FA.deleteMany({ where: { adminUserId } });
    await db.adminUser.deleteMany({ where: { id: adminUserId } });
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(null);
    process.env = { ...ORIG_ENV };
  });

  it("channel isolation: new EMAIL send does not invalidate in-flight SMS challenge", async () => {
    jest.mock("@/lib/email", () => ({
      sendPlatformMail: jest.fn().mockResolvedValue({ sent: true }),
    }));

    const {
      createOtpChallenge,
      sendEmailOtpChallenge,
      verifyOtpChallenge,
    } = await import("@/lib/otp-challenge");

    const smsCode = "222222";
    await createOtpChallenge({
      adminUserId,
      twoFaId,
      purpose: "LOGIN",
      channel: "SMS",
      plaintextCode: smsCode,
    });

    await sendEmailOtpChallenge({
      adminUserId,
      email: "otp-challenge-test@example.com",
      purpose: "LOGIN",
      twoFaId,
    });

    const smsVerify = await verifyOtpChallenge({
      adminUserId,
      code: smsCode,
      purpose: "LOGIN",
      channel: "SMS",
    });
    expect(smsVerify.ok).toBe(true);
  });

  it("channel isolation: new SMS send does not invalidate in-flight EMAIL challenge", async () => {
    const capturedCodes: string[] = [];
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(
      jest.fn().mockImplementation(async (opts: { body: string }) => {
        const match = opts.body.match(/(\d{6})/);
        if (match) capturedCodes.push(match[1]);
        return { sent: true };
      })
    );

    const {
      createOtpChallenge,
      sendSmsOtpChallenge,
      verifyOtpChallenge,
    } = await import("@/lib/otp-challenge");

    const emailCode = "333333";
    await createOtpChallenge({
      adminUserId,
      twoFaId,
      purpose: "LOGIN",
      channel: "EMAIL",
      plaintextCode: emailCode,
    });

    await sendSmsOtpChallenge({
      adminUserId,
      toE164: testPhone,
      purpose: "LOGIN",
      twoFaId,
    });

    const emailVerify = await verifyOtpChallenge({
      adminUserId,
      code: emailCode,
      purpose: "LOGIN",
      channel: "EMAIL",
    });
    expect(emailVerify.ok).toBe(true);
  });

  it("rate-limit independence: EMAIL throttle does not block SMS", async () => {
    const { checkOtpSendRateLimit, OTP_SEND_MAX } = await import("@/lib/otp-challenge");
    expect(OTP_SEND_MAX).toBe(3);

    for (let i = 0; i < OTP_SEND_MAX; i++) {
      const r = await checkOtpSendRateLimit("EMAIL", adminUserId);
      expect(r.allowed).toBe(true);
    }
    const emailBlocked = await checkOtpSendRateLimit("EMAIL", adminUserId);
    expect(emailBlocked.allowed).toBe(false);

    const smsAllowed = await checkOtpSendRateLimit("SMS", adminUserId);
    expect(smsAllowed.allowed).toBe(true);
  });

  it("rate-limit independence: SMS throttle does not block EMAIL", async () => {
    const { checkOtpSendRateLimit, OTP_SEND_MAX } = await import("@/lib/otp-challenge");

    for (let i = 0; i < OTP_SEND_MAX; i++) {
      const r = await checkOtpSendRateLimit("SMS", adminUserId);
      expect(r.allowed).toBe(true);
    }
    const smsBlocked = await checkOtpSendRateLimit("SMS", adminUserId);
    expect(smsBlocked.allowed).toBe(false);

    const emailAllowed = await checkOtpSendRateLimit("EMAIL", adminUserId);
    expect(emailAllowed.allowed).toBe(true);
  });

  it("sendSmsOtpChallenge calls injected sender with correct toE164 and OTP in body; DB hash matches", async () => {
    const mockSender = jest.fn().mockImplementation(async (opts: { toE164: string; body: string }) => {
      return { sent: true };
    });
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(mockSender);

    const { sendSmsOtpChallenge, hashOtpCode } = await import("@/lib/otp-challenge");
    const result = await sendSmsOtpChallenge({
      adminUserId,
      toE164: testPhone,
      purpose: "ENROLL",
      twoFaId,
    });
    expect(result.ok).toBe(true);

    expect(mockSender).toHaveBeenCalledTimes(1);
    const call = mockSender.mock.calls[0][0] as { toE164: string; body: string };
    expect(call.toE164).toBe(testPhone);
    expect(call.body).toMatch(/Mynk/);
    expect(call.body).toMatch(/Reply STOP to opt out\./);
    const otpMatch = call.body.match(/(\d{6})/);
    expect(otpMatch).not.toBeNull();
    const otp = otpMatch![1];

    const { db } = await import("@/lib/db");
    const row = await db.adminUser2FAEmailChallenge.findFirst({
      where: { adminUserId, purpose: "ENROLL", channel: "SMS", usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(row).not.toBeNull();
    expect(row!.codeHash).toBe(hashOtpCode(otp));
  });

  it("sendSmsOtpChallenge returns ok:false on sender failure without leaking full E.164 in logs", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    const { setSmsSenderForTests, maskE164 } = await import("@/lib/sms");
    setSmsSenderForTests(jest.fn().mockResolvedValue({ sent: false, error: "Twilio down" }));

    try {
      const { sendSmsOtpChallenge } = await import("@/lib/otp-challenge");
      const result = await sendSmsOtpChallenge({
        adminUserId,
        toE164: testPhone,
        purpose: "LOGIN",
        twoFaId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/could not send the text message/i);
      }

      const joined = logs.join("\n");
      expect(joined).toContain(maskE164(testPhone));
      expect(joined).not.toContain(testPhone);
      const digitsOnly = testPhone.replace(/\D/g, "");
      expect(joined).not.toContain(digitsOnly);
    } finally {
      console.log = origLog;
    }
  });

  it("sendSmsOtpChallenge rate limit blocks after 3 sends / 15 min", async () => {
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(jest.fn().mockResolvedValue({ sent: true }));

    const { sendSmsOtpChallenge, OTP_SEND_MAX } = await import("@/lib/otp-challenge");
    expect(OTP_SEND_MAX).toBe(3);

    for (let i = 0; i < 3; i++) {
      const r = await sendSmsOtpChallenge({
        adminUserId,
        toE164: testPhone,
        purpose: "LOGIN",
        twoFaId,
      });
      expect(r.ok).toBe(true);
    }

    const blocked = await sendSmsOtpChallenge({
      adminUserId,
      toE164: testPhone,
      purpose: "LOGIN",
      twoFaId,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toMatch(/Too many code requests/i);
    }
  });

  it("verifyOtpChallenge rejects EMAIL code when checked under SMS channel", async () => {
    const { createOtpChallenge, verifyOtpChallenge } = await import("@/lib/otp-challenge");
    const code = "444444";
    await createOtpChallenge({
      adminUserId,
      twoFaId,
      purpose: "LOGIN",
      channel: "EMAIL",
      plaintextCode: code,
    });

    const wrongChannel = await verifyOtpChallenge({
      adminUserId,
      code,
      purpose: "LOGIN",
      channel: "SMS",
    });
    expect(wrongChannel.ok).toBe(false);
    if (!wrongChannel.ok) {
      expect(wrongChannel.error).toMatch(/Invalid or expired code/i);
    }
  });

  it("ensureLoginEmailCode sends when no unused login email code is waiting, and does not replace one", async () => {
    const { ensureLoginEmailCode, createOtpChallenge } = await import("@/lib/otp-challenge");
    const send = jest.fn(async () => ({ ok: true as const, maskedEmail: "a***@x.com" }));

    const missing = await ensureLoginEmailCode({ adminUserId, send });
    expect(missing.ready).toBe(true);
    expect(missing.maskedEmail).toBe("a***@x.com");
    expect(send).toHaveBeenCalledTimes(1);

    await createOtpChallenge({
      adminUserId,
      twoFaId,
      purpose: "LOGIN",
      channel: "EMAIL",
      plaintextCode: "121212",
    });
    send.mockClear();
    const waiting = await ensureLoginEmailCode({ adminUserId, send });
    expect(waiting.ready).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});
