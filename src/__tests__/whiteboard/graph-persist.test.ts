import { GRAPH_EMBED_LINK } from "@/lib/whiteboard/insert-asset";
import {
  persistGraphElementState,
  suppressGraphEmbedLink,
} from "@/lib/whiteboard/graph-persist";
import { serializeGraphStateJson } from "@/lib/whiteboard/graph-state";

describe("persistGraphElementState", () => {
  it("writes graphStateJson with captureUpdate NEVER", () => {
    const state = {
      bbox: [-5, 5, 5, -5] as [number, number, number, number],
      expressions: ["x^2"],
    };
    const element = {
      id: "graph-1",
      type: "embeddable",
      version: 1,
      customData: { wbType: "graph" },
    };
    const updateScene = jest.fn();
    const api = {
      getSceneElements: () => [element],
      updateScene,
    };

    const ok = persistGraphElementState({
      excalidrawAPI: api,
      elementId: "graph-1",
      graphState: state,
    });

    expect(ok).toBe(true);
    expect(updateScene).toHaveBeenCalledTimes(1);
    const payload = updateScene.mock.calls[0][0];
    expect(payload.captureUpdate).toBe("NEVER");
    const next = payload.elements[0] as { customData: { graphStateJson: string } };
    expect(JSON.parse(next.customData.graphStateJson)).toEqual(state);
  });

  it("returns false when element id is missing", () => {
    const api = {
      getSceneElements: () => [],
      updateScene: jest.fn(),
    };
    expect(
      persistGraphElementState({
        excalidrawAPI: api,
        elementId: "missing",
        graphState: { expressions: [] },
      })
    ).toBe(false);
  });

  it("round-trips bbox through serialize", () => {
    const bbox = [-3, 8, 12, -4] as [number, number, number, number];
    const json = serializeGraphStateJson({ bbox, expressions: ["sin(x)"] });
    expect(JSON.parse(json)).toEqual({ bbox, expressions: ["sin(x)"] });
  });

  it("clears sentinel graph link without touching customData", () => {
    const element = {
      id: "graph-2",
      type: "embeddable",
      version: 1,
      link: GRAPH_EMBED_LINK,
      customData: { wbType: "graph", graphStateJson: "{}" },
    };
    const updateScene = jest.fn();
    const api = {
      getSceneElements: () => [element],
      updateScene,
    };

    expect(
      suppressGraphEmbedLink({ excalidrawAPI: api, elementId: "graph-2" })
    ).toBe(true);

    const next = updateScene.mock.calls[0][0].elements[0] as {
      link: string | null;
      customData: { wbType: string };
    };
    expect(next.link).toBeNull();
    expect(next.customData.wbType).toBe("graph");
    expect(updateScene.mock.calls[0][0].captureUpdate).toBe("NEVER");
  });
});
