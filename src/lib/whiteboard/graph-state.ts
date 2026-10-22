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

/** Tutors paste long text by accident. Longer than this is rejected, not plotted. */
export const GRAPH_EXPRESSION_MAX_LENGTH = 200;

/**
 * Names JessieCode can call (built-in or `Math.*`). Longest first so `log10`
 * wins over `log` and `asinh` wins over `asin`. `sec` / `csc` are omitted —
 * JessieCode has neither a built-in nor a `Math` method for them.
 * Checked against jsxgraph `src/parser/jessiecode.js` `defineBuiltIn` and
 * `isMathMethod` (`Math.*` except `E`).
 */
export const GRAPH_FUNCTION_TOKENS = [
  "log10",
  "asinh",
  "acosh",
  "atanh",
  "log2",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "sqrt",
  "cbrt",
  "acot",
  "abs",
  "exp",
  "sin",
  "cos",
  "tan",
  "cot",
  "log",
  "ln",
] as const;

const GRAPH_FUNCTIONS_LONGEST_FIRST = [...GRAPH_FUNCTION_TOKENS].sort(
  (a, b) => b.length - a.length || a.localeCompare(b)
);

export class GraphExpressionError extends Error {
  constructor(message = "Couldn't understand this expression.") {
    super(message);
    this.name = "GraphExpressionError";
  }
}

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
 * Rewrite tutor-style expressions into JessieCode.
 * Function application runs before implicit `*`, so `sin 2x` stays one call
 * (`sin(2*x)`) instead of `sin(2)*x`. Calls are tokens, not placeholder
 * strings, so there is no multi-pass restore.
 * Render-time only — the stored expression is the tutor's text.
 */
export function preprocessGraphExpression(expr: string): string {
  const trimmed = expr.trim();
  if (!trimmed) return trimmed;
  if (trimmed.length > GRAPH_EXPRESSION_MAX_LENGTH) {
    throw new GraphExpressionError("Expression is too long.");
  }
  return parseTop(tokenize(trimmed));
}

type Tok =
  | { k: "num"; v: string }
  | { k: "var" }
  | { k: "pi" }
  | { k: "e" }
  | { k: "fn"; name: string }
  | { k: "ident"; v: string }
  | { k: "op"; v: "+" | "-" | "*" | "/" | "^" | "," }
  | { k: "lp" }
  | { k: "rp" };

type Ctx = { toks: Tok[]; i: number };

function peek(ctx: Ctx): Tok | undefined {
  return ctx.toks[ctx.i];
}

function eat(ctx: Ctx): Tok {
  const tok = ctx.toks[ctx.i];
  if (!tok) throw new GraphExpressionError();
  ctx.i += 1;
  return tok;
}

function isOp(tok: Tok | undefined, op: string): boolean {
  return tok?.k === "op" && tok.v === op;
}

/** `x`, `pi`, a number, or a number glued to `x` / `pi`. Not bare `e` (`sine` is a word). */
function isGluedOperand(rest: string): boolean {
  return /^(?:x|pi|\d+(?:\.\d+)?(?:x|pi)?)$/i.test(rest);
}

function scanIdentEnd(input: string, at: number): number {
  let j = at;
  while (j < input.length && /[A-Za-z0-9_]/.test(input[j] ?? "")) j += 1;
  return j;
}

function classifyIdent(raw: string): Tok {
  const lower = raw.toLowerCase();
  if (lower === "x") return { k: "var" };
  if (lower === "pi") return { k: "pi" };
  if (lower === "e") return { k: "e" };
  return { k: "ident", v: raw };
}

function readName(input: string, at: number): { tok: Tok; next: number } {
  const rest = input.slice(at);
  for (const name of GRAPH_FUNCTIONS_LONGEST_FIRST) {
    if (!rest.toLowerCase().startsWith(name)) continue;
    const after = at + name.length;
    const continues = after < input.length && /[A-Za-z0-9_]/.test(input[after] ?? "");
    if (!continues) return { tok: { k: "fn", name }, next: after };
    const identEnd = scanIdentEnd(input, after);
    if (isGluedOperand(input.slice(after, identEnd))) {
      return { tok: { k: "fn", name }, next: after };
    }
    const wholeEnd = scanIdentEnd(input, at);
    return { tok: classifyIdent(input.slice(at, wholeEnd)), next: wholeEnd };
  }
  const wholeEnd = scanIdentEnd(input, at);
  return { tok: classifyIdent(input.slice(at, wholeEnd)), next: wholeEnd };
}

