"use client";

/**
 * Helpers for inserting raster images and rendered PDF pages into a
 * live Excalidraw scene.
 *
 * Two boundaries to cross:
 *
 *   1. Excalidraw's `BinaryFiles` table — every image element has a
 *      `fileId` that points into a per-scene file blob registry.
 *      `excalidrawAPI.addFiles([...])` is how we write to it.
 *
 *   2. Vercel Blob — we upload each image so that:
 *        a. The recording's events.json carries a stable `assetUrl`
 *           per element (the replay player loads bitmaps from there).
 *        b. The student client (joining mid-session) can load images
 *           via the asset URL even though they don't have the local
 *           dataURL the tutor's browser holds.
 *
 * The dataURL stays in Excalidraw's `BinaryFiles` map for the live
 * canvas; the URL goes into `customData.assetUrl` for replay + sync.
 *
 * Layout policy: PDF pages tile vertically with a fixed gap, anchored
 * just below the current viewport center. Single image inserts land
 * at the viewport center. The Wyzant whiteboard uses the same model
 * (paste-near-cursor) so Sarah's muscle memory carries over.
 */

import { EXCALIDRAW_STROKE_HEX } from "@/styles/token-values";
import {
  DEFAULT_GRAPH_BBOX,
  serializeGraphStateJson,
  type GraphState,
} from "@/lib/whiteboard/graph-state";
import { uploadWhiteboardAsset } from "@/lib/whiteboard/upload";
import type { PdfPageRender } from "@/lib/whiteboard/pdf-render";
import {
  scrollForViewportSceneCenter,
  viewportSceneCenterFromScroll,
} from "@/lib/whiteboard/viewport-align";

/**
 * Minimal structural type for the bits of Excalidraw's `ExcalidrawImperativeAPI`
 * we touch. Mirrors the one in `excalidraw-adapter.ts` — we keep our
 * own structural type so a future Excalidraw upgrade can't silently
 * break our callers.
 */
export type ExcalidrawApiLike = {
  getSceneElements: () => ReadonlyArray<unknown>;
  /** Excalidraw `BinaryFiles` map (keyed by file id) — used to back-fill `assetUrl` for native image inserts. */
  getFiles?: () => Readonly<Record<string, unknown>>;
  getAppState: () => {
    scrollX: number;
    scrollY: number;
    width: number;
    height: number;
    zoom: { value: number };
  };
  addFiles: (
    files: Array<{
      id: string;
      mimeType: "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp" | "image/gif";
      dataURL: string;
      created: number;
    }>
  ) => void;
  updateScene: (data: {
    elements?: ReadonlyArray<unknown>;
    collaborators?: Map<string, {
      pointer?: { x: number; y: number; tool: "pointer" | "laser"; renderCursor?: boolean; laserColor?: string };
      button?: "up" | "down";
      username?: string | null;
      color?: { background: string; stroke: string };
    }>;
    captureUpdate?: string;
  }) => void;
  scrollToContent?: (
    target?: ReadonlyArray<unknown>,
    opts?: { fitToContent?: boolean; animate?: boolean }
  ) => void;
};

export type InsertAssetCommonArgs = {
  excalidrawAPI: ExcalidrawApiLike;
  whiteboardSessionId: string;
  studentId: string;
};

export type InsertImageResult =
  | { ok: true; elementId: string; assetUrl: string }
  | { ok: false; reason: string };

export type InsertPdfResult =
  | {
      ok: true;
      elementIds: string[];
      assetUrls: string[];
      pagesInserted: number;
    }
  | { ok: false; reason: string };

export type PdfBoardBatchRow = {
  pageId: string;
  title: string;
  elements: ReadonlyArray<unknown>;
  file: {
    id: string;
    mimeType: "image/png";
    dataURL: string;
    created: number;
  };
  /**
   * Initial per-page viewport (Phase 5 task 8). Computed at insert time
   * so the PDF lands centered + zoomed-to-fit when the tutor (and student
   * via follow) first lands on the page. Without this, `selectTutorPage`
   * falls through the `vsNext`-absent branch and keeps the anchor page's
   * pan/zoom — which dwarfs or hides the fixed-width PDF image
   * depending on the tutor's anchor camera.
   *
   * Optional + additive: when omitted (legacy callers, future inserters
   * that don't yet plumb this), `selectTutorPage` falls through unchanged.
   */
  viewState?: { panX: number; panY: number; zoom: number };
};

