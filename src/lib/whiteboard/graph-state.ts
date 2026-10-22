/**
 * Minimal persisted state for self-hosted JSXGraph embeddables.
 * Serialized into Excalidraw `customData.graphStateJson`.
 */

/** JSXGraph boundingbox: [xmin, ymax, xmax, ymin] */
export type GraphBbox = [number, number, number, number];

/** A fixed point in graph user coordinates (not screen pixels). */
export type GraphPoint = {
  id: string;
  x: number;
  y: number;
};

/** A freehand stroke in graph user coordinates. `pts` is sampled, not every pointer move. */
export type GraphStroke = {
  id: string;
  pts: [number, number][];
};

export type GraphState = {
  bbox?: GraphBbox;
  expressions?: string[];
  /** Missing on old boards. Decode fills `[]`. */
  points?: GraphPoint[];
  /** Missing on old boards. Decode fills `[]`. */
  strokes?: GraphStroke[];
};

/** About 30 Hz. Pointer-move samples closer than this are dropped; pointer-up still persists once. */
export const GRAPH_INK_SAMPLE_MS = 1000 / 30;

export type GraphStrokeDraft = {
  id: string;
  pts: [number, number][];
  lastAtMs: number;
};

export type GraphInkPointerEvent =
  | { type: "down"; id: string; pt: [number, number]; nowMs: number }
  | { type: "move"; pt: [number, number]; nowMs: number }
  | { type: "up"; pt: [number, number]; nowMs: number };

export const DEFAULT_GRAPH_BBOX: GraphBbox = [-10, 10, 10, -10];

/** Minimum container edge (px) — avoids zero/inverted bbox during resize flips. */
export const MIN_GRAPH_CONTAINER_PX = 8;

/** Minimum axis span in math units — keeps bbox non-degenerate. */
export const MIN_GRAPH_BBOX_SPAN = 1e-6;

/**
 * Names JessieCode can call. Longest first: `log10` must win over `log`,
 * and `(?<![A-Za-z_])` is required because `\b` is false between a digit and a letter (`2sin`).
 */
export const GRAPH_FUNCTION_TOKENS = [
  "log10",
  "log2",
  "sqrt",
  "asin",
  "acos",
  "atan",
  "abs",
  "exp",
  "sin",
  "cos",
  "tan",
  "ln",
  "log",
] as const;

const GRAPH_FN_SRC = GRAPH_FUNCTION_TOKENS.join("|");

const FN_CALL_RE = new RegExp(`(?<![A-Za-z_])(?:${GRAPH_FN_SRC})\\s*\\(`, "gi");

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
 * Derive a single pixels-per-math-unit scale from a bbox and container size.
 * Uses the x-axis as the reference so the horizontal extent is preserved.
 */
export function graphPxPerUnit(bbox: GraphBbox, widthPx: number): number {
  const w = clampGraphContainerPx(widthPx);
  const [xmin, , xmax] = normalizeGraphBbox(bbox);
  const xRange = Math.max(xmax - xmin, MIN_GRAPH_BBOX_SPAN);
  return w / xRange;
}

/**
 * Fit a bbox to a container so px-per-unit is identical on both axes (square grid).
 * Preserves the horizontal math extent; adjusts vertical range around the center.
 */
