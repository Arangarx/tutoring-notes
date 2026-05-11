/**
 * Whiteboard scene-paint engine — shared between the replay player
 * and the workspace's resume / draft-restore / preview-before-start
 * surfaces.
 *
 * Pillar 4 of the master plan: ONE engine, used everywhere a
 * canonical event log is painted into an Excalidraw canvas. Replay
 * and workspace must never drift on:
 *
 *   1. Excalidraw view-mode `viewBackgroundColor` quirk — pushing
 *      `viewBackgroundColor` via `updateScene` makes Excalidraw
 *      reset its background when elements transition empty→non-empty
 *      in view mode (Andrew repro 2026-05-09: dark canvas flips white
 *      the moment the first stroke arrives). The engine NEVER pushes
 *      theme or `viewBackgroundColor`; theme is driven entirely by
 *      the host's `<Excalidraw theme=… />` prop.
 *
 *   2. Play-loop throttle — the audio rAF loop calls into scene
 *      painting on every frame. At 60Hz on long recordings, the main
 *      thread starves, the audio scrubber drops pointer events, and
 *      seeks take too long to land (hotfix `fc2f871`, Andrew repro
 *      2026-05-09 on a two-party session). Throttle to ~20Hz; seek
 *      and pause bypass the throttle so user-initiated changes are
 *      always immediate.
 *
 *   3. Bbox camera math — Excalidraw's own `scrollToContent` is
 *      timing-dependent and intermittent on share replay. Phase 0e
 *      shipped deterministic bbox math (centre on the elements'
 *      bounding box) with rAF retry when the container measures 0×0
 *      (commit `e85af9a`).
 *
 * The engine has three concerns:
 *
 *   A. Pure scene reconstruction + restoration → painted-elements
 *      array, ready to push to `updateScene`.
 *   B. Stateful per-Excalidraw-instance painter that tracks
 *      registered asset URLs + the last painted frame so the host
 *      can preserve scroll on re-paints.
 *   C. Throttled play-loop driver that calls a host-supplied apply
 *      callback at most every `intervalMs`, with seek/pause bypass.
 *
 * The engine intentionally does NOT do:
 *
 *   - Image asset fetches / `addFiles` calls. The host owns blob
 *     fetching (it differs between replay's blob.vercel-storage
 *     paths, share's signed paths, and the workspace's per-asset
 *     `resolveWhiteboardAssetReadUrl`). The engine reports "these
 *     asset URLs need fetching"; the host kicks off the fetch.
 *
 *   - Excalidraw lazy-loading. The host preloads the
 *     `restoreElements` function via `import("@excalidraw/excalidraw")`
 *     and passes it in. Keeps the engine importable from server-side
 *     test harnesses without booting the >1MB Excalidraw bundle.
 *
 * Tests: `src/__tests__/whiteboard/scene-paint.test.ts`.
 */

import {
  reconstructSceneAt,
  type WBElement,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import {
  sanitizeRestoredExcalidrawElementsForReplay,
  toExcalidraw,
} from "@/lib/whiteboard/excalidraw-adapter";

// -----------------------------------------------------------------
// A. Pure scene reconstruction
// -----------------------------------------------------------------

/**
 * Structural type for the bits of `restoreElements` we need. Matches
 * the upstream `@excalidraw/excalidraw` signature without importing
 * the heavy package — keeps the engine + tests light.
 *
 * We pass `null` for the appState arg in every call (the engine never
 * pushes appState through restoreElements; theme is owned by the host
 * Excalidraw prop) and `{refreshDimensions: true}` so freedraw
 * pressures + arrow elbow data get repaired.
 *
 * Inputs are typed as `any` so the upstream Excalidraw function
 * (`(elements: readonly ExcalidrawElement[] | null | undefined,
 * localElements, opts) => OrderedExcalidrawElement[]`) is assignable
 * without forcing a cast at every call site. The engine wraps the
 * call in try/catch and falls back to the raw adapter output if the
 * function throws on malformed input, so `any` here is intentional.
 */
export type RestoreElementsFn = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rough: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appState: any,
  opts?: { refreshDimensions?: boolean; repairBindings?: boolean }
) => unknown[];

/**
 * Result of building a scene at a given replay time. Pure data —
 * `elements` is what to push to `updateScene({elements})`,
 * `assetUrls` lists the distinct image asset URLs in the scene
 * (caller decides which to fetch / register).
 */
