/**
 * Tutor (AdminUser) signup email confirmation.
 *
 * Confirm-link proves inbox ownership. Separate from 2FA. Tokens are hashed
 * (SHA-256, same helper as password-reset / AccountHolder email tokens).
 *
 * Log prefix `evf` — registered in AGENTS.md § Conventions.
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

export type ConsumeSignupVerifyResult =
  | { ok: true; adminUserId: string; replay: boolean }
  | { ok: false; reason: "invalid" | "expired" | "already_used" };

function evfLog(
  tokenId: string,
  adminUserId: string,
  action: string
): void {
  console.log(
    `[evf] evf=${tokenId.slice(0, 8)} adminUserId=${adminUserId} action=${action}`
  );
}

async function persistSignupVerifyToken(adminUserId: string): Promise<{
  id: string;
  raw: string;
}> {
  await db.adminUserEmailToken.deleteMany({
    where: {
      adminUserId,
      purpose: "SIGNUP_VERIFY",
      consumedAt: null,
    },
  });

  const raw = generateRawToken();
  const row = await db.adminUserEmailToken.create({
    data: {
      adminUserId,
      tokenHash: hashToken(raw),
      purpose: "SIGNUP_VERIFY",
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS_24H),
    },
    select: { id: true },
  });
  return { id: row.id, raw };
}

function verifyUrl(base: string, raw: string): string {
  const origin = base.replace(/\/$/, "");
  return `${origin}/verify-email?type=admin&token=${encodeURIComponent(raw)}`;
}

/**
 * Persist a SIGNUP_VERIFY token and send it via platform SMTP.
 * Playwright harness: still persist the token, skip SMTP (no mail catcher).
 */
export async function sendTutorSignupVerifyEmail(params: {
  adminUserId: string;
  email: string;
  baseUrl: string;
}): Promise<{ sent: boolean; error?: string; tokenId: string }> {
  const { id, raw } = await persistSignupVerifyToken(params.adminUserId);
  const url = verifyUrl(params.baseUrl, raw);

  if (isPlaywrightHarnessActive()) {
    evfLog(id, params.adminUserId, "sent");
    return { sent: true, tokenId: id };
  }

  const result = await sendPlatformMail({
    to: normalizeEmail(params.email),
    subject: "Confirm your Mynk tutor email",
    text: `Confirm this email address for your Mynk tutor account.\n\nOpen this link (valid for 24 hours):\n${url}\n\nIf you did not create this account, you can ignore this email.`,
  });

  if (!result.sent) {
    evfLog(id, params.adminUserId, "send_fail");
    return { sent: false, error: result.error, tokenId: id };
  }

  evfLog(id, params.adminUserId, "sent");
  return { sent: true, tokenId: id };
}

export async function consumeTutorSignupVerifyToken(
  rawToken: string
): Promise<ConsumeSignupVerifyResult> {
  const trimmed = rawToken.trim();
  if (!trimmed) return { ok: false, reason: "invalid" };

  const tokenHash = hashToken(trimmed);
  const now = new Date();
  const tokenRow = await db.adminUserEmailToken.findUnique({
    where: { tokenHash },
    include: { adminUser: { select: { id: true, emailVerifiedAt: true } } },
  });

  if (!tokenRow || tokenRow.purpose !== "SIGNUP_VERIFY") {
    return { ok: false, reason: "invalid" };
  }

  if (tokenRow.consumedAt) {
    if (tokenRow.adminUser.emailVerifiedAt && tokenRow.expiresAt >= now) {
      evfLog(tokenRow.id, tokenRow.adminUserId, "already_used");
      return { ok: true, adminUserId: tokenRow.adminUserId, replay: true };
    }
    evfLog(tokenRow.id, tokenRow.adminUserId, "already_used");
    return { ok: false, reason: "already_used" };
  }

  if (tokenRow.expiresAt < now) {
    evfLog(tokenRow.id, tokenRow.adminUserId, "expired");
    return { ok: false, reason: "expired" };
  }

  await db.$transaction([
    db.adminUser.update({
      where: { id: tokenRow.adminUserId },
      data: { emailVerifiedAt: now },
    }),
    db.adminUserEmailToken.update({
      where: { id: tokenRow.id },
      data: { consumedAt: now },
    }),
  ]);

  evfLog(tokenRow.id, tokenRow.adminUserId, "verified");
  return { ok: true, adminUserId: tokenRow.adminUserId, replay: false };
}

/** Anti-enumeration resend: always looks like success to the caller. */
export async function resendTutorSignupVerifyEmail(params: {
  email: string;
  baseUrl: string;
}): Promise<{ attempted: boolean }> {
  const email = normalizeEmail(params.email);
  if (!email) return { attempted: false };

  const admin = await db.adminUser.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!admin || admin.emailVerifiedAt) {
    return { attempted: false };
  }

  const result = await sendTutorSignupVerifyEmail({
    adminUserId: admin.id,
    email,
    baseUrl: params.baseUrl,
  });
  if (result.sent) {
    evfLog(result.tokenId, admin.id, "resent");
  }
  return { attempted: result.sent };
}
