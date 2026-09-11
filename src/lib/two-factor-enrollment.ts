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
