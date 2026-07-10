/**
 * Canonical clock-duration formatters.
 *
 * Two display contracts share one assembly path (padMinutes distinguishes them):
 * - formatDurationMs: M:SS under 1h / H:MM:SS at 1h+ (replay scrubbers, WB chrome)
 * - recording formatDuration(seconds): MM:SS under 1h / H:MM:SS at 1h+ (recorder UI)
 *
 * Do not silently unify those contracts — under-1h padding differs by design.
 */

export type FormatClockDurationOptions = {
  /** When true, minutes under 1h are zero-padded (MM:SS). Default false (M:SS). */
  padMinutes?: boolean;
};

/**
 * Format whole seconds as a clock string.
 * Caller owns input normalization (flooring, clamping, null → "").
 */
export function formatClockDuration(
  totalSec: number,
  opts?: FormatClockDurationOptions
): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const mStr = opts?.padMinutes ? String(m).padStart(2, "0") : String(m);
  return `${mStr}:${String(s).padStart(2, "0")}`;
}

/**
 * Format a duration in milliseconds as `M:SS` or `H:MM:SS`.
 * Negative / sub-second values clamp to `0:00`.
 */
export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return formatClockDuration(totalSec, { padMinutes: false });
}
