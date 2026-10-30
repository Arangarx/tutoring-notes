import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Marks a row as belonging to an organization the tutor teaches for.
 * Reads `via {organization name}`; the word "org" never appears in user copy.
 * The label wraps inside the badge so a long organization name stays fully visible.
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
      className={cn("max-w-full min-w-0 shrink justify-start whitespace-normal", className)}
      data-testid="org-badge"
    >
      <span className="min-w-0 flex-1 whitespace-normal">via {organizationName}</span>
    </Badge>
  );
}
