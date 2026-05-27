/**
 * @jest-environment jsdom
 *
 * Coverage for the Phase 1c snapshot PNG generator
 * (`src/lib/whiteboard/snapshot-png.ts`).
 *
 * Reliability axis under test: snapshot generation MUST NEVER throw
 * — failures degrade to `null` so the atomic end-session can continue
 * with `snapshotBlobUrl: undefined`. Every branch in the production
 * function maps to a case here so a future regression on "skip
 * gracefully when X" is caught locally rather than during a Sarah
 * session.
 *
 * We mock the `@excalidraw/excalidraw` module by way of the function's
 * `loadExcalidraw` injection point, so the test never has to load the
 * real (huge, JSDOM-incompatible) Excalidraw bundle.
 */

import {
  canvasToPng,
  generateSessionSnapshotPng,
  type ExportToCanvasFn,
} from "@/lib/whiteboard/snapshot-png";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import {
  EXCALIDRAW_BG_DARK_HEX,
  EXCALIDRAW_BG_LIGHT_HEX,
} from "@/styles/token-values";

const SILENT_LOGGER = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

function makeApi(
  overrides: Partial<{
    elements: ReadonlyArray<unknown>;
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
    throwOnGetSceneElements: boolean;
  }> = {}
): ExcalidrawApiLike {
  const elements: ReadonlyArray<unknown> = overrides.elements ?? [
    { id: "el-1", type: "rectangle", x: 0, y: 0, width: 50, height: 50 },
  ];
  const appState = overrides.appState ?? {
    scrollX: 0,
    scrollY: 0,
    width: 800,
    height: 600,
    zoom: { value: 1 },
    theme: "light",
  };
  const files = overrides.files ?? {};
  return {
    getSceneElements: () => {
      if (overrides.throwOnGetSceneElements) {
        throw new Error("api accessor exploded");
      }
      return elements;
    },
    getAppState: () => appState as never,
    getFiles: () => files,
    addFiles: () => {},
    updateScene: () => {},
  };
}

/**
 * Stand-in HTMLCanvasElement that supports `toBlob`. JSDOM's canvas
 * stub returns a 0×0 canvas with no real toBlob, so we synthesize one
 * that mirrors the semantics we care about (callback with a Blob; or
 * callback with null; or never call back to test the timeout).
 */
function fakeCanvas(opts: {
  blob?: Blob | null;
  hangForever?: boolean;
  toBlobThrows?: boolean;
}): HTMLCanvasElement {
  const node = {
    width: 100,
    height: 100,
    toBlob: (cb: (b: Blob | null) => void) => {
      if (opts.toBlobThrows) {
        throw new Error("toBlob exploded");
      }
      if (opts.hangForever) {
        return;
      }
      // Defer to a microtask so the callback fires after the calling
      // promise's `then` chain hooks — matches real browser timing.
      Promise.resolve().then(() => cb(opts.blob ?? null));
    },
  };
  return node as unknown as HTMLCanvasElement;
}

function makeExportToCanvas(
  canvasOrThrow:
    | { canvas: HTMLCanvasElement }
    | { throws: Error }
): {
  exportToCanvas: ExportToCanvasFn;
  spy: jest.Mock;
} {
  const spy = jest.fn();
  const fn: ExportToCanvasFn = async (args) => {
    spy(args);
    if ("throws" in canvasOrThrow) throw canvasOrThrow.throws;
    return canvasOrThrow.canvas;
  };
  return { exportToCanvas: fn, spy };
}

// ----------------------------------------------------------------
// Happy-path generation
// ----------------------------------------------------------------

describe("generateSessionSnapshotPng — happy path", () => {
  it("returns blob + sizeBytes when scene has elements and exportToCanvas succeeds", async () => {
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
      type: "image/png",
    });
    const canvas = fakeCanvas({ blob });
    const { exportToCanvas, spy } = makeExportToCanvas({ canvas });

    const result = await generateSessionSnapshotPng(makeApi(), {
      whiteboardSessionId: "wbsid-happy",
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
    });

    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe("image/png");
    expect(result!.sizeBytes).toBe(blob.size);
    expect(result!.blob).toBe(blob);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("clamps very large scenes via maxWidthOrHeight (default 2048, override respected)", async () => {
    const canvas = fakeCanvas({ blob: new Blob(["x"], { type: "image/png" }) });
    const { exportToCanvas, spy } = makeExportToCanvas({ canvas });

    await generateSessionSnapshotPng(makeApi(), {
      whiteboardSessionId: "wbsid-default-max",
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
    });
    expect(spy.mock.calls[0][0].maxWidthOrHeight).toBe(2048);

    await generateSessionSnapshotPng(makeApi(), {
      whiteboardSessionId: "wbsid-override-max",
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
      maxWidthOrHeight: 512,
    });
    expect(spy.mock.calls[1][0].maxWidthOrHeight).toBe(512);
  });

  it("forwards a white background by default and respects the override", async () => {
    const canvas = fakeCanvas({ blob: new Blob(["x"], { type: "image/png" }) });
    const { exportToCanvas, spy } = makeExportToCanvas({ canvas });

    await generateSessionSnapshotPng(makeApi(), {
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
    });
    expect(spy.mock.calls[0][0].appState.viewBackgroundColor).toBe(
      EXCALIDRAW_BG_LIGHT_HEX
    );
    expect(spy.mock.calls[0][0].appState.exportBackground).toBe(true);

    await generateSessionSnapshotPng(makeApi(), {
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
      backgroundColor: EXCALIDRAW_BG_DARK_HEX,
    });
    expect(spy.mock.calls[1][0].appState.viewBackgroundColor).toBe(
      EXCALIDRAW_BG_DARK_HEX
    );
  });
});

