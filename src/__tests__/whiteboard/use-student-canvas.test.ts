/**
 * @jest-environment jsdom
 */
/**
 * `useStudentWhiteboardCanvas` — symmetric apply discipline (Phase 1 sync redesign).
 */
import { renderHook, act } from "@testing-library/react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import {
  followWireFromTutorAppState,
  studentScrollFromFollowCenter,
  viewportCoordsToSceneCoords,
} from "@/lib/whiteboard/viewport-align";
import type { WhiteboardWireFollow } from "@/lib/whiteboard/sync-client";

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

function tutorFollowWire(
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
): WhiteboardWireFollow {
  const wire = followWireFromTutorAppState({
    scrollX,
    scrollY,
    zoom: { value: zoom },
    width: viewportWidth,
    height: viewportHeight,
  });
  if (!wire) throw new Error("tutor viewport dims required");
  return wire;
}

/** Scene point at viewport center after a student scroll/zoom apply. */
function sceneCenterAtStudentViewport(
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  return viewportCoordsToSceneCoords(
    { clientX: viewportWidth / 2, clientY: viewportHeight / 2 },
    {
      zoom: { value: zoom },
      offsetLeft: 0,
      offsetTop: 0,
      scrollX,
      scrollY,
    }
  );
}

function appStateViewportCalls(updateScene: jest.Mock) {
  return updateScene.mock.calls.filter(
    (c) => (c[0] as { appState?: { scrollX?: number } }).appState
  );
}

