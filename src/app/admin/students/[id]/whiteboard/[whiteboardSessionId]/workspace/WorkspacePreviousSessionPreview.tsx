"use client";

/**
 * Preview-before-Start surface for an already-ended whiteboard session.
 *
 * Pillar 4 follow-on (master plan Phase 1 Task 6). When a tutor opens
 * the workspace route for a session whose `endedAt` is set, we no
 * longer redirect to the read-only review page — instead we render
 * this component, which:
 *
 *   1. Fetches the canonical events.json via the same admin proxy
 *      replay uses (`/api/whiteboard/[sessionId]/events`).
 *   2. Paints the FINAL frame of that log via the shared scene-paint
 *      engine (`createScenePainter.applyAt`), with Excalidraw mounted
 *      in `viewModeEnabled: true` so the canvas is read-only.
 *   3. Fits the camera with the engine's bbox math (same as replay).
 *   4. Renders a "Start a new whiteboard session" affordance — the
 *      existing consent-modal `<StartWhiteboardSession>` — so the
 *      tutor can mint a fresh session in one click.
 *
 * Why a separate component (rather than reusing `<WhiteboardReplay>`):
 *   - Replay carries audio + scrubber + multi-track state; this
 *     surface needs neither.
 *   - The preview is tied to the workspace route, not the review
 *     route — keeping the rendering local to the workspace tree
 *     avoids accidental coupling (e.g. a future replay UX change
 *     wouldn't reshape the preview-before-start surface).
 *   - Exercising the scene-paint engine in TWO surfaces is the
 *     entire point of Pillar 4; a separate consumer proves the
 *     engine is composable, not just embeddable inside replay.
 *
 * Reliability posture (Sarah-bar):
 *   - Snapshot fallback. If events.json fails to parse or is empty
 *     and a `snapshotBlobUrl` is available, we surface the snapshot
 *     PNG as a static thumbnail (the parent share's "open as image"
 *     link, in-page). The "Start a new session" button stays
 *     enabled regardless — the preview is decorative; minting a
 *     fresh session must always be one click away.
 *   - Network/parse errors degrade to a friendly card, never a
 *     stack trace.
 *
 * Logging convention: per-session `wbsid=<id>` plus `pvw=<short>`
 * (3-letter capture prefix per AGENTS.md ID-logging rule).
 *
 * Tests: `src/__tests__/dom/WorkspacePreviewBeforeStart.dom.test.tsx`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";
import { parseEventLogBySchema } from "@/lib/whiteboard/replay-parse";
import {
  maxEventTimestampMs,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import {
  createCameraFitter,
  createScenePainter,
  type ScenePaintApi,
} from "@/lib/whiteboard/scene-paint";
import { StartWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/StartWhiteboardSession";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; log: WBEventLog }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export type WorkspacePreviousSessionPreviewProps = {
  whiteboardSessionId: string;
  studentId: string;
  studentName: string;
  startedAtIso: string;
  endedAtIso: string;
  durationSeconds: number | null;
  /**
   * Same proxied URL pattern the admin review page uses. Passed in
   * (rather than constructed inside) so the page-level component
   * stays the single owner of route URLs.
   */
  eventsProxyUrl: string;
  /**
   * Proxy URL for the snapshot PNG, when one exists. Used as a
   * decorative fallback if the event log can't be replayed in this
   * surface.
   */
  snapshotProxyUrl: string | null;
  /**
   * Path of the read-only review page so the tutor can jump to the
   * full replay (with audio scrubber etc.) without re-navigating
   * via the back button.
   */
  reviewHref: string;
};

const PVW = (): string => Math.random().toString(36).slice(2, 7);

