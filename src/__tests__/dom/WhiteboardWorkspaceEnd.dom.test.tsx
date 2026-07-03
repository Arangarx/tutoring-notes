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

async function confirmFinishAndSave() {
  await userEvent.click(screen.getByTestId("wb-end-session"));
  await userEvent.click(screen.getByTestId("wb-end-session-confirm-yes"));
}

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
    isConnected: () => false,
    broadcastScene: jest.fn(),
    flushPendingBroadcast: jest.fn(),
  })),
  generateEncryptionKeyBase64Url: () => "test-integration-key-16chars-min",
}));

// Stable router mock — shared reference so tests can assert on replace/refresh calls.
const mockRouterReplace = jest.fn();
const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    refresh: mockRouterRefresh,
  }),
  useParams: () => ({}),
}));

const mockUpload = jest.fn(() =>
  Promise.resolve({
    ok: true as const,
    blobUrl: "https://abc.blob.vercel-storage.com/blob-events",
    sizeBytes: 10,
  })
);
type SnapshotUploadResult =
  | { ok: true; blobUrl: string; sizeBytes: number }
  | { ok: false; error: string };
const mockSnapshotUpload = jest.fn<Promise<SnapshotUploadResult>, [unknown]>(
  async () => ({
    ok: true as const,
    blobUrl: "https://abc.blob.vercel-storage.com/blob-snapshot.png",
    sizeBytes: 4_321,
  })
);
jest.mock("@/lib/whiteboard/upload", () => ({
  uploadWhiteboardEvents: (...args: unknown[]) => mockUpload.apply(null, args),
  uploadWhiteboardSnapshot: (...args: unknown[]) =>
    mockSnapshotUpload.apply(null, args),
}));

const mockGenerateSnapshot = jest.fn();
jest.mock("@/lib/whiteboard/snapshot-png", () => ({
  generateSessionSnapshotPng: (...args: unknown[]) =>
    mockGenerateSnapshot(...args),
}));

const mockEnd = jest.fn(() => Promise.resolve({ endedAt: "2026-05-10T00:00:00Z", durationSeconds: 100, registeredSegments: 0 }));
jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  endWhiteboardSession: (...args: unknown[]) => mockEnd.apply(null, args),
  issueJoinToken: jest.fn(() => Promise.resolve({ token: "tok" })),
  registerWhiteboardSessionAudioSegmentAction: jest.fn(() =>
    Promise.resolve({ ok: true as const, recordingId: "rec1", orderIndex: 0 })
  ),
  revokeJoinTokensForSession: jest.fn(() => Promise.resolve()),
  // endStaleWhiteboardSession is called by WorkspaceResumeGate's "End" button
  // (stale-session path). Not exercised by these tests, but imported by the module.
  endStaleWhiteboardSession: jest.fn(() =>
    Promise.resolve({ endedAt: "2026-05-10T00:00:00Z" })
  ),
  startWhiteboardSession: jest.fn(() => Promise.resolve({ ok: true, phase: "active" })),
}));

// notes-actions imports next/cache (revalidatePath) which requires TextEncoder
// (not available in jsdom). Mock the whole module at the boundary.
const mockTriggerNotesGenerationAction = jest.fn(() =>
  Promise.resolve({ ok: true as const })
);
jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  kickSessionChunksAction: jest.fn(() => Promise.resolve({ kicked: 0 })),
  triggerNotesGenerationAction: (...args: unknown[]) =>
    mockTriggerNotesGenerationAction(...args),
  // loadSessionReviewPayload is called by SessionReviewMode on mount.
  // The shell-integration tests below provide per-test overrides; this
  // default ensures the module resolves cleanly in all tests.
  loadSessionReviewPayload: jest.fn(() =>
    Promise.resolve({
      studentName: "Test Student",
      startedAtIso: "2026-05-09T10:00:00.000Z",
      endedAtIso: "2026-05-09T11:00:00.000Z",
      durationSeconds: 3600,
      hasAudio: false,
      eventCount: 0,
      audioSegments: [],
      eventsProxyUrl: "/api/whiteboard/ws-shell-1/events",
      snapshotProxyUrl: null,
      initialNote: { found: false, noteId: null, fields: null, status: null },
    })
  ),
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