// ----------------------------------------------------------------
// Skip-gracefully branches (the meat of the reliability contract)
// ----------------------------------------------------------------

describe("generateSessionSnapshotPng — skip gracefully on failure", () => {
  it("returns null when api is null (workspace unmounted)", async () => {
    const result = await generateSessionSnapshotPng(null, {
      logger: SILENT_LOGGER,
    });
    expect(result).toBeNull();
  });

  it("returns null when scene is empty (no thumbnail to snap)", async () => {
    const canvas = fakeCanvas({ blob: new Blob(["x"], { type: "image/png" }) });
    const { exportToCanvas, spy } = makeExportToCanvas({ canvas });
    const result = await generateSessionSnapshotPng(
      makeApi({ elements: [] }),
      {
        loadExcalidraw: async () => ({ exportToCanvas }),
        logger: SILENT_LOGGER,
      }
    );
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null when the api accessor throws", async () => {
    const canvas = fakeCanvas({ blob: new Blob(["x"], { type: "image/png" }) });
    const { exportToCanvas, spy } = makeExportToCanvas({ canvas });
    const result = await generateSessionSnapshotPng(
      makeApi({ throwOnGetSceneElements: true }),
      {
        loadExcalidraw: async () => ({ exportToCanvas }),
        logger: SILENT_LOGGER,
      }
    );
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null when the dynamic excalidraw import rejects", async () => {
    const result = await generateSessionSnapshotPng(makeApi(), {
      loadExcalidraw: async () => {
        throw new Error("network blip during chunk fetch");
      },
      logger: SILENT_LOGGER,
    });
    expect(result).toBeNull();
  });

  it("returns null when the loaded module is missing exportToCanvas (older bundle)", async () => {
    const result = await generateSessionSnapshotPng(makeApi(), {
      loadExcalidraw: async () =>
        ({} as unknown as { exportToCanvas: ExportToCanvasFn }),
      logger: SILENT_LOGGER,
    });
    expect(result).toBeNull();
  });

  it("returns null when exportToCanvas throws (malformed legacy log)", async () => {
    const { exportToCanvas } = makeExportToCanvas({
      throws: new Error("element id collision"),
    });
    const result = await generateSessionSnapshotPng(makeApi(), {
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
    });
    expect(result).toBeNull();
  });

  it("returns null when exportToCanvas resolves to a non-canvas value", async () => {
    const exportToCanvas: ExportToCanvasFn = async () =>
      ({ width: 0, height: 0 } as unknown as HTMLCanvasElement);
    const result = await generateSessionSnapshotPng(makeApi(), {
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
    });
    expect(result).toBeNull();
  });

  it("returns null when canvas.toBlob throws synchronously", async () => {
    const canvas = fakeCanvas({ toBlobThrows: true });
    const { exportToCanvas } = makeExportToCanvas({ canvas });
    const result = await generateSessionSnapshotPng(makeApi(), {
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
    });
    expect(result).toBeNull();
  });

  it("returns null when canvas.toBlob produces a 0-byte blob", async () => {
    const canvas = fakeCanvas({
      blob: new Blob([], { type: "image/png" }),
    });
    const { exportToCanvas } = makeExportToCanvas({ canvas });
    const result = await generateSessionSnapshotPng(makeApi(), {
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
    });
    expect(result).toBeNull();
  });

  it("returns null when canvas.toBlob calls back with null (Safari pixel cap)", async () => {
    const canvas = fakeCanvas({ blob: null });
    const { exportToCanvas } = makeExportToCanvas({ canvas });
    const result = await generateSessionSnapshotPng(makeApi(), {
      loadExcalidraw: async () => ({ exportToCanvas }),
      logger: SILENT_LOGGER,
    });
    expect(result).toBeNull();
  });
});

// ----------------------------------------------------------------
// canvasToPng — direct timeout coverage
// ----------------------------------------------------------------

describe("canvasToPng helper", () => {
  it("resolves with the blob when toBlob calls back promptly", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    const result = await canvasToPng(fakeCanvas({ blob }), { timeoutMs: 200 });
    expect(result).toBe(blob);
  });

  it("resolves with null when toBlob never calls back within timeout", async () => {
    const result = await canvasToPng(fakeCanvas({ hangForever: true }), {
      timeoutMs: 25,
    });
    expect(result).toBeNull();
  });

  it("resolves with null when toBlob throws synchronously", async () => {
    const result = await canvasToPng(fakeCanvas({ toBlobThrows: true }), {
      timeoutMs: 200,
    });
    expect(result).toBeNull();
  });
});
