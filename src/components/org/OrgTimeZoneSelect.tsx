import { Label } from "@/components/ui/label";
import {
  DEFAULT_ORG_TIME_ZONE,
  ORG_TIME_ZONES,
  isOrgTimeZone,
} from "@/lib/org-time-zones";

/**
 * Native select so the operator form posts `timezone` with the server action.
 * The shared Radix Select does not submit a named field.
 */
export function OrgTimeZoneSelect({
  id,
  defaultValue = DEFAULT_ORG_TIME_ZONE,
}: {
  id: string;
  defaultValue?: string;
}) {
  const selected = isOrgTimeZone(defaultValue) ? defaultValue : DEFAULT_ORG_TIME_ZONE;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Time zone</Label>
      <select
        id={id}
        name="timezone"
        defaultValue={selected}
        required
        data-testid={id}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {ORG_TIME_ZONES.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {zone.label} ({zone.id})
          </option>
        ))}
      </select>
    </div>
  );
}
