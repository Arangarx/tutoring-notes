"use client";

import type { ReactNode } from "react";

export type ReplayBoardChromeSlots = {
  nonVisualMounts?: ReactNode;
  topBar: ReactNode;
  canvas: ReactNode;
  timelineStrip: ReactNode;
  drawerSlot?: ReactNode;
};

export type ReplayBoardChromeProps = ReplayBoardChromeSlots;

/**
 * Presentational replay frame — style-mirror of LiveBoardChrome with
 * read-only affordances (`data-mode="replay"`).
 */
export function ReplayBoardChrome({
  nonVisualMounts,
  topBar,
  canvas,
  timelineStrip,
  drawerSlot,
}: ReplayBoardChromeProps) {
  return (
    <div
      className="mynk-wb-chrome"
      data-testid="mynk-wb-chrome-replay"
      data-mode="replay"
    >
      {nonVisualMounts}
      {topBar}
      <div className="mynk-wb-live-column mynk-wb-replay-column">
        <div className="mynk-wb-body mynk-wb-replay-body">{canvas}</div>
        {timelineStrip}
      </div>
      {drawerSlot}
    </div>
  );
}
