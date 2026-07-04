/**
 * @jest-environment jsdom
 *
 * CC-1 waiting-room Start button — overlay click invokes startWhiteboardSession
 * and consent failures should surface tutor-friendly copy.
 */

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CONSENT_RECORD_PARENT_SECTION_HINT,
  CONSENT_RECORD_TUTOR_MESSAGE,
} from "@/lib/consent-action-error";

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
jest.mock("@/lib/whiteboard/sync-client", () => ({
  createWhiteboardSyncClient: jest.fn(() => ({
    disconnect: jest.fn(),
    onRemoteScene: () => () => {},
    onConnect: () => () => {},
    onDisconnect: () => () => {},
    onPeerCountChange: () => () => {},
    onRoomPeersChange: () => () => {},
    onRemotePointer: () => () => {},
    isConnected: () => false,
    broadcastScene: jest.fn(),
    flushPendingBroadcast: jest.fn(),
    setLocalAvMediaState: jest.fn(),
  })),
  generateEncryptionKeyBase64Url: () => "test-integration-key-16chars-min",
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  useParams: () => ({}),
}));

const mockStartWhiteboardSession = jest.fn<
  Promise<{ ok: boolean; phase: string }>,
  [string, ("LIVE" | "IN_PERSON")?]
>(() => Promise.resolve({ ok: true, phase: "active" }));

jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  endWhiteboardSession: jest.fn(() =>
    Promise.resolve({ endedAt: "2026-05-10T00:00:00Z" })
  ),
  issueJoinToken: jest.fn(() => Promise.resolve({ token: "tok" })),
  registerWhiteboardSessionAudioSegmentAction: jest.fn(() =>
    Promise.resolve({ ok: true as const, recordingId: "rec1", orderIndex: 0 })
  ),
  revokeJoinTokensForSession: jest.fn(() => Promise.resolve()),
  endStaleWhiteboardSession: jest.fn(() =>
    Promise.resolve({ endedAt: "2026-05-10T00:00:00Z" })
  ),
  startWhiteboardSession: (
    sessionId: string,
    mode?: "LIVE" | "IN_PERSON"
  ) => mockStartWhiteboardSession(sessionId, mode),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  kickSessionChunksAction: jest.fn(() => Promise.resolve({ kicked: 0 })),
  triggerNotesGenerationAction: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/hooks/useLiveAV", () => ({
  useLiveAV: () => ({
    participants: [],
    reachableParticipants: [],
    localAudioStream: null,
    localVideoStream: null,
    hasMicPermission: "prompt" as const,
    hasCamPermission: "prompt" as const,
    isMicMuted: false,
    isCamMuted: true,
    error: null,
    videoError: null,
    toggleMic: jest.fn(),
    toggleCam: jest.fn(),
    requestMic: jest.fn().mockResolvedValue(undefined),
    requestCam: jest.fn().mockResolvedValue(undefined),
    isAcquiring: false,
    isActive: false,
    reconnectPeer: jest.fn(),
    retryAcquire: jest.fn().mockResolvedValue(undefined),
    videoDevices: [],
    audioDevices: [],
    refreshVideoDeviceList: jest.fn().mockResolvedValue(undefined),
    refreshAudioDeviceList: jest.fn().mockResolvedValue(undefined),
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

jest.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({
    state: "ready",
    uploadMode: null,
    elapsed: 0,
    sessionElapsed: 0,
    segmentNumber: 1,
    doneSegmentSeconds: 0,
    localMicStream: null,
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
    isLive: true,
    lockDevice: true,
    isWarning: false,
    meterBarRef: React.createRef<HTMLDivElement>(),
    handleStartRecording: jest.fn(),
    handleDeviceChange: jest.fn(),
    pauseRecording: jest.fn(),
    resumeRecording: jest.fn(),
    stopAndUpload: jest.fn(),
    handleReset: jest.fn(),
    flushPendingUploads: jest.fn(() => Promise.resolve()),
  }),
}));

