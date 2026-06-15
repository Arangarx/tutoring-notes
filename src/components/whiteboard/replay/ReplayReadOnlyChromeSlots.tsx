"use client";

import type { ReactNode } from "react";
import { BoardTabStrip } from "@/components/whiteboard/chrome/BoardTabStrip";
import { WbAVCluster } from "@/components/whiteboard/chrome/WbAVCluster";
import { WbThemeToggle } from "@/components/whiteboard/chrome/WbThemeToggle";
import {
  WbIconArrow,
  WbIconCamera,
  WbIconEraser,
  WbIconLine,
  WbIconMic,
  WbIconPencil,
  WbIconRect,
  WbIconRedo,
  WbIconSelect,
  WbIconShare,
  WbIconText,
  WbIconUndo,
  WbIconWand,
} from "@/components/whiteboard/chrome/wb-icons";
import type { WbLayoutMode } from "@/components/whiteboard/chrome/useWbLayoutMode";

function DisabledToolBtn({
  icon,
  label,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`mynk-wb-tool-btn${active ? " mynk-wb-tool-btn--active" : ""}`}
      title={label}
      aria-label={label}
      disabled
    >
      {icon}
    </button>
  );
}

function DisabledTbBtn({
  icon,
  label,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`mynk-wb-tb-btn mynk-wb-tb-btn--icon${className ? ` ${className}` : ""}`}
      title={label}
      aria-label={label}
      disabled
    >
      {icon}
    </button>
  );
}

const REPLAY_BOARD_TAB = {
  id: "replay-board-1",
  title: "Board 1",
  section: "board",
  isPdf: false,
};

export type ReplayReadOnlyChromeSlotsProps = {
  layoutMode: WbLayoutMode;
  studentName?: string;
  durationLabel?: string;
  trailingActions?: ReactNode;
  canvas: ReactNode;
  timelineStrip: ReactNode;
  drawerSlot?: ReactNode;
  nonVisualMounts?: ReactNode;
};

/** Read-only live chrome slots for in-frame replay (visual reuse only). */
export function buildReplayReadOnlyChromeSlots({
  layoutMode,
  studentName,
  durationLabel,
  trailingActions,
  canvas,
  timelineStrip,
  nonVisualMounts,
}: Omit<ReplayReadOnlyChromeSlotsProps, "drawerSlot">) {
  const noop = () => {};

  const topBar = (
    <header
      className="mynk-wb-topbar bg-card border-b border-border"
      role="toolbar"
      aria-label="Replay controls"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="mynk-wb-wordmark" aria-label="Mynk">
        Mynk<span className="mynk-wb-wordmark__dot">·</span>
      </span>
      <span className="mynk-wb-topbar__sep" aria-hidden />

      <div className="mynk-wb-topbar__zone">
        <div
          className="mynk-wb-live-badge"
          data-testid="wb-replay-session-badge"
          style={{
            background: "var(--success-soft, var(--info-soft))",
            color: "var(--success-text, var(--foreground))",
          }}
        >
          Replay
        </div>
        {durationLabel ? (
          <span className="mynk-wb-timer" data-testid="wb-replay-duration">
            {durationLabel}
          </span>
        ) : null}
        {studentName ? (
          <span className="muted" style={{ fontSize: 12, paddingLeft: 4 }}>
            {studentName}
          </span>
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0 }} />

      <div className="mynk-wb-topbar__zone mynk-wb-topbar__desktop-only">
        <DisabledTbBtn icon={<WbIconShare />} label="Share (disabled during replay)" />
        <span className="mynk-wb-topbar__sep" aria-hidden />
        <DisabledTbBtn icon={<WbIconMic size={14} />} label="Microphone (disabled during replay)" />
        <DisabledTbBtn
          icon={<WbIconCamera size={14} />}
          label="Camera (disabled during replay)"
          className="mynk-wb-tb-btn--cam-off"
        />
        <span className="mynk-wb-topbar__sep" aria-hidden />
        <DisabledTbBtn icon={<WbIconUndo />} label="Undo (disabled during replay)" />
        <DisabledTbBtn icon={<WbIconRedo />} label="Redo (disabled during replay)" />
        <span className="mynk-wb-topbar__sep" aria-hidden />
        <WbThemeToggle />
      </div>

      {trailingActions ? (
        <div className="mynk-wb-topbar__zone mynk-wb-topbar__zone--trailing">
          {trailingActions}
        </div>
      ) : null}
    </header>
  );

  const toolStrip = (
    <nav
      className="mynk-wb-strip bg-card border-r border-border"
      aria-label="Drawing tools (read-only)"
      data-testid="wb-replay-tool-strip"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mynk-wb-strip__tools">
        <DisabledToolBtn icon={<WbIconSelect />} label="Select" active />
        <DisabledToolBtn icon={<WbIconPencil />} label="Draw" />
        <DisabledToolBtn icon={<WbIconEraser />} label="Eraser" />
        <DisabledToolBtn icon={<WbIconText />} label="Text" />
        <DisabledToolBtn icon={<WbIconWand />} label="Pointer" />
        <DisabledToolBtn icon={<WbIconLine />} label="Line" />
        <DisabledToolBtn icon={<WbIconArrow />} label="Arrow" />
        <DisabledToolBtn icon={<WbIconRect />} label="Rectangle" />
      </div>
    </nav>
  );

  const canvasSlot = (
    <div className="mynk-wb-canvas" data-testid="wb-replay-canvas-mount">
      <WbAVCluster
        layoutMode={layoutMode}
        isMicMuted
        isCamMuted
        onToggleMic={noop}
        onToggleCam={noop}
        disabled
        camDisabled
        participants={[]}
      />
      {canvas}
    </div>
  );

  const bottomToolbar = (
    <div
      className="mynk-wb-bottom-toolbar"
      aria-hidden
      data-testid="wb-replay-bottom-toolbar"
    >
      <DisabledToolBtn icon={<WbIconSelect />} label="Select" active />
      <DisabledToolBtn icon={<WbIconPencil />} label="Draw" />
      <DisabledToolBtn icon={<WbIconEraser />} label="Eraser" />
      <DisabledToolBtn icon={<WbIconText />} label="Text" />
    </div>
  );

  const boardTabStrip = (
  <div className="mynk-wb-pagestrip">
      <BoardTabStrip
        pageList={[REPLAY_BOARD_TAB]}
        activePageId={REPLAY_BOARD_TAB.id}
        disabled
        testId="wb-replay-board-tabs"
      />
    </div>
  );

  return {
    nonVisualMounts,
    topBar,
    toolStrip,
    canvas: canvasSlot,
    bottomToolbar,
    boardTabStrip: (
      <>
        {timelineStrip}
        {boardTabStrip}
      </>
    ),
  };
}
