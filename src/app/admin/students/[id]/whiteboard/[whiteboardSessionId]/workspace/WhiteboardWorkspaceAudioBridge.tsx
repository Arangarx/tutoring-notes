"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";
import type { AudioCapturePolicy } from "@/lib/recording/audio-capture-policy";
import RecordingControlPanel from "@/components/recording/RecordingControlPanel";
import {
  getOrCreateUploadOutbox,
  type OutboxObserverState,
} from "@/lib/recording/upload-outbox-instance";

/**
 * Phase 1b reshape of the workspace audio bridge.
 *
 * Pre-Phase-1b the bridge tracked in-flight Promises in a parent ref
 * (the Phase 0c poll shim). With the upload outbox now owning every
 * segment from MediaRecorder.stop() through endWhiteboardSession,
 * "is anything pending?" is a question for the outbox, not for the
 * workspace component.
 *
 * This component now:
 *   1. Subscribes to `outbox.observe(whiteboardSessionId)`.
 *   2. Combines the outbox state with the audio recorder hook's
 *      state (which is the source of truth for "the hook is
 *      currently uploading a freshly-stopped MediaRecorder buffer").
 *   3. Exposes a stable `getState()` to the End-session flow and
 *      keeps `waitForPendingUploads()` for backward compatibility
 *      with tests / future surfaces — but the End button itself
 *      uses `outbox.drainAndAwait` directly (Commit 7) so this
 *      handle is mostly a debug + transitional anchor.
 *
 * Multi-stream from day one: the observer state already exposes
 * `byStream` per (streamId -> count) so a future copy update can
 * say "Saving 1 of your mic + 2 of student's mic" without changing
 * the bridge's signature. Phase 4 will read that map.
 */
export type WhiteboardWorkspaceAudioBridgeState = {
  /**
   * Coarse state used by the End button copy + finalization gate.
   *
   *   - `idle`         — nothing in flight; the End button can call
   *                      drainAndAwait immediately (no-op) + finalize.
   *   - `recording`    — MediaRecorder is hot.
   *   - `uploading`    — `useAudioRecorder` is uploading the most
   *                      recent segment (between MediaRecorder.stop
   *                      and outbox.enqueue).
   *   - `registering`  — outbox has rows uploaded + awaiting the
   *                      atomic end-session action.
   *   - `failed`       — at least one row hit the permanent-fail cap
   *                      OR `useAudioRecorder` surfaced an error.
   */
  kind: "idle" | "recording" | "uploading" | "registering" | "failed";
  /** Total in-flight + queued segments visible to the End button. */
  inFlightCount: number;
  /** Per-stream breakdown — Phase 4 surfaces use this. */
  inFlightByStream: ReadonlyMap<string, number>;
  /** Last error surfaced by the hook OR the outbox worker. */
  lastError: string | null;
};

type Props = {
  /** Shared `useAudioRecorder` instance — same hook feeds this bridge and the visible panel. */
  audio: UseAudioRecorderReturn;
  /**
   * Whiteboard session id this bridge belongs to. Phase 1b: passed
   * down by the workspace client so the bridge can scope its outbox
   * observation. Required.
   */
  whiteboardSessionId: string;
  userWantsRecording: boolean;
  recordingActive: boolean;
  /** Block B: when "none", never start or resume capture. Defaults to "full". */
  audioCapturePolicy?: AudioCapturePolicy;
  /** Disables standalone Start (etc.) — e.g. until the workspace toolbar arms recording. */
  panelDisabled?: boolean;
  /**
   * When false (default on live board), orchestration-only — no visible
   * RecordingControlPanel. Mic device/level live in top-bar popover.
   */
  showPanel?: boolean;
  /**
   * Tutor workspace: forwards mic picker to `useLiveAV.setMicDevice` for
   * WebRTC `replaceTrack` + recorder graph swap.
   */
  onMicDeviceChange?: (deviceId: string) => void | Promise<void>;
};

export type WhiteboardWorkspaceAudioBridgeHandle = {
  /**
   * Resolves once neither the hook nor the outbox has work pending
   * for this session. Caps at 30s like the Phase 0c shim did so a
   * stuck worker still surfaces a timeout to the End button.
   *
   * Most call sites should prefer `outbox.drainAndAwait(...)`
   * directly (the End-session flow does so in Commit 7); this is
   * here for tests + backward compat with anything that already
   * grabs the bridge ref.
   */
  waitForPendingUploads: () => Promise<void>;
  getState: () => WhiteboardWorkspaceAudioBridgeState;
};

/**
 * Whiteboard audio: orchestrates pause/resume/start against presence flags using
 * the host's `useAudioRecorder` instance, renders the same `RecordingControlPanel`
 * as the recorder tab, and surfaces outbox + hook state to the End-session flow.
 */
export const WhiteboardWorkspaceAudioBridge = forwardRef<
  WhiteboardWorkspaceAudioBridgeHandle,
  Props