jest.mock("@/hooks/useWhiteboardRecorder", () => ({
  useWhiteboardRecorder: () => ({
    onCanvasChange: jest.fn(),
    ingestRemote: jest.fn(),
    eventCount: 0,
    durationMs: 100,
    lastCheckpointAt: null,
    checkpointStatus: "idle" as const,
    checkpointError: null,
    syncConnected: false,
    resumePrompt: null,
    acceptResume: jest.fn(),
    declineResume: jest.fn(),
    buildFinalEventsJson: jest.fn(() => "{}"),
    flushServerPersist: jest.fn().mockResolvedValue(undefined),
    markPersisted: jest.fn(),
    checkpointMountResolved: true,
    postGateAutoCanvas: null,
    acknowledgePostGateAutoCanvas: jest.fn(),
    flushThrottledFrameNow: jest.fn(),
    broadcastScenePageSnapshot: jest.fn(),
  }),
}));

jest.mock("@/lib/recording/upload-outbox-instance", () => ({
  getOrCreateUploadOutbox: () => ({
    enqueue: jest.fn().mockResolvedValue(undefined),
    onChange: () => () => {},
    list: jest.fn().mockResolvedValue([]),
    getInFlightCount: () => 0,
    drain: jest.fn().mockResolvedValue(undefined),
  }),
  registerSessionStudentId: jest.fn(),
  drainOutboxOrTimeout: jest.fn().mockResolvedValue({ drained: true }),
  finalizeOutboxAfterEnd: jest.fn().mockResolvedValue(undefined),
  assembleEndSessionSegments: jest.fn().mockResolvedValue({ segments: [] }),
}));

jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge",
  () => {
    const { forwardRef } = jest.requireActual<typeof import("react")>("react");
    return {
      WhiteboardWorkspaceAudioBridge: forwardRef(function MockBridge() {
        return <div data-testid="mock-wb-audio-bridge" />;
      }),
    };
  }
);

const stableExcalidrawApi = {
  getSceneElements: () => [],
  getAppState: () => ({
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
  }),
  getFiles: () => ({}),
  updateScene: jest.fn(),
};

jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: function MockEx(props: Record<string, unknown>) {
    React.useEffect(() => {
      const callback = props.excalidrawAPI as
        | ((api: unknown) => void)
        | undefined;
      callback?.(stableExcalidrawApi);
    }, [props.excalidrawAPI]);
    return <div data-testid="wb-mock-excalidraw-canvas" />;
  },
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

import { WaitingRoomOverlay } from "@/components/whiteboard/chrome/WaitingRoomOverlay";
import { WhiteboardWorkspaceClient } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient";

const workspaceBaseProps = {
  whiteboardSessionId: "wb-wtr-consent-1",
  studentId: "stu-1",
  studentName: "Alex",
  adminUserId: "adm-1",
  startedAtIso: "2026-05-10T00:00:00.000Z",
  bothConnectedAtIso: null,
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
  syncUrl: "wss://wb.example.com",
  initialUserWantsRecording: false,
  initialSessionPhase: "PENDING" as const,
  sessionMode: "IN_PERSON",
};

beforeAll(() => {
  if (typeof globalThis.indexedDB === "undefined") {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {} as IDBFactory,
    });
  }
});

beforeEach(() => {
  mockStartWhiteboardSession.mockReset();
  mockStartWhiteboardSession.mockResolvedValue({ ok: true, phase: "active" });
  window.scrollTo = jest.fn();
  window.history.replaceState(
    null,
    "",
    "#k=test-integration-key-16chars-min"
  );
});

