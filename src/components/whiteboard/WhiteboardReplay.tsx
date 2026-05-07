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
 *   5. Mount an audio element. While `playing`, drive a rAF loop
 *      that maps `audio.currentTime * 1000` → reconstructed scene
 *      → Excalidraw `updateScene`.
 *   6. Replay uses **the same stroke/fill colours** persisted in the
 *      canonical log (`strokeColor`) so tutors see parity with live
 *      mode; `clientId` remains on elements for diagnostics only.
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
  WB_EVENT_LOG_SCHEMA_VERSION,
  maxEventTimestampMs,
  reconstructSceneAt,
  type WBElement,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import { toExcalidraw } from "@/lib/whiteboard/excalidraw-adapter";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";

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
 * Minimal structural type for the bits of `ExcalidrawImperativeAPI`
 * we touch from the replay player. Mirrors the shape used by the
 * tutor workspace + insert helpers.
 */
type ReplayApi = {
  updateScene: (data: {
    elements?: ReadonlyArray<unknown>;
    appState?: Record<string, unknown>;
  }) => void;
  addFiles: (
    files: Array<{
      id: string;
      mimeType: "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp" | "image/gif";
      dataURL: string;
      created: number;
    }>
  ) => void;
  scrollToContent?: (
    target?: ReadonlyArray<unknown>,
    opts?: { fitToContent?: boolean; animate?: boolean }
  ) => void;
};

export type WhiteboardReplayProps = {
  /** Public-or-signed URL to the events.json on Vercel Blob. */
  eventsBlobUrl: string;
  /** Optional URL to the session audio (mp4/webm). */
  audioBlobUrl?: string | null;
  /** Mime type for the audio (drives the Chrome WebM duration hack). */
  audioMimeType?: string | null;
  /** Optional URL to a final-snapshot PNG (preview before play). */
  snapshotBlobUrl?: string | null;
  /** Display label, e.g. "Recording of Liam's session, Apr 23 2026". */
  title?: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; log: WBEventLog }
  | { kind: "error"; message: string };

