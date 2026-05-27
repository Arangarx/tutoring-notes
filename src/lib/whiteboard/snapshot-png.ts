"use client";

/**
 * Whiteboard final-canvas snapshot PNG generator (Pillar 4 follow-on,
 * Phase 1c deliverable — Task 5 of the master plan).
 *
 * One job: at end-of-session time, snap the live Excalidraw canvas to
 * a PNG `Blob` so the parent share + admin review surfaces can show a
 * thumbnail / "open as image" link without re-mounting the whiteboard.
 *
 * Best-effort contract — read this before changing
 * ================================================
 *
 * **Snapshot generation MUST NEVER cost the tutor a session.** The
 * end-session flow is the moment the recording becomes durable; if a
 * snapshot bug throws here, the events.json upload + atomic
 * `endWhiteboardSession` action would be skipped and the session would
 * be lost. Every code path in this module is wrapped in try/catch and
 * surfaces failure as `null` (the caller passes `snapshotBlobUrl:
 * undefined` to the atomic action, which already treats it as
 * optional — see Phase 1b's `endWhiteboardSession` signature).
 *
 * Failure modes we have seen or can anticipate:
 *   - `exportToCanvas` throws on malformed legacy logs (same shape
 *     issue that made `restoreElements` throw in scene-paint).
 *   - Excalidraw view-mode quirks under iOS Safari memory pressure
 *     return a transparent or 0×0 canvas.
 *   - The browser's `canvas.toBlob` returns null on Safari when the
 *     canvas exceeds an internal pixel cap. The plan calls for a
 *     `maxWidthOrHeight: 2048` clamp to keep us well under any
 *     plausible cap, but the null branch is still handled.
 *   - `excalidrawAPI` is null/unmounted between when the tutor clicked
 *     End and when this function ran (race with refresh).
 *
 * The module logs `[snapshot-png] wbsid=… snp=…` lines for every
 * outcome so a prod debug session can grep one snapshot's full life.
 * `snp` is the 3-letter capture prefix per AGENTS.md ID-logging
 * convention; the wbsid is supplied by the caller via {@link
 * generateSessionSnapshotPng} so we never invent one here.
 *
 * Tests: `src/__tests__/whiteboard/snapshot-png.test.ts`.
 */

import { EXCALIDRAW_BG_LIGHT_HEX } from "@/styles/token-values";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";

// -----------------------------------------------------------------
// Public API
// -----------------------------------------------------------------

/**
 * Successful result. Sized to keep the consumer honest — the upload
 * helper logs the byte count and the atomic end-session action does
 * not re-measure.
 */
export type SnapshotPngResult = {
  blob: Blob;
  sizeBytes: number;
  mimeType: "image/png";
};

export type GenerateSnapshotOptions = {
  /**
   * For prod log correlation. The function logs `wbsid=<id>` on every
   * outcome. Optional — when omitted we log `wbsid=<unknown>` so
   * existing call sites don't break, but every production call site
   * should pass it.
   */
  whiteboardSessionId?: string;
  /**
   * Maximum bitmap dimension in pixels. Excalidraw's `exportToCanvas`
   * clamps the rendered output via this option so very wide / tall
   * boards don't blow past the browser's canvas pixel cap. The plan
   * recommends 2048; tests can pass a smaller value.
   */
  maxWidthOrHeight?: number;
  /**
   * Background colour for the exported canvas. Excalidraw renders
   * with a transparent background by default in view mode, which
   * looks unfinished as a thumbnail. The plan suggests white;
   * callers can override (e.g. `#121212` for dark boards).
   */
  backgroundColor?: string;
  /**
   * Optional injection of the Excalidraw `exportToCanvas` import. The
   * default is `() => import("@excalidraw/excalidraw")`; tests pass
   * a stub so jsdom doesn't have to load the >1MB Excalidraw bundle.
   *
   * Typed loose so the upstream signature changes don't ripple through
   * every test — we only consume the function shape we care about.
   */
  loadExcalidraw?: () => Promise<{
    exportToCanvas: ExportToCanvasFn;
  }>;
  /**
   * Optional logger override. Defaults to `console`. Tests use a
   * silent stub.
   */
  logger?: Pick<Console, "log" | "warn" | "error">;
};

/**
 * Structural type for Excalidraw's `exportToCanvas`. The real upstream
 * signature is more strict (branded readonly element types, narrowed
 * appState shape) — keeping this loose lets test stubs and future
 * Excalidraw upgrades pass through without forcing every call site to
 * cast. Failures inside `exportToCanvas` are caught and surfaced as
 * `null` from the public API, so the loose typing has no safety cost.
 */
export type ExportToCanvasFn = (args: {
  elements: ReadonlyArray<unknown>;
  appState: Record<string, unknown>;
  files: Readonly<Record<string, unknown>>;
  maxWidthOrHeight?: number;
  exportPadding?: number;
  getDimensions?: (
    width: number,
    height: number
  ) => { width: number; height: number; scale?: number };
}) => Promise<HTMLCanvasElement> | HTMLCanvasElement;

const SHORT_SNAP_ID = (): string =>
  Math.random().toString(36).slice(2, 7);

/**
 * Generate a PNG snapshot of the current Excalidraw scene. Returns
 * `null` on any failure — see the file header for the rationale.
 *
 * Implementation order (every step wrapped in try/catch):
 *
 *   1. Validate the api is mounted and the scene has at least one
 *      element. Empty scenes generate a blank PNG that's not useful
 *      as a thumbnail and would just chew Blob storage.
 *   2. Dynamically import `@excalidraw/excalidraw` for the
 *      `exportToCanvas` function (kept out of the SSR path). Test
 *      callers can pass `loadExcalidraw` to avoid the real import.
 *   3. Call `exportToCanvas` with the scene's elements + appState +
 *      files, clamped to `maxWidthOrHeight` (default 2048px).
 *   4. Convert the resulting `<canvas>` to a PNG `Blob` via
 *      `canvas.toBlob(cb, "image/png")`. The async-callback shape is
 *      necessary — Safari sometimes never invokes the callback if
 *      the canvas is too large; we time it out at 8 seconds and
 *      surface as null rather than hang the end-session flow.
 *   5. Return `{ blob, sizeBytes, mimeType }` on success.
 */
