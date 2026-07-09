/**
 * @jest-environment jsdom
 */

/**
 * Student shell behavior oracles (RW-B1) — unified WhiteboardWorkspaceClient
 * with role="student". User-observable outcomes only: board visible after join,
 * sign-out navigates to learner login.
 */

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---- Heavy / unrelated modules: minimal stubs -----------------------

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    mode: "system" as const,
    resolvedTheme: "light" as const,
    setMode: jest.fn(),
  }),
}));

let mockLayoutMode: "desktop" | "narrow" = "desktop";

jest.mock("@/components/whiteboard/chrome/useWbLayoutMode", () => {
  const actual = jest.requireActual<
    typeof import("@/components/whiteboard/chrome/useWbLayoutMode")
  >("@/components/whiteboard/chrome/useWbLayoutMode");
  return {
    ...actual,
    useWbLayoutMode: () => ({
      layoutMode: mockLayoutMode,
      orientation:
        mockLayoutMode === "narrow" ? ("portrait" as const) : ("landscape" as const),
    }),
  };
});

jest.mock("@/components/whiteboard/PdfImageUploadButton", () => ({
  PdfImageUploadButton: () => null,
}));
jest.mock("@/components/whiteboard/MathInsertButton", () => ({
  MathInsertButton: () => null,
}));
jest.mock("@/components/whiteboard/GraphInsertButton", () => ({
  GraphInsertButton: () => null,
}));
jest.mock("@/lib/whiteboard/ensure-native-image-asset-urls-for-sync", () => ({
  ensureNativeImageAssetUrlsForSync: jest.fn(async () => null),
}));
jest.mock("@/lib/whiteboard/hydrate-remote-files", () => ({
  hydrateRemoteImageFilesForScene: jest.fn(async () => ({
    fetchFailed: [],
    missingAssetUrlFileIds: [],
  })),
}));
jest.mock("@/lib/whiteboard/apply-reconciled-remote-scene", () => ({
  mergeScenesReconciled: jest.fn(async (_a: unknown, b: unknown) => b),
  updateSceneMergingWithRemote: jest.fn(),
}));
jest.mock("@/components/whiteboard/UndoRedoButtons", () => ({
  UndoRedoButtons: () => null,
}));
jest.mock("@/hooks/useTutorLiveDocumentWire", () => ({
  useTutorLiveDocumentWire: () => ({
    scheduleDocumentBroadcast: jest.fn(),
    flushDocumentBroadcastNow: jest.fn(),
    flushThrottledFrameNow: jest.fn(),
  }),
}));
jest.mock("@/hooks/useWindowScrollToTopOnMount", () => ({
  useWindowScrollToTopOnMount: () => undefined,
}));
jest.mock("@/lib/whiteboard/upload", () => ({
  uploadWhiteboardEvents: jest.fn(async () => ({ ok: true, blobUrl: "https://blob.test/ev", sizeBytes: 1 })),
  uploadWhiteboardSnapshot: jest.fn(async () => ({ ok: true, blobUrl: "https://blob.test/snap", sizeBytes: 1 })),
}));
jest.mock("@/lib/whiteboard/snapshot-png", () => ({
  generateSessionSnapshotPng: jest.fn(async () => null),
}));
jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  endWhiteboardSession: jest.fn(() =>
    Promise.resolve({ endedAt: "2026-06-17T00:00:00Z", durationSeconds: 60, registeredSegments: 0 })
  ),
  issueJoinToken: jest.fn(() => Promise.resolve({ token: "tok" })),
  registerWhiteboardSessionAudioSegmentAction: jest.fn(() =>
    Promise.resolve({ ok: true as const, recordingId: "rec1", orderIndex: 0 })
  ),
  revokeJoinTokensForSession: jest.fn(() => Promise.resolve()),
  endStaleWhiteboardSession: jest.fn(() =>
    Promise.resolve({ endedAt: "2026-06-17T00:00:00Z" })
  ),
  startWhiteboardSession: jest.fn(() => Promise.resolve({ ok: true, phase: "active" })),
}));
jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  kickSessionChunksAction: jest.fn(() => Promise.resolve({ kicked: 0 })),
  triggerNotesGenerationAction: jest.fn(() => Promise.resolve()),
}));
jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge",
  () => {
    const WhiteboardWorkspaceAudioBridge = React.forwardRef(() => null);
    WhiteboardWorkspaceAudioBridge.displayName = "WhiteboardWorkspaceAudioBridge";
    return {
      __esModule: true,
      WhiteboardWorkspaceAudioBridge,
    };
  }
);
jest.mock("@/lib/recording/upload-outbox-instance", () => ({
  drainOutboxOrTimeout: jest.fn(async () => ({ timedOut: false, remainingCount: 0, remainingByStream: new Map(), lastError: null })),
  assembleEndSessionSegments: jest.fn(async () => []),
  finalizeOutboxAfterEnd: jest.fn(async () => undefined),
  registerSessionStudentId: jest.fn(),
  getOrCreateUploadOutbox: () => ({
    observe: () => ({
      getState: () => ({ state: "idle", inFlightStreamCount: 0, byStream: new Map(), lastError: null }),
      subscribe: (fn: (s: unknown) => void) => { void fn; return () => undefined; },
    }),
    enqueue: jest.fn().mockResolvedValue(undefined),
    onChange: () => () => {},
    list: jest.fn().mockResolvedValue([]),
    getInFlightCount: () => 0,
    drain: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock("@/lib/recording/recording-draft-store", () => ({
  getOrCreateRecordingDraftStore: () => ({
    clear: jest.fn().mockResolvedValue(undefined),
    findInProgress: jest.fn().mockResolvedValue(null),
    assemble: jest.fn(),
    checkpoint: jest.fn(),
  }),
}));

// ---- Sync-client mock with disconnect spy ----------------------------

const mockDisconnect = jest.fn();

jest.mock("@/lib/whiteboard/sync-client", () => ({
  createWhiteboardSyncClient: () => ({
    isConnected: () => true,
    onConnect: (cb: () => void) => {
      cb();
      return () => undefined;
    },
    onDisconnect: () => () => undefined,
    onPeerCountChange: () => () => undefined,
    onRoomPeersChange: () => () => undefined,
    setLocalAvMediaState: () => undefined,
    onRemoteScene: () => () => undefined,
    onRemotePointer: () => () => undefined,
    broadcastScene: jest.fn(),
    broadcastDocument: jest.fn(),
    flushPendingBroadcast: jest.fn(),
    disconnect: mockDisconnect,
  }),
  generateEncryptionKeyBase64Url: () => "test-integration-key-16chars-min",
}));

jest.mock("@/lib/recording/lifecycle-machine", () => {
  const actual = jest.requireActual("@/lib/recording/lifecycle-machine");
  return {
    ...actual,
    evaluateLifecycle: (inputs: Parameters<typeof actual.evaluateLifecycle>[0]) =>
      actual.evaluateLifecycle(inputs),
  };
});

jest.mock("@/lib/recording/remote-stream-recorder", () => {
  const actual = jest.requireActual("@/lib/recording/remote-stream-recorder");
  return {
    ...actual,
    createRemoteStreamRecorder: () => ({
      start: jest.fn(),
      stop: jest.fn().mockResolvedValue(undefined),
      isRecording: () => false,
      dispose: jest.fn(),
    }),
  };
});

jest.mock("@/components/whiteboard/GraphEmbeddable", () => ({
  GraphEmbeddable: () => null,
  warmJsxGraphModule: jest.fn(),
}));

// ---- Recording hooks: minimal stubs ---------------------------------

jest.mock("@/hooks/useWhiteboardRecorder", () => ({
  useWhiteboardRecorder: () => ({
    onCanvasChange: jest.fn(),
    flushTrailingFrame: jest.fn(),
    addManualEvent: jest.fn(),
    durationMs: 0,
    eventCount: 0,
    isFlushing: false,
    drawingActive: false,
    drainActiveDrawingThenFlush: jest.fn().mockResolvedValue(undefined),
    activeMs: 0,
    checkpointStatus: "idle" as const,
    checkpointError: null,
    checkpointMountResolved: true,
    lastCheckpointAt: null,
    resumePrompt: null,
    acceptResume: jest.fn().mockResolvedValue(null),
    declineResume: jest.fn(),
    postGateAutoCanvas: null,
    acknowledgePostGateAutoCanvas: jest.fn(),
    buildFinalEventsJson: jest.fn(() => "{}"),
    flushServerPersist: jest.fn().mockResolvedValue(undefined),
    setUiContext: jest.fn(),
    ingestRemote: jest.fn(),
    markPersisted: jest.fn(),
    flushThrottledFrameNow: jest.fn(),
    broadcastScenePageSnapshot: jest.fn(),
    syncConnected: true,
  }),
}));

jest.mock("@/hooks/useAudioRecorder", () => {
  const fakeLocalMicStream = {
    id: "fake-local-mic-stream",
    getAudioTracks: () => [],
    getVideoTracks: () => [],
    getTracks: () => [],
  } as unknown as MediaStream;
  return {
    useAudioRecorder: () => ({
      state: "ready" as const,
      uploadMode: null,
      elapsed: 0,
      sessionElapsed: 0,
      segmentNumber: 1,
      doneSegmentSeconds: 0,
      localMicStream: fakeLocalMicStream,
      addRemoteAudio: () => () => {},
      devices: [],
      selectedDeviceId: "",
      pickedMicSlot: 0,
      gainLinear: 1,
      setGainLinear: jest.fn(),
      chimeEnabled: false,
      setChimeEnabled: jest.fn(),
      chimeVolume: 0.5,
      setChimeVolume: jest.fn(),
      permissionState: "granted" as const,
      error: null,
      isLive: false,
      lockDevice: false,
      isWarning: false,
      meterBarRef: { current: null },
      handleStartRecording: jest.fn(),
      handleDeviceChange: jest.fn(),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      stopAndUpload: jest.fn(),
      handleReset: jest.fn(),
      flushPendingUploads: jest.fn(() => Promise.resolve()),
      setRemoteRecordingGain: jest.fn(),
    }),
  };
});

// ---- Live-AV stub ---------------------------------------------------

jest.mock("@/hooks/useLiveAV", () => ({
  useLiveAV: () => ({
    participants: [],
    reachableParticipants: [],
    localAudioStream: null,
    localVideoStream: null,
    hasMicPermission: "granted" as const,
    hasCamPermission: "granted" as const,
    isMicMuted: false,
    isCamMuted: false,
    error: null,
    videoError: null,
    isActive: true,
    isAcquiring: false,
    toggleMic: jest.fn(),
    toggleCam: jest.fn(),
    requestMic: jest.fn().mockResolvedValue(undefined),
    requestCam: jest.fn().mockResolvedValue(undefined),
    reconnectPeer: jest.fn(),
    leaveAllPeers: jest.fn(),
    retryAcquire: jest.fn().mockResolvedValue(undefined),
    videoDevices: [{ deviceId: "cam1", label: "Cam", kind: "videoinput", groupId: "", toJSON: () => ({}) }],
    audioDevices: [],
    refreshVideoDeviceList: jest.fn(),
    refreshAudioDeviceList: jest.fn(),
    pickedVideoCameraSlot: 0,
    pickedMicSlot: 0,
    selectedMicDeviceId: null,
    setVideoCameraBySlot: jest.fn().mockResolvedValue(undefined),
    setVideoDevice: jest.fn().mockResolvedValue(undefined),
    setMicDevice: jest.fn().mockResolvedValue(undefined),
    setMicDeviceBySlot: jest.fn().mockResolvedValue(undefined),
    selectedVideoDeviceId: null,
  }),
}));

// ---- Excalidraw: visible board region oracle ------------------------

jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: () => <div data-testid="mock-excalidraw" />,
}));

// ---- Navigation mock ------------------------------------------------

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  useParams: () => ({}),
}));

