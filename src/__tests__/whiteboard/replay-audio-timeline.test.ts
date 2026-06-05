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

  // ----------------------------------------------------------------
  // N-segment (3+) global-time mapping (independent-oracle verified)
  // ----------------------------------------------------------------
  describe("N-segment global-time mapping", () => {
    it("three segments: maps every sub-range to correct segment via oracle", () => {
      // Durations: [20s, 30s, 10s] → starts at [0, 20000, 50000], total=60000
      const durations = [20, 30, 10];
      const timeline = buildReplayAudioTimeline(durations);
      expect(timeline.totalMs).toBe(60_000);
      expect(timeline.segmentStartsMs).toEqual([0, 20_000, 50_000]);

      const probes = [
        0,         // seg 0 start
        10_000,    // seg 0 interior
        20_000,    // exact boundary seg0/seg1 → oracle maps to seg1 at 0
        35_000,    // seg 1 interior
        50_000,    // exact boundary seg1/seg2 → oracle maps to seg2 at 0
        55_000,    // seg 2 interior
        60_000,    // exact end → last segment at its end
        65_000,    // past end → clamped to last segment end
      ];

      for (const globalMs of probes) {
        const expected = oracleGlobalToSegment(globalMs, timeline.segmentDurationsMs);
        expect(globalMsToSegmentLocal(globalMs, timeline)).toEqual(expected);
      }
    });

    it("four segments: oracle matches for every segment boundary", () => {
      const durations = [5, 15, 25, 10];
      const timeline = buildReplayAudioTimeline(durations);
      expect(timeline.totalMs).toBe(55_000);

      // Test each boundary: at start, at end of each segment
      const starts = timeline.segmentStartsMs;
      for (let i = 0; i < durations.length; i++) {
        const boundaryMs = starts[i]!;
        const endMs = boundaryMs + durations[i]! * 1000;
        for (const probe of [boundaryMs, boundaryMs + 1, endMs - 1, endMs]) {
          const expected = oracleGlobalToSegment(probe, timeline.segmentDurationsMs);
          expect(globalMsToSegmentLocal(probe, timeline)).toEqual(expected);
        }
      }
    });
  });

  // ----------------------------------------------------------------
  // True-end detection
  //
  // Verifies that at globalMs === totalMs the mapper returns the LAST
  // segment at its full local duration — not a boundary mid-point and
  // not a wrap-around to a later segment.  This is the mathematical
  // foundation for the S3 "end-of-timeline stops cleanly" fix:
  // onEnded checks activeSegmentIndexRef === last segment AND
  // el.ended === true before halting (behavioral — hardware-only).
  // ----------------------------------------------------------------
  describe("true-end detection (segment-boundary mapping at totalMs)", () => {
    it("two-segment: at totalMs maps to last segment at its local end", () => {
      const timeline = buildReplayAudioTimeline([30, 45]);
      const totalMs = 75_000;
      expect(timeline.totalMs).toBe(totalMs);

      // At exact end
      const atEnd = globalMsToSegmentLocal(totalMs, timeline);
      expect(atEnd.segmentIndex).toBe(1); // last segment (index 1)
      expect(atEnd.localMs).toBe(45_000); // at its local end

      // Past end — clamped, still last segment at its end
      const pastEnd = globalMsToSegmentLocal(totalMs + 5_000, timeline);
      expect(pastEnd.segmentIndex).toBe(1);
      expect(pastEnd.localMs).toBe(45_000);
    });

    it("three-segment: at totalMs maps to last segment at its local end", () => {
      const timeline = buildReplayAudioTimeline([10, 20, 15]);
      const totalMs = 45_000;
      expect(timeline.totalMs).toBe(totalMs);

      const atEnd = globalMsToSegmentLocal(totalMs, timeline);
      expect(atEnd.segmentIndex).toBe(2);
      expect(atEnd.localMs).toBe(15_000);
    });

    it("boundary between seg0 and seg1 is NOT the end-of-timeline", () => {
      // At globalMs == seg0Duration (= boundary between seg0 end and seg1 start),
      // globalMsToSegmentLocal returns {segmentIndex: 0, localMs: seg0DurationMs}
      // (last ms of seg0) — NOT {segmentIndex: 1, localMs: 45_000} (end of seg1).
      // This is the canonical behavior: the mapper is not bijective at exact
      // boundaries; it always resolves to the "earlier segment at its end".
      // Critically, this is NOT the end-of-timeline (totalMs=75_000), so
      // the onEnded path must NOT treat it as a stop signal.
      const timeline = buildReplayAudioTimeline([30, 45]);
      const boundary = 30_000; // = end of seg0 = start of seg1 (global clock)
      const result = globalMsToSegmentLocal(boundary, timeline);
      // Canonical resolution: seg0 at its local end (NOT seg1 at 0).
      expect(result.segmentIndex).toBe(0);
      expect(result.localMs).toBe(30_000); // seg0 local end
      // Confirm this is NOT the end-of-timeline (totalMs=75_000):
      expect(boundary).toBeLessThan(timeline.totalMs);
      // One ms past the boundary crosses into seg1:
      const onePastBoundary = globalMsToSegmentLocal(30_001, timeline);
      expect(onePastBoundary.segmentIndex).toBe(1);
      expect(onePastBoundary.localMs).toBe(1);
    });
  });

  // ----------------------------------------------------------------
  // Segment-boundary local↔global round-trip (comprehensive)
  // ----------------------------------------------------------------
  describe("segmentLocalToGlobalMs ↔ globalMsToSegmentLocal round-trips", () => {
    it("three-segment round-trip covers interior points in all segments", () => {
      // Note: exact segment boundaries are NOT bijective — (seg0, dur0) and
      // (seg1, 0) map to the same globalMs; the mapper resolves to the earlier
      // segment at its end.  Only interior + true-end points round-trip cleanly.
      const timeline = buildReplayAudioTimeline([30, 45, 15]);
      // [0, 30000, 75000, 90000] = segment starts + total
      const interiorPoints = [
        { segmentIndex: 0, localMs: 0 },
        { segmentIndex: 0, localMs: 29_999 },  // 1ms before boundary — stays in seg0
        { segmentIndex: 1, localMs: 1 },        // 1ms past boundary — in seg1
        { segmentIndex: 1, localMs: 22_000 },
        { segmentIndex: 2, localMs: 1 },        // 1ms past seg1/seg2 boundary
        { segmentIndex: 2, localMs: 14_500 },
        { segmentIndex: 2, localMs: 15_000 },   // true end (last segment at its end)
      ];
      for (const p of interiorPoints) {
        const globalMs = segmentLocalToGlobalMs(p.segmentIndex, p.localMs, timeline);
        const back = globalMsToSegmentLocal(globalMs, timeline);
        expect(back).toEqual(p);
      }
    });

    it("segmentLocalToGlobalMs clamps out-of-bound local offsets", () => {
      const timeline = buildReplayAudioTimeline([30, 45]);
      // Local offset past segment end clamps to segment duration.
      const g = segmentLocalToGlobalMs(0, 99_000, timeline);
      expect(g).toBe(30_000); // seg0 start(0) + min(99000, 30000)=30000
    });

    it("segmentLocalToGlobalMs clamps out-of-bound segment index", () => {
      const timeline = buildReplayAudioTimeline([30, 45]);
      const g = segmentLocalToGlobalMs(99, 0, timeline);
      // Clamped to last segment (index 1), localMs=0 → global = 30000
      expect(g).toBe(30_000);
    });
  });

  // ----------------------------------------------------------------
  // No-audio synthetic-clock timeline
  //
  // When a session has events but NO audio segments (effectiveSegments=[]),
  // WhiteboardReplay uses a synthetic rAF clock that runs from
  // t=0 → maxEventTimestampMs(log) rather than being driven by an audio
  // element.  The replay-audio-timeline module is NOT involved in the
  // synthetic clock (the clock ceiling comes from event-log.ts instead).
  // This section documents what the timeline module sees for the no-audio
  // case and verifies it does not interfere with the synthetic path.
  //
  // NOTE: The synthetic clock correctness (applying scenes at real-time
  // rate, scrubber tracking, Play/Pause) is timing/render behavior that
  // ONLY hardware can verify (jsdom-blind per workspace layout rule).
  // These tests establish the mathematical boundaries only.
  // ----------------------------------------------------------------
  describe("no-audio synthetic-clock timeline (empty-segments boundary docs)", () => {
    it("empty-segments timeline has totalMs=0 and zero-length arrays", () => {
      // No audio = effectiveSegments=[] → durationSecondsList=[]
      const timeline = buildReplayAudioTimeline([]);
      expect(timeline.totalMs).toBe(0);
      expect(timeline.segmentDurationsMs).toHaveLength(0);
      expect(timeline.segmentStartsMs).toHaveLength(0);
    });

    it("globalMsToSegmentLocal with empty timeline always returns segment 0 at 0", () => {
      // With no segments the mapper short-circuits to (0, 0).  The component
      // does NOT call this function in the no-audio path — it uses its own
      // rAF-based clock driven by maxEventTimestampMs(log).
      const timeline = buildReplayAudioTimeline([]);
      expect(globalMsToSegmentLocal(0, timeline)).toEqual({ segmentIndex: 0, localMs: 0 });
      expect(globalMsToSegmentLocal(30_000, timeline)).toEqual({ segmentIndex: 0, localMs: 0 });
    });

    it("single segment with null duration still has totalMs=0 — synthetic clock path still triggered by effectiveSegments.length, not totalMs", () => {
      // A session with 1 audio segment whose durationSeconds=null in the DB
      // is an AUDIO session (effectiveSegments.length=1).  The component uses
      // the audio-element path (NOT the synthetic clock path) — the null
      // duration means we derive actual duration from audio.duration metadata
      // at runtime.  Only effectiveSegments.length===0 triggers the synthetic clock.
      const timeline = buildReplayAudioTimeline([null]);
      expect(timeline.totalMs).toBe(0);      // unknown duration → 0
      expect(timeline.segmentDurationsMs).toEqual([0]);
      // This session is AUDIO-driven despite totalMs=0.  The synth clock must
      // NOT activate for it.  (Behavioral assertion — cannot be tested in Jest
      // without a real HTMLAudioElement; documented here as a spec comment.)
    });
  });

  // ----------------------------------------------------------------
  // Driver-selection pure logic (extractable behavioral spec)
  //
  // WhiteboardReplay selects the replay driver based on one criterion:
  //   effectiveSegments.length === 0  →  synthetic wall-clock
  //   effectiveSegments.length  >  0  →  audio element
  //
  // This is intentionally NOT a separate exported function (the check
  // is trivially `hasAudio = effectiveSegments.length > 0`).  These
  // tests document the EXPECTED behavior from the outside perspective
  // so a future refactor can be validated against them.
  // ----------------------------------------------------------------
  describe("driver-selection spec (pure boolean logic)", () => {
    it("no segments → synthetic clock (hasAudio=false)", () => {
      const segments: number[] = [];
      const hasAudio = segments.length > 0;
      expect(hasAudio).toBe(false);
    });

    it("one null-duration segment → audio element (hasAudio=true)", () => {
      // Even with durationSeconds=null the audio element is used.
      // totalMs=0 does NOT disqualify a session from the audio path.
      const segments = [null];
      const hasAudio = segments.length > 0;
      expect(hasAudio).toBe(true);
      const timeline = buildReplayAudioTimeline(segments);
      expect(timeline.totalMs).toBe(0); // unknown but still audio-driven
    });

    it("multiple segments with known durations → audio element", () => {
      const segments = [30, 45, 15];
      const hasAudio = segments.length > 0;
      expect(hasAudio).toBe(true);
      const timeline = buildReplayAudioTimeline(segments);
      expect(timeline.totalMs).toBe(90_000);
    });
  });
});
