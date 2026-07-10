import type { ReactNode } from "react";
import Link from "next/link";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { AccountSignOutButton } from "@/components/account/AccountSignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MARKETING_HOME_HREF } from "@/lib/marketing-routes";
import { cn } from "@/lib/utils";

export type AppHeaderRealm = "account" | "student";

type AppHeaderProps =
  | {
      realm: "account";
      userEmail?: string;
    }
  | {
      realm: "student";
      actions?: ReactNode;
      className?: string;
    };

/** Top app chrome (wordmark row) — account and student realms only. */
export function AppHeader(props: AppHeaderProps) {
  if (props.realm === "account") {
    const { userEmail } = props;
    return (
      <nav
        data-app-header-realm="account"
        className="border-b border-border bg-card/60 backdrop-blur-sm"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href={MARKETING_HOME_HREF} aria-label="View home page">
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
    );
  }

  const { actions, className } = props;
  return (
    <header
      data-app-header-realm="student"
      data-testid="student-page-shell-header"
      className={cn(
        "flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-1.5 sm:px-6",
        className
      )}
    >
      <Link
        href="/"
        className="rounded-[10px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="Mynk home"
      >
        <MynkWordmark size="sm" />
      </Link>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
