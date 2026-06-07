import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { isGmailConnectAllowedForEmail } from "@/lib/gmail-connect-allowed";
import { getStudentScope } from "@/lib/student-scope";
import { getGmailConnectionForTutor, isEmailConfiguredForTutor } from "@/lib/email";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import EmailConfigForm from "./EmailConfigForm";
import OAuthEmailSection from "./OAuthEmailSection";

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (typeof (db as { emailConfig?: { findFirst: unknown } }).emailConfig?.findFirst !== "function") {
    return (
      <AdminPageShell
        title="Email settings"
        eyebrow={
          <Link
            href="/admin/settings"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Settings
          </Link>
        }
      >
        <p className="text-sm text-warning">
          Prisma client is out of date. Run{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx prisma generate</code>
          , then restart the dev server.
        </p>
      </AdminPageShell>
    );
  }

  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");
  const adminUserId = scope.kind === "admin" ? scope.adminId : null;

  const session = await getServerSession(authOptions);
  const sessionEmail = session?.user?.email ?? null;
  const canUseGmailConnect = isGmailConnectAllowedForEmail(sessionEmail);

  const config = await db.emailConfig.findFirst({
    where: { adminUserId },
    orderBy: { updatedAt: "desc" },
  });
  const configured = await isEmailConfiguredForTutor(adminUserId);
  const gmailConnection = await getGmailConnectionForTutor(adminUserId);
  const googleOAuthAvailable = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <AdminPageShell
      title="Email settings"
      description={
        <>
          Choose how to send &ldquo;Send update&rdquo; emails. Easiest: connect your Gmail with one
          click. Or use SMTP (Resend, SendGrid, etc.) if you prefer.
        </>
      }
      eyebrow={
        <Link
          href="/admin/settings"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Settings
        </Link>
      }
    >
      {configured ? (
        <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3">
          <p className="text-sm text-success">
            Email is configured. &ldquo;Send update&rdquo; will deliver to the recipient&rsquo;s inbox.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3">
          <p className="text-sm text-warning">
            Email is not configured. Connect an account or set up SMTP below to actually send.
          </p>
        </div>
      )}

      <div className="space-y-6">
        <AdminSectionCard
          title="Send with your account"
          description="Sign in with Google to send from your Gmail. No SMTP setup — one click and you&rsquo;re done."
        >
          <OAuthEmailSection
            gmailConnected={gmailConnection ? { email: gmailConnection.email } : null}
            googleOAuthAvailable={googleOAuthAvailable}
            canUseGmailConnect={canUseGmailConnect}
            connectError={params.error}
            connectSuccess={params.connected}
          />
        </AdminSectionCard>

        <AdminSectionCard
          title="SMTP"
          description="For Resend, SendGrid, or your own server. Leave fields empty if you only use Connect Gmail. Leave password blank to keep the existing one."
        >
          <EmailConfigForm
            defaultHost={config?.host ?? ""}
            defaultPort={config?.port ?? undefined}
            defaultSecure={config?.secure ?? false}
            defaultUser={config?.user ?? ""}
            defaultFromEmail={config?.fromEmail ?? ""}
          />
        </AdminSectionCard>
      </div>
    </AdminPageShell>
  );
}
