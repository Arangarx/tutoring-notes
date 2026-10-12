"use client";

import { useEffect, useRef, useState } from "react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { PeerPageViewState } from "@/hooks/usePeerPageViewState";
import { peerVisibleSceneRect } from "@/lib/whiteboard/peer-viewport-scene-rect";
import { sceneRectToOverlayBox } from "@/lib/whiteboard/ghost-viewport-screen";
import {
  createGhostFreezeState,
  resetGhostFreeze,
  stepGhostFreeze,
  type GhostFreezeState,
  type GhostViewLock,
} from "@/lib/whiteboard/ghost-freeze";
import "./WbGhostViewportOverlay.css";

export type WbGhostViewportOverlayProps = {
  excalidrawAPI: ExcalidrawApiLike | null;
  activePageId: string;
  peerView: PeerPageViewState | null;
  label: string;
};

function lockOf(viewLocked: boolean | undefined): GhostViewLock {
  if (viewLocked === true) return "locked";
  if (viewLocked === false) return "independent";
  return "unknown";
}

export function WbGhostViewportOverlay({
  excalidrawAPI,
  activePageId,
  peerView,
  label,
}: WbGhostViewportOverlayProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef(peerView);
  const peerStamp = useRef<{ view: PeerPageViewState | null; seq: number; at: number }>({
    view: null,
    seq: 0,
    at: 0,
  });
  const freezeRef = useRef<GhostFreezeState>(createGhostFreezeState());
  const seenPage = useRef(activePageId);
  const effectPage = useRef<string | null>(null);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  if (peerStamp.current.view !== peerView) {
    peerStamp.current = {
      view: peerView,
      seq: peerStamp.current.seq + 1,
      at: performance.now(),
    };
  }
  peerRef.current = peerView;

  if (seenPage.current !== activePageId) {
    seenPage.current = activePageId;
    if (box !== null) setBox(null);
  }

  useEffect(() => {
    if (!excalidrawAPI) {
      setBox(null);
      return;
    }
    const pageChanged = effectPage.current !== null && effectPage.current !== activePageId;
    effectPage.current = activePageId;
    freezeRef.current = pageChanged
      ? resetGhostFreeze(performance.now())
      : createGhostFreezeState();
    let raf = 0;
    const tick = (frameNow: number) => {
      const peer = peerRef.current;
      const vw = peer?.viewportWidth;
      const vh = peer?.viewportHeight;
      const show =
        peer &&
        peer.pageId === activePageId &&
        typeof vw === "number" &&
        typeof vh === "number" &&
        vw > 0 &&
        vh > 0;
      if (!show || !peer) {
        // Hidden frames are not a gesture. Drop the camera baseline so the
        // next shown frame projects fresh instead of freezing the old box.
        freezeRef.current = createGhostFreezeState();
        setBox(null);
        raf = requestAnimationFrame(tick);
        return;
      }
      const st = excalidrawAPI.getAppState() as {
        scrollX: number;
        scrollY: number;
        zoom: { value: number };
        offsetLeft?: number;
        offsetTop?: number;
      };
      const sceneRect = peerVisibleSceneRect({
        panX: peer.panX,
        panY: peer.panY,
        zoom: peer.zoom,
        viewportWidth: vw,
        viewportHeight: vh,
        visibleLeft: peer.visibleLeft,
        visibleTop: peer.visibleTop,
      });
      const clientBox = sceneRectToOverlayBox(sceneRect, {
        scrollX: st.scrollX,
        scrollY: st.scrollY,
        zoom: st.zoom,
        offsetLeft: typeof st.offsetLeft === "number" ? st.offsetLeft : 0,
        offsetTop: typeof st.offsetTop === "number" ? st.offsetTop : 0,
      });
      const origin = hostRef.current?.getBoundingClientRect();
      const projected =
        clientBox && origin
          ? {
              left: clientBox.left - origin.left,
              top: clientBox.top - origin.top,
              width: clientBox.width,
              height: clientBox.height,
            }
          : clientBox;
      const decision = stepGhostFreeze(freezeRef.current, {
        now: typeof frameNow === "number" ? frameNow : performance.now(),
        camera: {
          scrollX: st.scrollX,
          scrollY: st.scrollY,
          zoom: typeof st.zoom?.value === "number" ? st.zoom.value : 1,
        },
        projected,
        lock: lockOf(peer.viewLocked),
        peerSeq: peerStamp.current.seq,
        peerAt: peerStamp.current.at,
      });
      freezeRef.current = decision.state;
      const next = decision.box;
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
    // peerView is read through peerRef so a peer message does not restart
    // the loop and drop the screen-space hold.
  }, [excalidrawAPI, activePageId]);

  const labelOnly =
    peerView &&
    peerView.pageId === activePageId &&
    !(peerView.viewportWidth && peerView.viewportHeight);

  if (!peerView || peerView.pageId !== activePageId) return null;

  return (
    <div ref={hostRef} className="mynk-wb-ghost-viewport" aria-hidden>
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
      ) : labelOnly ? (
        <span
          className="mynk-wb-ghost-viewport__label mynk-wb-ghost-label--visible"
          data-testid="wb-ghost-viewport-label"
          style={{ position: "absolute", top: "12%", left: "20%" }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
