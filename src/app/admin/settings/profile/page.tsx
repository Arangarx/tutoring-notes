import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { getAdminByEmail } from "@/lib/auth-db";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { SettingsSubNav } from "@/components/admin/SettingsSubNav";
import ChangePasswordForm from "./ChangePasswordForm";
import ProfileForm from "./ProfileForm";

export default async function ProfileSettingsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return (
      <AdminPageShell title="Profile">
        <p className="text-sm text-muted-foreground">
          Sign in to edit your profile.{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Login
          </Link>
        </p>
      </AdminPageShell>
    );
  }
  const admin = await getAdminByEmail(email);
  const has2FA = !!(admin && session?.user?.twoFactorVerified);

  return (
    <AdminPageShell
      title="Profile"
      description={
        <>
          Signed in as <strong className="text-foreground font-medium">{email}</strong>.
          Set how parents see you in update emails.
        </>
      }
      eyebrow={
        <Link
          href="/admin/settings"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          ← Settings
        </Link>
      }
      sidebar={<SettingsSubNav />}
      sidebarWidth="narrow"
    >
      <div className="space-y-6">
        <AdminSectionCard
          title="Display name"
          description="How your name appears in session update emails sent to families."
        >
          <ProfileForm defaultDisplayName={admin?.displayName ?? ""} />
        </AdminSectionCard>

        {admin ? (
          <AdminSectionCard
            title="Password"
            description="Change your sign-in password or request a reset link."
          >
            <ChangePasswordForm email={email ?? ""} has2FA={has2FA} />
          </AdminSectionCard>
        ) : (
          <AdminSectionCard title="Password">
            <p className="text-sm text-muted-foreground max-w-lg">
              This session uses server environment login only. Change{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ADMIN_PASSWORD</code>{" "}
              in your host settings, or complete{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/setup</code> to create a
              database account — then you can change your password here or use{" "}
              <Link
                href="/forgot-password"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Forgot your password?
              </Link>{" "}
              from the login page.
            </p>
          </AdminSectionCard>
        )}
      </div>
    </AdminPageShell>
  );
}
