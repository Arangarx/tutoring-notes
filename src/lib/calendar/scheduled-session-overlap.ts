/** Half-open: a later appointment that only touches the previous endAt is not an overlap. */
export function scheduledSessionsOverlap(
  a: { startAt: Date; endAt: Date },
  b: { startAt: Date; endAt: Date }
): boolean {
  return a.startAt.getTime() < b.endAt.getTime() && b.startAt.getTime() < a.endAt.getTime();
}