export type InsertPdfBoardPagesIntegrate = {
  /** Snapshot tutor active tab before inserts — auto-nav only if unchanged at end. */
  getActivePageId: () => string;
  /**
   * Atomic commit: workspace freezes its current scene into `pageDataRef`,
   * appends rows to the page list, seeds the section registry, registers
   * BinaryFiles, and (if the anchor is still active) navigates to
   * `firstPageId`. Called ONCE per PDF — including partial-success — so
   * intermediate React state never leaks into broadcasts or onChange.
   */
  commitPdfBatch: (args: {
    sectionId: string;
    sectionLabel: string;
    anchorActivePageId: string;
    rows: PdfBoardBatchRow[];
    firstPageId: string;
  }) => void;
};

export type InsertPdfBoardPagesResult =
  | { ok: true; pagesInserted: number; sectionId: string; firstPageId: string }
  | { ok: false; reason: "upload-failed"; message: string };

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const PDF_PAGE_GAP_PX = 32;
/**
 * Width we render each PDF page at on the Excalidraw canvas. The
 * actual bitmap may be larger; we scale down to keep a 30-page
 * worksheet from spanning multiple zoom levels.
 */
const PDF_PAGE_RENDER_WIDTH = 720;
/**
 * Width for a single image insert. Bigger than the PDF page so a
 * single screenshot reads at glance; still small enough that a small
 * canvas zoom shows the whole image.
 */
const SINGLE_IMAGE_DEFAULT_WIDTH = 540;

