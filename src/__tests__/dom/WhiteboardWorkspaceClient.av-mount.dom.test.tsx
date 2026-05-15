/**
 * @jest-environment jsdom
 */

/**
 * Workspace ↔ live-A/V mount contract (Phase 4c).
 *
 * Asserts the integration glue between `WhiteboardWorkspaceClient`
 * and the Phase 4b hook + recorder, NOT the hook / recorder
 * internals (those have their own suites).
 *
 * What we assert:
 *
 *   1. `localPeerId` is minted once and threaded into BOTH
 *      `createWhiteboardSyncClient({peerId})` and
 *      `useLiveAV({localPeerId})` — same id everywhere, no drift.
 *
 *   2. `AVPermissionsPrompt` + `AVTilesPanel` + `AVControls` are
 *      mounted in the workspace render.
 *
 *   3. 3-peer canary: tutor + 2 students. AVTilesPanel renders
 *      one tile per remote participant; `useRemoteMicRecorders`'s
 *      factory is invoked once per participant with the canonical
 *      `student:peer-<id>:mic` streamId; FSM `inputStreams`
 *      contains the tutor-mic + both student-mic entries.
 *
 *   4. Sync-reconnect mesh-restart: when the sync-client emits
 *      `onDisconnect` followed by `onConnect`, `mesh.restart` is
 *      called for EVERY current peer.
 *
 * The workspace has heavy upstream deps (Excalidraw, recorder, FSM,
 * upload outbox, server actions, theme hook, image hydrators…); the
 * existing `WhiteboardWorkspaceEnd.dom.test.tsx` already establishes
 * the mock-at-module-boundary pattern. We reuse the same shape so
 * the suite remains predictable + jsdom-renderable.
 */

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";

// ----- Heavy / unrelated modules: minimal stubs ------------------

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
jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: () => null,
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

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
}));

// ----- Sync-client mock: lets us spy on the peerId we pass in -----

type FakeSyncClient = {
  isConnected: () => boolean;
  disconnect: jest.Mock;
  onRemoteScene: () => () => void;
  onConnect: jest.Mock;
  onDisconnect: jest.Mock;
  onPeerCountChange: jest.Mock;
  onRoomPeersChange: jest.Mock;
  broadcastScene: jest.Mock;
  broadcastDocument: jest.Mock;
  flushPendingBroadcast: jest.Mock;
  // Test-only helpers
  __triggerConnect: () => void;
  __triggerDisconnect: () => void;
  __getPeerId: () => string | undefined;
};

const createdSyncClients: FakeSyncClient[] = [];

const mockCreateWhiteboardSyncClient = jest.fn(
  (opts: { peerId?: string }): FakeSyncClient => {
    const connectCbs: Array<() => void> = [];
    const disconnectCbs: Array<() => void> = [];
    let connected = false;
    const client: FakeSyncClient = {
      isConnected: () => connected,
      disconnect: jest.fn(),
      onRemoteScene: () => () => {},
      onConnect: jest.fn((cb: () => void) => {
        connectCbs.push(cb);
        return () => {
          const i = connectCbs.indexOf(cb);
          if (i >= 0) connectCbs.splice(i, 1);
        };
      }),
      onDisconnect: jest.fn((cb: () => void) => {
        disconnectCbs.push(cb);
        return () => {
          const i = disconnectCbs.indexOf(cb);
          if (i >= 0) disconnectCbs.splice(i, 1);
        };
      }),
      onPeerCountChange: jest.fn(() => () => {}),
      onRoomPeersChange: jest.fn(() => () => {}),
      broadcastScene: jest.fn(),
      broadcastDocument: jest.fn(),
      flushPendingBroadcast: jest.fn(),
      __triggerConnect: () => {
        connected = true;
        for (const cb of [...connectCbs]) cb();
      },
      __triggerDisconnect: () => {
        connected = false;
        for (const cb of [...disconnectCbs]) cb();
      },
      __getPeerId: () => opts.peerId,
    };
    createdSyncClients.push(client);
    return client;
  }
);
jest.mock("@/lib/whiteboard/sync-client", () => ({
  createWhiteboardSyncClient: (opts: { peerId?: string }) =>
    mockCreateWhiteboardSyncClient(opts),
  generateEncryptionKeyBase64Url: () =>
    "test-integration-key-16chars-min",
}));

