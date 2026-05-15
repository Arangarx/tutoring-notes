"use client";

/**
 * Live-A/V session hook — Phase 4b (post-realignment).
 *
 * Orchestrates the three pure-JS modules from Phase 4a (sync-client
 * presence channel + signaling muxer + peer-mesh) into a React
 * lifecycle. Final 4b contract — supersedes the auto-acquire shape
 * from commits 7fb9d65 / 7ff7a04. See `docs/PHASE-4B-STATUS.md`.
 *
 * Acquisition contract:
 *   - The hook is INERT on mount. It does NOT call `getUserMedia`.
 *   - Mic is acquired via `requestMic(): Promise<void>`; camera via
 *     `requestCam(): Promise<void>`. The two requests are
 *     independent — Phase 4d's graceful-degradation paths
 *     (mic-granted-cam-denied, etc.) depend on this.
 *   - `hasMicPermission` / `hasCamPermission` are populated via
 *     `navigator.permissions.query()` on mount where supported, so
 *     the host UI can decide whether to show the request modal
 *     without prompting.
 *   - Once `syncClient` is non-null AND at least one of
 *     `localAudioStream` / `localVideoStream` is non-null, the mesh
 *     and signaling are built and the hook starts reconciling room
 *     peers, collecting remote tracks, and tracking per-peer
 *     connection state.
 *
 * Pillar invariants reused from 4a:
 *   - Encrypted-transport trust model is preserved: this hook only
 *     wires modules together. The relay sees nothing it didn't
 *     already see in 4a.
 *   - peer-mesh stays pure-JS (no DOM); this hook owns every
 *     `navigator.mediaDevices` interaction.
 *   - Multi-participant from day one: `participants` is an array
 *     indexed by peerId, sorted lexicographically. 1:1 tutoring is
 *     `participants.length === 1`.
 *
 * Cam-after-mic mid-session: peer-mesh's `getLocalTracks` callback
 * is invoked at `addPeer` time, so toggling camera BEFORE peers
 * connect transparently lights up video. Toggling AFTER existing
 * peers connected only flips local `.enabled` flags — adding new
 * tracks to existing PCs would require renegotiation, which 4b
 * intentionally does not implement (orchestrator decision; 4c's
 * permissions UI is expected to grant both up front).
 *
 * Recording integration is provided by `remote-stream-recorder.ts`
 * (Phase 4b commit 4), which consumes `participants[i].audioStream`
 * and feeds it into the upload outbox via
 * `streamId: "student:peer-<id>:mic"`.
 *
 * Tests: `src/__tests__/dom/useLiveAV.dom.test.tsx`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createPeerMesh,
  type PeerMesh,
  type PeerMeshOptions,
} from "@/lib/av/peer-mesh";
import { getIceServersForBrowser } from "@/lib/av/webrtc-ice-from-env";
import {
  createSignaling,
  type Signaling,
  type SignalingOptions,
} from "@/lib/av/signaling";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";

// -----------------------------------------------------------------
// Public types
// -----------------------------------------------------------------

/**
 * Per-peer view that the UI / recording layers consume. Mirrors the
 * `RoomPeer` info from sync-client plus the per-peer media + ICE
 * state assembled by this hook.
 */
export type AvParticipant = {
  peerId: string;
  role: "tutor" | "student";
  label?: string;
  /**
   * Live remote audio stream — null until at least one audio track
   * lands on the underlying RTCPeerConnection. Wire into
   * `<audio autoplay srcObject={p.audioStream} />` or pipe through
   * `MediaRecorder` for capture.
   */
  audioStream: MediaStream | null;
  /**
   * Live remote video stream — null until at least one video track
   * lands on the underlying RTCPeerConnection (which only happens
   * when the remote peer enabled their camera). Wire into
   * `<video autoplay playsInline srcObject={p.videoStream} muted />`.
   * (Always set `muted` on the local-side `<video>` so audio comes
   * exclusively from the `audioStream` companion — avoids double
   * playback at different latencies.)
   */
  videoStream: MediaStream | null;
  /**
   * Latest `RTCPeerConnection.connectionState`. "new" until the
   * first state change fires from peer-mesh.
   */
  peerConnectionState: RTCPeerConnectionState;
  /**
   * Latest `RTCPeerConnection.iceConnectionState`. Surfaced
   * separately because Phase 4d will distinguish "disconnected"
   * (peer paused, recoverable) from "failed" (unrecoverable) for UI
   * copy and the auto-pause banner.
   */
  iceConnectionState: RTCIceConnectionState;
};

/**
 * Classified `getUserMedia` errors. The UI layer maps each `type`
 * to user-facing copy + recovery affordances.
 */
