"use client";

/**
 * Single participant tile — Phase 4c.
 *
 * Renders one entry from `useLiveAV().participants[]` (remote) or a
 * synthetic local-tile descriptor (tutor's own preview). The tile is
 * intentionally minimal in 4c: video + audio elements + label +
 * connection-state pill. Polished placeholder copy, audio-level
 * meters, and the "Reconnecting…" / "Failed" tile state mapping
 * land in Phase 4d.
 *
 * Audio-doubling avoidance:
 *
 *   - `<video>` is always rendered with `muted` so its audio track
 *     (which is the same RTP source as the audioStream below) does
 *     not play through the page. This is the trap called out in the
 *     Phase 4b handoff.
 *
 *   - `<audio autoplay>` plays the dedicated audioStream. Remote
 *     audio comes from here ONLY, so there's no double playback at
 *     different decoder latencies (the cause of perceptible echo on
 *     low-end hardware).
 *
 *   - On the LOCAL tile, the host passes `isLocal=true` which also
 *     omits the `<audio>` element entirely. Playing one's own mic
 *     back into one's own speakers is a guaranteed feedback loop.
 *
 * `srcObject` is assigned via a ref-effect rather than the React
 * `srcObject` prop because (a) React 18 still treats the
 * `srcObject` prop as a string for legacy types in some setups, and
 * (b) re-assigning the same MediaStream is a no-op in browsers,
 * which is the cheapest update path.
 */

import { useEffect, useMemo, useRef } from "react";

import type { AvParticipant } from "@/hooks/useLiveAV";

/**
 * Subset of `AvParticipant` the tile actually reads. The host passes
 * a remote participant verbatim, or a synthetic descriptor for the
 * local tile (no peerConnectionState — local always "connected" to
 * itself, by definition).
 */
export type AVTileParticipant =
  | (AvParticipant & { isLocal?: false })
  | {
      peerId: string;
      role: "tutor" | "student";
      label?: string;
      audioStream: MediaStream | null;
      videoStream: MediaStream | null;
      isLocal: true;
    };

export type AVTileProps = {
  participant: AVTileParticipant;
  /**
   * When true, this is the host's own preview tile. The `<audio>`
   * element is omitted (no self-echo) and the video is mirrored
   * horizontally so it reads like a mirror, matching every other
   * video call app.
   */
  isLocal?: boolean;
  /**
   * When true, the local mic / cam are muted by the host. Used only
   * for the local tile to show a small overlay; remote-tile mute
   * state is reflected via the audioStream/videoStream becoming
   * null (or empty tracks) rather than this prop.
   */
  localMicMuted?: boolean;
  localCamMuted?: boolean;
  /**
   * Optional data-testid passthrough so workspace + student dom
   * tests can grab a specific tile when multiple are rendered.
   */
  testId?: string;
};

/**
 * Coarse mapping from `RTCPeerConnectionState` to a label + pill
 * colour. 4c only needs this as a stub — 4d will refine the copy
 * (e.g. "Reconnecting…" vs raw "disconnected"), tone, and the
 * separate ICE-vs-PC distinction.
 */
function statePillFor(
  pc: RTCPeerConnectionState | "self",
  ice: RTCIceConnectionState | "self"
): { label: string; color: "green" | "amber" | "red" | "grey" } {
  if (pc === "self") return { label: "You", color: "grey" };
  if (pc === "connected") return { label: "Connected", color: "green" };
  if (pc === "failed") return { label: "Connection failed", color: "red" };
  if (pc === "closed") return { label: "Disconnected", color: "grey" };
  if (pc === "disconnected") return { label: ice, color: "amber" };
  if (pc === "connecting" || pc === "new") {
    return { label: "Connecting…", color: "amber" };
  }
  return { label: pc, color: "amber" };
}

/**
 * Tile component. Encapsulates the audio + video element wiring and
 * the state pill. Layout-only — host slots tiles into a panel via
 * `AVTilesPanel`.
 */
export function AVTile({
  participant,
  isLocal,
  localMicMuted,
  localCamMuted,
  testId,
}: AVTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Assign srcObject via effect — see top-of-file note.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = participant.videoStream ?? null;
  }, [participant.videoStream]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.srcObject = participant.audioStream ?? null;
  }, [participant.audioStream]);

  const isLocalTile = isLocal === true || participant.isLocal === true;

  const pill = useMemo(() => {
    if (isLocalTile) return statePillFor("self", "self");
    const remote = participant as AvParticipant;
    return statePillFor(remote.peerConnectionState, remote.iceConnectionState);
  }, [
    isLocalTile,
    (participant as AvParticipant).peerConnectionState,
    (participant as AvParticipant).iceConnectionState,
  ]);

  const labelText =
    participant.label && participant.label.trim().length > 0
      ? participant.label
      : participant.role === "tutor"
        ? "Tutor"
        : "Student";

  const hasVideoTrack =
    !!participant.videoStream &&
    participant.videoStream.getVideoTracks().length > 0;
  const showCamPlaceholder =
    !hasVideoTrack || (isLocalTile && localCamMuted === true);

  const palette = {
    green: { bg: "rgba(34,197,94,0.18)", fg: "#16a34a", dot: "#16a34a" },
    amber: { bg: "rgba(234,179,8,0.18)", fg: "#a16207", dot: "#ca8a04" },
    red: { bg: "rgba(220,38,38,0.18)", fg: "#dc2626", dot: "#dc2626" },
    grey: { bg: "rgba(100,116,139,0.18)", fg: "#475569", dot: "#64748b" },
  } as const;
  const p = palette[pill.color];

  return (
    <div
      data-testid={testId ?? `av-tile-${participant.peerId}`}
      data-peer-id={participant.peerId}
      data-role={participant.role}
      data-is-local={isLocalTile ? "true" : "false"}
      style={{
        display: "flex",
        flexDirection: "column",
        width: 160,
        background: "rgba(15,23,42,0.9)",
        color: "white",
        borderRadius: 8,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 3",
          background: "rgba(15,23,42,1)",
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          data-testid={`av-tile-video-${participant.peerId}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: isLocalTile ? "scaleX(-1)" : undefined,
            display: showCamPlaceholder ? "none" : "block",
          }}
        />
        {showCamPlaceholder && (
          <div
            data-testid={`av-tile-cam-placeholder-${participant.peerId}`}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(248,250,252,0.55)",
              fontSize: 12,
            }}
          >
            {isLocalTile && localCamMuted ? "Camera off" : "Camera off"}
          </div>
        )}
        {!isLocalTile && (
          <audio
            ref={audioRef}
            autoPlay
            data-testid={`av-tile-audio-${participant.peerId}`}
            style={{ display: "none" }}
          />
        )}
        {isLocalTile && localMicMuted === true && (
          <span
            data-testid={`av-tile-local-mic-muted-${participant.peerId}`}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              padding: "2px 6px",
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 4,
              background: "rgba(220,38,38,0.85)",
              color: "white",
            }}
          >
            Muted
          </span>
        )}
      </div>
      <div
        style={{
          padding: "6px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          background: "rgba(15,23,42,0.95)",
        }}
      >
        <span
          data-testid={`av-tile-label-${participant.peerId}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {labelText}
        </span>
        <span
          data-testid={`av-tile-state-${participant.peerId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
            background: p.bg,
            color: p.fg,
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: p.dot,
            }}
          />
          {pill.label}
        </span>
      </div>
    </div>
  );
}