/**
 * Client-mount-safe date renderer. Avoids React hydration mismatch
 * (error #418) caused by `Date.toLocaleString()` returning UTC during
 * SSR but the user's local TZ during client hydration — that mismatch
 * was tearing down + remounting this entire subtree, which raced with
 * the Excalidraw mount + `applyAt` paint and left the preview canvas
 * blank even though the engine reported `elements=N>0`. See the
 * 2026-05-12 smoke notes in `docs/BACKLOG.md`.
 *
 * The initial render value (`iso`) is the same on server and client,
 * so hydration is clean. The `useEffect` then swaps to the locally-
 * formatted string after mount.
 */
function FormattedTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string>(iso);
  useEffect(() => {
    setText(new Date(iso).toLocaleString());
  }, [iso]);
  return <>{text}</>;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function WorkspacePreviousSessionPreview(
  props: WorkspacePreviousSessionPreviewProps
) {
  const {
    whiteboardSessionId,
    studentId,
    studentName,
    startedAtIso,
    endedAtIso,
    durationSeconds,
    eventsProxyUrl,
    snapshotProxyUrl,
    reviewHref,
  } = props;

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [api, setApi] = useState<ScenePaintApi | null>(null);
  const [restoreReady, setRestoreReady] = useState(false);
  const restoreElementsRef = useRef<
    | (typeof import("@excalidraw/excalidraw"))["restoreElements"]
    | null
  >(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastSceneElementsRef = useRef<readonly unknown[]>([]);
  const initialPaintApiRef = useRef<ScenePaintApi | null>(null);
  const pvwRef = useRef<string>(PVW());

  const excalidrawTheme = useExcalidrawThemeFromSystem();

  // -----------------------------------------------------------------
  // Fetch + parse the events log
  // -----------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setLoadState({ kind: "loading" });
    const pvw = pvwRef.current;
    void (async () => {
      try {
        // Same-origin admin proxy needs the tutor cookie. credentials:
        // "include" matches WhiteboardReplay's branch for same-origin
        // proxy URLs; we never construct a cross-origin URL here.
        const res = await fetch(eventsProxyUrl, { credentials: "include" });
        if (!res.ok) {
          throw new Error(
            `Could not load previous session (status ${res.status}).`
          );
        }
        const text = await res.text();
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          throw new Error(
            "Previous session events file isn't valid JSON. The bytes may have been deleted or moved."
          );
        }
        const log = parseEventLogBySchema(raw);
        if (cancelled) return;
        if (log.events.length === 0) {
          console.log(
            `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} log empty — falling back to snapshot/empty card`
          );
          setLoadState({ kind: "empty" });
          return;
        }
        console.log(
          `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} log loaded events=${log.events.length}`
        );
        setLoadState({ kind: "ready", log });
      } catch (err) {
        if (cancelled) return;
        const message =
          (err as Error)?.message ?? "Could not load previous session.";
        console.warn(
          `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} load failed:`,
          message
        );
        setLoadState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventsProxyUrl, whiteboardSessionId]);

  // -----------------------------------------------------------------
  // Preload restoreElements before the first paint, mirroring replay
  // -----------------------------------------------------------------

  useEffect(() => {
    if (loadState.kind !== "ready") {
      setRestoreReady(false);
      return undefined;
    }
    let cancelled = false;
    void import("@excalidraw/excalidraw").then((m) => {
      restoreElementsRef.current = m.restoreElements;
      if (!cancelled) setRestoreReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadState]);

  // -----------------------------------------------------------------
  // Paint final frame + fit camera (one-shot — preview is static)
  // -----------------------------------------------------------------

  const paintAndFit = useCallback(() => {
    if (loadState.kind !== "ready" || !api || !restoreReady) return;
    if (initialPaintApiRef.current === api) return;
    initialPaintApiRef.current = api;
    const pvw = pvwRef.current;

    const painter = createScenePainter({
      log: loadState.log,
      api,
      restoreElements: restoreElementsRef.current ?? undefined,
    });
    const finalT = Math.max(
      loadState.log.durationMs,
      maxEventTimestampMs(loadState.log)
    );
    const result = painter.applyAt(finalT, { preserveScroll: false });
    lastSceneElementsRef.current = result.paintedElements;
    console.log(
      `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} painted final frame at t=${finalT}ms elements=${result.paintedElements.length}`
    );

    const container = containerRef.current;
    if (!container) return;
    const fitter = createCameraFitter({
      api,
      container,
      getElements: () => lastSceneElementsRef.current,
      zoom: 1,
    });
    fitter.fit();
  }, [api, loadState, restoreReady, whiteboardSessionId]);

  useEffect(() => {
    paintAndFit();
  }, [paintAndFit]);

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  const durationLabel = useMemo(
    () => formatDuration(durationSeconds),
    [durationSeconds]
  );

  return (
    <div
      style={{ display: "grid", gap: 12 }}
      data-testid="wb-preview-before-start"
    >
      <div
        className="card"
        style={{
          padding: "12px 14px",
          background: "rgba(37, 99, 235, 0.06)",
          border: "1px solid rgba(37, 99, 235, 0.22)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          Previous whiteboard session — read-only preview
        </div>
        <p
          className="muted"
          style={{ margin: "6px 0 10px", fontSize: 13, lineHeight: 1.4 }}
        >
          This session ended on <FormattedTime iso={endedAtIso} />. The
          board below is a snapshot of where you and {studentName} left
          off. Start a new session to begin recording again — the new
          canvas will be empty.
        </p>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <StartWhiteboardSession studentId={studentId} />
          <Link href={reviewHref} className="btn">
            Open full replay
          </Link>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 0,
          minHeight: 480,
          height: "max(480px, calc(100vh - 360px))",
          width: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        data-testid="wb-preview-canvas-mount"
      >
        {loadState.kind === "loading" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="muted">Loading previous session…</span>
          </div>
        )}

        {loadState.kind === "error" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 24,
              textAlign: "center",
            }}
            data-testid="wb-preview-error"
          >
            <div className="muted" style={{ fontSize: 13, maxWidth: 480 }}>
              {loadState.message} Use the “Open full replay” link above to
              try the read-only review surface, or start a new session to
              keep going.
            </div>
            {snapshotProxyUrl && (
              <a
                href={snapshotProxyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn"
              >
                Open last snapshot
              </a>
            )}
          </div>
        )}

        {loadState.kind === "empty" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 24,
              textAlign: "center",
            }}
            data-testid="wb-preview-empty"
          >
            <div className="muted" style={{ fontSize: 13, maxWidth: 480 }}>
              Nothing was drawn during the previous session. Start a new
              session above to record some work.
            </div>
            {snapshotProxyUrl && (
              <a
                href={snapshotProxyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn"
              >
                Open last snapshot
              </a>
            )}
          </div>
        )}

        {loadState.kind === "ready" && (
          <div
            ref={containerRef}
            style={{ flex: 1, minHeight: 400, width: "100%" }}
          >
            <ExcalidrawDynamic
              style={{ width: "100%", height: "100%" }}
              viewModeEnabled
              gridModeEnabled={false}
              theme={excalidrawTheme}
              UIOptions={{
                canvasActions: {
                  saveToActiveFile: false,
                  loadScene: false,
                  changeViewBackgroundColor: false,
                  toggleTheme: false,
                },
              }}
              excalidrawAPI={(instance: unknown) => {
                setApi(instance as ScenePaintApi);
              }}
              initialData={{
                elements: [],
                appState: { currentItemFontFamily: 1 },
              }}
              name={`whiteboard-preview-${whiteboardSessionId}`}
            />
          </div>
        )}
      </div>

      <div
        className="muted"
        style={{ fontSize: 11, textAlign: "right" }}
        data-testid="wb-preview-meta"
      >
        wbsid={whiteboardSessionId.slice(0, 8)} · started{" "}
        <FormattedTime iso={startedAtIso} /> · ended{" "}
        <FormattedTime iso={endedAtIso} />
        {durationLabel ? ` · duration ${durationLabel}` : ""}
      </div>
    </div>
  );
}
