"use client";

import { useEffect, useRef } from "react";
import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";
import { useReplayTimelineController } from "@/hooks/useReplayTimelineController";
import type { ReplayAudioSegment } from "@/lib/whiteboard/replay-helpers";
import { LiveBoardChrome } from "@/components/whiteboard/chrome/LiveBoardChrome";
import { useWbLayoutMode } from "@/components/whiteboard/chrome/useWbLayoutMode";
import { WbRoleProvider } from "@/components/whiteboard/chrome/wb-role";
import { ReplayCanvasSurface } from "@/components/whiteboard/replay/ReplayCanvasSurface";
import { buildReplayReadOnlyChromeSlots } from "@/components/whiteboard/replay/ReplayReadOnlyChromeSlots";
import { ReplayTimelineScrubber } from "@/components/whiteboard/replay/ReplayTimelineScrubber";

export type WhiteboardReplayInFrameProps = {
  eventsBlobUrl: string;
  audioSegments?: readonly ReplayAudioSegment[] | null;
  audioBlobUrl?: string | null;
  audioMimeType?: string | null;
  whiteboardSessionId?: string;
  studentName?: string;
  durationSeconds?: number | null;
  /** When true, fills parent frame instead of viewport-fixed chrome. */
  embedded?: boolean;
  /** Collapse in-frame replay back to notes-prominent layout. */
  onHideReplay?: () => void;
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
  embedded = false,
  onHideReplay,
}: WhiteboardReplayInFrameProps) {
  const applySceneAtRef = useRef<(timeMs: number) => void>(() => {});
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const entryPaintDoneRef = useRef(false);
  const { layoutMode, orientation } = useWbLayoutMode();

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
    togglePlay,
    handleScrubPointerDown,
    handleScrubChange,
    handleScrubPointerUp,
    setPaintReady,
  } = controller;

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
        className="wb-replay-in-frame-loading"
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

  const timelineStrip = (
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
  );

  const replayCanvas = needsReplayExcalCanvas ? (
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
      className="wb-replay-canvas-host"
    />
  ) : (
    <div className="muted" style={{ padding: 24 }}>
      No board content to replay.
    </div>
  );

  const chromeSlots = buildReplayReadOnlyChromeSlots({
    layoutMode,
    studentName,
    durationLabel: formatDuration(durationSeconds),
    onHideReplay,
    canvas: replayCanvas,
    timelineStrip,
    nonVisualMounts:
      hasAudio ? (
        <audio
          ref={audioRef}
          controls={false}
          preload="metadata"
          {...(replayAudioMime ? { type: replayAudioMime } : {})}
          data-testid="wb-replay-audio"
          style={{ display: "none" }}
        />
      ) : undefined,
  });

  return (
    <div
      data-testid="wb-replay-in-frame"
      className={`mynk-wb-replay-root${embedded ? " mynk-wb-replay-root--embedded" : ""}`}
    >
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
      <WbRoleProvider role="tutor">
        <LiveBoardChrome
          chromeMode="replay"
          layoutMode={layoutMode}
          orientation={orientation}
          role="tutor"
          toolbarHidden={false}
          {...chromeSlots}
        />
      </WbRoleProvider>
      {!embedded && (
        <div className="mynk-wb-replay-meta muted" style={{ fontSize: 11, padding: "4px 8px" }}>
          {log.events.length.toLocaleString()} events · log span{" "}
          {formatDuration(
            Math.floor(Math.max(log.durationMs, maxEventTimestampMs(log)) / 1000)
          )}
        </div>
      )}
    </div>
  );
}
