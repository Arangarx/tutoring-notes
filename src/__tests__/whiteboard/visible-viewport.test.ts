import {
  readVisibleViewportRect,
  visibleViewportWireFields,
} from "@/lib/whiteboard/visible-viewport";

describe("readVisibleViewportRect", () => {
  const container = { left: 48, top: 44, width: 800, height: 600 };

  it("intersects the container with the visual viewport", () => {
    const rect = readVisibleViewportRect({
      container,
      visualViewport: { left: 0, top: 100, width: 900, height: 400 },
    });
    expect(rect).toEqual({ left: 0, top: 56, width: 800, height: 400 });
  });

  it("uses the container when there is no visual viewport", () => {
    const rect = readVisibleViewportRect({
      container,
      visualViewport: null,
    });
    expect(rect).toEqual({ left: 0, top: 0, width: 800, height: 600 });
  });

  it("rounds edges to a tenth of a pixel", () => {
    const rect = readVisibleViewportRect({
      container: { left: 0, top: 0, width: 100.04, height: 50.06 },
      visualViewport: null,
    });
    expect(rect).toEqual({ left: 0, top: 0, width: 100, height: 50.1 });
  });

  it("spreads a measured rect onto the wire", () => {
    expect(
      visibleViewportWireFields({ left: 12, top: 8, width: 300, height: 200 })
    ).toEqual({
      viewportWidth: 300,
      viewportHeight: 200,
      visibleLeft: 12,
      visibleTop: 8,
    });
  });

  it("falls back to appState size when the visible rect is missing", () => {
    expect(visibleViewportWireFields(null, { width: 390, height: 700 })).toEqual({
      viewportWidth: 390,
      viewportHeight: 700,
    });
    expect(visibleViewportWireFields(null, { width: 0, height: 700 })).toEqual({});
  });

  it("returns null when the intersection is empty", () => {
    expect(
      readVisibleViewportRect({
        container,
        visualViewport: { left: 0, top: 0, width: 10, height: 10 },
      })
    ).toBeNull();
  });
});
