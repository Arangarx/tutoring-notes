"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  findLatestViewportAt,
  maxEventTimestampMs,
  type WBElement,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import {
  computeResizeScroll,
  createCameraFitter,
  createScenePainter,
  type ScenePaintApi,
  type ScenePainter,
} from "@/lib/whiteboard/scene-paint";
import {
  replayScrollFromRecordedViewport,
} from "@/lib/whiteboard/viewport-align";
import { useTheme } from "@/components/ThemeProvider";
import { getReplayCachedRestoreElements } from "@/lib/whiteboard/replay-restore-elements";
import {
  GraphEmbeddable,
  warmJsxGraphModule,
} from "@/components/whiteboard/GraphEmbeddable";
import { GRAPH_EMBED_LINK } from "@/lib/whiteboard/insert-asset";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";
import {
  stableHashReplayFileId,
  type ReplayApi,
} from "@/lib/whiteboard/replay-helpers";

const Excalidraw = dynamic(
  async () => {
    const mod = await import("@excalidraw/excalidraw");
    await import("@excalidraw/excalidraw/index.css");
    return mod.Excalidraw;
  },
  {
    ssr: false,
    loading: () => (
      <div className="muted" style={{ padding: 24, textAlign: "center" }}>
        Loading whiteboard…
      </div>
    ),
  }
);

export type ReplayCanvasSurfaceProps = {
  log: WBEventLog;
  hasAudio: boolean;
  restoreReady: boolean;
  paintReady: boolean;
  whiteboardSessionId?: string;
  resolveAssetUrl?: (raw: string) => string;
  applySceneAtRef: React.MutableRefObject<(timeMs: number) => void>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  style?: React.CSSProperties;
  onApiReady?: (api: ReplayApi) => void;
  /** When true, gate canvas visibility until paintReady (B2). */
  gateVisibility?: boolean;
};


