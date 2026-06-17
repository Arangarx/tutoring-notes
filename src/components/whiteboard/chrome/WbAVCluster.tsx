"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { AVTilesPanel, type AVTilesPanelProps } from "@/components/av/AVTilesPanel";
import { WbIconCamera, WbIconMic } from "@/components/whiteboard/chrome/wb-icons";
import type { WbLayoutMode } from "@/components/whiteboard/chrome/useWbLayoutMode";

export type WbAVClusterProps = AVTilesPanelProps & {
  isMicMuted: boolean;
  isCamMuted: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  disabled?: boolean;
  /** True when camera permission is denied or no camera device is available. */
  camDisabled?: boolean;
  layoutMode: WbLayoutMode;
};

const DEFAULT_SIZE = { width: 240, height: 280 };
const MIN_SIZE = { width: 160, height: 180 };
const MAX_SIZE = { width: 400, height: 480 };

/** Chrome overhead: drag handle + tiles padding + controls row (matches whiteboard-chrome.css). */
const CLUSTER_CHROME_HEIGHT = 14 + 8 + 45;
const TILE_GAP = 4;
/** Video body height for one tile at the default cluster size (280 − chrome). */
const PER_TILE_BODY_HEIGHT = DEFAULT_SIZE.height - CLUSTER_CHROME_HEIGHT;
/** Auto-grow cap beyond manual-resize MAX_SIZE — still below typical viewport. */
const AUTO_GROW_MAX_HEIGHT = 560;
const CLUSTER_TOP_INSET = 16;
const CLUSTER_BOTTOM_MARGIN = 16;

/** 67 + N×213 + (N−1)×4 — symmetric grow/shrink; no highwater state. */
function computeAutoClusterHeight(tileCount: number): number {
  if (tileCount <= 0) return DEFAULT_SIZE.height;
  const tilesBody =
    tileCount * PER_TILE_BODY_HEIGHT + Math.max(0, tileCount - 1) * TILE_GAP;
  return CLUSTER_CHROME_HEIGHT + tilesBody;
}

function computeViewportCap(posY: number | null): number {
  if (typeof window === "undefined") return AUTO_GROW_MAX_HEIGHT;
  const top = posY ?? CLUSTER_TOP_INSET;
  const available = window.innerHeight - top - CLUSTER_BOTTOM_MARGIN;
  return Math.min(AUTO_GROW_MAX_HEIGHT, Math.max(MIN_SIZE.height, available));
}

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
  /** Latest rendered cluster height (auto-grow or manual) for resize drag origin. */
  const displayHeightRef = useRef(DEFAULT_SIZE.height);

  const isMobileLayout = layoutMode !== "desktop";
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);
  /** True only after the tutor drags the resize handle (manual resize wins over auto-shrink). */
  const [userResized, setUserResized] = useState(false);
  /** Mechanism A paint-reflow lock — distinct from userResized so peer leave can re-enable auto-grow. */
  const [paintReflowLocked, setPaintReflowLocked] = useState(false);
  const [viewportCap, setViewportCap] = useState(AUTO_GROW_MAX_HEIGHT);

  const tileCount =
    (tilesProps.localTile ? 1 : 0) + tilesProps.participants.length;
  const autoClusterHeight = computeAutoClusterHeight(Math.max(tileCount, 1));
  const useAutoGrow =
    !isMobileLayout &&
    !userResized &&
    !paintReflowLocked &&
    tileCount > 0 &&
    autoClusterHeight <= viewportCap;

  // Mechanism A: number of remote participants that currently have a live videoStream.
  const remoteVideoCount = tilesProps.participants.filter(
    (p) => p.videoStream != null
  ).length;
  const prevRemoteVideoCountRef = useRef(0);

  // Mechanism A: replicate the reflow the manual drag produces.
  //
  // The manual resize causes two things that together paint the video:
  //   1. setSize/setUserResized → data-auto-grow is removed from the cluster.
  //   2. The cluster switches from CSS-flex-driven height (auto-grow path) to
  //      an explicit inline style.height pixel value → browser recomputes layout
  //      → video element gets a concrete bounding box → compositor wires.
  //
  // We reproduce the same transition automatically when a remote videoStream
  // arrives: snapshot displayHeightRef.current (already computed for the current
  // tileCount, so the height is correct and there is no squish) then call
  // setSize + setPaintReflowLocked(true) so the next render drops data-auto-grow
  // and sets an explicit style.height.  On symmetric leave (paint lock only, no
  // manual drag), clear the lock and restore auto-grow height.
  // Guard: effect only fires on count change; prevRemoteVideoCountRef prevents re-loop.
  useEffect(() => {
    if (isMobileLayout) return;
    const prev = prevRemoteVideoCountRef.current;
    prevRemoteVideoCountRef.current = remoteVideoCount;
    if (remoteVideoCount > prev && remoteVideoCount > 0) {
      // displayHeightRef is updated synchronously during each render (line below
      // displayHeight computation), so it reflects the height for the NEW
      // tileCount at the moment this effect runs — the same value the auto-grow
      // path already placed in the inline style. Setting size to this exact height
      // is a no-op visually; the structural change is the removal of data-auto-grow
      // and the switch to explicit inline pixels that produces the layout event.
      const h = displayHeightRef.current;
      setSize((s) => ({ width: s.width, height: h }));
      setPaintReflowLocked(true);
    } else if (remoteVideoCount < prev && paintReflowLocked && !userResized) {
      setPaintReflowLocked(false);
      const newTileCount = Math.max(tileCount, 1);
      const h = computeAutoClusterHeight(newTileCount);
      setSize((s) => ({ width: s.width, height: h }));
    }
  }, [isMobileLayout, remoteVideoCount, paintReflowLocked, userResized, tileCount]);

  useLayoutEffect(() => {
    if (isMobileLayout) return;
    const measure = () => setViewportCap(computeViewportCap(pos?.y ?? null));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isMobileLayout, pos?.y]);

  useEffect(() => {
    if (isMobileLayout) {
      setPos(null);
      setSize({
        width:
          layoutMode === "narrow" || layoutMode === "phone-landscape"
            ? 120
            : 180,
        height: 200,
      });
    } else {
      setSize(DEFAULT_SIZE);
    }
    setUserResized(false);
    setPaintReflowLocked(false);
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
        origH: displayHeightRef.current,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [disabled, isMobileLayout, size]
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const dw = e.clientX - resizeRef.current.startX;
    const dh = e.clientY - resizeRef.current.startY;
    if (dw !== 0 || dh !== 0) setUserResized(true);
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

  // Auto mode: height tracks tileCount each render (shrinks when tiles leave).
  // paintReflowLocked holds 2-up height until peer leaves; userResized (manual drag) wins.
  const displayHeight = useAutoGrow
    ? autoClusterHeight
    : !userResized && autoClusterHeight > viewportCap
      ? viewportCap
      : size.height;
  displayHeightRef.current = displayHeight;

  const style: React.CSSProperties = isMobileLayout
    ? { width: size.width, maxWidth: size.width }
    : {
        width: size.width,
        height: displayHeight,
        ["--wb-av-tile-target-h" as string]: `${PER_TILE_BODY_HEIGHT}px`,
        ...(pos
          ? { top: pos.y, left: pos.x, right: "auto" }
          : { top: CLUSTER_TOP_INSET, right: 16, left: "auto" }),
      };

  return (
    <div
      ref={clusterRef}
      className={`mynk-wb-av-cluster${isMobileLayout ? " mynk-wb-av-cluster--mobile" : ""}`}
      style={style}
      data-auto-grow={useAutoGrow ? "true" : undefined}
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
