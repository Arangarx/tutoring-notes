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

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const session = await getServerSession(authOptions);
  const mode = getAdminSessionMode(
    session?.user
      ? {
          sub: session.user.id,
          isImpersonating: session.user.isImpersonating,
          isTestAccount: session.user.isTestAccount,
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
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Admin</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Signed in as <strong>{email}</strong>. Use a test account below to open the tutor
        workspace, or manage your credentials in settings.
      </p>

      <div className="divider" />

      <AdminTestAccountsPanel />

      <div className="divider" />

      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <Link className="btn" href="/admin/settings">
          Settings
        </Link>
      </div>
    </div>
  );
}
