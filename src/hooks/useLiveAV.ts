"use client";

/**
 * Live-A/V session hook ΓÇö Phase 4b (post-realignment).
 *
 * Orchestrates the three pure-JS modules from Phase 4a (sync-client
 * presence channel + signaling muxer + peer-mesh) into a React
 * lifecycle. Final 4b contract ΓÇö supersedes the auto-acquire shape
 * from commits 7fb9d65 / 7ff7a04. See `docs/PHASE-4B-STATUS.md`.
 *
 * Acquisition contract:
 *   - The hook is INERT on mount. It does NOT call `getUserMedia`.
 *   - Mic is acquired via `requestMic(): Promise<void>`; camera via
 *     `requestCam(): Promise<void>`. The two requests are
 *     independent ΓÇö Phase 4d's graceful-degradation paths
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
 * peers connected only flips local `.enabled` flags ΓÇö adding new
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
  loadStoredVideoDeviceId,
  loadStoredVideoGroupId,
  saveStoredVideoDeviceId,
  saveStoredVideoGroupId,
} from "@/lib/recording/storage";

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
   * Live remote audio stream ΓÇö null until at least one audio track
   * lands on the underlying RTCPeerConnection. Wire into
   * `<audio autoplay srcObject={p.audioStream} />` or pipe through
   * `MediaRecorder` for capture.
   */
  audioStream: MediaStream | null;
  /**
   * Live remote video stream ΓÇö null until at least one video track
   * lands on the underlying RTCPeerConnection (which only happens
   * when the remote peer enabled their camera). Wire into
   * `<video autoplay playsInline srcObject={p.videoStream} muted />`.
   * (Always set `muted` on the local-side `<video>` so audio comes
   * exclusively from the `audioStream` companion ΓÇö avoids double
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
   * sync-client uses for its own envelope `peerId` ΓÇö peer-mesh's
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
  /**
   * Tutor workspace: `workspaceAudio.swapMicDevice` so hardware mic swaps
   * flow through the recording Web Audio graph; {@link setMicDevice} then
   * refreshes WebRTC via {@link PeerMesh.replaceLocalTrackOnAllPeers}.
   */
  swapMicDevice?: (deviceId: string) => Promise<void>;
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
  /**
   * Subset of `participants` where WebRTC is confirmed healthy:
   * `peerConnectionState === "connected"` AND
   * `iceConnectionState Γêê {connected, completed}`.
   *
   * Use this ΓÇö not raw `participants` ΓÇö for: the recording gate
   * (FSM `participants` input), the session timer gate, and any
   * "call connected" UI indicator. Routing sync-only presence through
   * these gates is the split-brain bug: the media path can die while
   * the sync socket survives, causing recording to continue with
   * tutor-only audio and the timer to bill a dead call.
   *
   * Sorted (peerId ascending) for stable downstream memoisation.
   */
  reachableParticipants: ReadonlyArray<AvParticipant>;
  /** Local mic stream. Null until `requestMic()` succeeds. */
  localAudioStream: MediaStream | null;
  /** Local camera stream. Null until `requestCam()` succeeds. */
  localVideoStream: MediaStream | null;
  /**
   * True iff the local mic is muted (`track.enabled === false` on
   * every local audio track). Mute is local-only ΓÇö wire-level mute
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
   * `navigator.permissions.query({ name: "camera" })` ΓÇö that case
   * surfaces as `"unknown"`.
   */
  hasCamPermission: AvPermissionState;
  /**
   * Request mic access via `getUserMedia({ audio: true })`. On
   * success, populates `localAudioStream` and (if the mesh + sync
   * client are also ready) builds the mesh. On error, populates
   * `error` and updates `hasMicPermission` to `"denied"` for
   * `NotAllowedError`. Idempotent ΓÇö calling while a request is in
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
  /**
   * Video inputs (labels populate after camera permission). Updates on
   * successful `requestCam()` and on `devicechange`.
   */
  videoDevices: ReadonlyArray<MediaDeviceInfo>;
  /** Device id from the active local video track; null before camera grant. */
  selectedVideoDeviceId: string | null;
  /**
   * Index into {@link videoDevices} for the camera picker UI. Enumeration order
   * can change on hotplug; pairing with slots fixes OEMs that duplicate `deviceId`.
   */
  pickedVideoCameraSlot: number;
  /**
   * Switch camera using an enumerate slot (preferred). Matches the Motorola /
   * multi-lens duplicate-`deviceId` case reliably when combined with {@link videoDevices}.
   */
  setVideoCameraBySlot: (
    slotIndex: number,
    opts?: { force?: boolean }
  ) => Promise<void>;
  /**
   * Switch the local camera to a specific device. Stops the prior video
   * track, updates peers via `replaceTrack`, and persists the choice.
   */
  setVideoDevice: (deviceId: string) => Promise<void>;
  /**
   * Switch microphone hardware. With `swapMicDevice` from the workspace,
   * delegates to the recorder; otherwise uses a self-acquired stream swap.
   */
  setMicDevice: (deviceId: string) => Promise<void>;
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
      message: `${device} is in use by another app (Discord, Teams, ΓÇª). Close that app, then retry.`,
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

