/**
 * Excalidraw <-> canonical event-log adapter.
 *
 * Translates between Excalidraw's `ExcalidrawElement` shape (which
 * Excalidraw itself owns) and our library-agnostic `WBElement` shape
 * defined in `event-log.ts`. The recorder hook calls
 * `diffExcalidrawScene()` on every `onChange` to compute add/update/
 * remove events; the replay player calls `toExcalidraw()` to push the
 * canonical scene back into a read-only Excalidraw instance.
 *
 * Why an adapter exists at all: see whiteboard plan guardrail #3 +
 * docs/WHITEBOARD-STATUS.md. Excalidraw's element shape includes
 * library-internal fields (`seed`, `version`, `versionNonce`,
 * `groupIds`, `roundness`, `roughness`, `fixedPoint` bindings, etc.)
 * that would couple our recordings to a specific Excalidraw version.
 * If we ever swap to tldraw or a custom canvas, only this adapter
 * changes — old recordings keep replaying.
 *
 * Tests: `src/__tests__/whiteboard/excalidraw-adapter.test.ts`.
 */

import type {
  WBElement,
  WBEvent,
} from "@/lib/whiteboard/event-log";
import { GRAPH_EMBED_LINK } from "@/lib/whiteboard/insert-asset";

/** Legacy Desmos iframe hosts (pre–JSXGraph swap). Read-only in adapter. */
const LEGACY_DESMOS_HOSTS = ["www.desmos.com", "desmos.com"] as const;

/**
 * Minimal structural types for the Excalidraw element shapes we care
 * about. We DO NOT import from `@excalidraw/excalidraw` in this file
 * directly because:
 *   1. The adapter must be importable from server code (e.g. Blob
 *      upload validators) where the Excalidraw client bundle would
 *      blow up the server build.
 *   2. The structural fields below are stable across Excalidraw
 *      versions in a way the full readonly+branded types are not —
 *      one less thing to break on a dependency upgrade.
 *
 * Anywhere that does need the real Excalidraw types (the workspace
 * page, the recorder hook callsite) imports them locally and casts
 * down to these structural shapes when calling into the adapter.
 */
export type ExcalidrawLikeElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  index?: string | number | null;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  opacity?: number;
  angle?: number;
  isDeleted?: boolean;
  version?: number;
  versionNonce?: number;
  /** freedraw + line + arrow elements */
  points?: ReadonlyArray<readonly [number, number]>;
  /** text elements */
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  /** image elements: lookup key into Excalidraw's `BinaryFiles` table */
  fileId?: string | null;
  /** image elements: Excalidraw expects `saved` after BinaryFiles are registered */
  status?: string;
  /** customData carries our extension fields for non-native types (latex, graph state) */
  customData?: {
    wbType?: WBElement["type"] | "embed";
    latex?: string;
    graphStateJson?: string;
    desmosStateJson?: string;
    embed?: { provider?: string };
    altText?: string;
    /** For image elements: the resolved asset URL on Vercel Blob. */
    assetUrl?: string;
    /** Originator client id for collaborative attribution. */
    clientId?: string;
  };
  /** embeddable elements: validated URL passed to Excalidraw */
  link?: string | null;
};

function embedLink(
  src: ExcalidrawLikeElement
): string | undefined {
  const link = src.link ?? src.customData?.assetUrl;
  return typeof link === "string" ? link : undefined;
}

function isGraphEmbeddable(src: ExcalidrawLikeElement): boolean {
  const customData = src.customData;
  if (customData?.wbType === "graph") return true;
  if (typeof customData?.graphStateJson === "string") return true;
  return embedLink(src) === GRAPH_EMBED_LINK;
}

/** Legacy pilot Desmos iframe embeds — read-only; no new inserts. */
function isLegacyDesmosEmbeddable(src: ExcalidrawLikeElement): boolean {
  const customData = src.customData;
  if (customData?.wbType === "desmos") return true;
  if (
    customData?.wbType === "embed" &&
    customData.embed?.provider === "desmos"
  ) {
    return true;
  }
  const link = embedLink(src);
  if (!link) return false;
  try {
    return LEGACY_DESMOS_HOSTS.includes(
      new URL(link).hostname as (typeof LEGACY_DESMOS_HOSTS)[number]
    );
  } catch {
    return false;
  }
}

