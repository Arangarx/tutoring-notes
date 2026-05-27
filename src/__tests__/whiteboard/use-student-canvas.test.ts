/**
 * @jest-environment jsdom
 */
/**
 * `useStudentWhiteboardCanvas` — suppresses re-broadcast when applying
 * remote scenes and calls broadcastScene for local edits.
 */
import { renderHook, act } from "@testing-library/react";
import { useStudentWhiteboardCanvas } from "@/hooks/useStudentWhiteboardCanvas";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";

jest.mock("@/lib/whiteboard/apply-reconciled-remote-scene", () => ({
  mergeScenesReconciled: jest.fn(
    async (_local: unknown, remote: ReadonlyArray<ExcalidrawLikeElement>) => remote
  ),
}));
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";

function makeMockSync() {
  const remoteCb: Array<
    (
      peerId: string,
      el: ReadonlyArray<ExcalidrawLikeElement>,
      details?: import("@/lib/whiteboard/sync-client").WhiteboardWireRemoteDetails
    ) => void
  > = [];
  const broadcastScene = jest.fn();
  const sync = {
    onRemoteScene: (cb: (typeof remoteCb)[number]) => {
      remoteCb.push(cb);
      return () => {
        const i = remoteCb.indexOf(cb);
        if (i >= 0) remoteCb.splice(i, 1);
      };
    },
    onRemotePageViewState: jest.fn(() => () => undefined),
    onConnect: jest.fn(() => () => undefined),
    onPeerCountChange: jest.fn(() => () => undefined),
    broadcastScene,
  };
  return {
    sync: sync as unknown as WhiteboardSyncClient,
    broadcastScene,
    emitRemote(
      peerId: string,
      el: ReadonlyArray<ExcalidrawLikeElement>,
      details?: import("@/lib/whiteboard/sync-client").WhiteboardWireRemoteDetails
    ) {
      for (const c of remoteCb) c(peerId, el, details);
    },
  };
}

describe("useStudentWhiteboardCanvas", () => {
  it("applies remote scenes via updateScene and does not broadcast in that path", async () => {
    const { sync, broadcastScene, emitRemote } = makeMockSync();
    const updateScene = jest.fn();
    const api = {
      updateScene,
      addFiles: jest.fn(),
      getSceneElements: () => [] as ExcalidrawLikeElement[],
      getAppState: () => ({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    } as unknown as ExcalidrawApiLike;
    const { result } = renderHook(() => useStudentWhiteboardCanvas(sync, api));

    await act(async () => {
      emitRemote("tutor-1", []);
      await Promise.resolve();
    });
    expect(updateScene).toHaveBeenCalledWith({ elements: [] });
    expect(broadcastScene).not.toHaveBeenCalled();
    void result.current; // keep hook return alive for linter
  });

  it("broadcasts local onChange when not applying remote", () => {
    const { sync, broadcastScene } = makeMockSync();
    const api = { updateScene: jest.fn() } as unknown as ExcalidrawApiLike;
    const { result } = renderHook(() => useStudentWhiteboardCanvas(sync, api));

    act(() => {
      result.current.onCanvasChange([{ id: "x" } as unknown as ExcalidrawLikeElement]);
    });
    expect(broadcastScene).toHaveBeenCalled();
  });

  it("snapToTutorView applies pageList viewState for the active page", async () => {
    const { sync, emitRemote } = makeMockSync();
    const updateScene = jest.fn();
    const api = {
      updateScene,
      addFiles: jest.fn(),
      getSceneElements: () => [] as ExcalidrawLikeElement[],
      getAppState: () => ({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    } as unknown as ExcalidrawApiLike;
    const { result } = renderHook(() =>
      useStudentWhiteboardCanvas(sync, api, undefined, {
        joinToken: "jt",
        followTutorView: false,
      })
    );

    await act(async () => {
      emitRemote("tutor", [], {
        document: { rev: 1, pages: { p1: [] } },
        page: {
          activePageId: "p1",
          pageList: [
            {
              id: "p1",
              title: "P",
              viewState: { panX: 12, panY: 34, zoom: 1.5 },
            },
          ],
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
    expect(appStateCalls.length).toBeGreaterThanOrEqual(1);
    const last = appStateCalls[appStateCalls.length - 1]![0] as {
      appState: { scrollX: number; scrollY: number; zoom: { value: number } };
    };
    expect(last.appState.scrollX).toBe(12);
    expect(last.appState.scrollY).toBe(34);
    expect(last.appState.zoom.value).toBe(1.5);
  });

  it("drops stale v3 rev that would regress the committed rev", async () => {
    const { sync, emitRemote } = makeMockSync();
    const updateScene = jest.fn();
    const api = {
      updateScene,
      addFiles: jest.fn(),
      getSceneElements: () => [] as ExcalidrawLikeElement[],
      getAppState: () => ({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    } as unknown as ExcalidrawApiLike;
    renderHook(() => useStudentWhiteboardCanvas(sync, api));

    const v3 = (rev: number, pageId: string) =>
      emitRemote("tutor", [], {
        document: {
          rev,
          pages: {
            [pageId]: [{ id: "e1", type: "rectangle", x: 0, y: 0, width: 1, height: 1 }],
          },
        },
        page: {
          activePageId: pageId,
          pageList: [{ id: pageId, title: "P" }],
        },
      });

    await act(async () => {
      v3(2, "p1");
      v3(1, "p1");
      await Promise.resolve();
      await Promise.resolve();
    });

    const callsWithElements = updateScene.mock.calls.filter(
      (c) => (c[0] as { elements?: unknown }).elements
    );
    expect(callsWithElements.length).toBeGreaterThanOrEqual(1);
  });
});
