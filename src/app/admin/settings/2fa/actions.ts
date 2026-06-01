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
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";

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

  // Generate TOTP secret.
  const totp = new OTPAuth.TOTP({
    issuer: APP_ISSUER,
    label: adminId,
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
      totpSecretEnc: enc,
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
    data: { enrolledAt: new Date() },
  });

  console.log(`[tfa] tfa=${row.id} adminUserId=${adminId} action=enroll-confirm`);

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
 */
export async function verifyTotpCode(codeInput: string): Promise<VerifyTotpResult> {
  let adminId: string;
  try {
    const result = await getCurrentAdminId();
    adminId = result.adminId;
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId: adminId },
    select: { id: true, totpSecretEnc: true },
  });
  if (!row) {
    return { ok: false, error: "2FA not enrolled. Complete enrollment first." };
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
  // We need the current JWT token to preserve all existing claims.
  // Use next/headers to build a synthetic Request-like object for getToken.
  try {
    const hdrs = await headers();
    const cookieHeader = hdrs.get("cookie") ?? "";
    const fakeReq = { headers: { get: (name: string) => (name === "cookie" ? cookieHeader : null) } } as unknown as Request;
    const currentToken = await getToken({
      req: fakeReq as Parameters<typeof getToken>[0]["req"],
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (currentToken) {
      await mintTwoFactorVerifiedSession(currentToken as Record<string, unknown>);
    }
  } catch (e) {
    // If session minting fails (e.g. in test env), log but don't fail the verify.
    // The middleware will re-check on next request.
    console.error("[tfa] mintTwoFactorVerifiedSession failed:", e);
  }

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
 * Caller must have role=ADMIN (enforced via assertIsAdmin()).
 */
export async function adminResetTwoFactor(
  targetAdminUserId: string
): Promise<AdminResetResult> {
  let actingAdminId: string;
  try {
    const result = await assertIsAdmin();
    actingAdminId = result.adminId;
  } catch (e) {
    return { ok: false, error: "Only ADMIN accounts can reset 2FA for other users." };
  }

  if (!targetAdminUserId) return { ok: false, error: "targetAdminUserId is required." };

  const deleted = await db.adminUser2FA.deleteMany({
    where: { adminUserId: targetAdminUserId },
  });

  console.log(
    `[tfa] adminUserId=${targetAdminUserId} action=reset reset-by=${actingAdminId} rows-deleted=${deleted.count}`
  );

  return { ok: true };
}
