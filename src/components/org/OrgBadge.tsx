import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Marks a row as belonging to an organization the tutor teaches for.
 * Reads `via {organization name}`; the word "org" never appears in user copy.
 *
 * Shrinks before sibling text (flex-shrink 1000) down to a floor the badge
 * owns. Measured on a squeezed schedule row (Inter 500 12px): a probe of
 * "via W…" was 41.75px, and that label sat 18px inside the border box
 * (16px horizontal padding + 2px border), so the floor is 60px.
 */
export function OrgBadge({
  organizationName,
  className,
}: {
  organizationName: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      // Floor stays last so a caller className cannot shrink the badge below it.
      className={cn(className, "min-w-[60px] shrink-[1000]")}
      data-testid="org-badge"
      title={`via ${organizationName}`}
    >
      <span className="min-w-0 truncate">via {organizationName}</span>
    </Badge>
  );
}