function reconcilePickerSlotAfterEnumerate(
  preferredDeviceId: string | null,
  list: MediaDeviceInfo[],
  prevSlot: number,
  pinnedGroupId: string
): number {
  if (list.length === 0) return 0;
  const max = list.length - 1;
  const clamped = Math.max(0, Math.min(prevSlot, max));
  if (!preferredDeviceId) return clamped;

  const atPrev = list[clamped];
  if (
    atPrev?.deviceId === preferredDeviceId &&
    (!pinnedGroupId ||
      !atPrev.groupId ||
      atPrev.groupId === pinnedGroupId)
  ) {
    return clamped;
  }

  if (pinnedGroupId) {
    const byPinned = list.findIndex(
      (d) =>
        d.deviceId === preferredDeviceId && d.groupId === pinnedGroupId
    );
    if (byPinned >= 0) return byPinned;
  }

  const idx = list.findIndex((d) => d.deviceId === preferredDeviceId);
  if (idx >= 0) return idx;

  return clamped;
}

function fingerprintVideoTrackSettings(s: MediaTrackSettings): string {
  return `${s.deviceId ?? ""}|${s.groupId ?? ""}`;
}

function videoinputsHaveDuplicateIds(list: MediaDeviceInfo[]): boolean {
  const ids = list.map((d) => d.deviceId);
  if (ids.length >= 2 && ids.filter((id) => !id || id === "").length >= 2) {
    return true;
  }
  const nonEmpty = ids.filter(Boolean);
  return nonEmpty.length !== new Set(nonEmpty).size;
}

/**
 * Rough facing hint ΓÇö OEM labels vary; Motorola often omits trustworthy `groupId`.
 */
function facingModeGuessFromCameraLabel(
  label: string
): "user" | "environment" | null {
  const l = label.toLowerCase();
  if (
    /\b(back|rear|environment|r├╝ck|trasera|world|telephoto|wide)\b/.test(l) ||
    /\b\d+x\b/i.test(l)
  ) {
    return "environment";
  }
  if (/\b(front|user|face|selfie|facetime)\b/.test(l)) return "user";
  return null;
}

function disposeStreamTracks(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const t of stream.getTracks()) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Brief pause after `track.stop()` so Qualcomm/Moto camera HAL can reopen a
 * *different* lens; opening immediately often returns the same sensor.
 */
function releaseMotorolaCamDelayMs(): Promise<void> {
  return new Promise((r) => setTimeout(r, 55));
}

/**
 * Some Android OEMs duplicate `deviceId` or ignore bundled constraints.
 * Retry with progressively looser/stricter pairing, and optionally require a
 * different `MediaTrackSettings` fingerprint when switching among siblings.
 */
async function getUserMediaVideoForEnumerateEntry(
  getUM: (c: MediaStreamConstraints) => Promise<MediaStream>,
  entry: MediaDeviceInfo,
  allVideoinputs: MediaDeviceInfo[],
  priorFingerprint: string | null,
  slotIndex: number
): Promise<{ stream: MediaStream; fingerprint: string }> {
  const dupIds = videoinputsHaveDuplicateIds(allVideoinputs);
  const facing = facingModeGuessFromCameraLabel(entry.label ?? "");

  const requireDifferent =
    priorFingerprint !== null && allVideoinputs.length > 1;

  type TryVideo = MediaTrackConstraints | boolean;
  const attempts: TryVideo[] = [];

  if (dupIds && facing) {
    attempts.push(
      { facingMode: { ideal: facing } },
      { facingMode: { exact: facing } }
    );
  }

  if (!facing && dupIds && allVideoinputs.length === 2) {
    const primary =
      slotIndex >= 1 ? ("environment" as const) : ("user" as const);
    const secondary = primary === "user" ? ("environment" as const) : ("user" as const);
    attempts.unshift(
      { facingMode: { ideal: secondary } },
      { facingMode: { exact: secondary } },
      { facingMode: { ideal: primary } },
      { facingMode: { exact: primary } }
    );
  }

  const baseIdeal: MediaTrackConstraints = {};
  if (entry.deviceId) baseIdeal.deviceId = { ideal: entry.deviceId };
  if (entry.groupId) baseIdeal.groupId = { ideal: entry.groupId };
  if (Object.keys(baseIdeal).length > 0) attempts.push(baseIdeal);

  if (entry.deviceId) {
    attempts.push({
      deviceId: { exact: entry.deviceId },
      ...(entry.groupId ? { groupId: { ideal: entry.groupId } } : {}),
    });
    attempts.push({ deviceId: { exact: entry.deviceId } });
  }

  if (entry.groupId) {
    attempts.push({ groupId: { ideal: entry.groupId } });
    attempts.push({ groupId: { exact: entry.groupId } });
  }

  if (!dupIds && facing) {
    attempts.push(
      { facingMode: { ideal: facing } },
      { facingMode: { exact: facing } }
    );
  }

  attempts.push(true);

  let lastErr: unknown = null;
  for (const vid of attempts) {
    let stream: MediaStream;
    try {
      stream = await getUM({
        audio: false,
        video: vid,
      });
    } catch (e) {
      lastErr = e;
      continue;
    }

    const t = stream.getVideoTracks()[0];
    const fp =
      fingerprintVideoTrackSettings(t?.getSettings?.() ?? {}) || "|";

    const looksUnchanged =
      requireDifferent && priorFingerprint !== null && fp === priorFingerprint;

    if (!looksUnchanged) {
      return { stream, fingerprint: fp };
    }

    logDevSwitch(
      `cam-pick discarded same-fingerprint fps=${priorFingerprint ?? "<none>"} attempt=${typeof vid === "boolean" ? "true" : "obj"}`
    );
    disposeStreamTracks(stream);
  }

  try {
    const fallback = await getUM({ audio: false, video: true });
    const t = fallback.getVideoTracks()[0];
    if (!t) {
      disposeStreamTracks(fallback);
    } else {
      console.warn(
        `[useLiveAV] cam picker exhausted constraints; fingerprints may collide on this device`
      );
      return {
        stream: fallback,
        fingerprint: fingerprintVideoTrackSettings(t.getSettings?.() ?? {}),
      };
    }
  } catch {
    /* fall through */
  }

  throw lastErr instanceof Error
    ? lastErr
    : new DOMException(String(lastErr ?? "constraints failed"));
}

