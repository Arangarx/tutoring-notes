/**
 * Pure client policy for WS-B ~1s whiteboard server persist (BLOCKER-2 / SF-1 / SF-8).
 * Extracted for unit tests — no React or fetch dependencies.
 */

export const SERVER_PERSIST_MAX_RETRIES = 3;
export const SERVER_PERSIST_WARNING_THRESHOLD = 3;
export const SERVER_PERSIST_WARNING_MESSAGE =
  "Backup save paused — strokes protected by local draft";

/** Interval tick: skip when a persist HTTP round-trip is already in flight. */
export function shouldSkipPersistTick(persistInProgress: boolean): boolean {
  return persistInProgress;
}

/** Advance lastPersistedIndex only after a 2xx response. */
export function shouldAdvanceCursorOnResponse(status: number): boolean {
  return status >= 200 && status < 300;
}

/** 409 = session ended / not active — stop retrying this batch; never advance cursor. */
export function shouldStopPersistOnResponse(status: number): boolean {
  return status === 409;
}

export function shouldRetryPersist(
  status: number,
  attempt: number,
  maxRetries: number = SERVER_PERSIST_MAX_RETRIES
): boolean {
  if (shouldAdvanceCursorOnResponse(status)) return false;
  if (shouldStopPersistOnResponse(status)) return false;
  return attempt < maxRetries;
}

/** Exponential backoff between non-409 retries (attempt 0 → 250ms). */
export function computeBackoffMs(attempt: number): number {
  return 250 * 2 ** attempt;
}

export function nextConsecutiveFailures(prev: number, success: boolean): number {
  return success ? 0 : prev + 1;
}

export function shouldShowPersistWarning(consecutiveFailures: number): boolean {
  return consecutiveFailures >= SERVER_PERSIST_WARNING_THRESHOLD;
}
