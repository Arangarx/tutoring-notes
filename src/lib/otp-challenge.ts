/**
 * Generalized (channel-aware) OTP challenges for admin/tutor 2FA — enroll +
 * login verify, email OR SMS.
 *
 * Pattern mirrors password-reset tokens: SHA-256 hash at rest, single-use,
 * TTL, invalidate prior unused challenges (same purpose + channel) on new send.
 *
 * `src/lib/email-otp-challenge.ts` is a thin backward-compatible re-export
 * facade over this module (channel="EMAIL" hardcoded) so existing imports
 * keep working unchanged. New SMS call sites use this module directly, or
 * the `sendSmsOtpChallenge` / `verifySmsOtpChallenge` wrappers below.
 *
 * Log prefix: tfa (never log OTP plaintext, codeHash, or full E.164 — mask
 * phone numbers before logging).
 * SERVER-ONLY.
 */

import { createHash, randomInt } from "node:crypto";
import type {
  AdminUser2FAEmailChallengeChannel,
  AdminUser2FAEmailChallengePurpose,
} from "@prisma/client";
import { db } from "@/lib/db";
import { sendPlatformMail } from "@/lib/email";
import { sendSms, maskE164 } from "@/lib/sms";
import { checkAndIncrementAuthThrottle } from "@/lib/auth-rate-limit";