export type BuiltScene = {
  /**
   * Elements ready to push to `updateScene`. Already passed through
   * the canonical adapter, restoreElements (when supplied), and the
   * linear-points-repair sanitizer.
   */
  elements: unknown[];
  /**
   * Distinct `assetUrl` values present in the scene. Useful for the
   * host's image-asset registration step; ordering matches first
   * appearance in the scene.
   */
  assetUrls: string[];
  /**
   * The reconstructed canonical scene by element id. Exposed so the
   * host can stamp `fileId` onto image elements during asset
   * registration without re-running `reconstructSceneAt`.
   */
  scene: Map<string, WBElement>;
};

/**
 * Build the painted-elements array for a single replay time.
 *
 * - `restoreElements` is optional. When present, it's run on the
 *   adapted scene to populate Excalidraw-required defaults (seed,
 *   version, etc.); when absent, the raw adapter output is used
 *   (jsdom tests, server-side calls).
 * - `restoreElements` failures are swallowed — the raw adapter
 *   output is always a valid fallback (replay won't crash, will
 *   just render with default Excalidraw defaults).
 */
export function buildSceneAt(
  log: WBEventLog,
  atTimeMs: number,
  restoreElements?: RestoreElementsFn
): BuiltScene {
  const scene = reconstructSceneAt(log, atTimeMs);
  const rough: unknown[] = [];
  const assetUrls: string[] = [];
  const seenAssetUrls = new Set<string>();

  for (const el of scene.values()) {
    rough.push(toExcalidraw(el));
    if (el.assetUrl && !seenAssetUrls.has(el.assetUrl)) {
      seenAssetUrls.add(el.assetUrl);
      assetUrls.push(el.assetUrl);
    }
  }

  let restored: unknown[];
  if (restoreElements) {
    try {
      restored = restoreElements(rough, null, { refreshDimensions: true });
    } catch {
      // Fall back to the raw adapter output. We've seen Excalidraw's
      // restoreElements throw on certain malformed legacy logs; never
      // let that crash the player.
      restored = rough;
    }
  } else {
    restored = rough;
  }

  const elements = sanitizeRestoredExcalidrawElementsForReplay(restored);
  return { elements, assetUrls, scene };
}

// -----------------------------------------------------------------
// B. Stateful scene painter (per-Excalidraw-instance)
// -----------------------------------------------------------------

/**
 * Minimal structural type for the Excalidraw imperative API surface
 * the painter touches. Both `WhiteboardReplay` and
 * `WhiteboardWorkspaceClient` provide objects that satisfy this.
 */
export type ScenePaintApi = {
  updateScene: (data: {
    elements?: ReadonlyArray<unknown>;
    appState?: Record<string, unknown>;
  }) => void;
  getAppState?: () => Record<string, unknown>;
};

export type ScenePainterDeps = {
  /** Event log to paint from. */
  log: WBEventLog;
  /** Imperative API for the Excalidraw instance to paint into. */
  api: ScenePaintApi;
  /**
   * Optional — when supplied, runs after the canonical adapter to
   * populate Excalidraw-required defaults. The host preloads this
   * via dynamic import to keep the engine module light.
   */
  restoreElements?: RestoreElementsFn;
  /**
   * Optional — set of asset URLs already-registered for THIS api
   * instance. The painter mutates this set when it reports new URLs
   * so subsequent paints don't re-report the same URL. The host
   * controls the lifetime (clears when the api instance changes).
   */
  registeredAssetUrls?: Set<string>;
};

export type PaintOptions = {
  /**
   * When true, the painter merges current `scrollX`/`scrollY` from
   * `api.getAppState()` into the `updateScene` payload so Excalidraw
   * doesn't reset the camera. Set false for the *initial* paint
   * (camera fit happens after first paint via {@link createCameraFitter}).
   *
   * The painter NEVER merges zoom — see Phase 0e + replay header
   * comment, ticking zoom alongside scene updates blew up percentages
   * in pilots.
   */
  preserveScroll?: boolean;
};

export type PaintResult = {
  /**
   * Elements that were pushed to updateScene. Host can use this for
   * subsequent camera-fit math without re-running the engine.
   */
  paintedElements: readonly unknown[];
  /**
   * Asset URLs that were not previously registered on this painter
   * instance. The host should fetch + register these via
   * `api.addFiles`. Empty when no new images appear.
   */
  newAssetUrls: string[];
  /**
   * Reconstructed canonical scene by id. Host can use this to stamp
   * `fileId` on image elements during asset registration.
   */
  scene: ReadonlyMap<string, WBElement>;
};

