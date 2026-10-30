import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Marks a row as belonging to an organization the tutor teaches for.
 * Reads `via {organization name}`; the word "org" never appears in user copy.
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
      className={cn("min-w-0 shrink", className)}
      data-testid="org-badge"
      title={`via ${organizationName}`}
    >
      <span className="truncate">via {organizationName}</span>
    </Badge>
  );
}