/**
 * Hook mock the workspace consumes. We expose mutable state via getters so
 * tests can flip `audioState` / `audioFlush` without remounting the host.
 * `flushPendingUploads` and `stopAndUpload` are jest mocks so the
 * regression test below can assert their invocation order against the
 * outbox helpers.
 */
const audioCtl = {
  state: "ready" as string,
  stopAndUpload: jest.fn(),
  flushPendingUploads: jest.fn(() => Promise.resolve()),
};

// useLiveAV is not the focus of this test suite (end-session flow).
// Provide a minimal stub so the workspace component mounts without crashing.
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
  }),
}));

jest.mock("@/hooks/useAudioRecorder", () => {
  return {
    useAudioRecorder: () => ({
      get state() {
        return audioCtl.state;
      },
      uploadMode: null,
      elapsed: 0,
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
      stopAndUpload: audioCtl.stopAndUpload,
      handleReset: jest.fn(),
      flushPendingUploads: audioCtl.flushPendingUploads,
    }),
  };
});

// SessionReviewMode is a heavy component (TutorNotesSection + WorkspacePreviousSessionPreview
// + lazy WhiteboardReplay). In the shell-integration tests below we verify that the
// component MOUNTS after the mode flip — we don't need to exercise its internals here.
// Stubbing it at the module boundary keeps the shell tests lightweight.
jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/SessionReviewMode",
  () => ({
    SessionReviewMode: function MockSessionReviewMode({
      whiteboardSessionId,
    }: {
      whiteboardSessionId: string;
    }) {
      return (
        <div
          data-testid="wb-session-review-mode"
          data-wbsid={whiteboardSessionId}
        />
      );
    },
  })
);

