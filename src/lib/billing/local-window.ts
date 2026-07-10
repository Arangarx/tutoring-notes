/**
 * WS-J — tutor-timezone local billing window formatting (pure Date + IANA).
 */

const MS_PER_MINUTE = 60_000;

/** Format as `YYYY-MM-DD` in the given IANA timezone. */
export function formatSessionDateLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/** Format as `h:mm AM/PM` (minutes only, no seconds) in the given timezone. */
export function formatLocalTimeHM(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export type BilledLocalWindow = {
  billedStartLocal: string;
  billedEndLocal: string;
  sessionDateLocal: string;
};

/**
 * Derive Sarah-style local window: start anchor + billed duration minutes.
 * End = anchor + durationMin (not raw wall-clock end) so rounded billing aligns.
 */
export function computeBilledLocalWindow(
  anchorMs: number,
  billedDurationMin: number,
  timeZone: string
): BilledLocalWindow {
  const start = new Date(anchorMs);
  const end = new Date(anchorMs + billedDurationMin * MS_PER_MINUTE);
  return {
    billedStartLocal: formatLocalTimeHM(start, timeZone),
    billedEndLocal: formatLocalTimeHM(end, timeZone),
    sessionDateLocal: formatSessionDateLocal(start, timeZone),
  };
}
