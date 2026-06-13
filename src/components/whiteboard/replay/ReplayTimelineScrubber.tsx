"use client";

import { formatReplayDurationMs } from "@/lib/whiteboard/replay-helpers";

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
        <input
          type="range"
          min={0}
          max={scrubberMax}
          value={clampedValue}
          data-testid="wb-replay-global-seek"
          aria-label="Replay position"
          className="mynk-wb-replay-timeline__seek"
          onPointerDown={onScrubPointerDown}
          onChange={(ev) => onScrubChange(Number(ev.target.value))}
          onPointerUp={(ev) =>
            onScrubPointerUp(Number((ev.target as HTMLInputElement).value))
          }
        />
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
