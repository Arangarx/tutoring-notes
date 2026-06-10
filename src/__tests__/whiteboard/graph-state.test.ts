import {
  addGraphExpression,
  DEFAULT_GRAPH_BBOX,
  extractGraphStateFromElement,
  parseGraphStateJson,
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
});
