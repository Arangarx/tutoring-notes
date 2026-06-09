/**
 * @jest-environment jsdom
 */

/**
 * Student join defaults + sync checkbox wiring (follow gating owner spec ┬º4).
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";

jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: () => null,
}));
jest.mock("@/components/whiteboard/UndoRedoButtons", () => ({
  UndoRedoButtons: () => null,
}));

let capturedFollowTutorView: boolean | undefined;

jest.mock("@/hooks/useStudentWhiteboardCanvas", () => ({
  useStudentWhiteboardCanvas: (
    _sync: unknown,
    _api: unknown,
    _hydrate: unknown,
    options?: { followTutorView?: boolean }
  ) => {
    capturedFollowTutorView = options?.followTutorView;
    return {
      onCanvasChange: jest.fn(),
      syncActivePageElements: jest.fn(),
      snapToTutorView: jest.fn(),
      getPageBroadcastExtras: jest.fn(() => null),
      pageList: [],
      sectionsRegistry: {},
      activePageId: "p1",
      tutorStreamReady: true,
    };
  },
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
jest.mock("@/lib/whiteboard/sync-client", () => ({
  createWhiteboardSyncClient: () => ({
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
  }),
  generateEncryptionKeyBase64Url: () =>
    "test-integration-key-16chars-min",
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

const baseProps = {
  whiteboardSessionId: "wb-sess-student-1",
  studentId: "stu-1",
  joinToken: "tok-stub",
  syncUrl: "wss://wb.example.com",
  tutorName: "Ms. Sarah",
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
};

describe("StudentWhiteboardClient follow defaults", () => {
  beforeEach(() => {
    capturedFollowTutorView = undefined;
    window.history.replaceState(
      null,
      "",
      "#k=test-integration-key-16chars-min"
    );
  });

  it("defaults sync-to-tutor ON for a newly joined student (checkbox + followTutorView)", async () => {
    const mod = await import("@/app/w/[joinToken]/StudentWhiteboardClient");
    render(<mod.StudentWhiteboardClient {...baseProps} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const syncCheckbox = screen.getByRole("checkbox", {
      name: /Keep pan & zoom synced to tutor/i,
    });
    expect(syncCheckbox).toBeChecked();
    expect(capturedFollowTutorView).toBe(true);
  });
});
