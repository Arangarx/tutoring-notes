import Link from "next/link";
import { AdminPageShell } from "@/components/admin/AdminPageShell";

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
      eyebrow={
        <Link
          href="/admin/students"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Students
        </Link>
      }
    >
      <nav aria-label="Settings sections">
        <ul className="divide-y divide-border rounded-lg border border-border bg-card" role="list">
          {settingsLinks.map(({ href, label, description }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-16 items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-semibold text-foreground">{label}</div>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <svg
                  className="size-4 shrink-0 text-muted-foreground"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6 3l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </AdminPageShell>
  );
}