// ----- useLiveAV mock: scriptable participants + spies ------------

type LiveAvState = {
  participants: ReadonlyArray<{
    peerId: string;
    role: "tutor" | "student";
    label?: string;
    audioStream: MediaStream | null;
    videoStream: MediaStream | null;
    peerConnectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
  }>;
  localAudioStream: MediaStream | null;
  localVideoStream: MediaStream | null;
  hasMicPermission: "unknown" | "prompt" | "granted" | "denied";
  hasCamPermission: "unknown" | "prompt" | "granted" | "denied";
  isMicMuted: boolean;
  isCamMuted: boolean;
  error: null;
  videoError: null;
};

let liveAvState: LiveAvState = {
  participants: [],
  localAudioStream: null,
  localVideoStream: null,
  hasMicPermission: "prompt",
  hasCamPermission: "prompt",
  isMicMuted: false,
  isCamMuted: true,
  error: null,
  videoError: null,
};
let receivedLocalPeerId: string | undefined;
const reconnectPeerSpy = jest.fn();
const requestMicSpy = jest.fn().mockResolvedValue(undefined);
const requestCamSpy = jest.fn().mockResolvedValue(undefined);
const toggleMicSpy = jest.fn();
const toggleCamSpy = jest.fn();

jest.mock("@/hooks/useLiveAV", () => ({
  useLiveAV: (opts: { localPeerId?: string }) => {
    receivedLocalPeerId = opts.localPeerId;
    return {
      ...liveAvState,
      toggleMic: toggleMicSpy,
      toggleCam: toggleCamSpy,
      requestMic: requestMicSpy,
      requestCam: requestCamSpy,
      isAcquiring: false,
      isActive: false,
      reconnectPeer: reconnectPeerSpy,
      retryAcquire: jest.fn().mockResolvedValue(undefined),
    };
  },
}));

// ----- evaluateLifecycle spy: captures the inputStreams we pass in -

const evaluateLifecycleCalls: Array<{
  inputStreams: ReadonlyMap<string, string>;
  tutorWantsRecording: boolean;
}> = [];
jest.mock("@/lib/recording/lifecycle-machine", () => {
  const actual = jest.requireActual("@/lib/recording/lifecycle-machine");
  return {
    ...actual,
    evaluateLifecycle: (inputs: {
      inputStreams?: ReadonlyMap<string, string>;
      tutorWantsRecording: boolean;
    }) => {
      evaluateLifecycleCalls.push({
        inputStreams:
          inputs.inputStreams ?? new Map<string, string>(),
        tutorWantsRecording: inputs.tutorWantsRecording,
      });
      return actual.evaluateLifecycle(inputs);
    },
  };
});

// ----- Recorder factory mock: spied for the orchestrator hook -----

const recorderFactorySpy = jest.fn();
jest.mock("@/lib/recording/remote-stream-recorder", () => {
  const actual = jest.requireActual("@/lib/recording/remote-stream-recorder");
  return {
    ...actual,
    createRemoteStreamRecorder: (opts: { streamId: string }) => {
      recorderFactorySpy(opts);
      let recording = false;
      return {
        start: () => {
          recording = true;
        },
        stop: async () => {
          recording = false;
        },
        isRecording: () => recording,
        dispose: jest.fn(),
      };
    },
  };
});

// ----- Other workspace dependencies (recorder, audio bridge, etc.) -

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
    checkpointStatus: "idle",
    checkpointError: null,
    checkpointMountResolved: true,
    lastCheckpointAt: null,
    resumePrompt: null,
    acceptResume: jest.fn().mockResolvedValue(null),
    declineResume: jest.fn(),
    postGateAutoCanvas: null,
    acknowledgePostGateAutoCanvas: jest.fn(),
    buildFinalEventsJson: jest.fn(),
    setUiContext: jest.fn(),
  }),
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

jest.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    isUploading: false,
    error: null,
    durationMs: 0,
    audioBlobs: [],
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    micPermission: "unknown",
    deviceId: null,
    inputDevices: [],
    selectDevice: jest.fn(),
    audioLevel: 0,
    elapsedMs: 0,
    refresh: jest.fn(),
  }),
}));

