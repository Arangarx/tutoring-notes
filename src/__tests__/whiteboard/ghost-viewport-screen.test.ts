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

  it("includes a nonzero canvas offset in the client box", () => {
    const box = sceneRectToOverlayBox(
      { x: 10, y: 20, width: 100, height: 50 },
      {
        scrollX: -10,
        scrollY: -20,
        zoom: { value: 2 },
        offsetLeft: 40,
        offsetTop: 16,
      }
    );
    expect(box).not.toBeNull();
    expect(box!.left).toBeCloseTo(40, 0);
    expect(box!.top).toBeCloseTo(16, 0);
    expect(box!.width).toBeCloseTo(200, 0);
    expect(box!.height).toBeCloseTo(100, 0);
  });
});