/** Round to 2 decimal places to suppress noisy float jitter in diffs. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isLinearWBType(type: WBElement["type"]): boolean {
  return type === "freehand" || type === "line" || type === "arrow";
}

/**
 * Linear Excalidraw elements must end up with ≥2 finite relative points —
 * otherwise `generateElementShape` crashes (`points[0]` undefined). Older logs
 * and race-time recorder frames can omit `points` while still carrying a bbox.
 */
function linearPointsForExcalidrawFromWB(src: WBElement): [number, number][] {
  const cleaned: [number, number][] = [];
  if (src.points?.length) {
    for (const p of src.points) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      cleaned.push([r2(x), r2(y)]);
    }
  }
  if (cleaned.length >= 2) return cleaned;
  if (cleaned.length === 1) {
    const ax = cleaned[0][0];
    const ay = cleaned[0][1];
    return [
      cleaned[0],
      [r2(ax + Math.max(Number.isFinite(src.width) ? Math.abs(src.width) : 0, 1)), ay],
    ];
  }

  const w = Number.isFinite(src.width) ? Math.abs(src.width) : 0;
  const h = Number.isFinite(src.height) ? Math.abs(src.height) : 0;
  if (w <= 0 && h <= 0) return [[0, 0], [1, 0]];
  if (w > 0 && h <= 0)
    return [
      [0, 0],
      [r2(Math.max(w, 1)), 0],
    ];
  if (h > 0 && w <= 0)
    return [
      [0, 0],
      [0, r2(Math.max(h, 1))],
    ];
  return [
    [0, 0],
    [r2(Math.max(w, 1)), r2(Math.max(h, 1))],
  ];
}

const EXCALIDRAW_LINEAR_SCENE_TYPES = new Set(["freedraw", "line", "arrow"]);

