"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BoardTabStrip } from "@/components/whiteboard/chrome/BoardTabStrip";
import { WbThemeToggle } from "@/components/whiteboard/chrome/WbThemeToggle";
import {
  WbIconArrow,
  WbIconEraser,
  WbIconLine,
  WbIconPencil,
  WbIconRect,
  WbIconRedo,
  WbIconSelect,
  WbIconShare,
  WbIconText,
  WbIconUndo,
  WbIconWand,
} from "@/components/whiteboard/chrome/wb-icons";

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

const REPLAY_BOARD_TAB_FALLBACK = {
  id: "replay-board-1",
  title: "Board 1",
  section: "board" as const,
  isPdf: false,
};

export type ReplayReadOnlyChromeSlotsProps = {
  studentName?: string;
  durationLabel?: string;
  onHideReplay?: () => void;
  canvas: ReactNode;
  timelineStrip: ReactNode;
  /** Board tabs derived from page-switch events (E4). */
  replayPageList?: Array<{
    id: string;
    title: string;
    section?: string;
    isPdf?: boolean;
  }>;
  activeReplayPageId?: string | null;
  drawerSlot?: ReactNode;
  nonVisualMounts?: ReactNode;
};

/** Read-only live chrome slots for in-frame replay (visual reuse only). */
export function buildReplayReadOnlyChromeSlots({
  studentName,
  durationLabel,
  onHideReplay,
  canvas,
  timelineStrip,
  replayPageList,
  activeReplayPageId,
  nonVisualMounts,
}: Omit<ReplayReadOnlyChromeSlotsProps, "drawerSlot">) {
  const topBar = (
    <header
      className="mynk-wb-topbar bg-card border-b border-border"
      role="toolbar"
      aria-label="Replay controls"
      onClick={(e) => e.stopPropagation()}
    >
      <Link href="/" className="mynk-wb-wordmark" aria-label="Mynk">
        Mynk<span className="mynk-wb-wordmark__dot">·</span>
      </Link>
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
        <DisabledTbBtn icon={<WbIconUndo />} label="Undo (disabled during replay)" />
        <DisabledTbBtn icon={<WbIconRedo />} label="Redo (disabled during replay)" />
        <span className="mynk-wb-topbar__sep" aria-hidden />
        <WbThemeToggle />
      </div>

      <div className="mynk-wb-topbar__zone mynk-wb-topbar__zone--trailing">
        {onHideReplay ? (
          <button
            type="button"
            className="mynk-wb-tb-btn"
            data-testid="wb-replay-hide"
            title="Pause and hide replay"
            onClick={(e) => {
              e.stopPropagation();
              onHideReplay();
            }}
          >
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
              ‹
            </span>
            Pause and hide replay
          </button>
        ) : null}
      </div>
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

  const pageList =
    replayPageList && replayPageList.length > 0
      ? replayPageList
      : [REPLAY_BOARD_TAB_FALLBACK];
  const activePageId =
    activeReplayPageId && pageList.some((p) => p.id === activeReplayPageId)
      ? activeReplayPageId
      : pageList[0]!.id;

  const boardTabStrip = (
  <div className="mynk-wb-pagestrip">
      <BoardTabStrip
        pageList={pageList}
        activePageId={activePageId}
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
      <div className="mynk-wb-replay-footer" data-testid="wb-replay-footer">
        {timelineStrip}
        {boardTabStrip}
      </div>
    ),
  };
}
