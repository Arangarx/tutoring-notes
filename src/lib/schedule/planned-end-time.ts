const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTES_IN_DAY = 24 * 60;

/** Minutes since midnight for a zero-padded 24h HH:MM, or null when malformed. */
export function hhmmToMinutes(hhmm: string): number | null {
  const match = HHMM.exec(hhmm);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function wrapDay(minutes: number): number {
  return ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
}

/** End clock time for a start plus a planned length. Wraps within the same HH:MM day. */
export function endTimeForPlannedLength(
  startHhmm: string,
  plannedMinutes: number
): string | null {
  const start = hhmmToMinutes(startHhmm);
  if (start === null) return null;
  if (!Number.isInteger(plannedMinutes) || plannedMinutes <= 0) return null;
  const wrapped = wrapDay(start + plannedMinutes);
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Minutes from start to end; an end clock before the start ends the next day. */
export function sessionSpanMinutes(startHhmm: string, endHhmm: string): number | null {
  const start = hhmmToMinutes(startHhmm);
  const end = hhmmToMinutes(endHhmm);
  if (start === null || end === null) return null;
  return wrapDay(end - start);
}

/** Spans beyond this ask the tutor to confirm before saving (likely a typo). */
export const LONG_SESSION_CONFIRM_MINUTES = 4 * 60;

export function isLongSessionSpan(startHhmm: string, endHhmm: string): boolean {
  const span = sessionSpanMinutes(startHhmm, endHhmm);
  return span !== null && span > LONG_SESSION_CONFIRM_MINUTES;
}

export function endMatchesPlannedLength(
  startHhmm: string,
  endHhmm: string,
  plannedMinutes: number
): boolean {
  const expected = endTimeForPlannedLength(startHhmm, plannedMinutes);
  return expected !== null && expected === endHhmm;
}