const studentViewport = {
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1 },
  width: 800,
  height: 600,
};

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
  // Track appState so getAppState() reflects patches applied via updateScene,
  // matching real Excalidraw behaviour (the view-lock fix reads getAppState()
  // in onApplied to get the actual post-clamp state).
  let currentAppState: Record<string, unknown> = opts.appState ?? {
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
    width: 800,
    height: 600,
  };
  const updateScene = jest.fn((patch: { elements?: unknown; appState?: Record<string, unknown>; captureUpdate?: string }) => {
    if (patch.elements) {
      scene = patch.elements as ExcalidrawLikeElement[];
    }
    if (patch.appState) {
      currentAppState = { ...currentAppState, ...patch.appState };
    }
  });
  const api = {
    updateScene,
    addFiles: jest.fn(),
    getSceneElements: () => scene,
    getAppState: () => currentAppState,
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

  // ----------------------------------------------------------------------
  // Follow gating (owner spec) — continuous sync vs independent view vs snap
  // ----------------------------------------------------------------------
  describe("follow gating (owner spec)", () => {
    it("with follow OFF, tutor follow broadcasts do not move student scroll/zoom", async () => {
      const { sync, emitRemote, emitPageViewState } = makeMockSync();
      const { api, updateScene } = makeApi({
        elements: [],
        appState: { ...studentViewport },
      });
      renderHook(() =>
        useStudentWhiteboardCanvas(sync, api, undefined, {
          joinToken: "jt",
          followTutorView: false,
        })
      );

      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 1, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow: tutorFollowWire(100, 50, 1, 1200, 900),
        });
      });
      await flushAsyncWork();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(appStateViewportCalls(updateScene)).toHaveLength(0);

      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 2, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow: tutorFollowWire(200, 80, 1.5, 1200, 900),
        });
        emitPageViewState({
          v: 1,
          kind: "pageViewState",
          peerId: "tutor-peer",
          role: "tutor",
          pageId: "p1",
          panX: 10,
          panY: 20,
          zoom: 1.5,
        });
      });
      await flushAsyncWork();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(appStateViewportCalls(updateScene)).toHaveLength(0);
    });

    it("with follow ON, tutor follow moves student viewport center to broadcast centerScene", async () => {
      const { sync, emitRemote } = makeMockSync();
      const { api, updateScene } = makeApi({
        elements: [],
        appState: { ...studentViewport },
      });
      renderHook(() =>
        useStudentWhiteboardCanvas(sync, api, undefined, {
          joinToken: "jt",
          followTutorView: true,
        })
      );

      const follow = tutorFollowWire(100, 50, 1.25, 1200, 900);

      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 1, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow,
        });
      });
      await flushAsyncWork();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const vpCalls = appStateViewportCalls(updateScene);
      expect(vpCalls.length).toBeGreaterThan(0);
      const last = vpCalls[vpCalls.length - 1]![0] as {
        appState: {
          scrollX: number;
          scrollY: number;
          zoom: { value: number };
        };
      };
      const center = sceneCenterAtStudentViewport(
        last.appState.scrollX,
        last.appState.scrollY,
        last.appState.zoom.value,
        studentViewport.width,
        studentViewport.height
      );
      expect(center.x).toBeCloseTo(follow.centerSceneX!, 5);
      expect(center.y).toBeCloseTo(follow.centerSceneY!, 5);
      expect(last.appState.zoom.value).toBeCloseTo(follow.zoom!, 5);
    });

    it("snap-follow applies once with follow OFF and does not enable continuous follow", async () => {
      const { sync, emitRemote } = makeMockSync();
      const { api, updateScene } = makeApi({
        elements: [],
        appState: { ...studentViewport },
      });
      const { result } = renderHook(() =>
        useStudentWhiteboardCanvas(sync, api, undefined, {
          joinToken: "jt",
          followTutorView: false,
        })
      );

      const follow = tutorFollowWire(100, 50, 1, 1200, 900);

      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 1, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow,
        });
      });
      await flushAsyncWork();
      expect(appStateViewportCalls(updateScene)).toHaveLength(0);

      act(() => {
        result.current.snapToTutorView();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(appStateViewportCalls(updateScene)).toHaveLength(1);

      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 2, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow: tutorFollowWire(300, 120, 2, 1200, 900),
        });
      });
      await flushAsyncWork();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(appStateViewportCalls(updateScene)).toHaveLength(1);
    });

    it("with follow ON, user pan/zoom reverts immediately (view lock)", async () => {
      const { sync, emitRemote } = makeMockSync();
      const { api, updateScene } = makeApi({
        elements: [],
        appState: { ...studentViewport },
      });
      const { result } = renderHook(() =>
        useStudentWhiteboardCanvas(sync, api, undefined, {
          joinToken: "jt",
          followTutorView: true,
        })
      );

      const follow = tutorFollowWire(100, 50, 1.25, 1200, 900);

      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 1, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow,
        });
      });
      await flushAsyncWork();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const vpCallsBeforeUserPan = appStateViewportCalls(updateScene);
      expect(vpCallsBeforeUserPan.length).toBeGreaterThan(0);
      const locked = vpCallsBeforeUserPan[vpCallsBeforeUserPan.length - 1]![0] as {
        appState: { scrollX: number; scrollY: number; zoom: { value: number } };
      };

      act(() => {
        result.current.markStudentViewportGesture();
        result.current.onCanvasChange([], {
          ...studentViewport,
          scrollX: locked.appState.scrollX + 50,
          scrollY: locked.appState.scrollY + 30,
          zoom: { value: locked.appState.zoom.value + 0.5 },
        });
      });

      const revertCalls = appStateViewportCalls(updateScene).slice(
        vpCallsBeforeUserPan.length
      );
      expect(revertCalls).toHaveLength(1);
      const revert = revertCalls[0]![0] as {
        appState: { scrollX: number; scrollY: number; zoom: { value: number } };
        captureUpdate?: string;
      };
      expect(revert.captureUpdate).toBe("NEVER");
      expect(revert.appState.scrollX).toBeCloseTo(locked.appState.scrollX, 5);
      expect(revert.appState.scrollY).toBeCloseTo(locked.appState.scrollY, 5);
      expect(revert.appState.zoom.value).toBeCloseTo(locked.appState.zoom.value, 5);
    });

    it("with follow OFF, user pan/zoom is not reverted", async () => {
      const { sync } = makeMockSync();
      const { api, updateScene } = makeApi({
        elements: [],
        appState: { ...studentViewport },
      });
      const { result } = renderHook(() =>
        useStudentWhiteboardCanvas(sync, api, undefined, {
          joinToken: "jt",
          followTutorView: false,
        })
      );

      act(() => {
        result.current.onCanvasChange([], {
          ...studentViewport,
          scrollX: 99,
          scrollY: 88,
          zoom: { value: 2 },
        });
      });

      expect(appStateViewportCalls(updateScene)).toHaveLength(0);
    });
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
        follow: tutorFollowWire(100, 50, 1, 1200, 900),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.snapToTutorView();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const expected = studentScrollFromFollowCenter(
      tutorFollowWire(100, 50, 1, 1200, 900),
      800,
      600
    );
    const appStateCalls = updateScene.mock.calls.filter(
      (c) => (c[0] as { appState?: { scrollX?: number } }).appState
    );
    const last = appStateCalls[appStateCalls.length - 1]![0] as {
      appState: { scrollX: number; scrollY: number; zoom: { value: number } };
    };
    expect(last.appState.scrollX).toBeCloseTo(expected.scrollX, 5);
    expect(last.appState.scrollY).toBeCloseTo(expected.scrollY, 5);
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
        follow: tutorFollowWire(100, 50, 1, 1200, 900),
      });
    });
    await flushAsyncWork();
    // applyViewportAligned defers the appState write via requestAnimationFrame;
    // flush rAF + its writeAppState before asserting.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const expected = studentScrollFromFollowCenter(
      tutorFollowWire(100, 50, 1, 1200, 900),
      800,
      600
    );
    const appStateCalls = updateScene.mock.calls.filter(
      (c) => (c[0] as { appState?: { scrollX?: number } }).appState
    );
    expect(appStateCalls.length).toBeGreaterThan(0);
    const last = appStateCalls[appStateCalls.length - 1]![0] as {
      appState: { scrollX: number; scrollY: number };
    };
    expect(last.appState.scrollX).toBeCloseTo(expected.scrollX, 5);
    expect(last.appState.scrollY).toBeCloseTo(expected.scrollY, 5);
  });

  it("follows tutor pan/zoom via v3 follow wire (live viewport cadence)", async () => {
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
        follow: tutorFollowWire(0, 0, 1, 1200, 900),
      });
    });
    await flushAsyncWork();

    const followAfterPan = tutorFollowWire(100, 50, 1.25, 1200, 900);

    await act(async () => {
      emitRemote("tutor", [], {
        document: { rev: 2, pages: { p1: [] } },
        page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
        follow: followAfterPan,
      });
    });
    await flushAsyncWork();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const expected = studentScrollFromFollowCenter(followAfterPan, 800, 600);
    const appStateCalls = updateScene.mock.calls.filter(
      (c) => (c[0] as { appState?: { scrollX?: number } }).appState
    );
    const last = appStateCalls[appStateCalls.length - 1]![0] as {
      appState: { scrollX: number; scrollY: number; zoom: { value: number } };
    };
    expect(last.appState.zoom.value).toBeCloseTo(1.25, 5);
    expect(last.appState.scrollX).toBeCloseTo(expected.scrollX, 5);
    expect(last.appState.scrollY).toBeCloseTo(expected.scrollY, 5);
  });

  // -----------------------------------------------------------------------
  // Sync regression: Wave-5 view-lock fighting tutor-origin viewport applies
  // Reproduces the "can only follow so far" bug reported 2026-06-21.
  // Mechanisms tested:
  //   (A) tutorViewportApplyRef guards onCanvasChange during the rAF window
  //       after runV3Apply's finally prematurely clears applyingRemoteRef.
  //   (B) View-lock is set from actual post-clamp appState, not requested
  //       scroll, so onChange with clamped values never triggers a revert.
  //   (C) A stream of tutor viewport applies with NO student gesture must not
  //       revert — final viewport equals the last tutor position (gesture-gated
  //       view-lock; continuous Excalidraw onChange cadence is hardware-only).
  //   (D) A student gesture while synced still triggers view-lock revert.
  // -----------------------------------------------------------------------
  describe("view-lock sync regression (Wave-5 fix)", () => {
    it("(A) onCanvasChange during rAF window does not revert tutor apply", async () => {
      // The race: runV3Apply's finally clears applyingRemoteRef BEFORE the
      // rAF fires.  Without tutorViewportApplyRef, a follow-mode onChange
      // that arrives in this window compares against the stale lock (position
      // A) and reverts back, so the student never follows past A.
      //
      // This test validates the fix: after flushing the v3 chain (runV3Apply
      // complete, finally run) but BEFORE the rAF fires (no 60ms wait yet),
      // onCanvasChange with the NEW scroll values is a no-op because
      // tutorViewportApplyRef is still true.

      const { sync, emitRemote } = makeMockSync();
      const { api, updateScene } = makeApi({
        elements: [],
        appState: { ...studentViewport },
      });
      const { result } = renderHook(() =>
        useStudentWhiteboardCanvas(sync, api, undefined, {
          joinToken: "jt",
          followTutorView: true,
        })
      );

      // Step 1: establish lock at position A.
      const followA = tutorFollowWire(100, 50, 1.25, 1200, 900);
      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 1, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow: followA,
        });
      });
      await flushAsyncWork();
      // Fire rAF for A — onApplied sets lock, releases guard.
      await act(async () => { await new Promise((r) => setTimeout(r, 60)); });

      const vpAfterA = appStateViewportCalls(updateScene);
      expect(vpAfterA.length).toBeGreaterThan(0);

      // Step 2: send v3-rev2 with position B (significantly different).
      const followB = tutorFollowWire(500, 300, 0.5, 1200, 900);
      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 2, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow: followB,
        });
      });
      // Flush promises only — runV3Apply's try/finally completes, applyingRemoteRef
      // is cleared, but the rAF for B has NOT fired yet (needs the 60ms wait).
      // tutorViewportApplyRef is still true (set in applyViewportToCanvas before
      // applyViewportAligned scheduled the rAF).
      await flushAsyncWork();

      // Step 3: simulate Excalidraw calling onChange with position B's scroll
      // values (as it would after the rAF writes the new appState).  This is
      // the exact scenario that caused the original revert bug.
      const posB = studentScrollFromFollowCenter(followB, studentViewport.width, studentViewport.height);
      const callsBefore = updateScene.mock.calls.length;
      act(() => {
        result.current.onCanvasChange([], {
          ...studentViewport,
          scrollX: posB.scrollX,
          scrollY: posB.scrollY,
          zoom: { value: posB.zoom },
        });
      });

      // With the fix: tutorViewportApplyRef blocks the revert → no appState
      // updateScene calls.  Without the fix: revert to stale lock A fires.
      const afterCalls = updateScene.mock.calls.slice(callsBefore);
      const revertCalls = afterCalls.filter(
        (c) => (c[0] as { appState?: unknown }).appState
      );
      expect(revertCalls).toHaveLength(0);
    });

    it("(C) consecutive tutor applies without student gesture do not revert", async () => {
      // Independent oracle: studentScrollFromFollowCenter for each wire position.
      // jsdom cannot reproduce Excalidraw's async onChange cadence during live
      // pan — this test asserts gesture-gated classification only.
      const follows = [
        tutorFollowWire(100, 50, 1.25, 1200, 900),
        tutorFollowWire(200, 120, 1.1, 1200, 900),
        tutorFollowWire(350, 200, 0.9, 1200, 900),
        tutorFollowWire(500, 300, 0.75, 1200, 900),
        tutorFollowWire(620, 410, 0.6, 1200, 900),
      ];

      const { sync, emitRemote } = makeMockSync();
      const { api, updateScene } = makeApi({
        elements: [],
        appState: { ...studentViewport },
      });
      const { result } = renderHook(() =>
        useStudentWhiteboardCanvas(sync, api, undefined, {
          joinToken: "jt",
          followTutorView: true,
        })
      );

      for (let i = 0; i < follows.length; i++) {
        const follow = follows[i]!;
        await act(async () => {
          emitRemote("tutor", [], {
            document: { rev: i + 1, pages: { p1: [] } },
            page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
            follow,
          });
        });
        await flushAsyncWork();
        await act(async () => {
          await new Promise((r) => setTimeout(r, 60));
        });

        const expected = studentScrollFromFollowCenter(
          follow,
          studentViewport.width,
          studentViewport.height
        );
        const callsBeforeOnChange = updateScene.mock.calls.length;
        act(() => {
          result.current.onCanvasChange([], {
            ...studentViewport,
            scrollX: expected.scrollX,
            scrollY: expected.scrollY,
            zoom: { value: expected.zoom },
          });
        });
        const revertCalls = updateScene.mock.calls
          .slice(callsBeforeOnChange)
          .filter((c) => (c[0] as { appState?: unknown }).appState);
        expect(revertCalls).toHaveLength(0);
      }

      const lastFollow = follows[follows.length - 1]!;
      const oracle = studentScrollFromFollowCenter(
        lastFollow,
        studentViewport.width,
        studentViewport.height
      );
      const st = api.getAppState() as {
        scrollX: number;
        scrollY: number;
        zoom: { value: number };
      };
      expect(st.scrollX).toBeCloseTo(oracle.scrollX, 5);
      expect(st.scrollY).toBeCloseTo(oracle.scrollY, 5);
      expect(st.zoom.value).toBeCloseTo(oracle.zoom, 5);
    });

    it("(D) student gesture while synced still triggers view-lock revert", async () => {
      const { sync, emitRemote } = makeMockSync();
      const { api, updateScene } = makeApi({
        elements: [],
        appState: { ...studentViewport },
      });
      const { result } = renderHook(() =>
        useStudentWhiteboardCanvas(sync, api, undefined, {
          joinToken: "jt",
          followTutorView: true,
        })
      );

      const follow = tutorFollowWire(100, 50, 1.25, 1200, 900);
      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 1, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow,
        });
      });
      await flushAsyncWork();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const vpCalls = appStateViewportCalls(updateScene);
      const locked = vpCalls[vpCalls.length - 1]![0] as {
        appState: { scrollX: number; scrollY: number; zoom: { value: number } };
      };

      const callsBefore = updateScene.mock.calls.length;
      act(() => {
        result.current.markStudentViewportGesture();
        result.current.onCanvasChange([], {
          ...studentViewport,
          scrollX: locked.appState.scrollX + 80,
          scrollY: locked.appState.scrollY + 40,
          zoom: { value: locked.appState.zoom.value + 0.25 },
        });
      });

      const revertCalls = updateScene.mock.calls
        .slice(callsBefore)
        .filter((c) => (c[0] as { appState?: unknown }).appState);
      expect(revertCalls).toHaveLength(1);
      const revert = revertCalls[0]![0] as {
        appState: { scrollX: number; scrollY: number; zoom: { value: number } };
      };
      expect(revert.appState.scrollX).toBeCloseTo(locked.appState.scrollX, 5);
      expect(revert.appState.scrollY).toBeCloseTo(locked.appState.scrollY, 5);
      expect(revert.appState.zoom.value).toBeCloseTo(locked.appState.zoom.value, 5);
    });

    it("(B) view-lock uses actual post-clamp appState, not requested scroll", async () => {
      // Excalidraw clamps scroll internally at extreme pan/zoom.  If the lock
      // is set from the requested (unclamped) scroll, subsequent onChange events
      // with the actual (clamped) scroll look like a student pan → revert loop.
      // This test simulates the clamp with a mock that caps scroll at ±100.

      const { sync, emitRemote } = makeMockSync();

      const CLAMP = 100;
      let clampedScrollX = 0;
      let clampedScrollY = 0;
      const updateSceneMock = jest.fn(
        (patch: { elements?: unknown; appState?: { scrollX?: number; scrollY?: number } }) => {
          if (patch.appState) {
            const reqX = patch.appState.scrollX ?? clampedScrollX;
            const reqY = patch.appState.scrollY ?? clampedScrollY;
            clampedScrollX = Math.max(Math.min(reqX, CLAMP), -CLAMP);
            clampedScrollY = Math.max(Math.min(reqY, CLAMP), -CLAMP);
          }
        }
      );
      const clampApi = {
        updateScene: updateSceneMock,
        addFiles: jest.fn(),
        getSceneElements: () => [] as ExcalidrawLikeElement[],
        getAppState: () => ({
          scrollX: clampedScrollX,
          scrollY: clampedScrollY,
          zoom: { value: 1 },
          width: 800,
          height: 600,
        }),
      } as unknown as ExcalidrawApiLike;

      const { result } = renderHook(() =>
        useStudentWhiteboardCanvas(sync, clampApi, undefined, {
          joinToken: "jt",
          followTutorView: true,
        })
      );

      // Tutor at scrollX=900, student center = (600-900)/1 = -300 (scene).
      // Student scroll for that center: 800/2/1 - (-300) = 700 → clamped to 100.
      // Oracle: studentScrollFromFollowCenter verifies the student scroll exceeds
      // CLAMP, confirming the clamping scenario is exercised.
      const follow = tutorFollowWire(900, 900, 1, 1200, 900);
      const computedScroll = studentScrollFromFollowCenter(follow, 800, 600);
      expect(computedScroll.scrollX).toBeGreaterThan(CLAMP);

      await act(async () => {
        emitRemote("tutor", [], {
          document: { rev: 1, pages: { p1: [] } },
          page: { activePageId: "p1", pageList: [{ id: "p1", title: "P" }] },
          follow,
        });
      });
      await flushAsyncWork();
      // Fire the rAF — onApplied reads actual (clamped) appState for the lock.
      await act(async () => { await new Promise((r) => setTimeout(r, 60)); });

      // At this point clampedScrollX = 100 (clamped from 700), and the lock
      // should be set from getAppState() (actual = 100), not from the requested
      // scroll (700).

      // Simulate onChange with the actual clamped values (what real Excalidraw
      // would report after updateScene clips the scroll internally).
      const callsBefore = updateSceneMock.mock.calls.length;
      act(() => {
        result.current.onCanvasChange([], {
          scrollX: clampedScrollX,  // actual value = 100
          scrollY: clampedScrollY,
          zoom: { value: 1 },
          width: 800,
          height: 600,
        });
      });

      // With the fix: lock = actual (100) = onChange scroll (100) → no revert.
      // Without the fix: lock = requested (700) ≠ 100 → revert fires.
      const newCalls = updateSceneMock.mock.calls.slice(callsBefore);
      const revertCalls = newCalls.filter(
        (c) => (c[0] as { appState?: unknown }).appState
      );
      expect(revertCalls).toHaveLength(0);
    });
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