function makeRandomElementId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  return `el_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function makeRandomFileId(): string {
  // Excalidraw uses opaque strings for file ids; uuid is fine.
  return makeRandomElementId();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/** Scene coords at the current viewport center — for callers that must snapshot before async work. */
export function getInsertCenter(api: ExcalidrawApiLike): { x: number; y: number } {
  return viewportCenter(api);
}

function viewportCenter(api: ExcalidrawApiLike): { x: number; y: number } {
  const s = api.getAppState() as {
    scrollX: number;
    scrollY: number;
    width: number;
    height: number;
    zoom: { value: number };
    offsetLeft?: number;
    offsetTop?: number;
  };
  const zoom = s.zoom?.value || 1;
  const w = s.width;
  const h = s.height;
  if (
    typeof w === "number" &&
    Number.isFinite(w) &&
    w > 0 &&
    typeof h === "number" &&
    Number.isFinite(h) &&
    h > 0
  ) {
    const offsetLeft =
      typeof s.offsetLeft === "number" && Number.isFinite(s.offsetLeft)
        ? s.offsetLeft
        : 0;
    const offsetTop =
      typeof s.offsetTop === "number" && Number.isFinite(s.offsetTop)
        ? s.offsetTop
        : 0;
    return viewportSceneCenterFromScroll(
      s.scrollX,
      s.scrollY,
      zoom,
      w,
      h,
      offsetLeft,
      offsetTop
    );
  }
  return { x: s.scrollX, y: s.scrollY };
}

/**
 * Read the Excalidraw viewport dimensions (in CSS pixels) plus an
 * acceptable zoom for a placement-time camera-fit. Returns null when
 * the canvas hasn't measured yet (jsdom test mocks, pre-mount API).
 */
function viewportSize(
  api: ExcalidrawApiLike
): { width: number; height: number } | null {
  try {
    const s = api.getAppState();
    if (
      typeof s.width === "number" &&
      Number.isFinite(s.width) &&
      s.width > 0 &&
      typeof s.height === "number" &&
      Number.isFinite(s.height) &&
      s.height > 0
    ) {
      return { width: s.width, height: s.height };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Compute the camera (panX, panY, zoom) that fits a content rectangle
 * centered at `(centerSceneX, centerSceneY)` into a viewport, with a
 * consistent margin so the page is fully visible but not edge-to-edge.
 *
 * Uses {@link scrollForViewportSceneCenter} (offset-invariant) so the
 * vendored Excalidraw transform oracle agrees with the stored viewState.
 *
 * Phase 5 task 8 — drives PDF insert auto-fit. The new page's
 * `viewState` is set to this triple so `selectTutorPage` restores it
 * the moment the tutor lands on the page.
 */
export function computeFitCameraForRect(args: {
  centerSceneX: number;
  centerSceneY: number;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Zoom is clamped to [min, max] so a wildly-sized PDF can't push the camera into a state Excalidraw fights. */
  minZoom?: number;
  maxZoom?: number;
  /** Fraction of viewport used for fit (0.9 ≈ 10% margin). */
  fitPadding?: number;
}): { panX: number; panY: number; zoom: number } | null {
  const {
    centerSceneX,
    centerSceneY,
    contentWidth,
    contentHeight,
    viewportWidth,
    viewportHeight,
    minZoom = 0.1,
    maxZoom = 2,
    fitPadding = 0.9,
  } = args;
  if (
    !(viewportWidth > 0 && viewportHeight > 0) ||
    !(contentWidth > 0 && contentHeight > 0)
  ) {
    return null;
  }
  const usableW = viewportWidth * fitPadding;
  const usableH = viewportHeight * fitPadding;
  const rawZoom = Math.min(usableW / contentWidth, usableH / contentHeight);
  const zoom = Math.min(maxZoom, Math.max(minZoom, rawZoom));
  const { scrollX, scrollY } = scrollForViewportSceneCenter(
    centerSceneX,
    centerSceneY,
    zoom,
    viewportWidth,
    viewportHeight
  );
  return { panX: scrollX, panY: scrollY, zoom };
}

const IMAGE_MIME_WHITELIST: ReadonlyArray<string> = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

function normalizeMime(
  mime: string
): "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp" | "image/gif" | null {
  switch (mime) {
    case "image/png":
      return "image/png";
    case "image/jpeg":
    case "image/jpg":
      return "image/jpeg";
    case "image/gif":
      return "image/gif";
    case "image/webp":
      return "image/webp";
    case "image/svg+xml":
      return "image/svg+xml";
    default:
      return null;
  }
}

async function imageDimensionsFromBlob(
  blob: Blob
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new window.Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("Could not decode image."));
        img.src = url;
      }
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Build the structural shape Excalidraw expects for an image element.
 *
 * We DON'T import Excalidraw's element type here because (a) it's a
 * branded readonly type that's awkward to construct, and (b) we want
 * the same code path to work in jsdom tests where Excalidraw isn't
 * loaded. The fields we set match what `convertToExcalidrawElements`
 * would produce; Excalidraw's `restoreElements` fills in defaults for
 * everything we omit.
 */
function buildImageElement(args: {
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  assetUrl: string;
  altText?: string;
}): Record<string, unknown> {
  const now = Date.now();
  return {
    id: makeRandomElementId(),
    type: "image",
    fileId: args.fileId,
    status: "saved",
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    groupIds: [],
    frameId: null,
    roundness: null,
    scale: [1, 1],
    crop: null,
    customData: {
      assetUrl: args.assetUrl,
      altText: args.altText,
    },
  };
}

/**
 * Insert a single raster image (or SVG) onto the canvas.
 *
 * Flow:
 *   1. Validate mime + size.
 *   2. Decode dimensions so the on-canvas placement is proportional.
 *   3. Upload to Vercel Blob (so replay + students can load it).
 *   4. Register the dataURL in Excalidraw's BinaryFiles via addFiles.
 *   5. Insert the element via updateScene at viewport center.
 *
 * Failure modes are returned, never thrown — the toolbar surfaces them.
 */
export async function insertImageOnCanvas(args: InsertAssetCommonArgs & {
  file: File;
  altText?: string;
}): Promise<InsertImageResult> {
  const { excalidrawAPI, whiteboardSessionId, studentId, file, altText } =
    args;

  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `Image is ${mb} MB — the upload limit is ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`,
    };
  }
  const mime = normalizeMime(file.type);
  if (!mime || !IMAGE_MIME_WHITELIST.includes(file.type)) {
    return {
      ok: false,
      reason: `Unsupported image type: ${file.type || "unknown"}. Use PNG, JPG, GIF, WebP, or SVG.`,
    };
  }

  let dims: { width: number; height: number };
  try {
    dims = await imageDimensionsFromBlob(file);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  if (dims.width <= 0 || dims.height <= 0) {
    return { ok: false, reason: "Image has zero dimensions; can't insert." };
  }

  // Upload first so we have a stable URL for the recording event log.
  const upload = await uploadWhiteboardAsset({
    whiteboardSessionId,
    studentId,
    blob: file,
    filename: file.name || "image",
    contentType: mime,
    assetTag: "image",
  });
  if (!upload.ok) return { ok: false, reason: upload.error };

  let dataURL: string;
  try {
    dataURL = await blobToDataUrl(file);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  const fileId = makeRandomFileId();
  excalidrawAPI.addFiles([
    {
      id: fileId,
      mimeType: mime,
      dataURL,
      created: Date.now(),
    },
  ]);

  // Pin width to a sensible default and let height scale to preserve
  // aspect — keeps the inserted image visible without dominating the
  // canvas at default zoom.
  const aspect = dims.height / dims.width;
  const width = Math.min(SINGLE_IMAGE_DEFAULT_WIDTH, dims.width);
  const height = width * aspect;
  const center = viewportCenter(excalidrawAPI);
  const x = center.x - width / 2;
  const y = center.y - height / 2;

  const newElement = buildImageElement({
    fileId,
    x,
    y,
    width,
    height,
    assetUrl: upload.blobUrl,
    altText,
  });
  const elements = excalidrawAPI.getSceneElements() as ReadonlyArray<unknown>;
  excalidrawAPI.updateScene({ elements: [...elements, newElement] });
  // Best-effort: nudge the viewport so the user sees what they just
  // inserted. Errors here are cosmetic; eat them.
  try {
    excalidrawAPI.scrollToContent?.([newElement], {
      fitToContent: false,
      animate: true,
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    elementId: (newElement as { id: string }).id,
    assetUrl: upload.blobUrl,
  };
}

/**
 * Insert a rendered LaTeX equation (an SVG blob) onto the canvas.
 *
 * The equation lives as an `image` element with mime `image/svg+xml`
 * so Excalidraw renders it crisply at any zoom. The original LaTeX
 * source is preserved in `customData.latex` so the AI note pipeline
 * can read the equation back as TeX (replay also pulls it out).
 */
export async function insertMathSvgOnCanvas(args: InsertAssetCommonArgs & {
  svgBlob: Blob;
  widthPx: number;
  heightPx: number;
  latex: string;
  /** When provided, used for placement instead of a fresh viewportCenter() call. */
  insertCenter?: { x: number; y: number };
}): Promise<InsertImageResult> {
  const {
    excalidrawAPI,
    whiteboardSessionId,
    studentId,
    svgBlob,
    widthPx,
    heightPx,
    latex,
    insertCenter,
  } = args;

  const center = insertCenter ?? viewportCenter(excalidrawAPI);

  const upload = await uploadWhiteboardAsset({
    whiteboardSessionId,
    studentId,
    blob: svgBlob,
    filename: "equation.svg",
    contentType: "image/svg+xml",
    assetTag: "math-equation",
  });
  if (!upload.ok) return { ok: false, reason: upload.error };

  let dataURL: string;
  try {
    dataURL = await blobToDataUrl(svgBlob);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  const fileId = makeRandomFileId();
  excalidrawAPI.addFiles([
    {
      id: fileId,
      mimeType: "image/svg+xml",
      dataURL,
      created: Date.now(),
    },
  ]);

  const x = center.x - widthPx / 2;
  const y = center.y - heightPx / 2;
  const baseElement = buildImageElement({
    fileId,
    x,
    y,
    width: widthPx,
    height: heightPx,
    assetUrl: upload.blobUrl,
    altText: latex.slice(0, 200),
  });
  // Stitch the LaTeX source into customData so the canonical event
  // log carries it (the adapter reads `customData.latex` and lifts
  // it onto WBElement.latex).
  const newElement = {
    ...baseElement,
    customData: {
      ...((baseElement as { customData?: Record<string, unknown> })
        .customData ?? {}),
      latex,
      wbType: "text" as const,
    },
  };
  const elements = excalidrawAPI.getSceneElements() as ReadonlyArray<unknown>;
  excalidrawAPI.updateScene({ elements: [...elements, newElement] });
  try {
    excalidrawAPI.scrollToContent?.([newElement], {
      fitToContent: false,
      animate: true,
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    elementId: (newElement as unknown as { id: string }).id,
    assetUrl: upload.blobUrl,
  };
}

/**
 * Insert one image element per rendered PDF page, tiled vertically.
 * Pages are uploaded sequentially (matching the renderer's sequential
 * decode) so the network doesn't see 30 parallel POSTs.
 */
export async function insertPdfPagesOnCanvas(args: InsertAssetCommonArgs & {
  pages: PdfPageRender[];
  filename: string;
  onProgress?: (uploaded: number, total: number) => void;
}): Promise<InsertPdfResult> {
  const {
    excalidrawAPI,
    whiteboardSessionId,
    studentId,
    pages,
    filename,
    onProgress,
  } = args;

  if (pages.length === 0) {
    return { ok: false, reason: "No pages to insert." };
  }

  const center = viewportCenter(excalidrawAPI);
  // Anchor the top of the first page slightly above center so a 1-2
  // page PDF lands roughly centered, and a 30-page stack starts at
  // top-of-viewport rather than below it.
  let cursorY = center.y - PDF_PAGE_RENDER_WIDTH * 0.5;
  const x = center.x - PDF_PAGE_RENDER_WIDTH / 2;

  const elementIds: string[] = [];
  const assetUrls: string[] = [];
  const newElements: unknown[] = [];
  const filesToRegister: Array<{
    id: string;
    mimeType: "image/png";
    dataURL: string;
    created: number;
  }> = [];

  for (let i = 0; i < pages.length; i++) {
    // Space out token requests slightly on long PDFs — pairs with upload
    // retries in `upload.ts` for "Failed to retrieve the client token".
    if (i > 0) {
      await new Promise<void>((r) => setTimeout(r, 75));
    }
    const page = pages[i];
    const pagePath = `${filename || "document"}-p${page.pageIndex}.png`;
    const upload = await uploadWhiteboardAsset({
      whiteboardSessionId,
      studentId,
      blob: page.pngBlob,
      filename: pagePath,
      contentType: "image/png",
      assetTag: `pdf-page-${page.pageIndex}`,
    });
    if (!upload.ok) {
      return {
        ok: false,
        reason: `Page ${page.pageIndex}: ${upload.error}`,
      };
    }

    let dataURL: string;
    try {
      dataURL = await blobToDataUrl(page.pngBlob);
    } catch (err) {
      return {
        ok: false,
        reason: `Page ${page.pageIndex}: ${(err as Error).message}`,
      };
    }

    const fileId = makeRandomFileId();
    filesToRegister.push({
      id: fileId,
      mimeType: "image/png",
      dataURL,
      created: Date.now(),
    });

    const aspect = page.heightPx / page.widthPx;
    const width = PDF_PAGE_RENDER_WIDTH;
    const height = width * aspect;

    const el = buildImageElement({
      fileId,
      x,
      y: cursorY,
      width,
      height,
      assetUrl: upload.blobUrl,
      altText: `${filename} page ${page.pageIndex}`,
    });
    newElements.push(el);
    elementIds.push((el as { id: string }).id);
    assetUrls.push(upload.blobUrl);

    cursorY += height + PDF_PAGE_GAP_PX;
    onProgress?.(i + 1, pages.length);
  }

  // Register all dataURLs at once and push the new elements as a
  // single scene update — keeps the live-sync broadcast to one frame.
  excalidrawAPI.addFiles(filesToRegister);
  const existing = excalidrawAPI.getSceneElements() as ReadonlyArray<unknown>;
  excalidrawAPI.updateScene({ elements: [...existing, ...newElements] });
  try {
    excalidrawAPI.scrollToContent?.(newElements as never, {
      fitToContent: true,
      animate: true,
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    elementIds,
    assetUrls,
    pagesInserted: pages.length,
  };
}

/** Strip title segment for one imported PDF page row (design spec). */
export function pdfBoardPageTitle(filename: string, pdfPageNumber: number): string {
  const stripped = filename.replace(/\.pdf$/i, "").trim();
  const base = stripped.length > 0 ? stripped : "PDF";
  const short = base.length > 20 ? `${base.slice(0, 20)}\u2026` : base;
  return `${short} p.${pdfPageNumber}`;
}

/**
 * Insert one board tab per rendered PDF page, grouped under a new section.
 * The workspace supplies {@link InsertPdfBoardPagesIntegrate} so page-list
 * state stays authoritative in React while uploads + BinaryFiles happen here.
 */
export async function insertPdfPagesAsBoardPages(
  args: InsertAssetCommonArgs & {
    pages: PdfPageRender[];
    filename: string;
    onProgress?: (uploaded: number, total: number) => void;
    integrate: InsertPdfBoardPagesIntegrate;
  }
): Promise<InsertPdfBoardPagesResult> {
  const {
    excalidrawAPI,
    whiteboardSessionId,
    studentId,
    pages,
    filename,
    onProgress,
    integrate,
  } = args;

  if (pages.length === 0) {
    return {
      ok: false,
      reason: "upload-failed",
      message: "No pages to insert.",
    };
  }

  const sectionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `pdf-${crypto.randomUUID()}`
      : `pdf_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

  const sectionLabel =
    filename.replace(/\.pdf$/i, "").trim() || filename || "PDF";

  const anchorActivePageId = integrate.getActivePageId();

  const rows: PdfBoardBatchRow[] = [];
  let firstPageId = "";
  let failureMessage: string | null = null;

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      await new Promise<void>((r) => setTimeout(r, 75));
    }
    const page = pages[i]!;
    const pagePath = `${filename || "document"}-p${page.pageIndex}.png`;
    const upload = await uploadWhiteboardAsset({
      whiteboardSessionId,
      studentId,
      blob: page.pngBlob,
      filename: pagePath,
      contentType: "image/png",
      assetTag: `pdf-page-${page.pageIndex}`,
    });
    if (!upload.ok) {
      failureMessage = upload.error;
      break;
    }

    console.info(
      `[whiteboard] wbsid=${whiteboardSessionId} pdf-upload page=${page.pageIndex} bytes=${page.pngBlob.size}`
    );

    let dataURL: string;
    try {
      dataURL = await blobToDataUrl(page.pngBlob);
    } catch (err) {
      failureMessage = (err as Error).message;
      break;
    }

    const fileId = makeRandomFileId();
    const aspect = page.heightPx / page.widthPx;
    const width = PDF_PAGE_RENDER_WIDTH;
    const height = width * aspect;
    // Each PDF board page owns an isolated scene: place the page image
    // at scene origin so the camera is deterministic (scroll/zoom to
    // center+fit the rect) regardless of where the tutor was looking
    // on the anchor tab when they hit Insert.
    const x = 0;
    const y = 0;
    const centerSceneX = width / 2;
    const centerSceneY = height / 2;
    const vp = viewportSize(excalidrawAPI);
    const initialViewState = vp
      ? computeFitCameraForRect({
          centerSceneX,
          centerSceneY,
          contentWidth: width,
          contentHeight: height,
          viewportWidth: vp.width,
          viewportHeight: vp.height,
        })
      : null;

    const pageId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : makeRandomElementId();

    const el = buildImageElement({
      fileId,
      x,
      y,
      width,
      height,
      assetUrl: upload.blobUrl,
      altText: `${filename} page ${page.pageIndex}`,
    });

    if (i === 0) {
      firstPageId = pageId;
    }

    rows.push({
      pageId,
      title: pdfBoardPageTitle(filename, page.pageIndex),
      elements: [el],
      file: {
        id: fileId,
        mimeType: "image/png",
        dataURL,
        created: Date.now(),
      },
      ...(initialViewState ? { viewState: initialViewState } : {}),
    });
    onProgress?.(i + 1, pages.length);
  }

  if (rows.length === 0) {
    return {
      ok: false,
      reason: "upload-failed",
      message: failureMessage
        ? `Upload failed before any pages were inserted: ${failureMessage}`
        : "No pages were inserted.",
    };
  }

  integrate.commitPdfBatch({
    sectionId,
    sectionLabel,
    anchorActivePageId,
    rows,
    firstPageId,
  });

  if (failureMessage !== null) {
    return {
      ok: false,
      reason: "upload-failed",
      message: `Inserted ${rows.length} of ${pages.length} pages; remainder failed: ${failureMessage}`,
    };
  }

  return {
    ok: true,
    pagesInserted: rows.length,
    sectionId,
    firstPageId,
  };
}

