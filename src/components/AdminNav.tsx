"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { exitImpersonation } from "@/app/admin/actions/impersonate";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminSessionMode } from "@/lib/admin-routing";

type AdminNavProps = {
  /** Show operator-only nav links (feedback inbox, waitlist, cost dashboard). */
  showOperatorLinks?: boolean;
  /** Show the /admin/cost link — operator + ADMIN role only. */
  showCostDashboard?: boolean;
  sessionMode?: AdminSessionMode;
  /**
   * When true, the "Sign out" button routes through exitImpersonation() instead
   * of next-auth signOut() — dropping the impersonation and restoring the admin's
   * verified session rather than terminating it entirely.
   */
  isImpersonating?: boolean;
  /**
   * Show the "Dev tools" link — only in non-production environments and for
   * operator-authenticated sessions. The page itself enforces the env gate
   * (notFound() in production); this prop controls nav visibility.
   */
  showDevTools?: boolean;
};

export function AdminNav({
  showOperatorLinks = false,
  showCostDashboard = false,
  sessionMode = "tutor-experience",
  isImpersonating = false,
  showDevTools = false,
}: AdminNavProps) {
  const tutorLinks = [
    { href: "/admin/students", label: "Students" },
    { href: "/admin/outbox", label: "Outbox" },
  ];
  const adminLinks = [
    { href: "/admin", label: "Dashboard" },
    ...(sessionMode === "tutor-experience" ? tutorLinks : []),
    ...(showOperatorLinks
      ? [
          { href: "/admin/feedback", label: "Feedback inbox" } as const,
          { href: "/admin/tutor-approvals", label: "Tutor approvals" } as const,
        ]
      : []),
    ...(showCostDashboard ? [{ href: "/admin/cost", label: "Cost" } as const] : []),
    { href: "/feedback", label: "Send feedback" },
    ...(showOperatorLinks ? [{ href: "/admin/waitlist", label: "Waitlist" } as const] : []),
    { href: "/admin/settings", label: "Settings" },
    ...(showDevTools ? [{ href: "/admin/dev-tools", label: "Dev tools" } as const] : []),
  ];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    if (href === "/feedback") return pathname === "/feedback";
    return pathname.startsWith(href);
  }

  const linkClass = (href: string, mobile?: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      isActive(href)
        ? "bg-accent-soft text-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
      mobile && "w-full justify-start"
    );

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4">
          <Link
            href="/?view=home"
            className="inline-flex min-h-11 min-w-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="View home page"
          >
            <MynkWordmark size="sm" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {adminLinks.map((l) => (
              <Link key={l.href} href={l.href} className={linkClass(l.href)}>
                {l.label}
              </Link>
            ))}
            <ThemeToggle />
            {isImpersonating ? (
              <form action={exitImpersonation}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="min-h-11 text-muted-foreground hover:text-destructive"
                >
                  Sign out
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 text-muted-foreground hover:text-destructive"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Sign out
              </Button>
            )}
          </nav>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11 md:hidden"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <span className="sr-only">{open ? "Close" : "Menu"}</span>
            <span className="flex flex-col gap-1.5" aria-hidden>
              <span
                className={cn(
                  "block h-0.5 w-5 rounded-full bg-foreground transition-transform",
                  open && "translate-y-2 rotate-45"
                )}
              />
              <span
                className={cn(
                  "block h-0.5 w-5 rounded-full bg-foreground transition-opacity",
                  open && "opacity-0"
                )}
              />
              <span
                className={cn(
                  "block h-0.5 w-5 rounded-full bg-foreground transition-transform",
                  open && "-translate-y-2 -rotate-45"
                )}
              />
            </span>
          </Button>
        </div>
      </header>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <nav
            id="admin-mobile-nav"
            className="fixed inset-y-0 right-0 z-50 flex w-[min(100%,280px)] flex-col gap-1 border-l border-border bg-card p-4 shadow-lg md:hidden"
            aria-label="Main"
          >
            {adminLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={linkClass(l.href, true)}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <div className="px-1 py-2">
              <ThemeToggle />
            </div>
            {isImpersonating ? (
              <form action={exitImpersonation}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="mt-2 min-h-11 w-full justify-start text-destructive"
                  onClick={() => setOpen(false)}
                >
                  Sign out
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 min-h-11 w-full justify-start text-destructive"
                onClick={() => {
                  setOpen(false);
                  signOut({ callbackUrl: "/login" });
                }}
              >
                Sign out
              </Button>
            )}
          </nav>
        </>
      ) : null}
    </>
  );
}
