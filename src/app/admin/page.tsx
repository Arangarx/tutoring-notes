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

  return (
    <AdminPageShell
      title="Admin dashboard"
      description={
        <>
          Signed in as <span className="font-medium text-foreground">{email}</span>. Open a test
          account to use the tutor workspace, or manage credentials in settings.
        </>
      }
      actions={
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/admin/settings">Settings</Link>
        </Button>
      }
    >
      <AdminSectionCard
        title="Test accounts"
        description="Log in as a test tutor without signing out your admin session. Use Exit impersonation to return here."
      >
        <AdminTestAccountsPanel />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
