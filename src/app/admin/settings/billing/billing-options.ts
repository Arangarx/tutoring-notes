/** Curated IANA zones for tutor billing display (shared by form + server validation). */
export const BILLING_TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (America/New_York)" },
  { value: "America/Chicago", label: "Central (America/Chicago)" },
  { value: "America/Denver", label: "Mountain (America/Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (America/Los_Angeles)" },
  { value: "America/Phoenix", label: "Arizona (America/Phoenix)" },
  { value: "America/Anchorage", label: "Alaska (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Pacific/Honolulu)" },
  { value: "UTC", label: "UTC" },
] as const;

export const VALID_BILLING_TIMEZONES: ReadonlySet<string> = new Set(
  BILLING_TIMEZONE_OPTIONS.map((o) => o.value)
);
