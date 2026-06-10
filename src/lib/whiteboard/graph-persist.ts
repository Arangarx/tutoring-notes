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
  let changed = false;

  const elements = excalidrawAPI.getSceneElements().map((raw) => {
    const el = raw as SceneElementLike;
    if (el.id !== elementId) return raw;
    changed = true;
    const now = Date.now();
    return {
      ...el,
      customData: {
        ...(el.customData ?? {}),
        graphStateJson,
      },
      version: (el.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      updated: now,
    };
  });

  if (!changed) return false;

  excalidrawAPI.updateScene({
    elements,
    captureUpdate: "NEVER",
  });
  return true;
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
