import { getServerSession } from "next-auth";
import { AdminNav } from "@/components/AdminNav";
import { authOptions } from "@/auth-options";
import { isOperatorEmail } from "@/lib/operator";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const showOperatorLinks = isOperatorEmail(session?.user?.email);
  const isImpersonating = session?.user?.isImpersonating ?? false;
  const impersonatedEmail = session?.user?.email ?? "";

  return (
    <>
      {isImpersonating && <ImpersonationBanner email={impersonatedEmail} />}
      <AdminNav showOperatorLinks={showOperatorLinks} />
      <div className="container">{children}</div>
    </>
  );
}
