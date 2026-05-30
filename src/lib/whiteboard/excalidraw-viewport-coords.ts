/**
 * Vendored from @excalidraw/excalidraw v0.18.1 `packages/excalidraw/utils.ts`
 * (`viewportCoordsToSceneCoords`, `sceneCoordsToViewportCoords`). Must stay in
 * sync with the app's Excalidraw bundle — these are the library's real
 * transforms, not app-specific math.
 */

export type ExcalidrawZoom = {
  value: number;
  translation?: { x: number; y: number };
};

export type ViewportCoordTransform = {
  zoom: ExcalidrawZoom;
  offsetLeft: number;
  offsetTop: number;
  scrollX: number;
  scrollY: number;
};

export const viewportCoordsToSceneCoords = (
  { clientX, clientY }: { clientX: number; clientY: number },
  { zoom, offsetLeft, offsetTop, scrollX, scrollY }: ViewportCoordTransform
) => {
  const x = (clientX - offsetLeft) / zoom.value - scrollX;
  const y = (clientY - offsetTop) / zoom.value - scrollY;
  return { x, y };
};

export const sceneCoordsToViewportCoords = (
  { sceneX, sceneY }: { sceneX: number; sceneY: number },
  { zoom, offsetLeft, offsetTop, scrollX, scrollY }: ViewportCoordTransform
) => {
  const x = (sceneX + scrollX) * zoom.value + offsetLeft;
  const y = (sceneY + scrollY) * zoom.value + offsetTop;
  return { x, y };
};
