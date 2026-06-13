"use client";

/**
 * Recorder lifecycle hook for the in-browser audio capture flow.
 *
 * Owns every ref + state + side-effect that previously lived inline in
 * AudioRecordInput. The shell component is now thin — destructure this hook
 * and pick a subview based on `state`.
 *
 * Invariants preserved verbatim from the pre-refactor recorder. Do not
 * "clean up" without re-reading the comment next to each one:
 *
 *  - iOS Safari MP4 fragmentation guard: `recorder.start()` is called with
 *    NO timeslice argument. Chunked output (start(1000)) makes iOS Safari
 *    emit fragmented MP4 pieces that don't concatenate into a playable /
 *    Whisper-decodable file.
 *  - StrictMode double-mount guard: per-effect `cancelled` flag PLUS a
 *    `streamRef.current` short-circuit. Do not introduce a module-level
 *    "already attempted" ref — that pattern blocks the legitimate
 *    post-remount auto-acquire after the parent re-keys this component.
 *  - Rollover keeps the mic hot: `stopAndUpload("rollover")` skips
 *    `teardownMicStream()` until after the segment uploads (or fails).
 *    Tearing down mid-rollover prompts iOS for permission again.
 *  - The meter is driven by direct DOM writes via `meterBarRef`, never via
 *    setState. A meter that re-rendered 60×/sec would kill mid-drag slider
 *    gestures and burn CPU.
 *  - The 1s timer's auto-rollover branch is single-shot per segment via
 *    `rolloverInProgressRef`. Without it, two timer ticks at the boundary
 *    can both call `stopAndUpload("rollover")`.
 *  - Gapless rollover (B5): on auto-rollover we PRE-WARM a second
 *    MediaRecorder on the same mic stream BEFORE calling .stop() on the
 *    current one. The old recorder's chunks are snapshotted to a LOCAL
 *    array and its ondataavailable handler is rebound to push into that
 *    local — otherwise the late "final flush" dataavailable that fires on
 *    .stop() would land in the NEW recorder's chunksRef and corrupt the
 *    next segment. Without the pre-warm there is a ~3-5s silent gap
 *    while the browser finalizes the WebM/MP4 container (this was
 *    Sarah's "4-second cutoff between recordings" report).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadAudioDirect } from "@/lib/recording/upload";
import { formatUserFacingActionError } from "@/lib/action-correlation";
import { createMicAudioGraph, type MicAudioGraph } from "@/lib/mic-recorder-audio";
import { chooseMimeType, fileExtension } from "@/lib/recording/mime";
import {
  SEGMENT_MAX_SECONDS,
  SESSION_SAFETY_MAX_SECONDS,
  WARN_SEGMENT_SECONDS,
  effectiveWarnSegmentSeconds,
  shouldFireApproachingChime,
  shouldHardStopSession,
  shouldRolloverSegment,
} from "@/lib/recording/segment-policy";
import {
  playApproachingMaxTimeChime,
  playSegmentRolloverChime,
} from "@/lib/recording/chimes";
import {
  CHIME_VOL_DEFAULT,
  GAIN_DEFAULT,
  loadStoredChimeEnabled,
  loadStoredChimeVolume,
  loadStoredDeviceId,
  loadStoredGain,
  saveStoredChimeEnabled,
  saveStoredChimeVolume,
  saveStoredDeviceId,
  saveStoredGain,
} from "@/lib/recording/storage";
import {
  queryMicPermission,
  type MicPermissionState,
} from "@/lib/recording/permissions";
import { uploadAudioWithRetry } from "@/lib/recording/upload";
import {
  ACTIVE_STATES,
  type RecordState,
  type UploadMode,
} from "@/lib/recording/recording-state";
import {
  draftRowKey,
  getOrCreateRecordingDraftStore,
} from "@/lib/recording/recording-draft-store";

/** Draft checkpoint interval (W1 Surface 1) — matches design cadence. */
const DRAFT_CHECKPOINT_INTERVAL_MS = 30_000;
/** MediaRecorder timeslice when draft durability is enabled (iOS may not fire — see PLATFORM-ASSUMPTIONS §8.1). */
const DRAFT_TIMESLICE_MS = 30_000;

export type RecordedAudio = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
  previewUrl?: string;
  /**
   * Local Blob the hook captured before uploading. Phase 1b: the
   * workspace's outbox writes this into IndexedDB so a crash AFTER
   * upload succeeds but BEFORE the atomic end-session action runs
   * never loses the recovery anchor. Recorder-tab consumers ignore
   * this field (their `onRecorded` keeps the URL as the source of
   * truth). Optional + backward-compatible.
   */
  blob?: Blob;
};

export type UseAudioRecorderOptions = {
  studentId: string;
  /**
   * `autoRollover` when a segment was auto-saved mid-session; parent should
   * append without remounting the recorder.
   *
   * May return a Promise — when it does, the hook's onstop chain `await`s it
   * so callers that need to drain side-effects (e.g. enqueue into the
   * workspace's IndexedDB upload outbox before End-session drains) can
   * synchronize via `flushPendingUploads()` below. Sync `void` returns are
   * still accepted for the recorder-tab consumer that just appends to state.
   */
  onRecorded: (
    audio: RecordedAudio,
    meta?: { autoRollover?: boolean }
  ) => void | Promise<void>;
  /** Called whenever the recording active state changes (acquiring/ready/recording/paused/uploading = true). */
  onRecordingActive?: (active: boolean) => void;
  /**
   * Seed the displayed timer with an already-elapsed second count so the
   * recording timer stays in sync with a server-persisted session timer
   * after a page refresh. The hook still counts forward from this seed;
   * the value is only applied once at mount.
   *
   * In the workspace, pass `Math.floor(initialActiveMs / 1000)` so that
   * after a refresh the recording timer resumes at the session's
   * already-elapsed time rather than restarting from 0.
   */
  initialElapsedSeconds?: number;
  /**
   * Same value as live-A/V `avx=` / whiteboard session id — threads into
   * `mic-recorder-audio` swap logs.
   */
  avLogSessionId?: string;
  /**
   * When set (whiteboard workspace), checkpoint in-progress chunks to the
   * separate recording-draft IndexedDB store every 30s, on stop, and on
   * page hide. Recorder-tab consumers omit this.
   */
  recordingDraft?: {
    sessionId: string;
    streamId: string;
  };
  /**
   * TEST-ONLY: inject a fake MicAudioGraph so unit tests can control
   * the frame clock without a real AudioContext.
   */
  _graphOverride?: MicAudioGraph;
  /**
   * Called when the recording watchdog detects a potential stall or
   * empty rollover segment.
   */
  onWatchdogAlert?: (type: "stall" | "empty-rollover") => void;
};

