/**
 * @jest-environment jsdom
 */

/**
 * Regression: ?wbdebug=1 must not break the student join / sync-client path.
 * Root cause was HudLines reading `st?.zoom.value` ΓÇö throws when appState
 * exists but zoom is not yet populated (Excalidraw pre-ready).
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";

jest.mock("@/components/whiteboard/UndoRedoButtons", () => ({
  UndoRedoButtons: () => null,
}));
jest.mock("@/hooks/useStudentWhiteboardCanvas", () => ({
  useStudentWhiteboardCanvas: () => ({
    onCanvasChange: jest.fn(),
    syncActivePageElements: jest.fn(),
    snapToTutorView: jest.fn(),
    getPageBroadcastExtras: jest.fn(() => null),
    pageList: [],
    sectionsRegistry: {},
    activePageId: "p1",
    tutorStreamReady: true,
  }),
}));
jest.mock("@/lib/whiteboard/ensure-native-image-asset-urls-for-sync", () => ({
  ensureNativeImageAssetUrlsForSync: jest.fn(async () => null),
}));
jest.mock("@/lib/whiteboard/validate-embeddable", () => ({
  validateExcalidrawEmbeddable: jest.fn(() => true),
}));
jest.mock("@/lib/whiteboard/active-time", () => ({
  ACTIVE_PING_STALE_MS: 10_000,
  computeDisplayActiveMs: () => 0,
}));
jest.mock("@/hooks/useWindowScrollToTopOnMount", () => ({
  useWindowScrollToTopOnMount: () => undefined,
}));
jest.mock("@/hooks/useExcalidrawThemeFromSystem", () => ({
  useExcalidrawThemeFromSystem: () => "light",
}));
jest.mock("next/navigation", () => ({
  useParams: () => ({ joinToken: "tok-stub" }),
}));
jest.mock("@/hooks/useLiveAV", () => ({
  useLiveAV: () => ({
    participants: [],
    reachableParticipants: [],
    localAudioStream: null,
    localVideoStream: null,
    hasMicPermission: "prompt",
    hasCamPermission: "prompt",
    isMicMuted: false,
    isCamMuted: true,
    error: null,
    videoError: null,
    toggleMic: jest.fn(),
    toggleCam: jest.fn(),
    requestMic: jest.fn(),
    requestCam: jest.fn(),
    isAcquiring: false,
    isActive: false,
    reconnectPeer: jest.fn(),
    retryAcquire: jest.fn(),
  }),
}));

const mockCreateWhiteboardSyncClient = jest.fn((_opts: unknown) => ({
  isConnected: () => false,
  disconnect: jest.fn(),
  onRemoteScene: () => () => {},
  onConnect: jest.fn(() => () => {}),
  onDisconnect: jest.fn(() => () => {}),
  onPeerCountChange: jest.fn(() => () => {}),
  onRoomPeersChange: jest.fn(() => () => {}),
  broadcastScene: jest.fn(),
  broadcastDocument: jest.fn(),
  flushPendingBroadcast: jest.fn(),
}));

jest.mock("@/lib/whiteboard/sync-client", () => ({
  createWhiteboardSyncClient: (opts: unknown) =>
    mockCreateWhiteboardSyncClient(opts),
}));

/** Simulates Excalidraw mounting with a pre-ready partial appState (no zoom). */
jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: ({
    excalidrawAPI,
  }: {
    excalidrawAPI?: (api: unknown) => void;
  }) => {
    React.useEffect(() => {
      const partialApi = {
        getAppState: () => ({
          scrollX: 0,
          scrollY: 0,
          width: 800,
          height: 600,
        }),
        getSceneElements: () => [],
      } as unknown as ExcalidrawApiLike;
      excalidrawAPI?.(partialApi);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; parent passes inline callback
    }, []);
    return null;
  },
}));

const baseProps = {
  whiteboardSessionId: "wb-sess-student-1",
  studentId: "stu-1",
  joinToken: "tok-stub",
  syncUrl: "wss://wb.example.com",
  tutorName: "Ms. Sarah",
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
};

beforeAll(() => {
  global.fetch = jest.fn(async () =>
    new Response(
      JSON.stringify({ live: true, activeMs: 0, lastActiveAt: null }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  ) as unknown as typeof fetch;
});

describe("StudentWhiteboardClient with ?wbdebug=1", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockCreateWhiteboardSyncClient.mockClear();
    window.history.replaceState(
      null,
      "",
      "/w/tok-stub?wbdebug=1#k=test-integration-key-16chars-min"
    );
  });

  it("creates sync client and mounts canvas without throwing", async () => {
    const mod = await import("@/app/w/[joinToken]/StudentWhiteboardClient");
    render(<mod.StudentWhiteboardClient {...baseProps} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateWhiteboardSyncClient).toHaveBeenCalledTimes(1);
    expect(mockCreateWhiteboardSyncClient).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "student",
        roomId: baseProps.whiteboardSessionId,
        encryptionKeyBase64Url: "test-integration-key-16chars-min",
      })
    );
    expect(
      screen.getByTestId("student-whiteboard-canvas-mount")
    ).toBeTruthy();
    expect(screen.queryByTestId("whiteboard-debug-hud")).toBeNull();
  });
});
