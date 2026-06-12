import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import {
  getAdminSessionMode,
  realAdminHomePath,
  tutorExperienceLandingPath,
} from "@/lib/admin-routing";
import { AdminTestAccountsPanel } from "./AdminTestAccountsPanel";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { Button } from "@/components/ui/button";
import { listWaitlistedTutors } from "@/lib/tutor-approval-scope";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const session = await getServerSession(authOptions);
  const mode = getAdminSessionMode(
    session?.user
      ? {
          sub: session.user.id,
          isImpersonating: session.user.isImpersonating,
          isTestAccount: session.user.isTestAccount,
          role: session.user.role,
        }
      : null
  );

  if (mode === "unauthenticated") redirect("/login");

  if (mode === "tutor-experience") {
    console.log(
      `[imp] route=${tutorExperienceLandingPath()} mode=tutor-experience from=${realAdminHomePath()}`
    );
    redirect(tutorExperienceLandingPath());
  }

  const email = session?.user?.email ?? "admin";
  console.log(`[imp] route=${realAdminHomePath()} mode=real-admin-home admin=${email}`);

  const pendingApprovals = await listWaitlistedTutors();
  const pendingApprovalCount = pendingApprovals.length;
  const hasPendingApprovals = pendingApprovalCount > 0;

  const quickLinkCardClass =
    "rounded-[10px] border border-border bg-card px-4 py-3.5 shadow-sm transition-colors hover:border-accent/40 hover:bg-card/90";
  const quickLinkEyebrowClass = "label-mono text-[10px] text-accent-text";
  const quickLinkTitleClass = "mt-1 text-sm font-semibold text-foreground";

  return (
    <AdminPageShell
      title="Admin dashboard"
      eyebrow={
        <p className="label-mono m-0 text-accent-text">Operator console</p>
      }
      description={
        <>
          Signed in as <span className="font-medium text-foreground">{email}</span>. Open a test
          account to use the tutor workspace, or manage credentials in settings.
        </>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/tutor-approvals">Tutor approvals</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/settings">Settings</Link>
          </Button>
        </div>
      }
    >
      <div className="mb-6 rounded-2xl bg-accent-soft px-4 py-5 sm:px-5">
        <p className="label-mono mb-3 text-accent-text">Quick links</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/admin/tutor-approvals"
            className={cn(
              hasPendingApprovals
                ? "rounded-[10px] bg-brand px-4 py-4 shadow-sm transition-opacity hover:opacity-95"
                : quickLinkCardClass
            )}
          >
            <p
              className={cn(
                "label-mono text-[10px]",
                hasPendingApprovals
                  ? "text-[color:var(--brand-on)]/90"
                  : quickLinkEyebrowClass
              )}
            >
              Operator
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                hasPendingApprovals ? "text-[color:var(--brand-on)]" : quickLinkTitleClass
              )}
            >
              Tutor approvals
              {hasPendingApprovals ? (
                <span className="ml-1.5 font-mono text-xs font-normal opacity-90">
                  ({pendingApprovalCount} pending)
                </span>
              ) : null}
            </p>
          </Link>
          <Link href="/admin/feedback" className={quickLinkCardClass}>
            <p className={quickLinkEyebrowClass}>Operator</p>
            <p className={quickLinkTitleClass}>Feedback inbox</p>
          </Link>
          <Link href="/admin/cost" className={quickLinkCardClass}>
            <p className={quickLinkEyebrowClass}>Operator</p>
            <p className={quickLinkTitleClass}>Cost dashboard</p>
          </Link>
        </div>
      </div>

      <AdminSectionCard
        title="Test accounts"
        description="Log in as a test tutor without signing out your admin session. Use Exit impersonation to return here."
        className="border-l-[3px] border-l-accent"
      >
        <AdminTestAccountsPanel />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