export async function generateSessionSnapshotPng(
  api: ExcalidrawApiLike | null,
  opts: GenerateSnapshotOptions = {}
): Promise<SnapshotPngResult | null> {
  const log = opts.logger ?? console;
  const wbsid = opts.whiteboardSessionId ?? "<unknown>";
  const snp = SHORT_SNAP_ID();
  const maxWidthOrHeight = opts.maxWidthOrHeight ?? 2048;

  // Step 1 — guard rails (api mounted, has elements).
  if (!api) {
    log.warn?.(
      `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: api is null (workspace unmounted before snapshot)`
    );
    return null;
  }

  let elements: ReadonlyArray<unknown>;
  let appState: Record<string, unknown>;
  let files: Readonly<Record<string, unknown>>;
  try {
    elements = api.getSceneElements();
    appState = api.getAppState() as unknown as Record<string, unknown>;
    files = api.getFiles?.() ?? {};
  } catch (err) {
    log.warn?.(
      `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: api accessor threw`,
      err
    );
    return null;
  }

  if (!elements || elements.length === 0) {
    log.log?.(
      `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: scene has no elements (no thumbnail to snap)`
    );
    return null;
  }

  // Step 2 — dynamic-import the Excalidraw module (or use the
  // injected stub).
  let exportToCanvas: ExportToCanvasFn;
  try {
    const loader =
      opts.loadExcalidraw ??
      (() =>
        import("@excalidraw/excalidraw").then((mod) => ({
          // The upstream `exportToCanvas` has a tighter signature than
          // our loose `ExportToCanvasFn`; cast through unknown so
          // we don't have to mirror the upstream branded types.
          exportToCanvas: mod.exportToCanvas as unknown as ExportToCanvasFn,
        })));
    const mod = await loader();
    if (typeof mod.exportToCanvas !== "function") {
      log.warn?.(
        `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: exportToCanvas not exported by @excalidraw/excalidraw (older bundle)`
      );
      return null;
    }
    exportToCanvas = mod.exportToCanvas;
  } catch (err) {
    log.warn?.(
      `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: dynamic import of @excalidraw/excalidraw failed`,
      err
    );
    return null;
  }

  // Step 3 — render to a canvas, with the upstream max-dimension
  // clamp doing the heavy lifting. exportPadding=16 matches what
  // Excalidraw uses by default for PNG exports; explicit so a future
  // upstream default change doesn't regress the look.
  let canvas: HTMLCanvasElement;
  try {
    const exportAppState: Record<string, unknown> = {
      ...appState,
      exportBackground: true,
      viewBackgroundColor: opts.backgroundColor ?? EXCALIDRAW_BG_LIGHT_HEX,
      exportWithDarkMode: false,
    };
    const result = await exportToCanvas({
      elements,
      appState: exportAppState,
      files,
      maxWidthOrHeight,
      exportPadding: 16,
    });
    if (!result || typeof (result as HTMLCanvasElement).toBlob !== "function") {
      log.warn?.(
        `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: exportToCanvas returned no canvas`
      );
      return null;
    }
    canvas = result as HTMLCanvasElement;
  } catch (err) {
    log.warn?.(
      `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: exportToCanvas threw`,
      err
    );
    return null;
  }

  // Step 4 — toBlob with an 8s safety timeout. Safari can silently
  // never call the callback when the canvas exceeds an internal
  // pixel cap; the timeout is the structural fix for that hang
  // (the maxWidthOrHeight clamp is the prevention). Either branch
  // returns null and lets end-session continue.
  let blob: Blob | null;
  try {
    blob = await canvasToPng(canvas, { timeoutMs: 8_000 });
  } catch (err) {
    log.warn?.(
      `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: canvas.toBlob threw`,
      err
    );
    return null;
  }
  if (!blob) {
    log.warn?.(
      `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: canvas.toBlob returned null (likely Safari pixel-cap or canvas tainted)`
    );
    return null;
  }
  if (blob.size === 0) {
    log.warn?.(
      `[snapshot-png] snp=${snp} wbsid=${wbsid} skip: canvas.toBlob produced 0-byte blob`
    );
    return null;
  }

  log.log?.(
    `[snapshot-png] snp=${snp} wbsid=${wbsid} ok elements=${elements.length} sizeBytes=${blob.size} maxWidthOrHeight=${maxWidthOrHeight}`
  );
  return { blob, sizeBytes: blob.size, mimeType: "image/png" };
}

/**
 * Promise-wrapper around `HTMLCanvasElement.toBlob`. Resolves with
 * the blob on success, `null` if the underlying call returned null,
 * or `null` if the call never completes within `timeoutMs`. The
 * caller treats either null branch the same way.
 *
 * Exported (in the same module file) so the test suite can pin both
 * the success and the timeout branches without spinning up a real
 * Excalidraw canvas.
 */
export function canvasToPng(
  canvas: HTMLCanvasElement,
  opts: { timeoutMs: number }
): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    let settled = false;
    const finish = (b: Blob | null) => {
      if (settled) return;
      settled = true;
      resolve(b);
    };
    const timer = setTimeout(() => finish(null), Math.max(0, opts.timeoutMs));
    try {
      canvas.toBlob((b) => {
        clearTimeout(timer);
        finish(b);
      }, "image/png");
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}
