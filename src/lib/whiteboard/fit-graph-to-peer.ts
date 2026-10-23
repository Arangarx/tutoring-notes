import type { GraphPersistApiLike } from "@/lib/whiteboard/graph-persist";
import {
  peerVisibleSceneRect,
  type PeerViewportWire,
} from "@/lib/whiteboard/peer-viewport-scene-rect";

export type GraphSceneBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * CSS pixels of padding inside the peer's visible board.
 * Converted to scene units with the peer's own zoom.
 */
const FIT_INSET_CSS_PX = 16;
const MIN_SCENE_EDGE = 48;

/**
 * Scene rectangle for a graph element that sits inside the peer's visible view.
 * Does not change follow/zoom. Returns null when the peer size is unknown
 * or too small to leave a usable graph after the inset.
 */
export function graphSceneBoxFitToPeer(peer: PeerViewportWire): GraphSceneBox | null {
  const visible = peerVisibleSceneRect(peer);
  if (!(visible.width > 0 && visible.height > 0)) return null;
  const zoom = peer.zoom > 0 ? peer.zoom : 1;
  const inset = FIT_INSET_CSS_PX / zoom;
  const width = visible.width - inset * 2;
  const height = visible.height - inset * 2;
  if (!(width >= MIN_SCENE_EDGE && height >= MIN_SCENE_EDGE)) return null;
  return {
    x: visible.x + inset,
    y: visible.y + inset,
    width,
    height,
  };
}

type SceneElementLike = {
  id: string;
  version?: number;
  versionNonce?: number;
  updated?: number;
};

/**
 * Write a graph embed's scene box. Same element fields a manual resize
 * changes (x, y, width, height). graphStateJson is left untouched.
 * Omits captureUpdate so Excalidraw records it like a user resize.
 */
export function resizeGraphElementToBox(args: {
  excalidrawAPI: GraphPersistApiLike;
  elementId: string;
  box: GraphSceneBox;
}): boolean {
  const { excalidrawAPI, elementId, box } = args;
  let changed = false;
  const elements = excalidrawAPI.getSceneElements().map((raw) => {
    const el = raw as SceneElementLike;
    if (el.id !== elementId) return raw;
    changed = true;
    return {
      ...el,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      version: (el.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      updated: Date.now(),
    };
  });
  if (!changed) return false;
  excalidrawAPI.updateScene({ elements });
  return true;
}
