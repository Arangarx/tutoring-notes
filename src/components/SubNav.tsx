"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type SubNavRealm = "admin-settings" | "account-child";

const SETTINGS_LINKS = [
  { href: "/admin/settings/profile", label: "Profile" },
  { href: "/admin/settings/billing", label: "Billing" },
  { href: "/admin/settings/email", label: "Email" },
  { href: "/admin/settings/known-issues", label: "Known issues & roadmap" },
  { href: "/admin/settings/2fa", label: "Two-factor auth" },
] as const;

const ACCOUNT_CHILD_TABS = [
  { segment: "", label: "Profile" },
  { segment: "notes", label: "Notes" },
  { segment: "devices", label: "Devices" },
  { segment: "consent", label: "Privacy" },
] as const;

type SubNavProps =
  | { realm: "admin-settings" }
  | { realm: "account-child"; learnerId: string };

function isSettingsPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isAccountChildPathActive(
  pathname: string,
  base: string,
  segment: string,
  href: string
): boolean {
  if (segment === "") {
    return pathname === base;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SubNav(props: SubNavProps) {
  const pathname = usePathname();

  if (props.realm === "admin-settings") {
    return (
      <nav
        aria-label="Settings"
        data-realm="admin-settings"
        className="flex flex-col gap-0.5"
      >
        {SETTINGS_LINKS.map(({ href, label }) => {
          const active = isSettingsPathActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-11 items-center rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active
                  ? "bg-accent-soft text-accent-text"
                  : "text-foreground hover:bg-muted/60"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  const { learnerId } = props;
  const base = `/account/children/${learnerId}`;

  return (
    <nav
      aria-label="Learner sections"
      data-realm="account-child"
      className="overflow-x-auto overflow-y-hidden border-b border-border"
    >
      <div className="flex min-w-max gap-1">
        {ACCOUNT_CHILD_TABS.map(({ segment, label }) => {
          const href = segment ? `${base}/${segment}` : base;
          const active = isAccountChildPathActive(pathname, base, segment, href);

          return (
            <Link
              key={segment || "profile"}
              href={href}
              className={cn(
                "inline-flex min-h-11 items-center px-4 py-2 text-sm font-medium transition-colors",
                "border-b-2 -mb-px",
                active
                  ? "border-accent text-accent-text"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
