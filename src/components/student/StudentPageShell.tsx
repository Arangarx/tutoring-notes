import type { ReactNode } from "react";
import Link from "next/link";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

type StudentPageShellProps = {
  children: ReactNode;
  /** Optional trailing actions (e.g. preferences link). */
  actions?: ReactNode;
  className?: string;
};

/**
 * Centered student-facing page chrome — wordmark header + full-height surface.
 * Used for bare /join (no active session landing).
 */
export function StudentPageShell({
  children,
  actions,
  className,
}: StudentPageShellProps) {
  return (
    <div className={cn("flex min-h-[100dvh] flex-col bg-background", className)}>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 sm:px-6">
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
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
