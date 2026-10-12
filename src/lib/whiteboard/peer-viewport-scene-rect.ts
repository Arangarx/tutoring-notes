/**
 * Scene-axis bounds of a peer's visible viewport (Excalidraw scroll/zoom model).
 * Independent oracle for VP-01 ghost overlay geometry.
 */

export type PeerViewportWire = {
  panX: number;
  panY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  /** CSS px from the sender's container top-left. Missing on legacy peers. */
  visibleLeft?: number;
  visibleTop?: number;
};

export function peerVisibleSceneRect(
  wire: PeerViewportWire
): { x: number; y: number; width: number; height: number } {
  const { panX, panY, zoom, viewportWidth, viewportHeight } = wire;
  if (!(zoom > 0 && viewportWidth > 0 && viewportHeight > 0)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const visibleLeft = wire.visibleLeft ?? 0;
  const visibleTop = wire.visibleTop ?? 0;
  return {
    x: -panX + visibleLeft / zoom,
    y: -panY + visibleTop / zoom,
    width: viewportWidth / zoom,
    height: viewportHeight / zoom,
  };
}
