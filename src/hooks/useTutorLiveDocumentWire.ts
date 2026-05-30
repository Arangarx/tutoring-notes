"use client";

import { useCallback, useRef } from "react";
import type {
  WhiteboardSyncClient,
  WhiteboardWireFollow,
  WhiteboardWirePage,
} from "@/lib/whiteboard/sync-client";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
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

  const emitDocument = useCallback(() => {
    if (!enabled || !sync) return;
    revRef.current += 1;
    const { pageList, activePageId, sections } = getPageListAndActive();
    const raw = getPagesSnapshot();
    const pages: Record<string, ExcalidrawLikeElement[]> = {};
    for (const [k, els] of Object.entries(raw)) {
      pages[k] = (els as ReadonlyArray<ExcalidrawLikeElement>).map(
        (e) => ({ ...e }) as ExcalidrawLikeElement
      );
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
    sync.broadcastDocument({
      rev: revRef.current,
      pages,
      page,
      follow,
    });
    onDocumentEmitted?.(follow);
  }, [enabled, sync, getPagesSnapshot, getPageListAndActive, getFollow, onDocumentEmitted]);

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
    if (!enabled || !sync) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    emitDocument();
    sync.flushPendingBroadcast();
  }, [emitDocument, enabled, sync]);

  return { scheduleDocumentBroadcast, flushDocumentBroadcastNow, revRef };
}
