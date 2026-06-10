/**
 * @jest-environment jsdom
 */

/**
 * Unit coverage for `insertImageOnCanvas` and `insertPdfPagesOnCanvas`.
 *
 * Exercises:
 *   - mime/size validation rejects bad inputs
 *   - successful image insert wires the dataURL into Excalidraw's
 *     BinaryFiles + appends the image element with assetUrl in
 *     customData
 *   - PDF page insert tiles vertically using the documented stride
 *   - upload failures bubble back as `{ ok: false }` (no throws)
 *
 * Excalidraw isn't loaded — we hand the helpers a structural
 * `ExcalidrawApiLike` test double whose `addFiles` / `updateScene`
 * record arguments for assertion.
 */

import {
  buildGraphEmbeddableElement,
  computeFitCameraForRect,
  GRAPH_EMBED_LINK,
  insertGraphOnCanvas,
  insertImageOnCanvas,
  insertMathSvgOnCanvas,
  insertPdfPagesAsBoardPages,
  insertPdfPagesOnCanvas,
  pdfBoardPageTitle,
  type ExcalidrawApiLike,
} from "@/lib/whiteboard/insert-asset";
import { DEFAULT_GRAPH_BBOX } from "@/lib/whiteboard/graph-state";
import {
  viewportCoordsToSceneCoords,
  viewportSceneCenterFromScroll,
} from "@/lib/whiteboard/viewport-align";

jest.mock("@/lib/whiteboard/upload", () => ({
  uploadWhiteboardAsset: jest.fn(),
}));

import { uploadWhiteboardAsset } from "@/lib/whiteboard/upload";

const uploadMock = uploadWhiteboardAsset as jest.MockedFunction<
  typeof uploadWhiteboardAsset
>;

function makeFakeApi(): {
  api: ExcalidrawApiLike;
  files: Array<Parameters<ExcalidrawApiLike["addFiles"]>[0]>;
  scenes: Array<unknown[]>;
} {
  const files: Array<Parameters<ExcalidrawApiLike["addFiles"]>[0]> = [];
  const scenes: Array<unknown[]> = [];
  let current: unknown[] = [];
  const api: ExcalidrawApiLike = {
    getSceneElements: () => current,
    getAppState: () => ({
      scrollX: 0,
      scrollY: 0,
      width: 1000,
      height: 800,
      zoom: { value: 1 },
    }),
    addFiles: (f) => {
      files.push(f);
    },
    updateScene: ({ elements }) => {
      current = elements as unknown[];
      scenes.push(current);
    },
    scrollToContent: () => undefined,
  };
  return { api, files, scenes };
}

beforeEach(() => {
  uploadMock.mockReset();
});

beforeAll(() => {
  // jsdom's HTMLImageElement doesn't actually decode the bytes — fake
  // a deterministic onload for our fixtures so dimension probing works.
  Object.defineProperty(window.HTMLImageElement.prototype, "src", {
    configurable: true,
    set(value: string) {
      (this as unknown as { _src: string })._src = value;
      // Microtask to mimic real image decoding completion.
      queueMicrotask(() => {
        Object.defineProperty(this, "naturalWidth", { value: 800, configurable: true });
        Object.defineProperty(this, "naturalHeight", { value: 600, configurable: true });
        const handler = (this as unknown as { onload?: () => void }).onload;
        if (handler) handler();
      });
    },
    get() {
      return (this as unknown as { _src: string })._src ?? "";
    },
  });
});

function makePngFile(name: string, bytes: number): File {
  const arr = new Uint8Array(bytes);
  return new File([arr], name, { type: "image/png" });
}

