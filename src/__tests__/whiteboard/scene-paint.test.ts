/**
 * Pure-function + stateful tests for the scene-paint engine.
 *
 * Pillar 4 of the master plan: encapsulate the Phase 0 lessons so
 * both the replay player AND the workspace's resume / preview-before-
 * start surfaces inherit them for free.
 *
 * Coverage:
 *   - buildSceneAt: reconstructs canonical scene, returns ordered
 *     asset URLs, falls back gracefully when restoreElements throws.
 *   - createScenePainter: scrolls preserved on subsequent paints,
 *     never pushes theme / viewBackgroundColor / zoom via updateScene
 *     (Phase 0 dark-mode-flips-white regression), de-dupes asset URLs
 *     across paints.
 *   - createThrottledPlayLoop: 20Hz throttle while playing, dedupes
 *     consecutive identical times, seek + pause bypass throttle and
 *     dedupe (hotfix `fc2f871` regression pin).
 *   - computeViewportScroll: bbox math centres on element bounding
 *     box, returns null on degenerate input.
 *   - createCameraFitter: synchronous fit success, rAF retry when
 *     the container measures 0×0 then becomes available (Phase 0e
 *     `e85af9a` regression pin).
 */

import {
  buildSceneAt,
  computeResizeScroll,
  computeViewportScroll,
  createCameraFitter,
  createScenePainter,
  createThrottledPlayLoop,
  type ScenePaintApi,
} from "@/lib/whiteboard/scene-paint";
import type { WBEventLog } from "@/lib/whiteboard/event-log";

function logWith(elements: Array<{
  id: string;
  type: "rectangle" | "freehand" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  assetUrl?: string;
}>): WBEventLog {
  return {
    schemaVersion: 1,
    startedAt: "2026-05-10T20:00:00.000Z",
    durationMs: 1000,
    events: [
      {
        t: 0,
        type: "snapshot",
        elements: elements as never,
      },
    ],
  };
}

// -----------------------------------------------------------------
// buildSceneAt
// -----------------------------------------------------------------