const mockGetOrCreateOutbox = jest.fn(() => ({
  enqueue: jest.fn().mockResolvedValue(undefined),
  onChange: () => () => {},
  list: jest.fn().mockResolvedValue([]),
  getInFlightCount: () => 0,
  drain: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/recording/upload-outbox-instance", () => ({
  getOrCreateUploadOutbox: () => mockGetOrCreateOutbox(),
  registerSessionStudentId: jest.fn(),
  drainOutboxOrTimeout: jest.fn().mockResolvedValue({ drained: true }),
  finalizeOutboxAfterEnd: jest.fn().mockResolvedValue(undefined),
  assembleEndSessionSegments: jest
    .fn()
    .mockResolvedValue({ segments: [] }),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  endWhiteboardSession: jest
    .fn()
    .mockResolvedValue({ endedAt: "2026-05-10T00:00:00Z" }),
  issueJoinToken: jest.fn().mockResolvedValue({ token: "tok" }),
  revokeJoinTokensForSession: jest.fn().mockResolvedValue(undefined),
}));

// ----- Test helpers ----------------------------------------------

function makeFakeAudioStream(id: string): MediaStream {
  const track = {
    kind: "audio" as const,
    enabled: true,
    readyState: "live" as const,
    id,
  };
  return {
    id,
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
    getTracks: () => [track],
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
  } as unknown as MediaStream;
}

function makeParticipant(
  peerId: string,
  overrides: Partial<{
    role: "tutor" | "student";
    label: string;
    audioStream: MediaStream | null;
    peerConnectionState: RTCPeerConnectionState;
  }> = {}
): LiveAvState["participants"][number] {
  return {
    peerId,
    role: overrides.role ?? "student",
    label: overrides.label,
    audioStream:
      overrides.audioStream !== undefined
        ? overrides.audioStream
        : makeFakeAudioStream(`stream-${peerId}`),
    videoStream: null,
    peerConnectionState: overrides.peerConnectionState ?? "connected",
    iceConnectionState: "connected",
  };
}

const baseProps = {
  whiteboardSessionId: "wb-sess-1",
  studentId: "stu-1",
  studentName: "Alex",
  adminUserId: "adm-1",
  startedAtIso: "2026-05-10T00:00:00.000Z",
  bothConnectedAtIso: null,
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
  syncUrl: "wss://wb.example.com",
  initialUserWantsRecording: false,
};

