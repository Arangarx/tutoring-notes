/**
 * Stroke gestures sample at about 30 Hz and persist once, on pointer up.
 * The reducer is the same function GraphEmbeddable calls for Draw.
 */
import { DEFAULT_GRAPH_BBOX, reduceGraphInkGesture, type GraphState } from "@/lib/whiteboard/graph-state";

describe("reduceGraphInkGesture", () => {
  it("samples a stroke at about 30 Hz and persists once on pointer up", () => {
    let state: GraphState = {
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: [],
      points: [],
      strokes: [],
    };
    let draft: ReturnType<typeof reduceGraphInkGesture>["draft"] = null;
    let persists = 0;

    const events = [
      { type: "down" as const, id: "s1", pt: [0, 0] as [number, number], nowMs: 0 },
      ...Array.from({ length: 20 }, (_, i) => ({
        type: "move" as const,
        pt: [i * 0.01, 0.1] as [number, number],
        nowMs: 5,
      })),
      { type: "move" as const, pt: [1, 1] as [number, number], nowMs: 34 },
      { type: "move" as const, pt: [2, 2] as [number, number], nowMs: 40 },
      { type: "move" as const, pt: [3, 3] as [number, number], nowMs: 68 },
      { type: "up" as const, pt: [4, 4] as [number, number], nowMs: 70 },
    ];

    for (const event of events) {
      const result = reduceGraphInkGesture(state, draft, event);
      state = result.state;
      draft = result.draft;
      if (result.persist) persists += 1;
    }

    expect(persists).toBe(1);
    expect(draft).toBeNull();
    expect(state.strokes).toEqual([
      {
        id: "s1",
        pts: [
          [0, 0],
          [1, 1],
          [3, 3],
          [4, 4],
        ],
      },
    ]);
    expect(state.points).toEqual([]);
  });
});