export default function WhiteboardReplay(props: WhiteboardReplayProps) {
  const {
    eventsBlobUrl,
    audioBlobUrl,
    audioMimeType,
    snapshotBlobUrl,
    title,
  } = props;

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [api, setApi] = useState<ReplayApi | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [audioElapsedMs, setAudioElapsedMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Excalidraw may clear scene on `updateScene({ appState })`; re-send last paint. */
  const lastSceneElementsRef = useRef<readonly unknown[]>([]);
  /**
   * Which `excalidrawAPI` instance has received the “initial” scene apply.
   * Reset when the event log URL changes so a new recording repaints even if
   * Excalidraw reuses the same API object reference.
   */
  const initialPaintApiRef = useRef<ReplayApi | null>(null);
  /** Coalesce replay ticks; reset when switching recordings. */
  const lastBuiltAtMsRef = useRef<number>(-1);
  const registeredAssetUrlsRef = useRef<Set<string>>(new Set());

  const excalidrawTheme = useExcalidrawThemeFromSystem();
  const viewBackground =
    excalidrawTheme === "dark" ? "#121212" : "#ffffff";

  const replayAudioMime = useMemo(
    () => audioMimeType?.split(";")[0].trim().toLowerCase(),
    [audioMimeType]
  );

  // -----------------------------------------------------------------
  // 1. Fetch + parse + schema-version dispatch
  // -----------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    lastSceneElementsRef.current = [];
    initialPaintApiRef.current = null;
    registeredAssetUrlsRef.current.clear();
    lastBuiltAtMsRef.current = -1;
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
    const urls = collectAssetUrls(loadState.log);
    if (urls.length === 0) return;
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
  }, [loadState]);

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

  const applySceneAt = useCallback(
    (timeMs: number) => {
      if (loadState.kind !== "ready" || !api) return;
      // Coalesce — if the audio element ticks twice within the same
      // millisecond bucket we skip work.
      if (lastBuiltAtMsRef.current === timeMs) return;
      lastBuiltAtMsRef.current = timeMs;

      const scene = reconstructSceneAt(loadState.log, timeMs);
      const excalidrawElements: unknown[] = [];
      const newAssetUrls: string[] = [];
      for (const el of scene.values()) {
        const ex = toExcalidraw(el);
        excalidrawElements.push(ex);
        if (
          el.assetUrl &&
          !registeredAssetUrlsRef.current.has(el.assetUrl)
        ) {
          newAssetUrls.push(el.assetUrl);
          registeredAssetUrlsRef.current.add(el.assetUrl);
        }
      }
      lastSceneElementsRef.current = excalidrawElements;
      api.updateScene({ elements: excalidrawElements });
      // Kick off image fetches in the background — Excalidraw will
      // call `getFiles()` or look in `BinaryFiles` on next render
      // tick, and addFiles is what populates that.
      if (newAssetUrls.length > 0) {
        void registerImageAssets(api, scene, newAssetUrls);
      }
    },
    [api, loadState]
  );

  // First paint after Excalidraw mount **for this API instance**.
  //
  // Excalidraw may invoke `excalidrawAPI` more than once (internal remounts).
  // A single `didInitialPaintRef=true` wrongly skipped subsequent instances,
  // leaving a blank canvas despite a loaded log.
  //
  // With **audio**, start at t=0 — the `<audio>` element drives the clock.
  // With **no audio**, show the **final** frame: use `max(durationMs,
  // latest event t)` so a stale/wrong top-level duration never clips strokes.
  useEffect(() => {
    if (loadState.kind !== "ready" || !api) return;
    if (initialPaintApiRef.current === api) return;
    initialPaintApiRef.current = api;
    const noSessionAudio = !audioBlobUrl;
    const log = loadState.log;
    const finalClockMs = Math.max(log.durationMs, maxEventTimestampMs(log));
    const initialT = noSessionAudio ? finalClockMs : 0;
    lastBuiltAtMsRef.current = -1;
    applySceneAt(initialT);
    setAudioElapsedMs(initialT);
    const id = setTimeout(() => {
      try {
        api.scrollToContent?.(undefined, {
          fitToContent: true,
          animate: false,
        });
      } catch {
        // ignore — cosmetic
      }
    }, 0);
    return () => clearTimeout(id);
  }, [api, audioBlobUrl, loadState, applySceneAt]);

  // -----------------------------------------------------------------
  // 5. Audio-driven scene loop. We use rAF (not setInterval) so the
  // scene update lands inside the browser's paint cycle — feels
  // smoother and stays in sync with the audio scrubber's repaint.
  // -----------------------------------------------------------------

  useEffect(() => {
    if (loadState.kind !== "ready") return;
    if (!audioBlobUrl) {
      // Final scene is applied in the “first paint” effect once `api` exists;
      // nothing to drive a play head without session audio.
      return;
    }
    const el = audioRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const tick = () => {
      const ms = Math.floor(el.currentTime * 1000);
      setAudioElapsedMs(ms);
      applySceneAt(ms);
      rafId = window.requestAnimationFrame(tick);
    };
    const onPlay = () => {
      if (rafId === null) rafId = window.requestAnimationFrame(tick);
    };
    const onPause = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      // One trailing tick so the visible scene matches the audio's
      // final position (rAF cancellation can drop the last paint).
      const ms = Math.floor(el.currentTime * 1000);
      setAudioElapsedMs(ms);
      applySceneAt(ms);
    };
    const onSeeked = () => {
      const ms = Math.floor(el.currentTime * 1000);
      setAudioElapsedMs(ms);
      applySceneAt(ms);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("seeked", onSeeked);
    el.addEventListener("loadedmetadata", () => setAudioReady(true));
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("seeked", onSeeked);
    };
  }, [audioBlobUrl, applySceneAt, loadState]);

  /** Keep replay canvas chrome aligned with prefers-color-scheme. */
  useEffect(() => {
    if (!api) return;
    try {
      api.updateScene({
        elements: lastSceneElementsRef.current as unknown[],
        appState: {
          theme: excalidrawTheme,
          viewBackgroundColor: viewBackground,
        },
      });
    } catch {
      /* ignore */
    }
  }, [api, excalidrawTheme, viewBackground]);

  // -----------------------------------------------------------------
  // 6. Render
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
  const hasAudio = !!audioBlobUrl;
  /** Wall clock for “end of log” — never below the last event `t`. */
  const finalReplayClockMs = Math.max(
    log.durationMs,
    maxEventTimestampMs(log)
  );

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

      {!hasAudio && log.events.length > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: 720 }}>
          No session audio is attached, so there is no play/seek control. The
          board below shows the <strong>final</strong> whiteboard at the end of
          the log (t={formatDurationMs(finalReplayClockMs)}). When we record
          classroom audio, the bar above will provide play/pause and drive the
          scene in sync.
        </p>
      )}

      {hasAudio && (
        <div style={{ display: "grid", gap: 4 }}>
          <audio
            ref={audioRef}
            controls
            preload="metadata"
            src={audioBlobUrl ?? undefined}
            {...(replayAudioMime
              ? { type: replayAudioMime }
              : {})}
            data-testid="wb-replay-audio"
            style={{ width: "100%" }}
          />
          {!audioReady && (
            <span className="muted" style={{ fontSize: 11 }}>
              Audio loading… you can press Play once it&apos;s ready.
            </span>
          )}
        </div>
      )}

      <div className="muted" style={{ fontSize: 11, textAlign: "right" }}>
        Replay time · t={formatDurationMs(audioElapsedMs)}
        {hasAudio && (
          <span className="muted" style={{ marginLeft: 8 }}>
            Session log span · {formatDurationMs(finalReplayClockMs)}
          </span>
        )}
      </div>

      <div style={{ height: "calc(100vh - 320px)", minHeight: 420 }}>
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
            elements: [],
            appState: {
              viewBackgroundColor: viewBackground,
              theme: excalidrawTheme,
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
          we use elsewhere; for the replay player the audio file's
          duration header has been finalized server-side, so the hack
          isn't needed. We surface the mime in the UI for debugging. */}
      {hasAudio && audioMimeType && (
        <div className="muted" style={{ fontSize: 11 }}>
          Audio mime: {audioMimeType}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

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

/**
 * Schema-version dispatch. Every `schemaVersion` we accept must
 * appear in this switch — adding a new version is a deliberate
 * action that requires a code change, so an old player can never
 * silently misinterpret a future log format.
 *
 * For v1 (current) the on-disk shape is exactly `WBEventLog`, so
 * the parsed JSON IS the log. Future versions will need migration
 * functions that lift the older shape into the current one.
 */
export function parseEventLogBySchema(raw: unknown): WBEventLog {
  const candidate = raw as { schemaVersion?: unknown };
  switch (candidate.schemaVersion) {
    case 1:
      // Validate the bare-minimum top-level shape. We don't deep-
      // validate every WBEvent — the writer is our own code and
      // we already test it heavily. A malformed event would surface
      // as a missing-field render glitch, not a crash, because
      // `reconstructSceneAt` synthesises minimum elements for stray
      // updates.
      return validateV1Shape(candidate);
    default:
      throw new Error(
        `Unsupported whiteboard events schemaVersion: ${String(candidate.schemaVersion)}. ` +
          `This player understands schemaVersion=${WB_EVENT_LOG_SCHEMA_VERSION}.`
      );
  }
}

function validateV1Shape(raw: unknown): WBEventLog {
  const v = raw as Partial<WBEventLog>;
  if (typeof v.startedAt !== "string") {
    throw new Error("Events file missing `startedAt`.");
  }
  if (typeof v.durationMs !== "number") {
    throw new Error("Events file missing `durationMs`.");
  }
  if (!Array.isArray(v.events)) {
    throw new Error("Events file missing `events` array.");
  }
  return v as WBEventLog;
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
 * NOTE: we re-derive a `fileId` here using a hash of the URL so that
 * the same URL always maps to the same fileId across re-renders, and
 * we patch each affected scene element's `fileId` to match. The
 * recorder DOES write a `fileId` into the canonical log via the
 * adapter — but we redo it here defensively because we want this
 * component to also work for replays of logs that omitted fileId
 * (older recordings, or future schema variants).
 */
async function registerImageAssets(
  api: ReplayApi,
  scene: Map<string, WBElement>,
  newAssetUrls: string[]
): Promise<void> {
  const filesToRegister: Array<{
    id: string;
    mimeType: "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp" | "image/gif";
    dataURL: string;
    created: number;
  }> = [];
  for (const url of newAssetUrls) {
    try {
      const res = await fetch(url, {
        credentials: url.startsWith("/") ? "include" : "omit",
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataURL = await blobToDataUrl(blob);
      const mime = normalizeAssetMime(blob.type) ?? "image/png";
      const fileId = stableHashFileId(url);
      filesToRegister.push({
        id: fileId,
        mimeType: mime,
        dataURL,
        created: Date.now(),
      });
      // Best-effort: stamp matching scene elements with this fileId.
      // Excalidraw renders an image element via the (fileId, files
      // map) pair, so without this it wouldn't pick up the bitmap.
      for (const el of scene.values()) {
        if (el.assetUrl === url && el.type === "image") {
          (el as unknown as { fileId?: string }).fileId = fileId;
        }
      }
    } catch (err) {
      console.warn("[WhiteboardReplay] Could not load asset", url, err);
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
