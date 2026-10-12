import { tutorRecenterScroll } from "@/lib/whiteboard/content-view-center";

describe("tutorRecenterScroll", () => {
  it("centers the content bounding box in the visible viewport", () => {
    const scroll = tutorRecenterScroll({
      elements: [
        { x: 100, y: 40, width: 20, height: 10 },
        { x: 200, y: 80, width: 40, height: 20 },
      ],
      zoom: 2,
      viewportWidth: 800,
      viewportHeight: 600,
      visibleLeft: 40,
      visibleTop: 20,
    });
    expect(scroll.zoom).toBe(2);
    expect(scroll.scrollX).toBeCloseTo((40 + 400) / 2 - 170, 5);
    expect(scroll.scrollY).toBeCloseTo((20 + 300) / 2 - 70, 5);
  });

  it("ignores deleted elements", () => {
    const scroll = tutorRecenterScroll({
      elements: [
        { x: 0, y: 0, width: 10, height: 10, isDeleted: true },
        { x: 50, y: 30, width: 10, height: 10 },
      ],
      zoom: 1,
      viewportWidth: 200,
      viewportHeight: 100,
    });
    expect(scroll.scrollX).toBeCloseTo(100 - 55, 5);
    expect(scroll.scrollY).toBeCloseTo(50 - 35, 5);
  });

  it("returns the origin view when the board is empty", () => {
    expect(
      tutorRecenterScroll({
        elements: [],
        zoom: 2.5,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    ).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
  });
});
