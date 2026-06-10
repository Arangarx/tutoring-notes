import {
  addGraphExpression,
  clampGraphContainerPx,
  DEFAULT_GRAPH_BBOX,
  extractGraphStateFromElement,
  normalizeGraphBbox,
  parseGraphStateJson,
  preprocessGraphExpression,
  recomputeBboxForResize,
  removeGraphExpression,
  serializeGraphStateJson,
  updateGraphExpression,
  withGraphBbox,
} from "@/lib/whiteboard/graph-state";

describe("graph-state", () => {
  it("round-trips a minimal graph state", () => {
    const state = {
      bbox: [-5, 5, 5, -5] as [number, number, number, number],
      expressions: ["x^2", "sin(x)"],
    };
    const json = serializeGraphStateJson(state);
    expect(parseGraphStateJson(json)).toEqual(state);
  });

  it("returns defaults for missing input", () => {
    expect(parseGraphStateJson(null)).toEqual({
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: [],
    });
  });

  it("returns defaults for malformed JSON", () => {
    expect(parseGraphStateJson("{not json")).toEqual({
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: [],
    });
  });

  it("ignores invalid bbox entries and falls back to default", () => {
    expect(parseGraphStateJson({ bbox: [1, 2, "bad"], expressions: [] })).toEqual({
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: [],
    });
  });

  it("filters non-string expressions", () => {
    expect(
      parseGraphStateJson({ expressions: ["x", 3, null, "y"] })
    ).toEqual({
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: ["x", "y"],
    });
  });

  it("extracts graphStateJson from an embeddable element", () => {
    const json = serializeGraphStateJson({ expressions: ["cos(x)"] });
    const state = extractGraphStateFromElement({
      customData: { graphStateJson: json },
    });
    expect(state.expressions).toEqual(["cos(x)"]);
  });

  it("adds, updates, and removes expressions immutably", () => {
    const base = { bbox: DEFAULT_GRAPH_BBOX, expressions: ["x"] };
    const added = addGraphExpression(base, "x^2");
    expect(added.expressions).toEqual(["x", "x^2"]);
    expect(base.expressions).toEqual(["x"]);

    const updated = updateGraphExpression(added, 0, "2*x");
    expect(updated.expressions).toEqual(["2*x", "x^2"]);

    const removed = removeGraphExpression(updated, 1);
    expect(removed.expressions).toEqual(["2*x"]);
  });

  it("round-trips bbox via withGraphBbox", () => {
    const bbox = [-2, 6, 8, -3] as [number, number, number, number];
    const state = withGraphBbox({ expressions: [] }, bbox);
    expect(parseGraphStateJson(serializeGraphStateJson(state)).bbox).toEqual(bbox);
  });

  describe("preprocessGraphExpression", () => {
    it("inserts implicit multiplication for tutor-style expressions", () => {
      expect(preprocessGraphExpression("x^3+5x^2-2")).toBe("x^3+5*x^2-2");
      expect(preprocessGraphExpression("2(x+1)")).toBe("2*(x+1)");
      expect(preprocessGraphExpression("x(x+1)")).toBe("x*(x+1)");
      expect(preprocessGraphExpression("2)(x+1)")).toBe("2)*(x+1)");
    });

    it("does not corrupt known function calls", () => {
      expect(preprocessGraphExpression("sin(x)+cos(x)")).toBe("sin(x)+cos(x)");
      expect(preprocessGraphExpression("log(x)+ln(x)")).toBe("log(x)+ln(x)");
      expect(preprocessGraphExpression("sqrt(x)+abs(x)+exp(x)")).toBe(
        "sqrt(x)+abs(x)+exp(x)"
      );
      expect(preprocessGraphExpression("tan(2x)")).toBe("tan(2*x)");
    });
  });

  describe("recomputeBboxForResize", () => {
    it("keeps square units and expands area when container grows", () => {
      const bbox = DEFAULT_GRAPH_BBOX;
      const prevW = 400;
      const prevH = 400;
      const nextW = 800;
      const nextH = 400;

      const next = recomputeBboxForResize({
        bbox,
        prevWidthPx: prevW,
        prevHeightPx: prevH,
        nextWidthPx: nextW,
        nextHeightPx: nextH,
      });

      const xRange = next[2] - next[0];
      const yRange = next[1] - next[3];
      const pxPerUnitX = nextW / xRange;
      const pxPerUnitY = nextH / yRange;
      expect(pxPerUnitX).toBeCloseTo(pxPerUnitY, 5);
      expect(xRange).toBeGreaterThan(bbox[2] - bbox[0]);
      expect(yRange).toBeCloseTo(bbox[1] - bbox[3], 5);
      expect(next[0]).toBeLessThan(next[2]);
      expect(next[3]).toBeLessThan(next[1]);
    });

    it("normalizes inverted bbox and clamps tiny container sizes", () => {
      const flipped = recomputeBboxForResize({
        bbox: [10, -10, -10, 10],
        prevWidthPx: 0,
        prevHeightPx: -5,
        nextWidthPx: 0,
        nextHeightPx: 0,
      });
      expect(flipped[0]).toBeLessThan(flipped[2]);
      expect(flipped[3]).toBeLessThan(flipped[1]);
      expect(clampGraphContainerPx(0)).toBeGreaterThan(0);
      expect(normalizeGraphBbox([5, 1, 1, 5])[0]).toBeLessThan(
        normalizeGraphBbox([5, 1, 1, 5])[2]
      );
    });
  });
});
