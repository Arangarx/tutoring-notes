"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import { readViewportSizeFromAppState } from "@/lib/whiteboard/viewport-align";

const DEBOUNCE_MS = 200;

/**
 * Student-side pageViewState wire (tutor already emits via flushViewportPersist).
 * Does not touch handleExcalidrawChange.
 */
export function useViewportWireBroadcast(args: {
  enabled: boolean;
  sync: WhiteboardSyncClient | null;
  excalidrawAPI: ExcalidrawApiLike | null;
  activePageIdRef: React.MutableRefObject<string>;
  canvasMountRef: RefObject<HTMLElement | null>;
}): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (!args.enabled || !args.sync) return;
    const api = args.excalidrawAPI;
    if (!api) return;
    const st = api.getAppState() as {
      scrollX: number;
      scrollY: number;
      zoom: { value: number };
    };
    const size = readViewportSizeFromAppState(st);
    args.sync.broadcastPageViewState({
      pageId: args.activePageIdRef.current,
      panX: st.scrollX,
      panY: st.scrollY,
      zoom: st.zoom.value,
      ...(size
        ? {
            viewportWidth: size.viewportWidth,
            viewportHeight: size.viewportHeight,
          }
        : {}),
    });
  }, [args]);

  const schedule = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, DEBOUNCE_MS);
  }, [flush]);

  useEffect(() => {
    if (!args.enabled) return;
    const el = args.canvasMountRef.current;
    if (!el) return;

    const onActivity = () => schedule();
    el.addEventListener("wheel", onActivity, { passive: true });
    el.addEventListener("pointermove", onActivity, { passive: true });
    window.addEventListener("resize", onActivity);

    schedule();

    return () => {
      el.removeEventListener("wheel", onActivity);
      el.removeEventListener("pointermove", onActivity);
      window.removeEventListener("resize", onActivity);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [args.enabled, args.canvasMountRef, schedule]);
}
