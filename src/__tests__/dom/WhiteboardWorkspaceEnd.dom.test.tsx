/**
 * @jest-environment jsdom
 */

/**
 * End-session DOM contract for the workspace client (Phase 1b — Pillars 2 + 3).
 *
 * Pre-Phase-1b this suite drove the End-session button through the
 * audio bridge's `getState()` shim. That shim is gone in Commit 4;
 * Commit 7 rewires the flow to call the outbox helpers directly:
 *
 *   1. `setUserWantsRecording(false)` — recorder stops + enqueues
 *      trailing segments into the outbox.
 *   2. `drainOutboxOrTimeout(wbsid)` — wait for uploads to finish
 *      (15s budget; failed/timeout surfaces a tutor-facing error).
 *   3. `assembleEndSessionSegments(wbsid)` — read uploaded rows.
 *   4. `uploadWhiteboardEvents(...)`
 *   5. `endWhiteboardSession(wbsid, eventsUrl, { segments })` — one
 *      atomic transaction.
 *   6. `finalizeOutboxAfterEnd(wbsid)` — drop the persisted rows.
 *
 * This suite mocks every helper at its module boundary so we can
 * exercise (a) the happy path with N tracked segments, (b) the
 * drain-timeout error path, and (c) the "in-flight count updates
 * during the wait" UX contract.
 */

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/components/whiteboard/PdfImageUploadButton", () => ({
  PdfImageUploadButton: () => null,
}));
jest.mock("@/components/whiteboard/MathInsertButton", () => ({
  MathInsertButton: () => null,
}));
jest.mock("@/components/whiteboard/DesmosInsertButton", () => ({
  DesmosInsertButton: () => null,
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
    isConnected: () => false,
    broadcastScene: jest.fn(),
    flushPendingBroadcast: jest.fn(),
  })),
  generateEncryptionKeyBase64Url: () => "test-integration-key-16chars-min",
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
}));

const mockUpload = jest.fn(() =>
  Promise.resolve({
    ok: true as const,
    blobUrl: "https://abc.blob.vercel-storage.com/blob-events",
    sizeBytes: 10,
  })
);
jest.mock("@/lib/whiteboard/upload", () => ({
  uploadWhiteboardEvents: (...args: unknown[]) => mockUpload.apply(null, args),
}));

const mockEnd = jest.fn(() => Promise.resolve({ endedAt: "2026-05-10T00:00:00Z", durationSeconds: 100, registeredSegments: 0 }));
jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  endWhiteboardSession: (...args: unknown[]) => mockEnd.apply(null, args),
  issueJoinToken: jest.fn(() => Promise.resolve({ token: "tok" })),
  registerWhiteboardSessionAudioSegmentAction: jest.fn(() =>
    Promise.resolve({ ok: true as const, recordingId: "rec1", orderIndex: 0 })
  ),
  revokeJoinTokensForSession: jest.fn(() => Promise.resolve()),
}));

const mockBuildFinalEventsJson = jest.fn(
  () =>
    `{"schemaVersion":1,"startedAt":"2026-05-09T00:00:00.000Z","durationMs":100,"events":[]}`
);

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
    buildFinalEventsJson: mockBuildFinalEventsJson,
    markPersisted: jest.fn(),
    checkpointMountResolved: true,
    postGateAutoCanvas: null,
    acknowledgePostGateAutoCanvas: jest.fn(),
    flushThrottledFrameNow: jest.fn(),
    broadcastScenePageSnapshot: jest.fn(),
  }),
}));

// ---- Outbox helper mocks --------------------------------------------------
// The workspace's `handleEndSession` is now a direct caller of these.
// Each test controls them through deferred promises so we can assert
// intermediate UI states (e.g. "Saving last N segments") BEFORE the
// drain resolves.

type DrainResult = {
  timedOut: boolean;
  remainingCount: number;
  remainingByStream: ReadonlyMap<string, number>;
  lastError: string | null;
};
type OutboxObserverState = {
  state: "idle" | "uploading" | "registering" | "failed";
  inFlightStreamCount: number;
  byStream: ReadonlyMap<string, number>;
  lastError: string | null;
};

