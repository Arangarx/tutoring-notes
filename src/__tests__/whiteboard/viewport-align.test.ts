import {
  alignStudentScrollToTutorCenter,
  sceneCenterFromScroll,
  scrollFromSceneCenter,
} from "@/lib/whiteboard/viewport-align";

describe("viewport-align", () => {
  it("center-aligns student scroll for mismatched viewport sizes", () => {
    const aligned = alignStudentScrollToTutorCenter(
      {
        panX: 100,
        panY: 50,
        zoom: 1,
        viewportWidth: 1200,
        viewportHeight: 900,
      },
      800,
      600
    );
    expect(aligned.scrollX).toBeCloseTo(300, 5);
    expect(aligned.scrollY).toBeCloseTo(200, 5);
    expect(aligned.zoom).toBe(1);
  });

  it("scene center round-trips through scroll helpers", () => {
    const center = sceneCenterFromScroll(10, 20, 2, 400, 300);
    const back = scrollFromSceneCenter(center.x, center.y, 2, 400, 300);
    expect(back.scrollX).toBeCloseTo(10, 5);
    expect(back.scrollY).toBeCloseTo(20, 5);
  });
});
