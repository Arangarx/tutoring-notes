import { getServerSession } from "next-auth";
import { AdminNav } from "@/components/AdminNav";
import { authOptions } from "@/auth-options";
import { isOperatorEmail } from "@/lib/operator";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { getAdminSessionMode } from "@/lib/admin-routing";
import { isDevToolsEnabled } from "@/lib/dev-fixtures";

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

  return (
    <>
      {isImpersonating ? <ImpersonationBanner email={impersonatedEmail} /> : null}
      <AdminNav
        showOperatorLinks={showOperatorLinks}
        showCostDashboard={showCostDashboard}
        sessionMode={sessionMode}
        isImpersonating={isImpersonating}
        showDevTools={showDevTools}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:py-10">{children}</div>
    </>
  );
}
