"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import { readViewportSizeFromAppState } from "@/lib/whiteboard/viewport-align";

const DEBOUNCE_MS = 200;
const UNCHANGED_RESEND_MS = 5_000;

/**
 * Student-side pageViewState wire (tutor already emits via flushViewportPersist).
 * Does not touch handleExcalidrawChange.
 *
 * The listener effect depends only on `enabled` and the mount ref (AV
 * invariant 6: no object deps that change every render); sync/api are read
 * through a ref. A broadcast is sent only when the view actually changed.
 */
export function useViewportWireBroadcast(args: {
  enabled: boolean;
  sync: WhiteboardSyncClient | null;
  excalidrawAPI: ExcalidrawApiLike | null;
  activePageIdRef: React.MutableRefObject<string>;
  canvasMountRef: RefObject<HTMLElement | null>;
}): void {
  const { enabled, canvasMountRef } = args;
  const latestRef = useRef(args);
  latestRef.current = args;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<{ fingerprint: string; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const el = canvasMountRef.current;
    if (!el) return;

    const flush = () => {
      const { sync, excalidrawAPI: api, activePageIdRef } = latestRef.current;
      if (!sync || !api) return;
      const st = api.getAppState() as {
        scrollX: number;
        scrollY: number;
        zoom: { value: number };
      };
      const size = readViewportSizeFromAppState(st);
      const msg = {
        pageId: activePageIdRef.current,
        panX: st.scrollX,
        panY: st.scrollY,
        zoom: st.zoom.value,
        ...(size
          ? { viewportWidth: size.viewportWidth, viewportHeight: size.viewportHeight }
          : {}),
      };
      const fingerprint = JSON.stringify(msg);
      const now = Date.now();
      const last = lastSentRef.current;
      // An unchanged view is still re-sent on activity after a while so a
      // peer that reconnected (and missed the last one) catches up.
      if (last && last.fingerprint === fingerprint && now - last.at < UNCHANGED_RESEND_MS) {
        return;
      }
      lastSentRef.current = { fingerprint, at: now };
      sync.broadcastPageViewState(msg);
    };

    const onActivity = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, DEBOUNCE_MS);
    };

    el.addEventListener("wheel", onActivity, { passive: true });
    el.addEventListener("pointermove", onActivity, { passive: true });
    window.addEventListener("resize", onActivity);
    onActivity();

    return () => {
      el.removeEventListener("wheel", onActivity);
      el.removeEventListener("pointermove", onActivity);
      window.removeEventListener("resize", onActivity);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, canvasMountRef]);
}
