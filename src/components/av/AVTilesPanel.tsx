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
import { AVTile } from "@/components/av/AVTile";

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
            color: "rgba(100,116,139,0.85)",
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
      {remote.map((p) => (
        <AVTile key={p.peerId} participant={p} />
      ))}
    </div>
  );
}