describe("buildSceneAt", () => {
  test("returns elements + asset URLs from a snapshot at t=0", () => {
    const log = logWith([
      { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
      {
        id: "img1",
        type: "image",
        x: 0,
        y: 20,
        width: 30,
        height: 30,
        assetUrl: "https://example.com/a.png",
      },
    ]);

    const built = buildSceneAt(log, 0);
    expect(built.elements).toHaveLength(2);
    expect(built.assetUrls).toEqual(["https://example.com/a.png"]);
    expect(built.scene.size).toBe(2);
    expect(built.scene.get("r1")).toBeDefined();
  });

  test("de-dupes assetUrls across multiple image elements with the same URL", () => {
    const log = logWith([
      {
        id: "img1",
        type: "image",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        assetUrl: "https://example.com/dup.png",
      },
      {
        id: "img2",
        type: "image",
        x: 20,
        y: 0,
        width: 10,
        height: 10,
        assetUrl: "https://example.com/dup.png",
      },
    ]);
    const built = buildSceneAt(log, 0);
    expect(built.assetUrls).toEqual(["https://example.com/dup.png"]);
  });

  test("invokes restoreElements when supplied", () => {
    const log = logWith([
      { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
    ]);
    const restored: jest.Mock<unknown[], [unknown, unknown, unknown?]> =
      jest.fn(
        (rough: unknown, _appState: unknown, _opts?: unknown) =>
          [...(rough as ReadonlyArray<unknown>)]
      );
    const built = buildSceneAt(log, 0, restored);
    expect(restored).toHaveBeenCalledTimes(1);
    expect(built.elements).toHaveLength(1);
    // Args: rough array, appState=null, opts.refreshDimensions=true.
    expect(restored.mock.calls[0][1]).toBeNull();
    expect(
      (restored.mock.calls[0][2] as { refreshDimensions?: boolean })
        .refreshDimensions
    ).toBe(true);
  });

  test("falls back to raw adapter output when restoreElements throws", () => {
    const log = logWith([
      { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
    ]);
    const throwing = jest.fn(() => {
      throw new Error("simulated restoreElements failure");
    });
    const built = buildSceneAt(log, 0, throwing);
    expect(built.elements).toHaveLength(1);
  });
});

// -----------------------------------------------------------------
// createScenePainter
// -----------------------------------------------------------------

function makeMockApi(): {
  api: ScenePaintApi;
  updateScene: jest.Mock;
  setAppState: (st: Record<string, unknown>) => void;
} {
  let appState: Record<string, unknown> = {
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
  };
  const updateScene = jest.fn();
  return {
    api: {
      updateScene,
      getAppState: () => appState,
    },
    updateScene,
    setAppState: (st: Record<string, unknown>) => {
      appState = { ...appState, ...st };
    },
  };
}

describe("createScenePainter", () => {
  test("first paint with preserveScroll=false omits appState; subsequent paints merge scroll only", () => {
    const log = logWith([
      { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
    ]);
    const { api, updateScene, setAppState } = makeMockApi();
    const painter = createScenePainter({ log, api });

    painter.applyAt(0, { preserveScroll: false });
    expect(updateScene.mock.calls[0][0].appState).toBeUndefined();

    setAppState({ scrollX: 42, scrollY: -7 });
    painter.applyAt(100);
    const second = updateScene.mock.calls[1][0];
    expect(second.appState).toEqual({ scrollX: 42, scrollY: -7 });
  });

  test("NEVER pushes theme, viewBackgroundColor, or zoom via updateScene (Phase 0 regression)", () => {
    const log = logWith([
      { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
    ]);
    const { api, updateScene, setAppState } = makeMockApi();
    setAppState({
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
      theme: "dark",
      viewBackgroundColor: "#121212",
    });
    const painter = createScenePainter({ log, api });

    painter.applyAt(0);
    painter.applyAt(50);
    painter.applyAt(100);

    for (const call of updateScene.mock.calls) {
      const payload = call[0] as { appState?: Record<string, unknown> };
      expect(payload.appState?.theme).toBeUndefined();
      expect(payload.appState?.viewBackgroundColor).toBeUndefined();
      expect(payload.appState?.zoom).toBeUndefined();
    }
  });

  test("reports new asset URLs only on first sighting per painter instance", () => {
    const log = logWith([
      {
        id: "img1",
        type: "image",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        assetUrl: "https://example.com/alpha.png",
      },
    ]);
    const { api } = makeMockApi();
    const painter = createScenePainter({ log, api });

    const first = painter.applyAt(0, { preserveScroll: false });
    expect(first.newAssetUrls).toEqual(["https://example.com/alpha.png"]);

    const second = painter.applyAt(100);
    expect(second.newAssetUrls).toEqual([]);
  });

  test("registeredAssetUrls set is mutable and externally visible", () => {
    const log = logWith([
      {
        id: "img1",
        type: "image",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        assetUrl: "https://example.com/beta.png",
      },
    ]);
    const { api } = makeMockApi();
    const externalSet = new Set<string>();
    const painter = createScenePainter({
      log,
      api,
      registeredAssetUrls: externalSet,
    });

    painter.applyAt(0, { preserveScroll: false });
    expect(externalSet.has("https://example.com/beta.png")).toBe(true);
    expect(painter.registeredAssetUrls).toBe(externalSet);
  });

  test("lastSceneElements reflects the most recent painted frame", () => {
    const log = logWith([
      { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
    ]);
    const { api } = makeMockApi();
    const painter = createScenePainter({ log, api });
    expect(painter.lastSceneElements).toEqual([]);
    painter.applyAt(0, { preserveScroll: false });
    expect(painter.lastSceneElements).toHaveLength(1);
  });
});

// -----------------------------------------------------------------
// createThrottledPlayLoop
// -----------------------------------------------------------------

/**
 * Manual rAF + clock harness so the throttle is deterministic.
 *
 * `flushNextRaf()` runs the most-recently-scheduled rAF callback —
 * mirrors how a single browser frame would tick. The callback can
 * schedule a new rAF, which we keep until the next flush.
 */
function makeRafHarness() {
  let nowValue = 0;
  let nextId = 1;
  let pending: { id: number; cb: () => void } | null = null;

  return {
    raf: (cb: () => void): number => {
      const id = nextId++;
      pending = { id, cb };
      return id;
    },
    cancelRaf: (id: number) => {
      if (pending?.id === id) pending = null;
    },
    now: () => nowValue,
    advanceClockBy(ms: number) {
      nowValue += ms;
    },
    setClock(ms: number) {
      nowValue = ms;
    },
    flushNextRaf() {
      const p = pending;
      pending = null;
      p?.cb();
    },
    hasPendingRaf() {
      return pending !== null;
    },
  };
}

describe("createThrottledPlayLoop", () => {
  test("first tick after play() fires immediately; subsequent ticks throttled to intervalMs", () => {
    const h = makeRafHarness();
    let playhead = 1000;
    const apply = jest.fn();
    const loop = createThrottledPlayLoop({
      getTimeMs: () => playhead,
      apply,
      intervalMs: 50,
      raf: h.raf,
      cancelRaf: h.cancelRaf,
      now: h.now,
    });

    loop.play();
    h.flushNextRaf(); // first scheduled tick
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith(1000);

    // 30ms later — still under threshold, no apply.
    h.advanceClockBy(30);
    playhead = 1100;
    h.flushNextRaf();
    expect(apply).toHaveBeenCalledTimes(1);

    // Cross the 50ms threshold — apply fires.
    h.advanceClockBy(30); // total 60 ms since first tick
    playhead = 1200;
    h.flushNextRaf();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(1200);
  });

  test("dedupes consecutive identical playhead times during play", () => {
    const h = makeRafHarness();
    let playhead = 0;
    const apply = jest.fn();
    const loop = createThrottledPlayLoop({
      getTimeMs: () => playhead,
      apply,
      intervalMs: 0, // disable throttle so dedupe is tested in isolation
      raf: h.raf,
      cancelRaf: h.cancelRaf,
      now: h.now,
    });
    loop.play();
    h.flushNextRaf();
    expect(apply).toHaveBeenCalledTimes(1);
    h.flushNextRaf();
    expect(apply).toHaveBeenCalledTimes(1);
    playhead = 100;
    h.flushNextRaf();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  test("seek() bypasses throttle AND dedupe — applies immediately even at the same playhead", () => {
    const h = makeRafHarness();
    let playhead = 500;
    const apply = jest.fn();
    const loop = createThrottledPlayLoop({
      getTimeMs: () => playhead,
      apply,
      intervalMs: 50,
      raf: h.raf,
      cancelRaf: h.cancelRaf,
      now: h.now,
    });

    loop.play();
    h.flushNextRaf();
    expect(apply).toHaveBeenCalledTimes(1);

    // No clock advance, no playhead change — seek must still fire.
    loop.seek();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(500);

    // Even a same-time seek should fire (force=true).
    loop.seek();
    expect(apply).toHaveBeenCalledTimes(3);
  });

  test("pause() cancels rAF and applies trailing time", () => {
    const h = makeRafHarness();
    let playhead = 700;
    const apply = jest.fn();
    const loop = createThrottledPlayLoop({
      getTimeMs: () => playhead,
      apply,
      intervalMs: 50,
      raf: h.raf,
      cancelRaf: h.cancelRaf,
      now: h.now,
    });

    loop.play();
    h.flushNextRaf();
    expect(apply).toHaveBeenLastCalledWith(700);

    playhead = 750;
    loop.pause();
    expect(apply).toHaveBeenLastCalledWith(750);
    expect(h.hasPendingRaf()).toBe(false);
  });

  test("dispose() cancels rAF without applying", () => {
    const h = makeRafHarness();
    const apply = jest.fn();
    const loop = createThrottledPlayLoop({
      getTimeMs: () => 0,
      apply,
      intervalMs: 50,
      raf: h.raf,
      cancelRaf: h.cancelRaf,
      now: h.now,
    });
    loop.play();
    h.flushNextRaf();
    apply.mockClear();
    loop.dispose();
    expect(apply).not.toHaveBeenCalled();
    expect(h.hasPendingRaf()).toBe(false);
  });

  test("play() is idempotent — doesn't schedule two rAF loops", () => {
    const h = makeRafHarness();
    const loop = createThrottledPlayLoop({
      getTimeMs: () => 0,
      apply: jest.fn(),
      intervalMs: 50,
      raf: h.raf,
      cancelRaf: h.cancelRaf,
      now: h.now,
    });
    loop.play();
    expect(h.hasPendingRaf()).toBe(true);
    const before = h.hasPendingRaf();
    loop.play();
    loop.play();
    // Still only one pending rAF after multiple play() calls.
    expect(h.hasPendingRaf()).toBe(before);
  });
});

// -----------------------------------------------------------------
// computeViewportScroll
// -----------------------------------------------------------------

describe("computeViewportScroll", () => {
  test("centres a single rectangle's bbox in the container", () => {
    // Same shape as the existing replay viewport dom test.
    const fit = computeViewportScroll({
      elements: [{ x: -40, y: -28, width: 30, height: 20 }],
      containerWidth: 800,
      containerHeight: 600,
      zoom: 1,
    });
    expect(fit).not.toBeNull();
    if (!fit) throw new Error("unreachable");
    // bbox: minX=-40, maxX=-10, minY=-28, maxY=-8 → centre (-25, -18).
    expect(fit.scrollX).toBeCloseTo(800 / 2 - -25, 6);
    expect(fit.scrollY).toBeCloseTo(600 / 2 - -18, 6);
  });

  test("returns null when no elements", () => {
    expect(
      computeViewportScroll({
        elements: [],
        containerWidth: 800,
        containerHeight: 600,
        zoom: 1,
      })
    ).toBeNull();
  });

  test("returns null when container has zero area (Phase 0e race condition)", () => {
    expect(
      computeViewportScroll({
        elements: [{ x: 0, y: 0, width: 10, height: 10 }],
        containerWidth: 0,
        containerHeight: 600,
        zoom: 1,
      })
    ).toBeNull();
  });

  test("handles non-finite element fields by skipping them", () => {
    const fit = computeViewportScroll({
      elements: [
        { x: NaN, y: 0, width: 10, height: 10 },
        { x: 0, y: 0, width: 20, height: 20 },
      ],
      containerWidth: 200,
      containerHeight: 200,
      zoom: 1,
    });
    expect(fit).not.toBeNull();
  });
});

// -----------------------------------------------------------------
// createCameraFitter
// -----------------------------------------------------------------

/**
 * Minimal `DOMRect`-shaped factory so the camera-fitter tests can
 * run in the node Jest environment (no jsdom). The fitter only
 * reads `width` + `height`; the rest of the rect is filler so the
 * type cast is honest.
 */
function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    toJSON: () => ({ x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height }),
  } as DOMRect;
}

describe("createCameraFitter", () => {
  test("synchronous fit succeeds and pushes camera scroll + zoom only", () => {
    const updateScene = jest.fn();
    const api: ScenePaintApi = { updateScene };
    const elements = [{ x: 0, y: 0, width: 100, height: 100 }];
    const fitter = createCameraFitter({
      api,
      container: { getBoundingClientRect: () => rect(800, 600) },
      getElements: () => elements,
      zoom: 1,
      raf: jest.fn(),
      cancelRaf: jest.fn(),
    });

    expect(fitter.fit()).toBe(true);
    expect(updateScene).toHaveBeenCalledTimes(1);
    const payload = updateScene.mock.calls[0][0] as {
      appState: Record<string, unknown>;
    };
    expect(payload.appState.scrollX).toBeDefined();
    expect(payload.appState.scrollY).toBeDefined();
    expect(payload.appState.zoom).toEqual({ value: 1 });
    // Theme + viewBackgroundColor must NOT appear — Phase 0 dark-mode
    // regression pin.
    expect(payload.appState.theme).toBeUndefined();
    expect(payload.appState.viewBackgroundColor).toBeUndefined();
  });

  test("rAF retry when first measurement is 0×0, succeeds on second attempt", () => {
    let measureCalls = 0;
    const updateScene = jest.fn();
    const api: ScenePaintApi = { updateScene };
    const elements = [{ x: 0, y: 0, width: 100, height: 100 }];

    const cbBox: { current: (() => void) | null } = { current: null };
    const raf = jest.fn((cb: () => void) => {
      cbBox.current = cb;
      return 1;
    });
    const cancelRaf = jest.fn();

    const fitter = createCameraFitter({
      api,
      container: {
        getBoundingClientRect: () => {
          measureCalls += 1;
          if (measureCalls === 1) return rect(0, 0);
          return rect(800, 600);
        },
      },
      getElements: () => elements,
      zoom: 1,
      maxRetries: 4,
      raf,
      cancelRaf,
    });

    expect(fitter.fit()).toBe(false);
    expect(updateScene).not.toHaveBeenCalled();
    expect(raf).toHaveBeenCalledTimes(1);

    // Run the queued retry — this time the measurement returns real
    // dimensions and the fit succeeds.
    cbBox.current?.();
    expect(updateScene).toHaveBeenCalledTimes(1);
    expect(measureCalls).toBeGreaterThanOrEqual(2);
  });

  test("onFit fires once on the first successful attempt (sync + async)", () => {
    // Sync win: onFit should fire on the synchronous fit().
    const onFitSync = jest.fn();
    const fitterSync = createCameraFitter({
      api: { updateScene: jest.fn() },
      container: { getBoundingClientRect: () => rect(800, 600) },
      getElements: () => [{ x: 0, y: 0, width: 100, height: 100 }],
      zoom: 1,
      onFit: onFitSync,
      raf: jest.fn(),
      cancelRaf: jest.fn(),
    });
    expect(fitterSync.fit()).toBe(true);
    expect(onFitSync).toHaveBeenCalledTimes(1);

    // Async win: 0×0 first, then real dims on the rAF retry. onFit should
    // fire exactly once when the async retry succeeds.
    const onFitAsync = jest.fn();
    let measureCalls = 0;
    const cbBox: { current: (() => void) | null } = { current: null };
    const fitterAsync = createCameraFitter({
      api: { updateScene: jest.fn() },
      container: {
        getBoundingClientRect: () => {
          measureCalls += 1;
          return measureCalls === 1 ? rect(0, 0) : rect(800, 600);
        },
      },
      getElements: () => [{ x: 0, y: 0, width: 100, height: 100 }],
      zoom: 1,
      onFit: onFitAsync,
      raf: (cb) => {
        cbBox.current = cb;
        return 1;
      },
      cancelRaf: jest.fn(),
    });
    expect(fitterAsync.fit()).toBe(false);
    expect(onFitAsync).not.toHaveBeenCalled();
    cbBox.current?.();
    expect(onFitAsync).toHaveBeenCalledTimes(1);
  });

  test("onFit thrown error doesn't crash the fitter", () => {
    const updateScene = jest.fn();
    const fitter = createCameraFitter({
      api: { updateScene },
      container: { getBoundingClientRect: () => rect(800, 600) },
      getElements: () => [{ x: 0, y: 0, width: 100, height: 100 }],
      zoom: 1,
      onFit: () => {
        throw new Error("host callback boom");
      },
      raf: jest.fn(),
      cancelRaf: jest.fn(),
    });
    expect(() => fitter.fit()).not.toThrow();
    expect(updateScene).toHaveBeenCalledTimes(1);
  });

  test("dispose cancels pending rAF retries", () => {
    const cancelRaf = jest.fn();
    const fitter = createCameraFitter({
      api: { updateScene: jest.fn() },
      container: { getBoundingClientRect: () => rect(0, 0) },
      getElements: () => [],
      zoom: 1,
      raf: () => 99,
      cancelRaf,
    });
    fitter.fit();
    fitter.dispose();
    expect(cancelRaf).toHaveBeenCalledWith(99);
  });
});

// -----------------------------------------------------------------
// computeResizeScroll — center-preserving resize math
// -----------------------------------------------------------------
//
// Independent oracle: Excalidraw's coordinate model (confirmed by
// computeViewportScroll and viewport-align.ts).
//
//   scrollX = containerWidth / 2 / zoom - sceneCenterX
//   → sceneCenterX = containerWidth / 2 / zoom - scrollX
//
// Given this, keeping sceneCenterX at the center of a new container:
//   newScrollX = newWidth / 2 / zoom - sceneCenterX
//
// We use this oracle independently — NOT back-derived from the
// implementation — to satisfy the jsdom blind-spot rule: assert the
// math, not DOM pixels.

/**
 * Oracle: scene X coordinate currently at the viewport center.
 * Derived directly from Excalidraw's published transform, independent
 * of the computeResizeScroll implementation.
 */
function oracleSceneCenterX(
  scrollX: number,
  zoom: number,
  containerWidth: number
): number {
  return containerWidth / 2 / zoom - scrollX;
}
function oracleSceneCenterY(
  scrollY: number,
  zoom: number,
  containerHeight: number
): number {
  return containerHeight / 2 / zoom - scrollY;
}

describe("computeResizeScroll", () => {
  const cases = [
    { label: "800→400 z=1",  oldW: 800, oldH: 600, newW: 400, newH: 300, zoom: 1 },
    { label: "400→800 z=1",  oldW: 400, oldH: 300, newW: 800, newH: 600, zoom: 1 },
    { label: "800→1440 z=2", oldW: 800, oldH: 600, newW: 1440, newH: 900, zoom: 2 },
    { label: "1440→390 z=0.5", oldW: 1440, oldH: 900, newW: 390, newH: 844, zoom: 0.5 },
    { label: "no-op same size", oldW: 800, oldH: 600, newW: 800, newH: 600, zoom: 1 },
  ];

  it.each(cases)(
    "scene center stays at viewport center after resize ($label)",
    ({ oldW, oldH, newW, newH, zoom }) => {
      // Arbitrary pre-resize scroll (not at origin, so the test is meaningful).
      const initialScrollX = 120;
      const initialScrollY = -45;

      // Oracle: what scene point is currently at the viewport center?
      const sceneCX = oracleSceneCenterX(initialScrollX, zoom, oldW);
      const sceneCY = oracleSceneCenterY(initialScrollY, zoom, oldH);

      const result = computeResizeScroll({
        scrollX: initialScrollX,
        scrollY: initialScrollY,
        zoom,
        oldWidth: oldW,
        oldHeight: oldH,
        newWidth: newW,
        newHeight: newH,
      });

      // After applying the new scroll, the oracle must still report the SAME
      // scene center at the new viewport center.
      const newCX = oracleSceneCenterX(result.scrollX, zoom, newW);
      const newCY = oracleSceneCenterY(result.scrollY, zoom, newH);

      expect(newCX).toBeCloseTo(sceneCX, 10);
      expect(newCY).toBeCloseTo(sceneCY, 10);
    }
  );

  it("is offset-invariant: varying initial scrollX produces consistent scene center preservation", () => {
    const zoom = 1.5;
    const oldW = 800;
    const oldH = 600;
    const newW = 500;
    const newH = 400;

    for (const scrollX of [-300, 0, 42, 400, 800]) {
      for (const scrollY of [-200, 0, -17, 300]) {
        const sceneCX = oracleSceneCenterX(scrollX, zoom, oldW);
        const sceneCY = oracleSceneCenterY(scrollY, zoom, oldH);

        const result = computeResizeScroll({
          scrollX,
          scrollY,
          zoom,
          oldWidth: oldW,
          oldHeight: oldH,
          newWidth: newW,
          newHeight: newH,
        });

        expect(oracleSceneCenterX(result.scrollX, zoom, newW)).toBeCloseTo(
          sceneCX,
          10
        );
        expect(oracleSceneCenterY(result.scrollY, zoom, newH)).toBeCloseTo(
          sceneCY,
          10
        );
      }
    }
  });

  it("demonstrates the stale-snapshot bug: using new width as oldWidth zeroes the correction", () => {
    // This is the bug that caused rightward drift: applySceneAt was writing
    // st.width (already updated by Excalidraw's resize handler) into the
    // snapshot, so by the next ResizeObserver tick oldW = newW and the
    // formula produced no correction.
    const scrollX = 300;
    const scrollY = 200;
    const zoom = 1;
    const trueOldW = 800;
    const trueOldH = 600;
    const newW = 400;
    const newH = 300;

    // Scene center with the TRUE pre-resize dimensions.
    const trueCX = oracleSceneCenterX(scrollX, zoom, trueOldW); // = 100
    const trueCY = oracleSceneCenterY(scrollY, zoom, trueOldH); // = 100

    // Correct result: uses true old dimensions.
    const correct = computeResizeScroll({
      scrollX,
      scrollY,
      zoom,
      oldWidth: trueOldW,
      oldHeight: trueOldH,
      newWidth: newW,
      newHeight: newH,
    });
    expect(oracleSceneCenterX(correct.scrollX, zoom, newW)).toBeCloseTo(trueCX, 10);

    // Buggy result: oldWidth was already overwritten to newW (the bug).
    const buggy = computeResizeScroll({
      scrollX,
      scrollY,
      zoom,
      oldWidth: newW, // stale — already the post-resize width
      oldHeight: newH,
      newWidth: newW,
      newHeight: newH,
    });
    // No correction is applied (scrollX unchanged), content drifts.
    expect(buggy.scrollX).toBeCloseTo(scrollX, 10);
    // Scene center under the buggy result is WRONG.
    expect(oracleSceneCenterX(buggy.scrollX, zoom, newW)).not.toBeCloseTo(
      trueCX,
      1
    );
  });
});

// -----------------------------------------------------------------
// computeResizeScroll — Andrew's grid vector tests
// -----------------------------------------------------------------
//
// Andrew's acceptance model (11×11 grid viewport, mark at center):
//   resize to 5×5   → mark at 3,3    (center of 5×5)
//   resize to 21×21 → mark at 11,11  (center of 21×21)
//   resize to 5×21  → mark at 3,11
//   resize to 21×11 → mark at 11,6
//
// We map these to real pixel sizes at zoom=1. The scene mark is at
// (sceneCX, sceneCY) = (100, 100). Initial viewport is 1100×1100 px
// with the mark centered via the camera fit.
//
// Independent oracle: same oracleSceneCenterX/Y used above —
// derived from Excalidraw's published transform, NOT the implementation.

describe("computeResizeScroll — Andrew grid vectors", () => {
  const z = 1;
  const initialW = 1100;
  const initialH = 1100;
  const sceneCX = 100; // scene point at viewport center
  const sceneCY = 100;

  // Camera-fit scroll: centers (sceneCX, sceneCY) in the initial viewport.
  const cameraFitScrollX = initialW / 2 / z - sceneCX; // = 450
  const cameraFitScrollY = initialH / 2 / z - sceneCY; // = 450

  // Analog of Andrew's grid resizes using real px sizes (zoom=1):
  //   11→5  ≈ 1100→500    11→21 ≈ 1100→2100
  const gridCases = [
    { label: "11×11 → 5×5  (shrink both axes)",   newW: 500,  newH: 500  },
    { label: "11×11 → 21×21 (grow both axes)",     newW: 2100, newH: 2100 },
    { label: "11×11 → 5×21  (shrink X, grow Y)",   newW: 500,  newH: 2100 },
    { label: "11×11 → 21×11 (grow X, no Y change)", newW: 2100, newH: 1100 },
    { label: "no-op (same size)",                   newW: 1100, newH: 1100 },
  ];

  it.each(gridCases)(
    "scene mark stays at viewport center: $label",
    ({ newW, newH }) => {
      const result = computeResizeScroll({
        scrollX: cameraFitScrollX,
        scrollY: cameraFitScrollY,
        zoom: z,
        oldWidth: initialW,
        oldHeight: initialH,
        newWidth: newW,
        newHeight: newH,
      });

      // Oracle: the mark (sceneCX, sceneCY) must sit at the new viewport center.
      expect(oracleSceneCenterX(result.scrollX, z, newW)).toBeCloseTo(sceneCX, 10);
      expect(oracleSceneCenterY(result.scrollY, z, newH)).toBeCloseTo(sceneCY, 10);
    }
  );

  it("scroll changes by exactly Δsize/(2*zoom) — non-center point keeps scene-space offset", () => {
    // The scroll delta equals (newSize - oldSize) / (2 * zoom), per axis.
    // This means a non-center scene point maintains a constant offset from
    // the viewport center (zoom is unchanged, so scene coordinates are stable).
    const newW = 500;
    const newH = 700;
    const result = computeResizeScroll({
      scrollX: cameraFitScrollX,
      scrollY: cameraFitScrollY,
      zoom: z,
      oldWidth: initialW,
      oldHeight: initialH,
      newWidth: newW,
      newHeight: newH,
    });
    expect(result.scrollX - cameraFitScrollX).toBeCloseTo(
      (newW - initialW) / (2 * z),
      10
    );
    expect(result.scrollY - cameraFitScrollY).toBeCloseTo(
      (newH - initialH) / (2 * z),
      10
    );
  });

  it("frame-to-frame multi-step equals one-shot from origin (math equivalence)", () => {
    // Verifies the frame-to-frame tracking approach used by the ResizeObserver:
    // applying each resize delta incrementally from the running state gives
    // the same final scroll as computing directly from the original state.
    const steps = [
      { w: 500,  h: 500  }, // shrink
      { w: 800,  h: 600  }, // expand
      { w: 1200, h: 900  }, // expand further
    ];

    // One-shot from origin directly to the final size:
    const finalStep = steps[steps.length - 1]!;
    const oneShot = computeResizeScroll({
      scrollX: cameraFitScrollX,
      scrollY: cameraFitScrollY,
      zoom: z,
      oldWidth: initialW,
      oldHeight: initialH,
      newWidth: finalStep.w,
      newHeight: finalStep.h,
    });

    // Frame-to-frame: apply each delta from running state.
    let curScrollX = cameraFitScrollX;
    let curScrollY = cameraFitScrollY;
    let curW = initialW;
    let curH = initialH;
    for (const step of steps) {
      const r = computeResizeScroll({
        scrollX: curScrollX,
        scrollY: curScrollY,
        zoom: z,
        oldWidth: curW,
        oldHeight: curH,
        newWidth: step.w,
        newHeight: step.h,
      });
      curScrollX = r.scrollX;
      curScrollY = r.scrollY;
      curW = step.w;
      curH = step.h;
    }

    // Both approaches must agree — frame-to-frame is mathematically equivalent.
    expect(curScrollX).toBeCloseTo(oneShot.scrollX, 10);
    expect(curScrollY).toBeCloseTo(oneShot.scrollY, 10);
    // And the scene center is preserved in both.
    expect(oracleSceneCenterX(curScrollX, z, finalStep.w)).toBeCloseTo(sceneCX, 10);
    expect(oracleSceneCenterY(curScrollY, z, finalStep.h)).toBeCloseTo(sceneCY, 10);
  });

  it("RED-BEFORE: stale pre-camera-fit scrollX=0 in snapshot produces wrong center (root cause pin)", () => {
    // Root cause of b7b8d3e bug: viewportSnapshotRef captured scrollX BEFORE
    // the camera fitter ran (applySceneAt fires first in the same useEffect,
    // then fitter.fit() sets the correct scrollX). So frozenSnapshot.scrollX=0
    // (Excalidraw's initial default) instead of cameraFitScrollX.
    //
    // This test is the RED-BEFORE pin: the buggy inputs produce a wrong center
    // (550 instead of 100), while the correct (post-camera-fit) inputs give 100.

    const newW = 500;
    const newH = 500;

    // CORRECT (frame-to-frame reads st.scrollX = cameraFitScrollX, which is
    // the post-camera-fit value by the time the ResizeObserver fires):
    const correct = computeResizeScroll({
      scrollX: cameraFitScrollX, // 450 — what st.scrollX actually is
      scrollY: cameraFitScrollY,
      zoom: z,
      oldWidth: initialW,
      oldHeight: initialH,
      newWidth: newW,
      newHeight: newH,
    });
    const correctCX = oracleSceneCenterX(correct.scrollX, z, newW);

    // BUGGY (frozen snapshot has scrollX=0, captured before camera fit):
    const buggy = computeResizeScroll({
      scrollX: 0,  // stale: Excalidraw's initial scrollX before camera fit
      scrollY: 0,
      zoom: z,
      oldWidth: initialW,
      oldHeight: initialH,
      newWidth: newW,
      newHeight: newH,
    });
    const buggyCX = oracleSceneCenterX(buggy.scrollX, z, newW);

    // GREEN: correct path keeps the scene mark at center (100).
    expect(correctCX).toBeCloseTo(sceneCX, 10);

    // GREEN: buggy path puts scene point 550 at center instead
    // ("where center would have been at full screen" = initial default origin).
    expect(buggyCX).not.toBeCloseTo(sceneCX, 1);
    // scrollX=0 → sceneCX_stale = 1100/2/1 - 0 = 550
    expect(buggyCX).toBeCloseTo(initialW / 2, 1);
  });
});
