/**
 * Pure thresholds + decision functions for the recorder timer / VAD policy.
 */

import {
  VAD_MAX_SEGMENT_SECONDS,
  VAD_MIN_SEGMENT_SECONDS,
  VAD_SILENCE_HOLD_MS,
  VAD_SILENCE_RMS_THRESHOLD,
  SESSION_BILLING_HOUR_SECONDS,
  SESSION_TIME_WARN_BEFORE_SECONDS,
  SESSION_TIME_WARN_SECONDS,
  SESSION_SAFETY_MAX_SECONDS,
  shouldCutOnSilence,
  shouldForceVadCap,
  shouldFireSessionTimeChime,
  shouldHardStopSession,
  isSessionTimeWarning,
  formatSessionTimeLeft,
  sessionChimeMilestoneIndex,
  effectiveSessionSafetyMaxSeconds,
} from "@/lib/recording/segment-policy";

describe("segment-policy — 50-min rollover removed (red-before)", () => {
  test("SEGMENT_MAX_SECONDS symbol is gone from exports", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = require("@/lib/recording/segment-policy") as Record<string, unknown>;
    expect(mod.SEGMENT_MAX_SECONDS).toBeUndefined();
    expect(mod.shouldRolloverSegment).toBeUndefined();
    expect(mod.shouldFireApproachingChime).toBeUndefined();
    expect(mod.formatSegmentTimeLeft).toBeUndefined();
    expect(mod.effectiveSegmentMaxSeconds).toBeUndefined();
  });
});

describe("VAD helpers", () => {
  test("shouldCutOnSilence honors VAD_MIN_SEGMENT_SECONDS + hold", () => {
    expect(
      shouldCutOnSilence({
        segmentElapsedS: VAD_MIN_SEGMENT_SECONDS - 1,
        silenceHeldMs: VAD_SILENCE_HOLD_MS + 100,
        rmsLevel: 0,
      })
    ).toBe(false);

    expect(
      shouldCutOnSilence({
        segmentElapsedS: VAD_MIN_SEGMENT_SECONDS,
        silenceHeldMs: VAD_SILENCE_HOLD_MS - 1,
        rmsLevel: 0,
      })
    ).toBe(false);

    expect(
      shouldCutOnSilence({
        segmentElapsedS: VAD_MIN_SEGMENT_SECONDS,
        silenceHeldMs: VAD_SILENCE_HOLD_MS,
        rmsLevel: 0,
      })
    ).toBe(true);

    expect(
      shouldCutOnSilence({
        segmentElapsedS: 60,
        silenceHeldMs: VAD_SILENCE_HOLD_MS,
        rmsLevel: VAD_SILENCE_RMS_THRESHOLD,
      })
    ).toBe(false);
  });

  test("shouldForceVadCap at VAD_MAX_SEGMENT_SECONDS", () => {
    expect(shouldForceVadCap(VAD_MAX_SEGMENT_SECONDS - 1)).toBe(false);
    expect(shouldForceVadCap(VAD_MAX_SEGMENT_SECONDS)).toBe(true);
    expect(shouldForceVadCap(VAD_MAX_SEGMENT_SECONDS + 10)).toBe(true);
  });
});

describe("shouldFireSessionTimeChime — session elapsed, not segment", () => {
  test("SESSION_TIME_WARN_SECONDS is 5 min before first hour", () => {
    expect(SESSION_TIME_WARN_SECONDS).toBe(SESSION_BILLING_HOUR_SECONDS - 5 * 60);
  });

  test("fires at first hourly warn threshold when not yet fired", () => {
    expect(shouldFireSessionTimeChime(SESSION_TIME_WARN_SECONDS, -1)).toBe(true);
    expect(sessionChimeMilestoneIndex(SESSION_TIME_WARN_SECONDS)).toBe(1);
  });

  test("does not replay for the same milestone", () => {
    expect(shouldFireSessionTimeChime(SESSION_TIME_WARN_SECONDS + 60, 1)).toBe(
      false
    );
  });

  test("fires again approaching the second hour", () => {
    const secondWarn =
      2 * SESSION_BILLING_HOUR_SECONDS - SESSION_TIME_WARN_BEFORE_SECONDS;
    expect(shouldFireSessionTimeChime(secondWarn, 1)).toBe(true);
    expect(sessionChimeMilestoneIndex(secondWarn)).toBe(2);
  });

  test("does not fire before the warn window", () => {
    expect(shouldFireSessionTimeChime(SESSION_TIME_WARN_SECONDS - 1, -1)).toBe(
      false
    );
  });
});

describe("shouldHardStopSession", () => {
  test("returns false below the safety cap", () => {
    expect(shouldHardStopSession(0)).toBe(false);
    expect(shouldHardStopSession(SESSION_SAFETY_MAX_SECONDS - 1)).toBe(false);
  });

  test("returns true at and past the safety cap", () => {
    expect(shouldHardStopSession(SESSION_SAFETY_MAX_SECONDS)).toBe(true);
    expect(shouldHardStopSession(SESSION_SAFETY_MAX_SECONDS + 100)).toBe(true);
  });

  test("honors __SESSION_SAFETY_MAX_SECONDS_OVERRIDE in non-production", () => {
    const prev = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      writable: true,
      configurable: true,
    });
    (global as unknown as { window?: { __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number } }).window =
      { __SESSION_SAFETY_MAX_SECONDS_OVERRIDE: 12 };
    expect(effectiveSessionSafetyMaxSeconds()).toBe(12);
    expect(shouldHardStopSession(12)).toBe(true);
    expect(shouldHardStopSession(11)).toBe(false);
    delete (global as unknown as { window?: { __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number } })
      .window?.__SESSION_SAFETY_MAX_SECONDS_OVERRIDE;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: prev,
      writable: true,
      configurable: true,
    });
  });
});

describe("formatSessionTimeLeft + isSessionTimeWarning", () => {
  test("formatSessionTimeLeft prod copy at 5 min remaining", () => {
    expect(formatSessionTimeLeft(5 * 60)).toBe("~5 min left");
  });

  test("isSessionTimeWarning true inside 5 min of hour boundary", () => {
    expect(isSessionTimeWarning(SESSION_BILLING_HOUR_SECONDS - 60)).toBe(true);
    expect(isSessionTimeWarning(SESSION_BILLING_HOUR_SECONDS - 6 * 60)).toBe(
      false
    );
  });
});