function tokenize(input: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i] ?? "";
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const match = /^(?:\d+\.\d+|\d+)/.exec(input.slice(i));
      if (!match) throw new GraphExpressionError();
      i += match[0].length;
      // `2e3` / `2e-3` is scientific notation, not `2*EULER`. Don't guess.
      if (i < input.length && /e/i.test(input[i] ?? "")) {
        const after = input[i + 1];
        const signThenDigit =
          (after === "+" || after === "-") && /[0-9]/.test(input[i + 2] ?? "");
        if ((after !== undefined && /[0-9]/.test(after)) || signThenDigit) {
          throw new GraphExpressionError();
        }
      }
      tokens.push({ k: "num", v: match[0] });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const read = readName(input, i);
      tokens.push(read.tok);
      i = read.next;
      continue;
    }
    if (ch === "(") {
      tokens.push({ k: "lp" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ k: "rp" });
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === ",") {
      tokens.push({ k: "op", v: ch });
      i += 1;
      continue;
    }
    throw new GraphExpressionError();
  }
  return tokens;
}

function needsStar(left: string, right: string): boolean {
  if (!left || !right) return false;
  const end = left[left.length - 1] ?? "";
  const start = right[0] ?? "";
  return /[0-9A-Za-z_)]/.test(end) && /[0-9A-Za-z_(]/.test(start);
}

function startsFactor(tok: Tok | undefined): boolean {
  if (!tok) return false;
  return (
    tok.k === "num" ||
    tok.k === "var" ||
    tok.k === "pi" ||
    tok.k === "e" ||
    tok.k === "fn" ||
    tok.k === "ident" ||
    tok.k === "lp" ||
    isOp(tok, "-")
  );
}

function canStartCallArgument(tok: Tok | undefined): boolean {
  return startsFactor(tok);
}

function renderAtom(tok: Tok): string {
  if (tok.k === "num") return tok.v;
  if (tok.k === "var") return "x";
  if (tok.k === "pi") return "PI";
  if (tok.k === "e") return "EULER";
  if (tok.k === "ident") return tok.v;
  throw new GraphExpressionError();
}

function parseTop(tokens: Tok[]): string {
  const ctx: Ctx = { toks: tokens, i: 0 };
  let out = "";
  while (ctx.i < ctx.toks.length) {
    if (peek(ctx)?.k === "rp") {
      eat(ctx);
      out += ")";
      continue;
    }
    if (isOp(peek(ctx), ",")) {
      eat(ctx);
      out += ",";
      continue;
    }
    const before = ctx.i;
    const expr = parseExpr(ctx);
    if (ctx.i === before) throw new GraphExpressionError();
    out += (needsStar(out, expr) ? "*" : "") + expr;
  }
  return out;
}

function parseExpr(ctx: Ctx): string {
  let out = parseTerm(ctx);
  while (isOp(peek(ctx), "+") || isOp(peek(ctx), "-")) {
    const op = eat(ctx);
    if (op.k !== "op") throw new GraphExpressionError();
    out += op.v + parseTerm(ctx);
  }
  return out;
}

function parseTerm(ctx: Ctx): string {
  let out = parseFactor(ctx);
  while (true) {
    const next = peek(ctx);
    if (isOp(next, "*") || isOp(next, "/")) {
      const op = eat(ctx);
      if (op.k !== "op") throw new GraphExpressionError();
      out += op.v + parseFactor(ctx);
      continue;
    }
    // `-` here is subtraction (`x-2`), not another factor.
    if (
      next &&
      next.k !== "op" &&
      next.k !== "rp" &&
      startsFactor(next)
    ) {
      out += "*" + parseFactor(ctx);
      continue;
    }
    break;
  }
  return out;
}

function parseFactor(ctx: Ctx): string {
  if (isOp(peek(ctx), "-")) {
    eat(ctx);
    return `-${parseFactor(ctx)}`;
  }
  return parsePrimary(ctx);
}

function parsePrimary(ctx: Ctx): string {
  const next = peek(ctx);
  if (next?.k === "fn") return applyPowers(ctx, parseFunction(ctx));
  if (next?.k === "lp") return applyPowers(ctx, parseParen(ctx));
  if (
    next?.k === "num" ||
    next?.k === "var" ||
    next?.k === "pi" ||
    next?.k === "e" ||
    next?.k === "ident"
  ) {
    return parseAtomProduct(ctx);
  }
  throw new GraphExpressionError();
}

