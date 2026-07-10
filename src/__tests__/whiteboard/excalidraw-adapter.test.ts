/**
 * Round-trip + diff invariants for the Excalidraw <-> canonical
 * adapter. These tests are the safety net under the recorder hook +
 * replay player: if the adapter loses information or generates
 * spurious diff events, the recorded session won't replay correctly.
 *
 * What we deliberately verify:
 *   - canonicalizeScene drops library-internal fields (seed, version,
 *     versionNonce, groupIds, isDeleted) that would otherwise leak
 *     into our on-disk JSON.
 *   - toCanonical -> toExcalidraw -> toCanonical is a fixed point for
 *     all supported element types (freedraw, line, rect, ellipse,
 *     diamond, arrow, text, image, desmos).
 *   - diffScenes correctly returns add / update / remove events when
 *     the scene changes, AND returns NO events when the scene is
 *     identical (this is the load-bearing property for plan blocker
 *     #3 — diff log size <500 KB over a 30-min session).
 *   - Custom-typed elements (math equation, desmos) round-trip
 *     through Excalidraw's image/iframe slot via customData.
 *   - isDeleted=true elements are dropped on canonicalization.
 *
 * Tests are jsdom-free (pure data shape transformations). They run
 * under the default node test environment.
 */

import {
  canonicalizeScene,
  diffElement,
  diffScenes,
  sanitizeRestoredExcalidrawElementsForReplay,
  snapshotEvent,
  toCanonical,
  toExcalidraw,
  type ExcalidrawLikeElement,
} from "@/lib/whiteboard/excalidraw-adapter";
import type { WBElement } from "@/lib/whiteboard/event-log";

function freedraw(over: Partial<ExcalidrawLikeElement> = {}): ExcalidrawLikeElement {
  return {
    id: "fd1",
    type: "freedraw",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    strokeWidth: 1,
    opacity: 100,
    angle: 0,
    points: [
      [0, 0],
      [10, 5],
      [25, 10],
    ],
    isDeleted: false,
    version: 7,
    versionNonce: 12345,
    ...over,
  };
}

function rect(over: Partial<ExcalidrawLikeElement> = {}): ExcalidrawLikeElement {
  return {
    id: "r1",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    strokeColor: "#000",
    backgroundColor: "#ffe4e1",
    strokeWidth: 2,
    opacity: 100,
    angle: 0,
    isDeleted: false,
    version: 1,
    versionNonce: 0,
    ...over,
  };
}