export type AvAcquireError =
  | { type: "permission-denied"; message: string; raw: unknown }
  | { type: "no-device"; message: string; raw: unknown }
  | { type: "device-in-use"; message: string; raw: unknown }
  | { type: "constraints-not-met"; message: string; raw: unknown }
  | { type: "browser-unsupported"; message: string; raw: unknown }
  | { type: "unknown"; message: string; raw: unknown };

/**
 * Browser Permissions API status, with `"unknown"` for browsers
 * that don't expose `navigator.permissions` or that throw on the
 * `"camera"` descriptor (Safari).
 */
export type AvPermissionState = "unknown" | "prompt" | "granted" | "denied";

/**
 * Minimal `PermissionStatus` surface this hook touches. Real
 * browser type is `PermissionStatus`; we narrow to the methods we
 * actually use so the test fake can be small and the hook stays
 * resilient to browsers that omit `addEventListener` in favor of
 * the legacy `onchange` property.
 */
type PermissionStatusLike = {
  state: "granted" | "prompt" | "denied";
  addEventListener?: (name: "change", cb: () => void) => void;
  removeEventListener?: (name: "change", cb: () => void) => void;
  onchange?: ((this: unknown, ev: Event) => unknown) | null;
};

/**
 * Minimal `Permissions` surface. Real type is `navigator.permissions`.
 */
type PermissionsLike = {
  query: (desc: { name: string }) => Promise<PermissionStatusLike>;
};

export type UseLiveAVOptions = {
  /**
   * Sync-client instance shared with the whiteboard layer. May be
   * `null` while the workspace is in tutor-solo mode (no
   * `WHITEBOARD_SYNC_URL`). When null, mesh/signaling stay torn
   * down and `participants` is empty; the local mic streams can
   * still be acquired (for tutor-solo recording).
   */
  syncClient: WhiteboardSyncClient | null;
  /**
   * Stable peer id for THIS client. MUST match the value the
   * sync-client uses for its own envelope `peerId` — peer-mesh's
   * polite/impolite role assignment and signaling's targetPeerId
   * demux both depend on it. The workspace generates this once per
   * session (alongside the whiteboard session id).
   */
  localPeerId: string;
  /**
   * Optional session id threaded into `avx=<id>` log lines so
   * tutor-side prod debugging can correlate audio + whiteboard +
   * upload events on the same scrollback.
   */
  sessionId?: string;
  /**
   * Optional MediaTrackConstraints for the local mic. Defaults to
   * `true`. Pass a deviceId here once the workspace exposes a
   * mic-picker control.
   *
   * Ignored when `externalAudioStream` is provided.
   */
  audioConstraints?: MediaTrackConstraints | boolean;
  /**
   * When provided, the hook skips its own `getUserMedia` call for
   * audio and instead uses a clone of this stream. This avoids the
   * double-acquisition problem: two simultaneous `getUserMedia`
   * streams from the same hardware device trigger Chrome's shared
   * audio-processing pipeline in a way that can suppress the source
   * signal in BOTH streams via echo-cancellation cross-talk.
   *
   * Pass `workspaceAudio.localMicStream` from the workspace so the
   * recording mic and live-A/V mic are sourced from the same
   * hardware acquisition. The hook clones the stream so live-A/V
   * mute (track.enabled=false) doesn't silence the recording.
   *
   * When null (recording not yet started), the hook falls back to its
   * own `requestMic()` flow.
   */
  externalAudioStream?: MediaStream | null;
  /**
   * Optional MediaTrackConstraints for the local camera. Defaults
   * to `true`.
   */
  videoConstraints?: MediaTrackConstraints | boolean;
  /** Test-only override of `navigator.mediaDevices.getUserMedia`. */
  _getUserMedia?: (
    constraints: MediaStreamConstraints
  ) => Promise<MediaStream>;
  /** Test-only factory override of `createPeerMesh`. */
  _createPeerMesh?: (opts: PeerMeshOptions) => PeerMesh;
  /** Test-only factory override of `createSignaling`. */
  _createSignaling?: (opts: SignalingOptions) => Signaling;
  /**
   * Test-only override of `navigator.permissions`. Pass `null` to
   * simulate browsers without the Permissions API.
   */
  _permissions?: PermissionsLike | null;
  /**
   * Optional logger override. Defaults to `console` with an
   * `avx=<sessionId>` prefix mirroring 4a's logging contract.
   */
  log?: {
    log: (msg: string, ...rest: unknown[]) => void;
    warn: (msg: string, ...rest: unknown[]) => void;
    error: (msg: string, ...rest: unknown[]) => void;
  };
};

