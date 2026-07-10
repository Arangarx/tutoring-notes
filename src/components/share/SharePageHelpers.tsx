import type { ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