describe("excalidraw-adapter -- toCanonical", () => {
  test("freedraw maps to freehand and drops library-internal fields", () => {
    const wb = toCanonical(freedraw());
    expect(wb).toMatchObject({
      id: "fd1",
      type: "freehand",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      strokeColor: "#1e1e1e",
      strokeWidth: 1,
    });
    // background/opacity/angle defaults are dropped to keep diffs small
    expect(wb).not.toHaveProperty("backgroundColor");
    expect(wb).not.toHaveProperty("opacity");
    expect(wb).not.toHaveProperty("angle");
    // version + versionNonce are library-internal; never persisted
    expect(wb).not.toHaveProperty("version");
    expect(wb).not.toHaveProperty("versionNonce");
  });

  test("isDeleted=true returns null", () => {
    expect(toCanonical(freedraw({ isDeleted: true }))).toBeNull();
  });

  test("frame / magicframe / selection elements are dropped", () => {
    expect(toCanonical(rect({ type: "frame" }))).toBeNull();
    expect(toCanonical(rect({ type: "magicframe" }))).toBeNull();
    expect(toCanonical(rect({ type: "selection" }))).toBeNull();
  });

  // ── Degenerate line/arrow filter (phantom-stroke fix) ──────────────────────
  // A single click with the line tool + right-click finalize produces a
  // degenerate element: 1 point (or N identical points), zero bounding box.
  // These must be dropped before they reach the canonical layer.

  test("degenerate line (1 point, zero bbox) is dropped", () => {
    const el = freedraw({
      id: "degen-line-1pt",
      type: "line",
      width: 0,
      height: 0,
      points: [[0, 0]],
    });
    expect(toCanonical(el)).toBeNull();
  });

  test("degenerate line (2 identical points, zero bbox) is dropped", () => {
    const el = freedraw({
      id: "degen-line-2pt-same",
      type: "line",
      width: 0,
      height: 0,
      points: [[0, 0], [0, 0]],
    });
    expect(toCanonical(el)).toBeNull();
  });

  test("degenerate arrow (1 point, zero bbox) is dropped", () => {
    const el = freedraw({
      id: "degen-arrow-1pt",
      type: "arrow",
      width: 0,
      height: 0,
      points: [[0, 0]],
    });
    expect(toCanonical(el)).toBeNull();
  });

  test("degenerate arrow (2 identical points, zero bbox) is dropped", () => {
    const el = freedraw({
      id: "degen-arrow-2pt-same",
      type: "arrow",
      width: 0,
      height: 0,
      points: [[5, 5], [5, 5]],
    });
    expect(toCanonical(el)).toBeNull();
  });

  // ── Over-drop guard: legitimate elements MUST be kept ─────────────────────

  test("legitimate line (2 distinct points, real bbox) is KEPT", () => {
    const el = freedraw({
      id: "real-line",
      type: "line",
      width: 10,
      height: 10,
      points: [[0, 0], [10, 10]],
    });
    const wb = toCanonical(el);
    expect(wb).not.toBeNull();
    expect(wb!.type).toBe("line");
  });

  test("legitimate arrow (2 distinct points, real bbox) is KEPT", () => {
    const el = freedraw({
      id: "real-arrow",
      type: "arrow",
      width: 20,
      height: 0,
      points: [[0, 0], [20, 0]],
    });
    const wb = toCanonical(el);
    expect(wb).not.toBeNull();
    expect(wb!.type).toBe("arrow");
  });

  test("line with 2 distinct points but tiny bbox (near-zero) is KEPT — conservative guard", () => {
    // |width|=0.5 < 1 AND |height|=0.5 < 1, but points ARE distinct → KEPT
    const el = freedraw({
      id: "near-zero-bbox-line",
      type: "line",
      width: 0.5,
      height: 0.5,
      points: [[0, 0], [0.5, 0.5]],
    });
    expect(toCanonical(el)).not.toBeNull();
  });

  test("line with zero bbox but 1pt + hasBbox via width>=1 is KEPT", () => {
    // width ≥ 1 alone is enough to keep it
    const el = freedraw({
      id: "wide-zero-height-line",
      type: "line",
      width: 5,
      height: 0,
      points: [[0, 0]],
    });
    expect(toCanonical(el)).not.toBeNull();
  });

  test("freedraw single-point dot (type=freedraw, zero bbox) is KEPT — must NOT be dropped", () => {
    // freedraw dots are legitimate (stroke radius gives them visual extent);
    // the degenerate filter must NOT touch freedraw/freehand.
    const el = freedraw({
      id: "freedraw-dot",
      type: "freedraw",
      width: 0,
      height: 0,
      points: [[0, 0]],
    });
    expect(toCanonical(el)).not.toBeNull();
    expect(toCanonical(el)!.type).toBe("freehand");
  });

  test("unknown future element types are dropped without throwing", () => {
    expect(toCanonical(rect({ type: "future-shape" }))).toBeNull();
  });

  test("rounds positional floats to 2dp", () => {
    const el = freedraw({
      x: 10.123456,
      y: 20.999,
      width: 100.5001,
      height: 50.49999,
      angle: 1.234567,
      points: [
        [0.111111, 0.222222],
        [10.5555, 5.4444],
      ],
    });
    const wb = toCanonical(el)!;
    expect(wb.x).toBe(10.12);
    expect(wb.y).toBe(21);
    expect(wb.width).toBe(100.5);
    expect(wb.height).toBe(50.5);
    expect(wb.angle).toBe(1.23);
    expect(wb.points).toEqual([
      [0.11, 0.22],
      [10.56, 5.44],
    ]);
  });

  test("text element preserves text + fontSize + fontFamily", () => {
    const el = rect({
      id: "t1",
      type: "text",
      text: "hello",
      fontSize: 24,
      fontFamily: 1,
      backgroundColor: "transparent",
    });
    const wb = toCanonical(el)!;
    expect(wb.type).toBe("text");
    expect(wb.text).toBe("hello");
    expect(wb.fontSize).toBe(24);
    expect(wb.fontFamily).toBe(1);
  });

  test("image element preserves customData.assetUrl", () => {
    const el = rect({
      id: "img1",
      type: "image",
      fileId: "fid_abc",
      customData: { assetUrl: "https://blob/x.png", altText: "diagram" },
    });
    const wb = toCanonical(el)!;
    expect(wb.type).toBe("image");
    expect(wb.assetUrl).toBe("https://blob/x.png");
    expect(wb.altText).toBe("diagram");
  });

  test("math equation maps via customData.wbType=text + latex", () => {
    const el = rect({
      id: "eq1",
      type: "image",
      customData: {
        wbType: "text",
        latex: "x^2 + 1",
        assetUrl: "https://blob/eq.svg",
      },
    });
    const wb = toCanonical(el)!;
    expect(wb.type).toBe("text");
    expect(wb.latex).toBe("x^2 + 1");
    expect(wb.assetUrl).toBe("https://blob/eq.svg");
  });

  test("graph embeddable maps to type=graph with graphStateJson", () => {
    const el = rect({
      id: "g1",
      type: "embeddable",
      link: "mynk://graph",
      customData: {
        wbType: "graph",
        graphStateJson: '{"expressions":["x^2"],"bbox":[-10,10,10,-10]}',
        assetUrl: "mynk://graph",
      },
    });
    const wb = toCanonical(el)!;
    expect(wb.type).toBe("graph");
    expect(wb.graphStateJson).toContain("x^2");
    expect(wb.assetUrl).toBe("mynk://graph");
  });

  test("legacy desmos iframe maps without throwing", () => {
    const el = rect({
      id: "ds1",
      type: "embeddable",
      link: "https://www.desmos.com/calculator/abc123",
      customData: {
        wbType: "embed",
        assetUrl: "https://www.desmos.com/calculator/abc123",
        embed: { provider: "desmos" },
        desmosStateJson: '{"version":11}',
      },
    });
    const wb = toCanonical(el)!;
    expect(wb.type).toBe("desmos");
    expect(wb.desmosStateJson).toBe('{"version":11}');
    expect(wb.assetUrl).toBe("https://www.desmos.com/calculator/abc123");
  });
});

