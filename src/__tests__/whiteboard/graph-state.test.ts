import {
  addGraphExpression,
  clampGraphContainerPx,
  DEFAULT_GRAPH_BBOX,
  extractGraphStateFromElement,
  fitGraphBboxToSquareUnits,
  normalizeGraphBbox,
  parseGraphStateJson,
  preprocessGraphExpression,
  recomputeBboxForResize,
  removeGraphExpression,
  serializeGraphStateJson,
  updateGraphExpression,
  withGraphBbox,
} from "@/lib/whiteboard/graph-state";

function assertSquareUnits(
  bbox: [number, number, number, number],
  widthPx: number,
  heightPx: number
): void {
  const xRange = bbox[2] - bbox[0];
  const yRange = bbox[1] - bbox[3];
  const pxPerUnitX = widthPx / xRange;
  const pxPerUnitY = heightPx / yRange;
  expect(pxPerUnitX).toBeCloseTo(pxPerUnitY, 5);
}

describe("graph-state", () => {
  it("round-trips a minimal graph state", () => {
    const state = {
      bbox: [-5, 5, 5, -5] as [number, number, number, number],
      expressions: ["x^2", "sin(x)"],
    };
    const json = serializeGraphStateJson(state);
    expect(parseGraphStateJson(json)).toEqual({
      ...state,
      points: [],
      strokes: [],
    });
  });

  it("returns defaults for missing input", () => {
    expect(parseGraphStateJson(null)).toEqual({
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: [],
      points: [],
      strokes: [],
    });
  });

  it("returns defaults for malformed JSON", () => {
    expect(parseGraphStateJson("{not json")).toEqual({
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: [],
      points: [],
      strokes: [],
    });
  });

  it("ignores invalid bbox entries and falls back to default", () => {
    expect(parseGraphStateJson({ bbox: [1, 2, "bad"], expressions: [] })).toEqual({
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: [],
      points: [],
      strokes: [],
    });
  });

  it("filters non-string expressions", () => {
    expect(
      parseGraphStateJson({ expressions: ["x", 3, null, "y"] })
    ).toEqual({
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: ["x", "y"],
      points: [],
      strokes: [],
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

    it("turns tutor-style trig and log writing into calls JessieCode can plot", () => {
      // Expectations are the math the tutor wrote, not the rewriter's current output.
      expect(preprocessGraphExpression("2sin(x)")).toBe("2*sin(x)");
      expect(preprocessGraphExpression("2 sin(x)")).toBe("2*sin(x)");
      expect(preprocessGraphExpression("2 sin x")).toBe("2*sin(x)");
      expect(preprocessGraphExpression("log10(x)")).toBe("log10(x)");
      expect(preprocessGraphExpression("log2(x)")).toBe("log2(x)");
      expect(preprocessGraphExpression("sin x")).toBe("sin(x)");
      expect(preprocessGraphExpression("log x")).toBe("log(x)");
      expect(preprocessGraphExpression("ln x")).toBe("ln(x)");
      expect(preprocessGraphExpression("cos x")).toBe("cos(x)");
      expect(preprocessGraphExpression("tan x")).toBe("tan(x)");
      expect(preprocessGraphExpression("sinx")).toBe("sin(x)");
      expect(preprocessGraphExpression("logx")).toBe("log(x)");
      expect(preprocessGraphExpression("lnx")).toBe("ln(x)");
      expect(preprocessGraphExpression("sin2")).toBe("sin(2)");
      expect(preprocessGraphExpression("log10x")).toBe("log10(x)");
      expect(preprocessGraphExpression("log10")).toBe("log10");
      expect(preprocessGraphExpression("sinxy")).toBe("sinxy");
      expect(preprocessGraphExpression("sinx^2")).toBe("sin(x)^2");
    });

    it("keeps expressions that already parse", () => {
      expect(preprocessGraphExpression("x^2")).toBe("x^2");
      expect(preprocessGraphExpression("5x")).toBe("5*x");
      expect(preprocessGraphExpression("2(x+1)")).toBe("2*(x+1)");
      expect(preprocessGraphExpression("(x+1)(x-1)")).toBe("(x+1)*(x-1)");
      expect(preprocessGraphExpression("sin(x)+cos(x)")).toBe("sin(x)+cos(x)");
      expect(preprocessGraphExpression("log(x)+ln(x)")).toBe("log(x)+ln(x)");
      expect(preprocessGraphExpression("tan(2x)")).toBe("tan(2*x)");
      expect(preprocessGraphExpression("sqrt(x)")).toBe("sqrt(x)");
      expect(preprocessGraphExpression("abs(x)")).toBe("abs(x)");
      expect(preprocessGraphExpression("exp(x)")).toBe("exp(x)");
      expect(preprocessGraphExpression("log(x,10)")).toBe("log(x,10)");
    });

    it("accepts inverse trig and pi the way JessieCode spells them", () => {
      expect(preprocessGraphExpression("asin(x)")).toBe("asin(x)");
      expect(preprocessGraphExpression("acos(x)")).toBe("acos(x)");
      expect(preprocessGraphExpression("atan(x)")).toBe("atan(x)");
      expect(preprocessGraphExpression("2asin(x)")).toBe("2*asin(x)");
      expect(preprocessGraphExpression("asin x")).toBe("asin(x)");
      expect(preprocessGraphExpression("asinx")).toBe("asin(x)");
      expect(preprocessGraphExpression("pi")).toBe("PI");
      expect(preprocessGraphExpression("2pi")).toBe("2*PI");
      expect(preprocessGraphExpression("sin(pi)")).toBe("sin(PI)");
      expect(preprocessGraphExpression("sin pi")).toBe("sin(PI)");
    });
  });

  it("round-trips points and strokes in graph user coordinates", () => {
    const state = {
      bbox: [-10, 10, 10, -10] as [number, number, number, number],
      expressions: ["x"],
      points: [
        { id: "p1", x: 1.5, y: -2 },
        { id: "p2", x: 0, y: 4 },
      ],
      strokes: [
        {
          id: "s1",
          pts: [
            [0, 0],
            [1, 2],
            [-3, 0.5],
          ] as [number, number][],
        },
      ],
    };
    expect(parseGraphStateJson(serializeGraphStateJson(state))).toEqual(state);
  });

  it("treats a graph saved before ink fields as empty points and strokes", () => {
    const parsed = parseGraphStateJson({
      bbox: [-5, 5, 5, -5],
      expressions: ["x^2"],
    });
    expect(parsed.expressions).toEqual(["x^2"]);
    expect(parsed.points).toEqual([]);
    expect(parsed.strokes).toEqual([]);
  });

  it("drops unknown fields instead of copying them onto graph state", () => {
    const parsed = parseGraphStateJson({
      expressions: ["sin(x)"],
      futureTool: { kind: "wiggle" },
      points: [{ id: "p", x: 1, y: 2, color: "red" }],
      strokes: [{ id: "s", pts: [[0, 0], [1, 1]], width: 9 }],
    });
    expect(parsed).not.toHaveProperty("futureTool");
    expect(parsed.points).toEqual([{ id: "p", x: 1, y: 2 }]);
    expect(parsed.points?.[0]).not.toHaveProperty("color");
    expect(parsed.strokes).toEqual([{ id: "s", pts: [[0, 0], [1, 1]] }]);
    expect(parsed.strokes?.[0]).not.toHaveProperty("width");
    expect(Object.keys(parsed).sort()).toEqual([
      "bbox",
      "expressions",
      "points",
      "strokes",
    ]);
  });

  it("truncates oversize ink to 500 points, 200 strokes, and 2000 points per stroke", () => {
    const points = Array.from({ length: 600 }, (_, i) => ({
      id: `p${i}`,
      x: i,
      y: i + 1,
    }));
    const strokes = Array.from({ length: 250 }, (_, i) => ({
      id: `s${i}`,
      pts: Array.from({ length: i === 0 ? 2500 : 2 }, (__, j) => [j, j + 1] as [number, number]),
    }));
    const parsed = parseGraphStateJson({
      bbox: [-1, 1, 1, -1],
      expressions: [],
      points,
      strokes,
    });
    expect(parsed.points).toHaveLength(500);
    expect(parsed.points?.[0]).toEqual({ id: "p0", x: 0, y: 1 });
    expect(parsed.points?.[499]).toEqual({ id: "p499", x: 499, y: 500 });
    expect(parsed.strokes).toHaveLength(200);
    expect(parsed.strokes?.[0]?.pts).toHaveLength(2000);
    expect(parsed.strokes?.[0]?.pts[0]).toEqual([0, 1]);
    expect(parsed.strokes?.[199]?.id).toBe("s199");
  });

  describe("square-unit bbox math", () => {
    const aspectCases = [
      { label: "square", width: 400, height: 400 },
      { label: "wide", width: 960, height: 240 },
      { label: "tall", width: 200, height: 900 },
      { label: "ultra-wide", width: 1200, height: 150 },
    ] as const;

    it.each(aspectCases)(
      "fitGraphBboxToSquareUnits keeps 1:1 px-per-unit ($label)",
      ({ width, height }) => {
        const fitted = fitGraphBboxToSquareUnits(DEFAULT_GRAPH_BBOX, width, height);
        assertSquareUnits(fitted, width, height);
        expect(fitted[0]).toBeLessThan(fitted[2]);
        expect(fitted[3]).toBeLessThan(fitted[1]);
      }
    );

    it.each(aspectCases)(
      "recomputeBboxForResize keeps 1:1 px-per-unit ($label)",
      ({ width, height }) => {
        const prevW = 400;
        const prevH = 400;
        const next = recomputeBboxForResize({
          bbox: DEFAULT_GRAPH_BBOX,
          prevWidthPx: prevW,
          prevHeightPx: prevH,
          nextWidthPx: width,
          nextHeightPx: height,
        });
        assertSquareUnits(next, width, height);
      }
    );

    it("expands horizontal range when container grows wider", () => {
      const bbox = DEFAULT_GRAPH_BBOX;
      const next = recomputeBboxForResize({
        bbox,
        prevWidthPx: 400,
        prevHeightPx: 400,
        nextWidthPx: 800,
        nextHeightPx: 400,
      });

      assertSquareUnits(next, 800, 400);
      expect(next[2] - next[0]).toBeGreaterThan(bbox[2] - bbox[0]);
      expect(next[1] - next[3]).toBeCloseTo(bbox[1] - bbox[3], 5);
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
