"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import { readViewportSizeFromAppState } from "@/lib/whiteboard/viewport-align";

const DEBOUNCE_MS = 200;
const UNCHANGED_RESEND_MS = 5_000;
const MOUNT_RETRY_MS = 50;
const API_RETRY_MS = 200;
/** Catches programmatic follow updates that never fire wheel/pointer. */
const SAMPLE_MS = 500;

/**
 * Student-side pageViewState wire (tutor already emits via flushViewportPersist).
 * Does not touch handleExcalidrawChange.
 *
 * The listener effect depends only on `enabled` and the mount ref (AV
 * invariant 6: no object deps that change every render); sync/api are read
 * through a ref. A broadcast is sent only when the view actually changed.
 *
 * The canvas node and Excalidraw API often appear after this effect's first
 * run. Follow mode also moves the student's viewport without a user wheel
 * event. Both still emit the student's own viewport size — follow must not
 * suppress that broadcast.
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
    let cancelled = false;
    let detach: (() => void) | null = null;
    let attached: HTMLElement | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDebounce = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const flush = () => {
      if (cancelled) return;
      const { sync, excalidrawAPI: api, activePageIdRef } = latestRef.current;
      if (!sync || !api) {
        retryTimer = setTimeout(flush, API_RETRY_MS);
        return;
      }
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

    const scheduleFlush = () => {
      clearDebounce();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, DEBOUNCE_MS);
    };

    const attach = (el: HTMLElement) => {
      if (attached === el) return;
      detach?.();
      attached = el;
      el.addEventListener("wheel", scheduleFlush, { passive: true });
      el.addEventListener("pointermove", scheduleFlush, { passive: true });
      window.addEventListener("resize", scheduleFlush);
      detach = () => {
        el.removeEventListener("wheel", scheduleFlush);
        el.removeEventListener("pointermove", scheduleFlush);
        window.removeEventListener("resize", scheduleFlush);
      };
      scheduleFlush();
    };

    const watchMount = () => {
      if (cancelled) return;
      const el = canvasMountRef.current;
      if (!el) {
        retryTimer = setTimeout(watchMount, MOUNT_RETRY_MS);
        return;
      }
      attach(el);
    };

    watchMount();
    const sample = setInterval(() => {
      if (cancelled) return;
      const el = canvasMountRef.current;
      if (!el) {
        watchMount();
        return;
      }
      if (attached !== el) attach(el);
      else scheduleFlush();
    }, SAMPLE_MS);

    return () => {
      cancelled = true;
      detach?.();
      clearInterval(sample);
      if (retryTimer !== null) clearTimeout(retryTimer);
      clearDebounce();
    };
  }, [enabled, canvasMountRef]);
}