let observerState: OutboxObserverState = {
  state: "idle",
  inFlightStreamCount: 0,
  byStream: new Map<string, number>(),
  lastError: null,
};
const observerListeners = new Set<(s: OutboxObserverState) => void>();
function setObserverState(next: OutboxObserverState) {
  observerState = next;
  for (const fn of observerListeners) fn(next);
}

type EndSessionSegment = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  audioStartedAtMs: number;
  streamId: string;
  segmentId: string;
};

const mockDrainOutboxOrTimeout = jest.fn<Promise<DrainResult>, [string]>(
  async () => ({
    timedOut: false,
    remainingCount: 0,
    remainingByStream: new Map<string, number>(),
    lastError: null,
  })
);
const mockAssembleEndSessionSegments = jest.fn<
  Promise<EndSessionSegment[]>,
  [string]
>(async () => []);
const mockFinalizeOutboxAfterEnd = jest.fn<Promise<void>, [string]>(
  async () => undefined
);
const mockRegisterSessionStudentId = jest.fn();

jest.mock("@/lib/recording/upload-outbox-instance", () => ({
  drainOutboxOrTimeout: (sessionId: string) =>
    mockDrainOutboxOrTimeout(sessionId),
  assembleEndSessionSegments: (sessionId: string) =>
    mockAssembleEndSessionSegments(sessionId),
  finalizeOutboxAfterEnd: (sessionId: string) =>
    mockFinalizeOutboxAfterEnd(sessionId),
  registerSessionStudentId: (...args: unknown[]) =>
    mockRegisterSessionStudentId(...args),
  getOrCreateUploadOutbox: () => ({
    observe: (_sessionId: string) => ({
      getState: () => observerState,
      subscribe: (listener: (s: OutboxObserverState) => void) => {
        observerListeners.add(listener);
        return () => observerListeners.delete(listener);
      },
    }),
  }),
}));

// Audio bridge: still a forwardRef component so the workspace's
// ref binding doesn't error, but the End-session flow no longer
// calls getState — we just need it to mount cleanly.
jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge",
  () => {
    const { forwardRef } = jest.requireActual<typeof import("react")>("react");
    return {
      WhiteboardWorkspaceAudioBridge: forwardRef<
        unknown,
        Record<string, unknown>
      >(function MockBridge() {
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="wb-mock-excalidraw-canvas" />;
  },
}));

jest.mock("@/hooks/useAudioRecorder", () => {
  const st = { state: "ready" as string };
  return {
    useAudioRecorder: () => ({
      get state() {
        return st.state;
      },
      uploadMode: null,
      elapsed: 0,
      segmentNumber: 1,
      doneSegmentSeconds: 0,
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
    }),
  };
});

import { WhiteboardWorkspaceClient } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient";

