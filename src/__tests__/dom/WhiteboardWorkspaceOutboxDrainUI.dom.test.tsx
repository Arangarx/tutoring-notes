/**
 * @jest-environment jsdom
 *
 * P2-J5 — upload-outbox drain UI contract (FRAGILE-adjacent surface).
 *
 * User-observable oracle: while the IndexedDB outbox still has pending
 * uploads for this session, the tutor End-session control shows honest
 * "Saving your recording…" copy (not a raw segment count). Once the real
 * outbox drains (fake-indexeddb + controllable uploader), finalize runs
 * and the saving state clears.
 *
 * Unlike `WhiteboardWorkspaceEnd.dom.test.tsx`, this file does NOT mock
 * `upload-outbox-instance` — it injects a real `createUploadOutbox` via
 * `setUploadOutboxForTests` so observer + drain semantics come from the
 * production outbox module, not a hand-rolled observer stub.
 */

import "fake-indexeddb/auto";

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createUploadOutbox,
  type OutboxUploadResult,
  type UploadOutbox,
} from "@/lib/recording/upload-outbox";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";
import {
  resetUploadOutboxForTests,
  setUploadOutboxForTests,
} from "@/lib/recording/upload-outbox-instance";

const WBSID = "ws-p2-j5-outbox-drain";
const STUDENT_ID = "stu-p2-j5";

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
jest.mock("@/lib/whiteboard/upload", () => ({
  uploadWhiteboardEvents: (...args: unknown[]) => mockUpload.apply(null, args),
  uploadWhiteboardSnapshot: jest.fn(async () => ({
    ok: true as const,
    blobUrl: "https://abc.blob.vercel-storage.com/blob-snapshot.png",
    sizeBytes: 100,
  })),
}));
jest.mock("@/lib/whiteboard/snapshot-png", () => ({
  generateSessionSnapshotPng: jest.fn(async () => null),
}));

const mockFinalize = jest.fn(() =>
  Promise.resolve({
    ok: true as const,
    idempotent: false as const,
    endedAt: "2026-05-10T00:00:00Z",
    durationSeconds: 100,
    registeredSegments: 1,
  })
);
jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  finalizeWhiteboardSessionFromBackend: (...args: unknown[]) =>
    mockFinalize.apply(null, args),
  issueJoinToken: jest.fn(() => Promise.resolve({ token: "tok" })),
  registerWhiteboardSessionAudioSegmentAction: jest.fn(() =>
    Promise.resolve({ ok: true as const, recordingId: "rec1", orderIndex: 0 })
  ),
  revokeJoinTokensForSession: jest.fn(() => Promise.resolve()),
  endStaleWhiteboardSession: jest.fn(() =>
    Promise.resolve({ endedAt: "2026-05-10T00:00:00Z" })
  ),
  startWhiteboardSession: jest.fn(() => Promise.resolve({ ok: true, phase: "active" })),
  enqueueChunkTranscriptionAction: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  kickSessionChunksAction: jest.fn(() => Promise.resolve({ kicked: 0 })),
  triggerNotesGenerationAction: jest.fn(() => Promise.resolve({ ok: true })),
  loadSessionReviewPayload: jest.fn(),
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
    buildFinalEventsJson: () =>
      `{"schemaVersion":1,"startedAt":"2026-05-09T00:00:00.000Z","durationMs":100,"events":[]}`,
    flushServerPersist: jest.fn().mockResolvedValue(undefined),
    markPersisted: jest.fn().mockResolvedValue(undefined),
    checkpointMountResolved: true,
    postGateAutoCanvas: null,
    acknowledgePostGateAutoCanvas: jest.fn(),
    flushThrottledFrameNow: jest.fn(),
    broadcastScenePageSnapshot: jest.fn(),
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

const audioCtl = {
  state: "ready" as string,
  stopAndUpload: jest.fn(),
  flushPendingUploads: jest.fn(() => Promise.resolve()),
};

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

jest.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({
    get state() {
      return audioCtl.state;
    },
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
    stopAndUpload: audioCtl.stopAndUpload,
    handleReset: jest.fn(),
    flushPendingUploads: audioCtl.flushPendingUploads,
  }),
}));

import { WhiteboardWorkspaceClient } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient";

type DeferredUpload = {
  promise: Promise<OutboxUploadResult>;
  resolve: (r: OutboxUploadResult) => void;
};

function makeDeferredUpload(): DeferredUpload {
  let resolve!: (r: OutboxUploadResult) => void;
  const promise = new Promise<OutboxUploadResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeControllableOutbox(deferred: DeferredUpload): UploadOutbox {
  // Omit `onSegmentUploaded` so the worker marks rows register-ready
  // synchronously after upload (see upload-outbox `needsRegister` gate).
  // A no-op async callback would leave `registerOk` false without a
  // follow-up `refreshStateAndNotify`, wedging `drainAndAwait`.
  return createUploadOutbox({
    dbName: `outbox-p2-j5-${Math.random().toString(36).slice(2)}`,
    backoffMsByAttempt: [0, 0, 0, 0, 0],
    upload: async () => deferred.promise,
  });
}

async function seedPendingUploadRow(outbox: UploadOutbox): Promise<void> {
  await outbox.enqueue({
    sessionId: WBSID,
    streamId: TUTOR_MIC_STREAM_ID,
    segmentId: "seg-pending-p2-j5",
    blobLocalRef: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
    mimeType: "audio/webm",
    sizeBytes: 3,
    audioStartedAtMs: 1_000,
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function renderWorkspace() {
  return render(
    <WhiteboardWorkspaceClient
      whiteboardSessionId={WBSID}
      studentId={STUDENT_ID}
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
}

describe("P2-J5 — outbox drain UI (fake-IDB + real observer)", () => {
  let deferred: DeferredUpload;
  let outbox: UploadOutbox;

  beforeEach(async () => {
    jest.useRealTimers();
    window.scrollTo = jest.fn();
    mockRouterReplace.mockClear();
    mockRouterRefresh.mockClear();
    mockFinalize.mockClear();
    mockUpload.mockClear();
    audioCtl.state = "ready";
    audioCtl.stopAndUpload.mockReset();
    audioCtl.flushPendingUploads.mockReset();
    audioCtl.flushPendingUploads.mockImplementation(() => Promise.resolve());

    deferred = makeDeferredUpload();
    outbox = makeControllableOutbox(deferred);
    setUploadOutboxForTests(outbox);
    await seedPendingUploadRow(outbox);
  });

  afterEach(() => {
    resetUploadOutboxForTests();
  });

  test("shows 'Saving your recording…' while fake-IDB outbox upload is pending, then finalizes after drain", async () => {
    renderWorkspace();
    await screen.findByTestId("wb-mock-excalidraw-canvas");

    await confirmFinishAndSave();

    const savingButton = await screen.findByRole("button", {
      name: /Saving your recording/i,
    });
    expect(savingButton).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Saving \d+ segment/i })
    ).not.toBeInTheDocument();
    expect(mockFinalize).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve({
        ok: true,
        blobUrl: "https://abc.blob.vercel-storage.com/seg-pending-p2-j5.webm",
      });
    });

    await waitFor(() => {
      expect(mockFinalize).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Saving your recording/i })
      ).not.toBeInTheDocument();
    });

    expect(await outbox.listAllRows(WBSID)).toEqual([]);
  });
});
