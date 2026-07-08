"use client";

/**
 * Tiles panel — renders the host's local preview tile (if provided)
 * followed by one `<AVTile>` per remote participant, in a simple
 * flex grid. Phase 4c (Pillar 6).
 *
 * Layout is deliberately minimal: a row that wraps. Drag-to-dock,
 * collapse-to-strip, and the polished "Reconnecting…" cover-art
 * states are Phase 4d polish. The same component mounts on both the
 * tutor workspace and the student join page; the host decides where
 * on the page to drop it (top-right overlay vs. sidebar vs. top
 * banner).
 */

import { useMemo } from "react";

import type { AvParticipant } from "@/hooks/useLiveAV";
import { AVTile, type AVTileLocalMediaControls } from "@/components/av/AVTile";

export type AVLocalTileDescriptor = {
  /**
   * Stable id for the local tile. Default `"self"`. Used as the
   * React key + as the `peerId` slot in the underlying `<AVTile>`
   * so the dev-tools data attribute is consistent.
   */
  peerId?: string;
  role: "tutor" | "student";
  label?: string;
  audioStream: MediaStream | null;
  videoStream: MediaStream | null;
  isMicMuted: boolean;
  isCamMuted: boolean;
};

export type AVTilesPanelProps = {
  participants: ReadonlyArray<AvParticipant>;
  /**
   * Optional local preview tile. When provided, it renders FIRST in
   * the grid; remote participants follow. Omitting it (e.g. the
   * student page in tutor-solo dev mode) renders only the remote
   * grid.
   */
  localTile?: AVLocalTileDescriptor;
  /**
   * Optional className for the outer flex container so the host
   * page can pin / dock the panel without forking the component.
   */
  className?: string;
  /**
   * data-testid for the outer container. Defaults to
   * `"av-tiles-panel"`.
   */
  testId?: string;
  /**
   * Phase 4d: when a remote tile's connection terminally fails,
   * the tile surfaces a Retry button that invokes this callback
   * with the failed peer's id. The host passes
   * `liveAv.reconnectPeer` directly — same shape, same semantic.
   * When omitted, failed tiles render without a retry affordance
   * (defensive default; in production both the workspace + the
   * student client wire this).
   */
  onReconnect?: (peerId: string) => void;
  /**
   * Phase 4d: when present, overrides the per-participant label
   * the host sees. Used by the workspace to substitute the
   * SSR-known `student.name` for the single-student case where
   * presence-wire labels would otherwise read `Student · a3f7`.
   * Returning `undefined` falls through to `participant.label`.
   * Pure read-only — never mutated by the panel.
   */
  resolveLabel?: (participant: AvParticipant) => string | undefined;
  /** Mic/cam toggles on the local preview tile only (see AVTile). */
  localMediaControls?: AVTileLocalMediaControls;
};

/**
 * Render a flex-wrap row of tiles. Empty when there is neither a
 * local tile NOR any remote participant (the host can suppress the
 * mount entirely in that case, but rendering nothing is a safe
 * fallback when the parent hasn't yet decided).
 */
export function AVTilesPanel({
  participants,
  localTile,
  className,
  testId,
  onReconnect,
  resolveLabel,
  localMediaControls,
}: AVTilesPanelProps) {
  const remote = useMemo(() => [...participants], [participants]);
  const isEmpty = !localTile && remote.length === 0;

  return (
    <div
      data-testid={testId ?? "av-tiles-panel"}
      data-participant-count={remote.length}
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "flex-start",
        // Empty panel still occupies layout slot so the parent's
        // grid doesn't reflow mid-session as peers arrive/leave.
        minHeight: 0,
      }}
    >
      {isEmpty && (
        <span
          data-testid="av-tiles-panel-empty"
          style={{
            fontSize: 12,
            color: "var(--badge-neutral-fg)",
          }}
        >
          No live A/V participants yet.
        </span>
      )}
      {localTile && (
        <AVTile
          key={localTile.peerId ?? "self"}
          isLocal
          localMicMuted={localTile.isMicMuted}
          localCamMuted={localTile.isCamMuted}
          localMediaControls={localMediaControls}
          participant={{
            peerId: localTile.peerId ?? "self",
            role: localTile.role,
            label: localTile.label,
            audioStream: localTile.audioStream,
            videoStream: localTile.videoStream,
            isLocal: true,
          }}
        />
      )}
      {remote.map((p) => {
        const resolvedLabel = resolveLabel ? resolveLabel(p) : undefined;
        const decorated: AvParticipant =
          resolvedLabel !== undefined && resolvedLabel.length > 0
            ? { ...p, label: resolvedLabel }
            : p;
        return (
          <AVTile
            key={p.peerId}
            participant={decorated}
            onReconnect={
              onReconnect ? () => onReconnect(p.peerId) : undefined
            }
          />
        );
      })}
    </div>
  );
}
