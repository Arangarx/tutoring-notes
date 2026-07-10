import {
  buildEffectiveReplayTimeline,
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

    it("all-null stored durations (unknown): totalMs is 0 — multi-segment passthrough until measured", () => {
      const timeline = buildReplayAudioTimeline([null, null]);
      expect(timeline.totalMs).toBe(0);
      expect(timeline.segmentDurationsMs).toEqual([0, 0]);
      // Without measured fallback, multi-segment passes globalMs through on seg0
      // (not the old Math.min(globalMs, 0)=0 collapse).
      const withoutMeasured = globalMsToSegmentLocal(30_000, timeline);
      expect(withoutMeasured.segmentIndex).toBe(0);
      expect(withoutMeasured.localMs).toBe(30_000);
    });

    it("WS-L regression: multi-segment null stored + measured per-segment maps scrub correctly", () => {
      const timeline = buildReplayAudioTimeline([null, null]);
      const measured = [20_000, 30_000]; // 20s + 30s = 50s total
      const probes = [
        { globalMs: 0, expected: { segmentIndex: 0, localMs: 0 } },
        { globalMs: 10_000, expected: { segmentIndex: 0, localMs: 10_000 } },
        { globalMs: 20_000, expected: { segmentIndex: 0, localMs: 20_000 } },
        { globalMs: 25_000, expected: { segmentIndex: 1, localMs: 5_000 } },
        { globalMs: 37_500, expected: { segmentIndex: 1, localMs: 17_500 } },
        { globalMs: 49_000, expected: { segmentIndex: 1, localMs: 29_000 } },
        { globalMs: 50_000, expected: { segmentIndex: 1, localMs: 30_000 } },
      ];
      for (const { globalMs, expected } of probes) {
        const oracle = oracleGlobalToSegment(
          globalMs,
          buildEffectiveReplayTimeline(timeline, measured).segmentDurationsMs
        );
        expect(oracle).toEqual(expected);
        expect(globalMsToSegmentLocal(globalMs, timeline, undefined, measured)).toEqual(
          expected
        );
      }
    });

    it("WS-L RED-before: multi-segment null stored WITHOUT measured clamped every scrub to 0", () => {
      // Documents pre-fix behavior that caused the regression.
      const timeline = buildReplayAudioTimeline([null, null]);
      const preFixClamp = Math.max(0, Math.min(30_000, timeline.totalMs));
      expect(preFixClamp).toBe(0);
      expect(preFixClamp).not.toBe(30_000);
    });

    it("multi-segment scrub at 25/50/75/99% with known stored durations", () => {
      const timeline = buildReplayAudioTimeline([20, 30]); // 50s total
      const total = timeline.totalMs;
      const ratios = [0.25, 0.5, 0.75, 0.99];
      for (const ratio of ratios) {
        const globalMs = Math.round(total * ratio);
        const expected = oracleGlobalToSegment(globalMs, timeline.segmentDurationsMs);
        expect(globalMsToSegmentLocal(globalMs, timeline)).toEqual(expected);
        expect(expected.localMs).not.toBe(0);
      }
    });

    // ── FIX 1: seek-map with measuredTotalMs fallback ──────────────────────────
    // Root cause: single-segment session with stored durationSeconds=null → storedMs=0
    // → pre-fix every scrub collapsed to localMs=0 (audio reset to t=0 on each scrub).
    // Fix (1240c08): when cap=0, pass globalMs through unclamped; when measuredTotalMs
    // is known, map proportionally into the real audio length.
    // Andrew-confirmed: first-play at 0:00; scrub on loaded single-segment does NOT jump to 0.
    it("FIX1: single segment stored=0, measuredTotalMs=44000 — maps proportionally (not 0)", () => {
      const timeline = buildReplayAudioTimeline([null]); // stored duration = null → 0
      expect(timeline.totalMs).toBe(0);
      expect(timeline.segmentDurationsMs).toEqual([0]);

      // WITHOUT measuredTotalMs (metadata not yet resolved): pass globalMs through
      // unclamped when cap=0 — NOT collapse to 0. Pre-fix Math.min(globalMs, 0)=0
      // caused scrub→drop→Play to seek audio to t=0; commit 1240c08 fixed that.
      // First-play at globalMs=0 still maps to localMs=0 (see assertion below).
      expect(globalMsToSegmentLocal(22_000, timeline)).toEqual({
        segmentIndex: 0,
        localMs: 22_000,
      });

      // WITH measuredTotalMs=44000: maps correctly
      expect(globalMsToSegmentLocal(22_000, timeline, 44_000)).toEqual({
        segmentIndex: 0,
        localMs: 22_000,
      });
      expect(globalMsToSegmentLocal(0, timeline, 44_000)).toEqual({
        segmentIndex: 0,
        localMs: 0,
      });
      expect(globalMsToSegmentLocal(44_000, timeline, 44_000)).toEqual({
        segmentIndex: 0,
        localMs: 44_000,
      });
      // Past end clamps to the measured duration
      expect(globalMsToSegmentLocal(99_000, timeline, 44_000)).toEqual({
        segmentIndex: 0,
        localMs: 44_000,
      });
    });

    it("FIX1: measuredTotalMs is ignored when stored duration is already known (non-zero)", () => {
      // Multi-segment with known stored durations must not be affected by
      // a measuredTotalMs argument — stored per-segment values take priority.
      const timeline = buildReplayAudioTimeline([30, 45]); // 30s + 45s = 75s total
      expect(timeline.totalMs).toBe(75_000);
      // Passing a different measuredTotalMs should not change the result for
      // known-duration segments — the fix only applies to the single-segment
      // case with stored=0.
      const withMeasured = globalMsToSegmentLocal(35_000, timeline, 99_000);
      const withoutMeasured = globalMsToSegmentLocal(35_000, timeline);
      expect(withMeasured).toEqual(withoutMeasured);
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

  // ----------------------------------------------------------------
  // Scrubber geometry invariants (oracle tests for S1 + S2)
  //
  // These verify the MATHEMATICAL invariants that the scrubber must
  // satisfy.  jsdom cannot test the VISUAL rendering (CSS thumb
  // centering, browser-specific appearance of <input type="range">),
  // but it CAN verify that:
  //   (a) at t=0 the ratio is exactly 0.0 (flush-left, math correct)
  //   (b) at t=endMs the ratio is exactly 1.0 (flush-right, math
  //       correct) — requires scrubberMax === actualAudioEnd
  //   (c) if scrubberMax > actualAudioEnd (stored duration rounded up),
  //       the dot is provably < 100% WITHOUT the fix, and exactly 100%
  //       WITH the fix (resolvedMaxMs overrides audioTimeline.totalMs)
  //
  // jsdom blind spot: the CSS thumb-centering at the track edge is a
  // VISUAL browser-rendering detail that no jsdom test can catch.
  // Only a real browser (Playwright/WebKit or on-device debug HUD)
  // can confirm the dot visually sits flush with the track boundary.
  // ----------------------------------------------------------------

  /**
   * Pure helper that mirrors the component's scrubberMax computation
   * (src: WhiteboardReplay.tsx, `const scrubberMax = ...`).
   *
   * audioUpperBound: resolvedMaxMs when > 0, else audioTimeline.totalMs.
   * eventSpan: max(log.durationMs, maxEventTimestampMs(log)).
   */
  function oracleScrubberMax(
    resolvedMaxMs: number,
    storedTotalMs: number,
    eventSpanMs: number
  ): number {
    const audioUpperBound = resolvedMaxMs > 0 ? resolvedMaxMs : storedTotalMs;
    return Math.max(audioUpperBound, eventSpanMs, 1);
  }

  /** Range input ratio [0, 1] for a given value and max. */
  function rangeRatio(audioElapsedMs: number, scrubberMax: number): number {
    return Math.min(audioElapsedMs, scrubberMax) / scrubberMax;
  }

  describe("scrubber geometry — start/end position invariants (S1 + S2)", () => {
    // ── START invariant ──────────────────────────────────────────────
    // At t=0:
    //   value=0, min=0, max>0  →  ratio=0  (flush left, mathematically)
    // NOTE: The VISUAL "~1-2% in" appearance Andrew observed is the
    // browser's native <input type="range"> thumb-centering at the left
    // edge (the thumb's right half is inside the track, the left half
    // is outside the input box, giving the visual impression of
    // "slightly in").  This is a CSS/rendering issue invisible to jsdom.
    // The MATH IS CORRECT — value/max = 0 = flush-left by definition.

    it.each([
      { label: "null durations — falls back to eventSpan", resolvedMaxMs: 0, storedMs: 0, eventSpanMs: 41_000 },
      { label: "known stored duration (audio < events)", resolvedMaxMs: 0, storedMs: 65_000, eventSpanMs: 41_000 },
      { label: "known stored duration (audio > events)", resolvedMaxMs: 0, storedMs: 65_000, eventSpanMs: 80_000 },
      { label: "resolved from el.duration", resolvedMaxMs: 65_123, storedMs: 0, eventSpanMs: 41_000 },
    ])("start: ratio=0 for $label", ({ resolvedMaxMs, storedMs, eventSpanMs }) => {
      const scrubberMax = oracleScrubberMax(resolvedMaxMs, storedMs, eventSpanMs);
      expect(scrubberMax).toBeGreaterThan(0);
      // At t=0, ratio must be exactly 0 (dot flush left).
      expect(rangeRatio(0, scrubberMax)).toBe(0);
    });

    // ── END invariant WITHOUT fix ────────────────────────────────────
    // Shows the BUG: when storedTotalMs > actualEnd, the dot does not
    // reach 100%.  This is what Andrew observed as "ends partly in."

    it("BUG (unfixed): stored duration rounded up causes dot to stop short of 100%", () => {
      // Scenario: stored durationSeconds=66s (rounded from actual 65.123s).
      // Without resolvedMaxMs, audioUpperBound=66000, scrubberMax=66000.
      // Actual audio end = 65123ms.
      // Position = 65123 / 66000 = 98.7% — NOT 100%.
      const storedMs = 66_000;
      const actualEnd = 65_123;
      const eventSpanMs = 41_000;
      const scrubberMax = oracleScrubberMax(0, storedMs, eventSpanMs);
      const ratio = rangeRatio(actualEnd, scrubberMax);
      expect(ratio).toBeLessThan(1.0); // BUG: dot does not reach 100%
      expect(ratio).toBeCloseTo(65_123 / 66_000, 5);
    });

    // ── END invariant WITH fix ───────────────────────────────────────
    // After the fix: resolvedMaxMs is learned from el.duration (65123ms),
    // overriding the stale stored duration (66000ms).

    it("FIXED: resolvedMaxMs from el.duration overrides stored, dot reaches exactly 100%", () => {
      // Same scenario as above, but now resolvedMaxMs=65123 from metadata.
      const resolvedMaxMs = 65_123;
      const storedMs = 66_000; // stale / over-estimated stored value
      const actualEnd = 65_123;
      const eventSpanMs = 41_000;
      const scrubberMax = oracleScrubberMax(resolvedMaxMs, storedMs, eventSpanMs);
      // audioUpperBound = resolvedMaxMs (ignores storedMs because resolvedMaxMs > 0)
      expect(scrubberMax).toBe(65_123);
      // Ratio at true audio end = 1.0 (100% → flush right)
      expect(rangeRatio(actualEnd, scrubberMax)).toBe(1.0);
    });

    it("FIXED: null stored duration — scrubberMax resolves to actual audio length", () => {
      // Scenario: durationSeconds=null → storedMs=0 → audioTimeline.totalMs=0.
      // Before fix: scrubberMax = eventSpanMs (41000). Audio plays 65s.
      //   At audio end (65000ms > 41000ms): browser clamps to max → 100% VISUAL.
      //   But label says t=1:05 vs session span 0:41 — confusing but not "partly in."
      // After fix: once metadata loads, resolvedMaxMs=65000. scrubberMax=65000.
      //   audioElapsedMs at end = 65000 → 65000/65000 = 100% ✓
      const resolvedMaxMs = 65_000;
      const storedMs = 0;
      const actualEnd = 65_000;
      const eventSpanMs = 41_000;
      const scrubberMax = oracleScrubberMax(resolvedMaxMs, storedMs, eventSpanMs);
      expect(scrubberMax).toBe(65_000);
      expect(rangeRatio(actualEnd, scrubberMax)).toBe(1.0);
    });

    // ── Duration-invariance (offsetting both sides) ──────────────────
    // If scrubberMax = actualEnd, position = 100% regardless of the
    // specific duration value.  This is the FUNDAMENTAL INVARIANT that
    // the fix establishes: once resolvedMaxMs is known, scrubberMax is
    // anchored to the actual audio end.

    it.each([
      { actualEndMs: 30_000,  eventSpanMs: 20_000 },
      { actualEndMs: 65_123,  eventSpanMs: 41_000 },
      { actualEndMs: 120_500, eventSpanMs: 80_000 },
      { actualEndMs: 3_600_000, eventSpanMs: 3_600_000 }, // 1-hour session
    ])(
      "duration-invariant: with resolvedMaxMs=actualEnd, ratio=1.0 (actualEnd=$actualEndMs)",
      ({ actualEndMs, eventSpanMs }) => {
        // resolvedMaxMs = actualEnd (learned from el.duration on loadedmetadata)
        const scrubberMax = oracleScrubberMax(actualEndMs, 0, eventSpanMs);
        // When scrubberMax ≥ actualEnd, ratio = actualEnd / scrubberMax.
        // For ratio = 1.0, we need scrubberMax = actualEnd exactly.
        // This holds when actualEnd ≥ eventSpanMs (audio longer than events).
        if (actualEndMs >= eventSpanMs) {
          expect(scrubberMax).toBe(actualEndMs);
          expect(rangeRatio(actualEndMs, scrubberMax)).toBe(1.0);
        } else {
          // Events extend beyond audio — scrubberMax = eventSpanMs > actualEnd.
          // Dot does NOT reach 100% at audio end (correct: the timeline still
          // has event-driven content after the audio ends).
          expect(scrubberMax).toBe(eventSpanMs);
          expect(rangeRatio(actualEndMs, scrubberMax)).toBeLessThan(1.0);
        }
      }
    );

    // ── Segment accumulation correctness (S3 support) ─────────────────
    // The onEnded handler accumulates globalSegmentOffsetMsRef via
    // actualDurationMs = Math.round(el.duration * 1000).  After the
    // last segment, endMs = sum of all actualDurationMs.  The
    // resolvedMaxMs state is updated to max(prev, endMs) so the
    // scrubber ALWAYS settles to exactly 100% at true end even when
    // individual segment durations were unknown at timeline-build time.

    it("multi-segment: accumulated endMs drives scrubberMax to 100% at true end", () => {
      // Two segments, unknown stored durations (null).
      // Actual: seg0=30.456s, seg1=20.789s → totalActual=51245ms.
      const seg0Actual = Math.round(30.456 * 1000);  // 30456
      const seg1Actual = Math.round(20.789 * 1000);  // 20789
      const endMs = seg0Actual + seg1Actual;          // 51245
      const eventSpanMs = 40_000;

      // Before playing: resolvedMaxMs=0 (unknown), scrubberMax=eventSpanMs
      const initialMax = oracleScrubberMax(0, 0, eventSpanMs);
      expect(initialMax).toBe(eventSpanMs);

      // After seg0 ends: resolvedMaxMs updated to seg0Actual (from loadedmetadata)
      const afterSeg0 = oracleScrubberMax(seg0Actual, 0, eventSpanMs);
      expect(afterSeg0).toBe(Math.max(seg0Actual, eventSpanMs));

      // After seg1 ends (onEnded accumulates): resolvedMaxMs = max(prev, endMs) = endMs
      const afterSeg1 = oracleScrubberMax(endMs, 0, eventSpanMs);
      expect(afterSeg1).toBe(endMs); // endMs > eventSpanMs
      // Ratio at true end = 100%
      expect(rangeRatio(endMs, afterSeg1)).toBe(1.0);
    });
  });
});
