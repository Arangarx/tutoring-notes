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
 * How a name may be called. `min`/`max` are the argument counts JessieCode
 * accepts without returning NaN. `bare` means Desmos-style `sin x` (no parens)
 * is allowed — only single-argument names (and `log`) qualify, because
 * `atan2 x` or `max x` would silently drop an argument.
 */
export type GraphFunctionSpec = { min: number; max: number; bare: boolean };

const UNARY: GraphFunctionSpec = { min: 1, max: 1, bare: true };
const CALL_2: GraphFunctionSpec = { min: 2, max: 2, bare: false };
const CALL_VARIADIC: GraphFunctionSpec = { min: 1, max: Infinity, bare: false };

/**
 * The only names the rewriter lets through to JessieCode. Every name is
 * callable in jsxgraph 1.12 `src/parser/jessiecode.js`, which resolves a
 * function name two ways (`getvar` with `isFunctionName`):
 *
 * 1. `defineBuiltIn()` — `acosh acot asinh cbrt cosh cot erf erfc
 *    erfi factorial lb ld lg ln log log10 log2 ndtr ndtri nthroot
 *    pow sinh`. These win over `Math`, so `pow` is
 *    `JXG.Math.pow(base, exp)` and `log` is `JXG.Math.log(x, base?)`.
 *    `gcd` is excluded: loops forever on 0, Infinity, or NaN (`gcd(x,2)` freezes the tab at the x=0 sample).
 *    `lcm` is excluded: same infinite loop on 0, Infinity, or NaN.
 *    `ratpow` is excluded: it calls `gcd`, so it hangs the same way.
 *    `trunc` is excluded: JessieCode's `JXG.trunc` rounds (`trunc(2.5)` is 3), a silent wrong curve.
 *    `binomial` is excluded: huge literals take about 2s per sample.
 * 2. `isMathMethod()` — any truthy `Math[name]` except `E`. Allowlisted here:
 *    `abs acos asin atan atan2 atanh ceil clz32 cos exp expm1 floor fround
 *    hypot imul log1p max min round sign sin sqrt tan tanh`.
 *
 * Left out on purpose: `sec`/`csc` (JessieCode has neither), `random` and
 * `randint` (a different curve every frame), geometry builtins (`deg`, `rad`,
 * `dist`, `area`, ...) which need board objects, and `eval` / `use` / `import`
 * / `remove` / `$` / `$board`, which let a stored board run arbitrary
 * JessieCode. Arbitrary `Math.*` constants (`SQRT2`, `LN2`, ...) were callable
 * as bare names before the rewriter existed; they are not supported now.
 */
export const GRAPH_FUNCTION_SPECS: Readonly<Record<string, GraphFunctionSpec>> = {
  // builtIn, single argument
  acosh: UNARY,
  acot: UNARY,
  asinh: UNARY,
  cbrt: UNARY,
  cosh: UNARY,
  cot: UNARY,
  erf: UNARY,
  erfc: UNARY,
  erfi: UNARY,
  factorial: UNARY,
  lb: UNARY,
  ld: UNARY,
  lg: UNARY,
  ln: UNARY,
  log10: UNARY,
  log2: UNARY,
  ndtr: UNARY,
  ndtri: UNARY,
  sinh: UNARY,
  // builtIn, optional second argument
  log: { min: 1, max: 2, bare: true },
  // builtIn, several arguments
  nthroot: CALL_2,
  pow: CALL_2,
  // Math.*, single argument
  abs: UNARY,
  acos: UNARY,
  asin: UNARY,
  atan: UNARY,
  atanh: UNARY,
  ceil: UNARY,
  clz32: UNARY,
  cos: UNARY,
  exp: UNARY,
  expm1: UNARY,
  floor: UNARY,
  fround: UNARY,
  log1p: UNARY,
  round: UNARY,
  sign: UNARY,
  sin: UNARY,
  sqrt: UNARY,
  tan: UNARY,
  tanh: UNARY,
  // Math.*, several arguments
  atan2: CALL_2,
  hypot: CALL_VARIADIC,
  imul: CALL_2,
  max: CALL_VARIADIC,
  min: CALL_VARIADIC,
};

/** Longest first so `log10` wins over `log` and `asinh` wins over `asin`. */
export const GRAPH_FUNCTION_TOKENS: readonly string[] = Object.keys(GRAPH_FUNCTION_SPECS).sort(
  (a, b) => b.length - a.length || a.localeCompare(b)
);

/** Deeper than any tutor writes by hand. Bounds recursion and work. */
export const GRAPH_EXPRESSION_MAX_DEPTH = 32;

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
 * strings, so there is no multi-pass restore, and the parser never rewinds,
 * so work is linear in the input.
 *
 * Anything that is not `x`, `pi` / `π`, `e`, a number, or an allowlisted
 * function name throws. Nothing is passed through to JessieCode as a bare
 * identifier, because JessieCode would read it as an undefined variable and
 * plot the wrong curve (or nothing) without an error.
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
  | { k: "op"; v: "+" | "-" | "*" | "/" | "^" | "," }
  | { k: "lp" }
  | { k: "rp" };

