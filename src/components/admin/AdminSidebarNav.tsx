"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import { exitImpersonation } from "@/app/admin/actions/impersonate";
import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminSessionMode } from "@/lib/admin-routing";

export type AdminSidebarNavProps = {
  showOperatorLinks?: boolean;
  showCostDashboard?: boolean;
  sessionMode?: AdminSessionMode;
  isImpersonating?: boolean;
  showDevTools?: boolean;
  userEmail?: string;
  userDisplayName?: string | null;
};

function buildNavLinks(props: AdminSidebarNavProps) {
  const tutorLinks = [
    { href: "/admin/students", label: "Students" },
    { href: "/admin/schedule", label: "Schedule" },
    { href: "/admin/outbox", label: "Outbox" },
  ];
  return [
    ...(props.sessionMode === "real-admin-home"
      ? [{ href: "/admin", label: "Dashboard" } as const]
      : []),
    ...(props.sessionMode === "tutor-experience" ? tutorLinks : []),
    ...(props.showOperatorLinks
      ? [
          { href: "/admin/feedback", label: "Feedback inbox" } as const,
          { href: "/admin/tutor-approvals", label: "Tutor approvals" } as const,
        ]
      : []),
    ...(props.showCostDashboard ? [{ href: "/admin/cost", label: "Cost" } as const] : []),
    { href: "/admin/settings", label: "Settings" },
    ...(props.showDevTools ? [{ href: "/admin/dev-tools", label: "Dev tools" } as const] : []),
  ];
}

function isNavActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebarNav({
  showOperatorLinks = false,
  showCostDashboard = false,
  sessionMode = "tutor-experience",
  isImpersonating = false,
  showDevTools = false,
  userEmail = "",
  userDisplayName,
}: AdminSidebarNavProps) {
  const pathname = usePathname();
  const links = buildNavLinks({
    showOperatorLinks,
    showCostDashboard,
    sessionMode,
    isImpersonating,
    showDevTools,
  });

  const displayName = userDisplayName?.trim() || userEmail.split("@")[0] || "Tutor";
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <nav
      aria-label="Admin"
      className="flex h-full w-[220px] flex-col gap-5 border-r border-border bg-card p-5"
    >
      <Link
        href="/"
        className="mb-1 inline-flex shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="Home"
      >
        <MynkWordmark size="sm" />
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex min-h-8 items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isNavActive(pathname, l.href)
                ? "bg-accent-soft text-accent-text"
                : "text-foreground hover:bg-muted/60"
            )}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-center px-1">
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-background p-3">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-[color:var(--surface)]"
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{userEmail}</p>
          </div>
          {isImpersonating ? (
            <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-destructive bg-destructive/10">
              Imp
            </span>
          ) : null}
        </div>

        {isImpersonating ? (
          <form action={exitImpersonation}>
            <Button
              type="submit"
              variant="ghost"
              className="min-h-11 w-full justify-start text-muted-foreground hover:text-destructive"
            >
              Sign out
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </Button>
        )}
      </div>
    </nav>
  );
}
