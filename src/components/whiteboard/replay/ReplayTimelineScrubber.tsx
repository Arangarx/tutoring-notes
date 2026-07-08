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
  /** Current volume (0–1). Only rendered when hasAudio. */
  volume?: number;
  /** Whether audio is muted. Only rendered when hasAudio. */
  muted?: boolean;
  onVolumeChange?: (v: number) => void;
  onToggleMute?: () => void;
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
  volume = 1,
  muted = false,
  onVolumeChange,
  onToggleMute,
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
          className="mynk-wb-replay-play-btn"
          data-testid="wb-replay-play-toggle"
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
        {hasAudio && onVolumeChange && onToggleMute && (
          <div
            className="mynk-wb-replay-timeline__volume"
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <button
              type="button"
              className="btn btn--ghost"
              data-testid="wb-replay-mute-toggle"
              style={{ minWidth: 32, padding: "0 6px", fontSize: 14 }}
              title={muted ? "Unmute" : "Mute"}
              onClick={onToggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? "🔇" : volume <= 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
            </button>
            <div style={{ width: 64 }}>
              <WbCustomSlider
                value={muted ? 0 : volume}
                min={0}
                max={1}
                step={0.05}
                ariaLabel="Volume"
                testId="wb-replay-volume-slider"
                thumbTestId="wb-replay-volume-slider-thumb"
                className="mynk-wb-replay-timeline__volume-slider"
                onChange={onVolumeChange}
              />
            </div>
          </div>
        )}
      </div>
      {hasAudio && !audioReady && (
        <span className="muted" style={{ fontSize: 11 }}>
          Audio loading… you can press Play once it&apos;s ready.
        </span>
      )}
    </div>
  );
}
