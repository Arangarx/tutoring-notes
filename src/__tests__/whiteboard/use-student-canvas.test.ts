/**
 * @jest-environment jsdom
 */
/**
 * `useStudentWhiteboardCanvas` — symmetric apply discipline (Phase 1 sync redesign).
 */
import { renderHook, act } from "@testing-library/react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";

jest.mock("@/lib/whiteboard/hydrate-remote-files", () => ({
  hydrateRemoteImageFilesForScene: jest.fn(
    async (
      api: ExcalidrawApiLike,
      elements: ReadonlyArray<ExcalidrawLikeElement | unknown>
    ) => {
      const images = (elements as ExcalidrawLikeElement[]).filter(
        (e) =>
          e.type === "image" &&
          typeof e.customData?.assetUrl === "string" &&
          e.customData.assetUrl.length >= 8 &&
          typeof e.fileId === "string"
      );
      if (images.length > 0 && api.addFiles) {
        api.addFiles(
          images.map((e) => ({
            id: e.fileId as string,
            mimeType: "image/png" as const,
            dataURL: "data:image/png;base64,aa",
            created: 1,
          }))
        );
      }
      const missingAssetUrlFileIds = (elements as ExcalidrawLikeElement[])
        .filter((e) => e.type === "image" && !e.customData?.assetUrl)
        .map((e) => e.fileId as string)
        .filter(Boolean);
      return {
        addedFileCount: images.length,
        fetchFailed: [],
        missingAssetUrlFileIds,
      };
    }
  ),
}));

/** Per-element LWW test double (mirrors reconcileElements rules; no Excalidraw import in Jest). */
type LwwElement = { id: string; version: number; versionNonce: number };

async function lwwMergeForTests(
  localElementsRaw: ReadonlyArray<unknown>,
  remoteElementsRaw: ReadonlyArray<unknown>
) {
  const localElements = localElementsRaw as ReadonlyArray<LwwElement>;
  const remoteElements = remoteElementsRaw as ReadonlyArray<LwwElement>;
  const byId = new Map<string, LwwElement>();
  for (const el of localElements) byId.set(el.id, el);
  for (const remote of remoteElements) {
    const local = byId.get(remote.id);
    if (!local) {
      byId.set(remote.id, remote);
      continue;
    }
    const keepRemote =
      remote.version > local.version ||
      (remote.version === local.version &&
        remote.versionNonce < local.versionNonce);
    byId.set(remote.id, keepRemote ? remote : local);
  }
  return [...byId.values()] as unknown as ReadonlyArray<ExcalidrawLikeElement>;
}

jest.mock("@/lib/whiteboard/apply-reconciled-remote-scene", () => ({
  mergeScenesReconciled: jest.fn(lwwMergeForTests),
  updateSceneMergingWithRemote: jest.fn(),
}));

import { mergeScenesReconciled } from "@/lib/whiteboard/apply-reconciled-remote-scene";
import { hydrateRemoteImageFilesForScene } from "@/lib/whiteboard/hydrate-remote-files";
import { useStudentWhiteboardCanvas } from "@/hooks/useStudentWhiteboardCanvas";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import type {
  WhiteboardSyncClient,
  WhiteboardWireRemoteDetails,
} from "@/lib/whiteboard/sync-client";

const mergeSpy = mergeScenesReconciled as jest.MockedFunction<
  typeof mergeScenesReconciled
>;

function makeElement(
  id: string,
  version: number,
  versionNonce: number,
  extra?: Partial<ExcalidrawLikeElement>
): ExcalidrawLikeElement {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version,
    versionNonce,
    ...extra,
  } as ExcalidrawLikeElement;
}

