"use server";

/**
 * 2FA server actions — Identity Phase 1.
 *
 * Log prefix: tfa= (registered in AGENTS.md § Conventions and docs/RECORDER-LIFECYCLE.md).
 * All log lines use adminUserId only — secrets and codes are NEVER logged.
 *
 * Actions:
 *   startTotpEnrollment    — generate secret + QR URI; store encrypted secret (no backup codes yet)
 *   confirmTotpEnrollment  — verify user's first code; generate + store backup codes
 *   verifyTotpCode         — verify TOTP or backup code; mint verified session
 *   adminResetTwoFactor    — ADMIN-only: delete a target user's 2FA row (forces re-enrollment)
 */

import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { encryptTotpSecret, decryptTotpSecret } from "@/lib/crypto/totp-secret";
import { generateBackupCodes, storeBackupCodes, redeemBackupCode } from "@/lib/two-factor-db";
import { mintTwoFactorVerifiedSession } from "@/lib/two-factor-session";
import { requireStudentScope } from "@/lib/student-scope";
import { assertIsAdmin } from "@/lib/impersonation";
import { decode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { check2faVerifyRateLimit } from "@/lib/auth-rate-limit";
import {
  mintAdminTrustedDevice,
  validateAdminTrustedDevice,
  buildAdminTfaDeviceCookie,
  revokeAllAdminTrustedDevices,
  ADMIN_TFA_DEVICE_COOKIE,
  listAdminTrustedDevices,
  revokeAdminTrustedDevice,
  clearAdminTfaDeviceCookie,
  type TrustedDeviceListItem,
} from "@/lib/admin-trusted-device";
import { verifyTotpStepUp } from "@/lib/two-factor-step-up";
import {
  sendEmailOtpChallenge,
  verifyEmailOtpChallenge,
} from "@/lib/email-otp-challenge";
import { sendSmsOtpChallenge, verifyOtpChallenge } from "@/lib/otp-challenge";
import { normalizeUsPhoneToE164, maskE164 } from "@/lib/sms";
import {
  isSms2faEnrollmentAvailable,
  isTwoFactorEnrollmentConfirmed,
} from "@/lib/two-factor-enrollment";
import { hmacToken } from "@/lib/crypto/session-tokens";
import { timingSafeEqual } from "node:crypto";

const APP_ISSUER = "Mynk";
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_ALGORITHM = "SHA1";

// ---------------------------------------------------------------------------
// Internal helper: get the current admin user's DB id + isTestAccount
// ---------------------------------------------------------------------------
async function getCurrentAdminId(): Promise<{ adminId: string; isTestAccount: boolean }> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) redirect("/login");
  const scope = await requireStudentScope();
  if (scope.kind === "env") {
    throw new Error("[tfa] Env-only admin cannot enroll in 2FA. Create a DB-backed admin first.");
  }
  // scope.kind === "admin"
  const admin = await db.adminUser.findUnique({
    where: { id: scope.adminId },
    select: { id: true, isTestAccount: true },
  });
  if (!admin) redirect("/login");
  return { adminId: admin.id, isTestAccount: admin.isTestAccount };
}

// ---------------------------------------------------------------------------
// Shared session-mint + remember-device helpers (extracted — same logic was
// previously duplicated across verifyTotpCode / confirmTotpEnrollment /
// confirmEmailOtpEnrollment / verifyEmailOtpCode; SMS verify is a 4th call
// site, so this is factored out rather than copied a 4th time).
// ---------------------------------------------------------------------------

/** Re-mints the NextAuth session cookie with twoFactorVerified=true. Non-fatal on failure. */
async function mintVerifiedSessionFromCookie(): Promise<void> {
  try {
    const cookieName =
      process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token";
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(cookieName)?.value;
    if (sessionToken) {
      const currentToken = await decode({
        token: sessionToken,
        secret: process.env.NEXTAUTH_SECRET!,
      });
      if (currentToken) {
        await mintTwoFactorVerifiedSession(currentToken as Record<string, unknown>);
      }
    }
  } catch (e) {
    console.error("[tfa] mintTwoFactorVerifiedSession failed:", e);
  }
}

/** Mints a 30-day trusted-device cookie if requested and none valid already exists. Non-fatal on failure. */
async function maybeRememberDevice(
  adminId: string,
  rememberDevice: boolean | undefined,
  typeLabel: string
): Promise<void> {
  if (rememberDevice !== true) return;
  try {
    const isDev = process.env.NODE_ENV !== "production";
    const headerStore = await headers();
    const userAgent = headerStore.get("user-agent") ?? undefined;
    const cookieStore = await cookies();

    const existingRawToken = cookieStore.get(ADMIN_TFA_DEVICE_COOKIE)?.value;
    if (existingRawToken) {
      const existing = await validateAdminTrustedDevice(existingRawToken, adminId);
      if (existing) {
        console.log(
          `[tfa] tfa=${existing.deviceId} adminUserId=${adminId} action=device_trust_noop_existing type=${typeLabel}`
        );
        return;
      }
    }

    const { rawToken, deviceId, expiresAt } = await mintAdminTrustedDevice(adminId, userAgent);
    cookieStore.set(ADMIN_TFA_DEVICE_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: !isDev,
      path: "/",
      maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    });
    console.log(`[tfa] tfa=${deviceId} adminUserId=${adminId} action=device_trusted type=${typeLabel}`);
  } catch (e) {
    console.error("[tfa] mintAdminTrustedDevice failed (non-critical):", e);
  }
}

// ---------------------------------------------------------------------------
// Change-method step-up grant — short-lived, HMAC-signed cookie proving the
// user freshly stepped up with their CURRENT method before choosing a new
// one. Avoids re-verifying a (possibly already-consumed, single-use)
// email/SMS step-up code once per start-action; mirrors the tfa-post-enroll
// cookie pattern already used by confirmTotpEnrollment.
// ---------------------------------------------------------------------------

const CHANGE_METHOD_GRANT_COOKIE = "tfa-change-grant";
const CHANGE_METHOD_GRANT_TTL_SEC = 300;

function changeMethodGrantSecret(): string {
  return process.env.ADMIN_TFA_DEVICE_HMAC_SECRET || process.env.NEXTAUTH_SECRET || "";
}

async function mintChangeMethodGrant(adminId: string): Promise<void> {
  const secret = changeMethodGrantSecret();
  if (!secret) return; // fail-closed: no grant minted, checkChangeMethodGrant will also fail closed.
  const sig = hmacToken(adminId, secret);
  const cookieStore = await cookies();
  cookieStore.set(CHANGE_METHOD_GRANT_COOKIE, `${adminId}.${sig}`, {
    maxAge: CHANGE_METHOD_GRANT_TTL_SEC,
    httpOnly: true,
    sameSite: "lax",
    path: "/admin/settings/2fa",
    secure: process.env.NODE_ENV === "production",
  });
}

