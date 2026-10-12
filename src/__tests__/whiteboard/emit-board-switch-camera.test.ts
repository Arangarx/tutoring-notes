import {
  emitBoardSwitchCamera,
  type BoardSwitchEmitCamera,
} from "@/lib/whiteboard/emit-board-switch-camera";

const camera: BoardSwitchEmitCamera = {
  pageId: "p2",
  panX: 12,
  panY: -4,
  zoom: 1.5,
};

describe("emitBoardSwitchCamera", () => {
  it("holds the camera only while the flush and broadcast run", () => {
    const cameraRef: { current: BoardSwitchEmitCamera | null } = { current: null };
    let seen: BoardSwitchEmitCamera | null = null;
    const broadcastPageView = jest.fn();
    emitBoardSwitchCamera({
      cameraRef,
      camera,
      flushDocument: () => {
        seen = cameraRef.current;
      },
      broadcastPageView,
    });
    expect(seen).toEqual(camera);
    expect(broadcastPageView).toHaveBeenCalledWith(camera);
    expect(cameraRef.current).toBeNull();
  });

  it("clears the camera ref when the document flush throws", () => {
    const cameraRef: { current: BoardSwitchEmitCamera | null } = { current: null };
    const broadcastPageView = jest.fn();
    expect(() =>
      emitBoardSwitchCamera({
        cameraRef,
        camera,
        flushDocument: () => {
          throw new Error("flush failed");
        },
        broadcastPageView,
      })
    ).toThrow("flush failed");
    expect(broadcastPageView).not.toHaveBeenCalled();
    expect(cameraRef.current).toBeNull();
  });

  it("clears the camera ref when the page-view broadcast throws", () => {
    const cameraRef: { current: BoardSwitchEmitCamera | null } = { current: null };
    let flushedWhileSet = false;
    expect(() =>
      emitBoardSwitchCamera({
        cameraRef,
        camera,
        flushDocument: () => {
          flushedWhileSet = cameraRef.current === camera;
        },
        broadcastPageView: () => {
          throw new Error("broadcast failed");
        },
      })
    ).toThrow("broadcast failed");
    expect(flushedWhileSet).toBe(true);
    expect(cameraRef.current).toBeNull();
  });
});
