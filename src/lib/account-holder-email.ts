/**
 * AccountHolder realm email — platform SMTP only (never Gmail / EmailConfig).
 *
 * Log prefixes: `ahx` (account-holder), `clm` (claim invite) — registered in AGENTS.md.
 */

import { db } from "@/lib/db";
import { sendPlatformMail } from "@/lib/email";
import {
  generateRawToken,
  hashToken,
  EMAIL_TOKEN_TTL_MS_24H,
} from "@/lib/crypto/session-tokens";
import { isPlaywrightHarnessActive } from "@/lib/playwright-harness";
import { normalizeEmail } from "@/lib/normalize-email";

export interface AccountHolderEmailPayload {
  to: string;
  subject: string;
  /** Plain-text email body. */
  text: string;
  /** The clickable link to include in the email (also logged). */
  actionUrl: string;
}

function ahxLog(accountHolderId: string | undefined, action: string): void {
  const idPart = accountHolderId ? `ahx=${accountHolderId} ` : "";
  console.log(`[ahx] ${idPart}action=${action}`);
}

function clmLog(inviteId: string | undefined, action: string, extra = ""): void {
  const idPart = inviteId ? `clm=${inviteId} ` : "";
  console.log(`[clm] ${idPart}action=${action}${extra ? ` ${extra}` : ""}`);
}

/**
 * Send account-holder realm mail via platform SMTP.
 * Playwright harness: skip SMTP, return { sent: true }.
 */
export async function sendAccountHolderEmail(
  payload: AccountHolderEmailPayload,
  logContext?: { accountHolderId?: string }
): Promise<{ sent: boolean; error?: string }> {
  const to = normalizeEmail(payload.to);
  if (!to) {
    return { sent: false, error: "Invalid recipient email." };
  }

  if (isPlaywrightHarnessActive()) {
    ahxLog(logContext?.accountHolderId, "sent");
    return { sent: true };
  }

  const result = await sendPlatformMail({
    to,
    subject: payload.subject,
    text: payload.text,
  });

  if (!result.sent) {
    ahxLog(logContext?.accountHolderId, "send_fail");
    return { sent: false, error: result.error };
  }

  ahxLog(logContext?.accountHolderId, "sent");
  return { sent: true };
}

/**
 * Send claim-invite email to a parent via platform SMTP.
 */
export async function sendClaimInviteEmail(
  to: string,
  inviteUrl: string,
  studentName: string,
  logContext?: { inviteId?: string }
): Promise<{ sent: boolean; error?: string }> {
  const normalizedTo = normalizeEmail(to);
  if (!normalizedTo) {
    return { sent: false, error: "Invalid recipient email." };
  }

  const subject = `Connect to ${studentName}'s learning on Mynk`;
  const text = [
    `You've been invited to connect to ${studentName}'s learning account on Mynk.`,
    "",
    "Open this link to claim the account (valid for 7 days):",
    inviteUrl,
    "",
    "If you did not expect this invitation, you can ignore this email.",
  ].join("\n");

  if (isPlaywrightHarnessActive()) {
    clmLog(logContext?.inviteId, "sent");
    return { sent: true };
  }

  const result = await sendPlatformMail({
    to: normalizedTo,
    subject,
    text,
  });

  if (!result.sent) {
    clmLog(logContext?.inviteId, "send_fail");
    return { sent: false, error: result.error };
  }

  clmLog(logContext?.inviteId, "sent");
  return { sent: true };
}

function ahVerifyUrl(
  base: string,
  raw: string,
  returnTo?: string | null
): string {
  const origin = base.replace(/\/$/, "");
  const safeReturn =
    returnTo && /^\/[a-zA-Z0-9\-/_?=&%]+$/.test(returnTo)
      ? `&returnTo=${encodeURIComponent(returnTo)}`
      : "";
  return `${origin}/verify-email?token=${encodeURIComponent(raw)}&type=ah${safeReturn}`;
}

async function persistAccountHolderSignupVerifyToken(
  accountHolderId: string
): Promise<{ id: string; raw: string }> {
  await db.accountHolderEmailToken.deleteMany({
    where: {
      accountHolderId,
      purpose: "SIGNUP_VERIFY",
      consumedAt: null,
    },
  });

  const raw = generateRawToken();
  const row = await db.accountHolderEmailToken.create({
    data: {
      accountHolderId,
      tokenHash: hashToken(raw),
      purpose: "SIGNUP_VERIFY",
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS_24H),
    },
    select: { id: true },
  });
  return { id: row.id, raw };
}

/**
 * Persist SIGNUP_VERIFY token and send via platform mail.
 * Playwright harness: still persist token, skip SMTP.
 */
export async function sendAccountHolderSignupVerifyEmail(params: {
  accountHolderId: string;
  email: string;
  baseUrl: string;
  returnTo?: string | null;
}): Promise<{ sent: boolean; error?: string; tokenId: string }> {
  const { id, raw } = await persistAccountHolderSignupVerifyToken(
    params.accountHolderId
  );
  const url = ahVerifyUrl(params.baseUrl, raw, params.returnTo);

  if (isPlaywrightHarnessActive()) {
    ahxLog(params.accountHolderId, "sent");
    return { sent: true, tokenId: id };
  }

  const result = await sendPlatformMail({
    to: normalizeEmail(params.email),
    subject: "Confirm your Mynk account",
    text: `Welcome to Mynk! Please confirm your email address by clicking the link below (valid for 24 hours):\n\n${url}`,
  });

  if (!result.sent) {
    ahxLog(params.accountHolderId, "send_fail");
    return { sent: false, error: result.error, tokenId: id };
  }

  ahxLog(params.accountHolderId, "sent");
  return { sent: true, tokenId: id };
}

/** Anti-enumeration resend: caller always returns generic success JSON. */
export async function resendAccountHolderSignupVerifyEmail(params: {
  email: string;
  baseUrl: string;
}): Promise<{ attempted: boolean }> {
  const email = normalizeEmail(params.email);
  if (!email) return { attempted: false };

  const holder = await db.accountHolder.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true, tombstonedAt: true },
  });
  if (!holder || holder.emailVerifiedAt || holder.tombstonedAt) {
    if (holder) {
      console.log(`[ahx] ahx=${holder.id} action=resend_skipped`);
    } else {
      console.log(`[ahx] action=resend_skipped`);
    }
    return { attempted: false };
  }

  const result = await sendAccountHolderSignupVerifyEmail({
    accountHolderId: holder.id,
    email,
    baseUrl: params.baseUrl,
  });

  if (result.sent) {
    console.log(`[ahx] ahx=${holder.id} action=resent`);
    return { attempted: true };
  }

  console.log(`[ahx] ahx=${holder.id} action=send_fail`);
  return { attempted: false };
}
