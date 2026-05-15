"use client";

/**
 * Live-A/V session hook — Phase 4b.
 *
 * Orchestrates the three pure-JS modules from Phase 4a (sync-client
 * presence channel + signaling muxer + peer-mesh) into a React
 * lifecycle:
 *
 *   1. Acquire the local microphone via `getUserMedia`.
 *   2. Construct a single `signaling` + `peerMesh` per session
 *      (re-built when sync-client or stream change).
 *   3. Track room membership via `syncClient.onRoomPeersChange` and
 *      call `mesh.addPeer` / `mesh.removePeer` accordingly. peer-mesh
 *      then handles WebRTC negotiation; this hook is purely the
 *      glue + React state.
 *   4. Collect inbound remote audio tracks into a per-peer
 *      `MediaStream` so callers can wire them into `<audio
 *      autoplay>` (Phase 4c UI) or a `MediaRecorder` for the upload
 *      outbox (Phase 4b commit 4).
 *
 * Pillar invariants reused from 4a:
 *   - Encrypted-transport trust model is preserved: this hook only
 *     wires modules together. The relay sees nothing it didn't
 *     already see in 4a.
 *   - peer-mesh stays pure-JS (no DOM); this hook owns every
 *     `navigator.mediaDevices` interaction.
 *   - Multi-participant from day one: `participants` is an
 *     array indexed by peerId, not a single "remote" slot. 1:1
 *     tutoring is `participants.length === 1`.
 *
 * Camera support (Phase 4b commit 3): opt-in via `cameraEnabled`.
 * Acquisition is two-step (audio first, video second) so a missing
 * camera does not block the mic — the hook stays active with
 * audio-only and surfaces `videoError` separately. `getLocalTracks`
 * reads both refs on every `addPeer`, so toggling camera before
 * peers connect transparently lights up video for the new peers;
 * toggling AFTER existing peers connected only flips the per-track
 * `.enabled` flag (the spec-correct way to "pause" without
 * re-negotiating). Adding/removing tracks on existing PCs is a
 * peer-mesh API extension reserved for Phase 4d.
 *
 * Recording integration is deferred to Phase 4b commit 4
 * (`remote-stream-recorder.ts`). That module consumes
 * `participants[i].audioStream` and feeds it into the upload outbox
 * via the existing per-stream `streamId: "student:peer-<id>:mic"`
 * convention.
 *
 * Tests: `src/__tests__/dom/useLiveAV.dom.test.tsx`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createPeerMesh,
  type PeerMesh,
  type PeerMeshOptions,
} from "@/lib/av/peer-mesh";
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
   * separately because Phase 4c will distinguish "disconnected"
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

export type UseLiveAVOptions = {
  /**
   * Sync-client instance shared with the whiteboard layer. May be
   * `null` while the workspace is in tutor-solo mode (no
   * `WHITEBOARD_SYNC_URL`). When null, the hook stays fully inert.
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
   * When false the hook does not call `getUserMedia` and does not
   * build a mesh — everything stays in the inert "off" state.
   * Defaults to true. Phase 4d will tie this to a tutor-side
   * "enable live audio" toggle and to permission state.
   */
  enabled?: boolean;
  /**
   * Optional MediaTrackConstraints for the local mic. Defaults to
   * `{ audio: true }`. Pass a deviceId here once the workspace
   * exposes a mic-picker control.
   */
  audioConstraints?: MediaTrackConstraints | boolean;
  /**
   * Enable the local camera. Defaults to false (audio-only, Sarah-
   * pilot default). When true, the hook makes a SECOND
   * `getUserMedia` call after audio acquires; failure of that
   * second call surfaces as {@link UseLiveAVReturn.videoError}
   * without invalidating the live audio session. Wire this to a
   * tutor-side toggle in Phase 4c.
   */
  cameraEnabled?: boolean;
  /**
   * Optional MediaTrackConstraints for the local camera. Ignored
   * when `cameraEnabled` is false. Defaults to `true` (let the
   * browser pick reasonable defaults).
   */
  videoConstraints?: MediaTrackConstraints | boolean;
  /**
   * Test-only override of `navigator.mediaDevices.getUserMedia`.
   * Production omits.
   */
  _getUserMedia?: (
    constraints: MediaStreamConstraints
  ) => Promise<MediaStream>;
  /**
   * Test-only factory override of `createPeerMesh`. Production
   * omits.
   */
  _createPeerMesh?: (opts: PeerMeshOptions) => PeerMesh;
  /**
   * Test-only factory override of `createSignaling`. Production
   * omits.
   */
  _createSignaling?: (opts: SignalingOptions) => Signaling;
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
   * Local mic stream. Null while acquiring, or while errored, or
   * when `enabled === false`.
   */
  localAudioStream: MediaStream | null;
  /**
   * Local camera stream. Null when `cameraEnabled === false`, while
   * the video step is acquiring, or when video acquisition failed
   * (see {@link videoError}). Audio is acquired first; this stream
   * may resolve a few ticks after `localAudioStream`.
   */
  localVideoStream: MediaStream | null;
  /**
   * True while either `getUserMedia` call is in flight (audio +
   * optional video). Flips false once acquisition has settled —
   * even if video failed.
   */
  isAcquiring: boolean;
  /**
   * Latest mic-acquisition error, or null on success / before first
   * attempt. The UI maps `error.type` to copy and an optional
   * "Try again" button (wired via {@link retryAcquire}).
   */
  error: AvAcquireError | null;
  /**
   * Camera-acquisition error, distinct from {@link error}. Non-null
   * here means the mic is live but the camera could not be
   * acquired (most commonly `permission-denied` when the user
   * declined the second prompt). The live audio session is
   * unaffected; the UI can surface "video unavailable" without
   * killing the call.
   */
  videoError: AvAcquireError | null;
  /**
   * True iff the mic is currently muted. Toggling flips
   * `audioTrack.enabled = false` on every local audio track, which
   * propagates over WebRTC as silence (the remote still receives
   * RTP, just no audio).
   */
  isMicMuted: boolean;
  /** Flip the mute state of every local audio track. */
  toggleMic: () => void;
  /**
   * True iff the local camera is off — either because no video
   * track was acquired (cameraEnabled=false, or video acquisition
   * failed) OR because the user toggled it off via
   * {@link toggleCamera}. Phase 4d may add a re-acquire path that
   * flips this back to false; for now it's a track-level
   * `.enabled = false` toggle just like mute.
   */
  isCameraOff: boolean;
  /**
   * Flip the camera-off state. No-op when no video tracks were
   * acquired in the first place. Local preview elements should
   * read `localVideoStream` (which still references the same
   * MediaStream) and render a black placeholder when
   * `isCameraOff` is true.
   */
  toggleCamera: () => void;
  /**
   * Sorted (peerId ascending) list of remote participants. EXCLUDES
   * self. Empty when sync-client is null or no presence frames have
   * arrived. Identity-stable across renders for unchanged peers
   * (per-field updates only).
   */
  participants: ReadonlyArray<AvParticipant>;
  /**
   * Force a WebRTC restart for one peer's connection. Wired to a UI
   * "Reconnect" affordance in Phase 4c. No-op when the peer is no
   * longer in the mesh or when the mesh is not yet built.
   */
  reconnectPeer: (peerId: string) => void;
  /**
   * Retry `getUserMedia` after a `permission-denied` / `no-device` /
   * `device-in-use` error. Triggers the acquisition effect to
   * re-run; resets `error` to null while in flight.
   */
  retryAcquire: () => void;
  /**
   * True iff acquisition succeeded AND the mesh + signaling are
   * built AND sync-client is non-null. UIs render the live-A/V
   * panel iff this is true (or while `isAcquiring` for a "loading"
   * skeleton).
   */
  isActive: boolean;
};

