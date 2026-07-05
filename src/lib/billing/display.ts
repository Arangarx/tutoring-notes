/**
 * WS-J — minutes-only billed duration labels for review / share surfaces.
 */

/** Minutes-only label (no seconds): e.g. `55 min`, `1h 5 min`. */
export function formatBilledMinutesOnly(billedDurationMin: number): string {
  const total = Math.max(0, Math.floor(billedDurationMin));
  if (total >= 60) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m > 0 ? `${h}h ${m} min` : `${h}h`;
  }
  return `${total} min`;
}

/**
 * Review/share header label: billed minutes + optional local window.
 * Falls back to `fallbackLabel` when `billedDurationMin` is null (pre-WS-J rows).
 */
export function formatBilledDurationLabel(input: {
  billedDurationMin: number | null;
  billedStartLocal?: string | null;
  billedEndLocal?: string | null;
  fallbackLabel?: string;
}): string | undefined {
  const { billedDurationMin, billedStartLocal, billedEndLocal, fallbackLabel } =
    input;

  if (billedDurationMin == null) {
    return fallbackLabel;
  }

  const minutes = formatBilledMinutesOnly(billedDurationMin);
  if (billedStartLocal && billedEndLocal) {
    return `${minutes} · ${billedStartLocal}–${billedEndLocal}`;
  }
  return minutes;
}
