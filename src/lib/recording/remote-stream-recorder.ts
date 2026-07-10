"use client";

/**
 * Per-remote-audio MediaRecorder + upload-outbox bridge — Phase 4b
 * (Pillars 2 + 6). One instance per remote peer's audio stream.
 *
 * Architecture (deliberately dumb at this layer):
 *
 *   useLiveAV (4b)      exposes participants[].audioStream
 *           │
 *           ▼
 *   host orchestrator (4c)
 *     - on participant arrival:
 *         create one recorder with the audio stream + outbox + sessionId
 *     - watch lifecycle FSM `shouldCapture(streamId)`:
 *         flip true  → recorder.start()
 *         flip false → recorder.stop()
 *     - on peer disconnect / unmount:
 *         recorder.stop() (awaits trailing segment) then recorder.dispose()
 *           │
 *           ▼
 *   remote-stream-recorder (this module)
 *     - MediaRecorder per stream
 *     - on `dataavailable` → outbox.enqueue with the correct
 *       `streamId: "student:peer-<peerId>:mic"`
 *     - stop() resolves AFTER every in-flight enqueue completes
 *           │
 *           ▼
 *   upload-outbox (Phase 1b) — already supports any streamId
 *
 * The FSM `shouldCapture` predicate lives on the orchestrator side
 * (host); this module deliberately does not know about the FSM. That
 * separation keeps the recorder unit-testable without the
 * lifecycle-machine input shape, and lets the host control mute /
 * pause / resume policy without re-plumbing it through every
 * recorder instance.
 *
 * Reuses the tutor-mic MIME selection from
 * `src/lib/recording/mime.ts` so remote and tutor segments share the
 * same encode policy (webm-first, mp4-fallback for iOS Safari) and
 * are interoperable on replay.
 *
 * Per-session ID logging: every log line carries `avx=<sessionId>`
 * + `streamId=<streamId>` so prod debugging can grep one peer's
 * full record/upload lifecycle alongside the matching outbox rows
 * (which carry `obx=<rowId>` + the same streamId).
 *
 * Tests: `src/__tests__/recording/remote-stream-recorder.test.ts`.
 */

import { chooseMimeType } from "@/lib/recording/mime";
import type { UploadOutbox } from "@/lib/recording/upload-outbox";

/**
 * Convention for student-mic stream ids: `student:peer-<peerId>:mic`.
 * Use this helper (rather than building the string by hand) so
 * grep-able call sites stay consistent and any future rename has a
 * single point of edit.
 */
export function studentMicStreamId(peerId: string): string {
  return `student:peer-${peerId}:mic`;
}

export type RemoteStreamRecorderLogger = Pick<
  Console,
  "log" | "warn" | "error"
>;

export type RemoteStreamRecorderOptions = {
  /**
   * The remote audio MediaStream. Typically
   * `participants[i].audioStream` from `useLiveAV`. Must already
   * contain at least one audio track when {@link RemoteStreamRecorder.start}
   * is called.
   */
  stream: MediaStream;
  /**
   * Outbox stream id. For student mics use
   * `studentMicStreamId(peerId)`. The outbox already supports any
   * `streamId` — no schema change required.
   */
  streamId: string;
  /** WhiteboardSession id; threads to outbox rows for end-session drain. */
  sessionId: string;
  /** Phase 1b upload outbox instance shared with the tutor-mic path. */
  outbox: UploadOutbox;
  /**
   * MediaRecorder MIME type. Defaults to `chooseMimeType()` — same
   * webm-first / mp4-fallback policy as the tutor mic recorder.
   */
  mimeType?: string;
  /**
   * Optional `MediaRecorder.start(timesliceMs)` value. Omit to
   * record one big segment per `start()`/`stop()` cycle (matches
   * the tutor-mic pattern — iOS Safari MP4 fragmentation guard).
   * 4c may pass a value when long-session segment rollover lands.
   */
  timesliceMs?: number;
  /** Optional logger override. Defaults to `console`. */
  log?: RemoteStreamRecorderLogger;
  /**
   * Test-only override of `globalThis.MediaRecorder`. Production
   * leaves this undefined and relies on the global.
   */
  _MediaRecorder?: typeof MediaRecorder;
  /** Test-only clock for `audioStartedAtMs`. Defaults to `Date.now`. */
  _now?: () => number;
  /**
   * Test-only segmentId factory. Defaults to `crypto.randomUUID()`
   * with a Math.random-based fallback for legacy test runners.
   */
  _uuid?: () => string;
  /**
   * When true, outbox rows are transcription-only and excluded from replay
   * assembly (`assembleEndSessionSegments` skips them).
   */
  transcriptionOnly?: boolean;
  /** Stable speaker identity (e.g. LearnerProfile id) for attribution. */
  speakerId?: string;
  /**
   * Monotonic p3-clock reader — called at segment start to stamp
   * `recordingTimeOffsetMs` on each outbox row.
   */
  getRecordingTimeOffsetMs?: () => number;
};