describe("excalidraw-adapter -- toExcalidraw round-trip", () => {
  test("freehand survives toExcalidraw -> toCanonical", () => {
    const original = toCanonical(freedraw())!;
    const ex = toExcalidraw(original);
    expect(ex.type).toBe("freedraw");
    const back = toCanonical(ex);
    expect(back).toEqual(original);
  });

  test("rectangle with backgroundColor round-trips", () => {
    const original = toCanonical(rect())!;
    const ex = toExcalidraw(original);
    const back = toCanonical(ex);
    expect(back).toEqual(original);
  });

  test("graph round-trips through embeddable slot", () => {
    const wb: WBElement = {
      id: "g1",
      type: "graph",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      assetUrl: "mynk://graph",
      graphStateJson: '{"expressions":["sin(x)"]}',
    };
    const ex = toExcalidraw(wb);
    expect(ex.type).toBe("embeddable");
    expect(ex.link).toBe("mynk://graph");
    const back = toCanonical(ex);
    expect(back).toEqual(wb);
  });

  test("legacy desmos round-trips through iframe slot", () => {
    const wb: WBElement = {
      id: "ds1",
      type: "desmos",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      assetUrl: "https://www.desmos.com/calculator/abc",
      desmosStateJson: '{"v":11}',
    };
    const ex = toExcalidraw(wb);
    expect(ex.type).toBe("iframe");
    const back = toCanonical({
      ...ex,
      link: wb.assetUrl,
      customData: {
        ...ex.customData,
        assetUrl: wb.assetUrl,
      },
    });
    expect(back).toEqual(wb);
  });

  test("math-equation latex round-trips", () => {
    const wb: WBElement = {
      id: "eq1",
      type: "text",
      x: 0,
      y: 0,
      width: 200,
      height: 60,
      latex: "\\frac{1}{2}",
      assetUrl: "https://blob/eq.svg",
    };
    const ex = toExcalidraw(wb);
    expect(ex.customData?.latex).toBe("\\frac{1}{2}");
    expect(ex.customData?.assetUrl).toBe("https://blob/eq.svg");
    const back = toCanonical(ex);
    expect(back).toEqual(wb);
  });

  test("image elements get synthetic fileId + status for BinaryFiles / hydrate", () => {
    const wb: WBElement = {
      id: "img1",
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      assetUrl: "https://blob/x.png",
    };
    const ex = toExcalidraw(wb);
    expect(ex.type).toBe("image");
    expect(ex.fileId).toBe("wba-img1");
    expect(ex.status).toBe("saved");
    const back = toCanonical(ex);
    expect(back).toEqual(wb);
  });
});

