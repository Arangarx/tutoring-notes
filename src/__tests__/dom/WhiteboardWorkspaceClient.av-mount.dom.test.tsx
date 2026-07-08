/**
 * @jest-environment jsdom
 */

/**
 * Workspace Γåö live-A/V mount contract (Phase 4c).
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
 *   2. Live-board chrome: no inline `AVPermissionsPrompt`; `AVTilesPanel`
 *      + `AVControls` via `WbAVCluster`; top-bar mic settings popover host.
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
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// ----- Heavy / unrelated modules: minimal stubs ------------------

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
  useParams: () => ({}),
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
  onRemotePointer: jest.Mock;
  broadcastScene: jest.Mock;
  broadcastDocument: jest.Mock;
  flushPendingBroadcast: jest.Mock;
  setLocalAvMediaState: jest.Mock;
  // Test-only helpers
  __triggerConnect: () => void;
  __triggerDisconnect: () => void;
  __triggerPeerCount: (count: number) => void;
  __getPeerId: () => string | undefined;
};

const createdSyncClients: FakeSyncClient[] = [];

const mockCreateWhiteboardSyncClient = jest.fn(
  (opts: { peerId?: string }): FakeSyncClient => {
    const connectCbs: Array<() => void> = [];
    const disconnectCbs: Array<() => void> = [];
    const peerCountCbs: Array<(count: number) => void> = [];
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
      onPeerCountChange: jest.fn((cb: (count: number) => void) => {
        peerCountCbs.push(cb);
        return () => {
          const i = peerCountCbs.indexOf(cb);
          if (i >= 0) peerCountCbs.splice(i, 1);
        };
      }),
      onRoomPeersChange: jest.fn(() => () => {}),
      setLocalAvMediaState: jest.fn(),
      onRemotePointer: jest.fn(() => () => {}),
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
      __triggerPeerCount: (count: number) => {
        for (const cb of [...peerCountCbs]) cb(count);
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
let receivedLiveAvOpts: {
  externalAudioStream?: MediaStream | null;
  swapMicDevice?: unknown;
} | undefined;
const reconnectPeerSpy = jest.fn();
const requestMicSpy = jest.fn().mockResolvedValue(undefined);
const requestCamSpy = jest.fn().mockResolvedValue(undefined);
const toggleMicSpy = jest.fn();
const toggleCamSpy = jest.fn();
const setVideoCameraBySlotSpy = jest.fn().mockResolvedValue(undefined);

/** Per-test override for the video devices list (affects camDisabled in WbAVCluster). */
let liveAvVideoDevices: ReadonlyArray<MediaDeviceInfo> = [];

function makeFakeVideoDevice(id: string): MediaDeviceInfo {
  return {
    deviceId: id,
    groupId: `group-${id}`,
    kind: "videoinput" as const,
    label: `Camera ${id}`,
    toJSON: () => ({}),
  };
}

jest.mock("@/hooks/useLiveAV", () => ({
  useLiveAV: (opts: {
    localPeerId?: string;
    externalAudioStream?: MediaStream | null;
    swapMicDevice?: unknown;
  }) => {
    receivedLocalPeerId = opts.localPeerId;
    receivedLiveAvOpts = {
      externalAudioStream: opts.externalAudioStream,
      swapMicDevice: opts.swapMicDevice,
    };
    return {
      ...liveAvState,
      // Compute reachableParticipants from the mock participants state
      reachableParticipants: liveAvState.participants.filter(
        (p) =>
          p.peerConnectionState === "connected" &&
          (p.iceConnectionState === "connected" || p.iceConnectionState === "completed")
      ),
      toggleMic: toggleMicSpy,
      toggleCam: toggleCamSpy,
      requestMic: requestMicSpy,
      requestCam: requestCamSpy,
      isAcquiring: false,
      isActive: false,
      reconnectPeer: reconnectPeerSpy,
      retryAcquire: jest.fn().mockResolvedValue(undefined),
      videoDevices: liveAvVideoDevices,
      audioDevices: [],
      refreshVideoDeviceList: jest.fn().mockResolvedValue(undefined),
      refreshAudioDeviceList: jest.fn().mockResolvedValue(undefined),
      pickedVideoCameraSlot: 0,
      pickedMicSlot: 0,
      selectedMicDeviceId: null,
      setVideoCameraBySlot: setVideoCameraBySlotSpy,
      setVideoDevice: jest.fn().mockResolvedValue(undefined),
      setMicDevice: jest.fn().mockResolvedValue(undefined),
      setMicDeviceBySlot: jest.fn().mockResolvedValue(undefined),
      selectedVideoDeviceId: null,
      gainLinear: 1,
      setGainLinear: jest.fn(),
    };
  },
}));

