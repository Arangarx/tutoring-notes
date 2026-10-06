import { peerVisibleSceneRect } from "@/lib/whiteboard/peer-viewport-scene-rect";

describe("peerVisibleSceneRect", () => {
  it("maps scroll/zoom/viewport size to scene bounds", () => {
    const r = peerVisibleSceneRect({
      panX: 10,
      panY: -5,
      zoom: 2,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(r.x).toBe(-10);
    expect(r.y).toBe(5);
    expect(r.width).toBe(400);
    expect(r.height).toBe(300);
  });
});
