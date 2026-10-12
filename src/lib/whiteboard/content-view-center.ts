export type SceneElementBox = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isDeleted?: boolean;
};

/** Center of the current page's element bounds. Null when nothing is drawn. */
export function contentSceneCenter(
  elements: readonly SceneElementBox[]
): { x: number; y: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (typeof el.x !== "number" || typeof el.y !== "number") continue;
    if (!Number.isFinite(el.x) || !Number.isFinite(el.y)) continue;
    const w = typeof el.width === "number" && Number.isFinite(el.width) ? el.width : 0;
    const h = typeof el.height === "number" && Number.isFinite(el.height) ? el.height : 0;
    any = true;
    minX = Math.min(minX, el.x, el.x + w);
    minY = Math.min(minY, el.y, el.y + h);
    maxX = Math.max(maxX, el.x, el.x + w);
    maxY = Math.max(maxY, el.y, el.y + h);
  }
  if (!any) return null;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Scroll that puts the content center at the visible viewport center.
 * An empty board returns the origin view (scroll 0,0 at zoom 1).
 */
export function tutorRecenterScroll(args: {
  elements: readonly SceneElementBox[];
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  visibleLeft?: number;
  visibleTop?: number;
}): { scrollX: number; scrollY: number; zoom: number } {
  const center = contentSceneCenter(args.elements);
  if (!center || !(args.viewportWidth > 0 && args.viewportHeight > 0)) {
    return { scrollX: 0, scrollY: 0, zoom: 1 };
  }
  const zoom = args.zoom > 0 ? args.zoom : 1;
  const midX = (args.visibleLeft ?? 0) + args.viewportWidth / 2;
  const midY = (args.visibleTop ?? 0) + args.viewportHeight / 2;
  return {
    scrollX: midX / zoom - center.x,
    scrollY: midY / zoom - center.y,
    zoom,
  };
}