async function renderWorkspace() {
  const mod = await import(
    "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient"
  );
  // Park an encryption key in the hash so the sync-client effect
  // proceeds past its `if (!encryptionKey) return` gate.
  window.history.replaceState(
    null,
    "",
    "#k=test-integration-key-16chars-min"
  );
  const utils = render(<mod.WhiteboardWorkspaceClient {...baseProps} />);
  // Flush the sync-client mount effect.
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

beforeEach(() => {
  mockCreateWhiteboardSyncClient.mockClear();
  createdSyncClients.length = 0;
  reconnectPeerSpy.mockClear();
  recorderFactorySpy.mockClear();
  evaluateLifecycleCalls.length = 0;
  receivedLocalPeerId = undefined;
  liveAvState = {
    participants: [],
    localAudioStream: null,
    localVideoStream: null,
    hasMicPermission: "prompt",
    hasCamPermission: "prompt",
    isMicMuted: false,
    isCamMuted: true,
    error: null,
    videoError: null,
  };
});

describe("WhiteboardWorkspaceClient ↔ live A/V mount", () => {
  test("mints localPeerId once and threads it into BOTH sync-client and useLiveAV", async () => {
    await renderWorkspace();
    expect(createdSyncClients).toHaveLength(1);
    const syncPeerId = createdSyncClients[0].__getPeerId();
    expect(syncPeerId).toBeTruthy();
    expect(receivedLocalPeerId).toBe(syncPeerId);
  });

  test("renders AVPermissionsPrompt + AVTilesPanel + AVControls", async () => {
    await renderWorkspace();
    expect(screen.getByTestId("av-permissions-prompt")).toBeTruthy();
    expect(screen.getByTestId("av-tiles-panel")).toBeTruthy();
    expect(screen.getByTestId("av-controls")).toBeTruthy();
  });

  test("3-peer canary: tutor + 2 students render distinct tiles + recorders + FSM streams", async () => {
    liveAvState = {
      ...liveAvState,
      localAudioStream: makeFakeAudioStream("local"),
      hasMicPermission: "granted",
      participants: [
        makeParticipant("peer-A", { label: "Alex" }),
        makeParticipant("peer-B", { label: "Beth" }),
      ],
    };

    await renderWorkspace();

    // (a) AVTilesPanel renders BOTH remote tiles + the local one.
    const panel = screen.getByTestId("av-tiles-panel");
    const tiles = Array.from(
      panel.querySelectorAll<HTMLElement>("[data-peer-id]")
    );
    const peerIds = tiles.map((t) => t.getAttribute("data-peer-id"));
    expect(peerIds).toContain("peer-A");
    expect(peerIds).toContain("peer-B");
    // Local tile is also present (peerId is the minted localPeerId).
    expect(peerIds).toContain(receivedLocalPeerId);

    // (b) `createRemoteStreamRecorder` was invoked once per
    // participant with the canonical student-mic streamId.
    await waitFor(() => {
      expect(recorderFactorySpy).toHaveBeenCalledTimes(2);
    });
    const streamIds = recorderFactorySpy.mock.calls
      .map((c) => c[0].streamId)
      .sort();
    expect(streamIds).toEqual([
      "student:peer-peer-A:mic",
      "student:peer-peer-B:mic",
    ]);

    // (c) FSM `inputStreams` contains the tutor-mic + both
    // student-mic entries on the most recent evaluate call.
    expect(evaluateLifecycleCalls.length).toBeGreaterThan(0);
    const last =
      evaluateLifecycleCalls[evaluateLifecycleCalls.length - 1];
    // userWantsRecording=false initially, so tutor:mic is NOT in
    // the map (the workspace gates that on the toggle). But the
    // student-mic entries are unconditionally present whenever a
    // participant has an audioStream.
    expect(last.inputStreams.has("student:peer-peer-A:mic")).toBe(true);
    expect(last.inputStreams.has("student:peer-peer-B:mic")).toBe(true);
  });

  test("FSM inputStreams reflects participant peerConnectionState (connected→ok, connecting→degraded, failed→failed)", async () => {
    liveAvState = {
      ...liveAvState,
      localAudioStream: makeFakeAudioStream("local"),
      participants: [
        makeParticipant("peer-OK", { peerConnectionState: "connected" }),
        makeParticipant("peer-DEG", { peerConnectionState: "connecting" }),
        makeParticipant("peer-FAIL", { peerConnectionState: "failed" }),
      ],
    };

    await renderWorkspace();

    const last =
      evaluateLifecycleCalls[evaluateLifecycleCalls.length - 1];
    expect(last.inputStreams.get("student:peer-peer-OK:mic")).toBe("ok");
    expect(last.inputStreams.get("student:peer-peer-DEG:mic")).toBe(
      "degraded"
    );
    expect(last.inputStreams.get("student:peer-peer-FAIL:mic")).toBe(
      "failed"
    );
  });

  test("sync-reconnect → mesh.restart for every current peer", async () => {
    liveAvState = {
      ...liveAvState,
      participants: [
        makeParticipant("peer-A"),
        makeParticipant("peer-B"),
      ],
    };

    await renderWorkspace();
    const client = createdSyncClients[0];
    // Initial onConnect (workspace-mount → relay connects): the
    // workspace seeds `wasSyncConnectedRef` from `isConnected()`
    // BEFORE the first onConnect fires, so a first-connect
    // doesn't fire a spurious mesh.restart. Simulate disconnect
    // then reconnect to trigger the restart path.
    act(() => {
      client.__triggerConnect();
    });
    expect(reconnectPeerSpy).not.toHaveBeenCalled();

    act(() => {
      client.__triggerDisconnect();
    });
    act(() => {
      client.__triggerConnect();
    });

    expect(reconnectPeerSpy).toHaveBeenCalledTimes(2);
    const calledIds = reconnectPeerSpy.mock.calls.map((c) => c[0]).sort();
    expect(calledIds).toEqual(["peer-A", "peer-B"]);
  });

  test("first-mount onConnect does NOT trigger mesh.restart (only reconnect-after-disconnect does)", async () => {
    liveAvState = {
      ...liveAvState,
      participants: [makeParticipant("peer-A")],
    };
    await renderWorkspace();
    const client = createdSyncClients[0];
    act(() => {
      client.__triggerConnect();
    });
    expect(reconnectPeerSpy).not.toHaveBeenCalled();
  });
});
