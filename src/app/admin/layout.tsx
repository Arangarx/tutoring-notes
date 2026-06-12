import { getServerSession } from "next-auth";
import { AdminNav } from "@/components/AdminNav";
import { AdminSidebarNav } from "@/components/admin/AdminSidebarNav";
import { authOptions } from "@/auth-options";
import { isOperatorEmail } from "@/lib/operator";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { getAdminSessionMode } from "@/lib/admin-routing";
import { isDevToolsEnabled } from "@/lib/dev-fixtures";
import { getAdminByEmail } from "@/lib/auth-db";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const showOperatorLinks = isOperatorEmail(session?.user?.email);
  const isImpersonating = session?.user?.isImpersonating ?? false;
  const impersonatedEmail = session?.user?.email ?? "";
  const showDevTools = isDevToolsEnabled() && showOperatorLinks && !isImpersonating;
  const showCostDashboard =
    showOperatorLinks && session?.user?.role === "ADMIN" && !isImpersonating;
  const sessionMode = getAdminSessionMode(
    session?.user
      ? {
          sub: session.user.id,
          isImpersonating: session.user.isImpersonating,
          isTestAccount: session.user.isTestAccount,
          role: session.user.role,
        }
      : null
  );

  const userEmail = session?.user?.email ?? "";
  const admin = userEmail ? await getAdminByEmail(userEmail) : null;

  const navProps = {
    showOperatorLinks,
    showCostDashboard,
    sessionMode,
    isImpersonating,
    showDevTools,
    userEmail,
    userDisplayName: admin?.displayName ?? session?.user?.name ?? null,
  };

  return (
    <>
      {isImpersonating ? <ImpersonationBanner email={impersonatedEmail} /> : null}
      <div className="flex min-h-dvh bg-background">
        <aside className="sticky top-0 hidden h-dvh shrink-0 md:block">
          <AdminSidebarNav {...navProps} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminNav {...navProps} layout="mobile" />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8 xl:max-w-7xl">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
