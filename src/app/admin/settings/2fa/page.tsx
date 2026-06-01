/**
 * 2FA Management Page — Identity Phase 1.
 *
 * Canonical entry for all 2FA settings. Routes server-side by enrollment state:
 *
 *   Not enrolled (no DB row):
 *     → Show setup/enroll form.
 *
 *   Enrolled but UNCONFIRMED (row exists, 0 backup codes = interrupted enrollment):
 *     → Show setup/enroll form — allow fresh QR generation. Closes p1-reenroll-trap:
 *       the old /setup page would redirect interrupted users to /verify which they
 *       could never complete since no confirmed secret existed.
 *
 *   Enrolled + confirmed, session NOT 2FA-verified:
 *     → Redirect to /verify (unchanged gate behavior).
 *
 *   Enrolled + confirmed + session verified:
 *     → Show management view (status, rotate, regen backup codes, admin reset).
 *
 * The management view replaces the blunt b4c439d redirect to /admin.
 * Post-login flow is PRESERVED: after /verify the callbackUrl or /admin is used,
 * not this page. The "Continue to dashboard" button in TwoFactorSetupForm still
 * goes to /admin. This page is only reached by explicit Settings navigation.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { TwoFactorSetupForm } from "./setup/TwoFactorSetupForm";
import { TwoFactorManageView } from "./TwoFactorManageView";

export const dynamic = "force-dynamic";

export default async function TwoFactorManagePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  // Test accounts and env-only admins are exempt — 2FA is not applicable to them.
  if (session.user.isTestAccount) redirect("/admin");

  // Determine enrollment state via DB.
  let twoFaRow: { id: string; enrolledAt: Date; _count: { backupCodes: number } } | null = null;
  let remainingBackupCodes = 0;

  if (session.user.id) {
    const admin = await db.adminUser.findUnique({
      where: { id: session.user.id },
      include: {
        twoFactor: {
          include: { _count: { select: { backupCodes: true } } },
        },
      },
    });
    twoFaRow = admin?.twoFactor ?? null;

    const isConfirmed = (twoFaRow?._count?.backupCodes ?? 0) > 0;

    if (twoFaRow && isConfirmed) {
      // Confirmed enrollment — check session verification state.
      if (!session.user.twoFactorVerified) {
        // Enrolled + confirmed but not verified this session → gate.
        redirect("/admin/settings/2fa/verify");
      }

      // Enrolled + confirmed + session verified → load remaining code count.
      remainingBackupCodes = await db.adminUser2FABackupCode.count({
        where: { twoFaId: twoFaRow.id, usedAt: null },
      });
    } else {
      // Not enrolled OR interrupted/unconfirmed enrollment → show setup form.
      // Reset twoFaRow to null so the component renders correctly.
      twoFaRow = null;
    }
  }

  // Not enrolled or unconfirmed → show setup form.
  if (!twoFaRow) {
    return (
      <div className="card" style={{ maxWidth: 540 }}>
        <h1 style={{ marginTop: 0 }}>Set up Two-Factor Authentication</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Protect your account with a one-time code from an authenticator app.
        </p>
        <TwoFactorSetupForm />
      </div>
    );
  }

  // Enrolled + confirmed + session verified → management view.
  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="card" style={{ maxWidth: 540 }}>
      <h1 style={{ marginTop: 0 }}>Two-Factor Authentication</h1>
      <TwoFactorManageView
        enrolledAt={twoFaRow.enrolledAt.toISOString()}
        remainingBackupCodes={remainingBackupCodes}
        isAdmin={isAdmin}
        userId={session.user.id ?? ""}
      />
    </div>
  );
}
