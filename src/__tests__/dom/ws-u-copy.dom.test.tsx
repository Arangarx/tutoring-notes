/**
 * @jest-environment jsdom
 *
 * WS-U-COPY batch — friendly copy, confirm gates, and nav affordances.
 */

import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionReviewMode } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/SessionReviewMode";
import TutorNotesSection from "@/components/whiteboard/TutorNotesSection";
import type { DraftSegmentRow } from "@/lib/recording/recording-draft-store";
import { draftLockName, DRAFT_FRESH_WINDOW_MS } from "@/lib/recording/recording-draft-lock";

// ---------------------------------------------------------------------------
// SessionReviewMode (1.4)
// ---------------------------------------------------------------------------

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    mode: "system" as const,
    resolvedTheme: "light" as const,
    setMode: jest.fn(),
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useParams: () => ({ joinToken: "join-token-abc" }),
}));

jest.mock(
  "@/components/whiteboard/replay/WhiteboardReplayInFrame",
  () => ({
    WhiteboardReplayInFrame: () => <div data-testid="mock-wb-replay-in-frame" />,
  })
);

jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/ReviewBoardThumbnail",
  () => ({
    ReviewBoardThumbnail: () => <div data-testid="mock-board-thumbnail" />,
  })
);

const loadSessionReviewPayload = jest.fn();

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  loadSessionReviewPayload: (...args: unknown[]) =>
    loadSessionReviewPayload(...args),
  saveSessionNotesAction: jest.fn(),
  getTutorNoteStatusAction: jest.fn(),
  regenerateNotesAction: jest.fn(),
  deleteWhiteboardSessionAndDataAction: jest.fn(),
  kickSessionChunksAction: jest.fn(),
  triggerNotesGenerationAction: jest.fn(),
}));