import { WhiteboardWorkspaceClient } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient";
import { WhiteboardSessionShell } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell";

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
    mockRouterReplace.mockClear();
    mockRouterRefresh.mockClear();
    mockEnd.mockClear();
    mockUpload.mockClear();
    mockSnapshotUpload.mockClear();
    mockGenerateSnapshot.mockReset();
    // Default: snapshot generation skips (empty scene → null). Tests
    // that exercise the happy path override this per-test.
    mockGenerateSnapshot.mockResolvedValue(null);
    mockBuildFinalEventsJson.mockClear();
    mockDrainOutboxOrTimeout.mockReset();
    mockAssembleEndSessionSegments.mockReset();
    mockFinalizeOutboxAfterEnd.mockReset();
    mockRegisterSessionStudentId.mockReset();
    audioCtl.state = "ready";
    audioCtl.stopAndUpload.mockReset();
    audioCtl.flushPendingUploads.mockReset();
    audioCtl.flushPendingUploads.mockImplementation(() => Promise.resolve());
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

  test("shows inline confirm before starting the end-session pipeline", async () => {
    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-confirm"
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

    expect(screen.getByTestId("wb-end-session-confirm")).toBeInTheDocument();
    expect(screen.getByText("Finish this session?")).toBeInTheDocument();
    expect(mockDrainOutboxOrTimeout).not.toHaveBeenCalled();
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
    await confirmFinishAndSave();

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

  test("never shows bare '0 segments' copy during end-session finalizing", async () => {
    let resolveDrain!: (r: DrainResult) => void;
    mockDrainOutboxOrTimeout.mockImplementation(
      () =>
        new Promise<DrainResult>((r) => {
          resolveDrain = r;
        })
    );

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-zero-copy"
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

    act(() => {
      setObserverState({
        state: "registering",
        inFlightStreamCount: 0,
        byStream: new Map(),
        lastError: null,
      });
    });

    await confirmFinishAndSave();

    expect(
      await screen.findByRole("button", { name: /Finalizing/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /0 segment/i })
    ).not.toBeInTheDocument();

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

  test("'Saving N segments' copy reflects live outbox count during drain", async () => {
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

    await confirmFinishAndSave();

    expect(
      await screen.findByRole("button", { name: /Saving 2 segments/i })
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
      await screen.findByRole("button", { name: /Saving 1 segment/i })
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
    await confirmFinishAndSave();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't finalize/i);
    expect(alert.textContent).toMatch(/1 audio segment still saving/i);
    expect(mockEnd).not.toHaveBeenCalled();
    expect(mockFinalizeOutboxAfterEnd).not.toHaveBeenCalled();
  });

  test("regression: stops recorder + awaits flushPendingUploads BEFORE draining (Phase 1b smoke fix)", async () => {
    // The Phase 1b smoke regression: when the user clicks End while the
    // mic is hot, `setUserWantsRecording(false)` was the only stop
    // trigger. The bridge effect ran AFTER React's commit pass — by
    // which time `drainOutboxOrTimeout` had already returned ok against
    // an empty outbox, the atomic action was called with segments: [],
    // and the trailing segment was then enqueued + finalized into thin
    // air. Console evidence from the screenshot:
    //
    //   drainOutboxOrTimeout ok
    //   enqueued ... segmentId=26bc... hasRemoteUrl=true
    //   finalized rowsDeleted=1
    //
    // Fix: `handleEndSession` now calls `audio.stopAndUpload("final")`
    // synchronously and `await audio.flushPendingUploads()` BEFORE
    // touching the outbox, so the trailing segment is in IDB by the
    // time we drain.
    //
    // This test pins the call ORDER (stopAndUpload + flushPendingUploads
    // → drainOutboxOrTimeout → assembleEndSessionSegments → end action),
    // not just the call set, because the bug was purely an ordering
    // bug — every call was made, just in the wrong order.

    const callLog: string[] = [];
    audioCtl.state = "recording";
    audioCtl.stopAndUpload.mockImplementation((mode?: unknown) => {
      callLog.push(`stopAndUpload:${String(mode)}`);
    });
    audioCtl.flushPendingUploads.mockImplementation(async () => {
      callLog.push("flushPendingUploads");
    });
    mockDrainOutboxOrTimeout.mockImplementation(async () => {
      callLog.push("drainOutboxOrTimeout");
      return {
        timedOut: false,
        remainingCount: 0,
        remainingByStream: new Map<string, number>(),
        lastError: null,
      };
    });
    mockAssembleEndSessionSegments.mockImplementation(async () => {
      callLog.push("assembleEndSessionSegments");
      return [
        {
          blobUrl: "https://abc.blob.vercel-storage.com/seg-final.webm",
          mimeType: "audio/webm",
          sizeBytes: 100,
          audioStartedAtMs: 1_000,
          streamId: "tutor:mic",
          segmentId: "seg-final",
        },
      ];
    });
    mockEnd.mockImplementation(async () => {
      callLog.push("endWhiteboardSession");
      return {
        endedAt: "2026-05-10T00:00:00Z",
        durationSeconds: 100,
        registeredSegments: 1,
      };
    });

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-ordering"
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
    await confirmFinishAndSave();

    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalled();
    });

    // The pre-fix order would have been:
    //   ["drainOutboxOrTimeout", "assembleEndSessionSegments",
    //    "endWhiteboardSession", "stopAndUpload:final",
    //    "flushPendingUploads"]
    // Post-fix order must be:
    expect(callLog).toEqual([
      "stopAndUpload:final",
      "flushPendingUploads",
      "drainOutboxOrTimeout",
      "assembleEndSessionSegments",
      "endWhiteboardSession",
    ]);

    // Specifically the segment from the in-flight recorder lands in
    // the atomic action payload — i.e. the trailing segment is no
    // longer dropped.
    expect(mockEnd).toHaveBeenCalledWith(
      "ws-end-ordering",
      "https://abc.blob.vercel-storage.com/blob-events",
      {
        segments: [
          {
            blobUrl: "https://abc.blob.vercel-storage.com/seg-final.webm",
            mimeType: "audio/webm",
            sizeBytes: 100,
            audioStartedAtMs: 1_000,
            streamId: "tutor:mic",
            segmentId: "seg-final",
          },
        ],
      }
    );
  });

  test("regression: does NOT call stopAndUpload when recorder is already idle (mic never armed)", async () => {
    // Negative case: if the tutor never armed the mic, the recorder is
    // in "ready" state. handleEndSession must NOT spuriously call
    // stopAndUpload (which would generate an empty-blob error path) —
    // it should still call flushPendingUploads (which resolves to a
    // no-op because the set is empty), then drain normally.
    audioCtl.state = "ready";

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-noop"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording={false}
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");
    await confirmFinishAndSave();

    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalled();
    });

    expect(audioCtl.stopAndUpload).not.toHaveBeenCalled();
    expect(audioCtl.flushPendingUploads).toHaveBeenCalledTimes(1);
  });

  test("snapshot wiring: generated blob is uploaded and snapshotBlobUrl is forwarded to endWhiteboardSession", async () => {
    // Phase 1c contract — when the snapshot pipeline succeeds, the
    // blob URL must reach the atomic end-session action so the
    // SessionRecording row can render thumbnails on the parent share
    // and the admin review page's "open as image" link.
    const fakePng = new Blob(["fake-png-bytes"], { type: "image/png" });
    mockGenerateSnapshot.mockResolvedValueOnce({
      blob: fakePng,
      sizeBytes: fakePng.size,
      mimeType: "image/png",
    });

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-snap"
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
    await confirmFinishAndSave();

    await waitFor(() => {
      expect(mockSnapshotUpload).toHaveBeenCalledWith({
        whiteboardSessionId: "ws-end-snap",
        studentId: "stu-1",
        png: fakePng,
      });
    });
    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalledWith(
        "ws-end-snap",
        "https://abc.blob.vercel-storage.com/blob-events",
        {
          segments: [],
          snapshotBlobUrl: "https://abc.blob.vercel-storage.com/blob-snapshot.png",
        }
      );
    });
  });

  test("snapshot wiring: snapshot upload failure does NOT block end-session", async () => {
    // The reliability rule (snapshot is best-effort) — a snapshot
    // upload error must still let the session finalize. The atomic
    // end action is called with no snapshotBlobUrl.
    mockGenerateSnapshot.mockResolvedValueOnce({
      blob: new Blob(["fake"], { type: "image/png" }),
      sizeBytes: 4,
      mimeType: "image/png",
    });
    mockSnapshotUpload.mockResolvedValueOnce({
      ok: false as const,
      error: "Vercel Blob 503",
    });

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-snap-fail"
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
    await confirmFinishAndSave();

    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalledWith(
        "ws-end-snap-fail",
        "https://abc.blob.vercel-storage.com/blob-events",
        { segments: [], snapshotBlobUrl: undefined }
      );
    });
  });

  test("snapshot wiring: snapshot generation throwing does NOT block end-session", async () => {
    // Defense-in-depth — the snapshot module is supposed to never
    // throw, but if a future regression breaks that contract the
    // workspace's outer try/catch must absorb it.
    mockGenerateSnapshot.mockRejectedValueOnce(
      new Error("snapshot pipeline regression")
    );

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-snap-throw"
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
    await confirmFinishAndSave();

    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalled();
    });
    expect(mockSnapshotUpload).not.toHaveBeenCalled();
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
    await confirmFinishAndSave();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Vercel Blob 500/);
    expect(alert.textContent).toMatch(/2 audio segments still saving/i);
    expect(mockEnd).not.toHaveBeenCalled();
  });

  // ---- A3 in-shell mode flip (Phase A) ----------------------------------------

  test("A3: onSessionEnded is called instead of router.replace when prop is provided", async () => {
    // Contract: when the shell supplies onSessionEnded, the pipeline should
    // call it (triggering the in-shell mode flip) and must NOT call
    // router.replace / router.refresh. This prevents nav-away on end session.
    const onSessionEnded = jest.fn();

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-a3-shell-flip"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording
        onSessionEnded={onSessionEnded}
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");
    await confirmFinishAndSave();

    // Pipeline must still complete (atomic action called).
    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalledWith(
        "ws-a3-shell-flip",
        "https://abc.blob.vercel-storage.com/blob-events",
        { segments: [] }
      );
    });

    // onSessionEnded callback must fire.
    await waitFor(() => {
      expect(onSessionEnded).toHaveBeenCalledTimes(1);
    });

    // router.replace must NOT be called when onSessionEnded is provided.
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  test("A3: fallback — router.replace IS called when onSessionEnded is not provided", async () => {
    // Legacy fallback contract: without the shell prop, the old navigation
    // behaviour is preserved (router.replace to the review page).
    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-a3-legacy-nav"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording
        // onSessionEnded intentionally omitted
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");
    await confirmFinishAndSave();

    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalled();
    });

    // Legacy path: router.replace must be called with the review href.
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/admin/students/stu-1/whiteboard/ws-a3-legacy-nav/workspace"
      );
    });
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  // ---- A3 shell-integration (non-theater) tests --------------------------
  //
  // These tests are the INDEPENDENT ORACLE the task calls for.
  //
  // The theater problem: the existing A3 tests render WhiteboardWorkspaceClient
  // directly and pass onSessionEnded explicitly. They pass whether or not the
  // shell actually wires onSessionEnded — so they cannot catch the regression
  // where onSessionEnded is absent and router.replace fires instead.
  //
  // The non-theater oracle: render WhiteboardSessionShell (the real shell that
  // page.tsx uses). The shell creates handleSessionEnded and passes it as
  // onSessionEnded to WhiteboardWorkspaceClient internally. After End session:
  //   - router.replace must NOT have been called (no nav-away)
  //   - SessionReviewMode must mount (data-testid="wb-session-review-mode")
  //
  // Red-before / green-after proof:
  //   RED path  — rendering WhiteboardWorkspaceClient WITHOUT onSessionEnded
  //               (the pre-A3 / missing-prop state): router.replace IS called
  //               with the standalone review href. The test below FAILS on
  //               that path because we assert router.replace is NOT called.
  //   GREEN path — rendering via WhiteboardSessionShell: the shell wires
  //               onSessionEnded; router.replace is NOT called; SessionReviewMode
  //               mounts. The test PASSES.
  //
  // Note: the root cause of the real-browser failure was
  // `revalidatePath(...workspace)` inside `endWhiteboardSession` triggering an
  // RSC replacement that clobbered the shell's mode="review" state. That
  // server-side behavior cannot be reproduced in jsdom (server actions are
  // fully mocked here). The fix (removing that revalidatePath call) is
  // verified by the Vercel Preview smoke. What the DOM test CAN verify — and
  // does — is the complete prop-wiring contract: shell → client → onSessionEnded
  // → SessionReviewMode mounts, no router.replace.

  test("A3 shell-integration: E1 oracle — shell wires onSessionEnded; SessionReviewMode mounts in-place, no router.replace", async () => {
    // Renders the full WhiteboardSessionShell stack (the component page.tsx uses).
    // syncEnabled=false makes WorkspaceResumeGate transparent (immediately renders
    // children) so the End-session button is reachable without a consent step.
    render(
      <WhiteboardSessionShell
        role="tutor"
        whiteboardSessionId="ws-shell-1"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording={false}
        syncEnabled={false}
      />
    );

    // Wait for the live canvas to mount (WorkspaceResumeGate passed through,
    // WhiteboardWorkspaceClient rendered).
    await screen.findByTestId("wb-mock-excalidraw-canvas");

    // Confirm no review surface yet.
    expect(screen.queryByTestId("wb-session-review-mode")).not.toBeInTheDocument();

    // Click End session.
    await confirmFinishAndSave();

    // Pipeline must complete (endWhiteboardSession called).
    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalledWith(
        "ws-shell-1",
        "https://abc.blob.vercel-storage.com/blob-events",
        { segments: [] }
      );
    });

    // REAL REQUIREMENT — reviewed in-place:
    // (1) SessionReviewMode must mount (mode flipped to "review").
    await waitFor(() => {
      expect(screen.getByTestId("wb-session-review-mode")).toBeInTheDocument();
    });
    // (2) The review surface is for the correct session.
    expect(screen.getByTestId("wb-session-review-mode")).toHaveAttribute(
      "data-wbsid",
      "ws-shell-1"
    );
    // (3) No router.replace / router.refresh navigation (URL did not change).
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
    // (4) Live canvas is gone (WhiteboardWorkspaceClient unmounted).
    expect(screen.queryByTestId("wb-mock-excalidraw-canvas")).not.toBeInTheDocument();
  });

  test("A3 shell-integration: RED path proof — without shell (no onSessionEnded), router.replace fires and review mode does NOT mount", async () => {
    // This test documents the PRE-FIX / missing-prop failure mode.
    // Rendering WhiteboardWorkspaceClient directly WITHOUT onSessionEnded
    // simulates what happens if the shell prop-wiring were broken: the legacy
    // router.replace path fires and SessionReviewMode never mounts.
    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-no-shell"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording={false}
        // onSessionEnded intentionally omitted — simulates broken/absent wiring
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");
    await confirmFinishAndSave();

    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalled();
    });

    // router.replace IS called (legacy nav-away fires when prop is absent).
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/admin/students/stu-1/whiteboard/ws-no-shell/workspace"
      );
    });
    // SessionReviewMode does NOT mount (client-side flip never happens).
    expect(screen.queryByTestId("wb-session-review-mode")).not.toBeInTheDocument();
  });

  test("A3: step ordering with onSessionEnded — atomic pipeline still completes before flip", async () => {
    // Verify that even with the in-shell flip, the ordering contract
    // (stop→flush→drain→assemble→end) is preserved and onSessionEnded
    // fires AFTER endWhiteboardSession completes (not before).
    const callLog: string[] = [];
    const onSessionEnded = jest.fn(() => {
      callLog.push("onSessionEnded");
    });
    audioCtl.state = "recording";
    audioCtl.stopAndUpload.mockImplementation((mode?: unknown) => {
      callLog.push(`stopAndUpload:${String(mode)}`);
    });
    audioCtl.flushPendingUploads.mockImplementation(async () => {
      callLog.push("flushPendingUploads");
    });
    mockDrainOutboxOrTimeout.mockImplementation(async () => {
      callLog.push("drainOutboxOrTimeout");
      return {
        timedOut: false,
        remainingCount: 0,
        remainingByStream: new Map<string, number>(),
        lastError: null,
      };
    });
    mockAssembleEndSessionSegments.mockImplementation(async () => {
      callLog.push("assembleEndSessionSegments");
      return [];
    });
    mockEnd.mockImplementation(async () => {
      callLog.push("endWhiteboardSession");
      return { endedAt: "2026-05-10T00:00:00Z", durationSeconds: 100, registeredSegments: 0 };
    });

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-a3-ordering"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording
        onSessionEnded={onSessionEnded}
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");
    await confirmFinishAndSave();

    await waitFor(() => {
      expect(onSessionEnded).toHaveBeenCalled();
    });

    // onSessionEnded fires AFTER endWhiteboardSession, not before.
    expect(callLog).toEqual([
      "stopAndUpload:final",
      "flushPendingUploads",
      "drainOutboxOrTimeout",
      "assembleEndSessionSegments",
      "endWhiteboardSession",
      "onSessionEnded",
    ]);
  });

  test("CF-4: notes trigger failure surfaces tutor-visible error after session seals", async () => {
    mockTriggerNotesGenerationAction.mockResolvedValueOnce({
      ok: false,
      error: "You do not own this whiteboard session",
    });

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-notes-fail"
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
    await confirmFinishAndSave();

    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalled();
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/notes could not be started/i);
    expect(alert.textContent).toMatch(/You do not own this whiteboard session/i);
  });
});
