"use client";

/**
 * Shared whiteboard replay player.
 *
 * Used by the admin review page (`/admin/students/[id]/whiteboard/
 * [sessionId]`) AND the share page (`/s/[token]/whiteboard/
 * [sessionId]`). Both pages should mount the same component with
 * different input URLs — that is the entire reason this lives in
 * `components/whiteboard/` and not under either route tree.
 *
 * Inputs are URLs (not pre-fetched JSON), because:
 *   - SSR can't prefetch a Vercel Blob without leaking auth headers
 *     into the public-share path. Both surfaces are fine giving the
 *     client a signed URL and letting the player do the fetch.
 *   - Lets the player display "Loading whiteboard…" -> "Ready" UI
 *     coherently with audio metadata loading.
 *
 * What we render (in dependency order):
 *
 *   1. Fetch + parse events.json from `eventsBlobUrl`.
 *   2. Validate `schemaVersion` against a dispatch table — bumping
 *      the version requires a new `case` here, so an old player can
 *      never silently mis-replay a future log.
 *   3. Pre-warm image asset URLs (best-effort `<link rel=preload>`s)
 *      so the first frame of replay doesn't pop in.
 *   4. Lazy-load Excalidraw (`ssr: false`) in `viewModeEnabled` mode
 *      so the canvas is read-only with pan + pinch-zoom enabled.
 *   5a. AUDIO sessions: mount an audio element. While `playing`, drive a
 *      rAF loop that maps `audio.currentTime * 1000` → reconstructed
 *      scene → `restoreElements` (parity with IndexedDB resume) →
 *      Excalidraw `updateScene`.
 *   5b. NO-AUDIO sessions (events present, no audio segments): a synthetic
 *      wall-clock driven by requestAnimationFrame runs 0 → maxEventTimestampMs,
 *      applying scenes at each tick. Same Play/Pause + scrubber UI as the
 *      audio path so the experience is uniform.
 *   6. Replay uses **the same stroke/fill colours** persisted in the
 *      canonical log (`strokeColor`) so tutors see parity with live
 *      mode; `clientId` remains on elements for diagnostics only.
 *
 * Multi-segment vs single-segment: all audio sessions (1 or N segments)
 * go through the SAME custom player UI — no native <audio controls>.
 * Single-segment is N=1 of the same code path.
 *
 * What this component does NOT do:
 *
 *   - It doesn't know about Prisma. The host page fetches the
 *     `WhiteboardSession` row and hands us URLs.
 *   - It doesn't write the events.json — that's the workspace's job.
 *   - It doesn't decrypt anything. Replay artifacts are stored in
 *     plaintext on Vercel Blob; the URL itself is the auth-gate
 *     (signed share link or admin-only path).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  findLatestViewportAt,
  maxEventTimestampMs,
  type WBElement,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import { parseEventLogBySchema } from "@/lib/whiteboard/replay-parse";
import {
  createCameraFitter,
  createScenePainter,
  createThrottledPlayLoop,
  type ScenePainter,
  type ScenePaintApi,
} from "@/lib/whiteboard/scene-paint";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";
import { attachWebmDurationFix } from "@/lib/audio/webm-duration-fix";
import {
  buildReplayAudioTimeline,
  globalMsToSegmentLocal,
} from "@/lib/whiteboard/replay-audio-timeline";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";
// Note: attachReplayScrubAudioDefer intentionally NOT imported.
// All audio scrubbing now goes through the custom <input type="range"> that
// is rendered for both single-segment and multi-segment sessions.  The native
// <audio controls> are hidden in every path (controls={false}).

/**
 * Excalidraw is heavy (>1 MB gzipped) and grabs a number of browser
 * globals on import. Lazy-loading keeps the share page light for the
 * "audio only" replay case (no whiteboard content recorded).
 */
const Excalidraw = dynamic(
  async () => {
    const mod = await import("@excalidraw/excalidraw");
    await import("@excalidraw/excalidraw/index.css");
    return mod.Excalidraw;
  },
  { ssr: false, loading: () => <PlayerPlaceholder label="Loading whiteboard…" /> }
);

/**
 * Filled by a preload effect once we know we need replay + Excalidraw.
 * Kept separate from lightweight `replay-parse.ts` so Jest never imports Excali ESM.
 */
let replayCachedRestoreElements:
  | (typeof import("@excalidraw/excalidraw"))["restoreElements"]
  | null = null;

/**
 * Minimal structural type for the bits of `ExcalidrawImperativeAPI`
 * we touch from the replay player. Mirrors the shape used by the
 * tutor workspace + insert helpers.
 */
type ReplayApi = {
  updateScene: (data: {
    elements?: ReadonlyArray<unknown>;
    appState?: Record<string, unknown>;
  }) => void;
  getAppState?: () => Record<string, unknown>;
  refresh?: () => void;
  addFiles: (
    files: Array<{
      id: string;
      mimeType: "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp" | "image/gif";
      dataURL: string;
      created: number;
    }>
  ) => void;
};

/** One ordered slice of session audio on the continuous replay timeline. */
export type ReplayAudioSegment = {
  url: string;
  mimeType?: string | null;
  durationSeconds?: number | null;
};

export type WhiteboardReplayProps = {
  /** Public-or-signed URL to the events.json on Vercel Blob. */
  eventsBlobUrl: string;
  /**
   * Ordered session audio segments (concatenated back-to-back in replay).
   * When set, drives the full continuous timeline; prefer over `audioBlobUrl`.
   */
  audioSegments?: readonly ReplayAudioSegment[] | null;
  /** @deprecated Use `audioSegments` — kept for single-segment callers/tests. */
  audioBlobUrl?: string | null;
  /** @deprecated Use per-segment `mimeType` in `audioSegments`. */
  audioMimeType?: string | null;
  /** Optional URL to a final-snapshot PNG (preview before play). */
  snapshotBlobUrl?: string | null;
  /** Display label, e.g. "Recording of Liam's session, Apr 23 2026". */
  title?: string;
  /**
   * When set, private Vercel Blob image assets are proxied through
   * `/api/whiteboard/[id]/tutor-asset?u=...` (authenticated via session
   * cookie) instead of being fetched directly (which returns 403).
   * Pass the `whiteboardSessionId` from the review page.
   */
  whiteboardSessionId?: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; log: WBEventLog }
  | { kind: "error"; message: string };

