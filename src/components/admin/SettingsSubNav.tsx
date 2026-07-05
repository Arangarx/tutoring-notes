"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const settingsLinks = [
  { href: "/admin/settings/profile", label: "Profile" },
  { href: "/admin/settings/billing", label: "Billing" },
  { href: "/admin/settings/email", label: "Email" },
  { href: "/admin/settings/2fa", label: "Two-factor auth" },
] as const;

/** Desktop left sub-nav for settings sub-pages (§2.14 cohesion). */
export function SettingsSubNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="flex flex-col gap-0.5">
      {settingsLinks.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
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
