/**
 * Playwright integration bridge — exposes the **real** Excalidraw API
 * (`getSceneElements`, `getAppState`, controlled scene mutations) when
 * `NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1`. Not a mock: same instances the app uses.
 */
import {
  insertGraphOnCanvas,
  insertImageOnCanvas,
  type ExcalidrawApiLike,
} from "@/lib/whiteboard/insert-asset";
import { parseGraphStateJson } from "@/lib/whiteboard/graph-state";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import { viewportSceneCenterFromScroll } from "@/lib/whiteboard/viewport-align";

export type WbE2eRole = "tutor" | "student";

export type WbE2eSceneBridge = {
  getElements: () => ReadonlyArray<ExcalidrawLikeElement>;
  getAppState: () => Record<string, unknown>;
  /** Add a unique rectangle at the current viewport scene center (triggers onChange). */
  placeMarkerAtViewportCenter: (markerId: string) => void;
  /** Freedraw-style line segment (triggers onChange + sync). */
  drawTestStroke: (strokeId: string, x1: number, y1: number, x2: number, y2: number) => void;
  /**
   * Create-or-update the SAME element id with a higher version and a wider
   * extent — mimics a real freehand stroke growing across onChange ticks
   * (one id, version 1→2→…→N). This is the live-render path that the
   * version-no-op bug suppresses (continuations of an already-seen id).
   */
  growStroke: (strokeId: string, width: number, version: number) => void;
  /** Read the `version` (or -1) of a given element id from the live scene. */
  versionOf: (strokeId: string) => number;
  /** Read the `width` (or -1) of a given element id from the live scene. */
  widthOf: (strokeId: string) => number;
  /** Move an element by delta in scene units (bumps version, triggers sync). */
  moveElement: (elementId: string, deltaX: number, deltaY: number) => void;
  /** Scene center at viewport center via {@link viewportSceneCenterFromScroll} (oracle). */
  appStateCenterXY: () => { x: number; y: number };
  /** Set scroll/zoom on the live canvas (triggers onChange + sync). */
  setViewport: (scrollX: number, scrollY: number, zoom?: number) => void;
  /** Scene x/y of an element (or null). */
  elementPosition: (elementId: string) => { x: number; y: number } | null;
  /** Image element file/binary inspection for sync-hydration regressions. */
  imageElementState: (elementId: string) => {
    fileId: string | null;
    isPlaceholder: boolean;
    hasBinary: boolean;
    assetUrl: string | null;
  } | null;
  /** PNG fixture → real Blob upload + scene insert (Playwright inv 7). */
  insertImageFixture: (
    base64: string,
    filename: string,
    whiteboardSessionId: string,
    studentId: string
  ) => Promise<string>;
  /** JSXGraph embeddable insert (Playwright inv 12). */
  insertGraphFixture: (
    whiteboardSessionId: string,
    studentId: string,
    initialExpressions?: string[]
  ) => string;
  /** Graph embeddable state for sync-hydration regressions. */
  graphElementState: (elementId: string) => {
    graphStateJson: string | null;
    expressions: string[];
    bbox: [number, number, number, number] | null;
    link: string | null;
  } | null;
};

type WbE2eSceneMutationHook = () => void;

const sceneMutationHooks: Partial<Record<WbE2eRole, WbE2eSceneMutationHook>> =
  {};

declare global {
  interface Window {
    __TN_WB_E2E__?: Partial<Record<WbE2eRole, WbE2eSceneBridge>>;
  }
}

function e2eHookEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK === "1";
}

function readZoom(appState: Record<string, unknown>): number {
  const z = appState.zoom;
  if (z && typeof z === "object" && "value" in z) {
    const v = (z as { value: unknown }).value;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 1;
}

function makeRectangle(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number
): ExcalidrawLikeElement {
  const now = Date.now();
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: "red",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    seed: now % 2 ** 31,
    version: 1,
    versionNonce: now,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    roundness: null,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
  } as ExcalidrawLikeElement;
}

function makeLine(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): ExcalidrawLikeElement {
  const now = Date.now();
  return {
    id,
    type: "line",
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    angle: 0,
    strokeColor: "blue",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    seed: (now + 1) % 2 ** 31,
    version: 1,
    versionNonce: now + 1,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    roundness: { type: 2 },
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    points: [
      [0, 0],
      [x2 - x1, y2 - y1],
    ],
  } as ExcalidrawLikeElement;
}

