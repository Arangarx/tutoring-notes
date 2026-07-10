import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type SettingsNavItem = {
  href: string;
  label: string;
  description: string;
};

type SettingsNavListProps = {
  items: readonly SettingsNavItem[];
  className?: string;
};

/** iOS-style settings index rows — full-bleed on mobile, contained card on desktop. */
export function SettingsNavList({ items, className }: SettingsNavListProps) {
  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        "overflow-hidden rounded-2xl border border-border border-l-[3px] border-l-accent bg-card shadow-sm",
        "max-md:-mx-4 max-md:rounded-none max-md:border-x-0 max-md:border-l-0",
        className
      )}
    >
      <ul className="m-0 list-none divide-y divide-border p-0" role="list">
        {items.map(({ href, label, description }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-16 items-center gap-3 px-[18px] py-4 transition-colors hover:bg-accent-soft/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{label}</div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-accent-text/70" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
