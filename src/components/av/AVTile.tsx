"use client";

/**
 * Single participant tile — Phase 4c shipped, Phase 4d polished.
 *
 * Renders one entry from `useLiveAV().participants[]` (remote) or a
 * synthetic local-tile descriptor (tutor's own preview). Audio +
 * video element wiring, connection-state pill, cam-off placeholder.
 *
 * Audio-doubling avoidance (unchanged from 4c):
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
 * Phase 4d additions:
 *
 *   - Connection-state pill mapping moved to
 *     `connection-state-mapping.ts` (testable in isolation; copy +
 *     colour updated per the polish bullet — `connected` no longer
 *     renders a green badge to reduce visual noise; `disconnected`
 *     reads "Reconnecting…" instead of the raw ICE state; `failed`
 *     surfaces an explicit Retry button).
 *
 *   - Cam-off placeholder now shows initials in a deterministic
 *     colour circle (via `initials-from-label.ts`) instead of the
 *     plain "Camera off" text. The "Waiting for video…" copy is
 *     preserved for the still-connecting case so the tutor can tell
 *     "their cam is off" from "we're still negotiating".
 *
 * `srcObject` is assigned via a ref-effect rather than the React
 * `srcObject` prop because (a) React 18 still treats the
 * `srcObject` prop as a string for legacy types in some setups, and
 * (b) re-assigning the same MediaStream is a no-op in browsers,
 * which is the cheapest update path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AvParticipant } from "@/hooks/useLiveAV";
import {
  getConnectionStatePill,
  SELF_STATE,
  shouldHidePill,
  type ConnectionStateColor,
} from "@/components/av/connection-state-mapping";
import {
  getDeterministicColorFromPeerId,
  getInitialsFromLabel,
} from "@/components/av/initials-from-label";

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
   * Optional callback fired when the user clicks the "Retry" button
   * on a tile whose connection has terminally failed. Closure over
   * the peerId, so the host can pass `() => liveAv.reconnectPeer(peerId)`
   * directly. When omitted, the Retry affordance is hidden (e.g.
   * tests that render a failed tile without a recovery path).
   */
  onReconnect?: () => void;
  /**
   * Optional data-testid passthrough so workspace + student dom
   * tests can grab a specific tile when multiple are rendered.
   */
  testId?: string;
};

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
  onReconnect,
  testId,
}: AVTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /**
   * True when the browser refused to autoplay the remote audio
   * element. iOS Safari and Chrome Android frequently block
   * `<audio autoPlay>` for inbound remote streams even after the
   * user has tapped "Allow mic" on the same page — the gesture
   * token is per-element on some implementations, and the audio
   * element is created AFTER the gesture by React. We surface a
   * one-tap "Tap to hear audio" overlay so the student can recover
   * without us having to add a global "click anywhere to enable
   * audio" interstitial.
   */
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = participant.videoStream ?? null;
    if (!participant.videoStream) return;
    // Double-RAF compositor-layer race guard.
    //
    // Timeline leading to the black-video symptom:
    //
    //   Frame N  — React commit: <video> style flips from display:none →
    //              display:block. useEffect fires AFTER this paint, then sets
    //              el.srcObject = videoStream. A single requestAnimationFrame
    //              is scheduled.
    //
    //   Frame N+1 rAF (outer) — fires BEFORE the N+1 paint.  Chrome has not
    //              yet processed the srcObject change through its GPU video
    //              pipeline — the decoder-to-compositor-layer routing path is
    //              not wired until the N+1 PAINT runs. Calling play() here
    //              (as the previous single-RAF fix did) succeeds logically but
    //              decoded frames are silently discarded by the unconnected
    //              compositor. This is why the single-RAF fix left the video
    //              black, and why a manual resize (which forces a fresh layout/
    //              paint cycle) was the only thing that made it paint.
    //
    //   Frame N+1 PAINT — browser wires the decoder output to the compositor
    //              layer for this srcObject.
    //
    //   Frame N+2 rAF (inner) — fires AFTER the N+1 paint. Compositor is now
    //              fully connected. Calling play() here routes decoded frames
    //              through to the layer immediately, so the video paints without
    //              any manual resize.
    const stream = participant.videoStream;
    let innerRaf: number | null = null;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        const cur = videoRef.current;
        if (!cur || cur.srcObject !== stream) return;
        const p =
          typeof cur.play === "function"
            ? (cur.play() as Promise<void> | undefined)
            : undefined;
        p?.catch(() => {});
      });
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf !== null) cancelAnimationFrame(innerRaf);
    };
  }, [participant.videoStream]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.srcObject = participant.audioStream ?? null;
    setAudioBlocked(false);
    if (!participant.audioStream) return;
    // Explicit play() in addition to the autoPlay attribute. Mobile
    // browsers ignore autoPlay for non-muted media even with a prior
    // user gesture in many cases; calling play() returns a promise
    // we can catch on rejection and surface an unblock UI.
    const playPromise =
      typeof el.play === "function"
        ? (el.play() as Promise<void> | undefined)
        : undefined;
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        // NotAllowedError / AbortError are the autoplay-block cases;
        // log so the tutor can see in the student's mobile console
        // why the audio is silent.
        // eslint-disable-next-line no-console
        console.warn(
          `[av-tile] peer=${participant.peerId} audio autoplay blocked: ${
            (err as Error)?.name ?? "?"
          }: ${(err as Error)?.message ?? String(err)}`
        );
        setAudioBlocked(true);
      });
    }
  }, [participant.audioStream, participant.peerId]);

  const handleTapToHear = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const playPromise =
      typeof el.play === "function"
        ? (el.play() as Promise<void> | undefined)
        : undefined;
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => setAudioBlocked(false))
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(
            `[av-tile] peer=${participant.peerId} audio tap-to-hear still blocked: ${
              (err as Error)?.name ?? "?"
            }: ${(err as Error)?.message ?? String(err)}`
          );
        });
    } else {
      setAudioBlocked(false);
    }
  }, [participant.peerId]);

  const isLocalTile = isLocal === true || participant.isLocal === true;

  const pill = useMemo(() => {
    if (isLocalTile) return getConnectionStatePill(SELF_STATE, SELF_STATE);
    const remote = participant as AvParticipant;
    return getConnectionStatePill(
      remote.peerConnectionState,
      remote.iceConnectionState
    );
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

  const remote = !isLocalTile ? (participant as AvParticipant) : null;
  const remoteAwaitingVideo =
    !!remote &&
    !hasVideoTrack &&
    (remote.peerConnectionState === "connecting" ||
      remote.peerConnectionState === "new");

  const palette: Record<
    ConnectionStateColor,
    { bg: string; fg: string; dot: string }
  > = {
    green: { bg: "var(--success-soft)", fg: "var(--success)", dot: "var(--success)" },
    amber: { bg: "var(--warning-soft)", fg: "var(--warning)", dot: "var(--warning)" },
    red: { bg: "var(--error-soft)", fg: "var(--error)", dot: "var(--error)" },
    grey: { bg: "var(--badge-neutral-bg)", fg: "var(--badge-neutral-fg)", dot: "var(--badge-neutral-dot)" },
    blue: { bg: "var(--info-soft)", fg: "var(--info)", dot: "var(--info)" },
  };
  const p = palette[pill.color];

  const placeholderInitials = useMemo(
    () => getInitialsFromLabel(labelText, participant.role),
    [labelText, participant.role]
  );
  const placeholderColor = useMemo(
    () => getDeterministicColorFromPeerId(participant.peerId),
    [participant.peerId]
  );

  const pillHidden = shouldHidePill(pill);

  return (
    <div
      data-testid={testId ?? `av-tile-${participant.peerId}`}
      data-peer-id={participant.peerId}
      data-role={participant.role}
      data-is-local={isLocalTile ? "true" : "false"}
      data-state-kind={pill.kind}
      style={{
        display: "flex",
        flexDirection: "column",
        width: 160,
        background: "var(--surface-tile)",
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
          background: "var(--surface-tile-solid)",
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
        {showCamPlaceholder &&
          (remoteAwaitingVideo ? (
            <div
              data-testid={`av-tile-cam-placeholder-${participant.peerId}`}
              data-placeholder-kind="awaiting-video"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-on-dark)",
                fontSize: 12,
                textAlign: "center",
                padding: "0 6px",
              }}
            >
              Waiting for video…
            </div>
          ) : (
            <div
              data-testid={`av-tile-cam-placeholder-${participant.peerId}`}
              data-placeholder-kind="initials"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: placeholderColor,
              }}
            >
              <span
                data-testid={`av-tile-initials-${participant.peerId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--surface-tile)",
                  color: "white",
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  border: "2px solid var(--text-inverse)",
                }}
              >
                {placeholderInitials}
              </span>
            </div>
          ))}
        {!isLocalTile && (
          <audio
            ref={audioRef}
            autoPlay
            data-testid={`av-tile-audio-${participant.peerId}`}
            style={{ display: "none" }}
          />
        )}
        {!isLocalTile && audioBlocked && (
          <button
            type="button"
            data-testid={`av-tile-audio-unblock-${participant.peerId}`}
            onClick={handleTapToHear}
            style={{
              position: "absolute",
              inset: 0,
              border: 0,
              background: "var(--surface-tile)",
              color: "white",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              padding: "0 8px",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Tap to hear audio
          </button>
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
              background: "var(--error)",
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
          background: "var(--surface-tile-solid)",
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
        {!pillHidden && (
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
            {pill.showRetry && onReconnect ? (
              <button
                type="button"
                onClick={onReconnect}
                data-testid={`av-tile-retry-${participant.peerId}`}
                style={{
                  marginLeft: 4,
                  padding: "0 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: "16px",
                  borderRadius: 4,
                  border: "1px solid var(--error-border)",
                  background: "var(--text-inverse)",
                  color: "var(--sign-out)",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            ) : null}
          </span>
        )}
      </div>
    </div>
  );
}
