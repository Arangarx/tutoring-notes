"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AVTilesPanel, type AVTilesPanelProps } from "@/components/av/AVTilesPanel";
import { WbIconCamera, WbIconMic } from "@/components/whiteboard/chrome/wb-icons";

export type WbAVClusterProps = AVTilesPanelProps & {
  isMicMuted: boolean;
  isCamMuted: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  disabled?: boolean;
  /** True when camera permission is denied or no camera device is available. */
  camDisabled?: boolean;
  layoutMode: "desktop" | "narrow" | "tablet-portrait";
};

const DEFAULT_SIZE = { width: 240, height: 280 };
const MIN_SIZE = { width: 160, height: 180 };
const MAX_SIZE = { width: 400, height: 480 };

/** SR-04 — draggable + resizable video tile cluster, top-right default. */
export function WbAVCluster({
  isMicMuted,
  isCamMuted,
  onToggleMic,
  onToggleCam,
  disabled,
  camDisabled,
  layoutMode,
  ...tilesProps
}: WbAVClusterProps) {
  const clusterRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const isMobileLayout = layoutMode !== "desktop";
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);

  useEffect(() => {
    if (isMobileLayout) {
      setPos(null);
      setSize({ width: layoutMode === "narrow" ? 120 : 180, height: 200 });
    } else {
      setSize(DEFAULT_SIZE);
    }
  }, [isMobileLayout, layoutMode]);

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || isMobileLayout) return;
      e.preventDefault();
      const el = clusterRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const parent = el.offsetParent as HTMLElement | null;
      const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const x = pos?.x ?? rect.left - parentRect.left;
      const y = pos?.y ?? rect.top - parentRect.top;
      if (!pos) setPos({ x, y });
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [disabled, isMobileLayout, pos]
  );

  const onDragPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: Math.max(0, dragRef.current.origX + dx),
      y: Math.max(0, dragRef.current.origY + dy),
    });
  }, []);

  const onDragPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      //
    }
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || isMobileLayout) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: size.width,
        origH: size.height,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [disabled, isMobileLayout, size]
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const dw = e.clientX - resizeRef.current.startX;
    const dh = e.clientY - resizeRef.current.startY;
    setSize({
      width: Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, resizeRef.current.origW + dw)),
      height: Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, resizeRef.current.origH + dh)),
    });
  }, []);

  const onResizePointerUp = useCallback((e: React.PointerEvent) => {
    resizeRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      //
    }
  }, []);

  const style: React.CSSProperties = isMobileLayout
    ? { width: size.width, maxWidth: size.width }
    : {
        width: size.width,
        height: size.height,
        ...(pos
          ? { top: pos.y, left: pos.x, right: "auto" }
          : { top: 16, right: 16, left: "auto" }),
      };

  return (
    <div
      ref={clusterRef}
      className={`mynk-wb-av-cluster${isMobileLayout ? " mynk-wb-av-cluster--mobile" : ""}`}
      style={style}
      data-testid={tilesProps.testId ?? "wb-av-cluster"}
    >
      {!isMobileLayout && (
        <div
          className="mynk-wb-av-cluster__drag-handle"
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          title="Drag to move"
        >
          <span className="mynk-wb-av-cluster__drag-dots" aria-hidden>
            ···
          </span>
        </div>
      )}
      <div className="mynk-wb-av-cluster__tiles">
        <AVTilesPanel
          {...tilesProps}
          testId="av-tiles-panel"
          className="mynk-wb-av-cluster__tiles-panel"
        />
      </div>
      <div className="mynk-wb-av-cluster__controls" data-testid="av-controls">
        <button
          type="button"
          className={`mynk-wb-av-btn${!isMicMuted ? " mynk-wb-av-btn--on" : " mynk-wb-av-btn--off"}`}
          title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
          aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
          disabled={disabled}
          onClick={onToggleMic}
        >
          <WbIconMic size={13} />
        </button>
        <button
          type="button"
          className={`mynk-wb-av-btn${!isCamMuted ? " mynk-wb-av-btn--on" : " mynk-wb-av-btn--off"}`}
          title={camDisabled ? "Camera unavailable" : isCamMuted ? "Turn camera on" : "Turn camera off"}
          aria-label={camDisabled ? "Camera unavailable" : isCamMuted ? "Turn camera on" : "Turn camera off"}
          disabled={disabled || camDisabled}
          onClick={onToggleCam}
        >
          <WbIconCamera size={13} />
        </button>
      </div>
      {!isMobileLayout && (
        <div
          className="mynk-wb-av-cluster__resize-handle"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          aria-hidden
        />
      )}
    </div>
  );
}
