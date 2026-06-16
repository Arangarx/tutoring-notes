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
  createCameraFitter,
  createScenePainter,
  type ScenePaintApi,
  type ScenePainter,
} from "@/lib/whiteboard/scene-paint";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";
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

/** Snapshot of Excalidraw viewport state used for center-preserving resize. */
type ViewportSnapshot = {
  scrollX: number;
  scrollY: number;
  zoom: number;
  /** Container width at the time of the snapshot (in CSS pixels). */
  width: number;
  /** Container height at the time of the snapshot (in CSS pixels). */
  height: number;
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
  const excalidrawTheme = useExcalidrawThemeFromSystem();
  /**
   * Snapshot of the Excalidraw viewport sampled after each applySceneAt call.
   * Used by the resize handler to preserve the scene-center through container
   * dimension changes (instead of refit-to-bbox which flashes to a different
   * position). The snapshot is captured BEFORE the debounce fires so it holds
   * the pre-resize Excalidraw state.
   */
  const viewportSnapshotRef = useRef<ViewportSnapshot | null>(null);

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
      const result = painter.applyAt(timeMs, {
        preserveScroll: vp ? false : replayCameraReadyRef.current,
        viewportOverride: vp ?? undefined,
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
      // Sample viewport state for center-preserving resize. Sampled after each
      // paint so the ResizeObserver always has a fresh pre-resize snapshot.
      try {
        const st = api.getAppState?.();
        if (st) {
          const zoomVal =
            typeof (st.zoom as { value?: unknown })?.value === "number"
              ? (st.zoom as { value: number }).value
              : 1;
          const containerEl = containerRef.current;
          const rect = containerEl?.getBoundingClientRect();
          viewportSnapshotRef.current = {
            scrollX: typeof st.scrollX === "number" ? st.scrollX : 0,
            scrollY: typeof st.scrollY === "number" ? st.scrollY : 0,
            zoom: zoomVal,
            // Prefer Excalidraw's own width/height (already post-layout);
            // fall back to container rect which is always post-layout.
            width:
              typeof st.width === "number" && st.width > 0
                ? st.width
                : (rect?.width ?? 0),
            height:
              typeof st.height === "number" && st.height > 0
                ? st.height
                : (rect?.height ?? 0),
          };
        }
      } catch {
        // best-effort — don't crash the paint path
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
   * Center-preserving resize handler.
   *
   * When the container resizes (e.g. the split-pane width changes), keep the
   * scene point that is currently at the viewport center STILL at the center
   * of the new viewport. This avoids the bbox-refit flash (which jumps to a
   * different camera position and then snaps back) observed with the previous
   * createCameraFitter approach.
   *
   * Math: given scrollX/scrollY/zoom and old container size (oldW × oldH),
   * the scene point at viewport center is:
   *   sceneCenterX = oldW / 2 / zoom - scrollX
   *   sceneCenterY = oldH / 2 / zoom - scrollY
   *
   * After resize to (newW × newH), the new scroll that keeps sceneCenterX/Y
   * at the viewport center is:
   *   newScrollX = newW / 2 / zoom - sceneCenterX
   *   newScrollY = newH / 2 / zoom - sceneCenterY
   *
   * The viewportSnapshotRef is updated by applySceneAt on every paint, so it
   * always holds the pre-resize Excalidraw state (sampled before the
   * ResizeObserver fires). If no snapshot exists yet (before the first paint),
   * fall back to the bbox refit so the initial view is still centered.
   *
   * Offset-invariance: using st.width/st.height (Excalidraw's internal canvas
   * dimensions, which already account for any internal insets) rather than the
   * raw container rect avoids offset contamination (Phase-5 lesson).
   */
  useEffect(() => {
    if (!api) return;
    const container = containerRef.current;
    if (!container) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const refitOnResize = () => {
      // Capture the snapshot NOW, before the debounce, while viewportSnapshotRef
      // still holds pre-resize Excalidraw state (applySceneAt hasn't been called
      // yet after this resize; rAF fires after the current task queue).
      const snapshot = viewportSnapshotRef.current;

      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        try {
          const rect = container.getBoundingClientRect();
          if (!(rect.width > 0 && rect.height > 0)) return;

          if (snapshot && snapshot.width > 0 && snapshot.height > 0) {
            const { scrollX, scrollY, zoom, width: oldW, height: oldH } = snapshot;
            const sceneCenterX = oldW / 2 / zoom - scrollX;
            const sceneCenterY = oldH / 2 / zoom - scrollY;
            const newScrollX = rect.width / 2 / zoom - sceneCenterX;
            const newScrollY = rect.height / 2 / zoom - sceneCenterY;
            api.updateScene({
              elements: lastSceneElementsRef.current as readonly unknown[],
              appState: {
                scrollX: newScrollX,
                scrollY: newScrollY,
                zoom: { value: zoom },
              },
            });
          } else {
            // No snapshot yet (before the first paint) — fall back to bbox refit
            // so the initial fit still centers on the drawing.
            const fitter = createCameraFitter({
              api: api as ScenePaintApi,
              container,
              getElements: () => lastSceneElementsRef.current,
              zoom: 1,
            });
            fitter.fit();
            fitter.dispose();
          }
        } catch {
          // best-effort
        }
      }, 100);
    };

    const ro = new ResizeObserver(refitOnResize);
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
    };
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
