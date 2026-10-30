"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Marks a row as belonging to an organization the tutor teaches for.
 * Reads `via {organization name}`; the word "org" never appears in user copy.
 * The label wraps inside the badge so a long organization name stays fully visible.
 * A wrapped label uses a smaller radius: Badge is `rounded-full overflow-hidden`,
 * and a two-line pill clips the line corners. `rounded-md` is a className
 * override on that primitive, applied only while the label wraps.
 */
export function OrgBadge({
  organizationName,
  className,
}: {
  organizationName: string;
  className?: string;
}) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [wrapped, setWrapped] = useState(false);

  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const measure = () => {
      const range = document.createRange();
      range.selectNodeContents(el);
      setWrapped(range.getClientRects().length > 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [organizationName]);

  return (
    <Badge
      variant="outline"
      className={cn(
        "max-w-full min-w-0 shrink justify-start whitespace-normal",
        wrapped && "rounded-md",
        className
      )}
      data-testid="org-badge"
    >
      <span ref={labelRef} className="min-w-0 max-w-full whitespace-normal">
        via {organizationName}
      </span>
    </Badge>
  );
}
