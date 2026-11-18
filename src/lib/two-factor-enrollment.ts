import { isEmailConfigured } from "@/lib/env";

/**
 * Shared enrollment confirmation oracle for 2FA setup and manage pages.
 *
 * EMAIL_OTP / SMS_OTP: confirmed when enrolledAt is set (backup codes irrelevant).
 * TOTP (default): confirmed when at least one backup code exists.
 */

export function isTwoFactorEnrollmentConfirmed(row: {
  method: string;
  enrolledAt: Date | null;
  backupCodeCount: number;
}): boolean {
  if (row.method === "EMAIL_OTP" || row.method === "SMS_OTP") {
    return row.enrolledAt != null;
  }
  return row.backupCodeCount > 0;
}

/** True when SMS 2FA enrollment can be offered (Twilio sender fully configured). */
export function isSms2faEnrollmentAvailable(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
    process.env.TWILIO_AUTH_TOKEN?.trim() &&
    process.env.TWILIO_FROM_NUMBER?.trim()
  );
}

/**
 * True when an email 2FA code can be sent.
 * `isEmailConfigured()` is the product check. The Playwright identity harness
 * completes email OTP without SMTP (`sendEmailOtpChallenge` returns ok when
 * `PLAYWRIGHT_TEST=1`), so the chooser stays available there too.
 */
export function isEmail2faEnrollmentAvailable(): boolean {
  if (process.env.PLAYWRIGHT_TEST === "1") return true;
  return isEmailConfigured();
}