async function checkChangeMethodGrant(adminId: string): Promise<boolean> {
  const secret = changeMethodGrantSecret();
  if (!secret) return false;
  const cookieStore = await cookies();
  const raw = cookieStore.get(CHANGE_METHOD_GRANT_COOKIE)?.value;
  if (!raw) return false;
  const dotIdx = raw.indexOf(".");
  if (dotIdx < 1) return false;
  const id = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  if (id !== adminId || !sig) return false;
  const expected = hmacToken(adminId, secret);
  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

async function clearChangeMethodGrant(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(CHANGE_METHOD_GRANT_COOKIE, "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      path: "/admin/settings/2fa",
      secure: process.env.NODE_ENV === "production",
    });
  } catch (_) {
    // Non-critical — 5-minute TTL is the safety net.
  }
}

// ---------------------------------------------------------------------------
// startTotpEnrollment
// ---------------------------------------------------------------------------
export type StartEnrollmentResult =
  | { ok: true; qrDataUri: string; secret: string }
  | { ok: false; error: string };

/**
 * Generates a new TOTP secret, stores it encrypted, and returns the
 * otpauth URI for QR code rendering + the base32 secret for manual entry.
 *
 * Idempotent: if a row already exists, replaces it (user is re-enrolling).
 * The secret returned here is shown ONCE and never returned again.
 */
export async function startTotpEnrollment(): Promise<StartEnrollmentResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) {
      return { ok: false, error: "Test accounts do not require 2FA." };
    }
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  // Authenticator apps show issuer:label — use email, not internal id.
  const adminUser = await db.adminUser.findUnique({
    where: { id: adminId },
    select: { email: true },
  });
  const totpAccountLabel = adminUser?.email?.trim() || adminId;

  // Generate TOTP secret.
  const totp = new OTPAuth.TOTP({
    issuer: APP_ISSUER,
    label: totpAccountLabel,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  });
  const secret = totp.secret.base32;
  const otpauthUri = totp.toString();

  console.log(`[tfa] adminUserId=${adminId} action=enroll-start`);

  // Encrypt and upsert.
  let enc: string;
  try {
    enc = encryptTotpSecret(secret);
  } catch (e) {
    console.error("[tfa] encrypt failed:", e);
    return { ok: false, error: "2FA encryption not available. Contact your administrator." };
  }

  // Upsert: delete existing row (and backup codes via CASCADE) then create fresh.
  await db.adminUser2FA.deleteMany({ where: { adminUserId: adminId } });
  await db.adminUser2FA.create({
    data: {
      adminUserId: adminId,
      method: "TOTP",
      totpSecretEnc: enc,
      enrolledAt: null,
    },
  });

  // Generate QR code locally — the secret must never leave our infrastructure.
  // toDataURL returns a data: URI (PNG base64); safe for img src, never egresses.
  const qrDataUri = await QRCode.toDataURL(otpauthUri, { width: 200, margin: 1 });

  return { ok: true, qrDataUri, secret };
}

// ---------------------------------------------------------------------------
// confirmTotpEnrollment
// ---------------------------------------------------------------------------
export type ConfirmEnrollmentResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string };

/**
 * Verifies the user's first TOTP code to confirm enrollment.
 * On success, generates + stores 10 backup codes (bcrypt hashed) and
 * returns the plaintext codes (shown once — never returned again).
 */
export async function confirmTotpEnrollment(
  token: string
): Promise<ConfirmEnrollmentResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, totpSecretEnc: true },
  });
  if (!row) return { ok: false, error: "No pending enrollment found. Start enrollment first." };
  if (!row.totpSecretEnc) {
    return {
      ok: false,
      error:
        "No pending TOTP secret. Start TOTP enrollment first, or use the email code form if this account uses email verification.",
    };
  }

  let secret: string;
  try {
    secret = decryptTotpSecret(row.totpSecretEnc);
  } catch (e) {
    console.error("[tfa] decrypt failed:", e);
    return { ok: false, error: "Encryption key mismatch. Contact your administrator." };
  }

  const totp = new OTPAuth.TOTP({
    issuer: APP_ISSUER,
    label: adminId,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // window: 1 = accept previous + current + next 30s windows to handle clock skew.
  const delta = totp.validate({ token: token.replace(/\s/g, ""), window: 1 });
  if (delta === null) {
    console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=enroll-fail`);
    return { ok: false, error: "Invalid code. Check your authenticator app and try again." };
  }

  // Generate backup codes.
  const codes = await generateBackupCodes();
  await storeBackupCodes(row.id, codes);

  // Mark enrollment confirmed.
  await db.adminUser2FA.update({
    where: { id: row.id },
    data: { method: "TOTP", enrolledAt: new Date() },
  });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=enroll-confirm`);

  // Mint twoFactorVerified session immediately — the user just proved they know the
  // TOTP code, so they are considered verified for this session without a separate
  // /verify step. Mirrors the same pattern used in verifyTotpCode.
  await mintVerifiedSessionFromCookie();

  // Suppress the setup page's enrolled+verified redirect while the client is on the
  // backup-codes step. The Server Action re-render reads this cookie (Next.js App Router
  // makes cookies set during an action visible to the post-action RSC re-render) and
  // the setup page skips its redirect, letting React surface the show-backup state.
  // Cookie is scoped to /admin/settings/2fa/setup and expires in 5 minutes.
  try {
    const cs = await cookies();
    cs.set("tfa-post-enroll", "1", {
      maxAge: 300,
      httpOnly: true,
      sameSite: "lax",
      path: "/admin/settings/2fa/setup",
      secure: process.env.NODE_ENV === "production",
    });
  } catch (_) {
    // Non-critical — worst case: setup page redirects to management view immediately.
    // Backup codes were already returned to the client; they flash briefly before redirect.
  }

  return { ok: true, backupCodes: codes.map((c) => c.plaintext) };
}

// ---------------------------------------------------------------------------
// verifyTotpCode
// ---------------------------------------------------------------------------
export type VerifyTotpResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Verifies a TOTP token or backup code for the currently signed-in user.
 * On success, mints a new session with twoFactorVerified=true.
 *
 * @param codeInput - 6-digit TOTP string or 8-char backup code.
 * @param opts.rememberDevice - When true, mints a 30-day trusted-device cookie.
 */
export async function verifyTotpCode(
  codeInput: string,
  opts?: { rememberDevice?: boolean }
): Promise<VerifyTotpResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  // Durable identity-keyed rate limit (IAC-11): keyed on adminUserId (stable,
  // IP-independent). Check before TOTP/backup-code validation to avoid leaking
  // timing differences and to stop brute-force before bcrypt/TOTP computation.
  const rl = await check2faVerifyRateLimit(adminId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many verification attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, totpSecretEnc: true },
  });
  if (!row) {
    return { ok: false, error: "2FA not enrolled. Complete enrollment first." };
  }
  if (!row.totpSecretEnc) {
    return {
      ok: false,
      error: "This account uses email verification codes. Use the email code form instead.",
    };
  }

  const input = codeInput.replace(/\s/g, "").toUpperCase();

  // Decide if this looks like a backup code (8 chars) or TOTP (6 digits).
  const isBackupCode = input.length === 8 && /^[A-Z0-9]+$/.test(input);
  const isTotpCode = /^\d{6}$/.test(input);

  if (isBackupCode) {
    const redeemedId = await redeemBackupCode(row.id, input);
    if (!redeemedId) {
      console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=verify-fail type=backup`);
      return { ok: false, error: "Invalid or already-used backup code." };
    }
    console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=backup-code-used codeId=${redeemedId}`);
  } else if (isTotpCode) {
    let secret: string;
    try {
      secret = decryptTotpSecret(row.totpSecretEnc);
    } catch (e) {
      console.error("[tfa] decrypt failed:", e);
      return { ok: false, error: "Encryption key error. Contact your administrator." };
    }
    const totp = new OTPAuth.TOTP({
      issuer: APP_ISSUER,
      label: adminId,
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: input, window: 1 });
    if (delta === null) {
      console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=verify-fail type=totp`);
      return { ok: false, error: "Invalid code. Try again or use a backup code." };
    }
    console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=verify-success`);
  } else {
    return { ok: false, error: "Enter a 6-digit code from your authenticator or an 8-character backup code." };
  }

  // Update lastVerifiedAt.
  await db.adminUser2FA.update({
    where: { id: row.id },
    data: { lastVerifiedAt: new Date() },
  });

  // Mint a new session with twoFactorVerified=true.
  await mintVerifiedSessionFromCookie();

  // Remember-device: mint a 30-day trusted-device cookie if opted in.
  await maybeRememberDevice(adminId, opts?.rememberDevice, isBackupCode ? "backup" : "totp");

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Email OTP enrollment + login verify (chunk 1 — default for new tutors)
// ---------------------------------------------------------------------------