export type UseAudioRecorderReturn = {
  // FSM-derived state
  state: RecordState;
  uploadMode: UploadMode;

  // Timer / segment info
  elapsed: number;
  segmentNumber: number;
  doneSegmentSeconds: number;
  /**
   * The raw mic MediaStream while recording is active (non-null from
   * the moment getUserMedia succeeds until teardown). Expose this so
   * callers that need to share the same hardware mic — e.g. the live
   * A/V hook — can clone the stream instead of calling getUserMedia a
   * second time. Two simultaneous getUserMedia streams from the same
   * device trigger Chrome's shared audio-processing pipeline in a way
   * that suppresses the source signal in both streams via echo
   * cancellation cross-talk.
   */
  localMicStream: MediaStream | null;

  /**
   * Add a remote audio MediaStream (typically a `useLiveAV` participant's
   * audioStream) to the recording mixdown. Returns an unsubscribe that
   * detaches the remote stream from the mix.
   *
   * Always safe to call. If the audio graph hasn't been built yet (mic
   * not acquired) the call is a no-op and the unsubscribe is harmless.
   * The caller (workspace) is responsible for re-invoking once the graph
   * is ready — gating on `localMicStream != null` is the canonical
   * pattern.
   *
   * The remote stream's lifecycle is NOT owned by this hook. We do not
   * stop its tracks on detach or dispose; the WebRTC layer owns that.
   */
  addRemoteAudio: (stream: MediaStream) => () => void;

  /**
   * Live-update the per-remote-stream gain used in the recording
   * mixdown (Phase 4d Commit 7 — per-peer moderation restore).
   * Pass `0` to silence a participant from the recording while
   * keeping their audio audible in live A/V playback; pass `1` to
   * restore full volume.
   *
   * No-op when the stream is not currently attached via
   * `addRemoteAudio`, OR when the audio graph is not yet built
   * (mic not acquired). Idempotent: calling with the same gain
   * multiple times is safe.
   */
  setRemoteRecordingGain: (stream: MediaStream, gainLinear: number) => void;

  // Mic + prefs
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  gainLinear: number;
  setGainLinear: (n: number) => void;
  chimeEnabled: boolean;
  setChimeEnabled: (b: boolean) => void;
  chimeVolume: number;
  setChimeVolume: (n: number) => void;
  permissionState: MicPermissionState;

  // Errors
  error: string | null;

  // Derived UI flags
  /** Mic is hot — controls enabled, meter live. */
  isLive: boolean;
  /** Mic device picker locked only during mid-rollover segment upload. */
  lockDevice: boolean;
  /** Show the "approaching segment cap" warning copy + colour. */
  isWarning: boolean;

  // Refs
  /** The shell wires this to the meter <div> so the rAF loop can write to it. */
  meterBarRef: React.RefObject<HTMLDivElement | null>;

  // Actions
  handleStartRecording: () => Promise<void> | void;
  handleDeviceChange: (deviceId: string) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopAndUpload: (mode?: "final" | "rollover") => void;
  handleReset: () => void;
  /**
   * Resolves when every in-flight `recorder.onstop → upload → onRecorded`
   * chain spawned by this hook has settled (success OR failure).
   *
   * Why this exists: `recorder.onstop` runs asynchronously from
   * `stopAndUpload`, and the workspace's End-session flow needs to wait
   * for the trailing segment to be enqueued into the upload outbox
   * BEFORE it drains the outbox. Without this, the race is:
   *
   *   handleEndSession → setUserWantsRecording(false) → drainOutbox (empty
   *     → returns immediately) → endWhiteboardSession({segments:[]}) →
   *     finalize → THEN MediaRecorder.onstop finally fires, uploads, calls
   *     onRecorded, enqueues into outbox, which then deletes itself
   *     because the session is already ended.
   *
   * Net result: the final audio segment never lands in the DB even though
   * the upload succeeded. This was the Phase 1b smoke regression.
   *
   * Returns immediately when no uploads are tracked (i.e. mic was never
   * armed for this session). Safe to call multiple times — the internal
   * set drains and stays drained.
   */
  flushPendingUploads: () => Promise<void>;
  /** Hot-swap the mic while the Web Audio graph is live (workspace + live A/V). */
  swapMicDevice: (deviceId: string) => Promise<void>;
  /**
   * Frame-accurate, pause-aware audio clock. Returns elapsed
   * recording-active milliseconds. Cumulative across auto-rollovers.
   * Backed by the frame-counting node in the Web Audio graph.
   */
  getAudioMs: () => number;
};

/** Decide bar colour by level — green/yellow/red zones for visible feedback. */
function meterColor(level: number): string {
  if (level >= 0.85) return "var(--color-error)";
  if (level >= 0.5) return "var(--meter-loud)";
  if (level >= 0.05) return "var(--color-success)";
  return "var(--color-muted)";
}

