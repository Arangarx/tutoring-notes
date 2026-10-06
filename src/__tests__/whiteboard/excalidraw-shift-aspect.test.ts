import { EXCALIDRAW_SHIFT_LOCKS_RECT_ELLIPSE_ASPECT } from "@/lib/whiteboard/excalidraw-shift-aspect";

describe("Excalidraw Shift aspect lock contract", () => {
  it("documents native Shift square/circle — no duplicate handler in app", () => {
    expect(EXCALIDRAW_SHIFT_LOCKS_RECT_ELLIPSE_ASPECT).toBe(true);
  });
});