export type OtpChannel = AdminUser2FAEmailChallengeChannel;

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_SEND_MAX = 3;
export const OTP_SEND_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function hashOtpCode(code: string): string {
  const normalized = code.replace(/\s/g, "");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function isValidOtpFormat(code: string): boolean {
  return /^\d{6}$/.test(code.replace(/\s/g, ""));
}

/** Send-rate limit: 3 requests / 15 min per (channel, adminUserId). */
export async function checkOtpSendRateLimit(
  channel: OtpChannel,
  adminUserId: string
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const scopeKey = `2fa-otp-send:${channel}:${adminUserId}`;
  const result = await checkAndIncrementAuthThrottle(
    "2fa-otp-send",
    scopeKey,
    OTP_SEND_MAX,
    OTP_SEND_WINDOW_MS
  );
  if (!result.allowed) {
    console.log(
      `[tfa] adminUserId=${adminUserId} action=otp-send-rate-limited channel=${channel} retryAfterSec=${Math.ceil(result.retryAfterMs / 1000)}`
    );
  }
  return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
}

/** Invalidates unused challenges for (adminUserId, purpose, channel) only —
 *  an email send never invalidates an in-flight SMS challenge, and vice versa. */
export async function invalidateUnusedOtpChallenges(
  adminUserId: string,
  purpose: AdminUser2FAEmailChallengePurpose,
  channel: OtpChannel
): Promise<void> {
  await db.adminUser2FAEmailChallenge.updateMany({
    where: { adminUserId, purpose, channel, usedAt: null },
    data: { usedAt: new Date() },
  });
}

export async function createOtpChallenge(params: {
  adminUserId: string;
  twoFaId?: string | null;
  purpose: AdminUser2FAEmailChallengePurpose;
  channel: OtpChannel;
  plaintextCode: string;
}): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const row = await db.adminUser2FAEmailChallenge.create({
    data: {
      adminUserId: params.adminUserId,
      twoFaId: params.twoFaId ?? null,
      codeHash: hashOtpCode(params.plaintextCode),
      purpose: params.purpose,
      channel: params.channel,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });
  return row;
}

export async function verifyOtpChallenge(params: {
  adminUserId: string;
  code: string;
  purpose: AdminUser2FAEmailChallengePurpose;
  channel: OtpChannel;
}): Promise<{ ok: true; challengeId: string } | { ok: false; error: string }> {
  const normalized = params.code.replace(/\s/g, "");
  if (!isValidOtpFormat(normalized)) {
    return { ok: false, error: "Enter the 6-digit code." };
  }

  const codeHash = hashOtpCode(normalized);
  const row = await db.adminUser2FAEmailChallenge.findFirst({
    where: {
      adminUserId: params.adminUserId,
      purpose: params.purpose,
      channel: params.channel,
      codeHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!row) {
    console.log(
      `[tfa] adminUserId=${params.adminUserId} action=otp-verify-fail purpose=${params.purpose} channel=${params.channel}`
    );
    return { ok: false, error: "Invalid or expired code. Request a new code and try again." };
  }

  await db.adminUser2FAEmailChallenge.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  console.log(
    `[tfa] adminUserId=${params.adminUserId} action=otp-verify-success purpose=${params.purpose} channel=${params.channel} challengeId=${row.id}`
  );
  return { ok: true, challengeId: row.id };
}

// ---------------------------------------------------------------------------
// Email channel sender (moved here from email-otp-challenge.ts; re-exported
// from that module under its original name for backward compatibility).
// ---------------------------------------------------------------------------

export async function sendEmailOtpChallenge(params: {
  adminUserId: string;
  email: string;
  purpose: AdminUser2FAEmailChallengePurpose;
  twoFaId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rl = await checkOtpSendRateLimit("EMAIL", params.adminUserId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many code requests. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const plaintext = generateOtpCode();
  await invalidateUnusedOtpChallenges(params.adminUserId, params.purpose, "EMAIL");
  await createOtpChallenge({
    adminUserId: params.adminUserId,
    twoFaId: params.twoFaId,
    purpose: params.purpose,
    channel: "EMAIL",
    plaintextCode: plaintext,
  });

  const subject =
    params.purpose === "ENROLL"
      ? "Your Mynk two-factor setup code"
      : "Your Mynk sign-in verification code";
  const intro =
    params.purpose === "ENROLL"
      ? "Enter this code to finish setting up two-factor authentication on your Mynk account:"
      : "Enter this code to finish signing in to your Mynk account:";

  const result = await sendPlatformMail({
    to: params.email,
    subject,
    text: `${intro}\n\n${plaintext}\n\nThis code expires in 10 minutes and can only be used once.\n\nIf you did not request this, you can ignore this email.`,
  });

  if (!result.sent) {
    // Playwright identity harness: challenge row is already in DB; allow UI enrollment
    // flows without SMTP (codes are seeded or read from DB in helpers).
    if (process.env.PLAYWRIGHT_TEST === "1") {
      console.log(
        `[tfa] adminUserId=${params.adminUserId} action=email-otp-sent-harness-skip purpose=${params.purpose}`
      );
      return { ok: true };
    }
    console.log(
      `[tfa] adminUserId=${params.adminUserId} action=email-otp-send-fail purpose=${params.purpose}`
    );
    return {
      ok: false,
      error: "We could not send the verification email. Check email delivery settings or try again later.",
    };
  }

  console.log(
    `[tfa] adminUserId=${params.adminUserId} action=email-otp-sent purpose=${params.purpose}`
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SMS channel sender.
// ---------------------------------------------------------------------------

export async function sendSmsOtpChallenge(params: {
  adminUserId: string;
  toE164: string;
  purpose: AdminUser2FAEmailChallengePurpose;
  twoFaId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rl = await checkOtpSendRateLimit("SMS", params.adminUserId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many code requests. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const plaintext = generateOtpCode();
  await invalidateUnusedOtpChallenges(params.adminUserId, params.purpose, "SMS");
  await createOtpChallenge({
    adminUserId: params.adminUserId,
    twoFaId: params.twoFaId,
    purpose: params.purpose,
    channel: "SMS",
    plaintextCode: plaintext,
  });

  const body =
    params.purpose === "ENROLL"
      ? `Mynk: your two-factor setup code is ${plaintext}. Expires in 10 minutes.`
      : `Mynk: your sign-in code is ${plaintext}. Expires in 10 minutes.`;

  const result = await sendSms({ toE164: params.toE164, body });

  if (!result.sent) {
    console.log(
      `[tfa] adminUserId=${params.adminUserId} action=sms-otp-send-fail purpose=${params.purpose} phone=${maskE164(params.toE164)}`
    );
    return {
      ok: false,
      error: "We could not send the text message. Check the number or try again later.",
    };
  }

  console.log(
    `[tfa] adminUserId=${params.adminUserId} action=sms-otp-sent purpose=${params.purpose} phone=${maskE164(params.toE164)}`
  );
  return { ok: true };
}