// ----- evaluateLifecycle spy: captures inputs we pass in ----------

const evaluateLifecycleCalls: Array<{
  inputStreams: ReadonlyMap<string, string>;
  tutorWantsRecording: boolean;
  participants: ReadonlySet<string>;
  everHadParticipants: boolean;
}> = [];
jest.mock("@/lib/recording/lifecycle-machine", () => {
  const actual = jest.requireActual("@/lib/recording/lifecycle-machine");
  return {
    ...actual,
    evaluateLifecycle: (inputs: {
      inputStreams?: ReadonlyMap<string, string>;
      tutorWantsRecording: boolean;
      participants?: ReadonlySet<string>;
      everHadParticipants?: boolean;
    }) => {
      evaluateLifecycleCalls.push({
        inputStreams:
          inputs.inputStreams ?? new Map<string, string>(),
        tutorWantsRecording: inputs.tutorWantsRecording,
        participants: inputs.participants ?? new Set<string>(),
        everHadParticipants: inputs.everHadParticipants ?? false,
      });
      return actual.evaluateLifecycle(inputs);
    },
  };
});

// ----- Remote-stream-recorder mock: kept around so the per-peer
// recorder primitive itself stays unit-tested via its own suite, but
// no longer exercised by the workspace (May 15 redesign — see the
// addRemoteAudio mixdown wiring asserted below). The mock stays so a
// future re-introduction of useRemoteMicRecorders doesn't accidentally
// hit the real implementation during this DOM test.

jest.mock("@/lib/recording/remote-stream-recorder", () => {
  const actual = jest.requireActual("@/lib/recording/remote-stream-recorder");
  return {
    ...actual,
    createRemoteStreamRecorder: () => {
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
    flushServerPersist: jest.fn().mockResolvedValue(undefined),
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

// ----- useAudioRecorder mock: spies addRemoteAudio so the mixdown
// wiring can be asserted directly.

const addRemoteAudioSpy = jest.fn();
const addRemoteAudioUnsubs: jest.Mock[] = [];
const setRemoteRecordingGainSpy = jest.fn();
const setTutorRecordingMuteSpy = jest.fn();
jest.mock("@/hooks/useAudioRecorder", () => {
  const fakeLocalMicStream = {
    id: "fake-local-mic-stream",
    getAudioTracks: () => [],
    getVideoTracks: () => [],
    getTracks: () => [],
  } as unknown as MediaStream;
  return {
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
      meterBarRef: { current: null },
      devices: [] as MediaDeviceInfo[],
      pickedMicSlot: 0,
      gainLinear: 1,
      setGainLinear: jest.fn(),
      isLive: false,
      lockDevice: false,
      chimeEnabled: false,
      setChimeEnabled: jest.fn(),
      chimeVolume: 0.5,
      setChimeVolume: jest.fn(),
      // Mixdown contract — workspace gates the participants-reconcile
      // effect on localMicStream becoming non-null AND uses
      // addRemoteAudio to attach each remote participant's stream
      // to the recording mixdown.
      localMicStream: fakeLocalMicStream,
      addRemoteAudio: (stream: MediaStream) => {
        addRemoteAudioSpy(stream);
        const unsub = jest.fn();
        addRemoteAudioUnsubs.push(unsub);
        return unsub;
      },
      setRemoteRecordingGain: (stream: MediaStream, gain: number) => {
        setRemoteRecordingGainSpy(stream, gain);
      },
      setTutorRecordingMute: (muted: boolean) => {
        setTutorRecordingMuteSpy(muted);
      },
    }),
  };
});

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
  startWhiteboardSession: jest.fn().mockResolvedValue({ ok: true, phase: "active" }),
}));

// notes-actions imports next/cache (revalidatePath) which requires TextEncoder
// (not available in jsdom). Mock the whole module at the boundary.
jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  kickSessionChunksAction: jest.fn(() => Promise.resolve({ kicked: 0 })),
  triggerNotesGenerationAction: jest.fn(() => Promise.resolve()),
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

