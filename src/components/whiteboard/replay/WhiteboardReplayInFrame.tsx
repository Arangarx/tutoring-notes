"use client";

import { useEffect, useRef } from "react";
import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";
import { useReplayTimelineController } from "@/hooks/useReplayTimelineController";
import type { ReplayAudioSegment } from "@/lib/whiteboard/replay-helpers";
import { ReplayBoardChrome } from "@/components/whiteboard/replay/ReplayBoardChrome";
import { ReplayCanvasSurface } from "@/components/whiteboard/replay/ReplayCanvasSurface";
import { ReplayTimelineScrubber } from "@/components/whiteboard/replay/ReplayTimelineScrubber";

export type WhiteboardReplayInFrameProps = {
  eventsBlobUrl: string;
  audioSegments?: readonly ReplayAudioSegment[] | null;
  audioBlobUrl?: string | null;
  audioMimeType?: string | null;
  whiteboardSessionId?: string;
  studentName?: string;
  durationSeconds?: number | null;
  reviewHref?: string;
  onBackToNotes?: () => void;
  notesDrawerToggle?: React.ReactNode;
  drawerSlot?: React.ReactNode;
};

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function WhiteboardReplayInFrame({
  eventsBlobUrl,
  audioSegments,
  audioBlobUrl,
  audioMimeType,
  whiteboardSessionId,
  studentName,
  durationSeconds,
  reviewHref,
  onBackToNotes,
  notesDrawerToggle,
  drawerSlot,
}: WhiteboardReplayInFrameProps) {
  const applySceneAtRef = useRef<(timeMs: number) => void>(() => {});
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const entryPaintDoneRef = useRef(false);

  const controller = useReplayTimelineController({
    eventsBlobUrl,
    audioSegments,
    audioBlobUrl,
    audioMimeType,
    whiteboardSessionId,
    applySceneAtRef,
  });

  const {
    loadState,
    log,
    hasAudio,
    effectiveSegments,
    activeSegment,
    replayAudioMime,
    replayExcaliRestoreReady,
    audioReady,
    audioRef,
    globalMs,
    scrubberMax,
    playing,
    paintReady,
    resolveAssetUrl,
    seek,
    pause,
    togglePlay,
    handleScrubPointerDown,
    handleScrubChange,
    handleScrubPointerUp,
    setPaintReady,
  } = controller;

  // B2: paint t=0 before reveal on first ready
  useEffect(() => {
    if (loadState.kind !== "ready" || !log) return;
    if (entryPaintDoneRef.current) return;
    if (!replayExcaliRestoreReady) return;
    const needsCanvas = log.events.length > 0 || hasAudio;
    if (!needsCanvas) {
      setPaintReady(true);
      entryPaintDoneRef.current = true;
      return;
    }
    seek(0, { paint: true, play: false });
    entryPaintDoneRef.current = true;
  }, [
    hasAudio,
    loadState.kind,
    log,
    replayExcaliRestoreReady,
    seek,
    setPaintReady,
  ]);

  if (loadState.kind === "loading") {
    return (
      <div
        className="card"
        style={{ padding: 24, textAlign: "center" }}
        data-testid="wb-replay-in-frame-loading"
      >
        <div className="muted">Loading whiteboard recording…</div>
      </div>
    );
  }

  if (loadState.kind === "error") {
    return (
      <div
        role="alert"
        className="card"
        style={{ padding: 16 }}
        data-testid="wb-replay-in-frame-error"
      >
        Could not load whiteboard recording: {loadState.message}
      </div>
    );
  }

  if (!log) return null;

  if (log.events.length === 0 && !hasAudio) {
    return (
      <div className="card" style={{ padding: 16 }} data-testid="wb-replay-empty">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          No whiteboard activity was recorded for this session.
        </p>
      </div>
    );
  }

  const needsReplayExcalCanvas = log.events.length > 0 || hasAudio;
  const multiSegment = effectiveSegments.length > 1;

  const topBar = (
    <div className="mynk-wb-topbar mynk-wb-replay-topbar">
      <div className="mynk-wb-topbar__zone" style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          Session replay
          {studentName ? ` — ${studentName}` : ""}
        </span>
        {durationSeconds != null && (
          <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
            {formatDuration(durationSeconds)}
          </span>
        )}
      </div>
      <div className="mynk-wb-topbar__zone" style={{ gap: 8 }}>
        {notesDrawerToggle}
        {onBackToNotes && (
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12 }}
            data-testid="wb-replay-back-to-notes"
            onClick={() => {
              pause();
              onBackToNotes();
            }}
          >
            Back to notes
          </button>
        )}
        {reviewHref && (
          <a href={reviewHref} className="btn" style={{ fontSize: 12 }}>
            Open full replay
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div data-testid="wb-replay-in-frame" className="mynk-wb-replay-root">
      {multiSegment && (
        <div
          className="mynk-wb-replay-multi-segment-chip"
          data-testid="wb-replay-multi-segment-notice"
          style={{
            fontSize: 11,
            padding: "4px 8px",
            background: "var(--warning-soft)",
            borderBottom: "1px solid var(--warning-border)",
          }}
        >
          Multi-part recording — timing may drift at part boundaries
        </div>
      )}
      <ReplayBoardChrome
        nonVisualMounts={
          hasAudio ? (
            <audio
              ref={audioRef}
              controls={false}
              preload="metadata"
              src={effectiveSegments[0]?.url}
              {...(replayAudioMime ? { type: replayAudioMime } : {})}
              data-testid="wb-replay-audio"
              style={{ display: "none" }}
            />
          ) : undefined
        }
        topBar={topBar}
        canvas={
          needsReplayExcalCanvas ? (
            <ReplayCanvasSurface
              log={log}
              hasAudio={hasAudio}
              restoreReady={replayExcaliRestoreReady}
              paintReady={paintReady}
              whiteboardSessionId={whiteboardSessionId}
              resolveAssetUrl={resolveAssetUrl}
              applySceneAtRef={applySceneAtRef}
              containerRef={canvasContainerRef}
              gateVisibility
              style={{ height: "100%", minHeight: 280 }}
            />
          ) : (
            <div className="muted" style={{ padding: 24 }}>
              No board content to replay.
            </div>
          )
        }
        timelineStrip={
          <ReplayTimelineScrubber
            globalMs={globalMs}
            scrubberMax={scrubberMax}
            playing={playing}
            hasAudio={hasAudio}
            audioReady={audioReady}
            onTogglePlay={togglePlay}
            onScrubPointerDown={handleScrubPointerDown}
            onScrubChange={handleScrubChange}
            onScrubPointerUp={handleScrubPointerUp}
          />
        }
        drawerSlot={drawerSlot}
      />
      <div className="muted" style={{ fontSize: 11, padding: "4px 8px" }}>
        {(log.events.length).toLocaleString()} events · log span{" "}
        {formatDuration(
          Math.floor(
            Math.max(log.durationMs, maxEventTimestampMs(log)) / 1000
          )
        )}
      </div>
    </div>
  );
}
