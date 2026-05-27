"use client";

/**
 * Local + tutor-moderation A/V controls — Phase 4c (Pillar 6).
 *
 * Two-purpose component:
 *
 *   1. Local mute toggles for the host's own mic + cam (works on
 *      tutor AND student pages).
 *
 *   2. (Tutor-only) per-participant moderation row: "Mute this
 *      student in MY recording". This does NOT silence the remote
 *      audio for the tutor's live playback — it flips a host-side
 *      shouldCapture override for the remote-stream-recorder, so
 *      end-session playback won't include the muted period.
 *      Wire-level mute (asking the remote peer to stop transmitting)
 *      is post-v1 and intentionally out of scope.
 *
 * The student page omits the `moderation` prop and only sees the
 * local mute toggles.
 *
 * UI is minimal in 4c: two buttons + a list of toggle rows. Phase
 * 4d will polish copy + iconography.
 */

import type { AvParticipant } from "@/hooks/useLiveAV";

export type AVModerationDescriptor = {
  participants: ReadonlyArray<AvParticipant>;
  /**
   * Peer ids whose audio the tutor has chosen to EXCLUDE from the
   * recording. The host maintains this set; `AVControls` only
   * surfaces it as toggles.
   */
  mutedPeerIds: ReadonlySet<string>;
  /** Toggle the moderation override for a peer. */
  onTogglePeer: (peerId: string, nextMutedInRecording: boolean) => void;
};

export type AVControlsProps = {
  isMicMuted: boolean;
  isCamMuted: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  /**
   * Disabled state (e.g. while the workspace is finalizing the
   * end-session flow). When true, every interactive control is
   * inert.
   */
  disabled?: boolean;
  /**
   * Tutor-only moderation surface. When undefined, the component
   * only renders mic + cam toggles. The student page leaves this
   * unset.
   */
  moderation?: AVModerationDescriptor;
  testId?: string;
};

export function AVControls({
  isMicMuted,
  isCamMuted,
  toggleMic,
  toggleCam,
  disabled,
  moderation,
  testId,
}: AVControlsProps) {
  return (
    <div
      data-testid={testId ?? "av-controls"}
      className="card"
      style={{
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--surface-tile)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="btn"
          aria-pressed={isMicMuted}
          onClick={toggleMic}
          disabled={disabled}
          data-testid="av-controls-toggle-mic"
        >
          {isMicMuted ? "Unmute mic" : "Mute mic"}
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={isCamMuted}
          onClick={toggleCam}
          disabled={disabled}
          data-testid="av-controls-toggle-cam"
        >
          {isCamMuted ? "Turn camera on" : "Turn camera off"}
        </button>
      </div>
      {moderation && moderation.participants.length > 0 && (
        <div
          data-testid="av-controls-moderation"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            paddingTop: 6,
            borderTop: "1px solid var(--badge-neutral-bg)",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-default)",
            }}
          >
            Recording moderation
          </span>
          <span
            className="muted"
            style={{ fontSize: 11, lineHeight: 1.4, maxWidth: 480 }}
          >
            Muting a student here excludes their audio from this session&apos;s
            recording. They&apos;ll still be audible live for everyone in the
            call.
          </span>
          {moderation.participants.map((p) => {
            const muted = moderation.mutedPeerIds.has(p.peerId);
            const label =
              p.label && p.label.trim().length > 0 ? p.label : "Student";
            return (
              <label
                key={p.peerId}
                data-testid={`av-controls-mod-row-${p.peerId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={muted}
                  disabled={disabled}
                  onChange={(ev) =>
                    moderation.onTogglePeer(p.peerId, ev.target.checked)
                  }
                  data-testid={`av-controls-mod-checkbox-${p.peerId}`}
                />
                <span>Don&apos;t record {label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