describe("insertImageOnCanvas", () => {
  it("rejects unsupported mime types", async () => {
    const { api } = makeFakeApi();
    const file = new File([new Uint8Array(8)], "x.txt", {
      type: "text/plain",
    });
    const result = await insertImageOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb",
      studentId: "s",
      file,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/Unsupported image type/);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects oversized files before uploading", async () => {
    const { api } = makeFakeApi();
    const huge = makePngFile("big.png", 26 * 1024 * 1024);
    const result = await insertImageOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb",
      studentId: "s",
      file: huge,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/upload limit/);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads, registers a file, and adds an image element on success", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/wb-asset.png",
      sizeBytes: 1024,
    });
    const { api, files, scenes } = makeFakeApi();
    const file = makePngFile("worksheet.png", 1024);

    const result = await insertImageOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      file,
      altText: "Worksheet",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whiteboardSessionId: "wb-1",
        studentId: "s-1",
        contentType: "image/png",
        assetTag: "image",
      })
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toHaveLength(1);
    expect(files[0][0].mimeType).toBe("image/png");
    expect(files[0][0].dataURL.startsWith("data:image/png;base64,")).toBe(true);

    expect(scenes).toHaveLength(1);
    const inserted = scenes[0][0] as Record<string, unknown>;
    expect(inserted.type).toBe("image");
    expect(inserted.fileId).toBe(files[0][0].id);
    expect(inserted.status).toBe("saved");
    expect(
      (inserted.customData as { assetUrl?: string })?.assetUrl
    ).toBe("https://blob.example/wb-asset.png");
    expect(
      (inserted.customData as { altText?: string })?.altText
    ).toBe("Worksheet");
    expect(inserted.id).toBe(result.elementId);
  });

  it("centers inserted image on viewport scene center (Excalidraw transform oracle)", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/wb-asset.png",
      sizeBytes: 1024,
    });
    const { api, scenes } = makeFakeApi();
    const scrollX = -50;
    const scrollY = 30;
    const zoom = 1.25;
    const width = 1024;
    const height = 768;
    api.getAppState = () => ({
      scrollX,
      scrollY,
      width,
      height,
      zoom: { value: zoom },
    });
    const file = makePngFile("worksheet.png", 1024);

    const result = await insertImageOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      file,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inserted = scenes[0][0] as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const oracle = viewportSceneCenterFromScroll(
      scrollX,
      scrollY,
      zoom,
      width,
      height
    );
    expect(inserted.x + inserted.width / 2).toBeCloseTo(oracle.x, 5);
    expect(inserted.y + inserted.height / 2).toBeCloseTo(oracle.y, 5);
  });

  it("surfaces upload failures without mutating the scene", async () => {
    uploadMock.mockResolvedValue({ ok: false, error: "network down" });
    const { api, files, scenes } = makeFakeApi();
    const file = makePngFile("worksheet.png", 1024);

    const result = await insertImageOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      file,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("network down");
    expect(files).toHaveLength(0);
    expect(scenes).toHaveLength(0);
  });
});

describe("pdfBoardPageTitle", () => {
  it("uses original 1-based PDF page numbers", () => {
    expect(pdfBoardPageTitle("quiz.pdf", 12)).toMatch(/p\.12$/);
  });

  it("truncates long filenames to 20 chars with ellipsis", () => {
    const name = "abcdefghijklmnopqrstuvwxyz.pdf";
    const t = pdfBoardPageTitle(name, 1);
    expect(t.startsWith("abcdefghijklmnopqrst")).toBe(true);
    expect(t).toContain("\u2026");
  });
});

