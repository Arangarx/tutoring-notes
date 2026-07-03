"use client";

import { useEffect, useRef, useCallback } from "react";
import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";
import { useReplayTimelineController } from "@/hooks/useReplayTimelineController";
import type { ReplayAudioSegment } from "@/lib/whiteboard/replay-helpers";
import { formatReplayDurationMs } from "@/lib/whiteboard/replay-helpers";
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
  /**
   * In-shell review toggles hero↔replay via CSS while keeping this component
   * mounted. When false, entry auto-play is suppressed and state resets.
   */
  isReviewActive?: boolean;
};

export function WhiteboardReplayInFrame({
  eventsBlobUrl,
  audioSegments,
  audioBlobUrl,
  audioMimeType,
  whiteboardSessionId,
  studentName,
  embedded = false,
  onHideReplay,
  isReviewActive = true,
}: WhiteboardReplayInFrameProps) {
  const applySceneAtRef = useRef<(timeMs: number) => void>(() => {});
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const entryPaintDoneRef = useRef(false);
  /**
   * Guard for FIX 2: prevents `onHideReplay` from being called before the
   * replay surface has completed its initial paint cycle.
   *
   * Root cause (before FIX 1): the play-loop stack overflow (RangeError) crashed
   * JavaScript inside a React effect during the first mount, causing React to
   * recover in a way that rapidly toggled reviewSurface between "replay" and
   * "hero". FIX 1 breaks the recursion. This ref adds a belt-and-suspenders
   * guard so that even if some future edge case causes an error during mount,
   * the "hide" callback cannot fire until the component has settled.
   */
  const replaySettledRef = useRef(false);

  // Reset both gates when the events URL changes (new session loaded without
  // a full unmount).
  useEffect(() => {
    entryPaintDoneRef.current = false;
    replaySettledRef.current = false;
  }, [eventsBlobUrl]);
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
    pause,
    togglePlay,
    handleScrubPointerDown,
    handleScrubChange,
    handleScrubPointerUp,
    setPaintReady,
    volume,
    muted,
    handleVolumeChange,
    toggleMute,
  } = controller;

  // Pause audio before collapsing back to notes-hero so the audio doesn't
  // continue playing when the replay surface is visually hidden.
  const handleHideReplay = useCallback(() => {
    // Belt-and-suspenders guard: only propagate if the component has settled
    // past its initial paint cycle (replaySettledRef becomes true after the
    // entry paint effect runs). This prevents any edge-case crash during mount
    // from inadvertently triggering the hero↔replay loop (FIX 2).
    if (!replaySettledRef.current) return;
    entryPaintDoneRef.current = false;
    replaySettledRef.current = false;
    pause();
    seek(0, { paint: false, play: false });
    onHideReplay?.();
  }, [pause, seek, onHideReplay]);

  // Reset entry auto-play when replay is hidden (hero↔replay CSS toggle).
  useEffect(() => {
    if (isReviewActive) return;
    entryPaintDoneRef.current = false;
    replaySettledRef.current = false;
    pause();
    seek(0, { paint: false, play: false });
  }, [isReviewActive, pause, seek]);

  useEffect(() => {
    if (!isReviewActive) return;
    if (loadState.kind !== "ready" || !log) return;
    if (entryPaintDoneRef.current) return;
    if (!replayExcaliRestoreReady) return;
    const needsCanvas = log.events.length > 0 || hasAudio;
    if (!needsCanvas) {
      setPaintReady(true);
      entryPaintDoneRef.current = true;
      replaySettledRef.current = true;
      return;
    }
    seek(0, { paint: true, play: true });
    entryPaintDoneRef.current = true;
    replaySettledRef.current = true;
  }, [
    hasAudio,
    loadState.kind,
    log,
    replayExcaliRestoreReady,
    seek,
    setPaintReady,
    isReviewActive,
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
      volume={volume}
      muted={muted}
      onVolumeChange={handleVolumeChange}
      onToggleMute={toggleMute}
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
    studentName,
    // Use the controller's scrubberMax (recording timeline total) so the
    // header duration agrees with the scrubber — not the wall-clock session
    // duration from the DB which includes idle time (FIX 2).
    // Hide until we have a real value (scrubberMax starts at 1).
    durationLabel: scrubberMax > 1 ? formatReplayDurationMs(scrubberMax) : undefined,
    onHideReplay: handleHideReplay,
    canvas: replayCanvas,
    timelineStrip,
    nonVisualMounts:
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
          {formatReplayDurationMs(Math.max(log.durationMs, maxEventTimestampMs(log)))}
        </div>
      )}
    </div>
  );
}
