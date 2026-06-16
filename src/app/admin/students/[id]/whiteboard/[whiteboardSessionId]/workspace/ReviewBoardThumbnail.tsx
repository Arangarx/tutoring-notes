"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WBEventLog } from "@/lib/whiteboard/event-log";
import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";
import { parseEventLogBySchema } from "@/lib/whiteboard/replay-parse";
import {
  createCameraFitter,
  createScenePainter,
  type ScenePaintApi,
} from "@/lib/whiteboard/scene-paint";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";
import {
  credentialsForReplayFetch,
  readReplayJsonError,
} from "@/lib/whiteboard/replay-helpers";
import {
  getReplayCachedRestoreElements,
  preloadReplayRestoreElements,
} from "@/lib/whiteboard/replay-restore-elements";
import { registerImageAssets } from "@/components/whiteboard/replay/ReplayCanvasSurface";
import type { ReplayApi } from "@/lib/whiteboard/replay-helpers";

type Props = {
  eventsProxyUrl: string;
  whiteboardSessionId?: string;
  className?: string;
};

/**
 * Hero-state final-frame board thumbnail (S1) — no scrubber, no audio.
 * Paints the last event-log frame (all boards share one log; final t = end state).
 */
export function ReviewBoardThumbnail({
  eventsProxyUrl,
  whiteboardSessionId,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "empty" | "error"
  >("loading");
  const [log, setLog] = useState<WBEventLog | null>(null);
  const [api, setApi] = useState<ScenePaintApi | null>(null);
  const lastElementsRef = useRef<readonly unknown[]>([]);
  const paintedRef = useRef(false);
  const excalidrawTheme = useExcalidrawThemeFromSystem();

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

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setLog(null);
    paintedRef.current = false;
    void (async () => {
      try {
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
        if (parsed.events.length === 0) {
          if (!cancelled) setLoadState("empty");
          return;
        }
        await preloadReplayRestoreElements();
        if (cancelled) return;
        setLog(parsed);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventsProxyUrl]);

  const paintFinalFrame = useCallback(() => {
    if (!api || !log || paintedRef.current) return;
    const totalMs = Math.max(log.durationMs, maxEventTimestampMs(log));
    const registeredAssetUrls = new Set<string>();
    const painter = createScenePainter({
      log,
      api,
      restoreElements: getReplayCachedRestoreElements() ?? undefined,
      registeredAssetUrls,
    });
    const result = painter.applyAt(totalMs);
    lastElementsRef.current = result.paintedElements;

    // Register any image assets the scene references (mirrors ReplayCanvasSurface).
    if (result.newAssetUrls.length > 0) {
      const resolvedUrls = resolveAssetUrl
        ? result.newAssetUrls.map(resolveAssetUrl)
        : result.newAssetUrls;
      void registerImageAssets(
        api as unknown as ReplayApi,
        result.scene,
        resolvedUrls,
        result.newAssetUrls
      );
    }

    const container = containerRef.current;
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
      // Container not laid out yet — set up a ResizeObserver to retry.
      // Do NOT mark paintedRef here so we try again once dimensions arrive.
      if (!container) return;
      const ro = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          ro.disconnect();
          // Re-run fit now that the container has dimensions.
          const fitter = createCameraFitter({
            api,
            container,
            getElements: () => lastElementsRef.current,
            zoom: 1,
            onFit: () => {
              paintedRef.current = true;
            },
          });
          fitter.fit();
        }
      });
      ro.observe(container);
      return;
    }

    const fitter = createCameraFitter({
      api,
      container,
      getElements: () => lastElementsRef.current,
      zoom: 1,
      onFit: () => {
        // Only mark painted after fit actually succeeds.
        paintedRef.current = true;
      },
    });
    fitter.fit();
  }, [api, log, resolveAssetUrl]);

  useEffect(() => {
    paintFinalFrame();
  }, [paintFinalFrame]);

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
    <div
      ref={containerRef}
      className={`wb-review-board-thumbnail${className ? ` ${className}` : ""}`}
      data-testid="wb-review-board-thumbnail"
    >
      <ExcalidrawDynamic
        viewModeEnabled
        gridModeEnabled={false}
        zenModeEnabled
        theme={excalidrawTheme}
        name="wb-review-thumbnail"
        UIOptions={{ canvasActions: { saveToActiveFile: false } }}
        excalidrawAPI={(instance: ScenePaintApi) => setApi(instance)}
        initialData={{ elements: [], appState: { currentItemFontFamily: 1 } }}
      />
    </div>
  );
}