// ---------------------------------------------------------------------------
// Self-hosted JSXGraph embed
// ---------------------------------------------------------------------------

/**
 * Sentinel link for Excalidraw embeddables rendered via `renderEmbeddable`.
 * Required so `validateEmbeddable` + `embedsValidationStatus` pass (Excalidraw
 * only mounts `renderEmbeddable` for validated links). The native hyperlink UI
 * for this scheme is suppressed in `whiteboard-chrome.css` + `onLinkOpen`.
 */
export const GRAPH_EMBED_LINK = "mynk://graph";

const GRAPH_DEFAULT_WIDTH = 720;
const GRAPH_DEFAULT_HEIGHT = 540;

/**
 * Build an Excalidraw `embeddable` element for a self-hosted JSXGraph widget.
 */
export function buildGraphEmbeddableElement(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  graphState: GraphState;
}): Record<string, unknown> {
  const graphStateJson = serializeGraphStateJson(args.graphState);
  const now = Date.now();
  return {
    id: makeRandomElementId(),
    type: "embeddable",
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    angle: 0,
    strokeColor: EXCALIDRAW_STROKE_HEX,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: GRAPH_EMBED_LINK,
    locked: false,
    groupIds: [],
    frameId: null,
    roundness: null,
    customData: {
      assetUrl: GRAPH_EMBED_LINK,
      wbType: "graph",
      graph: {
        provider: "jsxgraph",
      },
      graphStateJson,
    },
  };
}

