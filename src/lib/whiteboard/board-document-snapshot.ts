/**
 * Multi–board-page snapshot for **local** recovery (sessionStorage draft +
 * IndexedDB checkpoint `boardDocument` field). This is the tutor UI model:
 * one Excalidraw scene at a time, with per-tab element arrays in memory.
 * The WB event log remains a separate single-stream log for replay.
 */

/** Persisted Excalidraw viewport for a board page (`scrollX`/`scrollY`/`zoom.value`). */
export type PageViewState = {
  panX: number;
  panY: number;
  zoom: number;
};

export type WhiteboardBoardDocumentV1 = {
  v: 1;
  pageList: {
    id: string;
    title: string;
    section?: string;
    viewState?: PageViewState;
  }[];
  activePageId: string;
  /** Excalidraw-serializable element arrays (JSON) per page id. */
  pages: Record<string, ReadonlyArray<unknown>>;
  /** Optional registry for collapsible strip sections (e.g. PDF imports). */
  sections?: Record<string, { label: string }>;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isValidPageViewState(v: unknown): v is PageViewState {
  if (!v || typeof v !== "object") return false;
  const o = v as { panX?: unknown; panY?: unknown; zoom?: unknown };
  return (
    isFiniteNumber(o.panX) &&
    isFiniteNumber(o.panY) &&
    isFiniteNumber(o.zoom)
  );
}

export function getPageViewState(
  doc: WhiteboardBoardDocumentV1,
  pageId: string
): PageViewState | undefined {
  return doc.pageList.find((p) => p.id === pageId)?.viewState;
}

/** Immutable update: sets `viewState` on the matching `pageList` row, or returns `doc` unchanged if `pageId` is missing. */
export function setPageViewState(
  doc: WhiteboardBoardDocumentV1,
  pageId: string,
  viewState: PageViewState
): WhiteboardBoardDocumentV1 {
  let matched = false;
  const pageList = doc.pageList.map((p) => {
    if (p.id !== pageId) return p;
    matched = true;
    return { ...p, viewState };
  });
  return matched ? { ...doc, pageList } : doc;
}

export function isWhiteboardBoardDocumentV1(
  v: unknown
): v is WhiteboardBoardDocumentV1 {
  if (!v || typeof v !== "object") return false;
  const o = v as { v?: unknown; pageList?: unknown; activePageId?: unknown; pages?: unknown };
  if (o.v !== 1) return false;
  if (typeof o.activePageId !== "string") return false;
  if (!Array.isArray(o.pageList)) return false;
  if (!o.pages || typeof o.pages !== "object") return false;
  const sectionsRaw = (o as { sections?: unknown }).sections;
  if (typeof sectionsRaw !== "undefined") {
    if (!sectionsRaw || typeof sectionsRaw !== "object") return false;
    for (const [, meta] of Object.entries(sectionsRaw as Record<string, unknown>)) {
      if (!meta || typeof meta !== "object") return false;
      const label = (meta as { label?: unknown }).label;
      if (typeof label !== "string") return false;
    }
  }
  for (const p of o.pageList) {
    if (!p || typeof p !== "object") return false;
    const row = p as {
      id?: unknown;
      title?: unknown;
      section?: unknown;
      viewState?: unknown;
    };
    if (typeof row.id !== "string" || typeof row.title !== "string") return false;
    if (
      typeof row.section !== "undefined" &&
      typeof row.section !== "string"
    ) {
      return false;
    }
    if (
      typeof row.viewState !== "undefined" &&
      !isValidPageViewState(row.viewState)
    ) {
      return false;
    }
  }
  return true;
}