export default function WhiteboardReplay(props: WhiteboardReplayProps) {
  const {
    eventsBlobUrl,
    audioSegments,
    audioBlobUrl,
    audioMimeType,
    snapshotBlobUrl,
    title,
    whiteboardSessionId,
  } = props;

  const effectiveSegments = useMemo((): ReplayAudioSegment[] => {
    if (audioSegments && audioSegments.length > 0) {
      return [...audioSegments];
    }
    if (audioBlobUrl) {
      return [
        {
          url: audioBlobUrl,
          mimeType: audioMimeType ?? null,
          durationSeconds: null,
        },
      ];
    }
    return [];
  }, [audioSegments, audioBlobUrl, audioMimeType]);

  const hasAudio = effectiveSegments.length > 0;
  const audioTimeline = useMemo(
    () =>
      buildReplayAudioTimeline(
        effectiveSegments.map((s) => s.durationSeconds)
      ),
    [effectiveSegments]
  );

  // -----------------------------------------------------------------
  // Memoize resolveAssetUrl. Before May 15 evening, this was created
  // inline on every render. Every play-loop tick fires
  // `setAudioElapsedMs(ms)` → React re-render → new `resolveAssetUrl`
  // identity → new `applySceneAt` identity (it lists resolveAssetUrl
  // in its deps) → the audio-driven loop useEffect tears down the
  // existing throttled play loop and creates a fresh IDLE one. The
  // new loop never receives the `play` event (already fired) so it
  // sits doing nothing while the audio keeps playing. The scene
  // stays frozen until the audio's `ended` event fires the
  // trailing-apply branch of `pause()`, which paints all strokes at
  // once at t=duration — the "strokes only show up at the end"
  // pilot symptom. Memoizing here keeps `applySceneAt` stable so
  // the loop survives across renders.
  // -----------------------------------------------------------------
  const resolveAssetUrl = useMemo(
    () =>
      whiteboardSessionId
        ? (raw: string) =>
            resolveWhiteboardAssetReadUrl(raw, {
              kind: "tutor",
              whiteboardSessionId,
            })
        : undefined,
    [whiteboardSessionId]
  );

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [api, setApi] = useState<ReplayApi | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [audioElapsedMs, setAudioElapsedMs] = useState(0);
  /** True while playback is active (audio element playing OR synth clock running). */
  const [playing, setPlaying] = useState(false);
  /**
   * `restoreElements` lives in `@excalidraw/excalidraw` ESM. We preload once we
   * know the replay surface needs canvas + parse is done — before mounting
   * `<Excalidraw />`, so every `applySceneAt` runs synchronously.
   */
  const [replayExcaliRestoreReady, setReplayExcaliRestoreReady] =
    useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Active segment index for multi-segment source-swap playback. */
  const activeSegmentIndexRef = useRef(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  /**
   * Cumulative global-clock ms at the START of the currently active segment.
   * Updated on every `seekGlobalMs` call and on every `onEnded` advance
   * (accumulated from actual audio.duration so this stays correct even when
   * stored durationSeconds is null).
   *
   * Using a ref (not state) so the rAF tick's `getGlobalTimeMs` always reads the
   * latest value without causing extra renders.
   */
  const globalSegmentOffsetMsRef = useRef(0);
  /**
   * True between `loadSegmentAt`'s `el.src =` assignment and the `loadedmetadata`
   * handler calling `el.play()`.  During this window the browser may fire a
   * spurious `pause` event (from `el.load()`).  `onPause` checks this flag and
   * skips its `setPlaying(false)` call so the button label remains "Pause"
   * throughout seamless segment transitions.
   */
  const segmentSwappingRef = useRef(false);
  /** Excalidraw may clear scene on `updateScene({ appState })`; re-send last paint. */
  const lastSceneElementsRef = useRef<readonly unknown[]>([]);
  /**
   * Which `excalidrawAPI` instance has received the "initial" scene apply.
   * Reset when the event log URL changes so a new recording repaints even if
   * Excalidraw reuses the same API object reference.
   */
  const initialPaintApiRef = useRef<ReplayApi | null>(null);
  /**
   * The `hasAudio` value that was current when `initialPaintApiRef` was last set.
   * If `hasAudio` changes (e.g. async props load) we must re-run the initial paint
   * even for the same API instance — otherwise the no-audio final-frame paint
   * persists after audio segments arrive, causing the "initial final-state flash"
   * defect (user sees FINAL scene before t=0 on first Play press).
   */
  const initialPaintHasAudioRef = useRef(false);
  /** After the delayed viewport fit, scene updates preserve Excal scroll. */
  const replayCameraReadyRef = useRef(false);
  /** Bumps after initial fit so the theme-only effect can merge without clobbering early. */
  const [replayViewportSeq, setReplayViewportSeq] = useState(0);
  /** Image URLs already passed to Excalidraw `addFiles` for this loaded log. */
  const registeredAssetUrlsRef = useRef<Set<string>>(new Set());
  const excalCanvasContainerRef = useRef<HTMLDivElement | null>(null);
  /**
   * Pillar-4 scene-paint engine instance for the current `(api, log)` pair.
   * Recreated when either changes; encapsulates the canonical scene
   * reconstruction + restoreElements + sanitize + scroll-preserve logic
   * shared with the workspace.
   */
  const scenePainterRef = useRef<ScenePainter | null>(null);

  // Synthetic clock refs (no-audio sessions only).
  // The rAF id returned by requestAnimationFrame — 0 means not running.
  const synthAnimFrameRef = useRef(0);
  // Elapsed ms at the moment the synth clock was last started (Play button).
  const synthStartElapsedMsRef = useRef(0);

  const excalidrawTheme = useExcalidrawThemeFromSystem();

  const activeSegment =
    effectiveSegments[activeSegmentIndex] ?? effectiveSegments[0] ?? null;
  const replayAudioMime = useMemo(
    () => activeSegment?.mimeType?.split(";")[0].trim().toLowerCase(),
    [activeSegment?.mimeType]
  );

  // -----------------------------------------------------------------
  // 1. Fetch + parse + schema-version dispatch
  // -----------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    lastSceneElementsRef.current = [];
    initialPaintApiRef.current = null;
    initialPaintHasAudioRef.current = false;
    registeredAssetUrlsRef.current.clear();
    replayCameraReadyRef.current = false;
    setReplayViewportSeq(0);
    setLoadState({ kind: "loading" });
    (async () => {
      try {
        // Same-origin admin proxy (`/api/whiteboard/.../events`) requires the
        // tutor session cookie. `omit` strips cookies; the server then cannot
        // authenticate and may return HTML → JSON.parse fails with the generic
        // "isn't a valid whiteboard event log" message (Apr 24 2026 repro).
        const res = await fetch(eventsBlobUrl, {
          credentials: credentialsForReplayFetch(eventsBlobUrl),
        });
        if (!res.ok) {
          // Best-effort: try to read the proxy's `{ error }` JSON so
          // we surface the server's friendly copy. If that fails too,
          // fall back to a generic message — never let the raw HTML
          // body bubble into the UI.
          const friendly = await readJsonError(res);
          throw new Error(
            friendly ??
              `Could not load whiteboard events (status ${res.status}).`
          );
        }
        // Defensive parse: read as text first so a non-JSON body
        // (HTML error page, login redirect, etc.) becomes a clean
        // human message instead of "Unexpected token '<'..." which
        // is what tutors used to see when the proxy or Blob returned
        // HTML 200 (Sarah's Apr 24 repro on a stale session URL).
        const text = await res.text();
        let raw: { schemaVersion?: unknown };
        try {
          raw = JSON.parse(text) as { schemaVersion?: unknown };
        } catch {
          throw new Error(
            "The recording file isn't a valid whiteboard event log. " +
              "It may have been deleted, or the storage backend is " +
              "misconfigured."
          );
        }
        if (typeof raw.schemaVersion !== "number") {
          throw new Error("Whiteboard events file is missing schemaVersion.");
        }
        const log = parseEventLogBySchema(raw);
        if (cancelled) return;
        setLoadState({ kind: "ready", log });
      } catch (err) {
        if (cancelled) return;
        setLoadState({
          kind: "error",
          message: (err as Error)?.message ?? "Could not load events.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventsBlobUrl]);

  // -----------------------------------------------------------------
  // 2. Pre-warm image assets
  //
  // We don't display them ourselves — Excalidraw fetches them through
  // its own loader when an `image` element first appears on screen.
  // But on Stop-button replay, every image element appears at t=0,
  // and a synchronous fetch storm freezes the audio bar. Pre-warming
  // via in-flight `<img>` decodes lets the browser cache them in
  // parallel before the play loop hits.
  // -----------------------------------------------------------------

  useEffect(() => {
    if (loadState.kind !== "ready") return;
    const rawUrls = collectAssetUrls(loadState.log);
    if (rawUrls.length === 0) return;
    const urls = resolveAssetUrl ? rawUrls.map(resolveAssetUrl) : rawUrls;
    const cleanups: Array<() => void> = [];
    for (const url of urls) {
      const img = new window.Image();
      img.decoding = "async";
      img.src = url;
      // No-op handlers; the browser caches the response either way.
      img.onload = img.onerror = () => undefined;
      cleanups.push(() => {
        img.onload = null;
        img.onerror = null;
      });
    }
    return () => cleanups.forEach((c) => c());
  }, [loadState, resolveAssetUrl]);

  // Preload `restoreElements` before we mount Excalidraw (same library chunk,
  // but `dynamic()` defers ours until first paint scheduling).
  useEffect(() => {
    if (loadState.kind !== "ready") {
      setReplayExcaliRestoreReady(false);
      return undefined;
    }
    const needsExcalCanvas =
      loadState.log.events.length > 0 || hasAudio;
    if (!needsExcalCanvas) {
      setReplayExcaliRestoreReady(false);
      return undefined;
    }
    let cancelled = false;
    void import("@excalidraw/excalidraw").then((m) => {
      replayCachedRestoreElements = m.restoreElements;
      if (!cancelled) setReplayExcaliRestoreReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hasAudio, loadState]);

  // -----------------------------------------------------------------
  // 3. Apply scene at currentTime — both at first paint AND when the
  // audio element seeks/plays.
  //
  // We compute a fresh canonical Map<id, WBElement> via
  // reconstructSceneAt (fast — 3000 events ~= 1 ms) and push the
  // entire scene into `excalidrawAPI.updateScene`. Excalidraw's diff
  // is internal (it compares element ids + version stamps), so
  // resending unchanged elements is cheap.
  //
  // We also register inline image dataURLs lazily: when an element
  // with `assetUrl` first appears, we kick off a fetch + addFiles so
  // Excalidraw can render it. (Without this, Excalidraw would render
  // the bounding box but no bitmap.)
  // -----------------------------------------------------------------

  // Build (or rebuild) the scene-paint engine when the `(api, log)` pair
  // changes. The engine encapsulates restoreElements / adapter / sanitize /
  // scroll-preserve so any whiteboard surface (replay, workspace resume,
  // future preview-before-start) gets the same paint pipeline. See
  // `src/lib/whiteboard/scene-paint.ts` for the contract.
  useEffect(() => {
    if (loadState.kind !== "ready" || !api) {
      scenePainterRef.current = null;
      return;
    }
    scenePainterRef.current = createScenePainter({
      log: loadState.log,
      api: api as ScenePaintApi,
      restoreElements: replayCachedRestoreElements ?? undefined,
      registeredAssetUrls: registeredAssetUrlsRef.current,
    });
  }, [api, loadState]);

  const applySceneAt = useCallback(
    (timeMs: number) => {
      if (loadState.kind !== "ready" || !api) return;
      const painter = scenePainterRef.current;
      if (!painter) return;
      // Phase 5 task 8 (replay viewport tier-c-lite): find the most recent
      // `viewport` event ≤ timeMs. When present, the painter pushes it
      // atomically with the scene elements so the camera moves in lockstep
      // with strokes. When absent (pre-feature logs, or the first frames
      // of a recording before the anchor `viewport` event lands), we fall
      // back to the engine's `preserveScroll` behaviour — which keeps
      // whatever scroll the camera-fitter set on first paint.
      const vp = findLatestViewportAt(loadState.log, timeMs);
      const result = painter.applyAt(timeMs, {
        preserveScroll: vp ? false : replayCameraReadyRef.current,
        viewportOverride: vp ?? undefined,
      });
      lastSceneElementsRef.current = result.paintedElements;
      // Once a viewport event has driven the camera, treat the camera as
      // "ready" so any future tick with no viewport event still preserves
      // scroll (otherwise reverting to camera-fit math would jump the camera
      // on every empty-frame tick).
      if (vp && !replayCameraReadyRef.current) {
        replayCameraReadyRef.current = true;
        setReplayViewportSeq((n) => n + 1);
      }
      // Kick off image fetches in the background — Excalidraw will
      // call `getFiles()` or look in `BinaryFiles` on next render
      // tick, and addFiles is what populates that.
      if (result.newAssetUrls.length > 0) {
        const resolvedAssetUrls = resolveAssetUrl
          ? result.newAssetUrls.map(resolveAssetUrl)
          : result.newAssetUrls;
        void registerImageAssets(
          api,
          result.scene,
          resolvedAssetUrls,
          result.newAssetUrls,
        );
      }
    },
    [api, loadState, resolveAssetUrl]
  );

  // First paint after Excalidraw mount **for this API instance**.
  //
  // Excalidraw may invoke `excalidrawAPI` more than once (internal remounts).
  // A bare `api` guard wrongly skipped subsequent instances, leaving a blank
  // canvas despite a loaded log.
  //
  // Guard: skip if BOTH the api instance AND hasAudio match the last paint.
  // If hasAudio changes (e.g. props loaded async after initial render), we
  // must repaint even for the same API instance, or the no-audio final-frame
  // paint persists — causing the "initial final-state flash" defect where
  // the FINAL scene briefly shows before t=0 when the user presses Play.
  //
  // With audio: always start at t=0 (audio element drives the clock from 0).
  // With no audio + events: start at t=0 (synthetic clock drives from 0).
  // With no audio + no events: show final frame (log navigation only).
  useEffect(() => {
    if (loadState.kind !== "ready" || !api) return;
    if (
      initialPaintApiRef.current === api &&
      initialPaintHasAudioRef.current === hasAudio
    ) {
      return;
    }
    initialPaintApiRef.current = api;
    initialPaintHasAudioRef.current = hasAudio;
    replayCameraReadyRef.current = false;

    const log = loadState.log;
    const finalClockMs = Math.max(log.durationMs, maxEventTimestampMs(log));
    // For sessions with audio OR events (either drives a clock), start at t=0.
    // For empty no-audio sessions (no clock, just static log navigation), show
    // the final frame — there's nothing to "play back" in that case.
    const noSessionAudio = !hasAudio;
    const hasEvents = log.events.length > 0;
    const initialT = noSessionAudio && !hasEvents ? finalClockMs : 0;
    applySceneAt(initialT);
    setAudioElapsedMs(initialT);

    const container = excalCanvasContainerRef.current;
    if (!container) return;

    // Phase 5 task 8 (replay viewport tier-c-lite): if the log carries a
    // viewport event at or before initialT, applySceneAt above already
    // pushed it via the painter's viewportOverride path and
    // replayCameraReadyRef is true. Skip camera-fit in that case so we
    // don't fight the tutor's recorded camera on first paint.
    if (replayCameraReadyRef.current) {
      return;
    }

    // Phase 1a: camera fit + rAF retry now lives in the scene-paint
    // engine. Same behaviour as the old inline impl (Phase 0e):
    // synchronous attempt → if measure returns 0×0, schedule rAF
    // retries until measure succeeds or `maxRetries` runs out.
    // `onFit` flips the local "preserve scroll on subsequent paints"
    // flag whichever attempt wins.
    const fitter = createCameraFitter({
      api: api as ScenePaintApi,
      container,
      getElements: () => lastSceneElementsRef.current,
      zoom: 1,
      onFit: () => {
        replayCameraReadyRef.current = true;
        setReplayViewportSeq((n) => n + 1);
      },
    });
    fitter.fit();

    return () => {
      fitter.dispose();
    };
  }, [api, hasAudio, loadState, applySceneAt]);

  const applySceneAtRef = useRef(applySceneAt);
  useEffect(() => {
    applySceneAtRef.current = applySceneAt;
  }, [applySceneAt]);

  const loadSegmentAt = useCallback(
    (segmentIndex: number, localMs: number, autoplay: boolean) => {
      const el = audioRef.current;
      const seg = effectiveSegments[segmentIndex];
      if (!el || !seg) return;

      const needsSrcSwap =
        activeSegmentIndexRef.current !== segmentIndex ||
        el.getAttribute("src") !== seg.url;

      activeSegmentIndexRef.current = segmentIndex;
      setActiveSegmentIndex(segmentIndex);
      setAudioReady(false);

      const seekSec = Math.max(0, localMs / 1000);
      const applySeek = () => {
        try {
          el.currentTime = seekSec;
        } catch {
          // Best-effort; metadata may not be ready on all browsers.
        }
        if (autoplay) {
          void el.play();
        }
      };

      if (needsSrcSwap) {
        // Flag: suppress the spurious `pause` event that el.load() may fire.
        // onPause skips setPlaying(false) while this flag is set so the
        // button label stays "Pause" during seamless segment transitions.
        segmentSwappingRef.current = true;
        el.src = seg.url;
        const onMeta = () => {
          el.removeEventListener("loadedmetadata", onMeta);
          // Clear the flag before calling play() so the subsequent `play`
          // event (and any future `pause` from user action) is processed normally.
          segmentSwappingRef.current = false;
          applySeek();
        };
        el.addEventListener("loadedmetadata", onMeta);
        el.load();
      } else {
        applySeek();
      }
    },
    [effectiveSegments]
  );

  const seekGlobalMs = useCallback(
    (globalMs: number, autoplay: boolean) => {
      const { segmentIndex, localMs } = globalMsToSegmentLocal(
        globalMs,
        audioTimeline
      );
      // Always track global offset so getGlobalTimeMs() works for both
      // single-segment (offset stays 0 for seg 0) and multi-segment.
      globalSegmentOffsetMsRef.current = globalMs - localMs;
      setAudioElapsedMs(globalMs);
      applySceneAtRef.current(globalMs);
      loadSegmentAt(segmentIndex, localMs, autoplay);
    },
    [audioTimeline, loadSegmentAt]
  );

  // Reset to segment 0 when the segment list changes (new session).
  useEffect(() => {
    activeSegmentIndexRef.current = 0;
    setActiveSegmentIndex(0);
    globalSegmentOffsetMsRef.current = 0;
    segmentSwappingRef.current = false;
    setPlaying(false);
    // Cancel any synthetic clock that may be running for a previous session.
    if (synthAnimFrameRef.current !== 0) {
      cancelAnimationFrame(synthAnimFrameRef.current);
      synthAnimFrameRef.current = 0;
    }
    synthStartElapsedMsRef.current = 0;
    if (!hasAudio || !replayExcaliRestoreReady) return;
    const el = audioRef.current;
    if (!el) return;
    const first = effectiveSegments[0];
    if (!first) return;
    if (el.getAttribute("src") !== first.url) {
      el.src = first.url;
      setAudioReady(false);
    }
  }, [effectiveSegments, hasAudio, replayExcaliRestoreReady]);

  // -----------------------------------------------------------------
  // 4. WebM duration fix — separated from the main audio loop effect.
  //
  // Previously this lived inside the main rAF loop effect, which made
  // `replayAudioMime` a dependency of that effect. When `activeSegmentIndex`
  // state updated on a segment advance (via `setActiveSegmentIndex` inside
  // `loadSegmentAt`), `replayAudioMime` changed if segments have different
  // mime types, causing the entire main audio loop effect to teardown and
  // recreate mid-playback — the root cause of the segment-boundary
  // "Replay time" label flicker and scene jump.
  //
  // Moving it here keeps the mime-change response isolated to the lightweight
  // WebM hack only.  The main loop effect no longer depends on mime.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!hasAudio || !replayExcaliRestoreReady) return;
    const el = audioRef.current;
    if (!el) return;
    const detach = attachWebmDurationFix(el, replayAudioMime, {
      onMetadataLoaded: () => setAudioReady(true),
    });
    return detach;
  }, [hasAudio, replayAudioMime, replayExcaliRestoreReady]);

  // -----------------------------------------------------------------
  // 5. Audio-driven scene loop. We use rAF (not setInterval) so the
  // scene update lands inside the browser's paint cycle — feels
  // smoother and stays in sync with the audio scrubber's repaint.
  //
  // Defensive: stash the latest `applySceneAt` in a ref so the loop's
  // `apply` closure reads the current implementation without forcing
  // the effect to re-run when applySceneAt's identity changes. Prior
  // to May 15 evening, applySceneAt was in this effect's dep array,
  // which combined with a non-memoized resolveAssetUrl re-created the
  // throttled play loop on every render. Each newly-minted loop
  // started in the IDLE state (the audio's `play` event had already
  // fired and only attaches to the latest loop AFTER its next play
  // press), so scenes stopped updating mid-playback. The ref pattern
  // here makes the loop survive any future dep churn upstream.
  //
  // `replayAudioMime` intentionally NOT in deps — it was removed to
  // prevent the main loop from restarting when the active segment's
  // mime changes. The WebM duration fix now lives in its own effect.
  // -----------------------------------------------------------------

  useEffect(() => {
    if (loadState.kind !== "ready") return;
    if (!hasAudio) return;
    // `replayExcaliRestoreReady` gates when the audio JSX is rendered
    // (see render branch below). Bail before that flip; the effect
    // re-runs once it becomes true and the audio element is in the DOM.
    if (!replayExcaliRestoreReady) return;
    const el = audioRef.current;
    if (!el) return;

    const getGlobalTimeMs = () => {
      const localMs = Math.floor(el.currentTime * 1000);
      // globalSegmentOffsetMsRef holds the accumulated global ms at the
      // start of the active segment. Updated by seekGlobalMs (on seek) and
      // by onEnded (on segment advance from actual audio.duration). Works
      // correctly for both single-segment (offset stays 0) and multi-segment.
      return globalSegmentOffsetMsRef.current + localMs;
    };

    // Phase 1a: 20Hz throttled play loop with seek/pause bypass now lives
    // in the scene-paint engine. The driver throttles paints to ≈50ms so
    // the audio scrubber stays responsive on long recordings; user-initiated
    // changes (seek, pause) bypass the throttle. See `createThrottledPlayLoop`.
    const loop = createThrottledPlayLoop({
      getTimeMs: getGlobalTimeMs,
      apply: (ms) => {
        setAudioElapsedMs(ms);
        applySceneAtRef.current(ms);
      },
    });

    const onPlay = () => {
      setPlaying(true);
      loop.play();
    };
    const onPause = () => {
      // Suppress `pause` events that fire from el.load() during a segment
      // source-swap.  The browser may fire `pause` when load() aborts the
      // current source; ignoring it keeps the button label as "Pause"
      // throughout the loading window and lets the audio resume automatically.
      if (segmentSwappingRef.current) return;
      setPlaying(false);
      loop.pause();
    };

    const onEnded = () => {
      // el.ended is true only when the audio naturally reached its end.
      // Guard against spurious `ended` events that some browsers fire
      // on el.load() or el.src= changes — in those cases the element
      // has not actually finished playing.
      if (!el.ended) return;

      // Accumulate the global offset from the actual audio element duration
      // so subsequent ticks of getGlobalTimeMs() continue from the right
      // position. Use audio.duration (real metadata) first; fall back to
      // the stored timeline value only if audio.duration is unavailable.
      const actualDurationMs =
        Number.isFinite(el.duration) && el.duration > 0
          ? Math.round(el.duration * 1000)
          : (audioTimeline.segmentDurationsMs[activeSegmentIndexRef.current] ?? 0);
      globalSegmentOffsetMsRef.current += actualDurationMs;

      // Advance to the next segment if one exists.
      // Do NOT skip zero-stored-duration segments — a stored duration of 0
      // means "unknown" (null in DB), not "empty". The previous code's
      // while-skip caused all segments to be bypassed when durationSeconds
      // is null, preventing segment 2+ from ever playing.
      const next = activeSegmentIndexRef.current + 1;
      if (next < effectiveSegments.length) {
        loadSegmentAt(next, 0, true);
        loop.play();
        return;
      }

      // ── End of timeline: clean stop ──
      // Do NOT call loadSegmentAt or advance further. Record the exact end
      // position from the accumulated offset so the scrubber rests at the
      // true end, not a segment boundary mid-point.
      const endMs = globalSegmentOffsetMsRef.current;
      setPlaying(false);
      setAudioElapsedMs(endMs);
      applySceneAtRef.current(endMs);
      loop.pause();
    };

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    return () => {
      loop.dispose();
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [
    audioTimeline,
    effectiveSegments,
    hasAudio,
    loadSegmentAt,
    // NOTE: `replayAudioMime` intentionally omitted — moved to its own effect
    // to prevent the main loop from restarting on segment-mime changes, which
    // was the root cause of the segment-boundary scene jump and label flicker.
    // NOTE: `applySceneAt` intentionally omitted — consumed via applySceneAtRef.
    loadState,
    replayExcaliRestoreReady,
  ]);

  // -----------------------------------------------------------------
  // 6. Synthetic wall-clock for no-audio sessions with events.
  //
  // When a session has whiteboard events but no audio segments, we run
  // a requestAnimationFrame loop from t=0 → maxEventTimestampMs(log),
  // applying scenes at each tick exactly as the audio-driven path does.
  // The same Play/Pause button + scrubber UI renders for both paths.
  //
  // The synthetic clock is controlled by the Play/Pause button's onClick
  // (see render section) which writes to synthAnimFrameRef directly.
  // This effect only handles cleanup on unmount / session change.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (hasAudio || loadState.kind !== "ready") return;
    // Cleanup synthetic clock when session or hasAudio changes.
    return () => {
      if (synthAnimFrameRef.current !== 0) {
        cancelAnimationFrame(synthAnimFrameRef.current);
        synthAnimFrameRef.current = 0;
      }
    };
  }, [hasAudio, loadState]);

  /**
   * Theme is driven entirely by the `theme` prop on `<Excalidraw />`.
   * We deliberately do NOT push `theme` or `viewBackgroundColor` via
   * `updateScene` — Excalidraw resets `viewBackgroundColor` whenever
   * elements transition empty→non-empty in view mode, which causes a
   * dark canvas to flash white at the first stroke (Andrew repro
   * 2026-05-09). Mirrors the workspace, which never pushes these via
   * updateScene either and stays correctly themed throughout a session.
   *
   * `replayViewportSeq` increment from the camera-fit effect is kept as
   * a hook for future scroll-preservation needs; no side-effect today.
   */
  useEffect(() => {
    void replayViewportSeq;
  }, [api, replayViewportSeq]);

  // -----------------------------------------------------------------
  // 7. Render
  // -----------------------------------------------------------------

  if (loadState.kind === "loading") {
    return <PlayerPlaceholder label="Loading whiteboard recording…" />;
  }
  if (loadState.kind === "error") {
    return (
      <div role="alert" className="card" style={{ padding: 16 }}>
        Could not load whiteboard recording: {loadState.message}
      </div>
    );
  }

  const log = loadState.log;
  /** Wall clock for "end of log" — never below the last event `t` or audio span. */
  const finalReplayClockMs = Math.max(
    log.durationMs,
    maxEventTimestampMs(log),
    hasAudio ? audioTimeline.totalMs : 0
  );

  /** Ceiling for the no-audio synthetic clock: last event's timestamp. */
  const noAudioMaxMs = Math.max(maxEventTimestampMs(log), log.durationMs, 1);

  // Empty-events case: the session row exists and the events.json is
  // valid (schemaVersion + startedAt + events array), but no events
  // were ever recorded. This is the steady state for a session that
  // was ended via the Resume-or-End gate (Sarah's pilot fix, Apr
  // 2026) — the recorder hook never mounted in that path, so the
  // empty placeholder events.json is what's on disk.
  //
  // Render a clear "nothing was recorded" card instead of an empty
  // Excalidraw canvas with no explanation. The host page still
  // shows the notes panel below this, so the tutor isn't dead-ended.
  if (log.events.length === 0 && !hasAudio) {
    return (
      <div className="card" style={{ padding: 16 }} data-testid="wb-replay-empty">
        <h3 style={{ margin: 0, fontSize: 15 }}>
          {title ?? "Whiteboard session"}
        </h3>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
          No whiteboard activity was recorded for this session.{" "}
          {log.durationMs > 0
            ? `The session was ended (${formatDurationMs(log.durationMs)} elapsed) without any drawing or audio.`
            : "The session was ended before any drawing or audio was captured."}
        </p>
      </div>
    );
  }

  const needsReplayExcalCanvas =
    log.events.length > 0 || hasAudio;
  if (needsReplayExcalCanvas && !replayExcaliRestoreReady) {
    return (
      <PlayerPlaceholder label="Preparing whiteboard replay engine…" />
    );
  }

  // ── Play controls renderers ──────────────────────────────────────
  //
  // Unified for ALL paths: audio sessions (1 or N segments) and no-audio
  // events-only sessions. Both expose the same Play/Pause button + scrubber.
  //
  // Audio sessions use the hidden <audio> element as the clock.
  // No-audio sessions use the synthetic rAF clock written directly into
  // audioElapsedMs state (same state variable, same scrubber binding).

  /**
   * Starts the synthetic wall-clock from `startMs`, cancelling any running
   * clock first.  Used by the no-audio Play button and scrubber onPointerUp.
   * Defined inline in render to close over the current `noAudioMaxMs` and
   * stable React setters; refs are accessed by reference so the tick closure
   * always sees the latest values.
   */
  const startSynthFrom = (startMs: number) => {
    if (synthAnimFrameRef.current !== 0) {
      cancelAnimationFrame(synthAnimFrameRef.current);
      synthAnimFrameRef.current = 0;
    }
    const clampedStart = Math.min(Math.max(0, startMs), noAudioMaxMs);
    synthStartElapsedMsRef.current = clampedStart;
    setPlaying(true);
    let firstTs: number | null = null;
    const tick = (now: DOMHighResTimeStamp) => {
      if (firstTs === null) firstTs = now;
      const elapsed = clampedStart + (now - firstTs);
      const clamped = Math.min(elapsed, noAudioMaxMs);
      setAudioElapsedMs(clamped);
      applySceneAtRef.current(clamped);
      if (clamped < noAudioMaxMs) {
        synthAnimFrameRef.current = requestAnimationFrame(tick);
      } else {
        synthAnimFrameRef.current = 0;
        setPlaying(false);
      }
    };
    synthAnimFrameRef.current = requestAnimationFrame(tick);
  };

  const stopSynth = () => {
    if (synthAnimFrameRef.current !== 0) {
      cancelAnimationFrame(synthAnimFrameRef.current);
      synthAnimFrameRef.current = 0;
    }
    synthStartElapsedMsRef.current = audioElapsedMs;
    setPlaying(false);
  };

  /** Scrubber max value — covers both audio and no-audio paths. */
  const scrubberMax = hasAudio
    ? Math.max(audioTimeline.totalMs, finalReplayClockMs, 1)
    : noAudioMaxMs;

  /** Click handler for the Play/Pause button (audio path). */
  const handleAudioPlayToggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      // User explicitly pausing: clear swap flag so onPause processes normally.
      segmentSwappingRef.current = false;
      setPlaying(false); // Instant UI update; onPause echo is harmless.
      el.pause();
    } else {
      setPlaying(true); // Instant UI update; onPlay echo is harmless.
      void el.play();
    }
  };

  /** Click handler for the Play/Pause button (no-audio synthetic clock path). */
  const handleSynthPlayToggle = () => {
    if (playing) {
      stopSynth();
    } else {
      // Restart from 0 if reached the end.
      const startFrom = audioElapsedMs >= noAudioMaxMs ? 0 : audioElapsedMs;
      if (startFrom === 0) {
        setAudioElapsedMs(0);
        applySceneAtRef.current(0);
      }
      startSynthFrom(startFrom);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="wb-replay">
      {title && (
        <h2 style={{ margin: 0, fontSize: 18 }}>
          {title}
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            schema v{log.schemaVersion} · {(log.events.length).toLocaleString()}{" "}
            events · {formatDurationMs(finalReplayClockMs)}
          </span>
        </h2>
      )}

      {/* ── Playback controls ───────────────────────────────────────
          Unified UI for audio sessions (1 or N segments) and no-audio
          events-only sessions.  The <audio> element is always hidden
          (controls={false}); the custom Play/Pause + range below drives
          both paths.  Single-segment sessions go through the same code
          as multi-segment — N=1 is just the degenerate case.
      ── */}
      {(hasAudio || log.events.length > 0) && (
        <div style={{ display: "grid", gap: 4 }}>
          {hasAudio && (
            <audio
              ref={audioRef}
              controls={false}
              preload="metadata"
              src={effectiveSegments[0]?.url}
              {...(replayAudioMime ? { type: replayAudioMime } : {})}
              data-testid="wb-replay-audio"
              style={{ display: "none" }}
            />
          )}
          <div
            className="row"
            style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}
          >
            {/* Fixed-width button: min-width sized for the wider label ("Pause")
                so the button never changes width between Play↔Pause, which
                previously shifted the scrubber track and moved the dot. */}
            <button
              type="button"
              className="btn"
              data-testid="wb-replay-play-toggle"
              style={{ minWidth: 72 }}
              onClick={hasAudio ? handleAudioPlayToggle : handleSynthPlayToggle}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={scrubberMax}
              value={audioElapsedMs}
              data-testid="wb-replay-global-seek"
              aria-label="Replay position"
              style={{ flex: 1, minWidth: 160 }}
              onChange={(ev) => {
                const ms = Number(ev.target.value);
                if (hasAudio) {
                  seekGlobalMs(ms, false);
                } else {
                  // No-audio: pause synth clock and update position visually.
                  if (synthAnimFrameRef.current !== 0) {
                    cancelAnimationFrame(synthAnimFrameRef.current);
                    synthAnimFrameRef.current = 0;
                  }
                  synthStartElapsedMsRef.current = ms;
                  setAudioElapsedMs(ms);
                  applySceneAtRef.current(ms);
                  if (playing) setPlaying(false);
                }
              }}
              onPointerUp={(ev) => {
                const ms = Number((ev.target as HTMLInputElement).value);
                if (hasAudio) {
                  seekGlobalMs(ms, !audioRef.current?.paused);
                } else {
                  // Finalize position; resume playback if clock was running.
                  synthStartElapsedMsRef.current = ms;
                  setAudioElapsedMs(ms);
                  applySceneAtRef.current(ms);
                  // Resume only if we were actually playing before the scrub.
                  // `playing` in the closure reflects the state at render time;
                  // since onChange above set playing=false on drag start, we
                  // don't auto-resume here (keeps the UX simple: scrub pauses,
                  // user presses Play to continue).
                }
              }}
            />
          </div>
          {hasAudio && !audioReady && (
            <span className="muted" style={{ fontSize: 11 }}>
              Audio loading… you can press Play once it&apos;s ready.
            </span>
          )}
        </div>
      )}

      <div className="muted" style={{ fontSize: 11, textAlign: "right" }}>
        Replay time · t={formatDurationMs(audioElapsedMs)}
        <span className="muted" style={{ marginLeft: 8 }}>
          Session log span · {formatDurationMs(finalReplayClockMs)}
        </span>
      </div>

      <div
        ref={excalCanvasContainerRef}
        data-replay-viewport-metrics=""
        style={{ height: "calc(100vh - 320px)", minHeight: 420 }}
      >
        <Excalidraw
          viewModeEnabled
          gridModeEnabled={false}
          theme={excalidrawTheme}
          // `name` is shown in the menu — keep it neutral so it
          // doesn't read like an editor.
          name="whiteboard-replay"
          // We don't want the topbar visible on the replay (no save,
          // no clear, etc.) — view mode hides most of it; explicitly
          // disable saveToActiveFile too.
          UIOptions={{ canvasActions: { saveToActiveFile: false } }}
          excalidrawAPI={(instance) =>
            setApi(instance as unknown as ReplayApi)
          }
          initialData={{
            // Provide a never-rendered placeholder so Excalidraw
            // doesn't show its empty-state graphic before our first
            // updateScene lands.
            //
            // Intentionally OMIT `theme` and `viewBackgroundColor` from
            // initialData.appState — Excalidraw treats initialData as
            // the canonical first appState and sticks the viewBackground
            // even when later updateScene calls try to change it. The
            // workspace canvas correctly responds to the `theme` prop
            // alone (no initialData appState theme/bg), so we mirror
            // that pattern here. Reproduced 2026-05-09: Andrew on
            // dark-mode OS saw a white replay canvas while the live
            // workspace canvas was correctly dark.
            elements: [],
            appState: {
              currentItemFontFamily: 1,
            },
          }}
        />
      </div>

      {snapshotBlobUrl && (
        <div className="muted" style={{ fontSize: 11 }}>
          Final snapshot:{" "}
          <a href={snapshotBlobUrl} target="_blank" rel="noreferrer noopener">
            open as image
          </a>
        </div>
      )}

      {/* Note about audio mime — drives the Chrome WebM duration hack
          (see `attachWebmDurationFix` wired into the rAF useEffect
          above). Surfaced in the UI for debugging when a tutor reports
          a non-draggable scrubber or wrong duration. */}
      {hasAudio && activeSegment?.mimeType && (
        <div className="muted" style={{ fontSize: 11 }}>
          Audio mime: {activeSegment.mimeType}
        </div>
      )}
    </div>
  );
}

/**
 * Admin review uses a same-origin API route that authenticates via cookie.
 * Public share pages may pass absolute Blob or token URLs — those still use
 * `omit` so we do not leak cookies cross-site.
 */
function credentialsForReplayFetch(url: string): RequestCredentials {
  if (typeof window === "undefined") return "omit";
  if (url.startsWith("/")) return "include";
  try {
    const resolved = new URL(url, window.location.href);
    if (resolved.origin === window.location.origin) return "include";
  } catch {
    // ignore
  }
  return "omit";
}

/**
 * Read the proxy's `{ error: string }` JSON body if present, returning
 * just the message. Used to surface the server's friendly copy on
 * non-2xx responses instead of a generic status code.
 *
 * Defensive in three ways:
 *   - Wrapped in try/catch so a non-JSON error body can't crash the
 *     player's catch handler (which would lose the original error).
 *   - Returns null on any shape mismatch — the caller falls back to
 *     a generic "(status N)" message.
 *   - Reads `res.text()` not `res.json()` so a `Content-Type: text/html`
 *     error page doesn't second-throw inside the parse.
 */
async function readJsonError(res: Response): Promise<string | null> {
  try {
    const text = await res.text();
    const parsed = JSON.parse(text) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
    ) {
      return (parsed as { error: string }).error;
    }
    return null;
  } catch {
    return null;
  }
}

function PlayerPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="card"
      style={{
        minHeight: 420,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="muted">{label}</div>
    </div>
  );
}

/** Walk the log and collect every distinct `assetUrl` so we can
 * pre-warm them as `<img>` decodes. */
function collectAssetUrls(log: WBEventLog): string[] {
  const urls = new Set<string>();
  function visit(el: WBElement) {
    if (el.assetUrl) urls.add(el.assetUrl);
  }
  for (const event of log.events) {
    if (event.type === "snapshot") {
      for (const el of event.elements) visit(el);
    } else if (event.type === "add") {
      visit(event.element);
    } else if (event.type === "update") {
      // patch may carry assetUrl on (rare) re-skin updates
      const patchUrl = (event.patch as { assetUrl?: string }).assetUrl;
      if (patchUrl) urls.add(patchUrl);
    }
  }
  return Array.from(urls);
}

/**
 * Fetch + register image assets in Excalidraw's BinaryFiles map.
 * Best-effort — failures are logged but never thrown into the React
 * tree (an image that won't load just doesn't render the bitmap;
 * the bounding box stays).
 *
 * Fileid convention: Excalidraw renders an image element by looking up
 * its `fileId` in the BinaryFiles map. The replay path uses the SAME
 * synthesis as `toExcalidraw` (`wba-${elementId}`) so the rendered
 * image element id matches the registered BinaryFile id. Previously
 * replay registered under `stableHashFileId(url)`, which never matched
 * the `wba-${id}` already stamped on the rendered Excalidraw element —
 * resulting in placeholder image-frame boxes for every PDF page in
 * replay (smoke-1 #12 root cause).
 *
 * We register one BinaryFile per (element id, asset url) pair. Two
 * elements pointing at the same assetUrl each get their own fileId in
 * the map — Excalidraw stores duplicates without churn, and per-
 * element fileids let us evict / re-hydrate independently.
 */
async function registerImageAssets(
  api: ReplayApi,
  scene: ReadonlyMap<string, WBElement>,
  /** Fetch URLs — may be proxied same-origin routes for private Blob assets. */
  fetchUrls: string[],
  /** Original assetUrl values from the event log — used to key scene elements. */
  originalUrls: string[] = fetchUrls,
): Promise<void> {
  const filesToRegister: Array<{
    id: string;
    mimeType: "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp" | "image/gif";
    dataURL: string;
    created: number;
  }> = [];
  for (let i = 0; i < fetchUrls.length; i++) {
    const fetchUrl = fetchUrls[i]!;
    const originalUrl = originalUrls[i] ?? fetchUrl;
    try {
      const res = await fetch(fetchUrl, {
        credentials: fetchUrl.startsWith("/") ? "include" : "omit",
      });
      if (!res.ok) {
        console.warn(
          "[WhiteboardReplay] asset fetch returned non-OK",
          fetchUrl,
          res.status
        );
        continue;
      }
      const blob = await res.blob();
      const dataURL = await blobToDataUrl(blob);
      const mime = normalizeAssetMime(blob.type) ?? "image/png";
      // One BinaryFile per scene element that points at this URL.
      // fileId synthesis MUST match `toExcalidraw` (`wba-${id}`) — the
      // rendered Excalidraw image element already carries that id by
      // the time we get here, so the BinaryFile must register under
      // the same key for the bitmap to actually paint.
      let matchedAny = false;
      for (const el of scene.values()) {
        if (el.assetUrl !== originalUrl || el.type !== "image") continue;
        matchedAny = true;
        filesToRegister.push({
          id: `wba-${el.id}`,
          mimeType: mime,
          dataURL,
          created: Date.now(),
        });
      }
      if (!matchedAny) {
        // Asset URL collected from the event log but no matching scene
        // element at the current replay time. Cache under a stable URL
        // key so a later applyAt() that surfaces the element can still
        // find the binary (Excalidraw rebuilds image bitmaps lazily).
        filesToRegister.push({
          id: stableHashFileId(originalUrl),
          mimeType: mime,
          dataURL,
          created: Date.now(),
        });
      }
    } catch (err) {
      console.warn("[WhiteboardReplay] Could not load asset", fetchUrl, err);
    }
  }
  if (filesToRegister.length > 0) {
    api.addFiles(filesToRegister);
  }
}

function normalizeAssetMime(
  mime: string
): "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp" | "image/gif" | null {
  switch (mime) {
    case "image/png":
      return "image/png";
    case "image/jpeg":
    case "image/jpg":
      return "image/jpeg";
    case "image/svg+xml":
      return "image/svg+xml";
    case "image/webp":
      return "image/webp";
    case "image/gif":
      return "image/gif";
    default:
      return null;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === "string") resolve(r.result);
      else reject(new Error("FileReader returned non-string result"));
    };
    r.onerror = () => reject(r.error ?? new Error("FileReader failed"));
    r.readAsDataURL(blob);
  });
}

/**
 * Deterministic file id from a URL. Doesn't need to be cryptographic —
 * Excalidraw just needs a stable opaque key. Using djb2 hash of the
 * URL keeps the value short and avoids the runtime cost of WebCrypto
 * inside the scene loop.
 */
function stableHashFileId(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = (h * 33 + url.charCodeAt(i)) | 0;
  return `f_${(h >>> 0).toString(36)}`;
}

function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** Re-export for callers that intentionally avoid parsing through the replay UI. */
export { parseEventLogBySchema } from "@/lib/whiteboard/replay-parse";
