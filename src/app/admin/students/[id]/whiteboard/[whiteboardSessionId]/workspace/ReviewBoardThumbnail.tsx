"use client";

import { useEffect, useState } from "react";
import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";
import { parseEventLogBySchema } from "@/lib/whiteboard/replay-parse";
import {
  createScenePainter,
  type ScenePaintApi,
} from "@/lib/whiteboard/scene-paint";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";
import {
  credentialsForReplayFetch,
  readReplayJsonError,
} from "@/lib/whiteboard/replay-helpers";
import {
  getReplayCachedRestoreElements,
  setReplayCachedRestoreElements,
} from "@/lib/whiteboard/replay-restore-elements";
import { EXCALIDRAW_BG_DARK_HEX, EXCALIDRAW_BG_LIGHT_HEX } from "@/styles/token-values";
import { useTheme } from "@/components/ThemeProvider";
import type { ExportToCanvasFn } from "@/lib/whiteboard/snapshot-png";

type Props = {
  eventsProxyUrl: string;
  whiteboardSessionId?: string;
  className?: string;
};

/**
 * Hero-state final-frame board thumbnail (S1) — static PNG export.
 *
 * Instead of mounting a live Excalidraw (which caused flash-then-black when
 * Excalidraw re-initialised its API and the one-shot `paintedRef` blocked
 * the repaint), we:
 *   1. Fetch + parse the event log.
 *   2. Build the final scene via `createScenePainter().applyAt(totalMs)`.
 *   3. Export to a canvas via `exportToCanvas` from @excalidraw/excalidraw.
 *   4. Render the canvas as a static `<img>`.
 *
 * No live Excalidraw runtime → no API re-init flash, no hamburger menu.
 * Empty session still shows the empty-state message.
 */
export function ReviewBoardThumbnail({
  eventsProxyUrl,
  whiteboardSessionId,
  className,
}: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "empty" | "error"
  >("loading");
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setImgSrc(null);

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

        // 5. Export to canvas → data URL, honoring the active WB theme
        const isDark = resolvedTheme === "dark";
        const canvas = await exportToCanvas({
          elements: capturedElements as unknown[],
          appState: {
            exportBackground: true,
            viewBackgroundColor: isDark ? EXCALIDRAW_BG_DARK_HEX : EXCALIDRAW_BG_LIGHT_HEX,
            exportWithDarkMode: isDark,
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
        className={className}
        data-testid="wb-review-board-thumbnail-empty"
        style={{
          minHeight: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
        }}
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
        className={className}
        data-testid="wb-review-board-thumbnail-loading"
        style={{ minHeight: 200, background: "var(--card)" }}
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
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        borderRadius: 8,
        border: "1px solid var(--border)",
      }}
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
