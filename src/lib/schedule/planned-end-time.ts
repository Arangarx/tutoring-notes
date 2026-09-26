const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** End clock time for a start plus a planned length. Wraps within the same HH:MM day. */
export function endTimeForPlannedLength(
  startHhmm: string,
  plannedMinutes: number
): string | null {
  const match = HHMM.exec(startHhmm);
  if (!match) return null;
  if (!Number.isInteger(plannedMinutes) || plannedMinutes <= 0) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + plannedMinutes;
  const minutesInDay = 24 * 60;
  const wrapped = ((total % minutesInDay) + minutesInDay) % minutesInDay;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function endMatchesPlannedLength(
  startHhmm: string,
  endHhmm: string,
  plannedMinutes: number
): boolean {
  const expected = endTimeForPlannedLength(startHhmm, plannedMinutes);
  return expected !== null && expected === endHhmm;
}