function coerceTuplePointsFromRestored(
  pts: unknown,
): WBElement["points"] | undefined {
  if (!Array.isArray(pts)) return undefined;
  const out: [number, number][] = [];
  for (const row of pts) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const x = Number(row[0]);
    const y = Number(row[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push([r2(x), r2(y)]);
  }
  return out.length ? out : undefined;
}

/**
 * Re-run linear `points` repair on whatever `restoreElements` emitted.
 *
 * Replay + crash-resume call `restoreElements` after `toExcalidraw`. In practice
 * the library occasionally returns freedraw / line / arrow shapes **without**
 * a usable points array (`generateElementShape` then dereferences `undefined[0]`
 * and the whole canvas fails). Idempotent when points are already valid.
 */
export function sanitizeRestoredExcalidrawElementsForReplay(
  elements: readonly unknown[],
): unknown[] {
  return elements.map(patchRestoredLinearElementPoints);
}

function finiteNum(x: unknown): boolean {
  return typeof x === "number" && Number.isFinite(x);
}

/** Elbow arrows with missing/invalid `fixedSegments` crash shape generation (`segment[0]`). */
function arrowElbowDataLooksValid(raw: Record<string, unknown>): boolean {
  if (raw.elbowed !== true) return true;
  const segs = raw.fixedSegments;
  if (!Array.isArray(segs) || segs.length === 0) return false;
  for (const s of segs) {
    if (!s || typeof s !== "object") return false;
    const seg = s as Record<string, unknown>;
    const st = seg.start;
    const en = seg.end;
    const si =
      Array.isArray(st) &&
      st.length >= 2 &&
      finiteNum(st[0]) &&
      finiteNum(st[1]);
    const ei =
      Array.isArray(en) &&
      en.length >= 2 &&
      finiteNum(en[0]) &&
      finiteNum(en[1]);
    if (!si || !ei) return false;
  }
  return true;
}

function patchRestoredLinearElementPoints(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const el = raw as Record<string, unknown>;
  const type = el.type;
  if (typeof type !== "string" || !EXCALIDRAW_LINEAR_SCENE_TYPES.has(type)) {
    return raw;
  }
  const wbType: WBElement["type"] =
    type === "freedraw" ? "freehand" : type === "line" ? "line" : "arrow";

  const w = Number(el.width);
  const h = Number(el.height);

  const src: WBElement = {
    id: String(el.id ?? ""),
    type: wbType,
    x: Number(el.x) || 0,
    y: Number(el.y) || 0,
    width: Number.isFinite(w) ? w : 0,
    height: Number.isFinite(h) ? h : 0,
    points: coerceTuplePointsFromRestored(el.points),
  };

  const points = linearPointsForExcalidrawFromWB(src);
  const next: Record<string, unknown> = { ...el, points };

  next.lastCommittedPoint = points.length > 0 ? [...points[points.length - 1]!] : null;

  if (type === "freedraw") {
    const rawPressures = el.pressures;
    let needsSim = false;
    let press: number[];
    if (!Array.isArray(rawPressures) || rawPressures.length !== points.length) {
      needsSim = true;
      press = points.map(() => 1);
    } else {
      const prev = rawPressures as unknown[];
      press = points.map((_pt, i) =>
        finiteNum(prev[i]) ? (prev[i] as number) : 1
      );
      if (
        !press.every((x, i) =>
          finiteNum(prev[i]) ? x === (prev[i] as number) : false
        )
      ) {
        needsSim = true;
      }
    }
    next.pressures = press;
    if (needsSim || el.simulatePressure === true) {
      next.simulatePressure = true;
    }
  }

  if (type === "arrow" && !arrowElbowDataLooksValid(next)) {
    next.elbowed = false;
    delete next.fixedSegments;
    delete next.startIsSpecial;
    delete next.endIsSpecial;
  }

  return next;
}

/** Translate an Excalidraw element type string into our canonical type. */
function mapExcalidrawTypeToWB(
  src: ExcalidrawLikeElement
): WBElement["type"] | null {
  const { type, customData } = src;
  // Custom-typed elements use customData.wbType (graph, desmos, text/latex).
  const wb = customData?.wbType;
  if (wb && wb !== "embed") {
    if (wb === "graph" || wb === "desmos") return wb;
    const native: WBElement["type"][] = [
      "freehand",
      "line",
      "rectangle",
      "ellipse",
      "diamond",
      "arrow",
      "text",
      "image",
    ];
    if ((native as string[]).includes(wb)) return wb as WBElement["type"];
  }
  if (customData?.wbType === "embed" && isLegacyDesmosEmbeddable(src)) {
    return "desmos";
  }
  switch (type) {
    case "freedraw":
      return "freehand";
    case "line":
    case "rectangle":
    case "ellipse":
    case "diamond":
    case "arrow":
    case "text":
    case "image":
      return type;
    case "iframe":
    case "embeddable":
      if (isGraphEmbeddable(src)) return "graph";
      if (isLegacyDesmosEmbeddable(src)) return "desmos";
      return null;
    case "frame":
    case "magicframe":
    case "selection":
      // Not persisted to the event log — frames/selection are UI helpers.
      return null;
    default:
      // Unknown future Excalidraw element types are dropped silently;
      // the replay player just won't see them. Better than crashing.
      return null;
  }
}

/** Translate a canonical WBElement type back into Excalidraw's element type. */
function mapWBTypeToExcalidraw(type: WBElement["type"]): string {
  switch (type) {
    case "freehand":
      return "freedraw";
    case "graph":
      return "embeddable";
    case "desmos":
      return "iframe";
    default:
      return type;
  }
}

/**
 * Convert an Excalidraw element to our canonical shape. Drops library-
 * internal fields and rounds positional floats to 2dp.
 *
 * Returns `null` for elements we don't persist (selection, frame,
 * magicframe, isDeleted=true).
 */
/**
 * A single click with the line/arrow tool + right-click finalize produces a
 * degenerate element: 1 point (or N identical points), zero bounding box.
 * These are phantom strokes — they enter the event log and sync wire but
 * can never be undone on either side. Drop them early, before they reach
 * the canonical layer.
 *
 * Conservative predicate: drop ONLY when ALL three hold:
 *   1. type is "line" or "arrow" (NOT freedraw — a freedraw dot is legitimate)
 *   2. fewer than 2 *distinct* points (length < 2 OR every point equals pts[0])
 *   3. both |width| < 1 AND |height| < 1
 *
 * If any of {2+ distinct points, |width|>=1, |height|>=1} holds → KEEP.
 */
export function isDegenerateLinearElement(src: ExcalidrawLikeElement): boolean {
  if (src.type !== "line" && src.type !== "arrow") return false;
  if (Math.abs(src.width) >= 1 || Math.abs(src.height) >= 1) return false;
  const pts = src.points;
  if (!pts || pts.length < 2) return true;
  // If any point differs from the first, the element has spatial extent → keep.
  const [x0, y0] = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] !== x0 || pts[i][1] !== y0) return false;
  }
  return true; // all points identical, zero bbox → degenerate
}