export type StartEmailOtpEnrollmentResult =
  | { ok: true; maskedEmail: string }
  | { ok: false; error: string };

/**
 * Starts email OTP enrollment: creates a pending AdminUser2FA row (method=EMAIL_OTP)
 * and sends the first 6-digit code. No silent enroll on send failure.
 */
export async function startEmailOtpEnrollment(): Promise<StartEmailOtpEnrollmentResult> {
  let adminId: string;
  let email: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) {
      return { ok: false, error: "Test accounts do not require 2FA." };
    }
    adminId = result.adminId;
    const adminUser = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    email = adminUser?.email?.trim().toLowerCase() ?? "";
    if (!email) return { ok: false, error: "Account email is missing." };
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  console.log(`[tfa] adminUserId=${adminId} action=email-enroll-start`);

  await db.adminUser2FA.deleteMany({ where: { adminUserId: adminId } });
  const twoFa = await db.adminUser2FA.create({
    data: {
      adminUserId: adminId,
      method: "EMAIL_OTP",
      totpSecretEnc: null,
      enrolledAt: null,
    },
    select: { id: true },
  });

  const sent = await sendEmailOtpChallenge({
    adminUserId: adminId,
    email,
    purpose: "ENROLL",
    twoFaId: twoFa.id,
  });
  if (!sent.ok) {
    await db.adminUser2FA.deleteMany({ where: { adminUserId: adminId } });
    return sent;
  }

  const at = email.indexOf("@");
  const maskedEmail =
    at > 1 ? `${email[0]}***${email.slice(at - 1)}` : `${email[0]}***`;

  return { ok: true, maskedEmail };
}

export type ResendEmailOtpEnrollmentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function resendEmailOtpEnrollment(): Promise<ResendEmailOtpEnrollmentResult> {
  let adminId: string;
  let email: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
    const adminUser = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    email = adminUser?.email?.trim().toLowerCase() ?? "";
    if (!email) return { ok: false, error: "Account email is missing." };
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, method: true, enrolledAt: true },
  });
  if (!row || row.method !== "EMAIL_OTP" || row.enrolledAt) {
    return { ok: false, error: "No pending email enrollment found. Start setup first." };
  }

  return sendEmailOtpChallenge({
    adminUserId: adminId,
    email,
    purpose: "ENROLL",
    twoFaId: row.id,
  });
}

export type ConfirmEmailOtpEnrollmentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function confirmEmailOtpEnrollment(
  code: string
): Promise<ConfirmEmailOtpEnrollmentResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const rl = await check2faVerifyRateLimit(adminId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many verification attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, method: true, enrolledAt: true },
  });
  if (!row || row.method !== "EMAIL_OTP") {
    return { ok: false, error: "No pending email enrollment found. Start setup first." };
  }
  if (row.enrolledAt) {
    return { ok: false, error: "2FA is already enrolled." };
  }

  const verified = await verifyEmailOtpChallenge({
    adminUserId: adminId,
    code,
    purpose: "ENROLL",
  });
  if (!verified.ok) return verified;

  await db.adminUser2FA.update({
    where: { id: row.id },
    data: { enrolledAt: new Date() },
  });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=email-enroll-confirm`);

  await mintVerifiedSessionFromCookie();

  return { ok: true };
}

// ---------------------------------------------------------------------------
// SMS OTP enrollment + login verify (Workstream 3 — Twilio Programmable SMS)
// ---------------------------------------------------------------------------

export type StartSmsOtpEnrollmentResult =
  | { ok: true; maskedPhone: string }
  | { ok: false; error: string };

/**
 * Starts SMS OTP enrollment: validates + normalizes the phone number, creates a
 * pending AdminUser2FA row (method=SMS_OTP, phoneE164 left null until confirm,
 * pendingPhoneE164 holds the unconfirmed number), and sends the first 6-digit
 * code. No silent enroll on send failure — the row is deleted if send fails.
 */
export async function startSmsOtpEnrollment(
  phoneInput: string,
  smsConsent: boolean
): Promise<StartSmsOtpEnrollmentResult> {
  if (smsConsent !== true) {
    return {
      ok: false,
      error: "You must agree to receive SMS codes before we can send a verification text.",
    };
  }

  if (!isSms2faEnrollmentAvailable()) {
    return { ok: false, error: "SMS 2FA is not available right now." };
  }

  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) {
      return { ok: false, error: "Test accounts do not require 2FA." };
    }
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const phoneE164 = normalizeUsPhoneToE164(phoneInput);
  if (!phoneE164) {
    return { ok: false, error: "Enter a valid US mobile number (10 digits)." };
  }

  // Guard: refuse to blow away an already-confirmed enrollment. A confirmed
  // user should go through the step-up-gated change-method flow (see
  // startMethodChangeStepUp + start*MethodChange below), not re-run first-time
  // enrollment, which used to unconditionally deleteMany a LIVE row.
  const existing = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { method: true, enrolledAt: true, _count: { select: { backupCodes: true } } },
  });
  if (
    existing &&
    isTwoFactorEnrollmentConfirmed({
      method: existing.method,
      enrolledAt: existing.enrolledAt,
      backupCodeCount: existing._count.backupCodes,
    })
  ) {
    return {
      ok: false,
      error: "You already have two-factor authentication enrolled. Use \"Change method\" from the manage page instead.",
    };
  }

  console.log(`[tfa] adminUserId=${adminId} action=sms-enroll-start`);

  await db.adminUser2FA.deleteMany({ where: { adminUserId: adminId } });
  const twoFa = await db.adminUser2FA.create({
    data: {
      adminUserId: adminId,
      method: "SMS_OTP",
      totpSecretEnc: null,
      enrolledAt: null,
      pendingPhoneE164: phoneE164,
    },
    select: { id: true },
  });

  const sent = await sendSmsOtpChallenge({
    adminUserId: adminId,
    toE164: phoneE164,
    purpose: "ENROLL",
    twoFaId: twoFa.id,
  });
  if (!sent.ok) {
    await db.adminUser2FA.deleteMany({ where: { adminUserId: adminId } });
    return sent;
  }

  return { ok: true, maskedPhone: maskE164(phoneE164) };
}

export type ResendSmsOtpEnrollmentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function resendSmsOtpEnrollment(): Promise<ResendSmsOtpEnrollmentResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, method: true, enrolledAt: true, pendingPhoneE164: true },
  });
  if (!row || row.method !== "SMS_OTP" || row.enrolledAt || !row.pendingPhoneE164) {
    return { ok: false, error: "No pending SMS enrollment found. Start setup first." };
  }

  return sendSmsOtpChallenge({
    adminUserId: adminId,
    toE164: row.pendingPhoneE164,
    purpose: "ENROLL",
    twoFaId: row.id,
  });
}

export type ConfirmSmsOtpEnrollmentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function confirmSmsOtpEnrollment(
  code: string
): Promise<ConfirmSmsOtpEnrollmentResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const rl = await check2faVerifyRateLimit(adminId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many verification attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, method: true, enrolledAt: true, pendingPhoneE164: true },
  });
  if (!row || row.method !== "SMS_OTP" || !row.pendingPhoneE164) {
    return { ok: false, error: "No pending SMS enrollment found. Start setup first." };
  }
  if (row.enrolledAt) {
    return { ok: false, error: "2FA is already enrolled." };
  }

  const verified = await verifyOtpChallenge({
    adminUserId: adminId,
    code,
    purpose: "ENROLL",
    channel: "SMS",
  });
  if (!verified.ok) return verified;

  // phoneE164 is set ONLY here, on confirmed enrollment — never on send-fail.
  await db.adminUser2FA.update({
    where: { id: row.id },
    data: { enrolledAt: new Date(), phoneE164: row.pendingPhoneE164, pendingPhoneE164: null },
  });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=sms-enroll-confirm`);

  await mintVerifiedSessionFromCookie();

  return { ok: true };
}

export type SendLoginSmsOtpResult =
  | { ok: true; maskedPhone: string }
  | { ok: false; error: string };

export async function sendLoginSmsOtp(): Promise<SendLoginSmsOtpResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, method: true, enrolledAt: true, phoneE164: true },
  });
  if (!row?.enrolledAt || row.method !== "SMS_OTP" || !row.phoneE164) {
    return { ok: false, error: "SMS verification is not enabled for this account." };
  }

  const sent = await sendSmsOtpChallenge({
    adminUserId: adminId,
    toE164: row.phoneE164,
    purpose: "LOGIN",
    twoFaId: row.id,
  });
  if (!sent.ok) return sent;

  return { ok: true, maskedPhone: maskE164(row.phoneE164) };
}

export type VerifySmsOtpResult =
  | { ok: true }
  | { ok: false; error: string };

export async function verifySmsOtpCode(
  codeInput: string,
  opts?: { rememberDevice?: boolean }
): Promise<VerifySmsOtpResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const rl = await check2faVerifyRateLimit(adminId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many verification attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, method: true, enrolledAt: true },
  });
  if (!row?.enrolledAt || row.method !== "SMS_OTP") {
    return { ok: false, error: "SMS verification is not enabled for this account." };
  }

  const verified = await verifyOtpChallenge({
    adminUserId: adminId,
    code: codeInput,
    purpose: "LOGIN",
    channel: "SMS",
  });
  if (!verified.ok) return verified;

  await db.adminUser2FA.update({
    where: { id: row.id },
    data: { lastVerifiedAt: new Date() },
  });

  await mintVerifiedSessionFromCookie();
  await maybeRememberDevice(adminId, opts?.rememberDevice, "sms-otp");

  return { ok: true };
}

export type SendLoginEmailOtpResult =
  | { ok: true; maskedEmail: string }
  | { ok: false; error: string };

export async function sendLoginEmailOtp(): Promise<SendLoginEmailOtpResult> {
  let adminId: string;
  let email: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
    const adminUser = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    email = adminUser?.email?.trim().toLowerCase() ?? "";
    if (!email) return { ok: false, error: "Account email is missing." };
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, method: true, enrolledAt: true },
  });
  if (!row?.enrolledAt) {
    return { ok: false, error: "2FA not enrolled. Complete enrollment first." };
  }
  // LOGIN email OTP: primary path for EMAIL_OTP enroll; universal alternate for
  // TOTP- or SMS_OTP-enrolled users (email is always available as a fallback channel).
  if (row.method !== "EMAIL_OTP" && row.method !== "TOTP" && row.method !== "SMS_OTP") {
    return { ok: false, error: "Email verification is not enabled for this account." };
  }

  const sent = await sendEmailOtpChallenge({
    adminUserId: adminId,
    email,
    purpose: "LOGIN",
    twoFaId: row.id,
  });
  if (!sent.ok) return sent;

  const at = email.indexOf("@");
  const maskedEmail =
    at > 1 ? `${email[0]}***${email.slice(at - 1)}` : `${email[0]}***`;
  return { ok: true, maskedEmail };
}

export type VerifyEmailOtpResult =
  | { ok: true }
  | { ok: false; error: string };

