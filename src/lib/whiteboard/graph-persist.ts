import {
  serializeGraphStateJson,
  type GraphState,
} from "@/lib/whiteboard/graph-state";

type SceneElementLike = {
  id: string;
  version?: number;
  versionNonce?: number;
  updated?: number;
  customData?: Record<string, unknown>;
};

export type GraphPersistApiLike = {
  getSceneElements: () => ReadonlyArray<unknown>;
  updateScene: (data: {
    elements: ReadonlyArray<unknown>;
    captureUpdate?: string;
  }) => void;
};

/**
 * Map one embeddable by id, bump version / versionNonce / updated, and
 * write the scene. `captureUpdate` is forwarded as Excalidraw 0.18
 * `CaptureUpdateAction` (`"NEVER"` skips undo, `"IMMEDIATELY"` records it).
 * Omit it only when the caller must leave the property off the payload.
 */
export function patchGraphElement(
  api: GraphPersistApiLike,
  id: string,
  patch: (el: SceneElementLike) => Record<string, unknown>,
  captureUpdate?: string
): boolean {
  let changed = false;
  const elements = api.getSceneElements().map((raw) => {
    const el = raw as SceneElementLike;
    if (el.id !== id) return raw;
    changed = true;
    const now = Date.now();
    return {
      ...el,
      ...patch(el),
      version: (el.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      updated: now,
    };
  });
  if (!changed) return false;
  if (captureUpdate === undefined) {
    api.updateScene({ elements });
  } else {
    api.updateScene({ elements, captureUpdate });
  }
  return true;
}

/**
 * Write graph state into an embeddable element's customData without polluting
 * Excalidraw undo history (matches board-switch `captureUpdate: "NEVER"`).
 */
export function persistGraphElementState(args: {
  excalidrawAPI: GraphPersistApiLike;
  elementId: string;
  graphState: GraphState;
}): boolean {
  const { excalidrawAPI, elementId, graphState } = args;
  const graphStateJson = serializeGraphStateJson(graphState);
  return patchGraphElement(
    excalidrawAPI,
    elementId,
    (el) => ({
      customData: {
        ...(el.customData ?? {}),
        graphStateJson,
      },
    }),
    "NEVER"
  );
}

/**
 * Graph embeddables must keep `link === GRAPH_EMBED_LINK` ("mynk://graph") on the
 * persisted element. Excalidraw only calls `renderEmbeddable` when the link passes
 * embeddable URL validation on load; clearing link after mount breaks reload
 * ("Empty Web Embed") even though `customData.wbType === "graph"` still routes in
 * memory. Hyperlink popup clicks are suppressed via `onLinkOpen` + CSS; the small
 * on-canvas link badge (renderLinkIcon — canvas pixels, not DOM) is accepted as a
 * cosmetic trade-off until Excalidraw exposes a persistence-safe hide option.
 */