describe("computeFitCameraForRect (PDF page center+fit)", () => {
  const PDF_RENDER_WIDTH = 720;

  /** Independent oracle: scene point at the visual viewport center. */
  function sceneAtViewportCenter(
    scrollX: number,
    scrollY: number,
    zoom: number,
    viewportWidth: number,
    viewportHeight: number,
    offsetLeft: number,
    offsetTop: number
  ) {
    return viewportCoordsToSceneCoords(
      {
        clientX: offsetLeft + viewportWidth / 2,
        clientY: offsetTop + viewportHeight / 2,
      },
      {
        zoom: { value: zoom },
        offsetLeft,
        offsetTop,
        scrollX,
        scrollY,
      }
    );
  }

  function expectedFitZoom(
    contentWidth: number,
    contentHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    fitPadding = 0.9
  ) {
    const usableW = viewportWidth * fitPadding;
    const usableH = viewportHeight * fitPadding;
    return Math.min(usableW / contentWidth, usableH / contentHeight);
  }

  const cases: Array<{
    name: string;
    viewportWidth: number;
    viewportHeight: number;
    pdfWidthPx: number;
    pdfHeightPx: number;
  }> = [
    {
      name: "portrait PDF on landscape viewport",
      viewportWidth: 1440,
      viewportHeight: 900,
      pdfWidthPx: 720,
      pdfHeightPx: 960,
    },
    {
      name: "landscape PDF on landscape viewport",
      viewportWidth: 1440,
      viewportHeight: 900,
      pdfWidthPx: 960,
      pdfHeightPx: 720,
    },
    {
      name: "portrait PDF on portrait viewport",
      viewportWidth: 390,
      viewportHeight: 844,
      pdfWidthPx: 720,
      pdfHeightPx: 960,
    },
    {
      name: "landscape PDF on portrait viewport",
      viewportWidth: 390,
      viewportHeight: 844,
      pdfWidthPx: 960,
      pdfHeightPx: 720,
    },
  ];

  it.each(cases)(
    "centers PDF at viewport center and zooms to fit ($name)",
    ({ viewportWidth, viewportHeight, pdfWidthPx, pdfHeightPx }) => {
      const aspect = pdfHeightPx / pdfWidthPx;
      const contentWidth = PDF_RENDER_WIDTH;
      const contentHeight = PDF_RENDER_WIDTH * aspect;
      const centerSceneX = contentWidth / 2;
      const centerSceneY = contentHeight / 2;

      const camera = computeFitCameraForRect({
        centerSceneX,
        centerSceneY,
        contentWidth,
        contentHeight,
        viewportWidth,
        viewportHeight,
      });
      expect(camera).not.toBeNull();
      if (!camera) return;

      const fitZoom = expectedFitZoom(
        contentWidth,
        contentHeight,
        viewportWidth,
        viewportHeight
      );
      expect(camera.zoom).toBeCloseTo(fitZoom, 10);

      const oracleCenter = sceneAtViewportCenter(
        camera.panX,
        camera.panY,
        camera.zoom,
        viewportWidth,
        viewportHeight,
        0,
        0
      );
      expect(oracleCenter.x).toBeCloseTo(centerSceneX, 5);
      expect(oracleCenter.y).toBeCloseTo(centerSceneY, 5);
    }
  );

  it.each(cases)(
    "camera is offset-invariant ($name)",
    ({ viewportWidth, viewportHeight, pdfWidthPx, pdfHeightPx }) => {
      const aspect = pdfHeightPx / pdfWidthPx;
      const contentWidth = PDF_RENDER_WIDTH;
      const contentHeight = PDF_RENDER_WIDTH * aspect;
      const baseline = computeFitCameraForRect({
        centerSceneX: contentWidth / 2,
        centerSceneY: contentHeight / 2,
        contentWidth,
        contentHeight,
        viewportWidth,
        viewportHeight,
      });
      expect(baseline).not.toBeNull();
      if (!baseline) return;

      const offsetPairs: Array<[number, number]> = [
        [0, 0],
        [73, 250],
        [120, 64],
        [-40, 88],
      ];
      for (const [offsetLeft, offsetTop] of offsetPairs) {
        const oracleCenter = sceneAtViewportCenter(
          baseline.panX,
          baseline.panY,
          baseline.zoom,
          viewportWidth,
          viewportHeight,
          offsetLeft,
          offsetTop
        );
        expect(oracleCenter.x).toBeCloseTo(contentWidth / 2, 5);
        expect(oracleCenter.y).toBeCloseTo(contentHeight / 2, 5);
      }
    }
  );
});