export async function verifyEmailOtpCode(
  codeInput: string,
  opts?: { rememberDevice?: boolean; purpose?: "LOGIN" | "ENROLL" }
): Promise<VerifyEmailOtpResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const rl = await check2faVerifyRateLimit(adminId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many verification attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, method: true, enrolledAt: true },
  });
  if (!row) {
    return { ok: false, error: "2FA not enrolled. Complete enrollment first." };
  }

  const purpose = opts?.purpose ?? "LOGIN";
  if (purpose === "ENROLL" && row.method !== "EMAIL_OTP") {
    return { ok: false, error: "Email verification is not enabled for this account." };
  }
  if (purpose === "LOGIN") {
    if (!row.enrolledAt) {
      return { ok: false, error: "2FA not enrolled. Complete enrollment first." };
    }
    if (row.method !== "EMAIL_OTP" && row.method !== "TOTP" && row.method !== "SMS_OTP") {
      return { ok: false, error: "Email verification is not enabled for this account." };
    }
  }

  const verified = await verifyEmailOtpChallenge({
    adminUserId: adminId,
    code: codeInput,
    purpose,
  });
  if (!verified.ok) return verified;

  if (purpose === "LOGIN") {
    await db.adminUser2FA.update({
      where: { id: row.id },
      data: { lastVerifiedAt: new Date() },
    });
  }

  if (purpose === "LOGIN") {
    await mintVerifiedSessionFromCookie();
    await maybeRememberDevice(adminId, opts?.rememberDevice, "email-otp");
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// rotateTotpStart
// ---------------------------------------------------------------------------
export type RotateStartResult =
  | { ok: true; qrDataUri: string; secret: string }
  | { ok: false; error: string };

/**
 * Starts TOTP authenticator rotation for the current user.
 * Generates a new secret and stores it in pendingTotpSecretEnc.
 * The existing totpSecretEnc is NOT touched — the current authenticator remains
 * valid until rotateTotpConfirm() swaps the secrets atomically (no-lockout guarantee).
 *
 * Requires: session-2FA-verified + fresh TOTP step-up (trusted-device skip does not satisfy).
 */
export async function rotateTotpStart(totpCode: string): Promise<RotateStartResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.twoFactorVerified) {
    return { ok: false, error: "Session 2FA verification required to rotate authenticator." };
  }

  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  // Step-up: require fresh TOTP/backup code (trusted-device skip does not satisfy).
  if (!totpCode?.trim()) {
    return { ok: false, error: "Current 2FA code required to rotate authenticator." };
  }
  const stepUp = await verifyTotpStepUp(adminId, totpCode.trim());
  if (!stepUp.ok) return { ok: false, error: stepUp.error };

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, _count: { select: { backupCodes: true } } },
  });
  if (!row || row._count.backupCodes === 0) {
    return { ok: false, error: "No confirmed 2FA enrollment found. Complete initial setup first." };
  }

  const adminUser = await db.adminUser.findUnique({
    where: { id: adminId },
    select: { email: true },
  });
  const totpAccountLabel = adminUser?.email?.trim() || adminId;

  const totp = new OTPAuth.TOTP({
    issuer: APP_ISSUER,
    label: totpAccountLabel,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  });
  const newSecret = totp.secret.base32;
  const otpauthUri = totp.toString();

  let enc: string;
  try {
    enc = encryptTotpSecret(newSecret);
  } catch (e) {
    console.error("[tfa] encrypt failed:", e);
    return { ok: false, error: "2FA encryption not available. Contact your administrator." };
  }

  await db.adminUser2FA.update({
    where: { id: row.id },
    data: { pendingTotpSecretEnc: enc, pendingEnrolledAt: new Date() },
  });

  const qrDataUri = await QRCode.toDataURL(otpauthUri, { width: 200, margin: 1 });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=rotate-start`);
  return { ok: true, qrDataUri, secret: newSecret };
}

// ---------------------------------------------------------------------------
// rotateTotpConfirm
// ---------------------------------------------------------------------------
export type RotateConfirmResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string };

/**
 * Confirms rotation by verifying a code from the NEW authenticator.
 * On success, atomically:
 *   - Swaps pendingTotpSecretEnc → totpSecretEnc
 *   - Clears pendingTotpSecretEnc + pendingEnrolledAt
 *   - Deletes old backup codes and generates fresh ones
 *   - Returns plaintext codes (shown once)
 *
 * NO-LOCKOUT: totpSecretEnc is only replaced after successful verification
 * of a code from the new authenticator. If the user cannot produce a valid
 * code, the old secret remains active and rotation is aborted.
 *
 * Requires: caller must be session-2FA-verified.
 */
export async function rotateTotpConfirm(token: string): Promise<RotateConfirmResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.twoFactorVerified) {
    return { ok: false, error: "Session 2FA verification required to confirm rotation." };
  }

  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, pendingTotpSecretEnc: true },
  });
  if (!row?.pendingTotpSecretEnc) {
    return { ok: false, error: "No rotation in progress. Start rotation first." };
  }

  let pendingSecret: string;
  try {
    pendingSecret = decryptTotpSecret(row.pendingTotpSecretEnc);
  } catch (e) {
    console.error("[tfa] decrypt failed:", e);
    return { ok: false, error: "Encryption key mismatch. Contact your administrator." };
  }

  const totp = new OTPAuth.TOTP({
    issuer: APP_ISSUER,
    label: adminId,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(pendingSecret),
  });

  const delta = totp.validate({ token: token.replace(/\s/g, ""), window: 1 });
  if (delta === null) {
    console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=rotate-fail`);
    return { ok: false, error: "Invalid code from new authenticator. Try again." };
  }

  // Atomically: swap secret, clear pending, delete old backup codes, create new ones.
  const codes = await generateBackupCodes();
  await db.$transaction(async (tx) => {
    await tx.adminUser2FA.update({
      where: { id: row.id },
      data: {
        totpSecretEnc: row.pendingTotpSecretEnc!,
        pendingTotpSecretEnc: null,
        pendingEnrolledAt: null,
        enrolledAt: new Date(),
      },
    });
    await tx.adminUser2FABackupCode.deleteMany({ where: { twoFaId: row.id } });
    await tx.adminUser2FABackupCode.createMany({
      data: codes.map((c) => ({ twoFaId: row.id, codeHash: c.hash })),
    });
  });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=rotate-confirm`);

  // Cascade: rotation invalidates all trusted devices (new authenticator = new trust baseline).
  await revokeAllAdminTrustedDevices(adminId);

  return { ok: true, backupCodes: codes.map((c) => c.plaintext) };
}

// ---------------------------------------------------------------------------
// regenerateBackupCodes
// ---------------------------------------------------------------------------
export type RegenBackupCodesResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string };

/**
 * Regenerates backup codes for the current user.
 * Deletes all existing codes, generates 10 fresh ones, bcrypt-hashes them,
 * and returns the plaintext codes (shown once — never returned again).
 *
 * Requires: session-2FA-verified + fresh TOTP step-up (trusted-device skip does not satisfy).
 */
export async function regenerateBackupCodes(totpCode: string): Promise<RegenBackupCodesResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.twoFactorVerified) {
    return { ok: false, error: "Session 2FA verification required to regenerate backup codes." };
  }

  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  // Step-up: require fresh TOTP/backup code.
  if (!totpCode?.trim()) {
    return { ok: false, error: "Current 2FA code required to regenerate backup codes." };
  }
  const stepUp = await verifyTotpStepUp(adminId, totpCode.trim());
  if (!stepUp.ok) return { ok: false, error: stepUp.error };

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true },
  });
  if (!row) return { ok: false, error: "2FA not enrolled." };

  const codes = await generateBackupCodes();
  await db.$transaction(async (tx) => {
    await tx.adminUser2FABackupCode.deleteMany({ where: { twoFaId: row.id } });
    await tx.adminUser2FABackupCode.createMany({
      data: codes.map((c) => ({ twoFaId: row.id, codeHash: c.hash })),
    });
  });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=regen-backup`);
  return { ok: true, backupCodes: codes.map((c) => c.plaintext) };
}

