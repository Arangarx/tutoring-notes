/**
 * Minimal persisted state for self-hosted JSXGraph embeddables.
 * Serialized into Excalidraw `customData.graphStateJson`.
 */

/** JSXGraph boundingbox: [xmin, ymax, xmax, ymin] */
export type GraphBbox = [number, number, number, number];

export type GraphState = {
  bbox?: GraphBbox;
  expressions?: string[];
};

export const DEFAULT_GRAPH_BBOX: GraphBbox = [-10, 10, 10, -10];

export function serializeGraphStateJson(state: GraphState): string {
  return JSON.stringify(state);
}

/**
 * Parse `graphStateJson` from an embeddable element's customData.
 * Returns a safe default on missing or malformed input.
 */
export function parseGraphStateJson(raw: unknown): GraphState {
  if (raw == null || raw === "") {
    return { bbox: DEFAULT_GRAPH_BBOX, expressions: [] };
  }

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { bbox: DEFAULT_GRAPH_BBOX, expressions: [] };
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { bbox: DEFAULT_GRAPH_BBOX, expressions: [] };
  }

  const obj = parsed as Record<string, unknown>;
  const state: GraphState = {};

  if (Array.isArray(obj.bbox) && obj.bbox.length === 4) {
    const nums = obj.bbox.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : NaN));
    if (nums.every((n) => !Number.isNaN(n))) {
      state.bbox = nums as GraphBbox;
    }
  }

  if (Array.isArray(obj.expressions)) {
    state.expressions = obj.expressions.filter((e): e is string => typeof e === "string");
  } else {
    state.expressions = [];
  }

  if (!state.bbox) {
    state.bbox = DEFAULT_GRAPH_BBOX;
  }

  return state;
}

export function extractGraphStateFromElement(element: {
  customData?: Record<string, unknown>;
}): GraphState {
  const customData = element.customData;
  if (!customData) {
    return parseGraphStateJson(null);
  }
  return parseGraphStateJson(customData.graphStateJson);
}