export function fitGraphBboxToSquareUnits(
  bbox: GraphBbox,
  widthPx: number,
  heightPx: number
): GraphBbox {
  const w = clampGraphContainerPx(widthPx);
  const h = clampGraphContainerPx(heightPx);
  const [xmin, ymax, xmax, ymin] = normalizeGraphBbox(bbox);
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;

  const pxPerUnit = graphPxPerUnit(bbox, w);
  const newXRange = w / pxPerUnit;
  const newYRange = h / pxPerUnit;

  return normalizeGraphBbox([
    cx - newXRange / 2,
    cy + newYRange / 2,
    cx + newXRange / 2,
    cy - newYRange / 2,
  ]);
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
  const nextW = clampGraphContainerPx(args.nextWidthPx);
  const nextH = clampGraphContainerPx(args.nextHeightPx);

  const pxPerUnit = graphPxPerUnit(args.bbox, prevW);
  const [xmin, ymax, xmax, ymin] = normalizeGraphBbox(args.bbox);
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;

  const newXRange = nextW / pxPerUnit;
  const newYRange = nextH / pxPerUnit;

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

  // Before `5x` → `5*x`, so the `0` in `log10x` is not treated as a coefficient.
  let s = splitGluedFunctionOperands(trimmed);

  const fnPlaceholders: string[] = [];
  s = s.replace(FN_CALL_RE, (match) => {
    const key = `@@FN${fnPlaceholders.length}@@`;
    fnPlaceholders.push(match.replace(/\s+(?=\()/, ""));
    return key;
  });

  s = s.replace(/(\d)\s*([a-zA-Z])/g, "$1*$2");
  s = s.replace(/(\d)\s*\(/g, "$1*(");
  s = s.replace(/(\))\s*([a-zA-Z\d(])/g, "$1*$2");
  s = s.replace(/([a-zA-Z])\s*\(/g, "$1*(");

  fnPlaceholders.forEach((fn, index) => {
    s = s.replace(`@@FN${index}@@`, fn);
  });

  s = insertStarBeforeFunction(s);
  s = rewriteJuxtaposedCalls(s);
  // JessieCode's constant is `PI`, not `pi` or `Math.PI`.
  s = s.replace(/(?<![A-Za-z_])pi(?![A-Za-z_\d])/gi, "PI");
  return s;
}

function insertStarBeforeFunction(input: string): string {
  const re = new RegExp(`(\\d|\\))\\s*(?<![A-Za-z_])(${GRAPH_FN_SRC})`, "gi");
  return input.replace(re, "$1*$2");
}

function readBalancedParen(input: string, open: number): number {
  let depth = 0;
  for (let i = open; i < input.length; i++) {
    if (input[i] === "(") depth += 1;
    else if (input[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function readSimpleOperand(
  input: string,
  at: number
): { text: string; end: number } | null {
  if (at >= input.length) return null;
  const rest = input.slice(at);
  if (/^x(?![A-Za-z_\d])/.test(rest)) return { text: "x", end: at + 1 };
  if (/^pi(?![A-Za-z_\d])/i.test(rest)) {
    return { text: rest.slice(0, 2), end: at + 2 };
  }
  const num = /^\d+(?:\.\d+)?/.exec(rest);
  if (num && !/[A-Za-z_\d]/.test(input[at + num[0].length] ?? "")) {
    return { text: num[0], end: at + num[0].length };
  }
  if (input[at] === "(") {
    const close = readBalancedParen(input, at);
    if (close > at) return { text: input.slice(at, close + 1), end: close + 1 };
  }
  return null;
}

/** `sin x` → `sin(x)`, `sin (x+1)` → `sin(x+1)`. Already-parenthesized calls are left alone. */
function rewriteJuxtaposedCalls(input: string): string {
  const nameRe = new RegExp(`(?<![A-Za-z_])(?:${GRAPH_FN_SRC})`, "gi");
  let out = "";
  let i = 0;
  while (i < input.length) {
    nameRe.lastIndex = i;
    const found = nameRe.exec(input);
    if (!found || found.index < i) {
      out += input.slice(i);
      break;
    }
    const start = found.index;
    const fn = found[0];
    out += input.slice(i, start);
    const after = start + fn.length;
    if (after >= input.length || input[after] === "(" || !/\s/.test(input[after] ?? "")) {
      out += fn;
      i = after;
      continue;
    }
    let j = after;
    while (j < input.length && /\s/.test(input[j] ?? "")) j += 1;
    const operand = readSimpleOperand(input, j);
    if (!operand) {
      out += fn;
      i = after;
      continue;
    }
    const wrapped = operand.text.startsWith("(") ? operand.text : `(${operand.text})`;
    out += fn + wrapped;
    i = operand.end;
  }
  return out;
}

/** `sinx` → `sin(x)`. A longer name (`log10`) is not split into `log(10)`. */
function splitGluedFunctionOperands(input: string): string {
  const re = new RegExp(
    `(?<![A-Za-z_])(${GRAPH_FN_SRC})(x|\\d+(?:\\.\\d+)?)(?![A-Za-z_\\d])`,
    "gi"
  );
  return input.replace(re, (match, fn: string, operand: string, offset: number, whole: string) => {
    const slice = whole.slice(offset).toLowerCase();
    const splitsLongerName = GRAPH_FUNCTION_TOKENS.some(
      (name) => name.length > fn.length && slice.startsWith(name)
    );
    if (splitsLongerName) return match;
    return `${fn}(${operand})`;
  });
}

export function serializeGraphStateJson(state: GraphState): string {
  return JSON.stringify(state);
}

/**
 * Parse `graphStateJson` from an embeddable element's customData.
 * Returns a safe default on missing or malformed input.
 */
function emptyGraphState(): GraphState {
  return {
    bbox: DEFAULT_GRAPH_BBOX,
    expressions: [],
    points: [],
    strokes: [],
  };
}

/** Ink payload caps. An older client that edits an expression drops points and strokes past these. */
export const GRAPH_INK_MAX_POINTS = 500;
export const GRAPH_INK_MAX_STROKES = 200;
export const GRAPH_INK_MAX_POINTS_PER_STROKE = 2000;

function parseGraphPoints(raw: unknown): GraphPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: GraphPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || rec.id.length === 0) continue;
    if (typeof rec.x !== "number" || !Number.isFinite(rec.x)) continue;
    if (typeof rec.y !== "number" || !Number.isFinite(rec.y)) continue;
    points.push({ id: rec.id, x: rec.x, y: rec.y });
    if (points.length >= GRAPH_INK_MAX_POINTS) break;
  }
  return points;
}

function parseGraphStrokes(raw: unknown): GraphStroke[] {
  if (!Array.isArray(raw)) return [];
  const strokes: GraphStroke[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || rec.id.length === 0) continue;
    if (!Array.isArray(rec.pts)) continue;
    const pts: [number, number][] = [];
    for (const pair of rec.pts) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const x = pair[0];
      const y = pair[1];
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      pts.push([x, y]);
      if (pts.length >= GRAPH_INK_MAX_POINTS_PER_STROKE) break;
    }
    if (pts.length === 0) continue;
    strokes.push({ id: rec.id, pts });
    if (strokes.length >= GRAPH_INK_MAX_STROKES) break;
  }
  return strokes;
}

export function parseGraphStateJson(raw: unknown): GraphState {
  if (raw == null || raw === "") {
    return emptyGraphState();
  }

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return emptyGraphState();
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return emptyGraphState();
  }

  const obj = parsed as Record<string, unknown>;
  // Fresh object — unknown keys (and extras on a point or stroke) are not copied.
  // An older build of this same parser ignored `points` and `strokes` the same way.
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

  state.points = parseGraphPoints(obj.points);
  state.strokes = parseGraphStrokes(obj.strokes);

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

/** Clone graph state with a normalized expression list and ink. */
export function cloneGraphState(state: GraphState): GraphState {
  return {
    bbox: state.bbox ? ([...state.bbox] as GraphBbox) : DEFAULT_GRAPH_BBOX,
    expressions: [...(state.expressions ?? [])],
    points: (state.points ?? []).map((point) => ({ id: point.id, x: point.x, y: point.y })),
    strokes: (state.strokes ?? []).map((stroke) => ({
      id: stroke.id,
      pts: stroke.pts.map((pt) => [pt[0], pt[1]] as [number, number]),
    })),
  };
}

/**
 * Draw-mode pointer reducer. Moves closer than {@link GRAPH_INK_SAMPLE_MS}
 * do not add a sample and never persist. Pointer-up appends the stroke and
 * reports a single persist.
 */
export function reduceGraphInkGesture(
  state: GraphState,
  draft: GraphStrokeDraft | null,
  event: GraphInkPointerEvent
): { state: GraphState; draft: GraphStrokeDraft | null; persist: boolean } {
  if (event.type === "down") {
    return {
      state,
      draft: { id: event.id, pts: [event.pt], lastAtMs: event.nowMs },
      persist: false,
    };
  }
  if (!draft) {
    return { state, draft: null, persist: false };
  }
  if (event.type === "move") {
    if (event.nowMs - draft.lastAtMs < GRAPH_INK_SAMPLE_MS) {
      return { state, draft, persist: false };
    }
    return {
      state,
      draft: {
        id: draft.id,
        pts: [...draft.pts, event.pt],
        lastAtMs: event.nowMs,
      },
      persist: false,
    };
  }
  const last = draft.pts[draft.pts.length - 1];
  const sameAsLast =
    last != null && last[0] === event.pt[0] && last[1] === event.pt[1];
  const pts = sameAsLast ? draft.pts : [...draft.pts, event.pt];
  if (pts.length === 0) {
    return { state, draft: null, persist: false };
  }
  const next = cloneGraphState(state);
  next.strokes = [...(next.strokes ?? []), { id: draft.id, pts }];
  return { state: next, draft: null, persist: true };
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