/** One implicit product of atoms. `5x^2` is `5*x^2`, and `/` is not included. */
function parseAtomProduct(ctx: Ctx): string {
  let out = parseOneAtom(ctx);
  while (true) {
    const next = peek(ctx);
    if (next?.k === "lp") {
      out += "*" + applyPowers(ctx, parseParen(ctx));
      continue;
    }
    if (
      next?.k === "num" ||
      next?.k === "var" ||
      next?.k === "pi" ||
      next?.k === "e" ||
      next?.k === "ident"
    ) {
      out += "*" + parseOneAtom(ctx);
      continue;
    }
    break;
  }
  return out;
}

function parseOneAtom(ctx: Ctx): string {
  const tok = eat(ctx);
  if (tok.k === "ident" && peek(ctx)?.k === "lp") {
    // `sec(x)` is not a JessieCode call. `sec*(x)` would plot the wrong curve.
    throw new GraphExpressionError();
  }
  return applyPowers(ctx, renderAtom(tok));
}

function applyPowers(ctx: Ctx, base: string): string {
  let out = base;
  while (isOp(peek(ctx), "^")) {
    eat(ctx);
    out += `^${parseTightPower(ctx)}`;
  }
  return out;
}

function parseTightPower(ctx: Ctx): string {
  if (isOp(peek(ctx), "-")) {
    eat(ctx);
    return `-${parseTightPower(ctx)}`;
  }
  const next = peek(ctx);
  if (next?.k === "lp") return applyPowers(ctx, parseParen(ctx));
  if (next?.k === "fn") return applyPowers(ctx, parseFunction(ctx));
  if (
    next?.k === "num" ||
    next?.k === "var" ||
    next?.k === "pi" ||
    next?.k === "e" ||
    next?.k === "ident"
  ) {
    return applyPowers(ctx, renderAtom(eat(ctx)));
  }
  throw new GraphExpressionError();
}

/**
 * Desmos: `sin^2(x)` and `sin^2 x` are `sin(x)^2`. The exponent sits on the
 * name; the argument is still the following factor (`sin 2x` → `sin(2*x)`,
 * `sin x^2` → `sin(x^2)`, `tan x/2` → `tan(x)/2`).
 */
function parseFunction(ctx: Ctx): string {
  const tok = eat(ctx);
  if (tok.k !== "fn") throw new GraphExpressionError();
  let preExp: string | null = null;
  if (isOp(peek(ctx), "^")) {
    const saved = ctx.i;
    eat(ctx);
    const expTok = peek(ctx);
    const expOk =
      expTok?.k === "num" ||
      expTok?.k === "var" ||
      expTok?.k === "pi" ||
      expTok?.k === "e" ||
      expTok?.k === "lp";
    if (!expOk) {
      ctx.i = saved;
    } else {
      const exp = parseTightExponent(ctx);
      if (canStartCallArgument(peek(ctx))) preExp = exp;
      else ctx.i = saved;
    }
  }
  let call: string;
  const next = peek(ctx);
  if (next?.k === "lp") {
    call = tok.name + parseParen(ctx);
  } else if (next?.k === "ident") {
    throw new GraphExpressionError();
  } else if (canStartCallArgument(next)) {
    call = `${tok.name}(${parseFactor(ctx)})`;
  } else {
    call = tok.name;
  }
  return preExp ? `${call}^${preExp}` : call;
}

function parseTightExponent(ctx: Ctx): string {
  const next = peek(ctx);
  if (next?.k === "lp") return parseParen(ctx);
  if (
    next?.k === "num" ||
    next?.k === "var" ||
    next?.k === "pi" ||
    next?.k === "e"
  ) {
    return renderAtom(eat(ctx));
  }
  throw new GraphExpressionError();
}

function parseParen(ctx: Ctx): string {
  if (eat(ctx).k !== "lp") throw new GraphExpressionError();
  if (peek(ctx)?.k === "rp") {
    eat(ctx);
    return "()";
  }
  let inner = "";
  while (peek(ctx) && peek(ctx)?.k !== "rp") {
    if (isOp(peek(ctx), ",")) {
      if (!inner || inner.endsWith(",")) throw new GraphExpressionError();
      inner += ",";
      eat(ctx);
      continue;
    }
    const before = ctx.i;
    const expr = parseExpr(ctx);
    if (ctx.i === before) throw new GraphExpressionError();
    inner += (needsStar(inner, expr) ? "*" : "") + expr;
  }
  if (peek(ctx)?.k !== "rp") throw new GraphExpressionError();
  eat(ctx);
  return `(${inner})`;
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