export function useAudioRecorder({
  studentId,
  onRecorded,
  onRecordingActive,
  initialElapsedSeconds = 0,
  avLogSessionId,
  recordingDraft,
  _graphOverride,
  onWatchdogAlert,
}: UseAudioRecorderOptions): UseAudioRecorderReturn {
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(initialElapsedSeconds);
  const [error, setError] = useState<string | null>(null);
  const [localMicStream, setLocalMicStream] = useState<MediaStream | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [gainLinear, setGainLinear] = useState<number>(GAIN_DEFAULT);
  // SSR-safe defaults; the real localStorage values are read in the mount
  // effect below. Reading localStorage from the useState initializer would
  // produce a different value on the server (no localStorage = default) than
  // on the client (saved user preference), which React 19 surfaces as a
  // hydration mismatch on the chime volume slider's `--chime-pct` style.
  const [chimeEnabled, setChimeEnabled] = useState<boolean>(true);
  const [chimeVolume, setChimeVolume] = useState<number>(CHIME_VOL_DEFAULT);
  /** Current segment index (1-based) — increments on auto-rollover. */
  const [segmentNumber, setSegmentNumber] = useState(1);
  /** `segment` = saving mid-session without tearing down the mic; `final` = full-screen upload. */
  const [uploadMode, setUploadMode] = useState<UploadMode>(null);
  /** Duration shown on the success card after Stop & save (last segment only). */
  const [doneSegmentSeconds, setDoneSegmentSeconds] = useState(0);
  /** Last-known mic permission state, used only to pick the right hint copy. */
  const [permissionState, setPermissionState] = useState<MicPermissionState>("unknown");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const graphRef = useRef<MicAudioGraph | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(initialElapsedSeconds);
  const rafRef = useRef<number | null>(null);
  const meterBarRef = useRef<HTMLDivElement | null>(null);
  /** Tracks the latest meter colour so we don't thrash style.background every frame. */
  const meterColorRef = useRef<string>(meterColor(0));
  /** One audible "approaching max time" cue per recording (not on pause/resume timer restarts). */
  const approachingCapSoundPlayedRef = useRef(false);
  /** Wall-clock session length across auto-rollovers (for safety cap). */
  const totalSessionElapsedRef = useRef(0);
  /** Prevents double-firing auto-rollover from the 1s timer. */
  const rolloverInProgressRef = useRef(false);
  const chimeEnabledRef = useRef(chimeEnabled);
  const chimeVolumeRef = useRef(chimeVolume);
  /** Latest segmentNumber, read by stopAndUpload's onstop closure to avoid stale state. */
  const segmentNumberRef = useRef(segmentNumber);
  /**
   * In-flight upload+onRecorded chains. Each onstop callback (final OR
   * rollover) registers a Promise here that resolves only after its
   * `await onRecorded(...)` returns — i.e. after the consumer has fully
   * handled the segment (e.g. enqueued it into the workspace's outbox).
   *
   * Read by `flushPendingUploads()`; consumed by the End-session flow.
   *
   * Bounded: each entry removes itself in `.finally`. The set can hold
   * multiple Promises briefly during a rollover (old segment uploading
   * concurrent with the new recorder running) but never grows
   * unboundedly — we only add one entry per onstop fire.
   */
  const pendingUploadsRef = useRef<Set<Promise<void>>>(new Set());
  /** Stable segment id for the current MediaRecorder segment (draft + outbox dedupe on recovery). */
  const segmentIdForDraftRef = useRef<string | null>(null);
  const draftCheckpointIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const firstChunkMsRef = useRef<number | null>(null);
  /**
   * True when at least one intermediate `ondataavailable` arrived while the
   * recorder was in the `recording` state (timeslice path). iOS Safari may
   * never set this — stop-only checkpoint still runs on `stop()`.
   */
  const timesliceDataReceivedRef = useRef(false);
  const draftPagehideHandlerRef = useRef<(() => void) | null>(null);
  const draftVisibilityHandlerRef = useRef<(() => void) | null>(null);
  const graphOverrideRef = useRef(_graphOverride);
  graphOverrideRef.current = _graphOverride;
  const onWatchdogAlertRef = useRef(onWatchdogAlert);
  onWatchdogAlertRef.current = onWatchdogAlert;
  /** Cumulative ms from completed segments (rollover boundaries). */
  const sessionAudioMsRef = useRef(0);
  /**
   * Raw frame-clock ms captured at recording-start (or rollover-start) for
   * each segment. readAudioClockMs() = sessionAudioMsRef + (rawFrameClockMs() - baseline).
   * null before recording begins; set to rawFrameClockMs() at frameClockSetActive(true).
   * ≤47ms of AAC priming offset is accepted at each boundary (within 250ms budget for
   * <6 segments per session).
   */
  const segmentPrimingBaselineRef = useRef<number | null>(null);
  const watchdogLastFrameMsRef = useRef(0);
  const watchdogLastChunkCountRef = useRef(0);
  const watchdogInitializedRef = useRef(false);
  /**
   * Last-resort perf.now fallback — engaged ONLY when the audio graph
   * reports `hasFrameClock === false` (both AudioWorklet and
   * ScriptProcessorNode failed to init, e.g. iOS CSP blocks the
   * `blob:` URL). The fallback mirrors the frame-clock gate:
   * `accumulated` advances only while recording-active; freezes on
   * pause and rollover (just like the real frame counter).
   *
   * CRITICAL: this path must NEVER engage when a real frame source is
   * available — that would reintroduce the pre-1b performance.now drift.
   * The guard `graphRef.current?.hasFrameClock === false` (strict false,
   * not falsy) is the only gate.
   */
  const perfNowFallbackRef = useRef<{
    accumulated: number;
    lastActivatedAt: number | null;
  }>({ accumulated: 0, lastActivatedAt: null });

  /**
   * Synchronously add a deferred Promise to `pendingUploadsRef` and
   * return a resolver. Used by `stopAndUpload` and
   * `rolloverSegmentGapless` to pre-register tracking BEFORE the
   * browser fires `recorder.onstop` — otherwise a caller that
   * immediately awaits `flushPendingUploads()` after `stopAndUpload()`
   * sees an empty set (onstop hasn't fired yet), returns instantly,
   * and races past the trailing segment.
   *
   * The errored-recorder-state branches (recorder is `inactive`, or
   * we bail with an empty blob) MUST call the returned resolver
   * themselves or `flushPendingUploads()` would hang.
   *
   * Design tradeoff: an earlier draft kept the registration inline
   * with the onstop body (one closure, no helper). That was simpler
   * but had the synchronisation bug above — the smoke test re-
   * surfaced the Phase 1b race after we shipped it. Splitting
   * "register" from "settle" makes the timing explicit and easy to
   * audit.
   */
  function registerPendingStop(): {
    settle: () => void;
    promise: Promise<void>;
  } {
    let settle!: () => void;
    const promise: Promise<void> = new Promise((resolve) => {
      settle = resolve;
    });
    pendingUploadsRef.current.add(promise);
    void promise.finally(() => {
      pendingUploadsRef.current.delete(promise);
    });
    return { settle, promise };
  }

  function rawFrameClockMs(): number {
    // LAST-RESORT path: graph is present but has no frame-counting node.
    // Use the perf.now accumulator (gated on recording-active) so WB events
    // never stamp at t=0. This path must NOT engage when hasFrameClock is
    // true — the strict `=== false` guard prevents accidental drift.
    if (graphRef.current?.hasFrameClock === false) {
      const fb = perfNowFallbackRef.current;
      const liveMs =
        fb.lastActivatedAt !== null
          ? performance.now() - fb.lastActivatedAt
          : 0;
      return fb.accumulated + liveMs;
    }
    return graphRef.current?.frameClockGetMs?.() ?? 0;
  }

  function perfNowFallbackActivate(): void {
    if (graphRef.current?.hasFrameClock !== false) return;
    perfNowFallbackRef.current.lastActivatedAt = performance.now();
  }

  function perfNowFallbackDeactivate(): void {
    if (graphRef.current?.hasFrameClock !== false) return;
    const fb = perfNowFallbackRef.current;
    if (fb.lastActivatedAt !== null) {
      fb.accumulated += performance.now() - fb.lastActivatedAt;
      fb.lastActivatedAt = null;
    }
  }

  function readAudioClockMs(): number {
    const raw = rawFrameClockMs();
    const baseline = segmentPrimingBaselineRef.current;
    if (baseline === null) {
      return Math.floor(sessionAudioMsRef.current);
    }
    return Math.floor(sessionAudioMsRef.current + raw - baseline);
  }

  function resetSegmentAudioClockState(): void {
    segmentPrimingBaselineRef.current = null;
    perfNowFallbackRef.current = { accumulated: 0, lastActivatedAt: null };
    watchdogLastFrameMsRef.current = 0;
    watchdogLastChunkCountRef.current = 0;
    watchdogInitializedRef.current = false;
  }

  function commitSessionAudioMsAtRollover(): void {
    sessionAudioMsRef.current = readAudioClockMs();
    segmentPrimingBaselineRef.current = null;
  }

  function startRecorderWithDraftPolicy(recorder: MediaRecorder): void {
    if (!recordingDraft) {
      recorder.start();
      return;
    }
    const mime = recorder.mimeType || chooseMimeType() || "";
    const mightBeIOS = mime.startsWith("audio/mp4");
    if (mightBeIOS) {
      recorder.start();
      console.warn(
        `[useAudioRecorder] rid=${avLogSessionId ?? "?"} event=ios-no-timeslice mimeType=${recorder.mimeType}`
      );
    } else {
      try {
        recorder.start(DRAFT_TIMESLICE_MS);
      } catch {
        recorder.start();
      }
    }
  }

  function wireRecorderOnDataAvailable(
    recorder: MediaRecorder,
    targetChunks: Blob[] = chunksRef.current
  ): void {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        targetChunks.push(e.data);
        if (recordingDraft) {
          if (firstChunkMsRef.current === null) {
            firstChunkMsRef.current = Date.now();
          }
          if (recorder.state === "recording") {
            timesliceDataReceivedRef.current = true;
          }
        }
      }
    };
  }

  function runWatchdogCheck(): void {
    const alert = onWatchdogAlertRef.current;
    if (!alert) return;
    const recorderState = mediaRecorderRef.current?.state;
    if (recorderState !== "recording") return;
    const currentFrameMs = readAudioClockMs();
    const currentChunkCount = chunksRef.current.length;
    if (!watchdogInitializedRef.current) {
      watchdogLastFrameMsRef.current = currentFrameMs;
      watchdogLastChunkCountRef.current = currentChunkCount;
      watchdogInitializedRef.current = true;
      return;
    }
    if (
      currentFrameMs === watchdogLastFrameMsRef.current &&
      currentChunkCount === watchdogLastChunkCountRef.current
    ) {
      console.warn(
        `[useAudioRecorder] rid=${avLogSessionId ?? "?"} event=watchdog-stall frameMs=${currentFrameMs} chunks=${currentChunkCount}`
      );
      alert("stall");
    }
    watchdogLastFrameMsRef.current = currentFrameMs;
    watchdogLastChunkCountRef.current = currentChunkCount;
  }

  async function flushPendingUploads(): Promise<void> {
    // Drain until stable. A consumer's `onRecorded` could in principle
    // kick off another upload (e.g. retry), so we re-check the set
    // after each wait. Capped at 10 iterations as a safety valve —
    // beyond that we log and return rather than spin forever.
    for (let i = 0; i < 10; i += 1) {
      if (pendingUploadsRef.current.size === 0) return;
      await Promise.allSettled(Array.from(pendingUploadsRef.current));
    }
    if (pendingUploadsRef.current.size > 0) {
      console.warn(
        "[useAudioRecorder] flushPendingUploads: drain loop did not converge",
        { remaining: pendingUploadsRef.current.size }
      );
    }
  }

  useEffect(() => {
    chimeEnabledRef.current = chimeEnabled;
  }, [chimeEnabled]);
  useEffect(() => {
    chimeVolumeRef.current = chimeVolume;
  }, [chimeVolume]);
  useEffect(() => {
    segmentNumberRef.current = segmentNumber;
  }, [segmentNumber]);

  // Load persisted prefs after mount (avoid SSR/hydration mismatch).
  // chime values are loaded here too — see the chime useState declarations
  // above for why initialising them from localStorage causes a hydration
  // mismatch on the volume slider's `--chime-pct` CSS variable.
  useEffect(() => {
    setGainLinear(loadStoredGain());
    setSelectedDeviceId(loadStoredDeviceId());
    setChimeEnabled(loadStoredChimeEnabled());
    setChimeVolume(loadStoredChimeVolume());
  }, []);

  useEffect(() => {
    saveStoredChimeEnabled(chimeEnabled);
  }, [chimeEnabled]);

  useEffect(() => {
    saveStoredChimeVolume(chimeVolume);
  }, [chimeVolume]);

  // Notify parent whenever the active state changes.
  useEffect(() => {
    onRecordingActive?.(ACTIVE_STATES.includes(recordState));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordState]);

  // Live gain updates while graph is active; persist value.
  useEffect(() => {
    saveStoredGain(gainLinear);
    graphRef.current?.setGain(gainLinear);
  }, [gainLinear]);

  // Acquire mic on mount unless permission is already denied. The user opened
  // the Record tab — that's a clear intent signal, the same as opening Google
  // Meet's join page. We let the browser show its prompt if needed (state =
  // "prompt" or "unknown"). On "denied" we stay idle so we don't fire a
  // getUserMedia call that we know will reject and pollute the console.
  //
  // StrictMode-safe: in dev React mounts effects twice. We use a per-effect
  // `cancelled` flag (the first run bails after its cleanup fires) plus a
  // `streamRef.current` short-circuit (the second run won't double-acquire if
  // the first already succeeded). No module/instance-level "already attempted"
  // ref — that pattern blocks the legitimate post-remount auto-acquire after
  // the parent re-keys this component on save.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = await queryMicPermission();
      if (cancelled) return;
      setPermissionState(permission);
      if (permission === "denied") return;
      if (streamRef.current) return; // already acquired (e.g. StrictMode race)
      await acquireMic({
        deviceId: loadStoredDeviceId() || undefined,
        forRecording: false,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopTimer();
      teardownMicStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mintDraftSegmentId(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function clearDraftCheckpointScheduling() {
    if (draftCheckpointIntervalRef.current) {
      clearInterval(draftCheckpointIntervalRef.current);
      draftCheckpointIntervalRef.current = null;
    }
    if (typeof window !== "undefined") {
      if (draftPagehideHandlerRef.current) {
        window.removeEventListener("pagehide", draftPagehideHandlerRef.current);
        draftPagehideHandlerRef.current = null;
      }
      if (draftVisibilityHandlerRef.current) {
        document.removeEventListener(
          "visibilitychange",
          draftVisibilityHandlerRef.current
        );
        draftVisibilityHandlerRef.current = null;
      }
    }
  }

  async function checkpointDraftToStore(): Promise<void> {
    if (!recordingDraft || typeof window === "undefined") return;
    const segmentId = segmentIdForDraftRef.current;
    if (!segmentId) return;
    const chunks = chunksRef.current;
    if (chunks.length === 0) return;
    try {
      const mimeType =
        mediaRecorderRef.current?.mimeType || chooseMimeType() || "audio/webm";
      const store = getOrCreateRecordingDraftStore();
      await store.checkpoint({
        key: draftRowKey(recordingDraft.sessionId, recordingDraft.streamId),
        sessionId: recordingDraft.sessionId,
        streamId: recordingDraft.streamId,
        segmentId,
        mimeType,
        chunks: [...chunks],
        chunkCount: chunks.length,
        firstChunkMs: firstChunkMsRef.current ?? Date.now(),
        lastChunkMs: Date.now(),
        checkpointedAt: Date.now(),
        estimatedDurationSec: elapsedRef.current,
      });
    } catch (err) {
      console.warn("[useAudioRecorder] recording draft checkpoint failed:", err);
    }
  }

  function startDraftCheckpointScheduling() {
    if (!recordingDraft || typeof window === "undefined") return;
    clearDraftCheckpointScheduling();
    draftCheckpointIntervalRef.current = setInterval(() => {
      void checkpointDraftToStore();
      runWatchdogCheck();
    }, DRAFT_CHECKPOINT_INTERVAL_MS);
    const onPageHide = () => {
      void checkpointDraftToStore();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void checkpointDraftToStore();
      }
    };
    draftPagehideHandlerRef.current = onPageHide;
    draftVisibilityHandlerRef.current = onVisibilityChange;
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopMeter() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Reset the bar to empty/grey via the ref (no re-render).
    if (meterBarRef.current) {
      meterBarRef.current.style.width = "0%";
      meterBarRef.current.style.background = meterColor(0);
    }
    meterColorRef.current = meterColor(0);
  }

  function teardownMicStream() {
    clearDraftCheckpointScheduling();
    stopMeter();
    const g = graphRef.current;
    if (g && g !== graphOverrideRef.current) {
      g.dispose();
    }
    graphRef.current = graphOverrideRef.current ?? null;
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    setLocalMicStream(null);
  }

  function startTimer() {
    stopTimer();
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      totalSessionElapsedRef.current += 1;
      setElapsed(elapsedRef.current);

      if (
        shouldFireApproachingChime(
          elapsedRef.current,
          approachingCapSoundPlayedRef.current
        )
      ) {
        approachingCapSoundPlayedRef.current = true;
        const vol = chimeEnabledRef.current ? chimeVolumeRef.current : 0;
        playApproachingMaxTimeChime(vol);
      }

      // Safety valve: very long continuous sessions (timer pauses when recording is paused).
      if (
        shouldHardStopSession(totalSessionElapsedRef.current) &&
        !rolloverInProgressRef.current
      ) {
        rolloverInProgressRef.current = true;
        stopAndUpload("final");
        return;
      }

      if (
        shouldRolloverSegment(elapsedRef.current) &&
        !rolloverInProgressRef.current
      ) {
        rolloverInProgressRef.current = true;
        const vol = chimeEnabledRef.current ? chimeVolumeRef.current : 0;
        playSegmentRolloverChime(vol);
        rolloverSegmentGapless();
      }
    }, 1000);
  }

  /**
   * Gapless segment rollover — see header invariant block.
   *
   * Sequence (every step matters; reorder at your peril):
   *
   *   1. Snapshot the OLD recorder + its in-flight chunks into LOCAL
   *      variables. After this point we don't touch chunksRef for the
   *      old segment again.
   *   2. Rebind the OLD recorder's ondataavailable to push into the
   *      local oldChunks. The browser will fire ondataavailable one
   *      more time when .stop() flushes the encoder, and it MUST not
   *      land in the new segment's buffer.
   *   3. Reset chunksRef.current = [] and build the NEW MediaRecorder
   *      on the same recordingStream. Start it immediately so the mic
   *      is captured continuously.
   *   4. Bump segmentNumber (state + ref) so the in-flight upload's
   *      part-N filename uses the OLD index and the live UI shows the
   *      NEW index.
   *   5. Wire the OLD recorder's .onstop to upload the snapshotted
   *      chunks in the background. The session keeps recording while
   *      that upload is in progress; on success we fire onRecorded
   *      with `{ autoRollover: true }` so the parent appends the file.
   *   6. Call oldRecorder.stop(). State stays "recording" the whole
   *      time — the user never sees an "uploading…" interstitial for
   *      auto-rollovers.
   *
   * Failure modes:
   *   - MediaRecorder constructor throws → we fall back to the legacy
   *     stop-then-restart path (`stopAndUpload("rollover")`). Worse
   *     UX (the gap returns) but session still completes.
   *   - Upload of the OLD segment fails after both retry attempts →
   *     we surface the error via setError but do NOT teardown the
   *     mic, since the new recorder is still capturing.
   */
  function rolloverSegmentGapless() {
    const oldRecorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    if (!oldRecorder || !stream) {
      rolloverInProgressRef.current = false;
      return;
    }

    const oldChunks: Blob[] = chunksRef.current;
    const oldSegmentSeconds = elapsedRef.current;
    const oldPartIndex = segmentNumberRef.current;
    const oldMimeType = oldRecorder.mimeType || chooseMimeType();

    // Step 2: rebind so the final-flush ondataavailable lands in oldChunks,
    // not the new recorder's chunksRef.
    oldRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) oldChunks.push(e.data);
    };

    // Step 3: build + start the NEW recorder BEFORE stopping the old one.
    const recordingStream = graphRef.current?.recordingStream ?? stream;
    let newRecorder: MediaRecorder;
    try {
      const newMimeType = chooseMimeType();
      newRecorder = new MediaRecorder(
        recordingStream,
        newMimeType ? { mimeType: newMimeType } : undefined
      );
    } catch (err) {
      // Pre-warm failed — fall back to the legacy path so we don't lose the
      // existing segment. We pay the gap but the session continues.
      console.warn(
        "[useAudioRecorder] gapless rollover pre-warm failed; falling back:",
        err
      );
      // Restore ondataavailable so chunksRef path still works (legacy path).
      oldRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rolloverInProgressRef.current = false;
      stopAndUpload("rollover");
      return;
    }

    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);
    approachingCapSoundPlayedRef.current = false;
    commitSessionAudioMsAtRollover();
    // Capture the rollover-boundary baseline immediately so readAudioClockMs()
    // is correct from the first frame of the new segment onward. The frame
    // clock is NOT stopped during rollover, so rawFrameClockMs() here is the
    // natural segment boundary reference point.
    segmentPrimingBaselineRef.current = rawFrameClockMs();
    watchdogLastFrameMsRef.current = readAudioClockMs();
    watchdogLastChunkCountRef.current = 0;
    segmentNumberRef.current = oldPartIndex + 1;
    setSegmentNumber(oldPartIndex + 1);

    wireRecorderOnDataAvailable(newRecorder);
    if (recordingDraft) {
      segmentIdForDraftRef.current = mintDraftSegmentId();
      firstChunkMsRef.current = null;
      timesliceDataReceivedRef.current = false;
      startRecorderWithDraftPolicy(newRecorder);
    } else {
      newRecorder.start();
    }
    mediaRecorderRef.current = newRecorder;

    // Step 5: background upload of the OLD segment.
    //
    // Pre-register the tracking Promise SYNCHRONOUSLY (before
    // oldRecorder.stop()) so a caller that awaits flushPendingUploads
    // right after a rollover doesn't race past this segment the way
    // the End-session flow used to race past the final segment.
    const rolloverTracking = registerPendingStop();
    void checkpointDraftToStore();
    oldRecorder.onstop = () => {
      void (async () => {
        try {
          const blob = new Blob(oldChunks, { type: oldMimeType });
          if (blob.size === 0) {
            console.warn(
              "[useAudioRecorder] rollover: old segment was empty, skipping upload"
            );
            onWatchdogAlertRef.current?.("empty-rollover");
            rolloverInProgressRef.current = false;
            return;
          }

          const ext = fileExtension(oldMimeType);
          const filename = `session-${Date.now()}-part${oldPartIndex}.${ext}`;

          try {
            const result = await uploadAudioWithRetry(
              uploadAudioDirect,
              studentId,
              blob,
              filename,
              oldMimeType
            );

            if (!result.ok) {
              // Surface but keep the live recorder running. Tutor can read the
              // error and decide whether to stop; in the meantime we don't lose
              // the current capture.
              setError(formatUserFacingActionError(result.error, result.debugId));
              rolloverInProgressRef.current = false;
              return;
            }

            const previewUrl = URL.createObjectURL(blob);
            // `await` so flushPendingUploads truly waits for the consumer
            // (workspace outbox enqueue) to land before returning.
            await onRecorded(
              {
                blobUrl: result.blobUrl,
                mimeType: oldMimeType,
                sizeBytes: blob.size,
                filename,
                previewUrl,
                blob,
              },
              { autoRollover: true }
            );
            rolloverInProgressRef.current = false;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Upload failed";
            console.error("[useAudioRecorder] rollover upload failed:", err);
            setError(msg);
            rolloverInProgressRef.current = false;
          }
          // oldSegmentSeconds is captured for parity with the legacy path's
          // doneSegmentSeconds; auto-rollover doesn't surface it in the UI
          // (state never goes to "done"), but keeping the snapshot makes
          // future telemetry trivial.
          void oldSegmentSeconds;
        } finally {
          rolloverTracking.settle();
        }
      })();
    };

    if (oldRecorder.state !== "inactive") {
      oldRecorder.stop();
    } else {
      // Defensive: oldRecorder is somehow already inactive (e.g. a
      // double-stop from an earlier rolloverSegmentGapless). onstop
      // won't fire, so settle the pre-registered tracking Promise
      // ourselves — otherwise flushPendingUploads() would hang on
      // it forever.
      rolloverTracking.settle();
    }
  }

  /**
   * Drive the meter bar via DOM ref — never via setState. A meter that ticks
   * 60 times/sec via state would re-render the entire panel every frame; the
   * slider's drag gesture would get cancelled by the unmount, and CPU usage
   * would be embarrassing.
   */
  function startMeter(graph: MicAudioGraph) {
    stopMeter();
    const tick = () => {
      const level = graph.getLevel();
      const bar = meterBarRef.current;
      if (bar) {
        bar.style.width = `${Math.round(level * 100)}%`;
        const next = meterColor(level);
        if (next !== meterColorRef.current) {
          bar.style.background = next;
          meterColorRef.current = next;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  /**
   * Acquire the mic with optional device constraint, populate the device list
   * (labels become available once permission is granted), build the audio graph,
   * and start the level meter. If `forRecording`, also starts MediaRecorder.
   */
  async function acquireMic(opts: { deviceId?: string; forRecording: boolean }) {
    setError(null);
    teardownMicStream();
    setRecordState("acquiring");

    const applyGetUserMediaFailure = (err: unknown, exactDeviceId?: string) => {
      const name = err instanceof Error ? (err as DOMException).name : "";
      console.error("[useAudioRecorder] getUserMedia failed:", err);
      let msg: string;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        msg =
          "Microphone access denied. Click the icon at the left of the address bar (looks like a slider or tune icon), set Microphone to Allow, then reload the page and try again.";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        msg = "No microphone found. Please connect a microphone and try again.";
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        msg =
          "Microphone is in use by another app (e.g. Discord, Teams). Close that app or switch its audio device, then try again.";
      } else if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
        if (exactDeviceId) {
          saveStoredDeviceId("");
          setSelectedDeviceId("");
          msg =
            "The previously selected microphone is no longer available. Try clicking Start recording again to use the default mic.";
        } else {
          msg = "Microphone constraints not satisfied. Try choosing a different device.";
        }
      } else {
        msg = `Microphone error (${name || "unknown"}). Try reloading the page. If the problem persists, use the Upload tab instead.`;
      }
      setError(msg);
      setRecordState("error");
    };

    let stream: MediaStream;
    try {
      const constraints: MediaStreamConstraints = {
        audio: opts.deviceId ? { deviceId: { exact: opts.deviceId } } : true,
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const name = err instanceof Error ? (err as DOMException).name : "";
      const stalePreferredDevice =
        Boolean(opts.deviceId) &&
        (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError");

      // `deviceId: { exact }` + a stale id from localStorage (USB unplugged,
      // Bluetooth profile change, OS default swap) yields OverconstrainedError
      // before any audio reaches the graph. Clear the preference and acquire
      // the default mic in one step so the meter/recorder works without an
      // extra Start click and without a scary console.error on the happy path.
      if (stalePreferredDevice) {
        console.warn(
          "[useAudioRecorder] stored mic device unavailable; clearing preference and using default input",
          err
        );
        saveStoredDeviceId("");
        setSelectedDeviceId("");
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err2) {
          applyGetUserMediaFailure(err2, undefined);
          return;
        }
      } else {
        applyGetUserMediaFailure(err, opts.deviceId);
        return;
      }
    }

    streamRef.current = stream;
    // Note: we expose localMicStream AFTER the audio graph is built
    // (below) so callers like useLiveAV receive the graph's publishStream
    // (a separate Web Audio destination) rather than the raw mic stream.
    // Using the raw stream would force WebRTC to clone the mic track,
    // which causes Chrome to send silence on the WebRTC track in some
    // configurations.
    const audioTrack = stream.getAudioTracks?.()[0];

    // Persist the actual deviceId in use (browsers sometimes resolve "default" to a real id).
    const settings = audioTrack?.getSettings?.();
    if (settings?.deviceId) {
      saveStoredDeviceId(settings.deviceId);
      setSelectedDeviceId(settings.deviceId);
    }

    // Enumerate AFTER permission so labels populate (browsers redact labels otherwise).
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === "audioinput");
      setDevices(inputs);
    } catch (err) {
      console.warn("[useAudioRecorder] enumerateDevices failed:", err);
    }

    // Build the audio graph (gain + meter). Returns null if Web Audio is unavailable
    // or the stream isn't a real MediaStream (test stub) — fall back to raw stream below.
    const graph =
      graphOverrideRef.current ??
      (await createMicAudioGraph(
        stream,
        gainLinear,
        avLogSessionId ? { sessionId: avLogSessionId } : undefined
      ));
    graphRef.current = graph;

    // Expose the stream that downstream consumers (useLiveAV) should use.
    // Prefer the graph's publishStream (independent destination, fans out
    // from the same source as recordingStream — no track sharing). Fall
    // back to the raw mic stream when Web Audio is unavailable (tests).
    setLocalMicStream(graph?.publishStream ?? stream);

    if (graph) {
      startMeter(graph);
    }

    if (opts.forRecording) {
      startMediaRecorder();
    } else {
      setRecordState("ready");
    }
  }

  /**
   * Swap the underlying `getUserMedia` mic without stopping MediaRecorder /
   * tearing down the Web Audio graph. Used when the tutor changes device
   * mid-recording; pairs with `peer-mesh.replaceLocalTrackOnAllPeers` on the
   * live-A/V side.
   */
  async function swapMicDevice(deviceId: string): Promise<void> {
    const graph = graphRef.current;
    if (!graph?.swapLocalMicSource) {
      if (!streamRef.current) {
        await acquireMic({
          deviceId: deviceId || undefined,
          forRecording: false,
        });
        return;
      }
      setError(
        "Cannot switch microphone — audio processing is unavailable in this browser."
      );
      throw new Error("mic graph swap unavailable");
    }

    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false,
    };
    let newStream: MediaStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const name = err instanceof Error ? (err as DOMException).name : "";
      console.error("[useAudioRecorder] swapMicDevice getUserMedia failed:", err);
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Microphone access denied. Check browser permissions and try again."
        );
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setError(
          "Microphone is in use by another app. Close that app or pick a different device."
        );
      } else if (
        name === "OverconstrainedError" ||
        name === "ConstraintNotSatisfiedError"
      ) {
        setError(
          "That microphone is not available. Pick a different device or reconnect the USB mic."
        );
      } else {
        setError(
          `Could not switch microphone (${name || "unknown"}). Try again.`
        );
      }
      throw err;
    }

    try {
      graph.swapLocalMicSource(newStream);
      const prev = streamRef.current;
      if (prev) {
        for (const t of prev.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
      }
      streamRef.current = newStream;

      const audioTrack = newStream.getAudioTracks?.()[0];
      const settings = audioTrack?.getSettings?.();
      if (settings?.deviceId) {
        saveStoredDeviceId(settings.deviceId);
        setSelectedDeviceId(settings.deviceId);
      }

      setLocalMicStream(graph.publishStream);
      setError(null);
    } catch (err) {
      for (const t of newStream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
      throw err;
    }
  }

  function startMediaRecorder(opts?: { continuation?: boolean }) {
    const continuation = opts?.continuation ?? false;
    const stream = streamRef.current;
    if (!stream) {
      setError("No microphone stream available.");
      setRecordState("error");
      return;
    }

    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);
    approachingCapSoundPlayedRef.current = false;
    rolloverInProgressRef.current = false;
    if (!continuation) {
      setSegmentNumber(1);
      segmentNumberRef.current = 1;
      totalSessionElapsedRef.current = 0;
      sessionAudioMsRef.current = 0;
      resetSegmentAudioClockState();
    }
    if (recordingDraft) {
      segmentIdForDraftRef.current = mintDraftSegmentId();
      firstChunkMsRef.current = null;
      timesliceDataReceivedRef.current = false;
      startDraftCheckpointScheduling();
    }

    const mimeType = chooseMimeType();
    // Prefer the processed (gain-adjusted) stream; fall back to raw for browsers / tests
    // where Web Audio isn't available.
    const recordingStream = graphRef.current?.recordingStream ?? stream;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
    } catch {
      setError("Your browser doesn't support audio recording. Please upload a file instead.");
      teardownMicStream();
      setRecordState("error");
      return;
    }

    wireRecorderOnDataAvailable(recorder);

    if (recordingDraft) {
      startRecorderWithDraftPolicy(recorder);
    } else {
      // IMPORTANT: do NOT pass a timeslice argument to start(). Chunked output
      // (start(1000)) makes iOS Safari emit fragmented MP4 pieces that don't
      // concatenate into a playable / Whisper-decodable file.
      recorder.start();
    }
    mediaRecorderRef.current = recorder;
    graphRef.current?.frameClockSetActive?.(true);
    // Activate perf.now fallback when no frame-counting node is available.
    // Must come AFTER frameClockSetActive so the gate state is consistent.
    perfNowFallbackActivate();
    if (graphRef.current?.hasFrameClock === false) {
      // Log the active clock source so smoke/console reveals the fallback.
      console.log(
        `[useAudioRecorder] rid=${avLogSessionId ?? "?"} frame-counter=perfnow-fallback`
      );
    }
    // Capture the recording-start baseline now — NOT at first ondataavailable.
    // With DRAFT_TIMESLICE_MS = 30_000 the first chunk arrives ~30 s late;
    // keying the baseline to that event made the clock wrong by ~30 s per
    // segment (B-CLOCK-2) and 0 for the entire session on iOS (B-CLOCK-1).
    segmentPrimingBaselineRef.current = rawFrameClockMs();
    setRecordState("recording");
    startTimer();
  }

  /**
   * Single primary action. Acquires mic + starts recording in one shot for
   * first-time users (permission prompt → acquire → record). For users whose
   * mic was auto-acquired on mount, just starts the recorder reusing the live
   * graph (no re-prompt, no flicker).
   */
  async function handleStartRecording() {
    if (recordState === "ready" && streamRef.current) {
      startMediaRecorder();
    } else {
      await acquireMic({ deviceId: selectedDeviceId || undefined, forRecording: true });
    }
  }

  async function handleDeviceChange(newDeviceId: string) {
    if (recordState === "recording" || recordState === "paused") {
      try {
        await swapMicDevice(newDeviceId);
      } catch {
        /* swapMicDevice surfaces setError */
      }
      return;
    }
    setSelectedDeviceId(newDeviceId);
    saveStoredDeviceId(newDeviceId);
    if (recordState === "ready") {
      await acquireMic({ deviceId: newDeviceId || undefined, forRecording: false });
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      graphRef.current?.frameClockSetActive?.(false);
      perfNowFallbackDeactivate();
      mediaRecorderRef.current.pause();
      stopTimer();
      setRecordState("paused");
    }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current?.state === "paused") {
      // Open the frame-clock gate BEFORE resuming the encoder so we don't
      // miss the first batch of encoded frames (S-RESUME-ORDER: up to ~23 ms
      // gap on AudioWorklet if the gate opens after resume).
      graphRef.current?.frameClockSetActive?.(true);
      perfNowFallbackActivate();
      mediaRecorderRef.current.resume();
      startTimer();
      setRecordState("recording");
    }
  }

  function stopAndUpload(mode: "final" | "rollover" = "final") {
    // No short-clip confirm: the live level meter now lets the tutor see that
    // their voice was captured, and the server-side `looksLikeSilenceHallucination`
    // guard rejects junk transcripts regardless of duration. Short legitimate
    // utterances ("bring the worksheet next time") are valid notes and shouldn't
    // be blocked behind a confirm popup.
    stopTimer();
    graphRef.current?.frameClockSetActive?.(false);
    perfNowFallbackDeactivate();
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      rolloverInProgressRef.current = false;
      return;
    }

    const isRollover = mode === "rollover";
    setUploadMode(isRollover ? "segment" : "final");
    setRecordState("uploading");

    // Pre-register the tracking Promise SYNCHRONOUSLY (before
    // recorder.stop()) so a caller that awaits flushPendingUploads()
    // immediately after stopAndUpload() sees the in-flight chain.
    // Without this synchronisation, the End-session flow drains the
    // outbox while MediaRecorder.onstop is still queued — exactly the
    // bug the Phase 1b smoke test hit on master.
    const stopTracking = registerPendingStop();

    void checkpointDraftToStore();

    recorder.onstop = () => {
      void (async () => {
        try {
          if (recordingDraft && !timesliceDataReceivedRef.current) {
            console.warn(
              "[useAudioRecorder] draft durability: no intermediate timeslice ondataavailable before stop; relying on stop-only checkpoint (common on iOS Safari — validate on real iPhone)"
            );
          }
          const mimeType = recorder.mimeType || chooseMimeType();
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          const segmentSeconds = elapsedRef.current;
          // Read the live segment number via ref; the closure captured at
          // setInterval-creation time would otherwise see the stale value
          // from the render where startTimer() was first called.
          const partIndex = segmentNumberRef.current;

          try {
            if (!isRollover) {
              teardownMicStream();
            }

            if (blob.size === 0) {
              setError("Recording appears empty. Please try again.");
              setUploadMode(null);
              if (isRollover) teardownMicStream();
              setRecordState("error");
              rolloverInProgressRef.current = false;
              return;
            }

            const ext = fileExtension(mimeType);
            const filename = `session-${Date.now()}-part${partIndex}.${ext}`;

            const result = await uploadAudioWithRetry(
              uploadAudioDirect,
              studentId,
              blob,
              filename,
              mimeType
            );

            if (!result.ok) {
              setError(formatUserFacingActionError(result.error, result.debugId));
              setUploadMode(null);
              teardownMicStream();
              setRecordState("error");
              rolloverInProgressRef.current = false;
              return;
            }

            const previewUrl = URL.createObjectURL(blob);

            if (isRollover) {
              // `await` so flushPendingUploads waits for the consumer to
              // finish enqueueing this segment before signalling drained.
              await onRecorded(
                {
                  blobUrl: result.blobUrl,
                  mimeType,
                  sizeBytes: blob.size,
                  filename,
                  previewUrl,
                  blob,
                },
                { autoRollover: true }
              );
              setUploadMode(null);
              mediaRecorderRef.current = null;
              // Update both state (for UI) and ref (for the next rollover's onstop closure).
              segmentNumberRef.current = partIndex + 1;
              setSegmentNumber(partIndex + 1);
              startMediaRecorder({ continuation: true });
              rolloverInProgressRef.current = false;
              return;
            }

            setDoneSegmentSeconds(segmentSeconds);
            setUploadMode(null);
            setRecordState("done");
            // `await` so flushPendingUploads correctly blocks End-session
            // until the trailing segment is in the outbox. This is the
            // root-cause fix for the Phase 1b smoke regression.
            await onRecorded({
              blobUrl: result.blobUrl,
              mimeType,
              sizeBytes: blob.size,
              filename,
              previewUrl,
              blob,
            });
            rolloverInProgressRef.current = false;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Upload failed";
            setError(msg);
            setUploadMode(null);
            teardownMicStream();
            setRecordState("error");
            rolloverInProgressRef.current = false;
          }
        } finally {
          stopTracking.settle();
        }
      })();
    };

    if (recorder.state !== "inactive") {
      recorder.stop();
    } else {
      // Recorder already inactive — onstop won't fire. Settle the
      // tracking Promise ourselves so flushPendingUploads() doesn't
      // wait forever on a callback that will never arrive.
      stopTracking.settle();
    }
  }

  function handleReset() {
    stopTimer();
    clearDraftCheckpointScheduling();
    teardownMicStream();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);
    totalSessionElapsedRef.current = 0;
    approachingCapSoundPlayedRef.current = false;
    rolloverInProgressRef.current = false;
    segmentNumberRef.current = 1;
    setSegmentNumber(1);
    sessionAudioMsRef.current = 0;
    resetSegmentAudioClockState();
    setUploadMode(null);
    setDoneSegmentSeconds(0);
    setError(null);
    setRecordState("idle");

    // Re-acquire the mic immediately if we have permission, so the meter and
    // picker come back to life without requiring an extra Start click. (The
    // auto-acquire useEffect only runs on mount; this same-instance reset
    // path needs an explicit kick.)
    void (async () => {
      const permission = await queryMicPermission();
      setPermissionState(permission);
      if (permission === "denied") return;
      await acquireMic({
        deviceId: loadStoredDeviceId() || undefined,
        forRecording: false,
      });
    })();
  }

  const isWarning = elapsed >= effectiveWarnSegmentSeconds();
  const isLive =
    recordState === "ready" ||
    recordState === "recording" ||
    recordState === "paused" ||
    (recordState === "uploading" && uploadMode === "segment");
  const lockDevice =
    recordState === "uploading" && uploadMode === "segment";

  // Ref-stable addRemoteAudio so consumers (the workspace's
  // participants-reconcile effect) don't re-run on every render just
  // because the function identity changes.
  const addRemoteAudio = useCallback((stream: MediaStream) => {
    const g = graphRef.current;
    if (!g || typeof g.addRemoteAudio !== "function") {
      // Graph not ready (mic not yet acquired) or this hook is being
      // exercised by a test stub that hasn't implemented mixdown. The
      // caller is expected to gate on `localMicStream != null` and
      // re-invoke once the graph builds; no-op here keeps the
      // contract "always safe to call".
      return () => {};
    }
    return g.addRemoteAudio(stream);
  }, []);

  // Phase 4d Commit 7: per-peer recording-mute via the graph's
  // GainNode. Ref-stable for the same reason as `addRemoteAudio`.
  const setRemoteRecordingGain = useCallback(
    (stream: MediaStream, gainLinear: number) => {
      const g = graphRef.current;
      if (!g || typeof g.setRemoteGain !== "function") return;
      g.setRemoteGain(stream, gainLinear);
    },
    []
  );

  const getAudioMs = useCallback((): number => readAudioClockMs(), []);

  return {
    state: recordState,
    uploadMode,
    elapsed,
    segmentNumber,
    doneSegmentSeconds,
    localMicStream,
    addRemoteAudio,
    setRemoteRecordingGain,
    devices,
    selectedDeviceId,
    gainLinear,
    setGainLinear,
    chimeEnabled,
    setChimeEnabled,
    chimeVolume,
    setChimeVolume,
    permissionState,
    error,
    isLive,
    lockDevice,
    isWarning,
    meterBarRef,
    handleStartRecording,
    handleDeviceChange,
    pauseRecording,
    resumeRecording,
    stopAndUpload,
    handleReset,
    flushPendingUploads,
    swapMicDevice,
    getAudioMs,
  };
}

// Re-export segment policy constants the shell still needs for copy.
export { SEGMENT_MAX_SECONDS, SESSION_SAFETY_MAX_SECONDS, WARN_SEGMENT_SECONDS };