function makeMockSync() {
  const remoteCb: Array<
    (
      peerId: string,
      el: ReadonlyArray<ExcalidrawLikeElement>,
      details?: WhiteboardWireRemoteDetails
    ) => void
  > = [];
  const pageViewCb: Array<
    (
      from: string,
      msg: import("@/lib/whiteboard/sync-client").WhiteboardWirePageViewStateMsg
    ) => void
  > = [];
  const connectCb: Array<() => void> = [];
  const disconnectCb: Array<() => void> = [];
  const peerCountCb: Array<(n: number) => void> = [];
  const broadcastScene = jest.fn();
  const sync = {
    onRemoteScene: (cb: (typeof remoteCb)[number]) => {
      remoteCb.push(cb);
      return () => {
        const i = remoteCb.indexOf(cb);
        if (i >= 0) remoteCb.splice(i, 1);
      };
    },
    onRemotePageViewState: (cb: (typeof pageViewCb)[number]) => {
      pageViewCb.push(cb);
      return () => {
        const i = pageViewCb.indexOf(cb);
        if (i >= 0) pageViewCb.splice(i, 1);
      };
    },
    onConnect: (cb: () => void) => {
      connectCb.push(cb);
      return () => {
        const i = connectCb.indexOf(cb);
        if (i >= 0) connectCb.splice(i, 1);
      };
    },
    onDisconnect: (cb: () => void) => {
      disconnectCb.push(cb);
      return () => {
        const i = disconnectCb.indexOf(cb);
        if (i >= 0) disconnectCb.splice(i, 1);
      };
    },
    onPeerCountChange: (cb: (n: number) => void) => {
      peerCountCb.push(cb);
      return () => {
        const i = peerCountCb.indexOf(cb);
        if (i >= 0) peerCountCb.splice(i, 1);
      };
    },
    broadcastScene,
  };
  return {
    sync: sync as unknown as WhiteboardSyncClient,
    broadcastScene,
    emitRemote(
      peerId: string,
      el: ReadonlyArray<ExcalidrawLikeElement>,
      details?: WhiteboardWireRemoteDetails
    ) {
      for (const c of remoteCb) c(peerId, el, details);
    },
    emitConnect() {
      for (const c of connectCb) c();
    },
    emitDisconnect() {
      for (const c of disconnectCb) c();
    },
    emitPeerCount(n: number) {
      for (const c of peerCountCb) c(n);
    },
    emitPageViewState(
      msg: import("@/lib/whiteboard/sync-client").WhiteboardWirePageViewStateMsg
    ) {
      for (const c of pageViewCb) c("tutor-peer", msg);
    },
  };
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function makeApi(opts: {
  elements?: ExcalidrawLikeElement[];
  appState?: Record<string, unknown>;
}) {
  let scene = opts.elements ?? [];
  const updateScene = jest.fn((patch: { elements?: unknown; appState?: unknown }) => {
    if (patch.elements) {
      scene = patch.elements as ExcalidrawLikeElement[];
    }
  });
  const api = {
    updateScene,
    addFiles: jest.fn(),
    getSceneElements: () => scene,
    getAppState: () =>
      opts.appState ?? {
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        width: 800,
        height: 600,
      },
  } as unknown as ExcalidrawApiLike;
  return { api, updateScene, getScene: () => scene, setScene: (els: ExcalidrawLikeElement[]) => {
    scene = els;
  } };
}

describe("useStudentWhiteboardCanvas", () => {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    mergeSpy.mockClear();
    mergeSpy.mockImplementation(lwwMergeForTests);
    consoleInfoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("drops inbound v2 with warn log (Q2)", async () => {
    const { sync, emitRemote } = makeMockSync();
    const { api } = makeApi({});
    renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, {
        joinToken: "jt",
        whiteboardSessionId: "sess-1",
      })
    );

    await act(async () => {
      emitRemote("tutor", [{ id: "x" } as ExcalidrawLikeElement]);
      await Promise.resolve();
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/wba=\d+ author=tutor action=v2-drop warn/)
    );
  });

  it("does not broadcast during v3 apply (P8)", async () => {
    const { sync, broadcastScene, emitRemote } = makeMockSync();
    const { api } = makeApi({ elements: [] });
    renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, { joinToken: "jt" })
    );

    await act(async () => {
      emitRemote("tutor", [], {
        document: {
          rev: 1,
          pages: { p1: [{ id: "t1" } as ExcalidrawLikeElement] },
        },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(broadcastScene).not.toHaveBeenCalled();
  });

  it("broadcasts local onChange when not applying remote", () => {
    const { sync, broadcastScene } = makeMockSync();
    const api = { updateScene: jest.fn() } as unknown as ExcalidrawApiLike;
    const { result } = renderHook(() => useStudentWhiteboardCanvas(sync, api));

    act(() => {
      result.current.onCanvasChange([{ id: "x" } as unknown as ExcalidrawLikeElement]);
    });
    expect(broadcastScene).toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[student-broadcast\].*reason=onChange/)
    );
  });

  it("preserves local-only elements across tutor v3 apply (P7)", async () => {
    const { sync, emitRemote } = makeMockSync();
    const localStroke = makeElement("local-stroke", 2, 100);
    const tutorStroke = makeElement("tutor-stroke", 1, 50);
    const { api } = makeApi({ elements: [localStroke] });

    const { result } = renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, { joinToken: "jt" })
    );

    act(() => {
      result.current.onCanvasChange([localStroke]);
    });

    await act(async () => {
      emitRemote("tutor", [], {
        document: { rev: 1, pages: { p1: [tutorStroke] } },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
      });
    });
    await flushAsyncWork();

    const mergedIds = (api.getSceneElements() as ExcalidrawLikeElement[]).map(
      (e) => e.id
    );
    expect(mergedIds).toContain("local-stroke");
    expect(mergedIds).toContain("tutor-stroke");
  });

  it("v3 apply after tutor page switch does not bleed live canvas into inactive buckets (P1)", async () => {
    const { sync, emitRemote } = makeMockSync();
    const p1OnlyOnCanvas = [makeElement("p1-stroke", 1, 1)];
    const p2Remote = [makeElement("p2-remote-only", 1, 2)];
    const { api } = makeApi({ elements: p1OnlyOnCanvas });

    renderHook(() => useStudentWhiteboardCanvas(sync, api, undefined, { joinToken: "jt" }));

    await act(async () => {
      emitRemote("tutor", [], {
        document: {
          rev: 1,
          pages: {
            p1: [makeElement("p1-remote", 1, 3)],
            p2: p2Remote,
          },
        },
        page: {
          activePageId: "p2",
          pageList: [
            { id: "p1", title: "P1" },
            { id: "p2", title: "P2" },
          ],
        },
      });
    });
    await flushAsyncWork();

    const p2Merge = mergeSpy.mock.calls.find(
      ([, remote]) =>
        Array.isArray(remote) &&
        (remote as ExcalidrawLikeElement[]).some((e) => e.id === "p2-remote-only")
    );
    expect(p2Merge).toBeDefined();
    const [p2Local] = p2Merge!;
    expect(
      (p2Local as ExcalidrawLikeElement[]).some((e) => e.id === "p1-stroke")
    ).toBe(false);
  });

  it("merges active page from pageDataRef and repaints live on same-page apply", async () => {
    const { sync, emitRemote } = makeMockSync();
    const bucketP1 = [makeElement("cached-p1", 5, 5)];
    const liveWrong = [makeElement("live-wrong", 9, 9)];
    const { api, updateScene } = makeApi({ elements: liveWrong });
    renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, { joinToken: "jt" })
    );

    await act(async () => {
      emitRemote("tutor", [], {
        document: {
          rev: 1,
          pages: { p1: [makeElement("remote", 1, 1)] },
        },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const [localArg] = mergeSpy.mock.calls[0]!;
    expect((localArg as ExcalidrawLikeElement[]).some((e) => e.id === "cached-p1")).toBe(
      false
    );
    expect((localArg as ExcalidrawLikeElement[]).some((e) => e.id === "live-wrong")).toBe(
      false
    );
    const elementWrites = updateScene.mock.calls.filter(
      (c) => (c[0] as { elements?: unknown }).elements
    );
    expect(elementWrites.length).toBeGreaterThan(0);
  });

  it("defers live repaint when pageSwitchProgrammaticRef is non-zero", async () => {
    const { sync, emitRemote } = makeMockSync();
    const bucketP1 = [makeElement("cached-p1", 5, 5)];
    const liveWrong = [makeElement("live-wrong", 9, 9)];
    const { api, updateScene } = makeApi({ elements: liveWrong });
    const { result } = renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, { joinToken: "jt" })
    );

    act(() => {
      result.current.pageSwitchProgrammaticRef.current += 1;
    });

    await act(async () => {
      result.current.onCanvasChange(bucketP1);
      emitRemote("tutor", [], {
        document: {
          rev: 1,
          pages: { p1: [makeElement("remote", 1, 1)] },
        },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const [localArg] = mergeSpy.mock.calls[0]!;
    expect((localArg as ExcalidrawLikeElement[]).some((e) => e.id === "cached-p1")).toBe(
      true
    );
    expect((localArg as ExcalidrawLikeElement[]).some((e) => e.id === "live-wrong")).toBe(
      false
    );
    const elementWrites = updateScene.mock.calls.filter(
      (c) => (c[0] as { elements?: unknown }).elements
    );
    expect(elementWrites.length).toBe(0);

    act(() => {
      result.current.pageSwitchProgrammaticRef.current = 0;
    });
  });

  it("re-broadcasts active page on reconnect after disconnect", () => {
    const { sync, broadcastScene, emitDisconnect, emitConnect } = makeMockSync();
    const local = [makeElement("student-stroke", 1, 1)];
    const { api } = makeApi({ elements: local });
    const { result } = renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, {
        joinToken: "jt",
        whiteboardSessionId: "wb-1",
      })
    );

    act(() => {
      result.current.onCanvasChange(local);
    });
    broadcastScene.mockClear();

    act(() => {
      emitDisconnect();
      emitConnect();
    });

    expect(broadcastScene).toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/reason=reconnect/)
    );
  });

  it("drops stale v3 rev", async () => {
    const { sync, emitRemote } = makeMockSync();
    const { api, updateScene } = makeApi({ elements: [] });
    renderHook(() => useStudentWhiteboardCanvas(sync, api, undefined, { joinToken: "jt" }));

    const v3 = (rev: number) =>
      emitRemote("tutor", [], {
        document: {
          rev,
          pages: {
            p1: [makeElement("e1", rev, rev)],
          },
        },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
      });

    await act(async () => {
      v3(2);
      v3(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/action=rev-drop/)
    );
    const writes = updateScene.mock.calls.filter(
      (c) => (c[0] as { elements?: unknown }).elements
    );
    expect(writes.length).toBeLessThanOrEqual(2);
  });

  it("emits wba= and author= tags on v3 apply", async () => {
    const { sync, emitRemote } = makeMockSync();
    const { api } = makeApi({ elements: [] });
    renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, {
        joinToken: "jt",
        whiteboardSessionId: "sess-x",
      })
    );

    await act(async () => {
      emitRemote("tutor", [], {
        document: { rev: 1, pages: { p1: [] } },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
      });
    });
    await flushAsyncWork();

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/wba=\d+ author=tutor action=apply-v3-start/)
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/wba=\d+ author=tutor action=apply-v3-complete/)
    );
  });

  it("snapToTutorView center-aligns when tutor viewport size is on follow wire", async () => {
    const { sync, emitRemote } = makeMockSync();
    const { api, updateScene } = makeApi({
      elements: [],
      appState: {
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        width: 800,
        height: 600,
      },
    });
    const { result } = renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, {
        joinToken: "jt",
        followTutorView: false,
      })
    );

    await act(async () => {
      emitRemote("tutor", [], {
        document: { rev: 1, pages: { p1: [] } },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
        follow: {
          scrollX: 100,
          scrollY: 50,
          zoom: 1,
          viewportWidth: 1200,
          viewportHeight: 900,
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.snapToTutorView();
    });

    const appStateCalls = updateScene.mock.calls.filter(
      (c) => (c[0] as { appState?: { scrollX?: number } }).appState
    );
    const last = appStateCalls[appStateCalls.length - 1]![0] as {
      appState: { scrollX: number; scrollY: number; zoom: { value: number } };
    };
    expect(last.appState.scrollX).toBeCloseTo(300, 5);
    expect(last.appState.scrollY).toBeCloseTo(200, 5);
  });

  // ----------------------------------------------------------------------
  // Headline live-render: consecutive SAME-PAGE tutor broadcasts must each
  // paint on the student WITHOUT any page switch and WITHOUT a manual flush.
  // This drives the real receipt → enqueue → runV3Apply → merge → updateScene
  // path (the production apply cadence). If the rewrite's gated/bucketed apply
  // only paints on a page switch, this goes RED.
  // ----------------------------------------------------------------------
  it("paints consecutive SAME-PAGE tutor strokes live (no page switch)", async () => {
    const { sync, emitRemote } = makeMockSync();
    const { api } = makeApi({ elements: [] });
    renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, {
        joinToken: "jt",
        whiteboardSessionId: "sess-live",
      })
    );

    const emitSamePageDoc = (rev: number, els: ExcalidrawLikeElement[]) =>
      emitRemote("tutor", [], {
        document: { rev, pages: { p1: els } },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
      });

    const a = makeElement("stroke-A", 1, 11);
    const b = makeElement("stroke-B", 1, 12);
    const c = makeElement("stroke-C", 1, 13);

    await act(async () => {
      emitSamePageDoc(1, [a]);
    });
    await flushAsyncWork();
    let ids = (api.getSceneElements() as ExcalidrawLikeElement[]).map((e) => e.id);
    expect(ids).toContain("stroke-A");

    await act(async () => {
      emitSamePageDoc(2, [a, b]);
    });
    await flushAsyncWork();
    ids = (api.getSceneElements() as ExcalidrawLikeElement[]).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["stroke-A", "stroke-B"]));

    await act(async () => {
      emitSamePageDoc(3, [a, b, c]);
    });
    await flushAsyncWork();
    ids = (api.getSceneElements() as ExcalidrawLikeElement[]).map((e) => e.id);
    expect(ids).toEqual(
      expect.arrayContaining(["stroke-A", "stroke-B", "stroke-C"])
    );
  });

  // Inv 4 analogue: viewport center-align must apply on a SAME-PAGE apply
  // (it rides the same v3 broadcast as the strokes). No page switch.
  it("applies tutor viewport center-align on same-page apply (inv 4)", async () => {
    const { sync, emitRemote } = makeMockSync();
    const { api, updateScene } = makeApi({
      elements: [],
      appState: {
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        width: 800,
        height: 600,
      },
    });
    renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, {
        joinToken: "jt",
        whiteboardSessionId: "sess-vp",
        followTutorView: true,
      })
    );

    await act(async () => {
      emitRemote("tutor", [], {
        document: { rev: 1, pages: { p1: [makeElement("m", 1, 1)] } },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
        follow: {
          scrollX: 100,
          scrollY: 50,
          zoom: 1,
          viewportWidth: 1200,
          viewportHeight: 900,
        },
      });
    });
    await flushAsyncWork();
    // applyViewportAligned defers the appState write via requestAnimationFrame;
    // flush rAF + its writeAppState before asserting.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const appStateCalls = updateScene.mock.calls.filter(
      (c) => (c[0] as { appState?: { scrollX?: number } }).appState
    );
    expect(appStateCalls.length).toBeGreaterThan(0);
    const last = appStateCalls[appStateCalls.length - 1]![0] as {
      appState: { scrollX: number; scrollY: number };
    };
    // tutor center (100,50)+(1200/2,900/2) scene center → student 800x600 aligned
    expect(last.appState.scrollX).toBeCloseTo(300, 5);
    expect(last.appState.scrollY).toBeCloseTo(200, 5);
  });

  it("follows tutor pan/zoom via pageViewState wire (live viewport cadence)", async () => {
    const { sync, emitRemote, emitPageViewState } = makeMockSync();
    const { api, updateScene } = makeApi({
      elements: [],
      appState: {
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        width: 800,
        height: 600,
      },
    });
    renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, {
        joinToken: "jt",
        followTutorView: true,
      })
    );

    await act(async () => {
      emitRemote("tutor", [], {
        document: { rev: 1, pages: { p1: [] } },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
        follow: {
          scrollX: 0,
          scrollY: 0,
          zoom: 1,
          viewportWidth: 1200,
          viewportHeight: 900,
        },
      });
    });
    await flushAsyncWork();

    act(() => {
      emitPageViewState({
        v: 1,
        kind: "pageViewState",
        peerId: "tutor-peer",
        role: "tutor",
        pageId: "p1",
        panX: 100,
        panY: 50,
        zoom: 1.25,
      });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const appStateCalls = updateScene.mock.calls.filter(
      (c) => (c[0] as { appState?: { scrollX?: number } }).appState
    );
    const last = appStateCalls[appStateCalls.length - 1]![0] as {
      appState: { scrollX: number; scrollY: number; zoom: { value: number } };
    };
    expect(last.appState.zoom.value).toBeCloseTo(1.25, 5);
    // center-aligned scroll for tutor pan (100,50) @ zoom 1.25, student 800×600
    expect(last.appState.scrollX).toBeCloseTo(260, 5);
    expect(last.appState.scrollY).toBeCloseTo(170, 5);
  });

  it("hydrates tutor image binaries when v3 elements carry assetUrl", async () => {
    const hydrateSpy = hydrateRemoteImageFilesForScene as jest.MockedFunction<
      typeof hydrateRemoteImageFilesForScene
    >;
    const { sync, emitRemote } = makeMockSync();
    const imageEl = {
      id: "pdf-img",
      type: "image",
      fileId: "file-pdf",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      customData: { assetUrl: "https://blob.example/worksheet.png" },
    } as ExcalidrawLikeElement;
    const { api } = makeApi({ elements: [] });

    renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, { joinToken: "jt" })
    );

    await act(async () => {
      emitRemote("tutor", [], {
        document: { rev: 1, pages: { p1: [imageEl] } },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
      });
    });
    await flushAsyncWork();

    expect(hydrateSpy).toHaveBeenCalled();
    expect(api.addFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "file-pdf" }),
      ])
    );
  });

  it("concurrent same-element edits converge via per-element LWW (real reconcile)", async () => {
    const { sync, emitRemote } = makeMockSync();
    const sharedId = "shared-rect";
    const localWinner = makeElement(sharedId, 3, 10);
    const remoteLoser = makeElement(sharedId, 2, 99);
    const { api } = makeApi({ elements: [localWinner] });

    const { result } = renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, { joinToken: "jt" })
    );

    act(() => {
      result.current.onCanvasChange([localWinner]);
    });

    await act(async () => {
      emitRemote("tutor", [], {
        document: { rev: 1, pages: { p1: [remoteLoser] } },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const after = api.getSceneElements() as ExcalidrawLikeElement[];
    const el = after.find((e) => e.id === sharedId);
    expect(el?.version).toBe(3);
  });
});
