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
};

export function peerVisibleSceneRect(
  wire: PeerViewportWire
): { x: number; y: number; width: number; height: number } {
  const { panX, panY, zoom, viewportWidth, viewportHeight } = wire;
  if (!(zoom > 0 && viewportWidth > 0 && viewportHeight > 0)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: -panX,
    y: -panY,
    width: viewportWidth / zoom,
    height: viewportHeight / zoom,
  };
}
