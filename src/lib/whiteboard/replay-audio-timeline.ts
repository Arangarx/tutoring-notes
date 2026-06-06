/**
 * Global replay clock for multi-segment session audio.
 *
 * Segmentation is a backend concern; replay presents one continuous
 * timeline by concatenating segment durations back-to-back (no pause
 * gaps — event `t` values already use the same cumulative clock).
 */

export type ReplayAudioTimeline = {
  /** Per-segment duration in ms (non-negative integers). */
  segmentDurationsMs: readonly number[];
  /** Cumulative start time per segment: [0, d0, d0+d1, …]. */
  segmentStartsMs: readonly number[];
  /** Sum of segment durations. */
  totalMs: number;
};

const MS_PER_SEC = 1000;

/**
 * Normalize DB `durationSeconds` for timeline math.
 * Null/invalid/non-positive → 0 (caller may skip or refine from metadata).
 */
export function normalizeSegmentDurationMs(
  durationSeconds: number | null | undefined
): number {
  if (
    durationSeconds == null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return 0;
  }
  return Math.round(durationSeconds * MS_PER_SEC);
}

/**
 * Build cumulative boundaries from ordered segment durations (seconds).
 */
export function buildReplayAudioTimeline(
  durationSecondsList: readonly (number | null | undefined)[]
): ReplayAudioTimeline {
  const segmentDurationsMs = durationSecondsList.map(normalizeSegmentDurationMs);
  const segmentStartsMs: number[] = [];
  let totalMs = 0;
  for (const dur of segmentDurationsMs) {
    segmentStartsMs.push(totalMs);
    totalMs += dur;
  }
  return { segmentDurationsMs, segmentStartsMs, totalMs };
}

/**
 * Map a global replay clock (ms) to segment index + offset within segment.
 * Clamps to [0, totalMs]; past-the-end maps to the final segment at its end.
 */
export function globalMsToSegmentLocal(
  globalMs: number,
  timeline: ReplayAudioTimeline
): { segmentIndex: number; localMs: number } {
  const { segmentDurationsMs, segmentStartsMs, totalMs } = timeline;
  if (segmentDurationsMs.length === 0) {
    return { segmentIndex: 0, localMs: 0 };
  }
  if (segmentDurationsMs.length === 1) {
    const only = segmentDurationsMs[0]!;
    return {
      segmentIndex: 0,
      localMs: Math.max(0, Math.min(globalMs, only > 0 ? only : totalMs)),
    };
  }

  const clamped = Math.max(0, Math.min(globalMs, totalMs));
  let remaining = clamped;
  for (let i = 0; i < segmentDurationsMs.length; i++) {
    const dur = segmentDurationsMs[i]!;
    const isLast = i === segmentDurationsMs.length - 1;
    if (isLast || remaining <= dur) {
      return {
        segmentIndex: i,
        localMs: isLast ? remaining : Math.min(remaining, dur),
      };
    }
    remaining -= dur;
  }
  const lastIdx = segmentDurationsMs.length - 1;
  return {
    segmentIndex: lastIdx,
    localMs: segmentDurationsMs[lastIdx]!,
  };
}

/** Inverse of {@link globalMsToSegmentLocal} for a known segment + local offset. */
export function segmentLocalToGlobalMs(
  segmentIndex: number,
  localMs: number,
  timeline: ReplayAudioTimeline
): number {
  const { segmentStartsMs, segmentDurationsMs, totalMs } = timeline;
  if (segmentStartsMs.length === 0) return 0;
  const idx = Math.max(0, Math.min(segmentIndex, segmentStartsMs.length - 1));
  const start = segmentStartsMs[idx] ?? 0;
  const dur = segmentDurationsMs[idx] ?? 0;
  const local = dur > 0 ? Math.max(0, Math.min(localMs, dur)) : Math.max(0, localMs);
  return Math.min(start + local, totalMs);
}

/** Global ms from HTMLAudioElement local time in the active segment. */
export function audioLocalMsToGlobalMs(
  segmentIndex: number,
  localMs: number,
  timeline: ReplayAudioTimeline
): number {
  return segmentLocalToGlobalMs(segmentIndex, localMs, timeline);
}