/** WbTopBarMicControl hidden meter host — sole consumer of workspaceAudio.meterBarRef. */
function countMeterBarRefHosts(root: ParentNode = document): number {
  return root.querySelectorAll(".mynk-wb-mic-meter-hidden").length;
}

async function renderWorkspace(
  overrides: Partial<
    typeof baseProps & {
      role: "tutor" | "student";
      joinToken: string;
      initialSessionPhase: "PENDING" | "ACTIVE";
      sessionMode: "LIVE" | "IN_PERSON";
      initialHasConsentSnapshot: boolean;
      initialAllowAudioRecording: boolean | null;
    }
  > = {}
) {
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
  const utils = render(
    <mod.WhiteboardWorkspaceClient {...baseProps} {...overrides} />
  );
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
  requestCamSpy.mockClear();
  toggleCamSpy.mockClear();
  setVideoCameraBySlotSpy.mockClear();
  liveAvVideoDevices = [];
  addRemoteAudioSpy.mockClear();
  addRemoteAudioUnsubs.length = 0;
  setRemoteRecordingGainSpy.mockClear();
  setTutorRecordingMuteSpy.mockClear();
  toggleMicSpy.mockClear();
  evaluateLifecycleCalls.length = 0;
  receivedLocalPeerId = undefined;
  receivedLiveAvOpts = undefined;
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

// Helper: get the latest evaluateLifecycle call (most recent render).
function lastLifecycleCall() {
  return evaluateLifecycleCalls[evaluateLifecycleCalls.length - 1];
}

describe("WhiteboardWorkspaceClient Γåö live A/V mount", () => {
  test("mints localPeerId once and threads it into BOTH sync-client and useLiveAV", async () => {
    await renderWorkspace();
    expect(createdSyncClients).toHaveLength(1);
    const syncPeerId = createdSyncClients[0].__getPeerId();
    expect(syncPeerId).toBeTruthy();
    expect(receivedLocalPeerId).toBe(syncPeerId);
  });

  test("renders live-board chrome without inline AVPermissionsPrompt", async () => {
    await renderWorkspace();
    expect(screen.queryByTestId("av-permissions-prompt")).toBeNull();
    expect(screen.getByTestId("mynk-wb-chrome")).toBeTruthy();
    expect(screen.getByTestId("wb-topbar-mic")).toBeTruthy();
    expect(screen.getByTestId("av-tiles-panel")).toBeTruthy();
    expect(screen.getByTestId("av-controls")).toBeTruthy();
  });

  test("tutor waiting room: on-page mic picker + dropdown boost/chime (no device picker in dropdown), exactly one meterBarRef host", async () => {
    await renderWorkspace({ initialSessionPhase: "PENDING" });

    expect(screen.getByTestId("wb-waiting-overlay")).toBeTruthy();
    expect(countMeterBarRefHosts()).toBe(1);
    // Both overlay WbTopBarMicControlLive and live top-bar WbTopBarMicControl
    // render wb-topbar-mic during PENDING; exactly one meterBarRef host (the live top bar).
    expect(screen.getAllByTestId("wb-topbar-mic")).toHaveLength(2);
    const overlay = screen.getByTestId("wb-waiting-overlay");
    expect(overlay.querySelector("[data-testid='wb-topbar-mic-toggle']")).toBeTruthy();
    expect(overlay.querySelector(".mynk-wb-mic-meter")).toBeTruthy();
    // Tutor: on-page AudioControls mic picker + recorder MicControls in dropdown (no device picker there).
    expect(
      overlay.querySelector("[data-testid='wb-waiting-overlay-device-pickers'] [data-testid='audio-device-select']")
    ).toBeTruthy();
    const overlaySettings = within(overlay).getByTestId("wb-topbar-mic-settings");
    expect(overlaySettings).toBeTruthy();
    await act(async () => {
      fireEvent.click(overlaySettings);
    });
    expect(within(overlay).getByTestId("mic-gain-slider")).toBeTruthy();
    expect(within(overlay).getByTestId("recording-chime-enabled")).toBeTruthy();
    expect(within(overlay).queryByTestId("mic-device-select")).toBeNull();
  });

  test("student waiting room: on-page mic picker + boost caret (no chime)", async () => {
    await renderWorkspace({
      role: "student",
      joinToken: "join-tok-1",
      initialSessionPhase: "PENDING",
    });

    const overlay = screen.getByTestId("wb-waiting-overlay");
    expect(
      overlay.querySelector(
        "[data-testid='wb-waiting-overlay-device-pickers'] [data-testid='audio-device-select']"
      )
    ).toBeTruthy();
    const overlaySettings = within(overlay).getByTestId("wb-topbar-mic-settings");
    expect(overlaySettings).toBeTruthy();
    await act(async () => {
      fireEvent.click(overlaySettings);
    });
    expect(within(overlay).getByTestId("mic-gain-slider")).toBeTruthy();
    expect(within(overlay).queryByTestId("recording-chime-enabled")).toBeNull();
    expect(within(overlay).queryByTestId("mic-device-select")).toBeNull();
    // Student has no WbTopBarMicControl — no meterBarRef hidden host.
    expect(countMeterBarRefHosts()).toBe(0);
  });

  test("tutor ACTIVE session: live top-bar mic control with meterBarRef host present", async () => {
    await renderWorkspace({ initialSessionPhase: "ACTIVE" });

    expect(screen.queryByTestId("wb-waiting-overlay")).toBeNull();
    expect(screen.getByTestId("wb-topbar-mic")).toBeTruthy();
    expect(screen.getByTestId("wb-topbar-mic-toggle")).toBeTruthy();
    expect(countMeterBarRefHosts()).toBe(1);
  });

  test("WS-I: tutor mic click calls setTutorRecordingMute(nextMuted) before toggleMic (overlay, PENDING)", async () => {
    // Guards against the pre-start mute gap: the recording-mute ref must be
    // set synchronously in the same wrapper turn as toggleMic so that
    // the mount-effect acquireMic graph-build reads the correct value.
    await renderWorkspace({ initialSessionPhase: "PENDING" });

    const overlay = screen.getByTestId("wb-waiting-overlay");
    const micToggle = overlay.querySelector<HTMLElement>("[data-testid='wb-topbar-mic-toggle']");
    expect(micToggle).toBeTruthy();

    // Track call ordering only for calls that happen during the click interaction.
    // (The effect at 2589 also calls setTutorRecordingMute on each render, so we
    // don't assert exact call count — we assert the handler's pair is ordered correctly.)
    const callOrder: string[] = [];
    setTutorRecordingMuteSpy.mockImplementation(() => { callOrder.push("setTutorRecordingMute"); });
    toggleMicSpy.mockImplementation(() => { callOrder.push("toggleMic"); });

    await act(async () => {
      fireEvent.click(micToggle!);
    });

    // The wrapper must have called setTutorRecordingMute(true) at least once.
    expect(setTutorRecordingMuteSpy).toHaveBeenCalledWith(true);
    // toggleMic must have been called.
    expect(toggleMicSpy).toHaveBeenCalled();
    // The FIRST setTutorRecordingMute in the callOrder is before the toggleMic
    // — this verifies the synchronous wrapper fires before the liveAv toggle.
    const firstSetMuteIdx = callOrder.indexOf("setTutorRecordingMute");
    const firstToggleMicIdx = callOrder.indexOf("toggleMic");
    expect(firstSetMuteIdx).toBeGreaterThanOrEqual(0);
    expect(firstToggleMicIdx).toBeGreaterThan(firstSetMuteIdx);
  });

  test("WS-I: tutor mic click calls setTutorRecordingMute(nextMuted) before toggleMic (top-bar, ACTIVE)", async () => {
    await renderWorkspace({ initialSessionPhase: "ACTIVE" });

    const micToggle = screen.getByTestId<HTMLElement>("wb-topbar-mic-toggle");

    const callOrder: string[] = [];
    setTutorRecordingMuteSpy.mockImplementation(() => { callOrder.push("setTutorRecordingMute"); });
    toggleMicSpy.mockImplementation(() => { callOrder.push("toggleMic"); });

    await act(async () => {
      fireEvent.click(micToggle);
    });

    expect(setTutorRecordingMuteSpy).toHaveBeenCalledWith(true);
    expect(toggleMicSpy).toHaveBeenCalled();
    const firstSetMuteIdx = callOrder.indexOf("setTutorRecordingMute");
    const firstToggleMicIdx = callOrder.indexOf("toggleMic");
    expect(firstSetMuteIdx).toBeGreaterThanOrEqual(0);
    expect(firstToggleMicIdx).toBeGreaterThan(firstSetMuteIdx);
  });

  test("3-peer canary: tutor + 2 students render distinct tiles AND each remote audioStream is attached to the tutor's recording mixdown", async () => {
    // May 15 redesign: instead of one MediaRecorder per peer
    // (which made the replay UI play whichever stream uploaded
    // first), every participant's audioStream gets summed into a
    // single tutor-side mixdown via Web Audio. The workspace's
    // contract is: for each participant with an audioStream,
    // call workspaceAudio.addRemoteAudio(stream) exactly once.
    const streamA = makeFakeAudioStream("stream-peer-A");
    const streamB = makeFakeAudioStream("stream-peer-B");
    liveAvState = {
      ...liveAvState,
      localAudioStream: makeFakeAudioStream("local"),
      hasMicPermission: "granted",
      participants: [
        makeParticipant("peer-A", { label: "Alex", audioStream: streamA }),
        makeParticipant("peer-B", { label: "Beth", audioStream: streamB }),
      ],
    };

    await renderWorkspace({
      initialHasConsentSnapshot: true,
      initialAllowAudioRecording: true,
      sessionMode: "LIVE",
    });

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

    // (b) addRemoteAudio was invoked exactly once per remote
    // participant with their audioStream. The mixdown contract.
    await waitFor(() => {
      expect(addRemoteAudioSpy).toHaveBeenCalledTimes(2);
    });
    const attachedStreams = addRemoteAudioSpy.mock.calls.map((c) => c[0]);
    expect(attachedStreams).toContain(streamA);
    expect(attachedStreams).toContain(streamB);
  });

  test("Gate E/F: tutor_only LIVE — remote streams skip mixdown attach; gain reconcile forces 0", async () => {
    const streamA = makeFakeAudioStream("stream-peer-A");
    liveAvState = {
      ...liveAvState,
      localAudioStream: makeFakeAudioStream("local"),
      hasMicPermission: "granted",
      participants: [
        makeParticipant("peer-A", { label: "Alex", audioStream: streamA }),
      ],
    };

    await renderWorkspace({
      initialHasConsentSnapshot: true,
      initialAllowAudioRecording: false,
      sessionMode: "LIVE",
    });

    await waitFor(() => {
      expect(setRemoteRecordingGainSpy).toHaveBeenCalled();
    });
    expect(addRemoteAudioSpy).not.toHaveBeenCalled();
    expect(setRemoteRecordingGainSpy).toHaveBeenCalledWith(streamA, 0);
  });

  test("student role: publish path only — no externalAudioStream from recorder and no addRemoteAudio mixdown", async () => {
    const tutorStream = makeFakeAudioStream("stream-tutor-remote");
    liveAvState = {
      ...liveAvState,
      localAudioStream: makeFakeAudioStream("student-local"),
      hasMicPermission: "granted",
      participants: [
        makeParticipant("peer-tutor", {
          role: "tutor",
          label: "Sarah",
          audioStream: tutorStream,
        }),
      ],
    };

    await renderWorkspace({
      role: "student",
      joinToken: "join-tok-1",
    });

    expect(receivedLiveAvOpts?.externalAudioStream).toBeUndefined();
    expect(receivedLiveAvOpts?.swapMicDevice).toBeUndefined();
    expect(addRemoteAudioSpy).not.toHaveBeenCalled();
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

  test("student sync-reconnect → mesh.restart for every current peer", async () => {
    liveAvState = {
      ...liveAvState,
      participants: [
        makeParticipant("peer-A"),
        makeParticipant("peer-B"),
      ],
    };

    await renderWorkspace({
      role: "student",
      joinToken: "join-tok-1",
    });
    await waitFor(() => {
      expect(createdSyncClients).toHaveLength(1);
    });
    const client = createdSyncClients[0];
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

  // ---------------------------------------------------------------
  // Fix 1 — Debounce gate: ICE blip must NOT pause recording
  //
  // Independent oracle: the `participants` set passed to evaluateLifecycle.
  // A non-empty set means the FSM sees a live peer; empty means it enters
  // the paused(all_participants_disconnected) state that pauses recording.
  //
  // Re-renders are triggered by changing peerCount (different integer
  // values), which causes React state to update without any side effects
  // on the things under test.
  // ---------------------------------------------------------------

  test("sub-debounce ICE disconnected blip does NOT empty lifecycleParticipants (recording stays armed)", async () => {
    jest.useFakeTimers();
    try {
      // Start with peer-A reachable.
      liveAvState = {
        ...liveAvState,
        participants: [makeParticipant("peer-A", { peerConnectionState: "connected" })],
      };

      await renderWorkspace();
      const client = createdSyncClients[0];

      // Establish sync connection.
      act(() => { client.__triggerConnect(); });
      act(() => { client.__triggerPeerCount(1); });
      // Flush the lifecycleParticipants debounce effect (adds peer-A immediately).
      act(() => { jest.advanceTimersByTime(0); });

      // Verify peer-A is in lifecycleParticipants before the blip.
      expect(lastLifecycleCall()?.participants.has("peer-A")).toBe(true);

      // --- Simulate ICE blip: peer-A becomes temporarily unreachable ---
      // Update liveAvState, then use peerCount=2 to force a re-render
      // (peerCount=1 → 2 changes state, avoiding the React same-value no-op).
      liveAvState = {
        ...liveAvState,
        participants: [makeParticipant("peer-A", { peerConnectionState: "disconnected" })],
      };
      act(() => { client.__triggerPeerCount(2); });
      // Debounce effect fires and schedules removal timer for peer-A.
      act(() => { jest.advanceTimersByTime(0); });

      // Advance just under the debounce window (4s < 8s).
      // The removal timer has NOT fired yet — peer-A must still be present.
      act(() => { jest.advanceTimersByTime(4000); });

      // Independent oracle: lifecycleParticipants must STILL contain peer-A.
      // The debounce window is suppressing the removal.
      expect(lastLifecycleCall()?.participants.has("peer-A")).toBe(true);

      // Advance PAST the debounce window (4 + 5 = 9s > 8s REACHABLE_LOSS_DEBOUNCE_MS).
      // The removal timer fires, setLifecycleParticipants removes peer-A,
      // and act() flushes the resulting React re-render.
      act(() => { jest.advanceTimersByTime(5000); });

      // After the debounce window, peer-A is removed — a sustained drop
      // DOES eventually pause recording (the desired behaviour).
      expect(lastLifecycleCall()?.participants.has("peer-A")).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("sub-debounce blip followed by recovery: peer recovers before window and lifecycleParticipants never empties", async () => {
    jest.useFakeTimers();
    try {
      liveAvState = {
        ...liveAvState,
        participants: [makeParticipant("peer-A", { peerConnectionState: "connected" })],
      };

      await renderWorkspace();
      const client = createdSyncClients[0];
      act(() => { client.__triggerConnect(); });
      act(() => { client.__triggerPeerCount(1); });
      act(() => { jest.advanceTimersByTime(0); }); // flush add effect

      expect(lastLifecycleCall()?.participants.has("peer-A")).toBe(true);

      // Blip: peer-A becomes unreachable. Force re-render via peerCount=2.
      liveAvState = {
        ...liveAvState,
        participants: [makeParticipant("peer-A", { peerConnectionState: "disconnected" })],
      };
      act(() => { client.__triggerPeerCount(2); });
      act(() => { jest.advanceTimersByTime(0); }); // flush — schedules 8s removal timer

      // 3s in — well within the 8s debounce window.
      act(() => { jest.advanceTimersByTime(3000); });
      // peer-A still present (timer hasn't fired).
      expect(lastLifecycleCall()?.participants.has("peer-A")).toBe(true);

      // Recovery: peer-A back to reachable before the window expires.
      // Force re-render via peerCount=3.
      liveAvState = {
        ...liveAvState,
        participants: [makeParticipant("peer-A", { peerConnectionState: "connected" })],
      };
      act(() => { client.__triggerPeerCount(3); });
      act(() => { jest.advanceTimersByTime(0); }); // flush — cancels removal timer, re-adds peer-A

      // Advance well past where the removal timer WOULD have fired.
      act(() => { jest.advanceTimersByTime(10000); });

      // peer-A must still be present — the timer was cancelled on recovery.
      expect(lastLifecycleCall()?.participants.has("peer-A")).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  // ---------------------------------------------------------------
  // Fix 2 — No false "disconnected/paused" during initial connect
  //
  // After Fix 2, everBothPresentRef latches on FIRST WebRTC reachability
  // (not sync-join). This prevents the false "Student disconnected" banner
  // that appeared for 1–3s between sync-join and ICE connected.
  //
  // Oracle: `everHadParticipants` in evaluateLifecycle inputs.
  // ---------------------------------------------------------------

  test("initial sync-join before WebRTC connected does NOT set everHadParticipants=true (no false paused banner)", async () => {
    // Start with no reachable participants (WebRTC not established).
    liveAvState = {
      ...liveAvState,
      participants: [],
    };

    await renderWorkspace();
    const client = createdSyncClients[0];

    // Sync socket connects + student joins sync relay (peerCount=1).
    // No WebRTC yet — liveAvState.participants stays empty.
    act(() => { client.__triggerConnect(); });
    act(() => { client.__triggerPeerCount(1); });
    await act(async () => { await Promise.resolve(); }); // flush effects

    // Oracle: everHadParticipants must be FALSE because no peer is WebRTC-reachable.
    // The latch must NOT fire on sync-join alone.
    const callAfterSyncJoin = lastLifecycleCall();
    expect(callAfterSyncJoin?.everHadParticipants).toBe(false);
    expect(callAfterSyncJoin?.participants.size).toBe(0);

    // --- Now WebRTC establishes: peer-A becomes reachable ---
    // Update liveAvState and force a re-render via peerCount=2
    // (peerCount 1→2 changes state, so the workspace re-renders and
    // useLiveAV mock returns the updated reachableParticipants).
    liveAvState = {
      ...liveAvState,
      participants: [makeParticipant("peer-A", { peerConnectionState: "connected" })],
    };
    act(() => { client.__triggerPeerCount(2); });
    await act(async () => { await Promise.resolve(); }); // flush lifecycleParticipants effect

    // Oracle: after WebRTC connects, everHadParticipants must latch TRUE.
    await waitFor(() => {
      const call = lastLifecycleCall();
      expect(call?.everHadParticipants).toBe(true);
      expect(call?.participants.has("peer-A")).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Live-video regression fix (2026-06-16): cluster cam button must
  // call requestCam() when no local video stream exists, not just
  // toggleCam() which is a no-op without a stream.
  // jsdom cannot prove real camera acquisition — these tests assert
  // the wiring contract only. Real camera smoke is in the browser.
  // ---------------------------------------------------------------

  test("cluster cam button calls requestCam (not toggleCam) when localVideoStream is null", async () => {
    // localVideoStream defaults to null — no camera stream acquired yet
    expect(liveAvState.localVideoStream).toBeNull();
    // Set a fake camera device so WbAVCluster does NOT mark the button camDisabled.
    // (Without a device, the cluster shows "Camera unavailable" and disables the button,
    //  which is correct hardware-absent behavior — not the regression we're testing.)
    liveAvVideoDevices = [makeFakeVideoDevice("cam1")];
    await renderWorkspace();

    // Mic/cam controls overlay the local preview tile (data-testid="av-controls").
    const avControls = screen.getByTestId("av-controls");
    const camBtn = within(avControls).getByRole("button", { name: /turn your camera on/i });

    await act(async () => {
      fireEvent.click(camBtn);
      await Promise.resolve();
    });

    // requestCam must be called (acquire path), toggleCam must NOT
    // (there is no stream to toggle on yet).
    expect(requestCamSpy).toHaveBeenCalledTimes(1);
    expect(toggleCamSpy).not.toHaveBeenCalled();
  });

  test("tutor camera picker (WbTopBarCamControl) is mounted and wired to setVideoCameraBySlot", async () => {
    await renderWorkspace();

    // WbTopBarCamControl renders with data-testid="wb-topbar-cam"
    const camControl = screen.getByTestId("wb-topbar-cam");
    expect(camControl).toBeTruthy();

    // The settings caret opens the VideoControls popover
    const caretBtn = screen.getByTestId("wb-topbar-cam-settings");
    await act(async () => {
      fireEvent.click(caretBtn);
    });

    // VideoControls renders with data-testid="video-controls"
    expect(screen.getByTestId("video-controls")).toBeTruthy();
  });

  test("after WebRTC established then dropped, everHadParticipants stays true (correct paused-disconnected state)", async () => {
    // Prove the complementary case: once the latch fires (call established),
    // it remains true even after the peer drops — the workspace correctly
    // enters the paused(all_participants_disconnected) state, not the
    // armed/waiting-for-first-join state.
    jest.useFakeTimers();
    try {
      // Start with peer-A reachable.
      liveAvState = {
        ...liveAvState,
        participants: [makeParticipant("peer-A", { peerConnectionState: "connected" })],
      };

      await renderWorkspace();
      const client = createdSyncClients[0];
      act(() => { client.__triggerConnect(); });
      act(() => { client.__triggerPeerCount(1); });
      act(() => { jest.advanceTimersByTime(0); }); // flush add effect

      // Latch must be set (peer-A was reachable).
      expect(lastLifecycleCall()?.everHadParticipants).toBe(true);

      // Drop: peer-A becomes unreachable. Force re-render via peerCount=2.
      liveAvState = {
        ...liveAvState,
        participants: [makeParticipant("peer-A", { peerConnectionState: "failed" })],
      };
      act(() => { client.__triggerPeerCount(2); });
      act(() => { jest.advanceTimersByTime(0); }); // flush — schedules 8s removal timer

      // Advance past debounce: removal timer fires, peer-A removed.
      act(() => { jest.advanceTimersByTime(10000); });

      // Oracle: everHadParticipants is STILL true — the latch is sticky.
      const callAfterDrop = lastLifecycleCall();
      expect(callAfterDrop?.everHadParticipants).toBe(true);
      // And participants is now empty (debounce expired — correct drop detected).
      expect(callAfterDrop?.participants.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("WS-U-FRAGILE 2.4/2.5 — tutor top-bar presentation", () => {
  test("recording pill reflects FSM pillLabel when awaiting student (not hardcoded LIVE)", async () => {
    await renderWorkspace({
      initialSessionPhase: "ACTIVE",
      initialUserWantsRecording: true,
      initialHasConsentSnapshot: true,
      initialAllowAudioRecording: true,
      sessionMode: "LIVE",
    });

    const syncClient = createdSyncClients[0]!;
    await act(async () => {
      syncClient.__triggerConnect();
      await Promise.resolve();
    });

    const pill = screen.getByTestId("wb-recording-pill");
    expect(pill).toHaveTextContent("Waiting for student");
    expect(pill.textContent?.trim()).not.toBe("LIVE");
    expect(pill.classList.contains("mynk-wb-live-badge--amber")).toBe(true);
  });

  test("recording pill shows Recording when actively capturing (no-sync path)", async () => {
    await renderWorkspace({
      initialSessionPhase: "ACTIVE",
      initialUserWantsRecording: true,
      initialHasConsentSnapshot: true,
      initialAllowAudioRecording: true,
      sessionMode: "IN_PERSON",
      syncUrl: "",
    });

    const pill = screen.getByTestId("wb-recording-pill");
    expect(pill).toHaveTextContent("Recording");
    expect(pill.textContent?.trim()).not.toBe("LIVE");
    expect(pill.classList.contains("mynk-wb-live-badge--amber")).toBe(false);
    expect(pill.classList.contains("mynk-wb-live-badge--grey")).toBe(false);
  });

  test("sync pill is visually visible when sync transport is connecting", async () => {
    await renderWorkspace({
      initialSessionPhase: "ACTIVE",
      initialUserWantsRecording: true,
      initialHasConsentSnapshot: true,
      initialAllowAudioRecording: true,
      sessionMode: "LIVE",
    });

    const syncPill = screen.getByTestId("wb-sync-pill");
    expect(syncPill).toHaveTextContent("Sync connecting…");
    expect(syncPill.classList.contains("mynk-wb-sr-only")).toBe(false);
    expect(syncPill.classList.contains("mynk-wb-sync-pill")).toBe(true);
    expect(syncPill.classList.contains("mynk-wb-sync-pill--grey")).toBe(true);
  });
});

describe("WhiteboardWorkspaceClient active-ping role guard (SMOKE-BUG-1)", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.Mock;

  function activePingCalls(): unknown[][] {
    return fetchMock.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("/active-ping")
    );
  }

  beforeEach(() => {
    fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/active-ping")) {
        return {
          ok: true,
          json: async () => ({ activeMs: 0, lastActiveAt: null }),
        } as Response;
      }
      if (url.includes("/timer-anchor") || url.includes("/join-timer")) {
        return {
          ok: true,
          json: async () => ({ activeMs: 0, lastActiveAt: null, live: true }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("student does NOT POST /active-ping (uses join-timer instead)", async () => {
    await renderWorkspace({
      role: "student",
      joinToken: "join-tok-1",
      initialSessionPhase: "ACTIVE",
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          (call) => typeof call[0] === "string" && call[0].includes("/join-timer")
        )
      ).toBe(true);
    });

    expect(activePingCalls()).toHaveLength(0);
  });

  test("tutor POSTs /active-ping on mount", async () => {
    await renderWorkspace({ initialSessionPhase: "ACTIVE" });

    await waitFor(() => {
      expect(activePingCalls().length).toBeGreaterThan(0);
    });
  });
});