export type ScenePainter = {
  /**
   * Reconstruct + paint at the given replay time. Pushes one
   * `updateScene` call into `api`. Idempotent if called twice with
   * the same `timeMs` (Excalidraw diffs internally on element ids
   * + version stamps, so re-pushing is cheap).
   *
   * The painter NEVER pushes `theme`, `viewBackgroundColor`, or
   * `zoom` via updateScene — see file header for why.
   */
  applyAt(timeMs: number, opts?: PaintOptions): PaintResult;
  /**
   * Read-only view of the last frame painted. Useful for camera-fit
   * code that needs to recompute bbox after a paint.
   */
  readonly lastSceneElements: readonly unknown[];
  /** Mutate-safe accessor for the registered asset URL set. */
  readonly registeredAssetUrls: Set<string>;
};

/**
 * Build a per-(api, log) painter that tracks registered assets + the
 * last painted scene. The host re-creates a painter when either the
 * api instance or the log object changes.
 */
export function createScenePainter(deps: ScenePainterDeps): ScenePainter {
  const { log, api, restoreElements } = deps;
  const registeredAssetUrls = deps.registeredAssetUrls ?? new Set<string>();
  let lastSceneElements: readonly unknown[] = [];

  function applyAt(timeMs: number, opts: PaintOptions = {}): PaintResult {
    const { preserveScroll = true } = opts;
    const built = buildSceneAt(log, timeMs, restoreElements);

    const newAssetUrls: string[] = [];
    for (const url of built.assetUrls) {
      if (!registeredAssetUrls.has(url)) {
        registeredAssetUrls.add(url);
        newAssetUrls.push(url);
      }
    }

    const updatePayload: {
      elements: readonly unknown[];
      appState?: Record<string, unknown>;
    } = { elements: built.elements };
    if (preserveScroll) {
      const merged = readScrollOnly(api);
      if (merged) updatePayload.appState = merged;
    }

    api.updateScene(updatePayload);
    lastSceneElements = built.elements;

    return {
      paintedElements: built.elements,
      newAssetUrls,
      scene: built.scene,
    };
  }

  return {
    applyAt,
    get lastSceneElements() {
      return lastSceneElements;
    },
    registeredAssetUrls,
  };
}

/**
 * Pull `scrollX` / `scrollY` from the current Excalidraw appState
 * (best-effort). Returns null when the values aren't readable so the
 * painter can omit `appState` from `updateScene` entirely (Excalidraw
 * keeps its own scroll in that case).
 *
 * Intentionally does NOT include zoom — see PaintOptions.
 */