export function ReplayCanvasSurface({
  log,
  hasAudio,
  restoreReady,
  paintReady,
  whiteboardSessionId,
  resolveAssetUrl,
  applySceneAtRef,
  containerRef: externalContainerRef,
  className,
  style,
  onApiReady,
  gateVisibility = false,
}: ReplayCanvasSurfaceProps) {
  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = externalContainerRef ?? internalContainerRef;
  const [api, setApi] = useState<ReplayApi | null>(null);
  const lastSceneElementsRef = useRef<readonly unknown[]>([]);
  const initialPaintApiRef = useRef<ReplayApi | null>(null);
  const initialPaintHasAudioRef = useRef(false);
  const replayCameraReadyRef = useRef(false);
  const registeredAssetUrlsRef = useRef<Set<string>>(new Set());
  const scenePainterRef = useRef<ScenePainter | null>(null);
  const { resolvedTheme } = useTheme();
  const excalidrawTheme = resolvedTheme === "dark" ? "dark" : "light";
  /**
   * Container dimensions tracked frame-to-frame by the ResizeObserver.
   * Updated on every ResizeObserver callback (including the initial one at
   * mount). The resize handler reads these as "old dimensions" for
   * computeResizeScroll, so the delta is always relative to the PREVIOUS
   * callback — no snapshot-at-mount race, no frozen-snapshot stale-scroll
   * bug. scrollX/scrollY are read live from api.getAppState() at resize
   * time (always post-camera-fit by the time the observer fires).
   */
  const prevResizeWidthRef = useRef<number | null>(null);
  const prevResizeHeightRef = useRef<number | null>(null);

  const jsxGraphWarmedRef = useRef(false);
  useEffect(() => {
    if (jsxGraphWarmedRef.current) return;
    jsxGraphWarmedRef.current = true;
    warmJsxGraphModule();
  }, []);

  const renderGraphEmbeddable = useCallback((element: unknown) => {
    const el = element as { link?: string; customData?: { wbType?: string } };
    if (el.link === GRAPH_EMBED_LINK || el.customData?.wbType === "graph") {
      return (
        <GraphEmbeddable
          element={
            element as {
              id?: string;
              width?: number;
              height?: number;
              customData?: Record<string, unknown>;
            }
          }
          readOnly
        />
      );
    }
    return null;
  }, []);

  useEffect(() => {
    if (!api) {
      scenePainterRef.current = null;
      return;
    }
    scenePainterRef.current = createScenePainter({
      log,
      api: api as ScenePaintApi,
      restoreElements: getReplayCachedRestoreElements() ?? undefined,
      registeredAssetUrls: registeredAssetUrlsRef.current,
    });
  }, [api, log]);

  const applySceneAt = useCallback(
    (timeMs: number) => {
      if (!api) return;
      const painter = scenePainterRef.current;
      if (!painter) return;
      const vp = findLatestViewportAt(log, timeMs);
      let viewportOverride = vp ?? undefined;
      if (vp) {
        const container = containerRef.current;
        const rect = container?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          let offsetLeft = 0;
          let offsetTop = 0;
          try {
            const st = api.getAppState?.();
            if (st && typeof st === "object") {
              const o = st as { offsetLeft?: unknown; offsetTop?: unknown };
              if (typeof o.offsetLeft === "number" && Number.isFinite(o.offsetLeft)) {
                offsetLeft = o.offsetLeft;
              }
              if (typeof o.offsetTop === "number" && Number.isFinite(o.offsetTop)) {
                offsetTop = o.offsetTop;
              }
            }
          } catch {
            // best-effort — offsets only affect center-match when non-zero
          }
          const aligned = replayScrollFromRecordedViewport(
            vp,
            rect.width,
            rect.height,
            offsetLeft,
            offsetTop,
            { allowLegacyRecordSizeFallback: true }
          );
          if (aligned) {
            viewportOverride = {
              panX: aligned.scrollX,
              panY: aligned.scrollY,
              zoom: aligned.zoom,
            };
          }
        } else if (container && typeof window !== "undefined") {
          // Share replay shell layout race: rect can be 0×0 on the first paint
          // before flex height chain resolves — retry on rAF (same pattern as
          // createCameraFitter in scene-paint.ts).
          let retriesLeft = 4;
          const retryAlign = () => {
            if (retriesLeft <= 0) return;
            retriesLeft -= 1;
            const retryRect = container.getBoundingClientRect();
            if (!(retryRect.width > 0 && retryRect.height > 0)) {
              window.requestAnimationFrame(retryAlign);
              return;
            }
            applySceneAtRef.current?.(timeMs);
          };
          window.requestAnimationFrame(retryAlign);
        }
      }
      const result = painter.applyAt(timeMs, {
        preserveScroll: vp ? false : replayCameraReadyRef.current,
        viewportOverride,
      });
      lastSceneElementsRef.current = result.paintedElements;
      if (vp && !replayCameraReadyRef.current) {
        replayCameraReadyRef.current = true;
      }
      if (result.newAssetUrls.length > 0) {
        const resolvedAssetUrls = resolveAssetUrl
          ? result.newAssetUrls.map(resolveAssetUrl)
          : result.newAssetUrls;
        void registerImageAssets(
          api,
          result.scene,
          resolvedAssetUrls,
          result.newAssetUrls
        );
      }
    },
    [api, containerRef, log, resolveAssetUrl]
  );

  useEffect(() => {
    applySceneAtRef.current = applySceneAt;
  }, [applySceneAt, applySceneAtRef]);

  useEffect(() => {
    if (!api) return;
    if (
      initialPaintApiRef.current === api &&
      initialPaintHasAudioRef.current === hasAudio
    ) {
      return;
    }
    initialPaintApiRef.current = api;
    initialPaintHasAudioRef.current = hasAudio;
    replayCameraReadyRef.current = false;

    const finalClockMs = Math.max(log.durationMs, maxEventTimestampMs(log));
    const noSessionAudio = !hasAudio;
    const hasEvents = log.events.length > 0;
    const initialT = noSessionAudio && !hasEvents ? finalClockMs : 0;
    applySceneAt(initialT);

    const container = containerRef.current;
    if (!container) return;
    if (replayCameraReadyRef.current) return;

    const fitter = createCameraFitter({
      api: api as ScenePaintApi,
      container,
      getElements: () => lastSceneElementsRef.current,
      zoom: 1,
      onFit: () => {
        replayCameraReadyRef.current = true;
      },
    });
    fitter.fit();
    return () => fitter.dispose();
  }, [api, applySceneAt, containerRef, hasAudio, log]);

  useEffect(() => {
    if (api) onApiReady?.(api);
  }, [api, onApiReady]);

  /**
   * Center-preserving resize handler — frame-to-frame approach.
   *
   * ROOT CAUSE OF PRIOR BUG (b7b8d3e / 596d920):
   * The frozen-snapshot approach captured viewportSnapshotRef in
   * applySceneAt, which ran BEFORE the camera fitter set the correct
   * scrollX. So frozenSnapshotRef.scrollX = 0 (Excalidraw's initial
   * default) instead of the camera-fit value. computeResizeScroll then
   * computed the scene center as viewport_width/2 (scene origin + half
   * of full-screen) rather than the actual content center — matching
   * Andrew's symptom: "positions where center would have been at full screen."
   *
   * FIX — frame-to-frame:
   * Track container dimensions in prevResizeWidthRef / prevResizeHeightRef,
   * updated on EVERY ResizeObserver callback (including the initial one at
   * mount). On each resize callback:
   *   - Read scrollX/Y LIVE from api.getAppState() — by the time the
   *     ResizeObserver fires (asynchronously, next browser frame), all
   *     useEffects (including the camera fitter) have already run, so
   *     scrollX is always the correct post-camera-fit value.
   *   - Use prevResizeWidthRef as oldWidth — independent of Excalidraw's
   *     appState.width, which Excalidraw updates before our observer fires.
   *   - Update prevResizeWidth after each callback so subsequent deltas
   *     are relative to the PREVIOUS callback's size.
   *
   * This is continuous (applies on every ResizeObserver callback, not just
   * debounce-end) and requires no debouncing, no frozen snapshot, and no
   * applySceneAt cooperation.
   *
   * Math: computeResizeScroll in scene-paint.ts (unchanged — the formula
   * was always correct; only the inputs were wrong).
   */
  useEffect(() => {
    if (!api) return;
    const container = containerRef.current;
    if (!container) return;

    // Reset tracked dimensions on api/container change so the first callback
    // initializes prevResizeWidthRef without applying a spurious correction.
    prevResizeWidthRef.current = null;
    prevResizeHeightRef.current = null;

    const refitOnResize = () => {
      const rect = container.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return;

      const prevW = prevResizeWidthRef.current;
      const prevH = prevResizeHeightRef.current;

      if (
        prevW !== null &&
        prevH !== null &&
        prevW > 0 &&
        prevH > 0 &&
        (rect.width !== prevW || rect.height !== prevH)
      ) {
        try {
          const st = api.getAppState?.();
          if (st) {
            const z =
              typeof (st.zoom as { value?: unknown })?.value === "number"
                ? (st.zoom as { value: number }).value
                : 1;
            const scrollX =
              typeof st.scrollX === "number" ? st.scrollX : 0;
            const scrollY =
              typeof st.scrollY === "number" ? st.scrollY : 0;
            const newScroll = computeResizeScroll({
              scrollX,
              scrollY,
              zoom: z,
              oldWidth: prevW,
              oldHeight: prevH,
              newWidth: rect.width,
              newHeight: rect.height,
            });
            api.updateScene({
              appState: {
                scrollX: newScroll.scrollX,
                scrollY: newScroll.scrollY,
                zoom: { value: z },
              },
            });
          }
        } catch {
          // best-effort — never crash the replay
        }
      }

      // Update tracked dimensions AFTER applying correction so the next
      // callback uses the current size as its old reference.
      prevResizeWidthRef.current = rect.width;
      prevResizeHeightRef.current = rect.height;
    };

    const ro = new ResizeObserver(refitOnResize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [api, containerRef]);

  if (!restoreReady) {
    return (
      <div className="muted" style={{ padding: 24, textAlign: "center" }}>
        Preparing whiteboard replay engine…
      </div>
    );
  }

  const opacity = gateVisibility && !paintReady ? 0 : 1;

  return (
    <div
      ref={containerRef}
      data-replay-viewport-metrics=""
      className={className}
      style={{
        opacity,
        transition: gateVisibility ? "opacity 0.15s ease" : undefined,
        ...style,
      }}
    >
      <Excalidraw
        viewModeEnabled
        gridModeEnabled={false}
        zenModeEnabled
        theme={excalidrawTheme}
        validateEmbeddable={validateExcalidrawEmbeddable}
        renderEmbeddable={renderGraphEmbeddable}
        name="whiteboard-replay"
        UIOptions={{ canvasActions: { saveToActiveFile: false } }}
        excalidrawAPI={(instance) => setApi(instance as unknown as ReplayApi)}
        initialData={{
          elements: [],
          appState: { currentItemFontFamily: 1 },
        }}
      />
    </div>
  );
}

export async function registerImageAssets(
  api: ReplayApi,
  scene: ReadonlyMap<string, WBElement>,
  fetchUrls: string[],
  originalUrls: string[] = fetchUrls
): Promise<void> {
  const filesToRegister: Array<{
    id: string;
    mimeType:
      | "image/png"
      | "image/jpeg"
      | "image/svg+xml"
      | "image/webp"
      | "image/gif";
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
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataURL = await blobToDataUrl(blob);
      const mime = normalizeAssetMime(blob.type) ?? "image/png";
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
        filesToRegister.push({
          id: stableHashReplayFileId(originalUrl),
          mimeType: mime,
          dataURL,
          created: Date.now(),
        });
      }
    } catch {
      // best-effort
    }
  }
  if (filesToRegister.length > 0) api.addFiles(filesToRegister);
}

function normalizeAssetMime(
  mime: string
):
  | "image/png"
  | "image/jpeg"
  | "image/svg+xml"
  | "image/webp"
  | "image/gif"
  | null {
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