export type RemoteStreamRecorder = {
  /**
   * Begin recording. No-op when already recording, when disposed,
   * or when MediaRecorder construction throws (error logged + state
   * returns to "not recording" so the host can retry on the next
   * shouldCapture flip).
   */
  start: () => void;
  /**
   * Stop recording AND wait for every in-flight outbox enqueue to
   * complete. Safe to call when not recording (resolves
   * immediately). Resolves even if `outbox.enqueue` itself rejects
   * — failures are logged at error level but never reject this
   * promise (so a host-side `await recorder.stop()` is never an
   * unhandled-rejection foot-gun).
   */
  stop: () => Promise<void>;
  /** True between `start()` and `stop()` returning. */
  isRecording: () => boolean;
  /**
   * Synchronous teardown. Calls `MediaRecorder.stop()` if currently
   * recording and detaches all listeners. Does NOT await the
   * trailing-segment enqueue — the in-flight outbox writes continue
   * in the background. Use this from React unmount paths where
   * awaiting isn't an option; use `await stop()` first when the
   * trailing segment must land.
   */
  dispose: () => void;
};

const fallbackUuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return (
    Math.random().toString(16).slice(2) +
    Math.random().toString(16).slice(2)
  ).slice(0, 32);
};

export function createRemoteStreamRecorder(
  opts: RemoteStreamRecorderOptions
): RemoteStreamRecorder {
  const MR =
    opts._MediaRecorder ??
    (typeof globalThis !== "undefined"
      ? (globalThis as unknown as { MediaRecorder?: typeof MediaRecorder })
          .MediaRecorder
      : undefined);
  const log = opts.log ?? console;
  const now = opts._now ?? Date.now;
  const uuid = opts._uuid ?? fallbackUuid;
  const mimeType = opts.mimeType ?? chooseMimeType();
  const tag = `[remote-stream-recorder] avx=${opts.sessionId} streamId=${opts.streamId}`;

  let recorder: MediaRecorder | null = null;
  let recording = false;
  let disposed = false;
  let segmentStartedAtMs = 0;
  let segmentRecordingOffsetMs = 0;

  // Track in-flight enqueues so stop() can await them.
  let pendingEnqueues: Promise<void>[] = [];

  // Resolver for the current stop() promise, if any.
  let pendingStopResolve: (() => void) | null = null;
  let pendingStopPromise: Promise<void> | null = null;

  function handleDataAvailable(ev: BlobEvent) {
    const blob = ev.data;
    if (!blob || blob.size === 0) {
      // Empty `dataavailable` is normal on stop() with no data
      // buffered (e.g. recorder was started + stopped before any
      // audio frames arrived).
      log.log(`${tag} segment empty — skipping enqueue`);
      return;
    }
    const segmentId = uuid();
    const startedAt = segmentStartedAtMs;
    const recordingTimeOffsetMs = segmentRecordingOffsetMs;
    // After firing one segment, mark the next as starting now
    // (covers the timesliceMs path where multiple segments fire
    // within one start()/stop() cycle).
    segmentStartedAtMs = now();
    segmentRecordingOffsetMs = opts.getRecordingTimeOffsetMs?.() ?? segmentRecordingOffsetMs;

    log.log(
      `${tag} segment ready segmentId=${segmentId} bytes=${blob.size}`
    );
    const p = (async () => {
      try {
        await opts.outbox.enqueue({
          sessionId: opts.sessionId,
          streamId: opts.streamId,
          segmentId,
          blobLocalRef: blob,
          mimeType,
          sizeBytes: blob.size,
          audioStartedAtMs: startedAt,
          ...(typeof recordingTimeOffsetMs === "number" && {
            recordingTimeOffsetMs,
          }),
          ...(opts.speakerId && { speakerId: opts.speakerId }),
          ...(opts.transcriptionOnly === true && { transcriptionOnly: true }),
        });
      } catch (err) {
        log.error(
          `${tag} outbox.enqueue threw segmentId=${segmentId}`,
          err
        );
      }
    })();
    pendingEnqueues.push(p);
  }

  function handleStop() {
    recording = false;
    log.log(`${tag} MediaRecorder stop fired`);
    const resolver = pendingStopResolve;
    pendingStopResolve = null;
    // Snapshot the current pending enqueues; the trailing
    // `dataavailable` may have already pushed onto this array.
    const pending = pendingEnqueues;
    pendingEnqueues = [];
    void Promise.all(pending).finally(() => {
      if (resolver) resolver();
    });
  }

  function detachRecorderListeners() {
    if (!recorder) return;
    try {
      recorder.removeEventListener("dataavailable", handleDataAvailable);
      recorder.removeEventListener("stop", handleStop);
    } catch {
      /* ignore */
    }
  }

  return {
    start() {
      if (disposed) {
        log.warn(`${tag} start on disposed recorder — ignoring`);
        return;
      }
      if (recording) {
        log.warn(`${tag} start called while already recording — ignoring`);
        return;
      }
      if (!MR) {
        log.error(
          `${tag} MediaRecorder constructor not available — refusing to start`
        );
        return;
      }
      if (opts.stream.getAudioTracks().length === 0) {
        log.warn(
          `${tag} stream has no audio tracks — refusing to start`
        );
        return;
      }
      try {
        recorder = new MR(opts.stream, { mimeType });
      } catch (err) {
        log.error(`${tag} MediaRecorder ctor threw`, err);
        recorder = null;
        return;
      }
      segmentStartedAtMs = now();
      segmentRecordingOffsetMs = opts.getRecordingTimeOffsetMs?.() ?? 0;
      recorder.addEventListener("dataavailable", handleDataAvailable);
      recorder.addEventListener("stop", handleStop);
      try {
        if (typeof opts.timesliceMs === "number") {
          recorder.start(opts.timesliceMs);
        } else {
          recorder.start();
        }
      } catch (err) {
        log.error(`${tag} MediaRecorder.start threw`, err);
        detachRecorderListeners();
        recorder = null;
        return;
      }
      recording = true;
      log.log(
        `${tag} started mime=${mimeType} timesliceMs=${opts.timesliceMs ?? "none"}`
      );
    },

    stop(): Promise<void> {
      if (!recording || !recorder) {
        // Already not recording — if there are still pending
        // enqueues from a prior segment, await them so a stale
        // start/stop sequence's trailing flush is honored.
        if (pendingEnqueues.length > 0) {
          const pending = pendingEnqueues;
          pendingEnqueues = [];
          return Promise.all(pending).then(() => undefined);
        }
        return Promise.resolve();
      }
      if (pendingStopPromise) return pendingStopPromise;
      pendingStopPromise = new Promise<void>((resolve) => {
        pendingStopResolve = () => {
          pendingStopPromise = null;
          resolve();
        };
      });
      try {
        recorder.stop();
      } catch (err) {
        log.error(`${tag} MediaRecorder.stop threw`, err);
        // Resolve the stop promise even on error so the caller
        // doesn't hang.
        const resolver = pendingStopResolve;
        pendingStopResolve = null;
        pendingStopPromise = null;
        recording = false;
        if (resolver) resolver();
        return Promise.resolve();
      }
      return pendingStopPromise;
    },

    isRecording: () => recording,

    dispose() {
      if (disposed) return;
      disposed = true;
      if (recording && recorder) {
        try {
          recorder.stop();
        } catch (err) {
          log.warn(`${tag} dispose: MediaRecorder.stop threw`, err);
        }
      }
      detachRecorderListeners();
      recorder = null;
      recording = false;
      // Resolve any outstanding stop() promise so callers waiting
      // on it don't hang.
      if (pendingStopResolve) {
        const resolver = pendingStopResolve;
        pendingStopResolve = null;
        pendingStopPromise = null;
        resolver();
      }
      log.log(`${tag} disposed`);
    },
  };
}
