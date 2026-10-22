import { readFileSync } from "fs";
import { join } from "path";
import {
  addGraphExpression,
  clampGraphContainerPx,
  DEFAULT_GRAPH_BBOX,
  extractGraphStateFromElement,
  fitGraphBboxToSquareUnits,
  normalizeGraphBbox,
  parseGraphStateJson,
  GRAPH_FUNCTION_TOKENS,
  GraphExpressionError,
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
      // A stray `)` is unbalanced input, not something to pass through (2026-10-22).
      expect(() => preprocessGraphExpression("2)(x+1)")).toThrow(GraphExpressionError);
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
      // A function name with no argument, or a word that is not a known name, throws
      // (2026-10-22). It used to pass through and plot nothing or the wrong curve.
      expect(() => preprocessGraphExpression("log10")).toThrow(GraphExpressionError);
      expect(() => preprocessGraphExpression("sinxy")).toThrow(GraphExpressionError);
      // Desmos: the exponent binds inside the call. sinx^2 is sin(x^2), not sin(x)^2.
      expect(preprocessGraphExpression("sinx^2")).toBe("sin(x^2)");
    });

    // JessieCode's bundle reads `window` on import, and `snippet()` evaluates
    // through a board. This file runs in node, so the curve-vs-Math check is
    // the Playwright test "plotted log and trig expressions match Math at a sampled x".
    it("follows Desmos for a function applied to the next term", () => {
      const cases: Array<[string, string]> = [
        ["sin 2x", "sin(2*x)"],
        ["sin x^2", "sin(x^2)"],
        ["3 sin 2x", "3*sin(2*x)"],
        ["ln 2x", "ln(2*x)"],
        ["sin x + 1", "sin(x)+1"],
        ["tan x/2", "tan(x)/2"],
        ["sin x cos x", "sin(x)*cos(x)"],
        ["x sin x", "x*sin(x)"],
        ["log10 x", "log10(x)"],
        ["log2 x", "log2(x)"],
        ["pi x", "PI*x"],
        ["2pi x", "2*PI*x"],
        ["x pi", "x*PI"],
        ["sinx", "sin(x)"],
        ["sinx^2", "sin(x^2)"],
        ["sin^2(x)", "sin(x)^2"],
        ["sin^2 x", "sin(x)^2"],
        ["e^x", "EULER^x"],
        ["e", "EULER"],
        ["Sin(X)", "sin(x)"],
        ["X", "x"],
        ["sinh(x)", "sinh(x)"],
        ["cosh(x)", "cosh(x)"],
        ["tanh(x)", "tanh(x)"],
        ["asinh(x)", "asinh(x)"],
        ["acosh(x)", "acosh(x)"],
        ["atanh(x)", "atanh(x)"],
        ["cot(x)", "cot(x)"],
        ["acot(x)", "acot(x)"],
        ["cbrt(x)", "cbrt(x)"],
        ["x^2", "x^2"],
        ["5x", "5*x"],
        ["2(x+1)", "2*(x+1)"],
        ["(x+1)(x-1)", "(x+1)*(x-1)"],
        ["sin(x)^2", "sin(x)^2"],
        ["cos(x)sin(x)", "cos(x)*sin(x)"],
        ["2sinx cosx", "2*sin(x)*cos(x)"],
        ["log(x,2)", "log(x,2)"],
        ["exp(x)", "exp(x)"],
        ["abs(x)", "abs(x)"],
        ["x/2", "x/2"],
        ["1/x", "1/x"],
        ["-sin(x)", "-sin(x)"],
        ["sin(-x)", "sin(-x)"],
        ["ln(x)/ln(2)", "ln(x)/ln(2)"],
        ["sin(x)+cos(x)", "sin(x)+cos(x)"],
        ["log(x)+ln(x)", "log(x)+ln(x)"],
        ["tan(2x)", "tan(2*x)"],
        ["sqrt(x)", "sqrt(x)"],
        ["2sin(x)", "2*sin(x)"],
        ["log10(x)", "log10(x)"],
        ["asin(x)", "asin(x)"],
        ["acos(x)", "acos(x)"],
        ["atan(x)", "atan(x)"],
      ];
      for (const [input, output] of cases) {
        expect(preprocessGraphExpression(input)).toBe(output);
      }
    });

    it("rejects an expression it cannot rewrite without guessing", () => {
      expect(() => preprocessGraphExpression("x".repeat(201))).toThrow(/too long/i);
      expect(() => preprocessGraphExpression("sec(x)")).toThrow();
      expect(() => preprocessGraphExpression("csc(x)")).toThrow();
      expect(() => preprocessGraphExpression("sin xy")).toThrow();
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

  describe("preprocessGraphExpression hardening (review blockers, 2026-10-22)", () => {
    const fail = (input: string) => () => preprocessGraphExpression(input);

    // Independent oracle for blocker 1: sin^(E) x is sin(x)^(E) by Desmos.
    function nestedExponentInput(levels: number): { input: string; expected: string } {
      let input = "x";
      let expected = "x";
      for (let n = 0; n < levels; n += 1) {
        input = `sin^(${input}) x`;
        expected = `sin(x)^(${expected})`;
      }
      return { input, expected };
    }

    function timed<T>(fn: () => T): { ms: number; result?: T; error?: unknown } {
      const t0 = performance.now();
      try {
        const result = fn();
        return { ms: performance.now() - t0, result };
      } catch (error) {
        return { ms: performance.now() - t0, error };
      }
    }

    describe("1. no exponential-time parse", () => {
      it("parses sin^(sin^(...)) nesting once, within the 200 character cap", () => {
        const { input, expected } = nestedExponentInput(24);
        expect(input.length).toBeLessThanOrEqual(200);
        const run = timed(() => preprocessGraphExpression(input));
        expect(run.ms).toBeLessThan(50);
        if (run.error) expect(run.error).toBeInstanceOf(GraphExpressionError);
        else expect(run.result).toBe(expected);
      });

      it("fails fast on the argument-less sin^(sin^(...x...)) nest that made the old parser re-parse", () => {
        // Review repro: 24 levels / 145 chars took 2.6s because the exponent was parsed,
        // rewound, and parsed again at every level.
        const input = `${"sin^(".repeat(24)}x${")".repeat(24)}`;
        expect(input.length).toBeLessThanOrEqual(200);
        const run = timed(() => preprocessGraphExpression(input));
        expect(run.ms).toBeLessThan(50);
        expect(run.error).toBeInstanceOf(GraphExpressionError);
      });

      it("keeps a shallow exponent nest correct", () => {
        const { input, expected } = nestedExponentInput(3);
        expect(preprocessGraphExpression(input)).toBe(expected);
        expect(preprocessGraphExpression("sin^(x) x")).toBe("sin(x)^(x)");
      });

      it("rejects parens nested deeper than 32 quickly", () => {
        const input = `${"(".repeat(90)}x${")".repeat(90)}`;
        const run = timed(() => preprocessGraphExpression(input));
        expect(run.ms).toBeLessThan(50);
        expect(run.error).toBeInstanceOf(GraphExpressionError);
        expect((run.error as Error).message).toMatch(/nested/i);
      });

      it("rejects calls, bare function chains and unary minus nested deeper than 32", () => {
        const calls = `${"sin(".repeat(36)}x${")".repeat(36)}`;
        const chain = `${"sin ".repeat(45)}x`;
        const minus = `${"-".repeat(60)}x`;
        for (const input of [calls, chain, minus]) {
          expect(input.length).toBeLessThanOrEqual(200);
          const run = timed(() => preprocessGraphExpression(input));
          expect(run.ms).toBeLessThan(50);
          expect(run.error).toBeInstanceOf(GraphExpressionError);
          expect((run.error as Error).message).toMatch(/nested/i);
        }
      });

      it("accepts ordinary nesting well under the cap", () => {
        expect(preprocessGraphExpression("((((((((((x))))))))))")).toBe("((((((((((x))))))))))");
        expect(preprocessGraphExpression("sin(cos(tan(sin(cos(x)))))")).toBe(
          "sin(cos(tan(sin(cos(x)))))"
        );
      });
    });

    describe("2. unknown words and glued names never pass through", () => {
      const mustThrow = [
        "atan2x",
        "atan2 x",
        "sin2pix",
        "sin2πx",
        "sinpix",
        "sec x",
        "sec(x)",
        "csc x",
        "arcsin x",
        "arcsin(x)",
        "log_2 x",
        "sinxy",
        "sin xy",
        "x2",
        "pi2",
        "foo",
        "y",
        "eval(x)",
        "use(x)",
        "import(x)",
        "xsin x",
        "e2",
        "1.2.3",
        "x.5",
        "sin2.5x",
      ];
      it.each(mustThrow)("throws on %s", (input) => {
        expect(fail(input)).toThrow(GraphExpressionError);
      });

      it("keeps a recognized name glued to its operand", () => {
        const cases: Array<[string, string]> = [
          ["sin2", "sin(2)"],
          ["sin2x", "sin(2*x)"],
          ["sinpi", "sin(PI)"],
          ["sinx", "sin(x)"],
          ["log10x", "log10(x)"],
          ["log2x", "log2(x)"],
          ["atan2(x,1)", "atan2(x,1)"],
          ["atan2(x, 1)", "atan2(x,1)"],
          ["2atan2(x,1)", "2*atan2(x,1)"],
          ["Atan2(X,1)", "atan2(x,1)"],
        ];
        for (const [input, output] of cases) {
          expect(preprocessGraphExpression(input)).toBe(output);
        }
      });

      it("never turns atan2(x,1) into atan(2*(x,1))", () => {
        expect(preprocessGraphExpression("atan2(x,1)")).not.toContain("atan(");
      });
    });

    describe("3. names stored boards could call before the rewriter existed", () => {
      const cases: Array<[string, string]> = [
        ["floor(x)", "floor(x)"],
        ["ceil(x)", "ceil(x)"],
        ["round(x)", "round(x)"],
        ["sign(x)", "sign(x)"],
        ["min(x,2)", "min(x,2)"],
        ["max(x, 2)", "max(x,2)"],
        ["max(x,2,3)", "max(x,2,3)"],
        ["pow(x,2)", "pow(x,2)"],
        ["hypot(x,1)", "hypot(x,1)"],
        ["atan2(x,1)", "atan2(x,1)"],
        ["expm1(x)", "expm1(x)"],
        ["log1p(x)", "log1p(x)"],
        ["factorial(x)", "factorial(x)"],
        ["lg(x)", "lg(x)"],
        ["lb(x)", "lb(x)"],
        ["ld(x)", "ld(x)"],
        ["nthroot(x,3)", "nthroot(x,3)"],
        ["erf(x)", "erf(x)"],
        ["floor x", "floor(x)"],
        ["2floor(x)", "2*floor(x)"],
        ["x floor(x)", "x*floor(x)"],
        ["floor(x)+ceil(x)", "floor(x)+ceil(x)"],
      ];
      it.each(cases)("rewrites %s", (input, output) => {
        expect(preprocessGraphExpression(input)).toBe(output);
      });

      it("rejects wrong argument counts instead of plotting NaN", () => {
        for (const input of ["pow(x)", "pow(x,2,3)", "atan2(x)", "sin(x,1)", "floor(x,2)", "min()"]) {
          expect(fail(input)).toThrow(GraphExpressionError);
        }
      });

      it("rejects gcd, lcm, ratpow, trunc, and binomial like any unknown name", () => {
        for (const input of [
          "gcd(x,2)",
          "gcd(x,4)",
          "lcm(x,4)",
          "ratpow(x,1,2)",
          "trunc(x)",
          "binomial(5,x)",
        ]) {
          expect(fail(input)).toThrow(GraphExpressionError);
        }
      });

      it("only allowlists names JessieCode can actually call", () => {
        // Independent oracle: read the names straight from the installed jsxgraph source.
        const src = readFileSync(
          join(process.cwd(), "node_modules/jsxgraph/src/parser/jessiecode.js"),
          "utf8"
        );
        const region = src.slice(
          src.indexOf("defineBuiltIn: function"),
          src.indexOf("// special scopes for factorial")
        );
        const builtIns = new Set(
          [...region.matchAll(/^\s+['"]?([\w$]+)['"]?:\s/gm)].map((m) => m[1])
        );
        expect(builtIns.has("factorial")).toBe(true);
        const mathBag = Math as unknown as Record<string, unknown>;
        for (const name of GRAPH_FUNCTION_TOKENS) {
          const viaMath = typeof mathBag[name] === "function";
          expect({ name, callable: viaMath || builtIns.has(name) }).toEqual({
            name,
            callable: true,
          });
        }
        // Names that let a board run arbitrary JessieCode or touch the board are never allowed.
        for (const name of ["eval", "use", "import", "remove", "$", "$board", "$log", "random", "randint"]) {
          expect(GRAPH_FUNCTION_TOKENS).not.toContain(name);
        }
        // JessieCode has no sec/csc anywhere.
        expect(GRAPH_FUNCTION_TOKENS).not.toContain("sec");
        expect(GRAPH_FUNCTION_TOKENS).not.toContain("csc");
        // Defined in JessieCode, excluded because they hang or plot the wrong curve.
        for (const name of ["binomial", "gcd", "lcm", "ratpow", "trunc"]) {
          expect(GRAPH_FUNCTION_TOKENS).not.toContain(name);
        }
      });
    });

    describe("non-blocking cleanups", () => {
      it.each(["sin", "sin^2", "sin()", "sin^(2)", "sin^-1 x", "sin^-1(x)", "cos^-1 x", "log10", "x+sin", "sin+x", "sin)"])(
        "throws on a function with no usable argument: %s",
        (input) => {
          expect(fail(input)).toThrow(GraphExpressionError);
        }
      );

      it("says why sin^-1 is not supported, and does not guess arcsin", () => {
        expect(fail("sin^-1 x")).toThrow(/inverse|asin/i);
        expect(() => preprocessGraphExpression("sin^-1 x")).toThrow();
        let out: string | null = null;
        try {
          out = preprocessGraphExpression("sin^-1 x");
        } catch {
          out = null;
        }
        expect(out).toBeNull();
      });

      it("normalizes leading and trailing dot numbers", () => {
        const cases: Array<[string, string]> = [
          [".5x", "0.5*x"],
          [".5", "0.5"],
          ["x+.5", "x+0.5"],
          ["2*.25", "2*0.25"],
          ["5.", "5"],
          ["5.x", "5*x"],
          ["5.+x", "5+x"],
          ["x^.5", "x^0.5"],
          ["1.5x", "1.5*x"],
        ];
        for (const [input, output] of cases) {
          expect(preprocessGraphExpression(input)).toBe(output);
        }
        expect(fail(".")).toThrow(GraphExpressionError);
        expect(fail("..5")).toThrow(GraphExpressionError);
      });

      it("rejects top level commas and unbalanced parens", () => {
        for (const input of ["x,1", "(x,1)", "2(x,1)", ",x", "x,", "(x,)", "(,x)", "x)", ")x", "(x", "((x)", "(x))", "2)(x+1)", "()", "sin(x))"]) {
          expect(fail(input)).toThrow(GraphExpressionError);
        }
      });

      it("accepts π as pi", () => {
        const cases: Array<[string, string]> = [
          ["π", "PI"],
          ["2π", "2*PI"],
          ["2πx", "2*PI*x"],
          ["2 π x", "2*PI*x"],
          ["sin(πx)", "sin(PI*x)"],
          ["sin π", "sin(PI)"],
          ["sinπ", "sin(PI)"],
          ["x π", "x*PI"],
          ["xπ", "x*PI"],
        ];
        for (const [input, output] of cases) {
          expect(preprocessGraphExpression(input)).toBe(output);
        }
      });
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
