"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import { measureVisibleViewport } from "@/lib/whiteboard/measure-visible-viewport";
import {
  subscribeVisualViewport,
  visibleViewportWireFields,
} from "@/lib/whiteboard/visible-viewport";

const DEBOUNCE_MS = 100;
const UNCHANGED_RESEND_MS = 5_000;
const MOUNT_RETRY_MS = 50;
const API_RETRY_MS = 200;
/** Catches programmatic follow updates that never fire wheel/pointer. */
const SAMPLE_MS = 100;

export type ViewportWireCamera = {
  scrollX: number;
  scrollY: number;
  zoom: number;
};

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
  /** Immediate flush for page-apply and board switches. */
  flushNowRef?: React.MutableRefObject<((camera?: ViewportWireCamera) => void) | null>;
  /** Student follow lock. Omitted by the tutor (tutor does not use this hook). */
  viewLocked?: boolean;
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

    const flush = (opts?: { retry?: boolean; camera?: ViewportWireCamera }) => {
      if (cancelled) return;
      const { sync, excalidrawAPI: api, activePageIdRef } = latestRef.current;
      if (!sync || !api) {
        // The 100ms sample calls flush again on its own. A retry from that
        // path, plus one from every tick, chains timeouts that never die.
        if (opts?.retry === false) return;
        if (retryTimer !== null) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          flush();
        }, API_RETRY_MS);
        return;
      }
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const st = api.getAppState() as {
        scrollX: number;
        scrollY: number;
        zoom: { value: number };
        width?: number;
        height?: number;
      };
      const applied = opts?.camera;
      const mount = latestRef.current.canvasMountRef.current;
      const visible = mount ? measureVisibleViewport(mount) : null;
      const viewLocked = latestRef.current.viewLocked;
      const msg = {
        pageId: activePageIdRef.current,
        panX: applied ? applied.scrollX : st.scrollX,
        panY: applied ? applied.scrollY : st.scrollY,
        zoom: applied ? applied.zoom : st.zoom.value,
        ...visibleViewportWireFields(visible, { width: st.width, height: st.height }),
        ...(typeof viewLocked === "boolean" ? { viewLocked } : {}),
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

    const onVisualViewport = () => scheduleFlush();

    const attach = (el: HTMLElement) => {
      if (attached === el) return;
      detach?.();
      attached = el;
      el.addEventListener("wheel", scheduleFlush, { passive: true });
      el.addEventListener("pointermove", scheduleFlush, { passive: true });
      window.addEventListener("resize", scheduleFlush);
      const unsubscribeVisualViewport = subscribeVisualViewport(onVisualViewport);
      detach = () => {
        el.removeEventListener("wheel", scheduleFlush);
        el.removeEventListener("pointermove", scheduleFlush);
        window.removeEventListener("resize", scheduleFlush);
        unsubscribeVisualViewport();
      };
      scheduleFlush();
    };

    if (latestRef.current.flushNowRef) {
      latestRef.current.flushNowRef.current = (camera) => {
        clearDebounce();
        flush(camera ? { camera } : undefined);
      };
    }

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
      else flush({ retry: false });
    }, SAMPLE_MS);

    return () => {
      cancelled = true;
      detach?.();
      clearInterval(sample);
      if (retryTimer !== null) clearTimeout(retryTimer);
      clearDebounce();
      if (latestRef.current.flushNowRef) latestRef.current.flushNowRef.current = null;
    };
  }, [enabled, canvasMountRef]);
}