export function toCanonical(
  src: ExcalidrawLikeElement
): WBElement | null {
  if (src.isDeleted) return null;
  if (isDegenerateLinearElement(src)) return null;
  const wbType = mapExcalidrawTypeToWB(src);
  if (!wbType) return null;

  const out: WBElement = {
    id: src.id,
    type: wbType,
    x: r2(src.x),
    y: r2(src.y),
    width: r2(src.width),
    height: r2(src.height),
  };

  // Numeric `index` from Excalidraw's fractional indexing is a string;
  // we don't preserve the brand and just store it as a sortable string.
  // For tests + jsdom that pass numeric indices, accept those too.
  if (typeof src.index === "number") {
    out.index = src.index;
  }

  if (src.strokeColor !== undefined) out.strokeColor = src.strokeColor;
  if (src.backgroundColor !== undefined && src.backgroundColor !== "transparent") {
    out.backgroundColor = src.backgroundColor;
  }
  if (src.strokeWidth !== undefined) out.strokeWidth = src.strokeWidth;
  if (src.opacity !== undefined && src.opacity !== 100) out.opacity = src.opacity;
  if (src.angle !== undefined && src.angle !== 0) out.angle = r2(src.angle);

  if (src.points && src.points.length > 0) {
    out.points = src.points.map(([x, y]) => [r2(x), r2(y)] as [number, number]);
  }

  if (wbType === "text") {
    if (src.text !== undefined) out.text = src.text;
    if (src.fontSize !== undefined) out.fontSize = src.fontSize;
    if (src.fontFamily !== undefined) out.fontFamily = src.fontFamily;
  }

  if (src.customData?.assetUrl) out.assetUrl = src.customData.assetUrl;
  if (src.customData?.altText) out.altText = src.customData.altText;
  if (src.customData?.latex) out.latex = src.customData.latex;
  if (src.customData?.graphStateJson) {
    out.graphStateJson = src.customData.graphStateJson;
  }
  if (src.customData?.desmosStateJson) {
    out.desmosStateJson = src.customData.desmosStateJson;
  }
  if (src.customData?.clientId) out.clientId = src.customData.clientId;

  return out;
}

/**
 * Convert our canonical element back into the structural Excalidraw
 * shape. `restoreElements` from `@excalidraw/excalidraw` supplies required
 * defaults before `updateScene` (replay player + IndexedDB crash-resume).
 */
export function toExcalidraw(src: WBElement): ExcalidrawLikeElement {
  const customData: NonNullable<ExcalidrawLikeElement["customData"]> = {};
  if (src.assetUrl) customData.assetUrl = src.assetUrl;
  if (src.altText) customData.altText = src.altText;
  if (src.latex) {
    customData.latex = src.latex;
    customData.wbType = "text"; // round-trip preservation
  }
  if (src.type === "graph") {
    customData.wbType = "graph";
    if (src.graphStateJson) customData.graphStateJson = src.graphStateJson;
    customData.assetUrl = GRAPH_EMBED_LINK;
  }
  if (src.type === "desmos") {
    customData.wbType = "desmos";
    if (src.desmosStateJson) customData.desmosStateJson = src.desmosStateJson;
  }
  if (src.clientId) customData.clientId = src.clientId;

  const out: ExcalidrawLikeElement = {
    id: src.id,
    type: mapWBTypeToExcalidraw(src.type),
    x: src.x,
    y: src.y,
    width: src.width,
    height: src.height,
    isDeleted: false,
    customData: Object.keys(customData).length ? customData : undefined,
    link: src.type === "graph" ? GRAPH_EMBED_LINK : undefined,
  };

  if (src.index !== undefined) out.index = src.index;
  if (src.strokeColor !== undefined) out.strokeColor = src.strokeColor;
  if (src.backgroundColor !== undefined) {
    out.backgroundColor = src.backgroundColor;
  }
  if (src.strokeWidth !== undefined) out.strokeWidth = src.strokeWidth;
  if (src.opacity !== undefined) out.opacity = src.opacity;
  if (src.angle !== undefined) out.angle = src.angle;
  if (isLinearWBType(src.type)) {
    out.points = linearPointsForExcalidrawFromWB(src);
  } else if (src.points) {
    out.points = src.points;
  }
  if (src.text !== undefined) out.text = src.text;
  if (src.fontSize !== undefined) out.fontSize = src.fontSize;
  if (typeof src.fontFamily === "number") out.fontFamily = src.fontFamily;

  // Event log only stores `assetUrl` on WB image elements — not Excalidraw's
  // `fileId`. Peers and resume hydrate via `addFiles` keyed by `fileId`, so
  // replay / Load draft must synthesize a stable id (see hydrate-remote-files).
  if (src.type === "image") {
    out.fileId = `wba-${src.id}`;
    out.status = "saved";
  }

  return out;
}

