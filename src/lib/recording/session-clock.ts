/**
 * Single monotonic session clock (p3-clock).
 *
 * The whole live-session pipeline needs ONE time base with ONE t=0 epoch so
 * that whiteboard event `t`, the FSM's `audioClockMs`, and the transcription
 * `recordingTimeOffsetMs` all agree. This module is the pause-aware
 * elapsed-ms accumulator underneath that clock.
 *
 * Contract:
 *  - `t=0` is the first `start()` (the host wires this to the moment the FSM
 *    enters `recording` / `MediaRecorder.start()` — same gate = same epoch
 *    for every stream and the WB event log).
 *  - `readMs()` advances only while the clock is running.
 *  - `pause()` FREEZES the clock: `readMs()` returns the same value until the
 *    next `start()` (this is what makes a stable student-disconnect pause
 *    freeze the session clock while whiteboard strokes keep collapsing onto
 *    the frozen instant — ratified 2026-07-02).
 *  - `start()` after a `pause()` RESUMES accrual from the frozen value; the
 *    paused wall-time is never counted.
 *  - `start()` is idempotent while running (never re-anchors t=0).
 *
 * Pure + injectable-`now` so the accrual math is unit-testable without timers
 * or jsdom (clock math is jsdom-blind only for real-audio drift, which stays
 * a hardware smoke item — the accrual itself is deterministic).
 */
export type SessionMsClock = {
  /** Begin (or resume) accruing elapsed ms. Idempotent while running. */
  start(): void;
  /** Freeze the clock. `readMs()` holds steady until the next `start()`. */
  pause(): void;
  /** Current accrued elapsed ms, floored. Never negative, never rewinds. */
  readMs(): number;
};

function defaultNow(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/**
 * Create a fresh {@link SessionMsClock}. `now` defaults to a monotonic
 * high-resolution source (`performance.now()`); tests inject a controllable
 * one to assert the freeze/resume math deterministically.
 */
export function createSessionMsClock(now: () => number = defaultNow): SessionMsClock {
  let startedAt: number | null = null;
  let accruedMs = 0;

  return {
    start() {
      if (startedAt === null) {
        startedAt = now();
      }
    },
    pause() {
      if (startedAt !== null) {
        accruedMs += now() - startedAt;
        startedAt = null;
      }
    },
    readMs() {
      const elapsed =
        startedAt === null ? accruedMs : accruedMs + (now() - startedAt);
      return Math.max(0, Math.floor(elapsed));
    },
  };
}
