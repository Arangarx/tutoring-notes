import { peerVisibleSceneRect } from "@/lib/whiteboard/peer-viewport-scene-rect";
import {
  graphSceneBoxFitToPeer,
  resizeGraphElementToBox,
} from "@/lib/whiteboard/fit-graph-to-peer";

describe("graphSceneBoxFitToPeer", () => {
  const peer = {
    panX: -100,
    panY: -80,
    zoom: 1,
    viewportWidth: 390,
    viewportHeight: 700,
    visibleLeft: 0,
    visibleTop: 12,
  };

  test("the fitted box sits strictly inside the peer's visible scene rect", () => {
    const visible = peerVisibleSceneRect(peer);
    const box = graphSceneBoxFitToPeer(peer);
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThan(visible.x);
    expect(box!.y).toBeGreaterThan(visible.y);
    expect(box!.x + box!.width).toBeLessThan(visible.x + visible.width);
    expect(box!.y + box!.height).toBeLessThan(visible.y + visible.height);
  });

  test("unknown peer size does not invent a box", () => {
    expect(
      graphSceneBoxFitToPeer({
        panX: 0,
        panY: 0,
        zoom: 1,
        viewportWidth: 0,
        viewportHeight: 400,
      })
    ).toBeNull();
  });
});

describe("resizeGraphElementToBox", () => {
  test("updates only the target element's scene box and leaves graphStateJson", () => {
    const graph = {
      id: "g1",
      x: 0,
      y: 0,
      width: 720,
      height: 540,
      version: 3,
      customData: { graphStateJson: "{\"expressions\":[\"x\"]}" },
    };
    const other = { id: "stroke", x: 1, y: 2, width: 10, height: 10, version: 1 };
    const updateScene = jest.fn();
    const ok = resizeGraphElementToBox({
      excalidrawAPI: {
        getSceneElements: () => [graph, other],
        updateScene,
      },
      elementId: "g1",
      box: { x: 20, y: 30, width: 300, height: 400 },
    });
    expect(ok).toBe(true);
    const next = updateScene.mock.calls[0][0].elements as Array<{
      id: string;
      x: number;
      width: number;
      version: number;
      customData?: { graphStateJson?: string };
    }>;
    expect(next[0].x).toBe(20);
    expect(next[0].width).toBe(300);
    expect(next[0].version).toBe(4);
    expect(next[0].customData?.graphStateJson).toBe(graph.customData.graphStateJson);
    expect(next[1]).toBe(other);
    // Excalidraw 0.18 CaptureUpdateAction.IMMEDIATELY records the update on
    // the undo stack immediately, the same as a user resize. Omitting
    // captureUpdate defaults to EVENTUALLY, which is not undoable yet.
    expect(updateScene.mock.calls[0][0].captureUpdate).toBe("IMMEDIATELY");
  });
});
