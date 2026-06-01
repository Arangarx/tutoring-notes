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

  // If already enrolled but NOT yet verified this session → redirect to verify.
  if (session.user.id) {
    const admin = await db.adminUser.findUnique({
      where: { id: session.user.id },
      include: { twoFactor: { select: { id: true } } },
    });
    const isEnrolled = !!admin?.twoFactor;
    if (isEnrolled && !session.user.twoFactorVerified) {
      redirect("/admin/settings/2fa/verify");
    }
    if (isEnrolled && session.user.twoFactorVerified) {
      // Already enrolled and verified — send to the dashboard, not the re-enroll form.
      redirect("/admin");
    }
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