// ---------------------------------------------------------------------------
// Change 2FA method (self-service) — Workstream 3
//
// Distinct from adminResetTwoFactor (ADMIN-only nuclear reset, deletes the row
// outright). Here, the OLD method stays fully valid until the NEW method is
// confirmed — a failed send/confirm leaves the user on their old method,
// never unenrolled. One row, atomic swap via the pending* shadow fields.
//
// Flow: startMethodChangeStepUp(code) [fresh proof of CURRENT method, mints a
// 5-min grant cookie since the underlying OTP code is single-use and can't be
// re-verified per start-action] -> start*MethodChange -> resend*MethodChange?
// -> confirm*MethodChange (atomic swap) | abandonMethodChange (cancel, old
// method untouched).
// ---------------------------------------------------------------------------

export type StartMethodChangeStepUpResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Verifies the CURRENT 2FA method with a fresh code, then mints a short-lived
 * grant cookie authorizing the chooser + one change-method flow. Required
 * because email/SMS step-up codes are single-use — re-verifying the same code
 * once per start-action would fail on the 2nd+ use; TOTP step-up is time-window
 * based but goes through the same gate for a uniform, always-fresh-proof flow.
 */
export async function startMethodChangeStepUp(
  stepUpCode: string
): Promise<StartMethodChangeStepUpResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { enrolledAt: true },
  });
  if (!row?.enrolledAt) {
    return { ok: false, error: "2FA is not enrolled. Complete enrollment first." };
  }

  if (!stepUpCode?.trim()) {
    return { ok: false, error: "Your current 2FA code is required to change method." };
  }
  const stepUp = await verifyTotpStepUp(adminId, stepUpCode.trim());
  if (!stepUp.ok) return { ok: false, error: stepUp.error };

  await mintChangeMethodGrant(adminId);
  console.log(`[tfa] adminUserId=${adminId} action=method-change-stepup`);
  return { ok: true };
}

/** Gate for every start*MethodChange action — requires a fresh, unexpired grant. */
async function requireChangeMethodGrant(
  adminId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const granted = await checkChangeMethodGrant(adminId);
  if (!granted) {
    return {
      ok: false,
      error: "Step-up verification expired. Verify your current 2FA code again to change method.",
    };
  }
  return { ok: true };
}

/** Clears all pending-change shadow fields, leaving the current method untouched. */
async function clearPendingMethodChange(twoFaId: string): Promise<void> {
  await db.adminUser2FA.update({
    where: { id: twoFaId },
    data: {
      pendingMethod: null,
      pendingPhoneE164: null,
      pendingTotpSecretEnc: null,
      pendingEnrolledAt: null,
    },
  });
}

export type StartEmailOtpMethodChangeResult =
  | { ok: true; maskedEmail: string }
  | { ok: false; error: string };

export async function startEmailOtpMethodChange(): Promise<StartEmailOtpMethodChangeResult> {
  let adminId: string;
  let email: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
    const adminUser = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    email = adminUser?.email?.trim().toLowerCase() ?? "";
    if (!email) return { ok: false, error: "Account email is missing." };
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const grant = await requireChangeMethodGrant(adminId);
  if (!grant.ok) return grant;

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, enrolledAt: true },
  });
  if (!row?.enrolledAt) {
    return { ok: false, error: "2FA is not enrolled. Complete enrollment first." };
  }

  await db.adminUser2FA.update({
    where: { id: row.id },
    data: { pendingMethod: "EMAIL_OTP" },
  });

  const sent = await sendEmailOtpChallenge({
    adminUserId: adminId,
    email,
    purpose: "ENROLL",
    twoFaId: row.id,
  });
  if (!sent.ok) {
    await clearPendingMethodChange(row.id);
    return sent;
  }

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=method-change-start target=EMAIL_OTP`);

  const at = email.indexOf("@");
  const maskedEmail = at > 1 ? `${email[0]}***${email.slice(at - 1)}` : `${email[0]}***`;
  return { ok: true, maskedEmail };
}

export type ResendEmailOtpMethodChangeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function resendEmailOtpMethodChange(): Promise<ResendEmailOtpMethodChangeResult> {
  let adminId: string;
  let email: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
    const adminUser = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    email = adminUser?.email?.trim().toLowerCase() ?? "";
    if (!email) return { ok: false, error: "Account email is missing." };
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, pendingMethod: true },
  });
  if (!row || row.pendingMethod !== "EMAIL_OTP") {
    return { ok: false, error: "No pending method change found. Start the change again." };
  }

  return sendEmailOtpChallenge({ adminUserId: adminId, email, purpose: "ENROLL", twoFaId: row.id });
}

export type ConfirmEmailOtpMethodChangeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function confirmEmailOtpMethodChange(
  code: string
): Promise<ConfirmEmailOtpMethodChangeResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const rl = await check2faVerifyRateLimit(adminId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many verification attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, pendingMethod: true },
  });
  if (!row || row.pendingMethod !== "EMAIL_OTP") {
    return { ok: false, error: "No pending method change found. Start the change again." };
  }

  const verified = await verifyEmailOtpChallenge({ adminUserId: adminId, code, purpose: "ENROLL" });
  if (!verified.ok) return verified;

  await db.$transaction(async (tx) => {
    await tx.adminUser2FA.update({
      where: { id: row.id },
      data: {
        method: "EMAIL_OTP",
        enrolledAt: new Date(),
        totpSecretEnc: null,
        phoneE164: null,
        pendingMethod: null,
        pendingPhoneE164: null,
        pendingTotpSecretEnc: null,
        pendingEnrolledAt: null,
      },
    });
    await tx.adminUser2FABackupCode.deleteMany({ where: { twoFaId: row.id } });
  });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=method-change-confirm method=EMAIL_OTP`);

  await clearChangeMethodGrant();
  await mintVerifiedSessionFromCookie();
  // Cascade: method change invalidates all trusted devices (new auth baseline).
  await revokeAllAdminTrustedDevices(adminId);

  return { ok: true };
}