>(function WhiteboardWorkspaceAudioBridge(
  {
    audio,
    whiteboardSessionId,
    userWantsRecording,
    recordingActive,
    audioCapturePolicy = "full",
    panelDisabled,
    onMicDeviceChange,
    showPanel = false,
  },
  ref
) {
  const audioRef = useRef(audio);
  audioRef.current = audio;

  // Live outbox observer state. We keep it in component state (not a
  // bare ref) so a parent that reads getState() inside a useEffect
  // dependency sees the freshest snapshot — and so React DevTools
  // can render the value for debug. The state object itself is
  // returned by the outbox as an immutable snapshot, so storing it
  // directly is safe.
  const [outboxState, setOutboxState] = useState<OutboxObserverState>({
    state: "idle",
    inFlightStreamCount: 0,
    byStream: new Map<string, number>(),
    lastError: null,
  });

  useEffect(() => {
    // Guard SSR: outbox throws if indexedDB is unavailable. The
    // workspace shell never SSRs (it's "use client") but a future
    // page that imports this file from an RSC by mistake should
    // fail loudly rather than mid-render.
    if (typeof window === "undefined") return;
    const outbox = getOrCreateUploadOutbox();
    const obs = outbox.observe(whiteboardSessionId);
    // Synchronously seed from the current snapshot so the End button
    // doesn't flash a stale "idle" when the bridge first mounts mid-
    // session (e.g. after a refresh).
    setOutboxState(obs.getState());
    const unsubscribe = obs.subscribe((next) => {
      setOutboxState(next);
    });
    return unsubscribe;
  }, [whiteboardSessionId]);

  // Same start/pause/resume orchestration as Phase 0c — no change
  // here; the outbox is downstream of the hook's onRecorded callback.
  useEffect(() => {
    const a = audioRef.current;
    if (!userWantsRecording || audioCapturePolicy === "none") {
      if (a.state === "recording" || a.state === "paused") {
        a.stopAndUpload("final");
      }
      return;
    }
    if (!recordingActive) {
      if (a.state === "recording") {
        a.pauseRecording();
      }
      return;
    }
    if (a.state === "ready") {
      void a.handleStartRecording();
    } else if (a.state === "paused") {
      a.resumeRecording();
    } else if (a.state === "done" || a.state === "error") {
      a.handleReset();
    }
  }, [userWantsRecording, recordingActive, audioCapturePolicy, audio.state]);

  // Stable handle. `useImperativeHandle`'s dep array intentionally
  // omits outboxState — the closure reads through audioRef + the
  // outbox singleton each call, so we don't need to rebind on every
  // state tick (and rebinding would tear down + reattach the parent's
  // ref callback for no benefit).
  useImperativeHandle(
    ref,
    () => ({
      waitForPendingUploads: async () => {
        if (typeof window === "undefined") return;
        const outbox = getOrCreateUploadOutbox();
        // 30s cap matches the Phase 0c shim. End-session flow uses
        // its own narrower drainAndAwait; this is for tests / debug.
        const result = await outbox.drainAndAwait(whiteboardSessionId, {
          timeoutMs: 30_000,
        });
        if (result.timedOut) {
          console.warn(
            `[WhiteboardWorkspaceAudioBridge] wbsid=${whiteboardSessionId} waitForPendingUploads timed out remaining=${result.remainingCount}`
          );
        }
      },
      getState: (): WhiteboardWorkspaceAudioBridgeState => {
        const a = audioRef.current;
        return composeBridgeState(a, outboxState);
      },
    }),
    [whiteboardSessionId, outboxState]
  );

  if (!showPanel) {
    return null;
  }

  return (
    <RecordingControlPanel
      recorder={audio}
      disabled={panelDisabled}
      onMicDeviceChange={onMicDeviceChange}
    />
  );
});

/**
 * Pure composition of the hook + outbox states into the surface the
 * End button reads. Extracted so unit tests can exercise the rollup
 * matrix without React.
 *
 * Precedence (highest first):
 *   1. Hook recording → bridge state "recording".
 *   2. Hook uploading → "uploading" (uploads happen BEFORE the outbox
 *      enqueue, so the outbox knows nothing about this segment yet —
 *      hand the End button a coherent count by adding 1 to the
 *      outbox's in-flight count).
 *   3. Outbox state "failed" → "failed".
 *   4. Outbox state "uploading" → "uploading" (post-enqueue retries).
 *   5. Outbox state "registering" → "registering" (waiting for End).
 *   6. Else → "idle".
 */
export function composeBridgeState(
  audio: UseAudioRecorderReturn,
  outbox: OutboxObserverState
): WhiteboardWorkspaceAudioBridgeState {
  const hookUploading = audio.state === "uploading";
  const hookRecording = audio.state === "recording";
  const hookErrored = audio.state === "error";
  const hookContribCount = hookUploading ? 1 : 0;
  const lastError = audio.error ?? outbox.lastError;
  if (hookRecording) {
    return {
      kind: "recording",
      inFlightCount: outbox.inFlightStreamCount,
      inFlightByStream: outbox.byStream,
      lastError,
    };
  }
  if (hookUploading) {
    return {
      kind: "uploading",
      inFlightCount: outbox.inFlightStreamCount + hookContribCount,
      inFlightByStream: outbox.byStream,
      lastError,
    };
  }
  if (outbox.state === "failed" || hookErrored) {
    return {
      kind: "failed",
      inFlightCount: outbox.inFlightStreamCount,
      inFlightByStream: outbox.byStream,
      lastError,
    };
  }
  if (outbox.state === "uploading") {
    return {
      kind: "uploading",
      inFlightCount: outbox.inFlightStreamCount,
      inFlightByStream: outbox.byStream,
      lastError,
    };
  }
  if (outbox.state === "registering") {
    return {
      kind: "registering",
      inFlightCount: 0,
      inFlightByStream: outbox.byStream,
      lastError,
    };
  }
  return {
    kind: "idle",
    inFlightCount: 0,
    inFlightByStream: new Map<string, number>(),
    lastError,
  };
}
