import {
  buildReplayAudioTimeline,
  globalMsToSegmentLocal,
  normalizeSegmentDurationMs,
  segmentLocalToGlobalMs,
} from "@/lib/whiteboard/replay-audio-timeline";

/** Independent oracle: walk cumulative durations (not the mapper's internals). */
function oracleGlobalToSegment(
  globalMs: number,
  durationsMs: readonly number[]
): { segmentIndex: number; localMs: number } {
  const total = durationsMs.reduce((a, b) => a + b, 0);
  const clamped = Math.max(0, Math.min(globalMs, total));
  let remaining = clamped;
  for (let i = 0; i < durationsMs.length; i++) {
    const dur = durationsMs[i]!;
    const isLast = i === durationsMs.length - 1;
    if (isLast || remaining <= dur) {
      return {
        segmentIndex: i,
        localMs: isLast ? remaining : Math.min(remaining, dur),
      };
    }
    remaining -= dur;
  }
  return { segmentIndex: 0, localMs: 0 };
}

describe("replay-audio-timeline", () => {
  describe("normalizeSegmentDurationMs", () => {
    it("converts positive seconds to ms", () => {
      expect(normalizeSegmentDurationMs(12.5)).toBe(12_500);
    });
    it("returns 0 for null, invalid, or non-positive", () => {
      expect(normalizeSegmentDurationMs(null)).toBe(0);
      expect(normalizeSegmentDurationMs(undefined)).toBe(0);
      expect(normalizeSegmentDurationMs(0)).toBe(0);
      expect(normalizeSegmentDurationMs(-1)).toBe(0);
      expect(normalizeSegmentDurationMs(Number.NaN)).toBe(0);
    });
  });

  describe("globalMsToSegmentLocal", () => {
    const cases: Array<{
      name: string;
      seconds: (number | null)[];
      globalMs: number;
    }> = [
      {
        name: "single segment mid-point",
        seconds: [60],
        globalMs: 30_000,
      },
      {
        name: "exact boundary between two segments",
        seconds: [10, 20],
        globalMs: 10_000,
      },
      {
        name: "second segment interior",
        seconds: [10, 20],
        globalMs: 25_000,
      },
      {
        name: "past end clamps to final segment end",
        seconds: [5, 5],
        globalMs: 99_000,
      },
      {
        name: "zero-duration middle segment at boundary",
        seconds: [10, 0, 15],
        globalMs: 10_000,
      },
      {
        name: "zero-duration segment — time in next segment",
        seconds: [10, 0, 15],
        globalMs: 12_000,
      },
    ];

    it.each(cases)("$name", ({ seconds, globalMs }) => {
      const timeline = buildReplayAudioTimeline(seconds);
      const expected = oracleGlobalToSegment(globalMs, timeline.segmentDurationsMs);
      expect(globalMsToSegmentLocal(globalMs, timeline)).toEqual(expected);
    });

    it("single segment: entire range stays on segment 0", () => {
      const timeline = buildReplayAudioTimeline([120]);
      expect(globalMsToSegmentLocal(0, timeline)).toEqual({
        segmentIndex: 0,
        localMs: 0,
      });
      expect(globalMsToSegmentLocal(119_999, timeline)).toEqual({
        segmentIndex: 0,
        localMs: 119_999,
      });
    });

    it("round-trips with segmentLocalToGlobalMs for interior points", () => {
      const timeline = buildReplayAudioTimeline([30, 45, 15]);
      const points = [
        { segmentIndex: 0, localMs: 1_000 },
        { segmentIndex: 1, localMs: 22_000 },
        { segmentIndex: 2, localMs: 14_500 },
      ];
      for (const p of points) {
        const globalMs = segmentLocalToGlobalMs(
          p.segmentIndex,
          p.localMs,
          timeline
        );
        expect(globalMsToSegmentLocal(globalMs, timeline)).toEqual(p);
      }
    });

    it("all-null durations (unknown): totalMs is 0, every seek maps to segment 0 localMs 0 — documenting clamp behavior used by seek-with-unknown-durations path", () => {
      // When durationSeconds is null in the DB (common for sessions created before
      // transcription), normalizeSegmentDurationMs returns 0 and totalMs=0.
      // The component's globalSegmentOffsetMsRef approach handles playback correctly;
      // seeking with null durations falls back to segment 0 at t=0 (best effort).
      const timeline = buildReplayAudioTimeline([null, null]);
      expect(timeline.totalMs).toBe(0);
      expect(timeline.segmentDurationsMs).toEqual([0, 0]);
      // With totalMs=0, any positive globalMs clamps to segment 0 at localMs 0.
      const result = globalMsToSegmentLocal(30_000, timeline);
      expect(result.segmentIndex).toBe(0);
      expect(result.localMs).toBe(0);
    });
  });
});
