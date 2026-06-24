"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";
import { parseEventLogBySchema } from "@/lib/whiteboard/replay-parse";
import {
  createScenePainter,
  type ScenePaintApi,
  adaptWBElementsToExcalidraw,
  restoreAndSanitizeForPaint,
} from "@/lib/whiteboard/scene-paint";
import type { WBElement } from "@/lib/whiteboard/event-log";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";
import {
  credentialsForReplayFetch,
  readReplayJsonError,
} from "@/lib/whiteboard/replay-helpers";
import {
  getReplayCachedRestoreElements,
  setReplayCachedRestoreElements,
} from "@/lib/whiteboard/replay-restore-elements";
import { EXCALIDRAW_BG_LIGHT_HEX } from "@/styles/token-values";
import { useTheme } from "@/components/ThemeProvider";
import type { ExportToCanvasFn } from "@/lib/whiteboard/snapshot-png";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { GraphEmbeddable, warmJsxGraphModule } from "@/components/whiteboard/GraphEmbeddable";
import { GRAPH_EMBED_LINK } from "@/lib/whiteboard/insert-asset";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";
import { excalidrawBoardBgHex } from "@/hooks/useExcalidrawLoadingGuard";

type Props = {
  eventsProxyUrl: string;
  whiteboardSessionId?: string;
  className?: string;
};

/** Checks whether any element in the scene is a graph embed. */
function hasGraphEmbeds(elements: readonly unknown[]): boolean {
  return elements.some((el) => {
    const e = el as {
      type?: string;
      link?: string;
      graphStateJson?: string;
      customData?: { wbType?: string; graphStateJson?: string };
    };
    return (
      e.type === "graph" ||
      e.link === GRAPH_EMBED_LINK ||
      e.customData?.wbType === "graph" ||
      typeof e.graphStateJson === "string" ||
      typeof e.customData?.graphStateJson === "string"
    );
  });
}

function sceneMapHasGraph(scene: ReadonlyMap<string, WBElement>): boolean {
  for (const el of scene.values()) {
    if (el.type === "graph" || typeof el.graphStateJson === "string") {
      return true;
    }
  }
  return false;
}

type GraphEmbeddableElement = {
  id?: string;
  width?: number;
  height?: number;
  customData?: Record<string, unknown>;
};

function findGraphEmbeddableElement(
  elements: readonly unknown[]
): GraphEmbeddableElement | null {
  for (const raw of elements) {
    const el = raw as {
      type?: string;
      link?: string;
      customData?: { wbType?: string; graphStateJson?: string };
    };
    if (
      el.type === "embeddable" &&
      (el.link === GRAPH_EMBED_LINK ||
        el.customData?.wbType === "graph" ||
        typeof el.customData?.graphStateJson === "string")
    ) {
      return raw as GraphEmbeddableElement;
    }
  }
  return null;
}

/** Read-only graph hero thumbnail — bypasses Excalidraw renderEmbeddable (view-mode quirk). */
function ReviewGraphOnlyThumbnail({
  element,
  className,
}: {
  element: GraphEmbeddableElement;
  className?: string;
}) {
  useEffect(() => {
    warmJsxGraphModule();
  }, []);

  return (
    <div
      className={`wb-review-board-thumbnail wb-review-board-thumbnail--graph${className ? ` ${className}` : ""}`}
      data-testid="wb-review-board-thumbnail"
    >
      <GraphEmbeddable element={element} readOnly />
    </div>
  );
}

/**
 * Live view-mode Excalidraw used as the thumbnail when the session
 * contains graph embeds. Renders the final scene with renderEmbeddable so
 * JSXGraph boards display correctly instead of raw "mynk://graph" text.
 * Uses opacity gating (same as ReplayCanvasSurface) to prevent flash.
 */
