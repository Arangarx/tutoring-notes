"use client";

import type { ReactNode } from "react";
import type { WbLayoutMode, WbOrientation } from "@/components/whiteboard/chrome/useWbLayoutMode";
import type { WbParticipantRole } from "@/components/whiteboard/chrome/wb-role";

/** Presentational slot props for the live board chrome frame (§7.5.1 shell). */
export interface LiveBoardChromeSlots {
  /** Hidden mounts (audio bridge, etc.) inside the chrome root. */
  nonVisualMounts?: ReactNode;
  topBar: ReactNode;
  toolStrip: ReactNode;
  canvas: ReactNode;
  propsMobileBar?: ReactNode;
  bottomToolbar: ReactNode;
  boardTabStrip: ReactNode;
  actionSheets?: ReactNode;
}

export interface LiveBoardChromeProps extends LiveBoardChromeSlots {
  layoutMode: WbLayoutMode;
  orientation: WbOrientation;
  role: WbParticipantRole;
  toolbarHidden: boolean;
  onChromeClick?: () => void;
}

/**
 * Presentational chrome frame for the live whiteboard — top bar, tool strip,
 * canvas column, mobile bars, board tabs, and action-sheet region.
 * Role-agnostic layout; consumers pass slot content and behavioral handlers.
 */
export function LiveBoardChrome({
  layoutMode,
  orientation,
  role,
  toolbarHidden,
  onChromeClick,
  nonVisualMounts,
  topBar,
  toolStrip,
  canvas,
  propsMobileBar,
  bottomToolbar,
  boardTabStrip,
  actionSheets,
}: LiveBoardChromeProps) {
  return (
    <div
      className="mynk-wb-chrome"
      data-testid="mynk-wb-chrome"
      data-layout={layoutMode}
      data-orientation={orientation}
      data-role={role}
      data-toolbar-hidden={toolbarHidden ? "true" : "false"}
      onClick={onChromeClick}
    >
      {nonVisualMounts}
      {topBar}
      <div className="mynk-wb-live-column">
        <div className="mynk-wb-body">
          {toolStrip}
          {canvas}
        </div>
        {propsMobileBar}
        {bottomToolbar}
        {boardTabStrip}
      </div>
      {actionSheets}
    </div>
  );
}
