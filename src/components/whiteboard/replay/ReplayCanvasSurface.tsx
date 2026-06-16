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
  const { resolvedTheme } = useTheme();
  const excalidrawTheme = resolvedTheme === "dark" ? "dark" : "light";
  /**
   * Snapshot of the Excalidraw viewport sampled after each applySceneAt call.
   * Used by the resize handler to preserve the scene-center through container
   * dimension changes (instead of refit-to-bbox which flashes to a different
   * position).
   *
   * IMPORTANT: applySceneAt must NOT update this while a resize series is
   * active (resizeActiveRef.current === true). Excalidraw updates st.width
   * to the new container dimensions before our ResizeObserver fires, so any
   * play-loop tick during an active resize would overwrite this with the
   * post-resize width — making oldW ≈ newW and zeroing out the correction.
   * The freeze (guarded by resizeActiveRef) prevents that pollution.
   */
  const viewportSnapshotRef = useRef<ViewportSnapshot | null>(null);
  /**
   * True while a resize series is in progress (set on the first ResizeObserver
   * callback, cleared ~100ms after the last one). Prevents applySceneAt from
   * overwriting viewportSnapshotRef with a mid-resize st.width value.
   */
  const resizeActiveRef = useRef(false);
  /**
   * Frozen copy of viewportSnapshotRef captured at the START of a resize
   * series (before any play-loop tick can pollute it). The resize handler
   * uses this as the stable "old dimensions" reference throughout the series.
   */
  const frozenSnapshotRef = useRef<ViewportSnapshot | null>(null);

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
      // Sample viewport state for center-preserving resize. Only update when
      // NOT actively resizing: Excalidraw updates st.width to the new container
      // dimensions before our ResizeObserver fires, so any play-loop tick
      // during an active resize would write the post-resize width into the
      // snapshot — making oldW ≈ newW and zeroing the centering correction.
      // resizeActiveRef guards this; the freeze is lifted ~100ms after resize ends.
      if (!resizeActiveRef.current) {
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
   * BUG HISTORY (2026-06-16): the previous implementation re-captured
   * viewportSnapshotRef.current on EVERY ResizeObserver callback. But
   * Excalidraw updates st.width/st.height to the new container dimensions
   * before our ResizeObserver fires, so the play loop's applySceneAt tick
   * (running on rAF, which fires AFTER ResizeObserver in each frame) would
   * write the post-resize width into the snapshot. By the next resize frame
   * the snapshot had oldW ≈ newW, making the correction ≈ 0 — content drifted
   * right over multiple resize frames.
   *
   * FIX: freeze the snapshot at the START of each resize series
   * (resizeActiveRef + frozenSnapshotRef). applySceneAt skips snapshot updates
   * while resizeActiveRef is true. The frozen pre-resize snapshot is the stable
   * reference used throughout the entire resize drag.
   *
   * SMOOTHNESS: apply centering on EVERY ResizeObserver callback (continuous),
   * not just on debounce-end. The debounce only marks the resize series as
   * finished so the play loop can resume snapshot updates.
   *
   * Math (see computeResizeScroll in scene-paint.ts):
   *   sceneCenterX = oldWidth / 2 / zoom - scrollX   (scene point at old center)
   *   newScrollX   = newWidth / 2 / zoom - sceneCenterX  (keeps it at new center)
   */
  useEffect(() => {
    if (!api) return;
    const container = containerRef.current;
    if (!container) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const refitOnResize = () => {
      // On the first ResizeObserver callback of a resize series, freeze the
      // pre-resize snapshot before any rAF/play-loop tick can overwrite it
      // with a post-resize st.width value.
      if (!resizeActiveRef.current) {
        resizeActiveRef.current = true;
        frozenSnapshotRef.current = viewportSnapshotRef.current;
      }

      // Apply centering IMMEDIATELY on every callback for smooth tracking.
      // Uses frozenSnapshotRef so the reference point stays the same across
      // all callbacks in the resize series.
      try {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const snapshot = frozenSnapshotRef.current;
          if (snapshot && snapshot.width > 0 && snapshot.height > 0) {
            const newScroll = computeResizeScroll({
              scrollX: snapshot.scrollX,
              scrollY: snapshot.scrollY,
              zoom: snapshot.zoom,
              oldWidth: snapshot.width,
              oldHeight: snapshot.height,
              newWidth: rect.width,
              newHeight: rect.height,
            });
            api.updateScene({
              appState: {
                scrollX: newScroll.scrollX,
                scrollY: newScroll.scrollY,
                zoom: { value: snapshot.zoom },
              },
            });
          } else {
            // No snapshot yet (before the first paint) — fall back to bbox refit.
            const fitter = createCameraFitter({
              api: api as ScenePaintApi,
              container,
              getElements: () => lastSceneElementsRef.current,
              zoom: 1,
            });
            fitter.fit();
            fitter.dispose();
          }
        }
      } catch {
        // best-effort
      }

      // Debounce to detect resize-end and unfreeze, so the play loop can
      // resume updating viewportSnapshotRef with the post-resize state.
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        resizeActiveRef.current = false;
        // frozenSnapshotRef will be refreshed on the next applySceneAt tick.
      }, 100);
    };

    const ro = new ResizeObserver(refitOnResize);
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      resizeActiveRef.current = false;
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