// -----------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------

function classifyMediaError(err: unknown): AvAcquireError {
  const name =
    err instanceof Error ? (err as DOMException).name : "";
  const raw = err;
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      type: "permission-denied",
      message:
        "Microphone access denied. Click the icon next to the address bar, set Microphone to Allow, then retry.",
      raw,
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      type: "no-device",
      message: "No microphone found. Connect a mic and try again.",
      raw,
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      type: "device-in-use",
      message:
        "Microphone is in use by another app (Discord, Teams, …). Close that app, then retry.",
      raw,
    };
  }
  if (
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError"
  ) {
    return {
      type: "constraints-not-met",
      message:
        "The configured microphone is not available. Pick a different device.",
      raw,
    };
  }
  if (name === "TypeError" || name === "NotSupportedError") {
    return {
      type: "browser-unsupported",
      message:
        "Your browser does not support live audio. Use the latest Chrome, Safari, or Firefox.",
      raw,
    };
  }
  return {
    type: "unknown",
    message:
      err instanceof Error && err.message
        ? err.message
        : "Microphone error (unknown). Reload the page and try again.",
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
    enabled = true,
    audioConstraints = true,
    cameraEnabled = false,
    videoConstraints = true,
    _getUserMedia,
    _createPeerMesh,
    _createSignaling,
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
  const [isCameraOff, setIsCameraOff] = useState<boolean>(false);
  const [participants, setParticipants] = useState<
    ReadonlyArray<AvParticipant>
  >([]);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Refs for things consumed by ref-stable callbacks.
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const meshRef = useRef<PeerMesh | null>(null);
  const isMicMutedRef = useRef<boolean>(false);
  isMicMutedRef.current = isMicMuted;
  const isCameraOffRef = useRef<boolean>(false);
  isCameraOffRef.current = isCameraOff;

  // ---------------------------------------------------------------
  // Effect: mic acquisition
  // ---------------------------------------------------------------

  useEffect(() => {
    if (!enabled) {
      setLocalAudioStream(null);
      setLocalVideoStream(null);
      setIsAcquiring(false);
      setError(null);
      setVideoError(null);
      return;
    }
    let cancelled = false;
    setIsAcquiring(true);
    setError(null);
    setVideoError(null);

    const getUM =
      _getUserMedia ??
      (typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
        ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        : null);

    if (!getUM) {
      const noUM: AvAcquireError = {
        type: "browser-unsupported",
        message:
          "Your browser does not expose `navigator.mediaDevices.getUserMedia`. Use the latest Chrome, Safari, or Firefox.",
        raw: null,
      };
      setError(noUM);
      setIsAcquiring(false);
      return;
    }

    log.log(
      `acquire start retry=${retryCount} audio=${
        typeof audioConstraints === "boolean"
          ? String(audioConstraints)
          : JSON.stringify(audioConstraints)
      } video=${cameraEnabled ? "on" : "off"}`
    );

    void (async () => {
      // Step 1: audio (required). Failure of this step aborts the
      // session — there's no live A/V without audio.
      let audioStream: MediaStream;
      try {
        audioStream = await getUM({
          audio: audioConstraints,
          video: false,
        });
      } catch (err) {
        if (cancelled) return;
        const classified = classifyMediaError(err);
        log.warn(
          `mic acquire failed type=${classified.type} err=${
            (err as Error)?.message ?? String(err)
          }`
        );
        setError(classified);
        setIsAcquiring(false);
        localStreamRef.current = null;
        setLocalAudioStream(null);
        return;
      }
      if (cancelled) {
        for (const t of audioStream.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (isMicMutedRef.current) {
        for (const t of audioStream.getAudioTracks()) t.enabled = false;
      }
      localStreamRef.current = audioStream;
      setLocalAudioStream(audioStream);
      log.log(
        `mic acquired tracks=${audioStream.getAudioTracks().length} muted=${isMicMutedRef.current}`
      );

      // Step 2: video (optional). Failure here surfaces as
      // `videoError` but does NOT invalidate the audio session.
      if (cameraEnabled) {
        let videoStream: MediaStream | null = null;
        try {
          videoStream = await getUM({
            audio: false,
            video: videoConstraints,
          });
        } catch (err) {
          if (cancelled) return;
          const classified = classifyMediaError(err);
          log.warn(
            `camera acquire failed type=${classified.type} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
          setVideoError(classified);
          setIsCameraOff(true);
          localVideoStreamRef.current = null;
          setLocalVideoStream(null);
        }
        if (cancelled) {
          if (videoStream) {
            for (const t of videoStream.getTracks()) {
              try {
                t.stop();
              } catch {
                /* ignore */
              }
            }
          }
          return;
        }
        if (videoStream) {
          if (isCameraOffRef.current) {
            for (const t of videoStream.getVideoTracks())
              t.enabled = false;
          }
          localVideoStreamRef.current = videoStream;
          setLocalVideoStream(videoStream);
          log.log(
            `camera acquired tracks=${videoStream.getVideoTracks().length} off=${isCameraOffRef.current}`
          );
        }
      } else {
        // cameraEnabled=false → unconditionally mark camera off so
        // UI can render the placeholder.
        setIsCameraOff(true);
      }

      setIsAcquiring(false);
    })();

    return () => {
      cancelled = true;
      const aud = localStreamRef.current;
      if (aud) {
        for (const t of aud.getTracks()) {
          try {
            t.stop();
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
      localStreamRef.current = null;
      localVideoStreamRef.current = null;
      setLocalAudioStream(null);
      setLocalVideoStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    retryCount,
    audioConstraints,
    cameraEnabled,
    videoConstraints,
  ]);

  // ---------------------------------------------------------------
  // Effect: build mesh + signaling, reconcile peers, collect tracks
  // ---------------------------------------------------------------

  useEffect(() => {
    if (!enabled || !syncClient || !localAudioStream) {
      setParticipants([]);
      return;
    }
    if (typeof localPeerId !== "string" || localPeerId.length === 0) {
      log.error("missing localPeerId — refusing to build mesh");
      return;
    }

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
      getLocalTracks: () => {
        const tracks: MediaStreamTrack[] = [];
        const aud = localStreamRef.current;
        if (aud) tracks.push(...aud.getAudioTracks());
        const vid = localVideoStreamRef.current;
        if (vid) tracks.push(...vid.getVideoTracks());
        return tracks;
      },
    });
    meshRef.current = mesh;

    // Internal state — per-peer entry, mutated in-place by the
    // various callbacks below. `setParticipants` reads this map and
    // builds a fresh array on every change.
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
      const incoming = new Set<string>();
      for (const p of peers) {
        incoming.add(p.peerId);
        const entry = ensureEntry(p.peerId, p.role, p.label);
        if (!entry.addedToMesh) {
          entry.addedToMesh = true;
          try {
            mesh.addPeer(p.peerId);
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
        } catch (err) {
          log.warn(
            `mesh.removePeer threw peer=${peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        }
        // Stop any in-flight remote tracks so resources free up.
        for (const t of entry.audioStream.getTracks()) {
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
        // addTrack throws if the same track is added twice. We
        // tolerate that — the second event from a re-negotiation
        // simply lands as a no-op.
        log.warn(
          `${track.kind}Stream.addTrack threw peer=${peerId} err=${
            (err as Error)?.message ?? String(err)
          }`
        );
        return;
      }
      if (track.kind === "audio") entry.hasAudioTrack = true;
      else entry.hasVideoTrack = true;
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
      rebuild();
    });

    const unsubIce = mesh.onIceConnectionStateChange((peerId, state) => {
      if (disposed) return;
      const entry = internal.get(peerId);
      if (!entry) return;
      entry.iceConnectionState = state;
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
  }, [enabled, syncClient, localAudioStream, localPeerId, sessionId]);

  // ---------------------------------------------------------------
  // Public callbacks
  // ---------------------------------------------------------------

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
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

  const toggleCamera = useCallback(() => {
    const stream = localVideoStreamRef.current;
    setIsCameraOff((prev) => {
      const next = !prev;
      if (stream) {
        for (const t of stream.getVideoTracks()) t.enabled = !next;
      }
      log.log(`toggleCamera next=${next ? "off" : "on"}`);
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

  const retryAcquire = useCallback(() => {
    log.log("retryAcquire");
    setRetryCount((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive =
    enabled &&
    !!syncClient &&
    !!localAudioStream &&
    error === null;

  return {
    localAudioStream,
    localVideoStream,
    isAcquiring,
    error,
    videoError,
    isMicMuted,
    toggleMic,
    isCameraOff,
    toggleCamera,
    participants,
    reconnectPeer,
    retryAcquire,
    isActive,
  };
}
