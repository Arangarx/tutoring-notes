import { GRAPH_EMBED_LINK } from "@/lib/whiteboard/insert-asset";

/**
 * Excalidraw `validateEmbeddable` for embeddable elements. Only the
 * internal JSXGraph sentinel is accepted — external iframe URLs are not.
 */
export function validateExcalidrawEmbeddable(url: string): true | undefined {
  if (url === GRAPH_EMBED_LINK) return true;
  return undefined;
}
