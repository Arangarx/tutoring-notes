export type BoardSwitchEmitCamera = {
  pageId: string;
  panX: number;
  panY: number;
  zoom: number;
};

/**
 * Publish the camera a board switch just wrote. The document flush reads
 * the ref because Excalidraw can still report the previous board. The ref
 * is cleared even when the flush or the page-view broadcast throws.
 */
export function emitBoardSwitchCamera(args: {
  cameraRef: { current: BoardSwitchEmitCamera | null };
  camera: BoardSwitchEmitCamera | null;
  flushDocument: () => void;
  broadcastPageView: (camera?: BoardSwitchEmitCamera) => void;
}): void {
  args.cameraRef.current = args.camera;
  try {
    args.flushDocument();
    args.broadcastPageView(args.camera ?? undefined);
  } finally {
    args.cameraRef.current = null;
  }
}