describe("insertPdfPagesAsBoardPages", () => {
  it("commits a single atomic batch with section + rows + first page", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/p.png",
      sizeBytes: 4,
    });
    const { api } = makeFakeApi();
    const commit = jest.fn();
    const integrate = {
      getActivePageId: () => "p1",
      commitPdfBatch: commit,
    };
    const result = await insertPdfPagesAsBoardPages({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      pages: [
        {
          pageIndex: 3,
          pngBlob: new Blob([new Uint8Array(8)], { type: "image/png" }),
          widthPx: 720,
          heightPx: 960,
        },
      ],
      filename: "mixed.pdf",
      integrate,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pagesInserted).toBe(1);
    expect(result.sectionId.startsWith("pdf-")).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    const arg = commit.mock.calls[0]?.[0] as {
      sectionId: string;
      sectionLabel: string;
      anchorActivePageId: string;
      rows: Array<{
        pageId: string;
        title: string;
        elements: ReadonlyArray<unknown>;
        file: { id: string; mimeType: string };
      }>;
      firstPageId: string;
    };
    expect(arg.sectionId).toBe(result.sectionId);
    expect(arg.sectionLabel).toBe("mixed");
    expect(arg.anchorActivePageId).toBe("p1");
    expect(arg.rows).toHaveLength(1);
    expect(arg.rows[0]?.title).toBe("mixed p.3");
    expect(arg.rows[0]?.file.mimeType).toBe("image/png");
    expect(arg.firstPageId).toBe(result.firstPageId);
  });

  it("still commits the successful prefix, then reports partial failure", async () => {
    uploadMock
      .mockResolvedValueOnce({
        ok: true,
        blobUrl: "https://blob.example/a.png",
        sizeBytes: 1,
      })
      .mockResolvedValueOnce({ ok: false, error: "quota" });
    const { api } = makeFakeApi();
    const commit = jest.fn();
    const integrate = {
      getActivePageId: () => "tab-a",
      commitPdfBatch: commit,
    };
    const result = await insertPdfPagesAsBoardPages({
      excalidrawAPI: api,
      whiteboardSessionId: "wb",
      studentId: "s",
      pages: [
        {
          pageIndex: 1,
          pngBlob: new Blob([new Uint8Array(2)], { type: "image/png" }),
          widthPx: 100,
          heightPx: 100,
        },
        {
          pageIndex: 2,
          pngBlob: new Blob([new Uint8Array(2)], { type: "image/png" }),
          widthPx: 100,
          heightPx: 100,
        },
      ],
      filename: "w.pdf",
      integrate,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/Inserted 1 of 2/);
    expect(commit).toHaveBeenCalledTimes(1);
    const arg = commit.mock.calls[0]?.[0] as {
      rows: ReadonlyArray<unknown>;
    };
    expect(arg.rows).toHaveLength(1);
  });

  it("stamps a fit-to-PDF viewState on each row so selectTutorPage lands the camera on the page", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/p.png",
      sizeBytes: 4,
    });
    const viewportWidth = 1000;
    const viewportHeight = 800;
    const { api } = makeFakeApi();
    const commit = jest.fn();
    const integrate = {
      getActivePageId: () => "p1",
      commitPdfBatch: commit,
    };
    const pdfWidthPx = 720;
    const pdfHeightPx = 960;
    const result = await insertPdfPagesAsBoardPages({
      excalidrawAPI: api,
      whiteboardSessionId: "wb",
      studentId: "s",
      pages: [
        {
          pageIndex: 1,
          pngBlob: new Blob([new Uint8Array(4)], { type: "image/png" }),
          widthPx: pdfWidthPx,
          heightPx: pdfHeightPx,
        },
      ],
      filename: "x.pdf",
      integrate,
    });
    expect(result.ok).toBe(true);
    const arg = commit.mock.calls[0]?.[0] as {
      rows: Array<{
        viewState?: { panX: number; panY: number; zoom: number };
        elements: Array<{ x: number; y: number; width: number; height: number }>;
      }>;
    };
    const row = arg.rows[0];
    expect(row?.elements[0]?.x).toBe(0);
    expect(row?.elements[0]?.y).toBe(0);
    const contentWidth = 720;
    const contentHeight = 720 * (pdfHeightPx / pdfWidthPx);
    const expected = computeFitCameraForRect({
      centerSceneX: contentWidth / 2,
      centerSceneY: contentHeight / 2,
      contentWidth,
      contentHeight,
      viewportWidth,
      viewportHeight,
    });
    const vs = row?.viewState;
    expect(vs).toEqual(expected);
    if (!vs || !expected) return;
    const oracle = viewportCoordsToSceneCoords(
      {
        clientX: viewportWidth / 2,
        clientY: viewportHeight / 2,
      },
      {
        zoom: { value: vs.zoom },
        offsetLeft: 0,
        offsetTop: 0,
        scrollX: vs.panX,
        scrollY: vs.panY,
      }
    );
    expect(oracle.x).toBeCloseTo(contentWidth / 2, 5);
    expect(oracle.y).toBeCloseTo(contentHeight / 2, 5);
  });

  it("omits viewState when the canvas hasn't measured yet (fallback to anchor camera)", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/p.png",
      sizeBytes: 4,
    });
    // API with zero-area appState (pre-mount Excalidraw stub).
    const apiUnmeasured: ExcalidrawApiLike = {
      getSceneElements: () => [],
      getAppState: () => ({
        scrollX: 0,
        scrollY: 0,
        width: 0,
        height: 0,
        zoom: { value: 1 },
      }),
      addFiles: () => undefined,
      updateScene: () => undefined,
    };
    const commit = jest.fn();
    const integrate = {
      getActivePageId: () => "p1",
      commitPdfBatch: commit,
    };
    const result = await insertPdfPagesAsBoardPages({
      excalidrawAPI: apiUnmeasured,
      whiteboardSessionId: "wb",
      studentId: "s",
      pages: [
        {
          pageIndex: 1,
          pngBlob: new Blob([new Uint8Array(4)], { type: "image/png" }),
          widthPx: 720,
          heightPx: 960,
        },
      ],
      filename: "x.pdf",
      integrate,
    });
    expect(result.ok).toBe(true);
    const arg = commit.mock.calls[0]?.[0] as {
      rows: Array<{ viewState?: { panX: number; panY: number; zoom: number } }>;
    };
    expect(arg.rows[0]?.viewState).toBeUndefined();
  });

  it("does NOT commit when every page upload fails", async () => {
    uploadMock.mockResolvedValue({ ok: false, error: "net" });
    const { api } = makeFakeApi();
    const commit = jest.fn();
    const integrate = {
      getActivePageId: () => "p1",
      commitPdfBatch: commit,
    };
    const result = await insertPdfPagesAsBoardPages({
      excalidrawAPI: api,
      whiteboardSessionId: "wb",
      studentId: "s",
      pages: [
        {
          pageIndex: 1,
          pngBlob: new Blob([new Uint8Array(1)], { type: "image/png" }),
          widthPx: 10,
          heightPx: 10,
        },
      ],
      filename: "f.pdf",
      integrate,
    });
    expect(result.ok).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("insertPdfPagesOnCanvas", () => {
  it("tiles pages vertically and appends them in a single scene update", async () => {
    uploadMock.mockImplementation(async (args) => ({
      ok: true,
      blobUrl: `https://blob.example/${args.assetTag}.png`,
      sizeBytes: args.blob.size,
    }));
    const { api, files, scenes } = makeFakeApi();
    const pages = [
      {
        pageIndex: 1,
        pngBlob: new Blob([new Uint8Array(8)], { type: "image/png" }),
        widthPx: 720,
        heightPx: 960,
      },
      {
        pageIndex: 2,
        pngBlob: new Blob([new Uint8Array(8)], { type: "image/png" }),
        widthPx: 720,
        heightPx: 960,
      },
      {
        pageIndex: 3,
        pngBlob: new Blob([new Uint8Array(8)], { type: "image/png" }),
        widthPx: 720,
        heightPx: 960,
      },
    ];

    const progress: Array<[number, number]> = [];
    const result = await insertPdfPagesOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      pages,
      filename: "mixed-fractions.pdf",
      onProgress: (uploaded, total) => progress.push([uploaded, total]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pagesInserted).toBe(3);
    expect(result.assetUrls).toHaveLength(3);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(uploadMock).toHaveBeenCalledTimes(3);
    // All file registrations are flushed in a single addFiles call so
    // the live-sync path doesn't see N separate scene mutations.
    expect(files).toHaveLength(1);
    expect(files[0]).toHaveLength(3);
    // And the scene update is also a single batch.
    expect(scenes).toHaveLength(1);
    const els = scenes[0] as Array<Record<string, unknown>>;
    expect(els).toHaveLength(3);
    // Width/height proportional to the rendered pixel dims (720 wide).
    expect(els[0].width).toBe(720);
    expect(els[0].height).toBeCloseTo(960, 1);
    // Pages are stacked: page2.y > page1.y > 0; gap of 32 between them.
    const ys = els.map((e) => e.y as number);
    expect(ys[1] - ys[0]).toBeCloseTo(960 + 32, 1);
    expect(ys[2] - ys[1]).toBeCloseTo(960 + 32, 1);
  });

  it("returns an error if any page upload fails", async () => {
    uploadMock
      .mockResolvedValueOnce({
        ok: true,
        blobUrl: "https://blob.example/p1.png",
        sizeBytes: 0,
      })
      .mockResolvedValueOnce({ ok: false, error: "blob 500" });
    const { api, scenes } = makeFakeApi();
    const result = await insertPdfPagesOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      pages: [
        {
          pageIndex: 1,
          pngBlob: new Blob([new Uint8Array(2)], { type: "image/png" }),
          widthPx: 100,
          heightPx: 100,
        },
        {
          pageIndex: 2,
          pngBlob: new Blob([new Uint8Array(2)], { type: "image/png" }),
          widthPx: 100,
          heightPx: 100,
        },
      ],
      filename: "f.pdf",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Page 2");
    // No scene update should have happened — failures abort cleanly.
    expect(scenes).toHaveLength(0);
  });

  it("centers math SVG at insertCenter on PDF-fit camera despite stale scroll during upload", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/eq.svg",
      sizeBytes: 100,
    });
    const viewportWidth = 1000;
    const viewportHeight = 800;
    const pdfWidthPx = 720;
    const pdfHeightPx = 960;
    const contentWidth = 720;
    const contentHeight = 720 * (pdfHeightPx / pdfWidthPx);
    const fitCamera = computeFitCameraForRect({
      centerSceneX: contentWidth / 2,
      centerSceneY: contentHeight / 2,
      contentWidth,
      contentHeight,
      viewportWidth,
      viewportHeight,
    });
    expect(fitCamera).not.toBeNull();
    if (!fitCamera) return;

    const insertCenter = viewportSceneCenterFromScroll(
      fitCamera.panX,
      fitCamera.panY,
      fitCamera.zoom,
      viewportWidth,
      viewportHeight
    );

    let getAppStateCalls = 0;
    const { api, scenes } = makeFakeApi();
    api.getAppState = () => {
      getAppStateCalls += 1;
      // After the first read, simulate live-sync clobbering scrollY.
      const scrollY =
        getAppStateCalls > 1 ? fitCamera.panY + 600 : fitCamera.panY;
      return {
        scrollX: fitCamera.panX,
        scrollY,
        width: viewportWidth,
        height: viewportHeight,
        zoom: { value: fitCamera.zoom },
      };
    };

    const svg = new Blob(["<svg>...</svg>"], { type: "image/svg+xml" });
    const result = await insertMathSvgOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      svgBlob: svg,
      widthPx: 240,
      heightPx: 80,
      latex: "x^2",
      insertCenter,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inserted = scenes[0][0] as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    expect(inserted.x + inserted.width / 2).toBeCloseTo(insertCenter.x, 5);
    expect(inserted.y + inserted.height / 2).toBeCloseTo(insertCenter.y, 5);
    // Viewport center on a PDF-fit board is the page center — not below the image.
    expect(inserted.y + inserted.height / 2).toBeCloseTo(contentHeight / 2, 5);
  });

  it("inserts a math SVG with latex preserved in customData", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/eq.svg",
      sizeBytes: 100,
    });
    const { api, files, scenes } = makeFakeApi();
    const svg = new Blob(["<svg>...</svg>"], { type: "image/svg+xml" });
    const result = await insertMathSvgOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      svgBlob: svg,
      widthPx: 240,
      heightPx: 80,
      latex: "\\frac{1}{2}",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/svg+xml",
        assetTag: "math-equation",
      })
    );
    expect(files[0][0].mimeType).toBe("image/svg+xml");
    expect(scenes).toHaveLength(1);
    const inserted = scenes[0][0] as Record<string, unknown>;
    const customData = inserted.customData as {
      latex?: string;
      assetUrl?: string;
      wbType?: string;
    };
    expect(customData.latex).toBe("\\frac{1}{2}");
    expect(customData.assetUrl).toBe("https://blob.example/eq.svg");
    expect(customData.wbType).toBe("text");
  });

  it("rejects empty page arrays", async () => {
    const { api } = makeFakeApi();
    const result = await insertPdfPagesOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      pages: [],
      filename: "f.pdf",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/No pages/);
  });
});