export type StartSmsOtpMethodChangeResult =
  | { ok: true; maskedPhone: string }
  | { ok: false; error: string };

export async function startSmsOtpMethodChange(
  phoneInput: string,
  smsConsent: boolean
): Promise<StartSmsOtpMethodChangeResult> {
  if (smsConsent !== true) {
    return {
      ok: false,
      error: "You must agree to receive SMS codes before we can send a verification text.",
    };
  }

  if (!isSms2faEnrollmentAvailable()) {
    return { ok: false, error: "SMS 2FA is not available right now." };
  }

  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const grant = await requireChangeMethodGrant(adminId);
  if (!grant.ok) return grant;

  const phoneE164 = normalizeUsPhoneToE164(phoneInput);
  if (!phoneE164) {
    return { ok: false, error: "Enter a valid US mobile number (10 digits)." };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, enrolledAt: true },
  });
  if (!row?.enrolledAt) {
    return { ok: false, error: "2FA is not enrolled. Complete enrollment first." };
  }

  await db.adminUser2FA.update({
    where: { id: row.id },
    data: { pendingMethod: "SMS_OTP", pendingPhoneE164: phoneE164 },
  });

  const sent = await sendSmsOtpChallenge({
    adminUserId: adminId,
    toE164: phoneE164,
    purpose: "ENROLL",
    twoFaId: row.id,
  });
  if (!sent.ok) {
    await clearPendingMethodChange(row.id);
    return sent;
  }

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=method-change-start target=SMS_OTP`);

  return { ok: true, maskedPhone: maskE164(phoneE164) };
}

export type ResendSmsOtpMethodChangeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function resendSmsOtpMethodChange(): Promise<ResendSmsOtpMethodChangeResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, pendingMethod: true, pendingPhoneE164: true },
  });
  if (!row || row.pendingMethod !== "SMS_OTP" || !row.pendingPhoneE164) {
    return { ok: false, error: "No pending method change found. Start the change again." };
  }

  return sendSmsOtpChallenge({
    adminUserId: adminId,
    toE164: row.pendingPhoneE164,
    purpose: "ENROLL",
    twoFaId: row.id,
  });
}

export type ConfirmSmsOtpMethodChangeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function confirmSmsOtpMethodChange(
  code: string
): Promise<ConfirmSmsOtpMethodChangeResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const rl = await check2faVerifyRateLimit(adminId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many verification attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, pendingMethod: true, pendingPhoneE164: true },
  });
  if (!row || row.pendingMethod !== "SMS_OTP" || !row.pendingPhoneE164) {
    return { ok: false, error: "No pending method change found. Start the change again." };
  }

  const verified = await verifyOtpChallenge({
    adminUserId: adminId,
    code,
    purpose: "ENROLL",
    channel: "SMS",
  });
  if (!verified.ok) return verified;

  const newPhone = row.pendingPhoneE164;
  await db.$transaction(async (tx) => {
    await tx.adminUser2FA.update({
      where: { id: row.id },
      data: {
        method: "SMS_OTP",
        phoneE164: newPhone,
        enrolledAt: new Date(),
        totpSecretEnc: null,
        pendingMethod: null,
        pendingPhoneE164: null,
        pendingTotpSecretEnc: null,
        pendingEnrolledAt: null,
      },
    });
    await tx.adminUser2FABackupCode.deleteMany({ where: { twoFaId: row.id } });
  });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=method-change-confirm method=SMS_OTP`);

  await clearChangeMethodGrant();
  await mintVerifiedSessionFromCookie();
  // Cascade: method change invalidates all trusted devices (new auth baseline).
  await revokeAllAdminTrustedDevices(adminId);

  return { ok: true };
}

export type StartTotpMethodChangeResult =
  | { ok: true; qrDataUri: string; secret: string }
  | { ok: false; error: string };

