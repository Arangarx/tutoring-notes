import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { TwoFactorSetupForm } from "./TwoFactorSetupForm";

export const dynamic = "force-dynamic";

export default async function TwoFactorSetupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  // Test accounts and env-only admins are exempt — they should never hit this page
  // (middleware skips them), but guard here too.
  if (session.user.isTestAccount) redirect("/admin");

  if (session.user.id) {
    const admin = await db.adminUser.findUnique({
      where: { id: session.user.id },
      include: {
        twoFactor: {
          include: { _count: { select: { backupCodes: true } } },
        },
      },
    });
    // An enrollment is CONFIRMED when backup codes exist (created by confirmTotpEnrollment).
    // If no backup codes → interrupted enrollment (row exists but never confirmed).
    // Treat interrupted enrollment as "not enrolled" — allow fresh QR generation.
    // This closes p1-reenroll-trap: previously any row caused a redirect to /verify,
    // trapping users who started but never completed enrollment.
    const isConfirmed = (admin?.twoFactor?._count?.backupCodes ?? 0) > 0;

    if (isConfirmed && !session.user.twoFactorVerified) {
      // Confirmed enrollment but not verified this session → gate.
      redirect("/admin/settings/2fa/verify");
    }
    if (isConfirmed && session.user.twoFactorVerified) {
      // Already enrolled and verified — send to management page.
      // (The post-login flow after /verify still goes to /admin via callbackUrl.)
      redirect("/admin/settings/2fa");
    }
    // Falls through: not enrolled OR interrupted (unconfirmed) → show setup form.
  }

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
