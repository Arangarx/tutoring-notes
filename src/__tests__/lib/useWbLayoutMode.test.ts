import {
  detectLayoutMode,
} from "@/components/whiteboard/chrome/useWbLayoutMode";

describe("detectLayoutMode", () => {
  describe("non-touch (desktop pointer)", () => {
    const touch = false;

    test("half-screen window stays desktop", () => {
      expect(detectLayoutMode(640, 800, touch)).toBe("desktop");
      expect(detectLayoutMode(700, 500, touch)).toBe("desktop");
      expect(detectLayoutMode(960, 1080, touch)).toBe("desktop");
    });

    test("very narrow desktop window falls back to narrow", () => {
      expect(detectLayoutMode(399, 800, touch)).toBe("narrow");
    });
  });

  describe("touch-primary", () => {
    const touch = true;

    test("phone portrait", () => {
      expect(detectLayoutMode(390, 844, touch)).toBe("narrow");
    });

    test("phone landscape", () => {
      expect(detectLayoutMode(844, 390, touch)).toBe("phone-landscape");
    });

    test("tablet portrait", () => {
      expect(detectLayoutMode(768, 1024, touch)).toBe("tablet-portrait");
    });
  });
});
