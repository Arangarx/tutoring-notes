import { VALID_BILLING_TIMEZONES } from "@/app/admin/settings/billing/billing-options";

/** Common Intl / POSIX aliases → curated billing IANA values. */
const BILLING_ZONE_ALIASES: Readonly<Record<string, string>> = {
  "US/Pacific": "America/Los_Angeles",
  "US/Mountain": "America/Denver",
  "US/Central": "America/Chicago",
  "US/Eastern": "America/New_York",
  "US/Arizona": "America/Phoenix",
  "US/Alaska": "America/Anchorage",
  "US/Hawaii": "Pacific/Honolulu",
  "America/Vancouver": "America/Los_Angeles",
  "America/Tijuana": "America/Los_Angeles",
  "America/Boise": "America/Denver",
  "America/Edmonton": "America/Denver",
  "America/Winnipeg": "America/Chicago",
  "America/Toronto": "America/New_York",
  "America/Montreal": "America/New_York",
};

function isValidIanaTimezone(zone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Map a browser `Intl` timeZone to a persistable IANA id.
 * Prefers the billing picker list; otherwise a valid IANA string; otherwise null.
 */
export function snapSystemIanaToBillingTimezone(
  iana: string | null | undefined
): string | null {
  const trimmed = iana?.trim() ?? "";
  if (!trimmed) return null;
  if (VALID_BILLING_TIMEZONES.has(trimmed)) return trimmed;
  const aliased = BILLING_ZONE_ALIASES[trimmed];
  if (aliased && VALID_BILLING_TIMEZONES.has(aliased)) return aliased;
  if (isValidIanaTimezone(trimmed)) return trimmed;
  return null;
}

export function readBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
