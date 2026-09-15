/**
 * Email OTP challenges for admin/tutor 2FA — enroll + login verify.
 *
 * Re-export facade over the generalized (channel-aware)
 * `src/lib/otp-challenge.ts`, hardcoding channel="EMAIL". Kept as its own
 * module (same exported names as before the SMS chunk) so existing imports
 * (`@/lib/email-otp-challenge`) keep working unchanged.
 *
 * Log prefix: tfa (never log OTP plaintext or codeHash).
 * SERVER-ONLY.
 */

import type { AdminUser2FAEmailChallengePurpose } from "@prisma/client";
import {
  OTP_TTL_MS,
  OTP_SEND_MAX,
  OTP_SEND_WINDOW_MS,
  hashOtpCode,
  generateOtpCode,
  isValidOtpFormat,
  checkOtpSendRateLimit,
  invalidateUnusedOtpChallenges,
  createOtpChallenge,
  verifyOtpChallenge,
  sendEmailOtpChallenge as sendEmailOtpChallengeImpl,
} from "@/lib/otp-challenge";

export const EMAIL_OTP_TTL_MS = OTP_TTL_MS;
export const EMAIL_OTP_SEND_MAX = OTP_SEND_MAX;
export const EMAIL_OTP_SEND_WINDOW_MS = OTP_SEND_WINDOW_MS;

export const hashEmailOtpCode = hashOtpCode;
export const generateEmailOtpCode = generateOtpCode;
export const isValidEmailOtpFormat = isValidOtpFormat;

/** Send-rate limit: 3 requests / 15 min per adminUserId (EMAIL channel only). */
export async function checkEmailOtpSendRateLimit(adminUserId: string): Promise<{
  allowed: boolean;
  retryAfterMs: number;
}> {
  return checkOtpSendRateLimit("EMAIL", adminUserId);
}

export async function invalidateUnusedEmailOtpChallenges(
  adminUserId: string,
  purpose: AdminUser2FAEmailChallengePurpose
): Promise<void> {
  return invalidateUnusedOtpChallenges(adminUserId, purpose, "EMAIL");
}

export async function createEmailOtpChallenge(params: {
  adminUserId: string;
  twoFaId?: string | null;
  purpose: AdminUser2FAEmailChallengePurpose;
  plaintextCode: string;
}): Promise<{ id: string; expiresAt: Date }> {
  return createOtpChallenge({ ...params, channel: "EMAIL" });
}

export async function verifyEmailOtpChallenge(params: {
  adminUserId: string;
  code: string;
  purpose: AdminUser2FAEmailChallengePurpose;
}): Promise<{ ok: true; challengeId: string } | { ok: false; error: string }> {
  return verifyOtpChallenge({ ...params, channel: "EMAIL" });
}

export const sendEmailOtpChallenge = sendEmailOtpChallengeImpl;
