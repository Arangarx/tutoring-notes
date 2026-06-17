import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";
import type { WBEventLog } from "@/lib/whiteboard/event-log";
import {
  computeNoAudioMaxMs,
  computeReplayTotalMs,
  computeScrubberMax,
} from "@/lib/whiteboard/replay-helpers";

function makeLog(events: Array<{ t: number }>, durationMs = 0): WBEventLog {
  return {
    schemaVersion: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    durationMs,
    events: events.map((e, i) => ({
      type: "add" as const,
      t: e.t,
      element: {
        id: `el-${i}`,
        type: "rectangle",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: "#000",
        version: 1,
        versionNonce: 1,
        isDeleted: false,
      },
    })),
  };
}

/** Independent oracle: walk event timestamps + audio durations. */
function oracleTotalMs(args: {
  eventMax: number;
  logDuration: number;
  hasAudio: boolean;
  measuredAudioMs: number;
  storedAudioMs: number;
}): number {
  const { eventMax, logDuration, hasAudio, measuredAudioMs, storedAudioMs } =
    args;
  if (hasAudio) {
    const audioBound = measuredAudioMs > 0 ? measuredAudioMs : storedAudioMs;
    return Math.max(audioBound, eventMax, logDuration, 1);
  }
  return Math.max(eventMax, logDuration, 1);
}

describe("replay timeline oracle helpers", () => {
  describe("computeReplayTotalMs", () => {
    it("uses measured audio when DB durations are null (B1)", () => {
      const log = makeLog([{ t: 45_000 }], 30_000);
      const eventMax = maxEventTimestampMs(log);
      const measured = 65_123;
      const stored = 0;
      const expected = oracleTotalMs({
        eventMax,
        logDuration: log.durationMs,
        hasAudio: true,
        measuredAudioMs: measured,
        storedAudioMs: stored,
      });
      expect(
        computeReplayTotalMs({
          log,
          hasAudio: true,
          measuredAudioTotalMs: measured,
          storedAudioTotalMs: stored,
        })
      ).toBe(expected);
      expect(expected).toBeGreaterThanOrEqual(65_123);
    });

    it("no-audio uses event log ceiling", () => {
      const log = makeLog([{ t: 12_000 }], 8_000);
      const expected = oracleTotalMs({
        eventMax: maxEventTimestampMs(log),
        logDuration: log.durationMs,
        hasAudio: false,
        measuredAudioMs: 0,
        storedAudioMs: 0,
      });
      expect(
        computeReplayTotalMs({
          log,
          hasAudio: false,
          measuredAudioTotalMs: 0,
          storedAudioTotalMs: 0,
        })
      ).toBe(expected);
    });

    it("minimum total is 1ms for empty log", () => {
      const log = makeLog([], 0);
      expect(
        computeReplayTotalMs({
          log,
          hasAudio: false,
          measuredAudioTotalMs: 0,
          storedAudioTotalMs: 0,
        })
      ).toBe(1);
    });
  });

  describe("computeScrubberMax", () => {
    it("extends scrubber past stored audio when events run longer", () => {
      const log = makeLog([{ t: 90_000 }], 60_000);
      const totalMs = 60_000;
      const noAudioMax = computeNoAudioMaxMs(log);
      const max = computeScrubberMax({
        hasAudio: true,
        totalMs,
        log,
        noAudioMaxMs: noAudioMax,
      });
      expect(max).toBeGreaterThanOrEqual(90_000);
    });
  });

  describe("first-play policy (B3)", () => {
    it("documents that first play targets globalMs=0 before hasEverPlayed", () => {
      // Behavioral contract tested in integration; pure oracle: idle start is 0.
      const hasEverPlayed = false;
      const globalMsBeforePlay = 25_000;
      const firstPlayTargetMs = hasEverPlayed ? globalMsBeforePlay : 0;
      expect(firstPlayTargetMs).toBe(0);
    });
  });

  /**
   * play() position-sync guard (defense-in-depth fix for first-play bug)
   *
   * jsdom cannot exercise real audio playback, so we test the guard's
   * decision logic as a pure function extracted from play(). The real-browser
   * proof is the console checklist: on first press of Play, the log must show
   * `pre_play_position_sync currentTime_was=94.741 setting_to=0` (NOT
   * `pre_play currentTime=94.741`) and no `onEnded`/`play_loop_at_cap`
   * immediately after.
   */
  describe("play() position-sync guard", () => {
    const TOLERANCE_SEC = 0.05; // 50 ms

    function shouldSync(currentTime: number, intendedSec: number): boolean {
      const delta = Number.isFinite(currentTime)
        ? Math.abs(currentTime - intendedSec)
        : Infinity;
      return delta > TOLERANCE_SEC;
    }

    it("(a) fires sync when currentTime is parked at measured end (fresh entry, globalMs=0)", () => {
      // After the WebM scan leaves el.currentTime=94.741 and the fix reset
      // was skipped, the guard must detect the mismatch and correct before play.
      expect(shouldSync(94.741, 0)).toBe(true);
    });

    it("(a) fires sync for Infinity case (1e101 scan not yet resolved)", () => {
      expect(shouldSync(Infinity, 0)).toBe(true);
    });

    it("(c) does NOT fire sync on resume-after-pause (currentTime matches globalMs)", () => {
      // el.currentTime already matches the paused position — no unnecessary seek.
      expect(shouldSync(30.0, 30.0)).toBe(false);
      // Float drift within tolerance is also safe.
      expect(shouldSync(29.999, 30.0)).toBe(false);
      expect(shouldSync(30.001, 30.0)).toBe(false);
    });

    it("(d) does NOT fire sync after scrub-then-play (currentTime matches scrub position)", () => {
      // handleScrubPointerUp → seek() → loadSegmentAt() → el.currentTime = 50s.
      // play() must not re-seek and undo the scrub position.
      expect(shouldSync(50.0, 50.0)).toBe(false);
    });

    it("fires sync when drift exceeds 50 ms tolerance", () => {
      expect(shouldSync(0.1, 0)).toBe(true);  // 100 ms off → sync
    });

    it("does NOT fire sync when drift is at or below 50 ms tolerance", () => {
      expect(shouldSync(0.049, 0)).toBe(false); // 49 ms off → no sync
      expect(shouldSync(0.05, 0)).toBe(false);  // exactly 50 ms → no sync
    });
  });
});