type Ctx = { toks: Tok[]; i: number; depth: number };

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

/** Run a recursive parse step one level deeper, or throw past the depth cap. */
function nested<T>(ctx: Ctx, step: () => T): T {
  ctx.depth += 1;
  if (ctx.depth > GRAPH_EXPRESSION_MAX_DEPTH) {
    throw new GraphExpressionError("Expression is nested too deeply.");
  }
  const result = step();
  ctx.depth -= 1;
  return result;
}

const WORD_START = /[A-Za-z_π]/;
const WORD_CHAR = /[A-Za-z0-9_π]/;

/** `.5` is `0.5` and `5.` is `5`, so JessieCode only ever sees plain decimals. */
function normalizeNumber(raw: string): string {
  let out = raw;
  if (out.startsWith(".")) out = `0${out}`;
  if (out.endsWith(".")) out = out.slice(0, -1);
  return out;
}

/** A word made only of `x`, `pi` and `π` (`x`, `pix`, `2πx` → `πx`). Not `e`. */
function atomTokens(lower: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < lower.length) {
    if (lower.startsWith("pi", i)) {
      out.push({ k: "pi" });
      i += 2;
    } else if (lower[i] === "π") {
      out.push({ k: "pi" });
      i += 1;
    } else if (lower[i] === "x") {
      out.push({ k: "var" });
      i += 1;
    } else {
      return null;
    }
  }
  return out;
}

/** What may follow a function name inside the same word: `x`, `pi`, `2`, `2x`, `2pi`. */
const GLUED_OPERAND = /^(\d+)?(x|pi|π)?$/i;

/**
 * Split one run of letters/digits into tokens. The longest allowlisted name
 * wins (`log10x` → `log10`, `x`), and only a small operand may be glued after
 * it. Anything else (`sinpix`, `sin2pix`, `sec`, `arcsin`, `log_2`, `x2`) throws.
 */
function tokenizeWord(word: string): Tok[] {
  const lower = word.toLowerCase();
  if (lower === "e") return [{ k: "e" }];
  const atoms = atomTokens(lower);
  if (atoms) return atoms;
  const name = GRAPH_FUNCTION_TOKENS.find((candidate) => lower.startsWith(candidate));
  if (!name) throw new GraphExpressionError(`Unknown name "${word}".`);
  const toks: Tok[] = [{ k: "fn", name }];
  const rest = lower.slice(name.length);
  if (!rest) return toks;
  const glued = GLUED_OPERAND.exec(rest);
  if (!glued) throw new GraphExpressionError(`Can't read "${word}". Put a space or parentheses after ${name}.`);
  if (glued[1]) toks.push({ k: "num", v: glued[1] });
  if (glued[2]) toks.push(glued[2] === "x" ? { k: "var" } : { k: "pi" });
  return toks;
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
      const match = /^(?:\d+\.?\d*|\.\d+)/.exec(input.slice(i));
      if (!match) throw new GraphExpressionError();
      i += match[0].length;
      // `1.2.3` is not `1.2*0.3`.
      if (input[i] === ".") throw new GraphExpressionError();
      // `2e3` / `2e-3` is scientific notation, not `2*EULER`. Don't guess.
      if (i < input.length && /e/i.test(input[i] ?? "")) {
        const after = input[i + 1];
        const signThenDigit =
          (after === "+" || after === "-") && /[0-9]/.test(input[i + 2] ?? "");
        if ((after !== undefined && /[0-9]/.test(after)) || signThenDigit) {
          throw new GraphExpressionError();
        }
      }
      tokens.push({ k: "num", v: normalizeNumber(match[0]) });
      continue;
    }
    if (WORD_START.test(ch)) {
      let j = i;
      while (j < input.length && WORD_CHAR.test(input[j] ?? "")) j += 1;
      // `x.5` and `sin2.5x` would split into two numbers and multiply them.
      if (input[j] === ".") throw new GraphExpressionError();
      tokens.push(...tokenizeWord(input.slice(i, j)));
      i = j;
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

function startsFactor(tok: Tok | undefined): boolean {
  if (!tok) return false;
  return (
    tok.k === "num" ||
    tok.k === "var" ||
    tok.k === "pi" ||
    tok.k === "e" ||
    tok.k === "fn" ||
    tok.k === "lp" ||
    isOp(tok, "-")
  );
}

function isAtom(tok: Tok | undefined): boolean {
  return tok?.k === "num" || tok?.k === "var" || tok?.k === "pi" || tok?.k === "e";
}

function renderAtom(tok: Tok): string {
  if (tok.k === "num") return tok.v;
  if (tok.k === "var") return "x";
  if (tok.k === "pi") return "PI";
  if (tok.k === "e") return "EULER";
  throw new GraphExpressionError();
}

/** The whole input must be one expression. A leftover `)` or `,` is malformed. */
function parseTop(tokens: Tok[]): string {
  const ctx: Ctx = { toks: tokens, i: 0, depth: 0 };
  const out = parseExpr(ctx);
  if (ctx.i < ctx.toks.length) throw new GraphExpressionError();
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
    if (next && next.k !== "op" && next.k !== "rp" && startsFactor(next)) {
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
    return `-${nested(ctx, () => parseFactor(ctx))}`;
  }
  return parsePrimary(ctx);
}

function parsePrimary(ctx: Ctx): string {
  const next = peek(ctx);
  if (next?.k === "fn") return applyPowers(ctx, parseFunction(ctx));
  if (next?.k === "lp") return applyPowers(ctx, parseArgs(ctx, 1, 1, "Parentheses"));
  if (isAtom(next)) return parseAtomProduct(ctx);
  throw new GraphExpressionError();
}

/** One implicit product of atoms. `5x^2` is `5*x^2`, and `/` is not included. */
function parseAtomProduct(ctx: Ctx): string {
  let out = applyPowers(ctx, renderAtom(eat(ctx)));
  while (true) {
    const next = peek(ctx);
    if (next?.k === "lp") {
      out += "*" + applyPowers(ctx, parseArgs(ctx, 1, 1, "Parentheses"));
      continue;
    }
    if (isAtom(next)) {
      out += "*" + applyPowers(ctx, renderAtom(eat(ctx)));
      continue;
    }
    break;
  }
  return out;
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
    return `-${nested(ctx, () => parseTightPower(ctx))}`;
  }
  const next = peek(ctx);
  if (next?.k === "lp") return applyPowers(ctx, parseArgs(ctx, 1, 1, "Parentheses"));
  if (next?.k === "fn") return applyPowers(ctx, parseFunction(ctx));
  if (isAtom(next)) return applyPowers(ctx, renderAtom(eat(ctx)));
  throw new GraphExpressionError();
}