export type InsertGraphResult =
  | { ok: true; elementId: string }
  | { ok: false; reason: string };

/**
 * Insert a JSXGraph embeddable at the current viewport center.
 */
export function insertGraphOnCanvas(
  args: InsertAssetCommonArgs & {
    initialExpressions?: string[];
  }
): InsertGraphResult {
  const { excalidrawAPI, initialExpressions } = args;
  const graphState: GraphState = {
    bbox: DEFAULT_GRAPH_BBOX,
    expressions: initialExpressions?.filter((e) => e.trim().length > 0) ?? [],
  };

  const center = getInsertCenter(excalidrawAPI);
  const x = center.x - GRAPH_DEFAULT_WIDTH / 2;
  const y = center.y - GRAPH_DEFAULT_HEIGHT / 2;
  const newElement = buildGraphEmbeddableElement({
    x,
    y,
    width: GRAPH_DEFAULT_WIDTH,
    height: GRAPH_DEFAULT_HEIGHT,
    graphState,
  });

  const elements = excalidrawAPI.getSceneElements() as ReadonlyArray<unknown>;
  excalidrawAPI.updateScene({ elements: [...elements, newElement] });
  try {
    excalidrawAPI.scrollToContent?.([newElement], {
      fitToContent: false,
      animate: true,
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    elementId: (newElement as unknown as { id: string }).id,
  };
}
