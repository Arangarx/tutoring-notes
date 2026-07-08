import type { ReactNode } from "react";
import Link from "next/link";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { AccountSignOutButton } from "@/components/account/AccountSignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

type AccountPageShellProps = {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** AccountHolder email — shown in nav for identity awareness */
  userEmail?: string;
};

/**
 * Layout wrapper for authenticated AccountHolder (parent) pages.
 * Provides consistent nav with wordmark, email indicator, and sign-out.
 */
export function AccountPageShell({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
  userEmail,
}: AccountPageShellProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <nav className="border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label="View home page">
            <MynkWordmark size="sm" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {userEmail ? (
              <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground sm:block">
                {userEmail}
              </span>
            ) : null}
            <ThemeToggle />
            <AccountSignOutButton />
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className={cn("mx-auto max-w-4xl px-4 py-8 sm:px-6", className)}>
        <div className="flex flex-col gap-8">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              {eyebrow ? (
                <div className="text-sm text-muted-foreground">{eyebrow}</div>
              ) : null}
              <h1 className="heading text-3xl font-normal tracking-tight text-foreground">
                {title}
              </h1>
              {description ? (
                <p className="max-w-2xl text-base text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
