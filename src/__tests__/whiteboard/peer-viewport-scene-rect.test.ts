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

  it("shifts the scene origin by the visible inset divided by zoom", () => {
    const r = peerVisibleSceneRect({
      panX: 10,
      panY: -5,
      zoom: 2,
      viewportWidth: 800,
      viewportHeight: 600,
      visibleLeft: 20,
      visibleTop: 10,
    });
    expect(r.x).toBe(0);
    expect(r.y).toBe(10);
    expect(r.width).toBe(400);
    expect(r.height).toBe(300);
  });

  it("treats a missing visible inset as zero (legacy peers)", () => {
    const r = peerVisibleSceneRect({
      panX: 0,
      panY: 0,
      zoom: 1,
      viewportWidth: 100,
      viewportHeight: 50,
    });
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });
});