describe("WaitingRoomOverlay — Start button", () => {
  test("clicking Start session invokes onStart handler", async () => {
    const user = userEvent.setup();
    const onStart = jest.fn();

    render(
      <WaitingRoomOverlay
        role="tutor"
        sessionMode="IN_PERSON"
        studentConnected={false}
        tutorName="Ms. Smith"
        studentLabel="Alex"
        canStart
        isStarting={false}
        onStart={onStart}
        onSessionModeChange={jest.fn()}
        micControlNode={<div data-testid="mock-mic" />}
        camControlNode={<div data-testid="mock-cam" />}
        avTilesNode={<div data-testid="mock-tiles" />}
      />
    );

    await user.click(screen.getByTestId("wb-start-session"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("WhiteboardWorkspaceClient waiting room — startWhiteboardSession wiring", () => {
  test("Start session button calls startWhiteboardSession with session id and mode", async () => {
    const user = userEvent.setup();

    render(<WhiteboardWorkspaceClient {...workspaceBaseProps} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("wb-waiting-overlay")).toBeInTheDocument();

    await user.click(screen.getByTestId("wb-start-session"));

    await waitFor(() =>
      expect(mockStartWhiteboardSession).toHaveBeenCalledTimes(1)
    );
    expect(mockStartWhiteboardSession).toHaveBeenCalledWith(
      "wb-wtr-consent-1",
      "IN_PERSON"
    );
  });

  test("surfaces friendly consent copy when startWhiteboardSession rejects ConsentError", async () => {
    const consentErr = Object.assign(
      new Error(
        "Parent privacy preferences must be set before starting a session."
      ),
      { name: "ConsentError", permission: "consentRecord" }
    );
    mockStartWhiteboardSession.mockRejectedValueOnce(consentErr);

    const user = userEvent.setup();
    render(<WhiteboardWorkspaceClient {...workspaceBaseProps} />);
    await act(async () => {
      await Promise.resolve();
    });

    await user.click(screen.getByTestId("wb-start-session"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        CONSENT_RECORD_TUTOR_MESSAGE
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      CONSENT_RECORD_PARENT_SECTION_HINT
    );
    expect(screen.getByTestId("wb-waiting-overlay")).toBeInTheDocument();
  });

  test("surfaces generic failure copy when startWhiteboardSession rejects non-Consent notFound (CF-1 / MB-1)", async () => {
    const notFoundErr = Object.assign(new Error("NEXT_NOT_FOUND"), {
      digest: "NEXT_NOT_FOUND",
    });
    mockStartWhiteboardSession.mockRejectedValueOnce(notFoundErr);

    const user = userEvent.setup();
    render(<WhiteboardWorkspaceClient {...workspaceBaseProps} />);
    await act(async () => {
      await Promise.resolve();
    });

    await user.click(screen.getByTestId("wb-start-session"));

    const startError = await screen.findByTestId("wb-waiting-start-error");
    expect(startError).toHaveTextContent(/couldn't start the session/i);
    expect(startError).toHaveTextContent(
      /if you recently switched or exited an impersonated account in another tab/i
    );
    expect(startError).toHaveTextContent(/reload this page first/i);
    expect(startError).toHaveTextContent(/Error ID:\s*NEXT_NOT_FOUND/i);
    expect(startError).toHaveTextContent(
      /copy this and send it back so we can find the failure in the server logs/i
    );

    expect(screen.getByTestId("wb-waiting-overlay")).toBeInTheDocument();
    const startBtn = screen.getByTestId("wb-start-session");
    expect(startBtn).not.toBeDisabled();
    expect(startBtn).toHaveTextContent("Start session");
  });

  test("surfaces Error ID digest line for generic Start failures without impersonation-specific fields (CF-1)", async () => {
    const genericErr = Object.assign(new Error("Server action failed"), {
      digest: "abc123",
    });
    mockStartWhiteboardSession.mockRejectedValueOnce(genericErr);

    const user = userEvent.setup();
    render(<WhiteboardWorkspaceClient {...workspaceBaseProps} />);
    await act(async () => {
      await Promise.resolve();
    });

    await user.click(screen.getByTestId("wb-start-session"));

    const startError = await screen.findByTestId("wb-waiting-start-error");
    expect(startError).toHaveTextContent(/Error ID:\s*abc123/i);
    expect(startError).toHaveTextContent(
      /copy this and send it back so we can find the failure in the server logs/i
    );
  });
});
