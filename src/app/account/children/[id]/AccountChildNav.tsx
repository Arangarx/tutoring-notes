"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TAB_DEFS = [
  { segment: "", label: "Profile" },
  { segment: "notes", label: "Notes" },
  { segment: "devices", label: "Devices" },
  { segment: "consent", label: "Privacy" },
] as const;

export function AccountChildNav({ learnerId }: { learnerId: string }) {
  const pathname = usePathname();
  const base = `/account/children/${learnerId}`;

  return (
    <nav
      aria-label="Learner sections"
      className="overflow-x-auto border-b border-border"
    >
      <div className="flex min-w-max gap-1">
        {TAB_DEFS.map(({ segment, label }) => {
          const href = segment ? `${base}/${segment}` : base;
          const isActive =
            segment === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={segment || "profile"}
              href={href}
              className={cn(
                "inline-flex min-h-11 items-center px-4 py-2 text-sm font-medium transition-colors",
                "border-b-2 -mb-px",
                isActive
                  ? "border-accent text-accent-text"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
