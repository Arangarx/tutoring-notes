import {
  sceneCoordsToViewportCoords,
  type ViewportCoordTransform,
} from "@/lib/whiteboard/excalidraw-viewport-coords";

export function sceneRectToOverlayBox(
  rect: { x: number; y: number; width: number; height: number },
  transform: ViewportCoordTransform
): { left: number; top: number; width: number; height: number } | null {
  if (!(rect.width > 0 && rect.height > 0)) return null;
  const tl = sceneCoordsToViewportCoords(
    { sceneX: rect.x, sceneY: rect.y },
    transform
  );
  const br = sceneCoordsToViewportCoords(
    { sceneX: rect.x + rect.width, sceneY: rect.y + rect.height },
    transform
  );
  const left = Math.min(tl.x, br.x);
  const top = Math.min(tl.y, br.y);
  const width = Math.abs(br.x - tl.x);
  const height = Math.abs(br.y - tl.y);
  if (!(width > 1 && height > 1)) return null;
  return { left, top, width, height };
}
