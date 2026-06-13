/**
 * Shared lazy cache for Excalidraw `restoreElements` used by replay surfaces.
 * Imported by `useReplayTimelineController`, `ReplayCanvasSurface`, and
 * `WhiteboardReplay` so preload is not duplicated per component instance.
 */

let cachedRestoreElements:
  | (typeof import("@excalidraw/excalidraw"))["restoreElements"]
  | null = null;

export function getReplayCachedRestoreElements() {
  return cachedRestoreElements;
}

export function setReplayCachedRestoreElements(
  fn: (typeof import("@excalidraw/excalidraw"))["restoreElements"]
) {
  cachedRestoreElements = fn;
}

export async function preloadReplayRestoreElements(): Promise<boolean> {
  if (cachedRestoreElements) return true;
  const m = await import("@excalidraw/excalidraw");
  cachedRestoreElements = m.restoreElements;
  return true;
}
