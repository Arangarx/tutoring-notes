/**
 * When a scheduled appointment's live room is open to the learner.
 * One rule for the server gate and the dashboard Join button.
 */

/** The room opens this long before the scheduled start. */
export const JOIN_WINDOW_OPENS_BEFORE_MS = 15 * 60_000;

export type JoinWindowBounds = {
  startAt: Date | null;
  endAt: Date | null;
};

export function isWithinJoinWindow(
  { startAt, endAt }: JoinWindowBounds,
  now: Date
): boolean {
  if (!startAt || !endAt) return false;
  const t = now.getTime();
  return t >= startAt.getTime() - JOIN_WINDOW_OPENS_BEFORE_MS && t < endAt.getTime();
}
