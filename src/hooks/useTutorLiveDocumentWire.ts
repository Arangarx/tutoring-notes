"use client";

import { useCallback, useRef } from "react";
import type {
  WhiteboardSyncClient,
  WhiteboardWireFollow,
  WhiteboardWirePage,
} from "@/lib/whiteboard/sync-client";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import { isDegenerateLinearElement } from "@/lib/whiteboard/excalidraw-adapter";
import type { PageViewState } from "@/lib/whiteboard/board-document-snapshot";

const THROTTLE_MS = 50;

/**
 * Tutor live sync over **v3** wire: one throttled, atomic **full document**
 * (`pages` for every tab + `page` + `follow` + `rev`). This is separate from
 * {@link useWhiteboardRecorder} so recording diffs and network payload shape
 * stay decoupled.
 */
export function useTutorLiveDocumentWire(options: {
  /** False when `sync` is null or `WHITEBOARD_SYNC_URL` unset. */
  enabled: boolean;
  sync: WhiteboardSyncClient | null;
  getPagesSnapshot: () => Readonly<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>;
  getPageListAndActive: () => {
    pageList: ReadonlyArray<{
      id: string;
      title: string;
      section?: string;
      viewState?: PageViewState;
    }>;
    activePageId: string;
    sections?: Record<string, { label: string }>;
  };
  getFollow: () => WhiteboardWireFollow;
  /** Observability only — called after each v3 document emit with the follow payload. */
  onDocumentEmitted?: (follow: WhiteboardWireFollow) => void;
}) {
  const { enabled, sync, getPagesSnapshot, getPageListAndActive, getFollow, onDocumentEmitted } =
    options;
  const revRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-current ref so welcome-push callbacks are never stale-closed
  // over the React-state `sync` / `enabled` values. The `new-user` event can
  // fire in the brief render-cycle gap between "sync client created" and "React
  // processes setSyncReady(true)", during which `sync` and `enabled` in the
  // useCallback closure are still null/false. Reading syncRef.current instead
  // bypasses that race entirely without changing steady-state semantics.
  const syncRef = useRef<WhiteboardSyncClient | null>(null);
  syncRef.current = sync;

  const emitDocument = useCallback(() => {
    const liveSync = syncRef.current;
    if (!liveSync) return;
    revRef.current += 1;
    const { pageList, activePageId, sections } = getPageListAndActive();
    const raw = getPagesSnapshot();
    const pages: Record<string, ExcalidrawLikeElement[]> = {};
    for (const [k, els] of Object.entries(raw)) {
      // Drop degenerate line/arrow elements (phantom strokes — 1 point, zero bbox)
      // before they reach the student's canvas. The recorder path filters them via
      // toCanonical/diffScenes; here we extend the same guard to the live-sync wire.
      pages[k] = (els as ReadonlyArray<ExcalidrawLikeElement>)
        .filter((e) => !isDegenerateLinearElement(e))
        .map((e) => ({ ...e }) as ExcalidrawLikeElement);
    }
    const pageWireRows = pageList.map((p) => ({
      id: p.id,
      title: p.title,
      ...(p.section ? { section: p.section } : {}),
      ...(p.viewState
        ? {
            viewState: {
              panX: p.viewState.panX,
              panY: p.viewState.panY,
              zoom: p.viewState.zoom,
            },
          }
        : {}),
    }));
    const page: WhiteboardWirePage = {
      activePageId,
      pageList: pageWireRows,
      ...(sections && Object.keys(sections).length > 0
        ? { sections: { ...sections } }
        : {}),
    };
    const follow = getFollow();
    liveSync.broadcastDocument({
      rev: revRef.current,
      pages,
      page,
      follow,
    });
    onDocumentEmitted?.(follow);
  }, [getPagesSnapshot, getPageListAndActive, getFollow, onDocumentEmitted]);

  const scheduleDocumentBroadcast = useCallback(() => {
    if (!enabled || !sync) return;
    // Trailing-edge THROTTLE (arm-if-null), NOT a debounce. A debounce that
    // clears+resets the timer on every onChange never fires during a continuous
    // gesture (the tutor's pointer is rarely still for THROTTLE_MS), so the
    // student saw nothing until the tutor paused or switched pages (a page
    // switch force-flushes). Arming-if-null fires once per THROTTLE_MS for the
    // duration of the gesture — matching the student/recorder direction
    // (`DIFF_INTERVAL_MS`), which is why the reverse path always felt live.
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      emitDocument();
    }, THROTTLE_MS);
  }, [emitDocument, enabled, sync]);

  const flushDocumentBroadcastNow = useCallback(() => {
    // Use syncRef.current (not the closed-over `sync`) so this function is
    // never stale when called from the new-user / welcome-push path — the
    // sync client can be live while the React closure still holds sync=null
    // from a not-yet-processed setSyncReady(true) state update.
    const liveSync = syncRef.current;
    if (!liveSync) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    emitDocument();
    liveSync.flushPendingBroadcast();
  }, [emitDocument]);

  return { scheduleDocumentBroadcast, flushDocumentBroadcastNow, revRef };
}