function readScrollOnly(api: ScenePaintApi): Record<string, unknown> | null {
  try {
    const st = api.getAppState?.();
    if (!st) return null;
    const out: Record<string, unknown> = {};
    if (typeof st.scrollX === "number") out.scrollX = st.scrollX;
    if (typeof st.scrollY === "number") out.scrollY = st.scrollY;
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------
// C. Throttled play-loop driver (20Hz with seek/pause bypass)
// -----------------------------------------------------------------

export type ThrottledPlayLoopDeps = {
  /**
   * Current playhead time in ms — read on each tick. The host wires
   * this to `Math.floor(audioElement.currentTime * 1000)`.
   */
  getTimeMs: () => number;
  /**
   * Apply scene at `ms`. Called at most once every `intervalMs` while
   * the loop is playing; called immediately on `pause` / `seek`.
   *
   * The driver de-dupes consecutive identical `ms` values when
   * playing (no useless scene rebuilds during paused audio frames),
   * but force-applies on `pause` / `seek` so user-initiated state
   * changes always paint.
   */
  apply: (ms: number) => void;
  /**
   * Minimum interval between play-loop ticks in milliseconds.
   * Defaults to 50ms (≈20Hz). Hotfix `fc2f871` chose this value
   * after observing main-thread starvation at 60Hz on two-party
   * recordings.
   */
  intervalMs?: number;
  /**
   * Inject for testing. Defaults to `window.requestAnimationFrame` /
   * `window.cancelAnimationFrame` / `performance.now`.
   */
  raf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
  now?: () => number;
};

export type ThrottledPlayLoop = {
  /** Start (or resume) the throttled rAF loop. Idempotent. */
  play(): void;
  /**
   * Stop the loop and immediately apply the current playhead time
   * (trailing apply so the visible scene matches the audio's final
   * position when rAF cancellation drops the last tick).
   */
  pause(): void;
  /**
   * Apply the current playhead time NOW, bypassing the throttle. Use
   * for `seeked` events — user drags must update the canvas
   * immediately or the scrubber feels broken.
   *
   * Doesn't start the rAF loop; if you want the loop running after
   * a seek, call `play()` separately (the audio element's `play`
   * event handler does this naturally).
   */
  seek(): void;
  /** Stop the loop without applying. Use on unmount. */
  dispose(): void;
};

/**
 * Throttled play-loop driver with seek/pause bypass.
 *
 * State machine:
 *
 *   - `play()`     → start rAF loop. First tick fires immediately
 *                    (lastTickWallClock=0 forces the threshold
 *                    check to true). Subsequent ticks throttle to
 *                    `intervalMs`.
 *   - `pause()`    → cancel rAF, apply current time bypassing
 *                    throttle + dedupe. Idempotent.
 *   - `seek()`     → apply current time bypassing throttle + dedupe.
 *                    Does NOT touch the rAF loop.
 *   - `dispose()`  → cancel rAF only. Use on unmount when you don't
 *                    want a final apply.
 */
export function createThrottledPlayLoop(
  deps: ThrottledPlayLoopDeps
): ThrottledPlayLoop {
  const {
    getTimeMs,
    apply,
    intervalMs = 50,
    raf = (cb) => window.requestAnimationFrame(cb),
    cancelRaf = (id) => window.cancelAnimationFrame(id),
    now = () => performance.now(),
  } = deps;

  let rafId: number | null = null;
  let lastAppliedMs = -1;
  // Initialize to -Infinity so the very first tick after play()
  // always passes the `t - lastTickWallClock >= intervalMs`
  // threshold check. Setting it to 0 would fail the check at t=0
  // (test harness clock starts there).
  let lastTickWallClock = -Infinity;

  function applyOnce(ms: number, force: boolean) {
    if (!force && ms === lastAppliedMs) return;
    lastAppliedMs = ms;
    apply(ms);
  }

  function tick() {
    const t = now();
    if (t - lastTickWallClock >= intervalMs) {
      lastTickWallClock = t;
      applyOnce(getTimeMs(), false);
    }
    rafId = raf(tick);
  }

  return {
    play() {
      if (rafId !== null) return;
      lastTickWallClock = -Infinity; // first tick fires immediately
      rafId = raf(tick);
    },
    pause() {
      if (rafId !== null) {
        cancelRaf(rafId);
        rafId = null;
      }
      // Trailing apply so the visible scene matches the audio's
      // final position. Bypasses dedupe (force=true) since pause is
      // a user-initiated state change.
      applyOnce(getTimeMs(), true);
    },
    seek() {
      applyOnce(getTimeMs(), true);
    },
    dispose() {
      if (rafId !== null) {
        cancelRaf(rafId);
        rafId = null;
      }
    },
  };
}

// -----------------------------------------------------------------
// D. Bbox camera fit with rAF retry
// -----------------------------------------------------------------

/**
 * Compute the scroll values that centre `elements` in a container of
 * the given dimensions. Returns `null` when the math is undefined
 * (no elements, zero-area container, all elements coincident).
 *
 * Identical to the Phase 0e implementation — extracted here for
 * shared use between replay + workspace preview-before-start.
 */
export function computeViewportScroll(args: {
  elements: readonly unknown[];
  containerWidth: number;
  containerHeight: number;
  zoom: number;
}): { scrollX: number; scrollY: number } | null {
  const { elements, containerWidth: cw, containerHeight: ch, zoom } = args;
  if (elements.length === 0 || !(cw > 0 && ch > 0)) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const raw of elements) {
    const el = raw as {
      x?: unknown;
      y?: unknown;
      width?: unknown;
      height?: unknown;
    };
    const x = typeof el.x === "number" ? el.x : Number(el.x);
    const y = typeof el.y === "number" ? el.y : Number(el.y);
    const w = typeof el.width === "number" ? el.width : Number(el.width);
    const h = typeof el.height === "number" ? el.height : Number(el.height);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(w) ||
      !Number.isFinite(h)
    ) {
      continue;
    }
    const xe = x + w;
    const ye = y + h;
    minX = Math.min(minX, x, xe);
    minY = Math.min(minY, y, ye);
    maxX = Math.max(maxX, x, xe);
    maxY = Math.max(maxY, y, ye);
  }

  if (!Number.isFinite(minX) || minX >= maxX || minY >= maxY) {
    return null;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const zoomValue = zoom > 0 ? zoom : 1;
  return {
    scrollX: cw / 2 / zoomValue - centerX,
    scrollY: ch / 2 / zoomValue - centerY,
  };
}

export type CameraFitterDeps = {
  /** Excalidraw API to push the camera-fit appState into. */
  api: ScenePaintApi;
  /**
   * Container element used for measuring the viewport. The fitter
   * reads `getBoundingClientRect()` on each attempt; non-finite
   * dimensions trigger an rAF retry.
   */
  container: { getBoundingClientRect(): DOMRect };
  /**
   * Function that returns the current elements to fit. Called on
   * every attempt so a paint that landed between attempts is
   * reflected in the bbox math.
   */
  getElements: () => readonly unknown[];
  /** Defaults to 1. */
  zoom?: number;
  /** Maximum number of rAF retries before giving up. Defaults to 4. */
  maxRetries?: number;
  /**
   * Optional — called when an attempt (sync or async) successfully fits the
   * camera. Runs at most once per fitter; subsequent retries are skipped.
   * Use to flip a host-owned `cameraReady` flag so subsequent paints know
   * to preserve scroll.
   */
  onFit?: () => void;
  /** Inject for tests. */
  raf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
};

export type CameraFitter = {
  /**
   * Run the camera-fit attempt synchronously. If the synchronous
   * attempt fails (zero-dimension container or null fit), schedules
   * up to `maxRetries` rAF retries.
   *
   * Returns true if the synchronous attempt succeeded, false if
   * retries are scheduled.
   */
  fit(): boolean;
  /** Cancel any pending rAF retries. Use on unmount. */
  dispose(): void;
};

/**
 * Centre the camera on the painted elements. Phase 0e introduced
 * this with a single attempt; commit `e85af9a` added rAF retries
 * because share replay reproduced a layout race where
 * `getBoundingClientRect()` returned 0×0 on the synchronous first
 * attempt (Excalidraw hadn't measured yet).
 *
 * Stops as soon as one attempt produces real dimensions and a
 * non-null fit.
 */
export function createCameraFitter(deps: CameraFitterDeps): CameraFitter {
  const {
    api,
    container,
    getElements,
    zoom = 1,
    maxRetries = 4,
    onFit,
    raf = (cb) => window.requestAnimationFrame(cb),
    cancelRaf = (id) => window.cancelAnimationFrame(id),
  } = deps;

  let pendingRafIds: number[] = [];
  let retriesLeft = maxRetries;
  let success = false;

  function attempt(): boolean {
    if (success) return true;
    const rect = container.getBoundingClientRect();
    const fit = computeViewportScroll({
      elements: getElements(),
      containerWidth: rect.width,
      containerHeight: rect.height,
      zoom,
    });
    if (!fit) return false;
    try {
      // Camera fit: push scroll + zoom only. NEVER push theme or
      // viewBackgroundColor — see file header.
      api.updateScene({
        elements: getElements() as unknown[],
        appState: {
          scrollX: fit.scrollX,
          scrollY: fit.scrollY,
          zoom: { value: zoom },
        },
      });
    } catch {
      return false;
    }
    success = true;
    if (onFit) {
      try {
        onFit();
      } catch {
        // Host-supplied callbacks shouldn't crash the fitter; the engine
        // has already pushed the camera fit successfully.
      }
    }
    return true;
  }

  function scheduleRetry() {
    if (success) return;
    if (retriesLeft <= 0) return;
    retriesLeft -= 1;
    const id = raf(() => {
      if (attempt()) return;
      scheduleRetry();
    });
    pendingRafIds.push(id);
  }

  return {
    fit(): boolean {
      if (attempt()) return true;
      scheduleRetry();
      return false;
    },
    dispose() {
      for (const id of pendingRafIds) cancelRaf(id);
      pendingRafIds = [];
    },
  };
}