function ReviewBoardLive({
  elements,
  isDark,
  className,
}: {
  elements: readonly unknown[];
  isDark: boolean;
  className?: string;
}) {
  const apiRef = useRef<{
    updateScene: (data: { elements: ReadonlyArray<unknown>; appState?: Record<string, unknown> }) => void;
    scrollToContent: (elements?: readonly unknown[], opts?: Record<string, unknown>) => void;
  } | null>(null);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const [paintReady, setPaintReady] = useState(false);

  // Warm JSXGraph on mount.
  useEffect(() => {
    warmJsxGraphModule();
  }, []);

  const applySceneToApi = useCallback((typedApi: NonNullable<typeof apiRef.current>) => {
    const sceneElements = elementsRef.current;
    if (sceneElements.length === 0) {
      setPaintReady(true);
      return;
    }
    typedApi.updateScene({ elements: sceneElements });
    try {
      typedApi.scrollToContent(sceneElements, { fitToContent: true, animate: false });
    } catch {
      // scrollToContent is best-effort
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPaintReady(true));
    });
  }, []);

  const handleApi = useCallback(
    (api: unknown) => {
      const typedApi = api as typeof apiRef.current;
      apiRef.current = typedApi;
      if (!typedApi) {
        setPaintReady(true);
        return;
      }
      applySceneToApi(typedApi);
    },
    [applySceneToApi]
  );

  useEffect(() => {
    const typedApi = apiRef.current;
    if (!typedApi) return;
    applySceneToApi(typedApi);
  }, [applySceneToApi, elements]);

  const renderGraphEmbeddable = useCallback((element: unknown) => {
    const el = element as { link?: string; customData?: { wbType?: string } };
    if (el.link === GRAPH_EMBED_LINK || el.customData?.wbType === "graph") {
      return (
        <GraphEmbeddable
          element={element as { id?: string; width?: number; height?: number; customData?: Record<string, unknown> }}
          readOnly
        />
      );
    }
    return null;
  }, []);

  const excalidrawTheme = isDark ? "dark" : "light";
  const bgHex = excalidrawBoardBgHex(excalidrawTheme);

  return (
    <div
      className={`wb-review-board-thumbnail${className ? ` ${className}` : ""}`}
      data-testid="wb-review-board-thumbnail"
      style={{ opacity: paintReady ? 1 : 0, transition: "opacity 0.15s ease" }}
    >
      <ExcalidrawDynamic
        viewModeEnabled
        gridModeEnabled={false}
        zenModeEnabled
        theme={excalidrawTheme}
        validateEmbeddable={validateExcalidrawEmbeddable}
        renderEmbeddable={renderGraphEmbeddable}
        name="whiteboard-review-thumbnail"
        UIOptions={{ canvasActions: { saveToActiveFile: false } }}
        excalidrawAPI={handleApi}
        initialData={{
          elements: [],
          appState: {
            currentItemFontFamily: 1,
            viewBackgroundColor: bgHex,
          },
        }}
      />
    </div>
  );
}

/**
 * Hero-state final-frame board thumbnail (S1).
 *
 * Two render paths depending on whether the session contains graph embeds:
 *
 *   A) No graph embeds → static PNG (exportToCanvas).
 *      Original approach: avoids live Excalidraw flash-then-black. Fast.
 *
 *   B) Graph embeds present (link="mynk://graph") → live viewModeEnabled
 *      Excalidraw with renderEmbeddable (Wave5 #5 fix).
 *      exportToCanvas renders embeddable elements as their raw link text
 *      ("mynk://graph") — unacceptable. A live Excalidraw calls the custom
 *      renderEmbeddable callback, which returns <GraphEmbeddable readOnly>
 *      so the actual JSXGraph board is drawn instead.
 *      Opacity is gated to 0 until the Excalidraw API fires (same flash
 *      prevention as ReplayCanvasSurface).
 *
 * Empty sessions still show the empty-state message.
 */
