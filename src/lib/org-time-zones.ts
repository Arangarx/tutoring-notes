/**
 * Time zones an operator may store on an organization.
 * The schedule renders appointment clocks in this zone.
 * America/Denver is the default when the create form omits a choice.
 */

export const ORG_TIME_ZONES = [
  { id: "America/New_York", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona" },
  { id: "America/Los_Angeles", label: "Pacific" },
  { id: "America/Anchorage", label: "Alaska" },
  { id: "Pacific/Honolulu", label: "Hawaii" },
] as const;

export type OrgTimeZoneId = (typeof ORG_TIME_ZONES)[number]["id"];

export const DEFAULT_ORG_TIME_ZONE: OrgTimeZoneId = "America/Denver";

const ORG_TIME_ZONE_IDS: ReadonlySet<string> = new Set(ORG_TIME_ZONES.map((zone) => zone.id));

export function isOrgTimeZone(value: string): value is OrgTimeZoneId {
  return ORG_TIME_ZONE_IDS.has(value);
}
