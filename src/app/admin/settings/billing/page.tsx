import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { SettingsSubNav } from "@/components/admin/SettingsSubNav";
import BillingDefaultsForm from "./BillingDefaultsForm";
import { loadBillingDefaultsForForm } from "./actions";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return (
      <AdminPageShell title="Billing">
        <p className="text-sm text-muted-foreground">
          Sign in to edit billing defaults.{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Login
          </Link>
        </p>
      </AdminPageShell>
    );
  }

  const defaults = await loadBillingDefaultsForForm();
  if (!defaults) {
    return (
      <AdminPageShell title="Billing" sidebar={<SettingsSubNav />} sidebarWidth="narrow">
        <AdminSectionCard title="Billing defaults">
          <p className="text-sm text-muted-foreground max-w-lg">
            This session uses server environment login only. Billing defaults require a
            database account — complete{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/setup</code>{" "}
            to create one.
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title="Billing"
      description="Defaults for how session time is rounded when a session ends."
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
      <AdminSectionCard
        title="Billing defaults"
        description="Rounded billable time is frozen onto each session at close. Changing these settings affects only new sessions."
      >
        <BillingDefaultsForm defaults={defaults} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