/**
 * Shallow per-field comparison used to decide whether an `update`
 * event needs to fire and which fields to send in the patch. Returns
 * undefined if the elements are identical, otherwise a partial object
 * containing only changed fields.
 *
 * Identity (`a === b`) short-circuits — `useWhiteboardRecorder` keeps
 * the previous frame as a frozen snapshot, so unchanged elements
 * usually compare by reference.
 */
export function diffElement(
  prev: WBElement,
  next: WBElement
): Partial<WBElement> | undefined {
  if (prev === next) return undefined;
  const patch: Partial<WBElement> = {};
  let changed = false;

  // The keys we diff are deliberately chosen to be the user-visible
  // ones. Internal scratchpad like `clientId` is not diffed (clientId
  // is set on `add` only).
  const keys: Array<keyof WBElement> = [
    "type",
    "x",
    "y",
    "width",
    "height",
    "index",
    "strokeColor",
    "backgroundColor",
    "strokeWidth",
    "opacity",
    "angle",
    "points",
    "text",
    "fontSize",
    "fontFamily",
    "assetUrl",
    "altText",
    "latex",
    "graphStateJson",
    "desmosStateJson",
  ];

  for (const k of keys) {
    if (k === "points") {
      if (!pointsEqual(prev.points, next.points)) {
        // Cast through unknown to satisfy the union; runtime semantics
        // are correct because we copy directly from `next`.
        (patch as Record<string, unknown>)[k] = next.points;
        changed = true;
      }
      continue;
    }
    if (prev[k] !== next[k]) {
      (patch as Record<string, unknown>)[k] = next[k];
      changed = true;
    }
  }

  return changed ? patch : undefined;
}

function pointsEqual(
  a: WBElement["points"] | undefined,
  b: WBElement["points"] | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

/**
 * Compute the WBEvent diff between two frames of an Excalidraw scene
 * (prev -> next, both arrays of elements).
 *
 * The recorder hook holds a `prevElementsRef` of canonicalized
 * elements from the last `onChange`. On every new `onChange` it calls
 * this function with `prevRef.current` and the new canonicalized list,
 * appends the returned events to the log, and updates the ref.
 *
 * `t` is supplied by the caller (audio-clock ms — see plan blocker
 * #2) so we don't reach for `Date.now()` here.
 */
export function diffScenes(
  prev: ReadonlyArray<WBElement>,
  next: ReadonlyArray<WBElement>,
  t: number
): WBEvent[] {
  const events: WBEvent[] = [];
  const prevById = new Map<string, WBElement>();
  for (const el of prev) prevById.set(el.id, el);

  const seenIds = new Set<string>();

  for (const nextEl of next) {
    seenIds.add(nextEl.id);
    const prevEl = prevById.get(nextEl.id);
    if (!prevEl) {
      events.push({ t, type: "add", element: nextEl });
      continue;
    }
    const patch = diffElement(prevEl, nextEl);
    if (patch) {
      events.push({ t, type: "update", elementId: nextEl.id, patch });
    }
  }

  for (const prevEl of prev) {
    if (!seenIds.has(prevEl.id)) {
      events.push({ t, type: "remove", elementId: prevEl.id });
    }
  }

  return events;
}

/**
 * Convenience for the "first frame after start" case: emit a single
 * `snapshot` event capturing the entire scene, then update the ref.
 * Used at session start, after pause/resume, and as the welcome
 * packet sent to a joining student client.
 */
export function snapshotEvent(
  elements: ReadonlyArray<WBElement>,
  t: number
): WBEvent {
  return { t, type: "snapshot", elements: [...elements] };
}

/**
 * Map an array of Excalidraw elements through the canonical
 * conversion, dropping nulls. Preserves order — Excalidraw guarantees
 * ascending fractional index order in its `onChange` payload, so we
 * inherit that.
 */
export function canonicalizeScene(
  src: ReadonlyArray<ExcalidrawLikeElement>
): WBElement[] {
  const out: WBElement[] = [];
  for (const el of src) {
    const c = toCanonical(el);
    if (c) out.push(c);
  }
  return out;
}
