"use client";

import { formatReplayDurationMs } from "@/lib/whiteboard/replay-helpers";
import { WbCustomSlider } from "@/components/whiteboard/chrome/WbCustomSlider";

export type ReplayTimelineScrubberProps = {
  globalMs: number;
  scrubberMax: number;
  playing: boolean;
  hasAudio: boolean;
  audioReady: boolean;
  onTogglePlay: () => void;
  onScrubPointerDown: () => void;
  onScrubChange: (ms: number) => void;
  onScrubPointerUp: (ms: number) => void;
};

export function ReplayTimelineScrubber({
  globalMs,
  scrubberMax,
  playing,
  hasAudio,
  audioReady,
  onTogglePlay,
  onScrubPointerDown,
  onScrubChange,
  onScrubPointerUp,
}: ReplayTimelineScrubberProps) {
  const clampedValue = Math.min(globalMs, scrubberMax);
  const maxMs = Math.max(scrubberMax, 1);

  return (
    <div
      className="mynk-wb-replay-timeline"
      data-testid="wb-replay-timeline-strip"
    >
      <div className="mynk-wb-replay-timeline__controls">
        <button
          type="button"
          className="btn"
          data-testid="wb-replay-play-toggle"
          style={{ minWidth: 72 }}
          onClick={onTogglePlay}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <div className="mynk-wb-replay-timeline__seek-wrap">
          <WbCustomSlider
            value={clampedValue}
            min={0}
            max={maxMs}
            step={Math.max(1, Math.round(maxMs / 1000))}
            ariaLabel="Replay position"
            testId="wb-replay-global-seek"
            thumbTestId="wb-replay-global-seek-thumb"
            className="mynk-wb-replay-timeline__seek"
            onPointerDown={onScrubPointerDown}
            onChange={onScrubChange}
            onPointerUp={onScrubPointerUp}
          />
        </div>
        <span
          className="muted mynk-wb-replay-timeline__elapsed"
          style={{ fontSize: 11 }}
        >
          {formatReplayDurationMs(clampedValue)} /{" "}
          {formatReplayDurationMs(scrubberMax)}
        </span>
      </div>
      {hasAudio && !audioReady && (
        <span className="muted" style={{ fontSize: 11 }}>
          Audio loading… you can press Play once it&apos;s ready.
        </span>
      )}
    </div>
  );
}