describe("buildGraphEmbeddableElement", () => {
  it("builds an embeddable with the graph sentinel link and customData", () => {
    const el = buildGraphEmbeddableElement({
      x: 10,
      y: 20,
      width: 720,
      height: 540,
      graphState: { bbox: DEFAULT_GRAPH_BBOX, expressions: ["x^2"] },
    }) as Record<string, unknown>;
    expect(el.type).toBe("embeddable");
    expect(el.link).toBe(GRAPH_EMBED_LINK);
    expect(el.x).toBe(10);
    expect(el.y).toBe(20);
    const customData = el.customData as {
      wbType?: string;
      graph?: { provider: string };
      graphStateJson?: string;
    };
    expect(customData.wbType).toBe("graph");
    expect(customData.graph?.provider).toBe("jsxgraph");
    expect(JSON.parse(customData.graphStateJson ?? "{}")).toEqual({
      bbox: DEFAULT_GRAPH_BBOX,
      expressions: ["x^2"],
    });
  });
});

describe("insertGraphOnCanvas", () => {
  it("inserts at viewport center with graph sentinel link", () => {
    const { api, scenes } = makeFakeApi();
    const result = insertGraphOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      initialExpressions: ["sin(x)"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(scenes).toHaveLength(1);
    const el = scenes[0][0] as Record<string, unknown>;
    expect(el.type).toBe("embeddable");
    expect(el.link).toBe(GRAPH_EMBED_LINK);
    expect(el.x).toBe(500 - 720 / 2);
    expect(el.y).toBe(400 - 540 / 2);
    const customData = el.customData as { graphStateJson?: string };
    expect(JSON.parse(customData.graphStateJson ?? "{}").expressions).toEqual([
      "sin(x)",
    ]);
  });
});
