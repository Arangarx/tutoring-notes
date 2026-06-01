import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminPageShellProps = {
  title: string;
  description?: ReactNode;
  /** Breadcrumb or back link above the title */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Consistent page chrome for tutor/admin surfaces (B2). */
export function AdminPageShell({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: AdminPageShellProps) {
  return (
    <div className={cn("flex flex-col gap-8", className)}>
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
  );
}