describe("excalidraw-adapter -- toExcalidraw linear point repair", () => {
  test("freehand missing points gets bbox diagonal fallback", () => {
    const wb: WBElement = {
      id: "broken",
      type: "freehand",
      x: 100,
      y: 200,
      width: 154,
      height: 288,
      strokeColor: "#000",
    };
    const ex = toExcalidraw(wb);
    expect(ex.points).toEqual([
      [0, 0],
      [154, 288],
    ]);
    expect(ex.type).toBe("freedraw");
  });

  test("freehand zero-sized bbox falls back to unit segment", () => {
    const wb: WBElement = {
      id: "z",
      type: "freehand",
      x: 494.5,
      y: 486.22,
      width: 0,
      height: 0,
    };
    const ex = toExcalidraw(wb);
    expect(ex.points).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  test("single valid point repeats with bbox-based second point", () => {
    const wb: WBElement = {
      id: "onept",
      type: "freehand",
      x: 0,
      y: 0,
      width: 10,
      height: 0,
      points: [[5, 5]],
    };
    const ex = toExcalidraw(wb);
    expect(ex.points).toEqual([
      [5, 5],
      [15, 5],
    ]);
  });

  test("malformed tuples are stripped then bbox fallback applies", () => {
    const wb: WBElement = {
      id: "bad",
      type: "freehand",
      x: 0,
      y: 0,
      width: 3,
      height: 4,
      points: [[Number.NaN, Number.NaN]],
    };
    const ex = toExcalidraw(wb);
    expect(ex.points).toEqual([
      [0, 0],
      [3, 4],
    ]);
  });

  test("line type without persisted points receives fallback", () => {
    const line: WBElement = {
      id: "ln",
      type: "line",
      x: 0,
      y: 0,
      width: 2,
      height: 0,
      strokeWidth: 1,
    };
    expect(toExcalidraw(line).points).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });
});

describe("sanitizeRestoredExcalidrawElementsForReplay", () => {
  test("injects diagonal points onto freedraw missing points after imaginary restore output", () => {
    const out = sanitizeRestoredExcalidrawElementsForReplay([
      {
        id: "a",
        type: "freedraw",
        x: 337,
        y: 307.22,
        width: 159,
        height: 85,
        strokeWidth: 1,
      },
    ]);
    expect((out[0] as { points: unknown }).points).toEqual([
      [0, 0],
      [159, 85],
    ]);
  });

  test("drops invalid elbow-arrow metadata so geometry falls back to `points`", () => {
    const out = sanitizeRestoredExcalidrawElementsForReplay([
      {
        id: "elbow-oops",
        type: "arrow",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        elbowed: true,
        fixedSegments: [],
        points: [
          [0, 0],
          [10, 10],
        ],
      },
    ]);
    expect((out[0] as { elbowed?: boolean }).elbowed).toBe(false);
    expect((out[0] as { fixedSegments?: unknown }).fixedSegments).toBeUndefined();
  });

  test("fixes freedraw pressure array length mismatched to repaired points", () => {
    const out = sanitizeRestoredExcalidrawElementsForReplay([
      {
        id: "press",
        type: "freedraw",
        x: 0,
        y: 0,
        width: 2,
        height: 3,
        points: [[0, 0]],
        pressures: [],
      },
    ]);
    expect((out[0] as { pressures: unknown[] }).pressures?.length).toBe(2);
    expect((out[0] as { simulatePressure: boolean }).simulatePressure).toBe(true);
    expect((out[0] as { lastCommittedPoint: unknown }).lastCommittedPoint).toEqual(
      [2, 0]
    );
  });

  test("leaves rectangles untouched", () => {
    const rect = {
      id: "r",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    };
    expect(sanitizeRestoredExcalidrawElementsForReplay([rect])).toEqual([
      rect,
    ]);
  });
});

describe("excalidraw-adapter -- diffElement", () => {
  test("identical references return undefined", () => {
    const wb = toCanonical(freedraw())!;
    expect(diffElement(wb, wb)).toBeUndefined();
  });

  test("unchanged but distinct objects return undefined", () => {
    const a = toCanonical(freedraw())!;
    const b = toCanonical(freedraw())!;
    expect(diffElement(a, b)).toBeUndefined();
  });

  test("position change yields a small patch", () => {
    const a = toCanonical(freedraw())!;
    const b = toCanonical(freedraw({ x: 50 }))!;
    const patch = diffElement(a, b);
    expect(patch).toEqual({ x: 50 });
  });

  test("appending a stroke point yields a points patch", () => {
    const a = toCanonical(freedraw())!;
    const longer: ExcalidrawLikeElement = freedraw({
      points: [
        [0, 0],
        [10, 5],
        [25, 10],
        [40, 20],
      ],
    });
    const b = toCanonical(longer)!;
    const patch = diffElement(a, b);
    expect(patch).toBeDefined();
    expect(patch!.points).toEqual([
      [0, 0],
      [10, 5],
      [25, 10],
      [40, 20],
    ]);
  });

  test("multiple changes yield a multi-key patch", () => {
    const a = toCanonical(rect())!;
    const b = toCanonical(rect({ x: 5, width: 250, strokeColor: "red" }))!;
    const patch = diffElement(a, b);
    expect(patch).toEqual({ x: 5, width: 250, strokeColor: "red" });
  });
});

describe("excalidraw-adapter -- diffScenes", () => {
  test("empty -> empty produces zero events", () => {
    expect(diffScenes([], [], 0)).toEqual([]);
  });

  test("one new element produces an add event", () => {
    const next = canonicalizeScene([freedraw()]);
    const events = diffScenes([], next, 1234);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ t: 1234, type: "add", element: next[0] });
  });

  test("removed element produces a remove event", () => {
    const prev = canonicalizeScene([freedraw()]);
    const events = diffScenes(prev, [], 999);
    expect(events).toEqual([{ t: 999, type: "remove", elementId: "fd1" }]);
  });

  test("identical frames produce zero events (size budget invariant)", () => {
    const prev = canonicalizeScene([freedraw(), rect()]);
    // Re-canonicalize fresh; objects are distinct but values identical.
    const next = canonicalizeScene([freedraw(), rect()]);
    const events = diffScenes(prev, next, 50);
    expect(events).toEqual([]);
  });

  test("mixed add/update/remove in one frame", () => {
    const prev = canonicalizeScene([freedraw(), rect()]);
    const next = canonicalizeScene([
      freedraw({ x: 99 }), // updated
      rect({ id: "r2" }), // r1 removed, r2 added
    ]);
    const events = diffScenes(prev, next, 100);
    // Sorted as: updates of surviving elements first (order from `next`),
    // adds in next-order, then removes from prev-order.
    expect(events).toEqual([
      { t: 100, type: "update", elementId: "fd1", patch: { x: 99 } },
      { t: 100, type: "add", element: next[1] },
      { t: 100, type: "remove", elementId: "r1" },
    ]);
  });

  test("snapshotEvent captures the full scene", () => {
    const scene = canonicalizeScene([freedraw(), rect()]);
    const ev = snapshotEvent(scene, 7);
    expect(ev).toEqual({ t: 7, type: "snapshot", elements: scene });
    // Verifying defensive copy of the array: mutating the source after
    // capture should not affect the snapshot.
    scene.push({
      id: "extra",
      type: "freehand",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    expect((ev as { elements: WBElement[] }).elements).toHaveLength(2);
  });
});

describe("excalidraw-adapter -- canonicalizeScene", () => {
  test("preserves order from Excalidraw onChange payload", () => {
    const out = canonicalizeScene([freedraw({ id: "a" }), rect({ id: "b" })]);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });

  test("filters out frames + selection + deleted elements silently", () => {
    const out = canonicalizeScene([
      freedraw({ id: "keep" }),
      rect({ id: "drop1", type: "frame" }),
      rect({ id: "drop2", type: "selection" }),
      rect({ id: "drop3", isDeleted: true }),
      rect({ id: "keep2" }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["keep", "keep2"]);
  });

  test("canonicalizeScene drops degenerate line (1pt, zero bbox) — phantom-stroke gate", () => {
    const degenLine = freedraw({
      id: "phantom",
      type: "line",
      width: 0,
      height: 0,
      points: [[0, 0]],
    });
    const out = canonicalizeScene([
      freedraw({ id: "real-stroke" }),
      degenLine,
      rect({ id: "real-rect" }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["real-stroke", "real-rect"]);
    expect(out).toHaveLength(2);
  });

  test("canonicalizeScene keeps a freedraw dot alongside a degenerate line drop", () => {
    const degenArrow = freedraw({
      id: "phantom-arrow",
      type: "arrow",
      width: 0,
      height: 0,
      points: [[3, 3], [3, 3]],
    });
    const freedrawDot = freedraw({
      id: "dot",
      type: "freedraw",
      width: 0,
      height: 0,
      points: [[3, 3]],
    });
    const out = canonicalizeScene([degenArrow, freedrawDot]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("dot");
    expect(out[0].type).toBe("freehand");
  });
});
