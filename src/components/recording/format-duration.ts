/**
 * Format a duration in whole seconds as `MM:SS` or `H:MM:SS`.
 * Used by the recorder shell + DoneCard + MainPanel.
 *
 * Shares clock assembly with formatDurationMs via padMinutes — under 1h this
 * API zero-pads minutes (`01:00`); the ms replay/WB API does not (`1:00`).
 */
import { formatClockDuration } from "@/lib/time/format-duration-ms";

export function formatDuration(seconds: number): string {
  return formatClockDuration(seconds, { padMinutes: true });
}
