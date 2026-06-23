/**
 * @jest-environment jsdom
 */

/**
 * Student-role chrome contract for the unified WhiteboardWorkspaceClient.
 *
 * Wave 1b: StudentLiveWorkspaceClient has been deleted; this suite was
 * retargeted to exercise WhiteboardWorkspaceClient with role="student".
 *
 * Preserves the three original behavioural contracts:
 *   1. Student chrome, recording disclosure, canvas mount render.
 *   2. Full student chrome surface: Exit, tool strip, read-only page
 *      strip (disabled tabs), topbar mic + cam, no AVPermissionsPrompt.
 *   3. Exit disconnects the student sync client (tutor-visible leave path).
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// ---- Heavy / unrelated modules: minimal stubs -----------------------

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    mode: "system" as const,
    resolvedTheme: "light" as const,
    setMode: jest.fn(),
  }),
}));

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
}));
jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  kickSessionChunksAction: jest.fn(() => Promise.resolve({ kicked: 0 })),
  triggerNotesGenerationAction: jest.fn(() => Promise.resolve()),
  loadSessionReviewPayload: jest.fn(() => Promise.resolve({
    studentName: "Test Student",
    startedAtIso: "2026-06-17T10:00:00.000Z",
    endedAtIso: "2026-06-17T11:00:00.000Z",
    durationSeconds: 3600,
    hasAudio: false,
    eventCount: 0,
    audioSegments: [],
    eventsProxyUrl: "/api/whiteboard/ws-1/events",
    snapshotProxyUrl: null,
    initialNote: { found: false, noteId: null, fields: null, status: null },
  })),
}));
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
  }),
}));
jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge",
  () => {
    const { forwardRef } = jest.requireActual<typeof import("react")>("react");
    return {
      WhiteboardWorkspaceAudioBridge: forwardRef<unknown, Record<string, unknown>>(
        function MockBridge() {
          return <div data-testid="mock-wb-audio-bridge" />;
        }
      ),
    };
  }
);

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
    onRemoteScene: () => () => undefined,
    onRemotePointer: () => () => undefined,
    broadcastScene: jest.fn(),
    broadcastDocument: jest.fn(),
    flushPendingBroadcast: jest.fn(),
    disconnect: mockDisconnect,
  }),
  generateEncryptionKeyBase64Url: () => "test-key-16charmin",
}));

// ---- Student-canvas hook mock ---------------------------------------

jest.mock("@/hooks/useStudentWhiteboardCanvas", () => ({
  useStudentWhiteboardCanvas: () => ({
    onCanvasChange: jest.fn(),
    syncActivePageElements: jest.fn(),
    snapToTutorView: jest.fn(),
    getPageBroadcastExtras: jest.fn(() => null),
    pageList: [{ id: "p1", title: "Board 1", section: "board" }],
    activePageId: "p1",
    activePageIdRef: { current: "p1" },
    applyingRemoteRef: { current: false },
    selectStudentPage: jest.fn(),
    tutorStreamReady: true,
  }),
}));

// ---- Collaborator pointers stub -------------------------------------

jest.mock("@/hooks/useCollaboratorPointers", () => ({
  useCollaboratorPointers: jest.fn(),
}));

// ---- Recording hooks: minimal stubs ---------------------------------

jest.mock("@/hooks/useWhiteboardRecorder", () => ({
  useWhiteboardRecorder: () => ({
    onCanvasChange: jest.fn(),
    ingestRemote: jest.fn(),
    eventCount: 0,
    durationMs: 0,
    lastCheckpointAt: null,
    checkpointStatus: "idle" as const,
    checkpointError: null,
    syncConnected: false,
    resumePrompt: null,
    acceptResume: jest.fn(),
    declineResume: jest.fn(),
    buildFinalEventsJson: jest.fn(() => "{}"),
    markPersisted: jest.fn(),
    checkpointMountResolved: true,
    postGateAutoCanvas: null,
    acknowledgePostGateAutoCanvas: jest.fn(),
    flushThrottledFrameNow: jest.fn(),
    broadcastScenePageSnapshot: jest.fn(),
  }),
}));

jest.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({
    state: "ready" as const,
    uploadMode: null,
    elapsed: 0,
    segmentNumber: 1,
    doneSegmentSeconds: 0,
    localMicStream: null,
    addRemoteAudio: () => () => {},
    devices: [],
    selectedDeviceId: "",
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
  }),
}));

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
    pickedVideoCameraSlot: 0,
    setVideoCameraBySlot: jest.fn().mockResolvedValue(undefined),
    setVideoDevice: jest.fn().mockResolvedValue(undefined),
    setMicDevice: jest.fn().mockResolvedValue(undefined),
    selectedVideoDeviceId: null,
  }),
}));

// ---- Excalidraw: capture initialData identity -----------------------

jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: ({
    initialData,
  }: {
    initialData?: unknown;
  }) => (
    <div
      data-testid="mock-excalidraw"
      data-has-initial-data={String(initialData != null)}
    />
  ),
}));

// ---- Navigation mock ------------------------------------------------

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  useParams: () => ({ joinToken: "join-token-abc" }),
}));

// ---- Import after all mocks -----------------------------------------

import { WhiteboardWorkspaceClient } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient";

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
};

// ---- Tests ----------------------------------------------------------

describe("WhiteboardWorkspaceClient role=student chrome contract (Wave 1b)", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/w/join-token-abc#k=0123456789abcdef0123456789abcdef");
    mockDisconnect.mockClear();
    // Stub scroll helpers not available in jsdom
    window.scrollTo = jest.fn();
    if (typeof globalThis.indexedDB === "undefined") {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: {} as IDBFactory,
      });
    }
  });

  it("renders student chrome with correct data-role, disclosure, and canvas mount", () => {
    render(<WhiteboardWorkspaceClient {...studentProps} />);

    expect(screen.getByTestId("mynk-wb-chrome")).toHaveAttribute("data-role", "student");
    expect(screen.getByTestId("wb-student-recording-disclosure")).toHaveTextContent(
      /being recorded by your tutor/i
    );
    expect(screen.getByTestId("student-whiteboard-canvas-mount")).toBeInTheDocument();
    expect(screen.getByTestId("mock-excalidraw")).toBeInTheDocument();
  });

  it("renders full student chrome: Exit, tool strip, read-only page strip, no AVPermissionsPrompt", () => {
    render(<WhiteboardWorkspaceClient {...studentProps} />);

    expect(screen.getByTestId("wb-student-exit")).toHaveAttribute("aria-label", "Exit");
    expect(screen.queryByTestId("av-permissions-prompt")).not.toBeInTheDocument();
    expect(screen.getByTestId("wb-student-tool-strip")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Pointer wand (K)" })[0]).toBeInTheDocument();
    expect(screen.getByTestId("wb-student-page-strip")).toBeInTheDocument();
    const activeBoardTab = screen.getByRole("tab", { name: "Board 1" });
    expect(activeBoardTab).toHaveAttribute("aria-current", "page");
    expect(activeBoardTab).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("wb-topbar-mic")).toBeInTheDocument();
    expect(screen.getByTestId("wb-topbar-cam")).toBeInTheDocument();
  });

  it("Exit disconnects the student sync client (tutor-visible leave path)", () => {
    render(<WhiteboardWorkspaceClient {...studentProps} />);

    expect(mockDisconnect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("wb-student-exit"));

    expect(screen.getByRole("status")).toHaveTextContent(/you left the session/i);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