describe("WhiteboardWorkspaceClient end session (Phase 1b)", () => {
  beforeAll(() => {
    // The workspace's "subscribe to outbox while finalizing" useEffect
    // guards on `globalThis.indexedDB` so an accidental SSR import
    // doesn't open IDB on the server. JSDOM doesn't ship IDB, so we
    // hand it a stub — the outbox-instance module is fully mocked in
    // this file, so the stub is never read.
    if (typeof globalThis.indexedDB === "undefined") {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: {} as IDBFactory,
      });
    }
  });

  beforeEach(() => {
    jest.useRealTimers();
    window.scrollTo = jest.fn();
    mockEnd.mockClear();
    mockUpload.mockClear();
    mockBuildFinalEventsJson.mockClear();
    mockDrainOutboxOrTimeout.mockReset();
    mockAssembleEndSessionSegments.mockReset();
    mockFinalizeOutboxAfterEnd.mockReset();
    mockRegisterSessionStudentId.mockReset();
    // Default: drain succeeds immediately, no segments to register.
    mockDrainOutboxOrTimeout.mockImplementation(async () => ({
      timedOut: false,
      remainingCount: 0,
      remainingByStream: new Map<string, number>(),
      lastError: null,
    }));
    mockAssembleEndSessionSegments.mockImplementation(async () => []);
    mockFinalizeOutboxAfterEnd.mockImplementation(async () => undefined);
    observerListeners.clear();
    setObserverState({
      state: "idle",
      inFlightStreamCount: 0,
      byStream: new Map<string, number>(),
      lastError: null,
    });
    window.history.replaceState(
      null,
      "",
      "http://localhost/#k=integration-test-key-1"
    );
  });

  test("happy path: drains outbox, uploads events, calls atomic end action with segments, finalizes outbox", async () => {
    const segments = [
      {
        blobUrl: "https://abc.blob.vercel-storage.com/seg-1.webm",
        mimeType: "audio/webm",
        sizeBytes: 100,
        audioStartedAtMs: 1_000,
        streamId: "tutor:mic",
        segmentId: "seg-1",
      },
    ];
    mockAssembleEndSessionSegments.mockResolvedValueOnce(segments);

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-happy"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");
    await userEvent.click(screen.getByTestId("wb-end-session"));

    await waitFor(() => {
      expect(mockDrainOutboxOrTimeout).toHaveBeenCalledWith("ws-end-happy");
    });
    await waitFor(() => {
      expect(mockAssembleEndSessionSegments).toHaveBeenCalledWith(
        "ws-end-happy"
      );
    });
    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalledWith(
        "ws-end-happy",
        "https://abc.blob.vercel-storage.com/blob-events",
        { segments }
      );
    });
    await waitFor(() => {
      expect(mockFinalizeOutboxAfterEnd).toHaveBeenCalledWith("ws-end-happy");
    });
  });

  test("'Saving last N segments' copy reflects live outbox count during drain", async () => {
    // Deferred drain so we can inspect the intermediate UI.
    let resolveDrain!: (r: DrainResult) => void;
    mockDrainOutboxOrTimeout.mockImplementation(
      () =>
        new Promise<DrainResult>((r) => {
          resolveDrain = r;
        })
    );

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-live"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");

    // Pre-seed observer to report two in-flight segments BEFORE the
    // user clicks End so the subscribe-on-finalizing effect sees the
    // count without a race.
    act(() => {
      setObserverState({
        state: "uploading",
        inFlightStreamCount: 2,
        byStream: new Map([["tutor:mic", 2]]),
        lastError: null,
      });
    });

    await userEvent.click(screen.getByTestId("wb-end-session"));

    expect(
      await screen.findByRole("button", { name: /Saving last 2 segments/i })
    ).toBeInTheDocument();

    // Push count down to 1; copy should update live.
    act(() => {
      setObserverState({
        state: "uploading",
        inFlightStreamCount: 1,
        byStream: new Map([["tutor:mic", 1]]),
        lastError: null,
      });
    });
    expect(
      await screen.findByRole("button", { name: /Saving last 1 segment/i })
    ).toBeInTheDocument();

    // Resolve drain so the rest of the flow runs.
    await act(async () => {
      resolveDrain({
        timedOut: false,
        remainingCount: 0,
        remainingByStream: new Map<string, number>(),
        lastError: null,
      });
    });
    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  test("drain timeout surfaces a copy-rich error and does NOT call the atomic action", async () => {
    mockDrainOutboxOrTimeout.mockResolvedValueOnce({
      timedOut: true,
      remainingCount: 1,
      remainingByStream: new Map([["tutor:mic", 1]]),
      lastError: null,
    });

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-timeout"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");
    await userEvent.click(screen.getByTestId("wb-end-session"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't finalize/i);
    expect(alert.textContent).toMatch(/1 audio segment still saving/i);
    expect(mockEnd).not.toHaveBeenCalled();
    expect(mockFinalizeOutboxAfterEnd).not.toHaveBeenCalled();
  });

  test("drain timeout with an upload error includes the error in the banner copy", async () => {
    mockDrainOutboxOrTimeout.mockResolvedValueOnce({
      timedOut: true,
      remainingCount: 2,
      remainingByStream: new Map([["tutor:mic", 2]]),
      lastError: "Vercel Blob 500",
    });

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-error"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");
    await userEvent.click(screen.getByTestId("wb-end-session"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Vercel Blob 500/);
    expect(alert.textContent).toMatch(/2 audio segments still saving/i);
    expect(mockEnd).not.toHaveBeenCalled();
  });
});