describe("WS-U-COPY 1.4 — SessionReviewMode error branch", () => {
  beforeEach(() => {
    loadSessionReviewPayload.mockReset();
    loadSessionReviewPayload.mockRejectedValue(new Error("Network down"));
  });

  it("shows back link and retry on load error", async () => {
    render(
      <SessionReviewMode whiteboardSessionId="wbs-err" studentId="stu-1" />
    );
    expect(await screen.findByTestId("wb-review-error")).toBeInTheDocument();
    expect(screen.getByTestId("wb-review-error-back")).toHaveAttribute(
      "href",
      "/admin/students/stu-1"
    );
    expect(screen.getByTestId("wb-review-error-retry")).toBeInTheDocument();

    loadSessionReviewPayload.mockResolvedValue({
      studentName: "Alex",
      startedAtIso: "2026-06-01T10:00:00.000Z",
      endedAtIso: "2026-06-01T10:30:00.000Z",
      durationSeconds: 1800,
      hasAudio: false,
      eventCount: 0,
      boardSaved: true,
      eventsProxyUrl: "/api/whiteboard/wbs-err/events",
      snapshotProxyUrl: null,
      audioSegments: [],
      canonicalAudioBlobUrl: null,
      canonicalAudioMimeType: null,
      canonicalDurationSeconds: null,
      initialNote: {
        found: false,
        status: null,
        content: null,
        isPartial: false,
        error: null,
        generatedAt: null,
      },
    });

    fireEvent.click(screen.getByTestId("wb-review-error-retry"));
    expect(await screen.findByTestId("wb-session-review-mode")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TutorNotesSection (2.11)
// ---------------------------------------------------------------------------

describe("WS-U-COPY 2.11 — TutorNotesSection failed copy", () => {
  it("shows friendly failed copy and logs raw error", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <TutorNotesSection
        whiteboardSessionId="wbs-fail"
        studentId="stu-1"
        hasAudio
        initialNote={{
          found: true,
          status: "failed",
          content: null,
          isPartial: false,
          error: "OpenAI rate limit exceeded",
          generatedAt: null,
        }}
      />
    );

    expect(screen.getByTestId("tutor-notes-error")).toHaveTextContent(
      /We couldn't finish your notes/i
    );
    expect(screen.getByTestId("tutor-notes-error")).not.toHaveTextContent(
      /OpenAI rate limit/i
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("wbs-fail"),
      "OpenAI rate limit exceeded"
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// WhiteboardWorkspaceClient — shared harness for remaining items
// ---------------------------------------------------------------------------

const mockDraftClear = jest.fn((_sessionId: string, _streamId: string) =>
  Promise.resolve()
);
const mockDraftClearIfSegment = jest.fn(
  (_sessionId: string, _streamId: string, _segmentId: string) => Promise.resolve(true)
);
const mockDraftFindInProgress = jest.fn<
  Promise<DraftSegmentRow | null>,
  [string, string]
>(() => Promise.resolve(null));
const mockOutboxEnqueue = jest.fn((_args: unknown) => Promise.resolve());

jest.mock("@/lib/recording/recording-draft-store", () => {
  const actual = jest.requireActual("@/lib/recording/recording-draft-store");
  return {
    ...actual,
    getOrCreateRecordingDraftStore: () => ({
      clear: mockDraftClear,
      clearIfSegment: mockDraftClearIfSegment,
      findInProgress: mockDraftFindInProgress,
      assemble: jest.fn(() => new Blob(["audio"], { type: "audio/webm" })),
      checkpoint: jest.fn(),
    }),
  };
});

const syncCtl = {
  peerCountListeners: new Set<(n: number) => void>(),
  connectListeners: new Set<() => void>(),
};

jest.mock("@/lib/whiteboard/sync-client", () => ({
  createWhiteboardSyncClient: jest.fn(() => ({
    disconnect: jest.fn(),
    onRemoteScene: () => () => undefined,
    onConnect: (cb: () => void) => {
      syncCtl.connectListeners.add(cb);
      return () => syncCtl.connectListeners.delete(cb);
    },
    onDisconnect: () => () => undefined,
    onPeerCountChange: (cb: (n: number) => void) => {
      syncCtl.peerCountListeners.add(cb);
      return () => syncCtl.peerCountListeners.delete(cb);
    },
    onRoomPeersChange: () => () => undefined,
    onRemotePointer: () => () => undefined,
    onRemoteCursor: () => () => undefined,
    onRemoteChat: () => () => undefined,
    onRemoteSessionLifecycle: () => () => undefined,
    broadcastCursor: jest.fn(),
    broadcastChat: jest.fn(),
    isConnected: () => true,
    broadcastScene: jest.fn(),
    broadcastDocument: jest.fn(),
    broadcastPageViewState: jest.fn(),
    flushPendingBroadcast: jest.fn(),
  })),
  generateEncryptionKeyBase64Url: () => "test-integration-key-16chars-min",
}));

const liveAvCtl = {
  reachableParticipants: [] as Array<{ peerId: string }>,
  setReachable: null as null | ((p: Array<{ peerId: string }>) => void),
};

jest.mock("@/lib/whiteboard/session-scene-draft", () => ({
  loadTutorSessionRecoveryDraft: jest.fn(() => null),
  clearSessionSceneDraft: jest.fn(),
  saveSessionBoardDocument: jest.fn(),
  listSessionSceneDraftIds: jest.fn(() => []),
}));

jest.mock("@/hooks/useLiveAV", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    useLiveAV: () => {
      const [reachableParticipants, setReachable] = React.useState<
        Array<{ peerId: string }>
      >([{ peerId: "student-peer" }]);
      liveAvCtl.setReachable = setReachable;
      liveAvCtl.reachableParticipants = reachableParticipants;
      return {
        participants: [],
        reachableParticipants,
        localAudioStream: null,
        localVideoStream: null,
        hasMicPermission: "granted" as const,
        hasCamPermission: "granted" as const,
        isMicMuted: false,
        isCamMuted: true,
        error: null,
        videoError: null,
        toggleMic: jest.fn(),
        toggleCam: jest.fn(),
        requestMic: jest.fn().mockResolvedValue(undefined),
        requestCam: jest.fn().mockResolvedValue(undefined),
        isAcquiring: false,
        isActive: true,
        reconnectPeer: jest.fn(),
        retryAcquire: jest.fn().mockResolvedValue(undefined),
        leaveAllPeers: jest.fn(),
        releaseLocalMedia: jest.fn(),
        isCamStarting: false,
        videoDevices: [],
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
      };
    },
  };
});

jest.mock("@/hooks/useLiveAvCoordinator", () => ({
  useLiveAvCoordinator: jest.fn(),
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
jest.mock("@/lib/whiteboard/upload", () => ({
  uploadWhiteboardEvents: jest.fn(),
  uploadWhiteboardSnapshot: jest.fn(),
}));
jest.mock("@/lib/whiteboard/snapshot-png", () => ({
  generateSessionSnapshotPng: jest.fn(),
}));
jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  finalizeWhiteboardSessionFromBackend: jest.fn(),
  issueJoinToken: jest.fn(),
  registerWhiteboardSessionAudioSegmentAction: jest.fn(),
  revokeJoinTokensForSession: jest.fn(),
  endStaleWhiteboardSession: jest.fn(),
  startWhiteboardSession: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  useParams: () => ({ joinToken: "join-token-abc" }),
}));
jest.mock("@/lib/recording/upload-outbox-instance", () => ({
  drainOutboxOrTimeout: jest.fn(async () => ({
    timedOut: false,
    remainingCount: 0,
    remainingByStream: new Map(),
    lastError: null,
  })),
  assembleEndSessionSegments: jest.fn(async () => []),
  finalizeOutboxAfterEnd: jest.fn(),
  registerSessionStudentId: jest.fn(),
  getOrCreateUploadOutbox: () => ({
    observe: () => ({
      getState: () => ({
        state: "idle",
        inFlightStreamCount: 0,
        byStream: new Map(),
        lastError: null,
      }),
      subscribe: () => () => undefined,
    }),
    enqueue: (args: unknown) => mockOutboxEnqueue(args),
  }),
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

const recorderCtl = {
  checkpointStatus: "idle" as "idle" | "error",
  checkpointError: null as string | null,
  resumePrompt: null as {
    startedAt: string;
    durationMs: number;
  } | null,
};

jest.mock("@/hooks/useWhiteboardRecorder", () => ({
  useWhiteboardRecorder: () => ({
    onCanvasChange: jest.fn(),
    ingestRemote: jest.fn(),
    eventCount: 0,
    durationMs: 100,
    lastCheckpointAt: null,
    get checkpointStatus() {
      return recorderCtl.checkpointStatus;
    },
    get checkpointError() {
      return recorderCtl.checkpointError;
    },
    syncConnected: false,
    get resumePrompt() {
      return recorderCtl.resumePrompt;
    },
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
    recordViewport: jest.fn(),
    recordPageSwitch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({
    state: "recording" as const,
    uploadMode: null,
    elapsed: 10,
    sessionElapsed: 10,
    segmentNumber: 1,
    doneSegmentSeconds: 0,
    localMicStream: null,
    addRemoteAudio: () => () => undefined,
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

import { WhiteboardWorkspaceClient } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient";

const tutorProps = {
  whiteboardSessionId: "ws-copy",
  studentId: "stu-1",
  studentName: "Test Student",
  adminUserId: "admin-1",
  startedAtIso: "2026-05-09T10:00:00.000Z",
  bothConnectedAtIso: null,
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
  syncUrl: null as string | null,
  initialUserWantsRecording: false,
  initialConsentInput: {
    hasConsentSnapshot: true,
    toggles: { audio: true, whiteboard: true, notes: true },
    notesForbidden: false,
  },
};

const studentProps = {
  role: "student" as const,
  whiteboardSessionId: "wbs-stu",
  studentId: "stu-1",
  joinToken: "join-token-abc",
  syncUrl: "ws://localhost:3002",
  tutorName: "Sarah",
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
};

function fireSyncPresence(peerCount: number) {
  for (const cb of syncCtl.connectListeners) cb();
  for (const cb of syncCtl.peerCountListeners) cb(peerCount);
}

describe("WS-U-COPY workspace client", () => {
  beforeAll(() => {
    if (typeof globalThis.indexedDB === "undefined") {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: {} as IDBFactory,
      });
    }
  });

  beforeEach(() => {
    window.scrollTo = jest.fn();
    mockDraftClear.mockClear();
    mockDraftClearIfSegment.mockClear();
    mockDraftFindInProgress.mockReset();
    mockDraftFindInProgress.mockResolvedValue(null);
    liveAvCtl.setReachable = null;
    syncCtl.peerCountListeners.clear();
    syncCtl.connectListeners.clear();
    recorderCtl.checkpointStatus = "idle";
    recorderCtl.checkpointError = null;
    recorderCtl.resumePrompt = null;
    window.history.replaceState(
      null,
      "",
      "http://localhost/#k=integration-test-key-1"
    );
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ live: true, activeMs: 0 }),
      })
    ) as jest.Mock;
  });

  function recoverableDraft(overrides: Partial<DraftSegmentRow> = {}): DraftSegmentRow {
    return {
      key: "ws-copy:tutor:mic",
      segmentId: "seg-1",
      mimeType: "audio/webm",
      chunkCount: 1,
      chunks: [new Blob(["x"], { type: "audio/webm" })],
      firstChunkMs: 1234,
      lastChunkMs: 1234,
      estimatedDurationSec: 5,
      sessionId: "ws-copy",
      streamId: "tutor:mic",
      checkpointedAt: 1234,
      ...overrides,
    };
  }

  it("1.5 — WS-B: a recovered draft is enqueued with no click; the banner says it is uploading", async () => {
    mockDraftFindInProgress.mockResolvedValue(recoverableDraft());
    mockOutboxEnqueue.mockClear();
    mockDraftClear.mockClear();
    mockDraftClearIfSegment.mockClear();

    render(<WhiteboardWorkspaceClient {...tutorProps} initialUserWantsRecording />);
    await screen.findByTestId("wb-mock-excalidraw-canvas");

    // Enqueued and the draft dropped, without anyone clicking anything.
    // No offset on the row: the transcript anchor falls back to 0, it is not omitted.
    await waitFor(() => {
      expect(mockOutboxEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "ws-copy",
          streamId: "tutor:mic",
          segmentId: "seg-1",
          audioStartedAtMs: 1234,
          blobRemoteUrl: null,
          recordingTimeOffsetMs: 0,
        })
      );
    });
    await waitFor(() => {
      expect(mockDraftClearIfSegment).toHaveBeenCalledWith("ws-copy", "tutor:mic", "seg-1");
    });
    expect(mockDraftClear).not.toHaveBeenCalled();

    const banner = await screen.findByTestId("wb-audio-draft-recovery-banner");
    expect(banner).toHaveTextContent(/recovered 00:05 of audio/i);
    expect(banner).toHaveTextContent("It is uploading to this session.");
    expect(banner).not.toHaveTextContent("It was saved to this session.");
    expect(screen.queryByTestId("wb-audio-draft-keep")).toBeNull();
    expect(screen.queryByTestId("wb-audio-draft-discard")).toBeNull();
  });

  it("1.5c — a recovered draft keeps the segment start offset for the notes timeline", async () => {
    mockDraftFindInProgress.mockResolvedValue(
      recoverableDraft({ segmentId: "seg-offset", recordingTimeOffsetMs: 84_000 })
    );
    mockOutboxEnqueue.mockClear();

    render(<WhiteboardWorkspaceClient {...tutorProps} initialUserWantsRecording />);
    await screen.findByTestId("wb-mock-excalidraw-canvas");

    await waitFor(() => {
      expect(mockOutboxEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentId: "seg-offset",
          recordingTimeOffsetMs: 84_000,
        })
      );
    });
  });

  it("1.5b — WS-B: if the outbox refuses the draft it stays on this device and the banner says so", async () => {
    mockDraftFindInProgress.mockResolvedValue(
      recoverableDraft({ segmentId: "seg-fail", checkpointedAt: 1 })
    );
    mockOutboxEnqueue.mockClear();
    mockOutboxEnqueue.mockRejectedValueOnce(new Error("quota"));
    mockDraftClear.mockClear();
    mockDraftClearIfSegment.mockClear();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    render(<WhiteboardWorkspaceClient {...tutorProps} initialUserWantsRecording />);
    await screen.findByTestId("wb-mock-excalidraw-canvas");
    await waitFor(() => expect(mockOutboxEnqueue).toHaveBeenCalledTimes(1));

    expect(mockDraftClear).not.toHaveBeenCalled();
    expect(mockDraftClearIfSegment).not.toHaveBeenCalled();
    expect(screen.queryByTestId("wb-audio-draft-recovery-banner")).toBeNull();
    const failed = await screen.findByTestId("wb-audio-draft-recovery-failed-banner");
    expect(failed).toHaveTextContent(/still saved on this device/i);
    expect(failed).toHaveTextContent(/next time you open this session/i);
    expect(failed).not.toHaveTextContent(/saved to this session/i);
    warn.mockRestore();
  });

  it("a live recorder's lock keeps the mount scan from enqueueing or clearing the draft", async () => {
    const draft = recoverableDraft({ segmentId: "seg-live", checkpointedAt: 1 });
    const held = new Set<string>([
      draftLockName(draft.sessionId, draft.streamId, draft.segmentId),
    ]);
    const original = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (
          name: string,
          optionsOrCb: { ifAvailable?: boolean } | ((lock: unknown) => unknown),
          maybeCb?: (lock: unknown) => unknown
        ) => {
          const options = typeof optionsOrCb === "function" ? {} : optionsOrCb;
          const cb = (typeof optionsOrCb === "function" ? optionsOrCb : maybeCb) as (
            lock: unknown
          ) => unknown;
          if (options.ifAvailable && held.has(name)) return cb(null);
          held.add(name);
          try {
            return await cb({ name, mode: "exclusive" });
          } finally {
            held.delete(name);
          }
        },
      },
    });
    mockDraftFindInProgress.mockResolvedValue(draft);
    mockOutboxEnqueue.mockClear();
    mockDraftClearIfSegment.mockClear();
    try {
      render(<WhiteboardWorkspaceClient {...tutorProps} initialUserWantsRecording />);
      await screen.findByTestId("wb-mock-excalidraw-canvas");
      await waitFor(() => expect(mockDraftFindInProgress).toHaveBeenCalled());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(mockOutboxEnqueue).not.toHaveBeenCalled();
      expect(mockDraftClearIfSegment).not.toHaveBeenCalled();
      expect(screen.queryByTestId("wb-audio-draft-recovery-banner")).toBeNull();
    } finally {
      if (original) Object.defineProperty(navigator, "locks", original);
      else Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    }
  });

  it("without Web Locks a just-checkpointed draft is skipped, then recovered once the freshness window passes", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const checkpointedAt = Date.now() - (DRAFT_FRESH_WINDOW_MS - 250);
    mockDraftFindInProgress.mockResolvedValue(recoverableDraft({ checkpointedAt }));
    mockOutboxEnqueue.mockClear();
    mockDraftClearIfSegment.mockClear();
    try {
      render(<WhiteboardWorkspaceClient {...tutorProps} initialUserWantsRecording />);
      await screen.findByTestId("wb-mock-excalidraw-canvas");
      await waitFor(() => expect(mockDraftFindInProgress).toHaveBeenCalled());
      expect(mockOutboxEnqueue).not.toHaveBeenCalled();
      await waitFor(() => expect(mockOutboxEnqueue).toHaveBeenCalledTimes(1), { timeout: 2_000 });
      expect(mockDraftClearIfSegment).toHaveBeenCalledTimes(1);
    } finally {
      if (original) Object.defineProperty(navigator, "locks", original);
      else Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    }
  });

  it("1.6 — beforeunload warns when recording is active", async () => {
    const handlers: Array<(e: BeforeUnloadEvent) => void> = [];
    const addSpy = jest.spyOn(window, "addEventListener");
    addSpy.mockImplementation((type, listener) => {
      if (type === "beforeunload" && typeof listener === "function") {
        handlers.push(listener as (e: BeforeUnloadEvent) => void);
      }
    });

    render(
      <WhiteboardWorkspaceClient
        {...tutorProps}
        initialUserWantsRecording
      />
    );
    await screen.findByTestId("wb-mock-excalidraw-canvas");

    const event = new Event("beforeunload") as BeforeUnloadEvent;
    Object.defineProperty(event, "returnValue", {
      writable: true,
      value: "",
    });
    let warned = false;
    for (const handler of handlers) {
      const result = handler(event);
      if (event.returnValue || result) warned = true;
    }
    expect(warned).toBe(true);

    addSpy.mockRestore();
  });

  it("1.6 — beforeunload does not warn when recording is idle", async () => {
    const handlers: Array<(e: BeforeUnloadEvent) => void> = [];
    const addSpy = jest.spyOn(window, "addEventListener");
    addSpy.mockImplementation((type, listener) => {
      if (type === "beforeunload" && typeof listener === "function") {
        handlers.push(listener as (e: BeforeUnloadEvent) => void);
      }
    });

    render(<WhiteboardWorkspaceClient {...tutorProps} />);
    await screen.findByTestId("wb-mock-excalidraw-canvas");

    const event = new Event("beforeunload") as BeforeUnloadEvent;
    Object.defineProperty(event, "returnValue", {
      writable: true,
      value: "",
    });
    for (const handler of handlers) {
      handler(event);
    }
    expect(event.returnValue).toBe("");

    addSpy.mockRestore();
  });

  it("2.3 — split-brain banner uses friendly reconnect copy", async () => {
    render(<WhiteboardWorkspaceClient {...tutorProps} syncUrl="ws://localhost:3002" />);
    await screen.findByTestId("wb-mock-excalidraw-canvas");
    fireSyncPresence(1);
    await act(async () => {
      liveAvCtl.setReachable?.([]);
    });

    const banner = await screen.findByTestId("wb-split-brain-banner");
    expect(banner).toHaveTextContent(
      /Waiting for your student's connection to come back/i
    );
    expect(banner).not.toHaveTextContent(/WebRTC/i);
  });

  it("2.6 — checkpoint and board-draft banners use friendly copy", async () => {
    recorderCtl.checkpointStatus = "error";
    recorderCtl.checkpointError = "QuotaExceededError";
    recorderCtl.resumePrompt = {
      startedAt: "2026-05-09T10:00:00.000Z",
      durationMs: 60_000,
    };

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<WhiteboardWorkspaceClient {...tutorProps} initialUserWantsRecording />);
    await screen.findByTestId("wb-mock-excalidraw-canvas");

    expect(screen.getByText(/couldn't save a backup of your board/i)).toBeInTheDocument();
    expect(screen.queryByText(/QuotaExceededError/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("wb-board-draft-recovery-banner")).toHaveTextContent(
      /unsaved draft of your board/i
    );
    expect(screen.queryByText(/IndexedDB/i)).not.toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("checkpoint_save_failed"),
      "QuotaExceededError"
    );
    warnSpy.mockRestore();
  });

  it("2.7 — student key-missing wall offers close affordance", async () => {
    window.history.replaceState(null, "", "http://localhost/join/session");
    render(<WhiteboardWorkspaceClient {...studentProps} />);
    expect(
      await screen.findByRole("heading", { name: /link is incomplete/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("wb-student-key-missing-close")).toBeInTheDocument();
  });

  it("2.7 — student join-unavailable wall offers close affordance", async () => {
    window.history.replaceState(
      null,
      "",
      "http://localhost/join/session#k=integration-test-key-1"
    );
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ live: false, reason: "session_ended" }),
      })
    ) as jest.Mock;

    render(<WhiteboardWorkspaceClient {...studentProps} />);
    expect(
      await screen.findByRole("heading", { name: /session has ended/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("wb-student-join-unavailable-close")).toBeInTheDocument();
  });
});
