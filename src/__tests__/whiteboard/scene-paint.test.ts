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
    const restored = jest.fn((rough: ReadonlyArray<unknown>) => [...rough]);
    const built = buildSceneAt(log, 0, restored);
    expect(restored).toHaveBeenCalledTimes(1);
    expect(built.elements).toHaveLength(1);
    // Args: rough array, appState=null, opts.refreshDimensions=true.
    expect(restored.mock.calls[0][1]).toBeNull();
    expect((restored.mock.calls[0][2] as { refreshDimensions?: boolean }).refreshDimensions).toBe(
      true
    );
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

    let pendingCb: (() => void) | null = null;
    const raf = jest.fn((cb: () => void) => {
      pendingCb = cb;
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
    pendingCb?.();
    expect(updateScene).toHaveBeenCalledTimes(1);
    expect(measureCalls).toBeGreaterThanOrEqual(2);
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
