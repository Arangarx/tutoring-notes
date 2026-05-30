/**
 * Playwright integration bridge — exposes the **real** Excalidraw API
 * (`getSceneElements`, `getAppState`, controlled scene mutations) when
 * `NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1`. Not a mock: same instances the app uses.
 */
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
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
