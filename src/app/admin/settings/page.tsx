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
    href: "/admin/settings/email",
    label: "Email",
    description:
      'Connect Gmail or SMTP so "Send update" and password reset emails deliver.',
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
        <Link
          href="/admin/students"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Students
        </Link>
      }
    >
      <SettingsNavList items={settingsLinks} />
    </AdminPageShell>
  );
}
