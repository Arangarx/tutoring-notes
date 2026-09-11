import {
  isSms2faEnrollmentAvailable,
  isTwoFactorEnrollmentConfirmed,
} from "@/lib/two-factor-enrollment";

describe("isTwoFactorEnrollmentConfirmed", () => {
  it("EMAIL_OTP with enrolledAt and zero backups is confirmed", () => {
    expect(
      isTwoFactorEnrollmentConfirmed({
        method: "EMAIL_OTP",
        enrolledAt: new Date("2026-01-01"),
        backupCodeCount: 0,
      })
    ).toBe(true);
  });

  it("EMAIL_OTP without enrolledAt is not confirmed even with backup codes", () => {
    expect(
      isTwoFactorEnrollmentConfirmed({
        method: "EMAIL_OTP",
        enrolledAt: null,
        backupCodeCount: 5,
      })
    ).toBe(false);
  });

  it("TOTP with enrolledAt but zero backups is not confirmed", () => {
    expect(
      isTwoFactorEnrollmentConfirmed({
        method: "TOTP",
        enrolledAt: new Date("2026-01-01"),
        backupCodeCount: 0,
      })
    ).toBe(false);
  });

  it("TOTP with backup codes is confirmed", () => {
    expect(
      isTwoFactorEnrollmentConfirmed({
        method: "TOTP",
        enrolledAt: new Date("2026-01-01"),
        backupCodeCount: 3,
      })
    ).toBe(true);
  });

  it("SMS_OTP follows enrolledAt oracle (forward-compat)", () => {
    expect(
      isTwoFactorEnrollmentConfirmed({
        method: "SMS_OTP",
        enrolledAt: new Date("2026-06-01"),
        backupCodeCount: 0,
      })
    ).toBe(true);
    expect(
      isTwoFactorEnrollmentConfirmed({
        method: "SMS_OTP",
        enrolledAt: null,
        backupCodeCount: 2,
      })
    ).toBe(false);
  });
});

describe("isSms2faEnrollmentAvailable", () => {
  const originalSid = process.env.TWILIO_ACCOUNT_SID;
  const originalToken = process.env.TWILIO_AUTH_TOKEN;
  const originalFrom = process.env.TWILIO_FROM_NUMBER;

  afterEach(() => {
    if (originalSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = originalSid;
    if (originalToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = originalToken;
    if (originalFrom === undefined) delete process.env.TWILIO_FROM_NUMBER;
    else process.env.TWILIO_FROM_NUMBER = originalFrom;
  });

  it("returns false when Twilio env is absent entirely", () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    expect(isSms2faEnrollmentAvailable()).toBe(false);
  });

  it("returns false when only SID + TOKEN are present (FROM_NUMBER required too)", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token";
    delete process.env.TWILIO_FROM_NUMBER;
    expect(isSms2faEnrollmentAvailable()).toBe(false);
  });

  it("returns false when FROM_NUMBER is present but SID or TOKEN are missing", () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15551234567";
    expect(isSms2faEnrollmentAvailable()).toBe(false);
  });

  it("returns true when SID + TOKEN + FROM_NUMBER are all present", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15551234567";
    expect(isSms2faEnrollmentAvailable()).toBe(true);
  });
});
