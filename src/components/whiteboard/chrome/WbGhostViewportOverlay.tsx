"use client";

import { useEffect, useState } from "react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { PeerPageViewState } from "@/hooks/usePeerPageViewState";
import { peerVisibleSceneRect } from "@/lib/whiteboard/peer-viewport-scene-rect";
import { sceneRectToOverlayBox } from "@/lib/whiteboard/ghost-viewport-screen";
import "./WbGhostViewportOverlay.css";

export type WbGhostViewportOverlayProps = {
  excalidrawAPI: ExcalidrawApiLike | null;
  activePageId: string;
  peerView: PeerPageViewState | null;
  label: string;
};

export function WbGhostViewportOverlay({
  excalidrawAPI,
  activePageId,
  peerView,
  label,
}: WbGhostViewportOverlayProps) {
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!excalidrawAPI || !peerView) {
      setBox(null);
      return;
    }
    if (peerView.pageId !== activePageId) {
      setBox(null);
      return;
    }
    const vw = peerView.viewportWidth;
    const vh = peerView.viewportHeight;
    if (!(vw && vh && vw > 0 && vh > 0)) {
      setBox(null);
      return;
    }

    let raf = 0;
    const tick = () => {
      const st = excalidrawAPI.getAppState() as {
        scrollX: number;
        scrollY: number;
        zoom: { value: number };
        offsetLeft?: number;
        offsetTop?: number;
      };
      const sceneRect = peerVisibleSceneRect({
        panX: peerView.panX,
        panY: peerView.panY,
        zoom: peerView.zoom,
        viewportWidth: vw,
        viewportHeight: vh,
      });
      const next = sceneRectToOverlayBox(sceneRect, {
        scrollX: st.scrollX,
        scrollY: st.scrollY,
        zoom: st.zoom,
        offsetLeft: typeof st.offsetLeft === "number" ? st.offsetLeft : 0,
        offsetTop: typeof st.offsetTop === "number" ? st.offsetTop : 0,
      });
      // Re-render only when the box moves; the loop itself runs every frame.
      setBox((prev) =>
        prev &&
        next &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [excalidrawAPI, peerView, activePageId]);

  const labelOnly =
    peerView &&
    peerView.pageId === activePageId &&
    !(peerView.viewportWidth && peerView.viewportHeight);

  if (!box && !labelOnly) return null;

  return (
    <div className="mynk-wb-ghost-viewport" aria-hidden>
      {box ? (
        <div
          className="mynk-wb-ghost-viewport__rect"
          data-testid="wb-ghost-viewport-rect"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
        >
          <span
            className="mynk-wb-ghost-viewport__label"
            data-testid="wb-ghost-viewport-label"
          >
            {label}
          </span>
        </div>
      ) : (
        <span
          className="mynk-wb-ghost-viewport__label mynk-wb-ghost-label--visible"
          data-testid="wb-ghost-viewport-label"
          style={{ position: "absolute", top: "12%", left: "20%" }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
