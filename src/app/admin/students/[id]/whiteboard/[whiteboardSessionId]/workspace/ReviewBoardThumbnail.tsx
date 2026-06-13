"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseEventLogBySchema } from "@/lib/whiteboard/replay-parse";
import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";
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

type Props = {
  eventsProxyUrl: string;
  whiteboardSessionId?: string;
  className?: string;
};

/**
 * Hero-state final-frame board thumbnail (S1) — no scrubber, no audio.
 */
export function ReviewBoardThumbnail({
  eventsProxyUrl,
  whiteboardSessionId,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        const log = parseEventLogBySchema(raw);
        if (log.events.length === 0) {
          if (!cancelled) setError("empty");
          return;
        }
        await preloadReplayRestoreElements();
        if (cancelled) return;
        setReady(true);
        // Paint happens when Excalidraw mounts via applyAt in onApi
        thumbnailLogRef.current = log;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load board");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventsProxyUrl]);

  const thumbnailLogRef = useRef<ReturnType<typeof parseEventLogBySchema> | null>(
    null
  );
  const lastElementsRef = useRef<readonly unknown[]>([]);

  const handleApi = (api: ScenePaintApi) => {
    const log = thumbnailLogRef.current;
    if (!log) return;
    const totalMs = Math.max(log.durationMs, maxEventTimestampMs(log));
    const painter = createScenePainter({
      log,
      api,
      restoreElements: getReplayCachedRestoreElements() ?? undefined,
      registeredAssetUrls: new Set(),
    });
    painter.applyAt(totalMs);
    const container = containerRef.current;
    if (container) {
      const fitter = createCameraFitter({
        api,
        container,
        getElements: () => lastElementsRef.current,
        zoom: 1,
        onFit: () => undefined,
      });
      fitter.fit();
    }
  };

  if (error === "empty") {
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

  if (error) {
    return (
      <div className="muted" style={{ fontSize: 12, padding: 12 }}>
        Board preview unavailable
      </div>
    );
  }

  if (!ready) {
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
      className={className}
      data-testid="wb-review-board-thumbnail"
      style={{
        minHeight: 200,
        height: 280,
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--card)",
      }}
    >
      <ExcalidrawDynamic
        viewModeEnabled
        gridModeEnabled={false}
        theme={excalidrawTheme}
        name="wb-review-thumbnail"
        UIOptions={{ canvasActions: { saveToActiveFile: false } }}
        excalidrawAPI={(instance: ScenePaintApi) => handleApi(instance)}
        initialData={{ elements: [], appState: { currentItemFontFamily: 1 } }}
      />
    </div>
  );
}
