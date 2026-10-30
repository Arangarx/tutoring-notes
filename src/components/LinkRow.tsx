import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Stack of card rows. Same list on the student roster and both organization lists. */
export const LINK_ROW_LIST_CLASS =
  "m-0 flex list-none flex-col gap-2.5 p-0 md:gap-3";

export type LinkRowProps = {
  href: string;
  title: string;
  leading?: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  testId?: string;
};

/**
 * Full-width card link. Styles live here (tokens only). Callers vary the
 * row through props: leading slot, meta line, and badges. The chevron and
 * focus ring are always present.
 */
export function LinkRow({ href, title, leading, meta, badges, testId }: LinkRowProps) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex min-h-[60px] w-full items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm transition-colors hover:border-ring hover:bg-card/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[15px] font-semibold text-foreground group-hover:text-brand">
            {title}
          </div>
          {badges}
        </div>
        {meta != null && meta !== "" ? (
          <div className="label-mono mt-0.5 text-[11px] text-muted-foreground">{meta}</div>
        ) : null}
      </div>
      <ChevronRight
        className="size-[18px] shrink-0 text-muted-foreground group-hover:text-accent-text"
        aria-hidden
      />
    </Link>
  );
}
