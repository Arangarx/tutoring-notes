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
    },
    [api, log, resolveAssetUrl]
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

  /** Preserve viewport center across container resizes. */
  useEffect(() => {
    if (!api) return;
    const container = containerRef.current;
    if (!container) return;

    const recenterOnViewportCenter = () => {
      try {
        const st = api.getAppState?.();
        if (!st) return;
        const scrollX = typeof st.scrollX === "number" ? st.scrollX : null;
        const scrollY = typeof st.scrollY === "number" ? st.scrollY : null;
        const zoomRaw = (st.zoom as { value?: unknown } | undefined)?.value;
        const zoom = typeof zoomRaw === "number" && zoomRaw > 0 ? zoomRaw : 1;
        if (scrollX == null || scrollY == null) return;

        const rect = container.getBoundingClientRect();
        const cw = rect.width;
        const ch = rect.height;
        if (!(cw > 0 && ch > 0)) return;

        // Scene point currently visible at the viewport center:
        //   scene_x = (viewport_x - scrollX) / zoom
        // After resize to new (cw, ch), keep that scene point at new center:
        //   nextScrollX = cw/2 - sceneCenterX * zoom
        const sceneCenterX = (cw / 2 - scrollX) / zoom;
        const sceneCenterY = (ch / 2 - scrollY) / zoom;
        const nextScrollX = cw / 2 - sceneCenterX * zoom;
        const nextScrollY = ch / 2 - sceneCenterY * zoom;

        api.updateScene({
          elements: lastSceneElementsRef.current as unknown[],
          appState: {
            scrollX: nextScrollX,
            scrollY: nextScrollY,
            zoom: { value: zoom },
          },
        });
      } catch {
        // best-effort
      }
    };

    const ro = new ResizeObserver(() => {
      recenterOnViewportCenter();
    });
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
