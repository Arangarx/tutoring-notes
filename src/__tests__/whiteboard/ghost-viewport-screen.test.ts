import { sceneRectToOverlayBox } from "@/lib/whiteboard/ghost-viewport-screen";

describe("sceneRectToOverlayBox", () => {
  it("maps scene rect to overlay pixels using viewer scroll/zoom", () => {
    const box = sceneRectToOverlayBox(
      { x: 0, y: 0, width: 100, height: 50 },
      {
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        offsetLeft: 0,
        offsetTop: 0,
      }
    );
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(100, 0);
    expect(box!.height).toBeCloseTo(50, 0);
  });
});