export type UseLiveAVReturn = {
  /**
   * Sorted (peerId ascending) list of remote participants. EXCLUDES
   * self. Empty when sync-client is null, no presence frames have
   * arrived, or mic hasn't been acquired.
   */
  participants: ReadonlyArray<AvParticipant>;
  /** Local mic stream. Null until `requestMic()` succeeds. */
  localAudioStream: MediaStream | null;
  /** Local camera stream. Null until `requestCam()` succeeds. */
  localVideoStream: MediaStream | null;
  /**
   * True iff the local mic is muted (`track.enabled === false` on
   * every local audio track). Mute is local-only — wire-level mute
   * is post-v1.
   */
  isMicMuted: boolean;
  /**
   * True iff the local camera is muted (`track.enabled === false`
   * on every local video track). When no video tracks are acquired
   * (cam never requested or `videoError` set), defaults to true so
   * UI placeholders render correctly.
   */
  isCamMuted: boolean;
  /** Flip the mute state of every local audio track. */
  toggleMic: () => void;
  /**
   * Flip the camera-mute state. Applies the new state to any
   * already-acquired video tracks AND is honored by tracks acquired
   * later (e.g. `requestCam()` called after `toggleCam` flipped
   * `isCamMuted=true` lands disabled tracks).
   */
  toggleCam: () => void;
  /**
   * Permissions API state for the microphone, or `"unknown"` if the
   * browser doesn't expose `navigator.permissions` or threw on the
   * query. Updates live via `PermissionStatus.onchange` where
   * supported.
   */
  hasMicPermission: AvPermissionState;
  /**
   * Permissions API state for the camera. Safari throws on
   * `navigator.permissions.query({ name: "camera" })` — that case
   * surfaces as `"unknown"`.
   */
  hasCamPermission: AvPermissionState;
  /**
   * Request mic access via `getUserMedia({ audio: true })`. On
   * success, populates `localAudioStream` and (if the mesh + sync
   * client are also ready) builds the mesh. On error, populates
   * `error` and updates `hasMicPermission` to `"denied"` for
   * `NotAllowedError`. Idempotent — calling while a request is in
   * flight returns the in-flight promise; calling once a stream is
   * acquired resolves immediately.
   */
  requestMic: () => Promise<void>;
  /**
   * Request camera access via `getUserMedia({ video: true })`. On
   * success, populates `localVideoStream`. On error, populates
   * `videoError` and updates `hasCamPermission` to `"denied"` for
   * `NotAllowedError`. Independent of `requestMic()`.
   */
  requestCam: () => Promise<void>;
  /**
   * True while EITHER `requestMic()` or `requestCam()` is in flight.
   */
  isAcquiring: boolean;
  /**
   * True iff mic acquisition succeeded AND `syncClient` is non-null.
   * UIs render the live-A/V panel iff this is true (or while
   * `isAcquiring` for a loading skeleton).
   */
  isActive: boolean;
  /**
   * Latest mic-acquisition error, or null on success / before first
   * attempt. The UI maps `error.type` to copy and an optional
   * "Try again" button (wired via {@link retryAcquire}).
   */
  error: AvAcquireError | null;
  /**
   * Camera-acquisition error, distinct from {@link error}. Non-null
   * here means cam acquisition failed (most commonly
   * `permission-denied`); mic stays unaffected. The UI can surface
   * "video unavailable" without killing the call.
   */
  videoError: AvAcquireError | null;
  /**
   * Force a WebRTC restart for one peer's connection. Wired to a UI
   * "Reconnect" affordance in Phase 4c. No-op when the peer is no
   * longer in the mesh or when the mesh is not yet built.
   */
  reconnectPeer: (peerId: string) => void;
  /**
   * Retry the failed `getUserMedia` calls. If `error` is set,
   * re-runs `requestMic()`. If `videoError` is set, re-runs
   * `requestCam()`. No-op when neither error is set. Resolves once
   * both retries (or the relevant subset) settle.
   */
  retryAcquire: () => Promise<void>;
};

// -----------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------

function classifyMediaError(
  err: unknown,
  kind: "mic" | "cam"
): AvAcquireError {
  const name =
    err instanceof Error ? (err as DOMException).name : "";
  const raw = err;
  const device = kind === "mic" ? "Microphone" : "Camera";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      type: "permission-denied",
      message:
        kind === "mic"
          ? "Microphone access denied. Click the icon next to the address bar, set Microphone to Allow, then retry."
          : "Camera access denied. Click the icon next to the address bar, set Camera to Allow, then retry.",
      raw,
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      type: "no-device",
      message: `No ${device.toLowerCase()} found. Connect a ${device.toLowerCase()} and try again.`,
      raw,
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      type: "device-in-use",
      message: `${device} is in use by another app (Discord, Teams, …). Close that app, then retry.`,
      raw,
    };
  }
  if (
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError"
  ) {
    return {
      type: "constraints-not-met",
      message: `The configured ${device.toLowerCase()} is not available. Pick a different device.`,
      raw,
    };
  }
  if (name === "TypeError" || name === "NotSupportedError") {
    return {
      type: "browser-unsupported",
      message: `Your browser does not support live ${kind === "mic" ? "audio" : "video"}. Use the latest Chrome, Safari, or Firefox.`,
      raw,
    };
  }
  return {
    type: "unknown",
    message:
      err instanceof Error && err.message
        ? err.message
        : `${device} error (unknown). Reload the page and try again.`,
    raw,
  };
}

