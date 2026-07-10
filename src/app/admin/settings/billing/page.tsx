import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { SectionCard } from "@/components/SectionCard";
import { SubNav } from "@/components/SubNav";
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
      <AdminPageShell title="Billing" sidebar={<SubNav realm="admin-settings" />} sidebarWidth="narrow">
        <SectionCard realm="admin" title="Billing defaults">
          <p className="text-sm text-muted-foreground max-w-lg">
            This session uses server environment login only. Billing defaults require a
            database account — complete{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/setup</code>{" "}
            to create one.
          </p>
        </SectionCard>
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
      sidebar={<SubNav realm="admin-settings" />}
      sidebarWidth="narrow"
    >
      <SectionCard realm="admin"
        title="Billing defaults"
        description="Rounded billable time is frozen onto each session at close. Changing these settings affects only new sessions."
      >
        <BillingDefaultsForm defaults={defaults} />
      </SectionCard>
    </AdminPageShell>
  );
}
