"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { getAdminByEmail, updateAdminDisplayName, updateAdminPassword, verifyPassword } from "@/lib/auth-db";
import { requestPasswordReset } from "@/lib/password-reset";
import { requireAdminSession } from "@/lib/require-admin";
import { validatePasswordStrength } from "@/lib/password-strength";
import { revokeAllAdminTrustedDevices, ADMIN_TFA_DEVICE_COOKIE } from "@/lib/admin-trusted-device";
import { verifyTotpStepUp } from "@/lib/two-factor-step-up";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

export async function saveProfileDisplayName(formData: FormData) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in");

  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  await updateAdminDisplayName(email, displayName);
  revalidatePath("/admin/settings/profile");
  revalidatePath("/admin");
}

export async function changePassword(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  await requireAdminSession();
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return { error: "Not signed in." };

  const admin = await getAdminByEmail(email);
  if (!admin) {
    return {
      error:
        "This account uses server environment login (ADMIN_EMAIL / ADMIN_PASSWORD). Update the password in your host settings.",
    };
  }

  const current = String(formData.get("currentPassword") ?? "");
  const nextPass = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();

  if (!current || !nextPass || !confirm) {
    return { error: "Fill in current password, new password, and confirmation." };
  }
  const strengthCheck = validatePasswordStrength(nextPass);
  if (!strengthCheck.ok) {
    return { error: strengthCheck.feedback || "Password must be at least 10 characters and not too simple." };
  }
  if (nextPass !== confirm) {
    return { error: "New passwords do not match." };
  }

  // (a) Verify current password BEFORE the must-differ check. The old order ran the
  // plain-text equality check first, which false-positives when a password manager
  // fills both fields with the same auto-generated value (common without a username
  // anchor): the current-password input holds the new strong password, not the real
  // saved one, so the strings are equal even though the user chose a different password.
  const match = await verifyPassword(current, admin.passwordHash);
  if (!match) {
    return { error: "Current password is incorrect." };
  }

  // (b) Must-differ check against the stored hash — NOT plain-text equality.
  // Plain-text comparison still false-positives if the browser puts the same string
  // in both inputs; bcrypt.compare against the stored hash is the correct semantic
  // ("does the proposed new password match the credential already stored?").
  const sameAsCurrent = await verifyPassword(nextPass, admin.passwordHash);
  if (sameAsCurrent) {
    return { error: "New password must be different from your current password." };
  }

  // Step-up: if the admin has 2FA enrolled, require a fresh TOTP code.
  // Trusted-device skip does not satisfy password-change step-up.
  const adminRow = await db.adminUser.findUnique({
    where: { email },
    select: { id: true, twoFactor: { select: { id: true } } },
  });
  if (adminRow?.twoFactor) {
    if (!totpCode) {
      return { error: "Your 2FA code is required to change your password." };
    }
    const stepUp = await verifyTotpStepUp(adminRow.id, totpCode);
    if (!stepUp.ok) return { error: stepUp.error };
  }

  await updateAdminPassword(email, nextPass);

  // Cascade: password change revokes all trusted devices for this admin.
  // Belt-and-suspenders: both revoke DB rows (so validate fails on next login)
  // AND clear the cookie (so the verify page never even redirects to the skip route).
  if (adminRow) {
    const revokedCount = await revokeAllAdminTrustedDevices(adminRow.id);
    console.log(
      `[tfa] adminUserId=${adminRow.id} action=password_change_cascade count=${revokedCount}`
    );
    // Clear the trust cookie for this browser. Best-effort — non-fatal if it throws.
    try {
      const isDev = process.env.NODE_ENV !== "production";
      const cookieStore = await cookies();
      cookieStore.set(ADMIN_TFA_DEVICE_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: !isDev,
        path: "/",
        maxAge: 0,
      });
    } catch {
      // Non-critical — the DB revocation is the authoritative mechanism.
    }
  }

  revalidatePath("/admin/settings/profile");

  return { ok: true };
}

/** Same reset email as /forgot-password, but uses the signed-in user’s email (no typing). */
export async function sendPasswordResetEmail(): Promise<{ ok: boolean; message?: string; error?: string }> {
  await requireAdminSession();
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "Not signed in." };

  const admin = await getAdminByEmail(email);
  if (!admin) {
    return {
      ok: false,
      error: "This login uses server environment credentials. Change password in your host settings.",
    };
  }

  await requestPasswordReset(email);
  return {
    ok: true,
    message:
      "If email delivery is configured, we sent a reset link. Check your inbox (and spam). The link expires in one hour.",
  };
}