/**
 * Desmos: `sin^2(x)` and `sin^2 x` are `sin(x)^2`. The exponent sits on the
 * name; the argument is still the following factor (`sin 2x` → `sin(2*x)`,
 * `sin x^2` → `sin(x^2)`, `tan x/2` → `tan(x)/2`).
 *
 * One forward pass: the exponent is parsed once and kept. A name with no
 * argument (`sin`, `sin^2`, `sin()`) throws, it is never guessed.
 */
function parseFunction(ctx: Ctx): string {
  const tok = eat(ctx);
  if (tok.k !== "fn") throw new GraphExpressionError();
  const spec = GRAPH_FUNCTION_SPECS[tok.name];
  if (!spec) throw new GraphExpressionError();
  let exponent: string | null = null;
  if (isOp(peek(ctx), "^")) {
    if (!spec.bare) {
      throw new GraphExpressionError(`${tok.name} needs parentheses, like ${tok.name}(x, 2).`);
    }
    eat(ctx);
    if (isOp(peek(ctx), "-")) {
      throw new GraphExpressionError(
        `${tok.name}^-1 isn't supported. Write asin(x), acos(x) or atan(x) for an inverse, or 1/${tok.name}(x).`
      );
    }
    exponent = parseTightExponent(ctx);
  }
  const next = peek(ctx);
  let call: string;
  if (next?.k === "lp") {
    call = tok.name + parseArgs(ctx, spec.min, spec.max, tok.name);
  } else if (!spec.bare) {
    throw new GraphExpressionError(`${tok.name} needs parentheses, like ${tok.name}(x, 2).`);
  } else if (startsFactor(next)) {
    call = `${tok.name}(${nested(ctx, () => parseFactor(ctx))})`;
  } else {
    throw new GraphExpressionError(`${tok.name} needs an argument.`);
  }
  return exponent ? `${call}^${exponent}` : call;
}

function parseTightExponent(ctx: Ctx): string {
  const next = peek(ctx);
  if (next?.k === "lp") return parseArgs(ctx, 1, 1, "Parentheses");
  if (isAtom(next)) return renderAtom(eat(ctx));
  throw new GraphExpressionError();
}

/**
 * `( expr [, expr]* )`. Commas are only valid here, inside a call's own
 * parentheses, and the count must match what JessieCode accepts for that name.
 */
function parseArgs(ctx: Ctx, min: number, max: number, owner: string): string {
  return nested(ctx, () => {
    if (eat(ctx).k !== "lp") throw new GraphExpressionError();
    const args: string[] = [parseExpr(ctx)];
    while (isOp(peek(ctx), ",")) {
      eat(ctx);
      args.push(parseExpr(ctx));
    }
    if (peek(ctx)?.k !== "rp") throw new GraphExpressionError();
    eat(ctx);
    if (args.length < min || args.length > max) {
      throw new GraphExpressionError(`${owner} got ${args.length} arguments.`);
    }
    return `(${args.join(",")})`;
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