// ---- Import after all mocks -----------------------------------------

// ---- Helpers --------------------------------------------------------

const studentProps = {
  role: "student" as const,
  whiteboardSessionId: "wbs-p2",
  studentId: "stu-1",
  joinToken: "join-token-abc",
  syncUrl: "ws://localhost:3002",
  tutorName: "Sarah",
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
  initialSessionPhase: "ACTIVE" as const,
};

async function renderStudentWorkspace() {
  const mod = await import(
    "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient"
  );
  window.history.replaceState(
    null,
    "",
    "#k=test-integration-key-16chars-min"
  );
  const utils = render(<mod.WhiteboardWorkspaceClient {...studentProps} />);
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

const originalFetch = globalThis.fetch;

beforeAll(() => {
  if (typeof globalThis.indexedDB === "undefined") {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {} as IDBFactory,
    });
  }
});

beforeEach(() => {
  mockDisconnect.mockClear();
  mockLayoutMode = "desktop";
  window.scrollTo = jest.fn();
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/join-timer")) {
      return {
        ok: true,
        json: async () => ({ activeMs: 0, lastActiveAt: null, live: true }),
      } as Response;
    }
    if (url.includes("/api/auth/learner/logout")) {
      return { ok: true } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---- Tests (RW-B1 behavior oracles) ---------------------------------

describe("WhiteboardWorkspaceClient role=student — behavior (RW-B1)", () => {
  it("after student join on active session, whiteboard board region is visible", async () => {
    await renderStudentWorkspace();

    expect(screen.queryByTestId("wb-waiting-overlay")).not.toBeInTheDocument();
    expect(screen.getByTestId("student-whiteboard-canvas-mount")).toBeInTheDocument();
  });

  it("desktop layout: sign-out control is inline in the top bar", async () => {
    const user = userEvent.setup();
    mockLayoutMode = "desktop";
    await renderStudentWorkspace();

    expect(screen.getByTestId("learner-sign-out")).toBeInTheDocument();

    await user.click(screen.getByTestId("learner-sign-out"));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/learner/logout", {
        method: "POST",
      });
    });
    // LearnerSignOutButton sets window.location.href = "/students/login" after logout.
    // jsdom's Location is non-configurable and rejects non-hash navigation, so the
    // hard redirect URL cannot be read back here — see LearnerSignOutButton.dom.test.tsx
    // + P2-ID browser gate for full navigation oracle.
  });

  it("touch layout: sign-out is in the overflow menu, not inline", async () => {
    const user = userEvent.setup();
    mockLayoutMode = "narrow";
    await renderStudentWorkspace();

    expect(screen.queryByTestId("learner-sign-out")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("wb-student-topbar-overflow"));

    const signOut = await screen.findByTestId("learner-sign-out");
    expect(signOut).toHaveClass("mynk-wb-menu-item--destructive");

    await user.click(signOut);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/learner/logout", {
        method: "POST",
      });
    });
  });
});
