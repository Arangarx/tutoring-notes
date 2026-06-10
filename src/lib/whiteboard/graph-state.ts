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

/** Minimum container edge (px) — avoids zero/inverted bbox during resize flips. */
export const MIN_GRAPH_CONTAINER_PX = 8;

/** Minimum axis span in math units — keeps bbox non-degenerate. */
export const MIN_GRAPH_BBOX_SPAN = 1e-6;

/** Function tokens that must not receive implicit `*` before `(`. */
export const GRAPH_FUNCTION_TOKENS = [
  "sin",
  "cos",
  "tan",
  "log",
  "ln",
  "sqrt",
  "abs",
  "exp",
  "pi",
  "e",
] as const;

const IMPLICIT_MULT_FN_RE =
  /\b(sin|cos|tan|log|ln|sqrt|abs|exp)\s*\(/gi;

export function clampGraphContainerPx(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return MIN_GRAPH_CONTAINER_PX;
  return Math.max(px, MIN_GRAPH_CONTAINER_PX);
}

/**
 * Ensure JSXGraph bbox is well-ordered and has a positive span on each axis.
 * Format: [xmin, ymax, xmax, ymin].
 */
export function normalizeGraphBbox(bbox: GraphBbox): GraphBbox {
  let [xmin, ymax, xmax, ymin] = bbox;
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin];

  const xSpan = Math.max(xmax - xmin, MIN_GRAPH_BBOX_SPAN);
  const ySpan = Math.max(ymax - ymin, MIN_GRAPH_BBOX_SPAN);
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;

  return [
    cx - xSpan / 2,
    cy + ySpan / 2,
    cx + xSpan / 2,
    cy - ySpan / 2,
  ];
}

/**
 * Recompute bounding box when the embed container resizes so pixels-per-unit
 * stays constant (square units). Expands/contracts around the current center.
 */
export function recomputeBboxForResize(args: {
  bbox: GraphBbox;
  prevWidthPx: number;
  prevHeightPx: number;
  nextWidthPx: number;
  nextHeightPx: number;
}): GraphBbox {
  const prevW = clampGraphContainerPx(args.prevWidthPx);
  const prevH = clampGraphContainerPx(args.prevHeightPx);
  const nextW = clampGraphContainerPx(args.nextWidthPx);
  const nextH = clampGraphContainerPx(args.nextHeightPx);

  const [xmin, ymax, xmax, ymin] = normalizeGraphBbox(args.bbox);
  const xRange = xmax - xmin;
  const yRange = ymax - ymin;

  const pxPerUnitX = prevW / xRange;
  const pxPerUnitY = prevH / yRange;
  const pxPerUnit = (pxPerUnitX + pxPerUnitY) / 2;

  const newXRange = nextW / pxPerUnit;
  const newYRange = nextH / pxPerUnit;
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;

  return normalizeGraphBbox([
    cx - newXRange / 2,
    cy + newYRange / 2,
    cx + newXRange / 2,
    cy - newYRange / 2,
  ]);
}

/**
 * Insert implicit multiplication for tutor-style expressions (e.g. `5x` → `5*x`).
 * Known function names are protected from `*` insertion before `(`.
 */
export function preprocessGraphExpression(expr: string): string {
  const trimmed = expr.trim();
  if (!trimmed) return trimmed;

  const fnPlaceholders: string[] = [];
  let s = trimmed.replace(IMPLICIT_MULT_FN_RE, (match) => {
    const key = `@@FN${fnPlaceholders.length}@@`;
    fnPlaceholders.push(match);
    return key;
  });

  s = s.replace(/(\d)\s*([a-zA-Z])/g, "$1*$2");
  s = s.replace(/(\d)\s*\(/g, "$1*(");
  s = s.replace(/(\))\s*([a-zA-Z\d(])/g, "$1*$2");
  s = s.replace(/([a-zA-Z])\s*\(/g, "$1*(");

  fnPlaceholders.forEach((fn, index) => {
    s = s.replace(`@@FN${index}@@`, fn);
  });

  return s;
}

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

/** Clone graph state with a normalized expression list. */
export function cloneGraphState(state: GraphState): GraphState {
  return {
    bbox: state.bbox ? ([...state.bbox] as GraphBbox) : DEFAULT_GRAPH_BBOX,
    expressions: [...(state.expressions ?? [])],
  };
}

export function addGraphExpression(state: GraphState, expression: string): GraphState {
  const next = cloneGraphState(state);
  const trimmed = expression.trim();
  if (!trimmed) return next;
  next.expressions = [...(next.expressions ?? []), trimmed];
  return next;
}

export function updateGraphExpression(
  state: GraphState,
  index: number,
  expression: string
): GraphState {
  const next = cloneGraphState(state);
  const expressions = [...(next.expressions ?? [])];
  if (index < 0 || index >= expressions.length) return next;
  expressions[index] = expression;
  next.expressions = expressions;
  return next;
}

export function removeGraphExpression(state: GraphState, index: number): GraphState {
  const next = cloneGraphState(state);
  const expressions = [...(next.expressions ?? [])];
  if (index < 0 || index >= expressions.length) return next;
  expressions.splice(index, 1);
  next.expressions = expressions;
  return next;
}

export function withGraphBbox(state: GraphState, bbox: GraphBbox): GraphState {
  return { ...cloneGraphState(state), bbox };
}
