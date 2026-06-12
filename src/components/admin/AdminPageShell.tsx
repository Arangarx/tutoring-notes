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
  /** Optional left rail (dashboard sidebar, settings sub-nav). Renders beside main content. */
  sidebar?: ReactNode;
  /** Width preset for `sidebar` — default 220px (dashboard), narrow 180px (settings). */
  sidebarWidth?: "default" | "narrow";
};

/** Consistent page chrome for tutor/admin surfaces (B2). */
export function AdminPageShell({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
  sidebar,
  sidebarWidth = "default",
}: AdminPageShellProps) {
  const sidebarWidthClass =
    sidebarWidth === "narrow" ? "w-full md:w-[180px]" : "w-full md:w-[220px]";

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
      {sidebar ? (
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <aside className={cn("shrink-0", sidebarWidthClass)}>{sidebar}</aside>
          <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