export function ReviewBoardThumbnail({
  eventsProxyUrl,
  whiteboardSessionId,
  className,
}: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "empty" | "error" | "ready-live"
  >("loading");
  const [liveElements, setLiveElements] = useState<readonly unknown[]>([]);
  const [liveIsDark, setLiveIsDark] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setImgSrc(null);
    setLiveElements([]);

    void (async () => {
      try {
        // 1. Fetch + parse event log
        const res = await fetch(eventsProxyUrl, {
          credentials: credentialsForReplayFetch(eventsProxyUrl),
        });
        if (!res.ok) {
          const friendly = await readReplayJsonError(res);
          throw new Error(friendly ?? `Status ${res.status}`);
        }
        const text = await res.text();
        const raw = JSON.parse(text) as { schemaVersion?: unknown };
        if (typeof raw.schemaVersion !== "number") {
          throw new Error("Invalid event log");
        }
        const parsed = parseEventLogBySchema(raw);
        if (cancelled) return;

        if (parsed.events.length === 0) {
          setLoadState("empty");
          return;
        }

        // 2. Import restoreElements + exportToCanvas from Excalidraw
        const excalidrawMod = await import("@excalidraw/excalidraw");
        if (cancelled) return;
        // Cache the real restoreElements for the scene-painter (strict type).
        setReplayCachedRestoreElements(excalidrawMod.restoreElements);
        // Use a loose type for exportToCanvas so downstream usages don't
        // need to mirror the branded upstream parameter types.
        const exportToCanvas =
          excalidrawMod.exportToCanvas as unknown as ExportToCanvasFn;

        // 3. Build final scene with a minimal capture-API (no live Excalidraw)
        const totalMs = Math.max(parsed.durationMs, maxEventTimestampMs(parsed));
        const registeredAssetUrls = new Set<string>();
        let capturedElements: readonly unknown[] = [];
        const captureApi: ScenePaintApi = {
          updateScene: (data: { elements?: ReadonlyArray<unknown> }) => {
            if (data.elements) capturedElements = data.elements;
          },
          getAppState: () => ({}),
          refresh: () => {},
          addFiles: () => {},
          getSceneElements: () => [],
          getFiles: () => ({}),
        } as unknown as ScenePaintApi;

        const resolveAssetUrl = whiteboardSessionId
          ? (raw: string) =>
              resolveWhiteboardAssetReadUrl(raw, {
                kind: "tutor",
                whiteboardSessionId,
              })
          : undefined;

        const painter = createScenePainter({
          log: parsed,
          api: captureApi,
          restoreElements: getReplayCachedRestoreElements() ?? undefined,
          registeredAssetUrls,
        });
        const result = painter.applyAt(totalMs);
        capturedElements = result.paintedElements;
        if (cancelled) return;

        if (capturedElements.length === 0) {
          setLoadState("empty");
          return;
        }

        // Wave5 #5: if the scene contains graph embeds, switch to the live
        // Excalidraw path so renderEmbeddable renders the actual JSXGraph board.
        // exportToCanvas cannot call custom renderEmbeddable — it renders the
        // embed link text ("mynk://graph") directly, which is confusing UX.
        const isDark = resolvedTheme === "dark";
        const graphPresent =
          hasGraphEmbeds(capturedElements) || sceneMapHasGraph(result.scene);
        if (graphPresent) {
          if (cancelled) return;
          let liveEls = capturedElements;
          if (!hasGraphEmbeds(capturedElements) && sceneMapHasGraph(result.scene)) {
            const { rough } = adaptWBElementsToExcalidraw(result.scene.values());
            liveEls = restoreAndSanitizeForPaint(
              rough,
              getReplayCachedRestoreElements() ?? undefined
            );
          }
          setLiveElements(liveEls);
          setLiveIsDark(isDark);
          setLoadState("ready-live");
          return;
        }

        // 4. Fetch image assets and build files map for exportToCanvas
        const files: Record<string, {
          id: string;
          mimeType: string;
          dataURL: string;
          created: number;
        }> = {};
        if (result.newAssetUrls.length > 0) {
          const fetchUrls = resolveAssetUrl
            ? result.newAssetUrls.map(resolveAssetUrl)
            : result.newAssetUrls;
          await Promise.all(
            fetchUrls.map(async (fetchUrl, i) => {
              const originalUrl = result.newAssetUrls[i] ?? fetchUrl;
              try {
                const assetRes = await fetch(fetchUrl, {
                  credentials: fetchUrl.startsWith("/") ? "include" : "omit",
                });
                if (!assetRes.ok) return;
                const blob = await assetRes.blob();
                const dataURL = await blobToDataUrl(blob);
                for (const el of result.scene.values()) {
                  if (el.assetUrl !== originalUrl || el.type !== "image") continue;
                  files[`wba-${el.id}`] = {
                    id: `wba-${el.id}`,
                    mimeType: blob.type || "image/png",
                    dataURL,
                    created: Date.now(),
                  };
                }
              } catch {
                // best-effort; missing image just won't render
              }
            })
          );
        }
        if (cancelled) return;

        // 5. Export to canvas → data URL, honoring the active WB theme.
        //
        // THEME_FILTER = "invert(93%) hue-rotate(180deg)" is applied to the
        // export canvas context when exportWithDarkMode=true. This filter
        // is what Excalidraw uses to simulate dark mode at export time.
        //
        // Because elements store CANONICAL Excalidraw ink (#1e293b, near-black)
        // — WbStrokePropsPanel always stores EXCALIDRAW_STROKE_HEX regardless
        // of the UI theme — the live dark board relies on this same filter to
        // invert near-black strokes into near-white at render time.
        //
        // viewBackgroundColor must be WHITE (#ffffff) here regardless of theme:
        //   • Dark mode (exportWithDarkMode=true):  THEME_FILTER inverts white
        //     → near-black (#121212) background ✓; inverts #1e293b strokes →
        //     near-white strokes ✓.
        //   • Light mode (exportWithDarkMode=false): no filter; white background
        //     + near-black #1e293b strokes → correct light mode ✓.
        //
        // The prior "fix" incorrectly passed EXCALIDRAW_BG_DARK_HEX (#121212)
        // as viewBackgroundColor for dark mode. The THEME_FILTER then inverted
        // that dark bg to near-white (#dedede), making strokes nearly invisible
        // against a light background — the exact symptom Andrew reported.
        const canvas = await exportToCanvas({
          elements: capturedElements as unknown[],
          appState: {
            exportBackground: true,
            // Always white: THEME_FILTER (active when exportWithDarkMode=true)
            // inverts this to near-black for the dark bg; unchanged for light.
            viewBackgroundColor: EXCALIDRAW_BG_LIGHT_HEX,
            exportWithDarkMode: isDark,
            theme: isDark ? "dark" : "light",
          },
          files,
          maxWidthOrHeight: 1200,
          exportPadding: 16,
        });
        if (cancelled) return;

        const dataUrl = (canvas as HTMLCanvasElement).toDataURL("image/png");
        setImgSrc(dataUrl);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventsProxyUrl, resolvedTheme, whiteboardSessionId]);

  if (loadState === "empty") {
    return (
      <div
        className={`wb-review-board-thumbnail-empty${className ? ` ${className}` : ""}`}
        data-testid="wb-review-board-thumbnail-empty"
      >
        <span className="muted" style={{ fontSize: 13 }}>
          No board strokes recorded
        </span>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="muted" style={{ fontSize: 12, padding: 12 }}>
        Board preview unavailable
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div
        className={`wb-review-board-thumbnail-placeholder${className ? ` ${className}` : ""}`}
        data-testid="wb-review-board-thumbnail-loading"
      />
    );
  }

  // Live path — session has graph embeds; render JSXGraph directly (reliable in hero thumbnail).
  if (loadState === "ready-live") {
    const graphElement = findGraphEmbeddableElement(liveElements);
    if (graphElement) {
      return (
        <ReviewGraphOnlyThumbnail element={graphElement} className={className} />
      );
    }
    return (
      <ReviewBoardLive
        elements={liveElements}
        isDark={liveIsDark}
        className={className}
      />
    );
  }

  return (
    // next/image does not support data: URLs (base64 PNGs from exportToCanvas).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc ?? ""}
      alt="Final whiteboard board state"
      className={`wb-review-board-thumbnail${className ? ` ${className}` : ""}`}
      data-testid="wb-review-board-thumbnail"
    />
  );
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