/** Dev-only breadcrumbs for Motorola-class camera swaps (no noisy prod logs). */
function logDevSwitch(msg: string): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[useLiveAV] ${msg}`);
  }
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
    swapMicDevice: swapMicFromRecorder,
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
  // Latches true the first time EITHER `localAudioStream` or
  // `localVideoStream` becomes non-null and stays true for the
  // lifetime of the hook. The mesh-build effect gates on this rather
  // than on stream identity so adding a SECOND stream (e.g. tutor
  // grants mic first, cam second) does NOT trigger a mesh teardown +
  // rebuild ΓÇö which would otherwise drop every remote peer's media
  // for ~5s while the new mesh re-negotiates. Late-arriving tracks
  // are routed through `mesh.addLocalTrackToAllPeers` in a separate
  // effect; perfect-negotiation handles the SDP refresh in-place.
  const [hasEverHadLocalMedia, setHasEverHadLocalMedia] =
    useState<boolean>(false);
  const [isAcquiring, setIsAcquiring] = useState<boolean>(false);
  const [error, setError] = useState<AvAcquireError | null>(null);
  const [videoError, setVideoError] = useState<AvAcquireError | null>(null);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  // Cam defaults to muted because no track exists until requestCam
  // succeeds ΓÇö UI placeholder logic ("Camera off") reads this.
  const [isCamMuted, setIsCamMuted] = useState<boolean>(true);
  const [hasMicPermission, setHasMicPermission] =
    useState<AvPermissionState>("unknown");
  const [hasCamPermission, setHasCamPermission] =
    useState<AvPermissionState>("unknown");
  const [participants, setParticipants] = useState<
    ReadonlyArray<AvParticipant>
  >([]);
  const [reachableParticipants, setReachableParticipants] = useState<
    ReadonlyArray<AvParticipant>
  >([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<
    string | null
  >(null);
  const [pickedVideoCameraSlot, setPickedVideoCameraSlot] = useState(0);

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
  // Tracks whether the current localAudioStream comes from
  // externalAudioStream (so we don't stop its tracks ΓÇö those belong to
  // the recorder hook).
  const audioFromExternalRef = useRef<boolean>(false);
  /** Latest enumerated cameras + picker slot ΓÇö read inside async enumeration. */
  const videoDevicesRef = useRef<MediaDeviceInfo[]>([]);
  const selectedVideoDeviceIdRef = useRef<string | null>(null);
  const pickedVideoCameraSlotRef = useRef(0);
  /** Disambiguates duplicate OEM `deviceId` rows via last-known `MediaDeviceInfo.groupId`. */
  const pinnedVideoEnumerateGroupRef = useRef("");

  videoDevicesRef.current = videoDevices;
  selectedVideoDeviceIdRef.current = selectedVideoDeviceId;
  pickedVideoCameraSlotRef.current = pickedVideoCameraSlot;

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

  const refreshVideoDevices = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoinputs = all.filter((d) => d.kind === "videoinput");
      if (!unmountedRef.current) {
        videoDevicesRef.current = videoinputs;
        setVideoDevices(videoinputs);
      }
    } catch (err) {
      log.warn(
        `video enumerateDevices failed: ${(err as Error)?.message ?? String(err)}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log from opts is stable for session
  }, [log]);

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
          setHasEverHadLocalMedia(true);
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log + resolveGetUserMedia stable per session
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
          const storedVid = loadStoredVideoDeviceId();
          const storedGrp = loadStoredVideoGroupId();
          let effectiveVideo: MediaTrackConstraints | boolean = videoConstraints;
          if (videoConstraints === true) {
            effectiveVideo = storedVid
              ? {
                  deviceId: { exact: storedVid },
                  ...(storedGrp ? { groupId: { ideal: storedGrp } } : {}),
                }
              : true;
          } else if (
            typeof videoConstraints === "object" &&
            videoConstraints !== null &&
            storedVid &&
            !(videoConstraints as MediaTrackConstraints).deviceId
          ) {
            effectiveVideo = {
              ...(videoConstraints as MediaTrackConstraints),
              deviceId: { exact: storedVid },
              ...(storedGrp ? { groupId: { ideal: storedGrp } } : {}),
            };
          }
          const stream = await getUM({
            audio: false,
            video: effectiveVideo,
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
          setHasEverHadLocalMedia(true);
          setHasCamPermission("granted");
          // requestCam implies user intent "cam on" ΓÇö unmute on
          // success regardless of the placeholder isCamMuted=true
          // initial state. Tracks land enabled (the default).
          setIsCamMuted(false);
          log.log(
            `cam acquired tracks=${stream.getVideoTracks().length}`
          );
          const vt = stream.getVideoTracks()[0];
          const gst = vt?.getSettings?.();
          const devId = gst?.deviceId;
          if (devId) {
            selectedVideoDeviceIdRef.current = devId;
            setSelectedVideoDeviceId(devId);
            saveStoredVideoDeviceId(devId);
          }
          if (gst?.groupId) {
            saveStoredVideoGroupId(gst.groupId);
            pinnedVideoEnumerateGroupRef.current = gst.groupId;
          } else {
            pinnedVideoEnumerateGroupRef.current = "";
          }
          await refreshVideoDevices();
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log + resolveGetUserMedia stable per session
    [videoConstraints, refreshVideoDevices]
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
  // Effect: refresh video device list when hardware changes
  // ---------------------------------------------------------------

  useEffect(() => {
    if (typeof window === "undefined") return;

    void refreshVideoDevices();

    const md = navigator.mediaDevices;
    const onDeviceChange = () => {
      void refreshVideoDevices();
    };
    md?.addEventListener?.("devicechange", onDeviceChange);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshVideoDevices();
      }
    };

    const onFocus = () => {
      void refreshVideoDevices();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      md?.removeEventListener?.("devicechange", onDeviceChange);
    };
  }, [refreshVideoDevices]);

  // ---------------------------------------------------------------
  // Effect: keep camera picker slot aligned with enumerated order +
  // `pinnedVideoEnumerateGroupRef` when OEM rows share a `deviceId`.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (videoDevices.length === 0) {
      setPickedVideoCameraSlot(0);
      return;
    }
    setPickedVideoCameraSlot((prev) =>
      reconcilePickerSlotAfterEnumerate(
        selectedVideoDeviceId,
        videoDevices,
        prev,
        pinnedVideoEnumerateGroupRef.current
      )
    );
  }, [videoDevices, selectedVideoDeviceId]);

  // ---------------------------------------------------------------
  // Effect: track unmount (suppresses late state setters)
  // ---------------------------------------------------------------

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      // Stop and release any acquired local streams on unmount so
      // the OS frees the device. For externalAudioStream we DON'T
      // stop the tracks ΓÇö they belong to the recorder.
      const aud = localAudioStreamRef.current;
      if (aud && !audioFromExternalRef.current) {
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
      audioFromExternalRef.current = false;
      localAudioStreamRef.current = null;
      localVideoStreamRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------
  // Effect: wire externalAudioStream into localAudioStream
  //
  // When the workspace recording mic is acquired by useAudioRecorder,
  // it passes a DEDICATED publishStream here (one of two Web Audio
  // destinations downstream of the source+gain pipeline). We use it
  // directly ΓÇö no cloning, no second getUserMedia. The recording's
  // recordingStream is a SEPARATE Web Audio destination, so muting
  // this stream's track via toggleMic does NOT affect recording.
  //
  // Cloning was tried and caused Chrome to send no audio data on the
  // WebRTC track even though the Web Audio source captured fine ΓÇö a
  // known issue with two MediaStreamTrack consumers of the same
  // hardware mic. Web Audio fan-out avoids that entirely.
  // ---------------------------------------------------------------

  useEffect(() => {
    if (!externalAudioStream) {
      // External stream withdrawn. Only clear if we're currently using
      // an external stream. Self-acquired streams (requestMic path) are
      // left untouched.
      if (audioFromExternalRef.current) {
        audioFromExternalRef.current = false;
        localAudioStreamRef.current = null;
        if (!unmountedRef.current) setLocalAudioStream(null);
      }
      return;
    }

    // Release any previous self-acquired stream before adopting the
    // external one. (External streams are NOT stopped ΓÇö they belong
    // to the recorder hook.)
    const prev = localAudioStreamRef.current;
    if (prev && !audioFromExternalRef.current) {
      for (const t of prev.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    }

    // Apply current mute state to the stream's tracks. Note this is
    // fine ΓÇö the recordingStream is a separate Web Audio destination,
    // so disabling these tracks does NOT silence the MediaRecorder.
    if (isMicMutedRef.current) {
      for (const t of externalAudioStream.getAudioTracks()) t.enabled = false;
    } else {
      for (const t of externalAudioStream.getAudioTracks()) t.enabled = true;
    }
    audioFromExternalRef.current = true;
    localAudioStreamRef.current = externalAudioStream;
    if (!unmountedRef.current) {
      setLocalAudioStream(externalAudioStream);
      setHasEverHadLocalMedia(true);
      setHasMicPermission("granted");
      log.log(
        `externalAudioStream wired tracks=${externalAudioStream.getAudioTracks().length}`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAudioStream]);

  // ---------------------------------------------------------------
  // Effect: build mesh + signaling, reconcile peers, collect tracks
  // ---------------------------------------------------------------

  useEffect(() => {
    // Build the mesh once the local peer has acquired its FIRST
    // stream (mic OR cam ΓÇö either is enough). After that point, the
    // mesh stays up; later stream additions are reconciled by the
    // `addLocalTrackToAllPeers` effect below WITHOUT a teardown.
    //
    // Deliberately NOT depending on `localAudioStream` /
    // `localVideoStream` identity here ΓÇö that was the pre-May-15
    // bug that dropped son's audio + video when the tutor clicked
    // "Allow camera" mid-session.
    if (!syncClient || !hasEverHadLocalMedia) {
      setParticipants([]);
      return;
    }
    if (typeof localPeerId !== "string" || localPeerId.length === 0) {
      log.error("missing localPeerId ΓÇö refusing to build mesh");
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
      const reachable: AvParticipant[] = [];
      for (const [peerId, entry] of internal.entries()) {
        const p: AvParticipant = {
          peerId,
          role: entry.role,
          ...(entry.label !== undefined ? { label: entry.label } : {}),
          audioStream: entry.hasAudioTrack ? entry.audioStream : null,
          videoStream: entry.hasVideoTrack ? entry.videoStream : null,
          peerConnectionState: entry.peerConnectionState,
          iceConnectionState: entry.iceConnectionState,
        };
        out.push(p);
        // A peer is reachable when WebRTC is fully connected at both
        // the PC layer and the ICE layer. Sync-presence alone is not
        // sufficient ΓÇö this is the split-brain guard.
        if (
          entry.peerConnectionState === "connected" &&
          (entry.iceConnectionState === "connected" ||
            entry.iceConnectionState === "completed")
        ) {
          reachable.push(p);
        }
      }
      out.sort((a, b) =>
        a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0
      );
      reachable.sort((a, b) =>
        a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0
      );
      setParticipants(out);
      setReachableParticipants(reachable);
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
          `onRemoteTrack unknown kind=${track.kind} peer=${peerId} ΓÇö dropping`
        );
        return;
      }
      const entry = internal.get(peerId);
      if (!entry) {
        log.warn(
          `onRemoteTrack for unknown peer ${peerId} ΓÇö dropping track (no entry; presence not yet observed?)`
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

    // Stale-peer eviction: if a peer's peerConnectionState stays
    // disconnected or failed for PEER_EVICTION_TIMEOUT_MS, remove it
    // from the internal map so the FSM sees an empty participants set
    // and pauses recording. This catches the split-brain case where
    // the sync socket is alive but the WebRTC media path died.
    const PEER_EVICTION_TIMEOUT_MS = 10_000;
    const evictionTimers = new Map<string, ReturnType<typeof setTimeout>>();

    function scheduleEviction(peerId: string, reason: string): void {
      if (evictionTimers.has(peerId)) return;
      log.warn(
        `peer=${peerId} event=eviction-scheduled reason=${reason} delayMs=${PEER_EVICTION_TIMEOUT_MS}`
      );
      evictionTimers.set(
        peerId,
        setTimeout(() => {
          evictionTimers.delete(peerId);
          if (disposed) return;
          const e = internal.get(peerId);
          if (!e) return;
          // Only evict if still unhealthy. A recovery while the timer
          // was in flight means we should NOT evict.
          const pcState = e.peerConnectionState;
          if (pcState === "connected" || pcState === "connecting" || pcState === "new") {
            log.log(`peer=${peerId} event=eviction-cancelled-on-fire reason=recovered state=${pcState}`);
            return;
          }
          log.warn(
            `[useLiveAV] avx=${sid} peer=${peerId} event=evict-stale reason=${reason}-timeout pcState=${pcState}`
          );
          try {
            mesh.removePeer(peerId);
          } catch {
            // removePeer is idempotent; ignore errors
          }
          for (const t of e.audioStream.getTracks()) {
            try { t.stop(); } catch { /* ignore */ }
          }
          for (const t of e.videoStream.getTracks()) {
            try { t.stop(); } catch { /* ignore */ }
          }
          internal.delete(peerId);
          rebuild();
        }, PEER_EVICTION_TIMEOUT_MS)
      );
    }

    function cancelEviction(peerId: string): void {
      const t = evictionTimers.get(peerId);
      if (t !== undefined) {
        clearTimeout(t);
        evictionTimers.delete(peerId);
      }
    }

    const unsubPc = mesh.onPeerConnectionStateChange((peerId, state) => {
      if (disposed) return;
      const entry = internal.get(peerId);
      if (!entry) return;
      entry.peerConnectionState = state;
      log.log(`pcState peer=${peerId} state=${state}`);

      if (state === "disconnected" || state === "failed") {
        scheduleEviction(peerId, `pc-${state}`);
      } else {
        // Peer recovered ΓÇö cancel any pending eviction.
        cancelEviction(peerId);
      }

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
      // Cancel all stale-peer eviction timers before tearing down.
      for (const timer of evictionTimers.values()) clearTimeout(timer);
      evictionTimers.clear();
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
      setReachableParticipants([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncClient, hasEverHadLocalMedia, localPeerId, sessionId]);

  // ---------------------------------------------------------------
  // Effect: sync late-arriving local tracks into the existing mesh
  //
  // When `localAudioStream` or `localVideoStream` changes AFTER the
  // mesh is built (e.g. tutor granted mic first, then cam later),
  // every track on the new stream is fanned out to all existing
  // peer connections via `mesh.addLocalTrackToAllPeers`. The mesh
  // method is idempotent on track id (checks `pc.getSenders()`), so
  // tracks attached at `addPeer` time via `getLocalTracks` are NOT
  // re-added. We then call `mesh.replaceLocalTrackOnAllPeers` for
  // each attached track so RTP senders that already held that track
  // (same id as prior add/getLocalTracks path) still get an explicit
  // `replaceTrack` ΓÇö mirrors the mic-switch path and avoids the
  // Chrome/WebRTC quirk where remote audio stays silent until a
  // replace happens.
  //
  // Skipped silently when the mesh is not yet built or has been
  // disposed; the host's stream-acquisition path will eventually
  // satisfy the build gate and the next render of this effect will
  // catch up.
  // ---------------------------------------------------------------
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || mesh.isDisposed()) return;
    const audTracks = localAudioStream?.getAudioTracks() ?? [];
    const vidTracks = localVideoStream?.getVideoTracks() ?? [];
    for (const t of audTracks) {
      try {
        mesh.addLocalTrackToAllPeers(t);
        mesh.replaceLocalTrackOnAllPeers("audio", t);
      } catch (err) {
        log.warn(
          `track-sync audio mesh sync threw: ${(err as Error)?.message ?? String(err)}`
        );
      }
    }
    for (const t of vidTracks) {
      try {
        mesh.addLocalTrackToAllPeers(t);
        mesh.replaceLocalTrackOnAllPeers("video", t);
      } catch (err) {
        log.warn(
          `track-sync video mesh sync threw: ${(err as Error)?.message ?? String(err)}`
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- log stable per session
  }, [localAudioStream, localVideoStream]);

  // ---------------------------------------------------------------
  // Public callbacks
  // ---------------------------------------------------------------

  const setVideoCameraBySlot = useCallback(
    async (
      slotIndex: number,
      opts?: { force?: boolean }
    ): Promise<void> => {
      const entry = videoDevicesRef.current[slotIndex];
      if (!entry) {
        log.warn(`event=set-video-slot ignored invalid_slot=${slotIndex}`);
        return;
      }

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

      const curTrack = localVideoStreamRef.current?.getVideoTracks()[0];
      const gs = curTrack?.getSettings?.() ?? {};

      const sameLens =
        !!curTrack &&
        gs.deviceId === entry.deviceId &&
        (!entry.groupId ||
          !gs.groupId ||
          gs.groupId === entry.groupId);
      if (
        !opts?.force &&
        pickedVideoCameraSlotRef.current === slotIndex &&
        sameLens
      ) {
        log.log(`event=set-video-slot no-op slot=${slotIndex}`);
        return;
      }

      startAcquiring();
      try {
        const siblings = videoDevicesRef.current;
        const priorFp = curTrack
          ? fingerprintVideoTrackSettings(gs ?? {})
          : null;
        const hadVideo =
          !!localVideoStreamRef.current?.getVideoTracks().length;

        if (hadVideo) {
          disposeStreamTracks(localVideoStreamRef.current);
          await releaseMotorolaCamDelayMs();
        }

        const { stream } = await getUserMediaVideoForEnumerateEntry(
          getUM,
          entry,
          siblings,
          priorFp,
          slotIndex
        );
        const newTrack = stream.getVideoTracks()[0];
        if (!newTrack) {
          disposeStreamTracks(stream);
          if (!unmountedRef.current) {
            const empty: AvAcquireError = {
              type: "no-device",
              message: "No video track from the selected camera.",
              raw: null,
            };
            setVideoError(empty);
            localVideoStreamRef.current = null;
            setLocalVideoStream(null);
          }
          return;
        }
        if (unmountedRef.current) {
          disposeStreamTracks(stream);
          return;
        }
        const ms = new MediaStream([newTrack]);
        if (isCamMutedRef.current) newTrack.enabled = false;
        localVideoStreamRef.current = ms;
        setLocalVideoStream(ms);
        setVideoError(null);

        const gst = newTrack.getSettings?.();
        const devIdPersist = gst?.deviceId ?? entry.deviceId;
        pinnedVideoEnumerateGroupRef.current =
          gst?.groupId ?? entry.groupId ?? "";
        selectedVideoDeviceIdRef.current =
          devIdPersist.length > 0 ? devIdPersist : null;
        if (devIdPersist) {
          setSelectedVideoDeviceId(devIdPersist);
          saveStoredVideoDeviceId(devIdPersist);
        }
        if (gst?.groupId) {
          saveStoredVideoGroupId(gst.groupId);
        }

        setPickedVideoCameraSlot(slotIndex);

        const mesh = meshRef.current;
        if (mesh && !mesh.isDisposed()) {
          mesh.replaceLocalTrackOnAllPeers("video", newTrack);
        }
        await refreshVideoDevices();
        log.log(
          `event=set-video-slot slot=${slotIndex} deviceId=${devIdPersist.length > 0 ? devIdPersist : "<empty>"}`
        );
      } catch (err) {
        if (!unmountedRef.current) {
          localVideoStreamRef.current = null;
          setLocalVideoStream(null);
        }
        if (unmountedRef.current) return;
        const classified = classifyMediaError(err, "cam");
        log.warn(
          `setVideoCameraBySlot failed type=${classified.type} err=${
            (err as Error)?.message ?? String(err)
          }`
        );
        setVideoError(classified);
      } finally {
        endAcquiring();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log stable per session
    [log, refreshVideoDevices]
  );

  const setVideoDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      const slots = videoDevicesRef.current;
      const slotIdx = slots.findIndex((d) => d.deviceId === deviceId);
      if (slotIdx >= 0) {
        return setVideoCameraBySlot(slotIdx, { force: true });
      }

      pinnedVideoEnumerateGroupRef.current = "";
      const cur =
        localVideoStreamRef.current?.getVideoTracks()[0]?.getSettings()
          ?.deviceId;
      if (cur === deviceId) {
        log.log(`event=set-video-device no-op deviceId=${deviceId}`);
        return;
      }

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
      try {
        const pseudoEntry = {
          deviceId,
          label: "",
          groupId: "",
          kind: "videoinput" as const,
          toJSON() {
            return this;
          },
        } as MediaDeviceInfo;

        const siblings = videoDevicesRef.current;
        const curVTrack =
          localVideoStreamRef.current?.getVideoTracks()[0];
        const priorGs = curVTrack?.getSettings?.() ?? {};
        const priorFp = curVTrack
          ? fingerprintVideoTrackSettings(priorGs)
          : null;
        const hintSlotRaw = siblings.findIndex(
          (d) => d.deviceId === deviceId
        );
        const hintSlot =
          hintSlotRaw >= 0 ? hintSlotRaw : 0;

        const hadVideo =
          !!localVideoStreamRef.current?.getVideoTracks().length;

        if (hadVideo) {
          disposeStreamTracks(localVideoStreamRef.current);
          await releaseMotorolaCamDelayMs();
        }

        const { stream } = await getUserMediaVideoForEnumerateEntry(
          getUM,
          pseudoEntry,
          siblings,
          priorFp,
          hintSlot
        );
        const newTrack = stream.getVideoTracks()[0];
        if (!newTrack) {
          disposeStreamTracks(stream);
          if (!unmountedRef.current) {
            const empty: AvAcquireError = {
              type: "no-device",
              message: "No video track from the selected camera.",
              raw: null,
            };
            setVideoError(empty);
            localVideoStreamRef.current = null;
            setLocalVideoStream(null);
          }
          return;
        }
        if (unmountedRef.current) {
          disposeStreamTracks(stream);
          return;
        }
        const ms = new MediaStream([newTrack]);
        if (isCamMutedRef.current) newTrack.enabled = false;
        localVideoStreamRef.current = ms;
        setLocalVideoStream(ms);
        setVideoError(null);

        const gst = newTrack.getSettings?.();
        const devPersist = gst?.deviceId ?? deviceId;
        pinnedVideoEnumerateGroupRef.current = gst?.groupId ?? "";
        selectedVideoDeviceIdRef.current = devPersist.length > 0 ? devPersist : null;
        if (devPersist) {
          setSelectedVideoDeviceId(devPersist);
          saveStoredVideoDeviceId(devPersist);
        }
        if (gst?.groupId) saveStoredVideoGroupId(gst.groupId);

        const mesh = meshRef.current;
        if (mesh && !mesh.isDisposed()) {
          mesh.replaceLocalTrackOnAllPeers("video", newTrack);
        }
        await refreshVideoDevices();
        log.log(`event=set-video-device orphan deviceId=${deviceId}`);
      } catch (err) {
        if (!unmountedRef.current) {
          localVideoStreamRef.current = null;
          setLocalVideoStream(null);
        }
        if (unmountedRef.current) return;
        const classified = classifyMediaError(err, "cam");
        log.warn(
          `setVideoDevice failed type=${classified.type} err=${
            (err as Error)?.message ?? String(err)
          }`
        );
        setVideoError(classified);
      } finally {
        endAcquiring();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [log, refreshVideoDevices, setVideoCameraBySlot]
  );

  // ---------------------------------------------------------------
  // Effect: camera unplugged ΓÇö enumerator no longer lists live deviceId
  // ---------------------------------------------------------------
  useEffect(() => {
    const id = selectedVideoDeviceId;
    if (!localVideoStream || !id || videoDevices.length === 0) return;
    if (videoDevices.some((d) => d.deviceId === id)) return;
    log.warn(
      `camera device id missing after enumerate (likely unplugged) id=${id}`
    );
    void setVideoCameraBySlot(0, { force: true });
  }, [
    videoDevices,
    selectedVideoDeviceId,
    localVideoStream,
    setVideoCameraBySlot,
  ]);

  const setMicDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      if (swapMicFromRecorder) {
        if (!externalAudioStream) {
          log.warn(
            "setMicDevice: swapMicDevice set without externalAudioStream ΓÇö ignoring"
          );
          return;
        }
        try {
          await swapMicFromRecorder(deviceId);
        } catch {
          return;
        }
        const mesh = meshRef.current;
        const t = localAudioStreamRef.current?.getAudioTracks()[0];
        if (mesh && t && !mesh.isDisposed()) {
          try {
            mesh.replaceLocalTrackOnAllPeers("audio", t);
          } catch (err) {
            log.warn(
              `setMicDevice replaceTrack threw: ${
                (err as Error)?.message ?? String(err)
              }`
            );
          }
        }
        log.log(`event=set-mic-device deviceId=${deviceId} path=recorder`);
        return;
      }
      if (externalAudioStream) {
        log.warn(
          "setMicDevice: external audio present ΓÇö pass swapMicDevice from workspace"
        );
        return;
      }
      const cur =
        localAudioStreamRef.current?.getAudioTracks()[0]?.getSettings()
          ?.deviceId;
      if (cur === deviceId) {
        log.log(`event=set-mic-device no-op deviceId=${deviceId}`);
        return;
      }
      const getUM = resolveGetUserMedia();
      if (!getUM) return;
      startAcquiring();
      if (!unmountedRef.current) setError(null);
      try {
        const stream = await getUM({
          audio: { deviceId: { exact: deviceId } },
          video: false,
        });
        if (unmountedRef.current) {
          for (const tt of stream.getTracks()) tt.stop();
          return;
        }
        const newTrack = stream.getAudioTracks()[0];
        if (!newTrack) {
          for (const tt of stream.getTracks()) tt.stop();
          return;
        }
        const prev = localAudioStreamRef.current;
        if (prev) {
          for (const tt of prev.getTracks()) tt.stop();
        }
        if (isMicMutedRef.current) {
          for (const tt of stream.getAudioTracks()) tt.enabled = false;
        }
        localAudioStreamRef.current = stream;
        setLocalAudioStream(stream);
        const mesh = meshRef.current;
        if (mesh && !mesh.isDisposed()) {
          mesh.replaceLocalTrackOnAllPeers("audio", newTrack);
        }
        log.log(`event=set-mic-device deviceId=${deviceId}`);
      } catch (err) {
        if (unmountedRef.current) return;
        setError(classifyMediaError(err, "mic"));
      } finally {
        endAcquiring();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log + integration refs stable per session
    [externalAudioStream, swapMicFromRecorder, log]
  );

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
      log.warn(`reconnectPeer ignored ΓÇö no mesh peer=${peerId}`);
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
    reachableParticipants,
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
    videoDevices,
    selectedVideoDeviceId,
    pickedVideoCameraSlot,
    setVideoCameraBySlot,
    setVideoDevice,
    setMicDevice,
  };
}