// -----------------------------------------------------------------
// Hook
// -----------------------------------------------------------------

export function useLiveAV(opts: UseLiveAVOptions): UseLiveAVReturn {
  const {
    syncClient,
    localPeerId,
    sessionId,
    audioConstraints = true,
    videoConstraints = true,
    externalAudioStream,
    _getUserMedia,
    _createPeerMesh,
    _createSignaling,
    _permissions,
  } = opts;

  const sid = sessionId ?? "?";
  const log =
    opts.log ?? {
      log: (msg: string, ...rest: unknown[]) =>
        console.log(`[useLiveAV] avx=${sid} ${msg}`, ...rest),
      warn: (msg: string, ...rest: unknown[]) =>
        console.warn(`[useLiveAV] avx=${sid} ${msg}`, ...rest),
      error: (msg: string, ...rest: unknown[]) =>
        console.error(`[useLiveAV] avx=${sid} ${msg}`, ...rest),
    };

  const [localAudioStream, setLocalAudioStream] =
    useState<MediaStream | null>(null);
  const [localVideoStream, setLocalVideoStream] =
    useState<MediaStream | null>(null);
  const [isAcquiring, setIsAcquiring] = useState<boolean>(false);
  const [error, setError] = useState<AvAcquireError | null>(null);
  const [videoError, setVideoError] = useState<AvAcquireError | null>(null);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  // Cam defaults to muted because no track exists until requestCam
  // succeeds — UI placeholder logic ("Camera off") reads this.
  const [isCamMuted, setIsCamMuted] = useState<boolean>(true);
  const [hasMicPermission, setHasMicPermission] =
    useState<AvPermissionState>("unknown");
  const [hasCamPermission, setHasCamPermission] =
    useState<AvPermissionState>("unknown");
  const [participants, setParticipants] = useState<
    ReadonlyArray<AvParticipant>
  >([]);

  // Refs for things consumed by ref-stable callbacks.
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const meshRef = useRef<PeerMesh | null>(null);
  const isMicMutedRef = useRef<boolean>(false);
  isMicMutedRef.current = isMicMuted;
  const isCamMutedRef = useRef<boolean>(true);
  isCamMutedRef.current = isCamMuted;
  const micInFlightRef = useRef<Promise<void> | null>(null);
  const camInFlightRef = useRef<Promise<void> | null>(null);
  const acquiringCountRef = useRef<number>(0);
  // Tracks whether the hook is unmounted to suppress late state
  // setters from in-flight acquisition promises.
  const unmountedRef = useRef<boolean>(false);
  // Cloned stream derived from externalAudioStream (so live-AV mute
  // doesn't bleed into the recording's own tracks).
  const externalCloneRef = useRef<MediaStream | null>(null);
  // Key of the last successful mesh build. Includes syncClient identity,
  // audio stream id, peerId, sessionId — but NOT video stream id. When
  // only localVideoStream changes (camera added mid-session), the key is
  // the same so we skip teardown+rebuild and let getLocalTracks (which
  // reads from refs) serve new tracks to future peer connections.
  const meshBuildKeyRef = useRef<string>("");

  // ---------------------------------------------------------------
  // Acquisition controls (idempotent)
  // ---------------------------------------------------------------

  function startAcquiring() {
    acquiringCountRef.current += 1;
    if (!unmountedRef.current) setIsAcquiring(true);
  }
  function endAcquiring() {
    acquiringCountRef.current = Math.max(
      0,
      acquiringCountRef.current - 1
    );
    if (!unmountedRef.current) {
      setIsAcquiring(acquiringCountRef.current > 0);
    }
  }

  function resolveGetUserMedia(): UseLiveAVOptions["_getUserMedia"] | null {
    if (_getUserMedia) return _getUserMedia;
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
    ) {
      return navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices
      );
    }
    return null;
  }

  const requestMic = useCallback(
    async (): Promise<void> => {
      if (localAudioStreamRef.current) return; // already acquired (own or external)
      if (externalAudioStream) return; // external stream will wire via effect
      if (micInFlightRef.current) return micInFlightRef.current;

      const getUM = resolveGetUserMedia();
      if (!getUM) {
        const noUM: AvAcquireError = {
          type: "browser-unsupported",
          message:
            "Your browser does not expose `navigator.mediaDevices.getUserMedia`. Use the latest Chrome, Safari, or Firefox.",
          raw: null,
        };
        if (!unmountedRef.current) setError(noUM);
        return;
      }

      startAcquiring();
      if (!unmountedRef.current) setError(null);
      log.log(
        `requestMic start audio=${
          typeof audioConstraints === "boolean"
            ? String(audioConstraints)
            : JSON.stringify(audioConstraints)
        }`
      );

      const inFlight = (async () => {
        try {
          const stream = await getUM({
            audio: audioConstraints,
            video: false,
          });
          if (unmountedRef.current) {
            for (const t of stream.getTracks()) {
              try {
                t.stop();
              } catch {
                /* ignore */
              }
            }
            return;
          }
          if (isMicMutedRef.current) {
            for (const t of stream.getAudioTracks()) t.enabled = false;
          }
          localAudioStreamRef.current = stream;
          setLocalAudioStream(stream);
          setHasMicPermission("granted");
          log.log(
            `mic acquired tracks=${stream.getAudioTracks().length} muted=${isMicMutedRef.current}`
          );
        } catch (err) {
          if (unmountedRef.current) return;
          const classified = classifyMediaError(err, "mic");
          log.warn(
            `mic acquire failed type=${classified.type} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
          setError(classified);
          if (classified.type === "permission-denied") {
            setHasMicPermission("denied");
          }
        } finally {
          endAcquiring();
          micInFlightRef.current = null;
        }
      })();
      micInFlightRef.current = inFlight;
      return inFlight;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [audioConstraints, externalAudioStream]
  );

  const requestCam = useCallback(
    async (): Promise<void> => {
      if (localVideoStreamRef.current) return;
      if (camInFlightRef.current) return camInFlightRef.current;

      const getUM = resolveGetUserMedia();
      if (!getUM) {
        const noUM: AvAcquireError = {
          type: "browser-unsupported",
          message:
            "Your browser does not expose `navigator.mediaDevices.getUserMedia`.",
          raw: null,
        };
        if (!unmountedRef.current) setVideoError(noUM);
        return;
      }

      startAcquiring();
      if (!unmountedRef.current) setVideoError(null);
      log.log(
        `requestCam start video=${
          typeof videoConstraints === "boolean"
            ? String(videoConstraints)
            : JSON.stringify(videoConstraints)
        }`
      );

      const inFlight = (async () => {
        try {
          const stream = await getUM({
            audio: false,
            video: videoConstraints,
          });
          if (unmountedRef.current) {
            for (const t of stream.getTracks()) {
              try {
                t.stop();
              } catch {
                /* ignore */
              }
            }
            return;
          }
          localVideoStreamRef.current = stream;
          setLocalVideoStream(stream);
          setHasCamPermission("granted");
          // requestCam implies user intent "cam on" — unmute on
          // success regardless of the placeholder isCamMuted=true
          // initial state. Tracks land enabled (the default).
          setIsCamMuted(false);
          log.log(
            `cam acquired tracks=${stream.getVideoTracks().length}`
          );
        } catch (err) {
          if (unmountedRef.current) return;
          const classified = classifyMediaError(err, "cam");
          log.warn(
            `cam acquire failed type=${classified.type} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
          setVideoError(classified);
          if (classified.type === "permission-denied") {
            setHasCamPermission("denied");
          }
        } finally {
          endAcquiring();
          camInFlightRef.current = null;
        }
      })();
      camInFlightRef.current = inFlight;
      return inFlight;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [videoConstraints]
  );

  // ---------------------------------------------------------------
  // Effect: query Permissions API on mount (best-effort)
  // ---------------------------------------------------------------

  useEffect(() => {
    const perm: PermissionsLike | null =
      _permissions !== undefined
        ? _permissions
        : typeof navigator !== "undefined" &&
            (navigator as unknown as { permissions?: PermissionsLike })
              .permissions
          ? ((navigator as unknown as { permissions: PermissionsLike })
              .permissions ?? null)
          : null;
    if (!perm) return;

    let cancelled = false;
    let micStatus: PermissionStatusLike | null = null;
    let camStatus: PermissionStatusLike | null = null;
    const onMicChange = () => {
      if (cancelled || !micStatus) return;
      setHasMicPermission(micStatus.state);
    };
    const onCamChange = () => {
      if (cancelled || !camStatus) return;
      setHasCamPermission(camStatus.state);
    };

    void (async () => {
      try {
        micStatus = await perm.query({ name: "microphone" });
        if (cancelled) return;
        setHasMicPermission(micStatus.state);
        if (typeof micStatus.addEventListener === "function") {
          micStatus.addEventListener("change", onMicChange);
        }
      } catch {
        if (!cancelled) setHasMicPermission("unknown");
      }
      try {
        camStatus = await perm.query({ name: "camera" });
        if (cancelled) return;
        setHasCamPermission(camStatus.state);
        if (typeof camStatus.addEventListener === "function") {
          camStatus.addEventListener("change", onCamChange);
        }
      } catch {
        // Safari throws on `{ name: "camera" }`.
        if (!cancelled) setHasCamPermission("unknown");
      }
    })();

    return () => {
      cancelled = true;
      if (
        micStatus &&
        typeof micStatus.removeEventListener === "function"
      ) {
        try {
          micStatus.removeEventListener("change", onMicChange);
        } catch {
          /* ignore */
        }
      }
      if (
        camStatus &&
        typeof camStatus.removeEventListener === "function"
      ) {
        try {
          camStatus.removeEventListener("change", onCamChange);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------
  // Effect: track unmount (suppresses late state setters)
  // ---------------------------------------------------------------

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      // Stop and release any acquired local streams on unmount so
      // the OS frees the device. For externalAudioStream clones we
      // stop the clone tracks (the originals belong to the recorder).
      const aud = localAudioStreamRef.current;
      if (aud) {
        const isClone = aud === externalCloneRef.current;
        for (const t of aud.getTracks()) {
          try {
            // Only stop self-acquired tracks — cloned tracks share
            // the hardware source with the recording stream; stopping
            // them here would stop the recording mic.
            if (!isClone) t.stop();
          } catch {
            /* ignore */
          }
        }
      }
      const vid = localVideoStreamRef.current;
      if (vid) {
        for (const t of vid.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
      }
      externalCloneRef.current = null;
      localAudioStreamRef.current = null;
      localVideoStreamRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------
  // Effect: sync externalAudioStream into localAudioStream as clone
  //
  // When the workspace recording mic is acquired by useAudioRecorder,
  // it passes the stream here so useLiveAV can use it for WebRTC
  // without a second getUserMedia call. We clone so live-AV mute
  // (track.enabled=false) doesn't bleed into the recording stream.
  // ---------------------------------------------------------------

  useEffect(() => {
    if (!externalAudioStream) {
      // External stream is null. This happens transiently during
      // segment rollover (teardown → new getUserMedia takes ~100ms)
      // OR permanently on recording stop / unmount.
      //
      // We do NOT clear the existing clone here. Clearing would null
      // localAudioStream → trigger the mesh-building effect → tear
      // down all WebRTC connections every ~25-min rollover. Instead,
      // we leave the old clone in place; the old clone's tracks will
      // produce silence (stopped source) but the connection stays up.
      // When the new external stream arrives the effect re-runs and
      // the clone is refreshed with live tracks.
      //
      // The only time we want to clear is on unmount — that is handled
      // in the unmount effect above.
      return;
    }

    // Release any previous self-acquired stream (not a clone).
    const prev = localAudioStreamRef.current;
    const prevClone = externalCloneRef.current;
    if (prev && prev !== prevClone) {
      // Self-acquired — stop its tracks before replacing.
      for (const t of prev.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    }
    // Prior clone tracks: don't stop — they're independent from the
    // source but stopping them explicitly is unnecessary and could
    // cause brief glitches mid-sentence on rollover.

    // Clone: independent enabled state, same hardware source.
    const clone = new MediaStream(
      externalAudioStream.getAudioTracks().map((t) => t.clone())
    );
    if (isMicMutedRef.current) {
      for (const t of clone.getAudioTracks()) t.enabled = false;
    }
    externalCloneRef.current = clone;
    localAudioStreamRef.current = clone;
    if (!unmountedRef.current) {
      setLocalAudioStream(clone);
      setHasMicPermission("granted");
      log.log(
        `externalAudioStream wired tracks=${clone.getAudioTracks().length}`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAudioStream]);

  // ---------------------------------------------------------------
  // Effect: build mesh + signaling, reconcile peers, collect tracks
  // ---------------------------------------------------------------

  useEffect(() => {
    const hasLocalMedia =
      localAudioStream !== null || localVideoStream !== null;
    if (!syncClient || !hasLocalMedia) {
      // Reset key so the next build always triggers a full setup.
      meshBuildKeyRef.current = "";
      setParticipants([]);
      return;
    }
    if (typeof localPeerId !== "string" || localPeerId.length === 0) {
      log.error("missing localPeerId — refusing to build mesh");
      return;
    }

    // Build a key from the dimensions that justify full teardown+rebuild.
    // localVideoStream is intentionally excluded: adding camera mid-session
    // should NOT tear down existing peer connections. getLocalTracks() reads
    // from localVideoStreamRef (always current), so the next peer that
    // connects or reconnects will automatically pick up video tracks.
    const buildKey = [
      "s",
      localAudioStream?.id ?? "",
      localPeerId,
      sessionId ?? "",
    ].join("|");

    if (buildKey === meshBuildKeyRef.current && meshRef.current !== null) {
      // Only localVideoStream changed — skip teardown and rebuild.
      log.log("video stream updated; mesh NOT rebuilt (getLocalTracks ref current)");
      return;
    }
    meshBuildKeyRef.current = buildKey;

    const signalingFactory = _createSignaling ?? createSignaling;
    const meshFactory = _createPeerMesh ?? createPeerMesh;

    let disposed = false;

    const signaling = signalingFactory({
      syncClient,
      localPeerId,
      sessionId,
    });
    const mesh = meshFactory({
      signaling,
      localPeerId,
      sessionId,
      iceServers: getIceServersForBrowser(),
      getLocalTracks: () => {
        const tracks: MediaStreamTrack[] = [];
        const aud = localAudioStreamRef.current;
        if (aud) tracks.push(...aud.getAudioTracks());
        const vid = localVideoStreamRef.current;
        if (vid) tracks.push(...vid.getVideoTracks());
        return tracks;
      },
    });
    meshRef.current = mesh;
    log.log("mesh + signaling built");

    type Internal = {
      role: "tutor" | "student";
      label?: string;
      audioStream: MediaStream;
      hasAudioTrack: boolean;
      videoStream: MediaStream;
      hasVideoTrack: boolean;
      peerConnectionState: RTCPeerConnectionState;
      iceConnectionState: RTCIceConnectionState;
      addedToMesh: boolean;
    };
    const internal = new Map<string, Internal>();

    function rebuild() {
      if (disposed) return;
      const out: AvParticipant[] = [];
      for (const [peerId, entry] of internal.entries()) {
        out.push({
          peerId,
          role: entry.role,
          ...(entry.label !== undefined ? { label: entry.label } : {}),
          audioStream: entry.hasAudioTrack ? entry.audioStream : null,
          videoStream: entry.hasVideoTrack ? entry.videoStream : null,
          peerConnectionState: entry.peerConnectionState,
          iceConnectionState: entry.iceConnectionState,
        });
      }
      out.sort((a, b) =>
        a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0
      );
      setParticipants(out);
    }

    function ensureEntry(
      peerId: string,
      role: "tutor" | "student",
      label?: string
    ): Internal {
      let entry = internal.get(peerId);
      if (!entry) {
        entry = {
          role,
          label,
          audioStream: new MediaStream(),
          hasAudioTrack: false,
          videoStream: new MediaStream(),
          hasVideoTrack: false,
          peerConnectionState: "new",
          iceConnectionState: "new",
          addedToMesh: false,
        };
        internal.set(peerId, entry);
      } else {
        entry.role = role;
        entry.label = label;
      }
      return entry;
    }

    const unsubPeers = syncClient.onRoomPeersChange((peers) => {
      if (disposed) return;
      // Reconcile: addPeer first, then removePeer (so glare
      // resolution sees the new set).
      const incoming = new Set<string>();
      for (const p of peers) {
        incoming.add(p.peerId);
        const entry = ensureEntry(p.peerId, p.role, p.label);
        if (!entry.addedToMesh) {
          entry.addedToMesh = true;
          try {
            mesh.addPeer(p.peerId);
            log.log(`addPeer peer=${p.peerId} role=${p.role}`);
          } catch (err) {
            log.warn(
              `mesh.addPeer threw peer=${p.peerId} err=${
                (err as Error)?.message ?? String(err)
              }`
            );
          }
        }
      }
      for (const [peerId, entry] of [...internal.entries()]) {
        if (incoming.has(peerId)) continue;
        try {
          mesh.removePeer(peerId);
          log.log(`removePeer peer=${peerId}`);
        } catch (err) {
          log.warn(
            `mesh.removePeer threw peer=${peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        }
        for (const t of entry.audioStream.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
        for (const t of entry.videoStream.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
        internal.delete(peerId);
      }
      rebuild();
    });

    const unsubTrack = mesh.onRemoteTrack((peerId, track) => {
      if (disposed) return;
      if (track.kind !== "audio" && track.kind !== "video") {
        log.warn(
          `onRemoteTrack unknown kind=${track.kind} peer=${peerId} — dropping`
        );
        return;
      }
      const entry = internal.get(peerId);
      if (!entry) {
        log.warn(
          `onRemoteTrack for unknown peer ${peerId} — dropping track (no entry; presence not yet observed?)`
        );
        return;
      }
      const targetStream =
        track.kind === "audio" ? entry.audioStream : entry.videoStream;
      try {
        targetStream.addTrack(track);
      } catch (err) {
        log.warn(
          `${track.kind}Stream.addTrack threw peer=${peerId} err=${
            (err as Error)?.message ?? String(err)
          }`
        );
        return;
      }
      if (track.kind === "audio") entry.hasAudioTrack = true;
      else entry.hasVideoTrack = true;
      log.log(
        `track received peer=${peerId} kind=${track.kind}`
      );
      track.addEventListener("ended", () => {
        if (disposed) return;
        try {
          targetStream.removeTrack(track);
        } catch {
          /* ignore */
        }
        if (track.kind === "audio") {
          entry.hasAudioTrack =
            entry.audioStream.getAudioTracks().length > 0;
        } else {
          entry.hasVideoTrack =
            entry.videoStream.getVideoTracks().length > 0;
        }
        rebuild();
      });
      rebuild();
    });

    const unsubPc = mesh.onPeerConnectionStateChange((peerId, state) => {
      if (disposed) return;
      const entry = internal.get(peerId);
      if (!entry) return;
      entry.peerConnectionState = state;
      log.log(`pcState peer=${peerId} state=${state}`);
      rebuild();
    });

    const unsubIce = mesh.onIceConnectionStateChange((peerId, state) => {
      if (disposed) return;
      const entry = internal.get(peerId);
      if (!entry) return;
      entry.iceConnectionState = state;
      log.log(`iceState peer=${peerId} state=${state}`);
      rebuild();
    });

    return () => {
      disposed = true;
      unsubPeers();
      unsubTrack();
      unsubPc();
      unsubIce();
      try {
        mesh.dispose();
      } catch (err) {
        log.warn(
          `mesh.dispose threw: ${(err as Error)?.message ?? String(err)}`
        );
      }
      try {
        signaling.dispose();
      } catch (err) {
        log.warn(
          `signaling.dispose threw: ${(err as Error)?.message ?? String(err)}`
        );
      }
      meshRef.current = null;
      meshBuildKeyRef.current = ""; // reset so next audio stream triggers full rebuild
      for (const entry of internal.values()) {
        for (const t of entry.audioStream.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
        for (const t of entry.videoStream.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
      }
      internal.clear();
      setParticipants([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncClient, localAudioStream, localVideoStream, localPeerId, sessionId]);

  // ---------------------------------------------------------------
  // Public callbacks
  // ---------------------------------------------------------------

  const toggleMic = useCallback(() => {
    const stream = localAudioStreamRef.current;
    setIsMicMuted((prev) => {
      const next = !prev;
      if (stream) {
        for (const t of stream.getAudioTracks()) t.enabled = !next;
      }
      log.log(`toggleMic next=${next ? "muted" : "unmuted"}`);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localVideoStreamRef.current;
    setIsCamMuted((prev) => {
      const next = !prev;
      if (stream) {
        for (const t of stream.getVideoTracks()) t.enabled = !next;
      }
      log.log(`toggleCam next=${next ? "muted" : "unmuted"}`);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reconnectPeer = useCallback((peerId: string) => {
    const mesh = meshRef.current;
    if (!mesh) {
      log.warn(`reconnectPeer ignored — no mesh peer=${peerId}`);
      return;
    }
    try {
      log.log(`reconnectPeer peer=${peerId}`);
      mesh.restart(peerId);
    } catch (err) {
      log.warn(
        `mesh.restart threw peer=${peerId} err=${
          (err as Error)?.message ?? String(err)
        }`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs for retryAcquire to keep its identity stable.
  const requestMicRef = useRef(requestMic);
  requestMicRef.current = requestMic;
  const requestCamRef = useRef(requestCam);
  requestCamRef.current = requestCam;
  const errorRef = useRef(error);
  errorRef.current = error;
  const videoErrorRef = useRef(videoError);
  videoErrorRef.current = videoError;

  const retryAcquire = useCallback(async (): Promise<void> => {
    const tasks: Array<Promise<void>> = [];
    if (errorRef.current) {
      log.log("retryAcquire mic");
      tasks.push(requestMicRef.current());
    }
    if (videoErrorRef.current) {
      log.log("retryAcquire cam");
      tasks.push(requestCamRef.current());
    }
    if (tasks.length === 0) {
      log.log("retryAcquire no-op");
      return;
    }
    await Promise.all(tasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive =
    !!syncClient &&
    ((localAudioStream !== null && error === null) ||
      (localVideoStream !== null && videoError === null));

  return {
    participants,
    localAudioStream,
    localVideoStream,
    isMicMuted,
    isCamMuted,
    toggleMic,
    toggleCam,
    hasMicPermission,
    hasCamPermission,
    requestMic,
    requestCam,
    isAcquiring,
    isActive,
    error,
    videoError,
    reconnectPeer,
    retryAcquire,
  };
}