export async function startTotpMethodChange(): Promise<StartTotpMethodChangeResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const grant = await requireChangeMethodGrant(adminId);
  if (!grant.ok) return grant;

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, enrolledAt: true },
  });
  if (!row?.enrolledAt) {
    return { ok: false, error: "2FA is not enrolled. Complete enrollment first." };
  }

  const adminUser = await db.adminUser.findUnique({
    where: { id: adminId },
    select: { email: true },
  });
  const totpAccountLabel = adminUser?.email?.trim() || adminId;

  const totp = new OTPAuth.TOTP({
    issuer: APP_ISSUER,
    label: totpAccountLabel,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  });
  const newSecret = totp.secret.base32;
  const otpauthUri = totp.toString();

  let enc: string;
  try {
    enc = encryptTotpSecret(newSecret);
  } catch (e) {
    console.error("[tfa] encrypt failed:", e);
    return { ok: false, error: "2FA encryption not available. Contact your administrator." };
  }

  await db.adminUser2FA.update({
    where: { id: row.id },
    data: { pendingMethod: "TOTP", pendingTotpSecretEnc: enc, pendingEnrolledAt: new Date() },
  });

  const qrDataUri = await QRCode.toDataURL(otpauthUri, { width: 200, margin: 1 });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=method-change-start target=TOTP`);
  return { ok: true, qrDataUri, secret: newSecret };
}

export type ConfirmTotpMethodChangeResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string };

export async function confirmTotpMethodChange(
  token: string
): Promise<ConfirmTotpMethodChangeResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    if (result.isTestAccount) return { ok: false, error: "Test accounts do not require 2FA." };
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, pendingMethod: true, pendingTotpSecretEnc: true },
  });
  if (!row || row.pendingMethod !== "TOTP" || !row.pendingTotpSecretEnc) {
    return { ok: false, error: "No pending method change found. Start the change again." };
  }

  let pendingSecret: string;
  try {
    pendingSecret = decryptTotpSecret(row.pendingTotpSecretEnc);
  } catch (e) {
    console.error("[tfa] decrypt failed:", e);
    return { ok: false, error: "Encryption key mismatch. Contact your administrator." };
  }

  const totp = new OTPAuth.TOTP({
    issuer: APP_ISSUER,
    label: adminId,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(pendingSecret),
  });

  const delta = totp.validate({ token: token.replace(/\s/g, ""), window: 1 });
  if (delta === null) {
    console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=method-change-fail target=TOTP`);
    return { ok: false, error: "Invalid code from authenticator. Try again." };
  }

  const codes = await generateBackupCodes();
  await db.$transaction(async (tx) => {
    await tx.adminUser2FA.update({
      where: { id: row.id },
      data: {
        method: "TOTP",
        totpSecretEnc: row.pendingTotpSecretEnc!,
        enrolledAt: new Date(),
        phoneE164: null,
        pendingMethod: null,
        pendingPhoneE164: null,
        pendingTotpSecretEnc: null,
        pendingEnrolledAt: null,
      },
    });
    await tx.adminUser2FABackupCode.deleteMany({ where: { twoFaId: row.id } });
    await tx.adminUser2FABackupCode.createMany({
      data: codes.map((c) => ({ twoFaId: row.id, codeHash: c.hash })),
    });
  });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=method-change-confirm method=TOTP`);

  await clearChangeMethodGrant();
  await mintVerifiedSessionFromCookie();
  // Cascade: method change invalidates all trusted devices (new/changed auth baseline).
  await revokeAllAdminTrustedDevices(adminId);

  return { ok: true, backupCodes: codes.map((c) => c.plaintext) };
}

export type AbandonMethodChangeResult =
  | { ok: true }
  | { ok: false; error: string };

/** Cancels an in-progress method change. The current (old) method is untouched. */
export async function abandonMethodChange(): Promise<AbandonMethodChangeResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true },
  });
  if (row) {
    await clearPendingMethodChange(row.id);
  }
  await clearChangeMethodGrant();
  console.log(`[tfa] adminUserId=${adminId} action=method-change-abandoned`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// adminResetTwoFactor
// ---------------------------------------------------------------------------
export type AdminResetResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * ADMIN-only: deletes the target user's AdminUser2FA row (and backup codes via CASCADE).
 * The target must re-enroll on next login.
 * Caller must have role=ADMIN (enforced via assertIsAdmin()) + fresh TOTP step-up.
 */
export async function adminResetTwoFactor(
  targetAdminUserId: string,
  totpCode: string
): Promise<AdminResetResult> {
  let actingAdminId: string;
  try {
    const result = await assertIsAdmin();
    actingAdminId = result.adminId;
  } catch (e) {
    return { ok: false, error: "Only ADMIN accounts can reset 2FA for other users." };
  }

  if (!targetAdminUserId) return { ok: false, error: "targetAdminUserId is required." };

  // Step-up: require fresh TOTP/backup code from acting admin (high-privilege action).
  if (!totpCode?.trim()) {
    return { ok: false, error: "Your current 2FA code is required to reset another user's 2FA." };
  }
  const stepUp = await verifyTotpStepUp(actingAdminId, totpCode.trim());
  if (!stepUp.ok) return { ok: false, error: stepUp.error };

  const deleted = await db.adminUser2FA.deleteMany({
    where: { adminUserId: targetAdminUserId },
  });

  // Cascade: 2FA reset revokes all trusted devices for the target.
  await revokeAllAdminTrustedDevices(targetAdminUserId);

  console.log(
    `[tfa] adminUserId=${targetAdminUserId} action=reset reset-by=${actingAdminId} rows-deleted=${deleted.count}`
  );

  return { ok: true };
}

// ---------------------------------------------------------------------------
// clearPostEnrollCookie
// ---------------------------------------------------------------------------
/**
 * Clears the tfa-post-enroll=1 cookie set by confirmTotpEnrollment.
 *
 * Must be called when the user explicitly leaves the backup-code display step
 * via the Continue button. Without this, the cookie survives a signout (NextAuth
 * only clears its own session cookies) and can suppress the /setup management
 * redirect on the next login once the session is re-verified — causing the
 * enroll form to render instead of the management view (hypothesis-b bug).
 *
 * The 5-min TTL in confirmTotpEnrollment remains as a safety net, but explicit
 * clearing ensures the cookie cannot leak into a subsequent login session.
 */
export async function clearPostEnrollCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set("tfa-post-enroll", "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      path: "/admin/settings/2fa/setup",
      secure: process.env.NODE_ENV === "production",
    });
    console.log("[tfa] action=clear-post-enroll-cookie");
  } catch (_) {
    // Non-critical.
  }
}

// ---------------------------------------------------------------------------
// Trusted device management actions (remember-device, 2026-06-13)
// ---------------------------------------------------------------------------

export type ListTrustedDevicesResult =
  | { ok: true; devices: TrustedDeviceListItem[] }
  | { ok: false; error: string };

/**
 * List non-revoked, non-expired trusted devices for the current admin.
 * Returns isCurrent=true for the device matching the active cookie.
 */
export async function listTrustedDevices(): Promise<ListTrustedDevicesResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const devices = await listAdminTrustedDevices(adminId);
  return { ok: true, devices };
}

export type RevokeTrustedDeviceResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Revoke a single trusted device by id (ownership-checked).
 * If the revoked device is the current cookie's device, also clears the cookie.
 */
export async function revokeTrustedDevice(deviceId: string): Promise<RevokeTrustedDeviceResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  if (!deviceId) return { ok: false, error: "deviceId is required." };

  await revokeAdminTrustedDevice(deviceId, adminId);

  // If the revoked device matches the current cookie, clear it.
  const isDev = process.env.NODE_ENV !== "production";
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(ADMIN_TFA_DEVICE_COOKIE)?.value;
  if (rawToken) {
    const secret = process.env.ADMIN_TFA_DEVICE_HMAC_SECRET;
    if (secret) {
      try {
        const { hmacToken } = await import("@/lib/crypto/session-tokens");
        const hash = hmacToken(rawToken, secret);
        const row = await db.adminTrustedDevice.findUnique({
          where: { tokenHash: hash },
          select: { id: true },
        });
        if (row?.id === deviceId) {
          cookieStore.set(ADMIN_TFA_DEVICE_COOKIE, "", {
            httpOnly: true, sameSite: "lax", secure: !isDev, path: "/", maxAge: 0,
          });
        }
      } catch {
        // Non-critical.
      }
    }
  }

  return { ok: true };
}

export type RevokeAllTrustedDevicesResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Revoke all trusted devices for the current admin + clear the trust cookie.
 */
export async function revokeAllTrustedDevices(): Promise<RevokeAllTrustedDevicesResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const count = await revokeAllAdminTrustedDevices(adminId);

  // Clear the trust cookie.
  const isDev = process.env.NODE_ENV !== "production";
  try {
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_TFA_DEVICE_COOKIE, "", {
      httpOnly: true, sameSite: "lax", secure: !isDev, path: "/", maxAge: 0,
    });
  } catch {
    // Non-critical.
  }

  return { ok: true, count };
}
