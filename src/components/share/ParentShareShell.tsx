import type { ReactNode } from "react";
import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ParentShareShellProps = {
  studentName: string;
  subtitle: ReactNode;
  /** Optional header action (e.g. browse-all link). */
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Page chrome for parent `/s/[token]` surfaces — mock-aligned shell (max 860px). */
export function ParentShareShell({
  studentName,
  subtitle,
  headerAction,
  children,
  className,
}: ParentShareShellProps) {
  return (
    <main className={cn("min-h-dvh bg-background", className)}>
      <div className="mx-auto w-full max-w-[860px]">
        <header className="border-b border-border bg-card px-4 py-4 md:px-5 md:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="heading m-0 text-[22px] font-bold tracking-tight md:text-[26px]">
                {studentName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
              <ThemeToggle />
              {headerAction ? <div>{headerAction}</div> : null}
            </div>
          </div>
        </header>
        <div className="flex flex-col gap-3 px-4 py-4 pb-8 md:px-5">{children}</div>
      </div>
    </main>
  );
}

type ShareBrowseAllLinkProps = {
  href: string;
  label: string;
  className?: string;
};

export function ShareBrowseAllLink({ href, label, className }: ShareBrowseAllLinkProps) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-auto w-full whitespace-nowrap px-3.5 py-2.5 text-sm font-medium sm:w-auto",
        className
      )}
      asChild
    >
      <Link href={href}>{label}</Link>
    </Button>
  );
}

type ShareDividerLabelProps = {
  children: ReactNode;
  variant?: "accent" | "muted";
};

/** “New since your last visit” / “Previously seen” dividers. */
export function ShareDividerLabel({ children, variant = "accent" }: ShareDividerLabelProps) {
  const isAccent = variant === "accent";
  return (
    <div
      className={cn(
        "my-2 flex items-center gap-2.5",
        isAccent ? "text-xs font-semibold text-accent" : "text-xs font-medium text-muted-foreground"
      )}
    >
      <div
        className={cn("h-px flex-1", isAccent ? "bg-accent opacity-40" : "bg-border")}
        aria-hidden
      />
      <span className="whitespace-nowrap">{children}</span>
      <div
        className={cn("h-px flex-1", isAccent ? "bg-accent opacity-40" : "bg-border")}
        aria-hidden
      />
    </div>
  );
}
