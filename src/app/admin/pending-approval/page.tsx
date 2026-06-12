import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingApprovalSignOut } from "./PendingApprovalSignOut";

export const dynamic = "force-dynamic";

export default async function PendingApprovalPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const approvalStatus = session.user.approvalStatus;
  if (!approvalStatus || approvalStatus === "APPROVED") {
    redirect("/admin");
  }

  const email = session.user.email ?? "your account";

  return (
    <div className="flex min-h-screen flex-col">
      <AdminNav />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Account pending approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your tutor account (<span className="font-medium text-foreground">{email}</span>)
              has been created and is pending operator approval.
            </p>
            <p className="text-sm text-muted-foreground">
              Once approved you will have full access to the platform. If you are expecting
              faster access, please contact your administrator.
            </p>
            <div className="pt-2">
              <PendingApprovalSignOut />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
