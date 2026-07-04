/**
 * Pure timing policy for the audio recorder.
 *
 * Owns VAD segment-cut thresholds, session billing-awareness chime
 * milestones, and the mandatory runaway-session guard. Lives outside the
 * React tree so it can be unit tested without jsdom.
 *
 * Tuning rationale:
 *  - VAD_MAX_SEGMENT_SECONDS: hard cap per segment (iOS/Safari fallback when
 *    AudioContext is suspended and RMS reads 0).
 *  - VAD_MIN_SEGMENT_SECONDS: do not cut on silence before this duration —
 *    avoids fragmenting transcription into tiny chunks.
 *  - SESSION_TIME_WARN_SECONDS: tutor billing-awareness chime ~5 min before
 *    each hourly milestone (not a Whisper/segment mechanism).
 *  - SESSION_SAFETY_MAX_SECONDS: pathological-runaway guard. Counts only timer
 *    ticks (pauses while paused).
 */

export const VAD_MAX_SEGMENT_SECONDS = 150; // 2.5 min hard cap / iOS fallback
export const VAD_MIN_SEGMENT_SECONDS = 25;
export const VAD_SILENCE_RMS_THRESHOLD = 0.02;
export const VAD_SILENCE_HOLD_MS = 1500;

/** Billing hour milestone — chime fires ~5 min before each multiple. */
export const SESSION_BILLING_HOUR_SECONDS = 60 * 60;
export const SESSION_TIME_WARN_BEFORE_SECONDS = 5 * 60;
export const SESSION_TIME_WARN_SECONDS =
  SESSION_BILLING_HOUR_SECONDS - SESSION_TIME_WARN_BEFORE_SECONDS;
export const SESSION_SAFETY_MAX_SECONDS = 8 * 60 * 60;

type VadOverrideWindow = {
  __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
  __VAD_MIN_SEGMENT_SECONDS_OVERRIDE?: number;
  __VAD_SILENCE_RMS_THRESHOLD_OVERRIDE?: number;
  __VAD_SILENCE_HOLD_MS_OVERRIDE?: number;
  __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number;
};

function readOverride(key: keyof VadOverrideWindow): number | null {
  if (typeof window === "undefined") return null;
  if (process.env.NODE_ENV === "production") return null;
  const v = (window as unknown as VadOverrideWindow)[key];
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return null;
}

export function effectiveVadMaxSegmentSeconds(): number {
  return readOverride("__VAD_MAX_SEGMENT_SECONDS_OVERRIDE") ?? VAD_MAX_SEGMENT_SECONDS;
}

export function effectiveVadMinSegmentSeconds(): number {
  return readOverride("__VAD_MIN_SEGMENT_SECONDS_OVERRIDE") ?? VAD_MIN_SEGMENT_SECONDS;
}

export function effectiveVadSilenceRmsThreshold(): number {
  return (
    readOverride("__VAD_SILENCE_RMS_THRESHOLD_OVERRIDE") ?? VAD_SILENCE_RMS_THRESHOLD
  );
}

export function effectiveVadSilenceHoldMs(): number {
  return readOverride("__VAD_SILENCE_HOLD_MS_OVERRIDE") ?? VAD_SILENCE_HOLD_MS;
}

export function effectiveSessionSafetyMaxSeconds(): number {
  return (
    readOverride("__SESSION_SAFETY_MAX_SECONDS_OVERRIDE") ?? SESSION_SAFETY_MAX_SECONDS
  );
}

export function shouldCutOnSilence(params: {
  segmentElapsedS: number;
  silenceHeldMs: number;
  rmsLevel: number;
}): boolean {
  const { segmentElapsedS, silenceHeldMs, rmsLevel } = params;
  if (segmentElapsedS < effectiveVadMinSegmentSeconds()) return false;
  if (rmsLevel >= effectiveVadSilenceRmsThreshold()) return false;
  return silenceHeldMs >= effectiveVadSilenceHoldMs();
}

export function shouldForceVadCap(segmentElapsedS: number): boolean {
  return segmentElapsedS >= effectiveVadMaxSegmentSeconds();
}

/**
 * Which hourly billing milestone (1 = approaching 1h, 2 = approaching 2h, …)
 * the session has entered the warn window for.
 */
export function sessionChimeMilestoneIndex(sessionElapsedSeconds: number): number {
  return Math.floor(
    (sessionElapsedSeconds + SESSION_TIME_WARN_BEFORE_SECONDS) /
      SESSION_BILLING_HOUR_SECONDS
  );
}

/**
 * True when session elapsed has crossed a new hourly warn threshold and the
 * chime has not yet fired for that milestone.
 */
export function shouldFireSessionTimeChime(
  sessionElapsedSeconds: number,
  lastFiredMilestoneIndex: number
): boolean {
  const milestone = sessionChimeMilestoneIndex(sessionElapsedSeconds);
  return milestone >= 1 && milestone > lastFiredMilestoneIndex;
}

export function shouldHardStopSession(totalElapsedSeconds: number): boolean {
  return totalElapsedSeconds >= effectiveSessionSafetyMaxSeconds();
}

/** True when within the warn window before the next hourly billing milestone. */
export function isSessionTimeWarning(sessionElapsedSeconds: number): boolean {
  const nextHour =
    Math.ceil(sessionElapsedSeconds / SESSION_BILLING_HOUR_SECONDS) *
    SESSION_BILLING_HOUR_SECONDS;
  if (nextHour <= sessionElapsedSeconds) return false;
  return nextHour - sessionElapsedSeconds <= SESSION_TIME_WARN_BEFORE_SECONDS;
}

export function secondsUntilSessionBillingMilestone(
  sessionElapsedSeconds: number
): number {
  const nextHour =
    Math.ceil(sessionElapsedSeconds / SESSION_BILLING_HOUR_SECONDS) *
    SESSION_BILLING_HOUR_SECONDS;
  return Math.max(0, nextHour - sessionElapsedSeconds);
}

/**
 * Human-friendly time-remaining label for the session billing milestone warning.
 */
export function formatSessionTimeLeft(secondsLeft: number): string {
  const safe = Math.max(0, secondsLeft);
  return safe >= 90 ? `~${Math.ceil(safe / 60)} min left` : `~${safe}s left`;
}
