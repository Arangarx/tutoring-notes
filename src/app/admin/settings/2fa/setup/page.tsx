import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { TwoFactorSetupForm } from "./TwoFactorSetupForm";
import { ADMIN_TFA_DEVICE_COOKIE } from "@/lib/admin-trusted-device";

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

    if (isConfirmed && !session.user.twoFactorVerified && session.user.id) {
      // Trusted-device skip: route to the Route Handler if the cookie is present.
      // Cookie writes throw in Server Component renders — the handler is the only
      // legal context for mintTwoFactorVerifiedSession (see route.ts regression note).
      //
      // No td=0 sentinel check needed here: on handler failure, the handler redirects
      // to /verify (not back to /setup), so there is no redirect loop through this page.
      const cookieStore = await cookies();
      if (cookieStore.get(ADMIN_TFA_DEVICE_COOKIE)) {
        redirect("/api/auth/2fa/trusted-device-check");
      }

      // No valid trusted device — fall through to TOTP gate.
      redirect("/admin/settings/2fa/verify");
    }

    // After confirmTotpEnrollment, the Server Action sets tfa-post-enroll=1 so that
    // this redirect is suppressed during the post-action RSC re-render. That lets the
    // client TwoFactorSetupForm stay on the backup-codes step until the user clicks
    // Continue. Without this guard, the re-render sees enrolled+verified and redirects
    // before the user can read their codes (the bug fixed here, 2026-06-01).
    const postEnroll = (await cookies()).get("tfa-post-enroll")?.value === "1";
    if (isConfirmed && session.user.twoFactorVerified && !postEnroll) {
      // Already enrolled and verified (not mid-enrollment) — send to management page.
      // (The post-login flow after /verify still goes to /admin via callbackUrl.)
      redirect("/admin/settings/2fa");
    }
    // Falls through: not enrolled, interrupted (unconfirmed), OR mid-enrollment backup display.
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
