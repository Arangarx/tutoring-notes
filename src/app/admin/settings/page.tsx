import Link from "next/link";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { SettingsNavList } from "@/components/admin/SettingsNavList";

export const dynamic = "force-dynamic";

const settingsLinks = [
  {
    href: "/admin/settings/profile",
    label: "Profile",
    description: "Your name, password, and account email.",
  },
  {
    href: "/admin/settings/billing",
    label: "Billing",
    description: "Time rounding increment, direction, and timezone for new sessions.",
  },
  {
    href: "/admin/settings/email",
    label: "Email",
    description:
      'Connect Gmail or SMTP so "Send update" and password reset emails deliver.',
  },
  {
    href: "/admin/settings/integrations",
    label: "Calendar integrations",
    description:
      "Connect Apple Calendar or Google Calendar to mirror scheduled sessions outward.",
  },
  {
    href: "/admin/settings/2fa",
    label: "Two-Factor Authentication",
    description: "Set up or rotate your TOTP authenticator for mandatory 2FA.",
  },
] as const;

export default async function SettingsIndexPage() {
  return (
    <AdminPageShell
      title="Settings"
      description="Your profile and account settings."
      className="mx-auto max-w-xl"
      eyebrow={
        <div className="space-y-2">
          <Link
            href="/admin/students"
            className="inline-flex min-h-11 items-center text-sm font-medium text-brand transition-colors hover:underline"
          >
            ← Students
          </Link>
          <p className="label-mono m-0 text-accent-text">Preferences</p>
        </div>
      }
    >
      <SettingsNavList items={settingsLinks} />
    </AdminPageShell>
  );
}
