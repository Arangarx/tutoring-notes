import { GRAPH_EMBED_LINK } from "@/lib/whiteboard/insert-asset";
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
 * Clear the sentinel `mynk://graph` link on a graph embeddable after validation.
 *
 * Excalidraw draws an on-canvas link badge (renderLinkIcon in staticScene.ts) for
 * any element with a non-null `link` when unselected — CSS cannot hide canvas
 * pixels. Clearing `link` removes the badge while `customData.wbType === "graph"`
 * still routes `renderEmbeddable`. Desmos embeds keep https links; normal
 * hyperlinks are unaffected.
 */
export function suppressGraphEmbedLink(args: {
  excalidrawAPI: GraphPersistApiLike;
  elementId: string;
}): boolean {
  const { excalidrawAPI, elementId } = args;
  let changed = false;

  const elements = excalidrawAPI.getSceneElements().map((raw) => {
    const el = raw as SceneElementLike & { link?: string | null };
    if (el.id !== elementId) return raw;
    if (el.link !== GRAPH_EMBED_LINK) return raw;
    changed = true;
    const now = Date.now();
    return {
      ...el,
      link: null,
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