/** Wire the app's real onChange/broadcast path after programmatic scene edits. */
export function registerWbE2eSceneMutationHook(
  role: WbE2eRole,
  hook: WbE2eSceneMutationHook
): void {
  if (!e2eHookEnabled()) return;
  sceneMutationHooks[role] = hook;
}

function invokeSceneMutationHook(role: WbE2eRole): void {
  sceneMutationHooks[role]?.();
}

export function registerWbE2eSceneBridge(
  role: WbE2eRole,
  api: ExcalidrawApiLike | null
): void {
  if (!e2eHookEnabled() || typeof window === "undefined" || !api) return;

  const bridge: WbE2eSceneBridge = {
    getElements: () => api.getSceneElements() as ExcalidrawLikeElement[],
    getAppState: () => api.getAppState() as Record<string, unknown>,
    placeMarkerAtViewportCenter(markerId: string) {
      const st = api.getAppState() as {
        scrollX: number;
        scrollY: number;
        width?: number;
        height?: number;
      };
      const zoom = readZoom(st as Record<string, unknown>);
      const vw = typeof st.width === "number" && st.width > 0 ? st.width : 800;
      const vh = typeof st.height === "number" && st.height > 0 ? st.height : 600;
      const center = viewportSceneCenterFromScroll(
        st.scrollX,
        st.scrollY,
        zoom,
        vw,
        vh
      );
      const size = 24;
      const el = makeRectangle(
        markerId,
        center.x - size / 2,
        center.y - size / 2,
        size,
        size
      );
      const existing = api.getSceneElements() as ExcalidrawLikeElement[];
      api.updateScene({ elements: [...existing, el] });
      invokeSceneMutationHook(role);
    },
    drawTestStroke(strokeId, x1, y1, x2, y2) {
      const existing = api.getSceneElements() as ExcalidrawLikeElement[];
      const el = makeLine(strokeId, x1, y1, x2, y2);
      api.updateScene({ elements: [...existing, el] });
      invokeSceneMutationHook(role);
    },
    growStroke(strokeId, width, version) {
      const now = Date.now();
      const existing = api.getSceneElements() as ExcalidrawLikeElement[];
      const others = existing.filter(
        (e) => (e as { id?: string }).id !== strokeId
      );
      const el = makeLine(strokeId, 100, 300, 100 + width, 300) as Record<
        string,
        unknown
      >;
      el.version = version;
      el.versionNonce = now + version;
      el.updated = now;
      api.updateScene({
        elements: [...others, el] as ReadonlyArray<unknown>,
      });
      invokeSceneMutationHook(role);
    },
    versionOf(strokeId) {
      const els = api.getSceneElements() as Array<{
        id?: string;
        version?: number;
      }>;
      const el = els.find((e) => e.id === strokeId);
      return el && typeof el.version === "number" ? el.version : -1;
    },
    widthOf(strokeId) {
      const els = api.getSceneElements() as Array<{
        id?: string;
        width?: number;
      }>;
      const el = els.find((e) => e.id === strokeId);
      return el && typeof el.width === "number" ? el.width : -1;
    },
    moveElement(elementId, deltaX, deltaY) {
      const now = Date.now();
      const existing = api.getSceneElements() as ExcalidrawLikeElement[];
      const idx = existing.findIndex((e) => (e as { id?: string }).id === elementId);
      if (idx < 0) {
        throw new Error(`moveElement: ${elementId} not in scene`);
      }
      const el = { ...existing[idx] } as Record<string, unknown> & {
        x?: number;
        y?: number;
        version?: number;
      };
      el.x = (Number(el.x) || 0) + deltaX;
      el.y = (Number(el.y) || 0) + deltaY;
      el.version = (typeof el.version === "number" ? el.version : 0) + 1;
      el.versionNonce = now;
      el.updated = now;
      const next = [...existing];
      next[idx] = el as ExcalidrawLikeElement;
      api.updateScene({ elements: next });
      invokeSceneMutationHook(role);
    },
    appStateCenterXY() {
      const st = api.getAppState() as {
        scrollX: number;
        scrollY: number;
        width?: number;
        height?: number;
      };
      const zoom = readZoom(st as Record<string, unknown>);
      const vw = typeof st.width === "number" && st.width > 0 ? st.width : 800;
      const vh = typeof st.height === "number" && st.height > 0 ? st.height : 600;
      return viewportSceneCenterFromScroll(
        st.scrollX,
        st.scrollY,
        zoom,
        vw,
        vh
      );
    },
    setViewport(scrollX, scrollY, zoom) {
      const st = api.getAppState() as Record<string, unknown>;
      const prevZoom = readZoom(st);
      const nextZoom = typeof zoom === "number" && Number.isFinite(zoom) ? zoom : prevZoom;
      (
        api.updateScene as (data: {
          elements?: ReadonlyArray<unknown>;
          appState?: Record<string, unknown>;
        }) => void
      )({
        appState: {
          ...st,
          scrollX,
          scrollY,
          zoom: { value: nextZoom },
        },
      });
      invokeSceneMutationHook(role);
    },
    elementPosition(elementId) {
      const el = (api.getSceneElements() as Array<{ id?: string; x?: number; y?: number }>).find(
        (e) => e.id === elementId
      );
      if (!el) return null;
      return { x: Number(el.x) || 0, y: Number(el.y) || 0 };
    },
    imageElementState(elementId) {
      const el = (api.getSceneElements() as Array<{
        id?: string;
        type?: string;
        fileId?: string;
        customData?: { isPlaceholder?: boolean; assetUrl?: string };
      }>).find((e) => e.id === elementId);
      if (!el || el.type !== "image") return null;
      const fileId = typeof el.fileId === "string" ? el.fileId : null;
      const custom = el.customData;
      const isPlaceholder = custom?.isPlaceholder === true;
      const assetUrl =
        typeof custom?.assetUrl === "string" ? custom.assetUrl : null;
      let hasBinary = false;
      if (fileId && api.getFiles) {
        const files = api.getFiles() as Record<string, { dataURL?: string }>;
        const entry = files[fileId];
        hasBinary =
          Boolean(entry) &&
          typeof entry.dataURL === "string" &&
          entry.dataURL.length > 0;
      }
      return { fileId, isPlaceholder, hasBinary, assetUrl };
    },
    async insertImageFixture(base64, filename, whiteboardSessionId, studentId) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const file = new File([bytes], filename, { type: "image/png" });
      const result = await insertImageOnCanvas({
        excalidrawAPI: api,
        whiteboardSessionId,
        studentId,
        file,
      });
      if (!result.ok) {
        throw new Error(result.reason);
      }
      invokeSceneMutationHook(role);
      return result.elementId;
    },
    insertGraphFixture(whiteboardSessionId, studentId, initialExpressions) {
      const result = insertGraphOnCanvas({
        excalidrawAPI: api,
        whiteboardSessionId,
        studentId,
        initialExpressions,
      });
      if (!result.ok) {
        throw new Error(result.reason);
      }
      invokeSceneMutationHook(role);
      return result.elementId;
    },
    graphElementState(elementId) {
      const el = (api.getSceneElements() as Array<{
        id?: string;
        type?: string;
        link?: string;
        customData?: { graphStateJson?: string };
      }>).find((e) => e.id === elementId);
      if (!el || el.type !== "embeddable") return null;
      const graphStateJson =
        typeof el.customData?.graphStateJson === "string"
          ? el.customData.graphStateJson
          : null;
      const parsed = parseGraphStateJson(graphStateJson);
      return {
        graphStateJson,
        expressions: parsed.expressions ?? [],
        bbox: parsed.bbox ?? null,
        link: typeof el.link === "string" ? el.link : null,
      };
    },
  };

  window.__TN_WB_E2E__ = { ...window.__TN_WB_E2E__, [role]: bridge };
}

export function unregisterWbE2eSceneBridge(role: WbE2eRole): void {
  if (!e2eHookEnabled() || typeof window === "undefined") return;
  if (!window.__TN_WB_E2E__) return;
  const next = { ...window.__TN_WB_E2E__ };
  delete next[role];
  window.__TN_WB_E2E__ = next;
  delete sceneMutationHooks[role];
}
