/**
 * @jest-environment jsdom
 */

import React, { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import {
  deriveAudioCapturePolicy,
  resolveRemoteRecordingGainLinear,
  shouldAttachRemoteStreamToRecordingMixdown,
  type AudioCapturePolicy,
} from "@/lib/recording/audio-capture-policy";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";

const mockUnsubscribe = jest.fn();
const mockSubscribe = jest.fn(() => mockUnsubscribe);
const mockObserve = jest.fn(() => ({
  getState: () => ({
    state: "idle" as const,
    inFlightStreamCount: 0,
    byStream: new Map<string, number>(),
    lastError: null,
  }),
  subscribe: mockSubscribe,
}));
const mockDraftClear = jest.fn<Promise<void>, [string, string]>(
  async () => undefined
);
const mockDraftFindInProgress = jest.fn<Promise<unknown>, [string, string]>(
  async () => null
);
const mockOutboxEnqueue = jest.fn<Promise<void>, [unknown]>(
  async () => undefined
);
const capturedRecorderOptions: Array<Record<string, unknown>> = [];
const capturedWhiteboardRecorderOptions: Array<Record<string, unknown>> = [];

jest.mock("@/lib/recording/upload-outbox-instance", () => ({
  drainOutboxOrTimeout: jest.fn(),
  assembleEndSessionSegments: jest.fn(async () => []),
  finalizeOutboxAfterEnd: jest.fn(),
  registerSessionStudentId: jest.fn(),
  getOrCreateUploadOutbox: () => ({
    observe: mockObserve,
    drainAndAwait: jest.fn(async () => ({
      timedOut: false,
      remainingCount: 0,
      remainingByStream: new Map<string, number>(),
      lastError: null,
    })),
    enqueue: (args: unknown) => mockOutboxEnqueue(args),
  }),
}));

jest.mock("@/lib/recording/recording-draft-store", () => ({
  getOrCreateRecordingDraftStore: () => ({
    clear: (sessionId: string, streamId: string) =>
      mockDraftClear(sessionId, streamId),
    findInProgress: (sessionId: string, streamId: string) =>
      mockDraftFindInProgress(sessionId, streamId),
    assemble: jest.fn(),
    checkpoint: jest.fn(),
  }),
}));

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
    isConnected: () => false,
    broadcastScene: jest.fn(),
    flushPendingBroadcast: jest.fn(),
  })),
  generateEncryptionKeyBase64Url: () => "test-integration-key-16chars-min",
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  useParams: () => ({}),
}));
jest.mock("@/lib/whiteboard/upload", () => ({
  uploadWhiteboardEvents: jest.fn(),
  uploadWhiteboardSnapshot: jest.fn(),
}));
jest.mock("@/lib/whiteboard/snapshot-png", () => ({
  generateSessionSnapshotPng: jest.fn(),
}));
jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  endWhiteboardSession: jest.fn(),
  issueJoinToken: jest.fn(),
  enqueueChunkTranscriptionAction: jest.fn(),
  revokeJoinTokensForSession: jest.fn(),
  startWhiteboardSession: jest.fn(),
  registerWhiteboardSessionAudioSegmentAction: jest.fn(),
}));
jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  kickSessionChunksAction: jest.fn(),
  triggerNotesGenerationAction: jest.fn(),
}));
jest.mock("@/hooks/useWhiteboardRecorder", () => ({
  useWhiteboardRecorder: (opts: Record<string, unknown>) => {
    capturedWhiteboardRecorderOptions.push(opts);
    return {
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
  };
  },
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
    setMicDevice: jest.fn(),
  }),
}));
jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: () => <div data-testid="wb-mock-excalidraw-canvas" />,
}));

jest.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: (opts: Record<string, unknown>) => {
    capturedRecorderOptions.push(opts);
    return {
      state: "ready",
      uploadMode: null,
      elapsed: 0,
      segmentNumber: 1,
      doneSegmentSeconds: 0,
      localMicStream: null,
      addRemoteAudio: () => () => {},
      setRemoteRecordingGain: () => {},
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
      swapMicDevice: jest.fn(() => Promise.resolve()),
      swapMicDeviceBySlot: jest.fn(() => Promise.resolve()),
    };
  },
}));

import { WhiteboardWorkspaceAudioBridge } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge";
import { WhiteboardWorkspaceClient } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient";
import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";

function mockWorkspaceAudio(
  overrides: Partial<UseAudioRecorderReturn> = {}
): UseAudioRecorderReturn {
  return {
    state: "ready",
    uploadMode: null,
    elapsed: 0,
    segmentNumber: 1,
    doneSegmentSeconds: 0,
    localMicStream: null,
    addRemoteAudio: () => () => {},
    setRemoteRecordingGain: () => {},
    devices: [],
    selectedDeviceId: "",
    pickedMicSlot: 0,
    gainLinear: 1,
    setGainLinear: jest.fn(),
    chimeEnabled: false,
    setChimeEnabled: jest.fn(),
    chimeVolume: 0.5,
    setChimeVolume: jest.fn(),
    permissionState: "granted",
    error: null,
    isLive: true,
    lockDevice: true,
    isWarning: false,
    meterBarRef: createRef<HTMLDivElement>(),
    handleStartRecording: jest.fn(),
    handleDeviceChange: jest.fn(),
    handleMicSlotChange: jest.fn(),
    pauseRecording: jest.fn(),
    resumeRecording: jest.fn(),
    stopAndUpload: jest.fn(),
    handleReset: jest.fn(),
    flushPendingUploads: jest.fn(() => Promise.resolve()),
    swapMicDevice: jest.fn(() => Promise.resolve()),
    swapMicDeviceBySlot: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("deriveAudioCapturePolicy", () => {
  it.each<
    [
      string,
      Parameters<typeof deriveAudioCapturePolicy>[0],
      AudioCapturePolicy,
    ]
  >([
    [
      "consented LIVE → full",
      {
        allowAudioRecording: true,
        hasConsentSnapshot: true,
        sessionMode: "LIVE",
      },
      "full",
    ],
    [
      "consented IN_PERSON → full",
      {
        allowAudioRecording: true,
        hasConsentSnapshot: true,
        sessionMode: "IN_PERSON",
      },
      "full",
    ],
    [
      "denied IN_PERSON → none",
      {
        allowAudioRecording: false,
        hasConsentSnapshot: true,
        sessionMode: "IN_PERSON",
      },
      "none",
    ],
    [
      "denied LIVE → tutor_only",
      {
        allowAudioRecording: false,
        hasConsentSnapshot: true,
        sessionMode: "LIVE",
      },
      "tutor_only",
    ],
    [
      "no snapshot LIVE → none",
      {
        allowAudioRecording: null,
        hasConsentSnapshot: false,
        sessionMode: "LIVE",
      },
      "none",
    ],
    [
      "no snapshot IN_PERSON → none",
      {
        allowAudioRecording: null,
        hasConsentSnapshot: false,
        sessionMode: "IN_PERSON",
      },
      "none",
    ],
  ])("%s", (_label, input, expected) => {
    expect(deriveAudioCapturePolicy(input)).toBe(expected);
  });
});

describe("remote-surgical mixdown gates E/F (pure helpers)", () => {
  test("Gate E: shouldAttachRemoteStreamToRecordingMixdown — only full attaches", () => {
    expect(shouldAttachRemoteStreamToRecordingMixdown("full")).toBe(true);
    expect(shouldAttachRemoteStreamToRecordingMixdown("tutor_only")).toBe(
      false
    );
    expect(shouldAttachRemoteStreamToRecordingMixdown("none")).toBe(false);
  });

  test("Gate F: resolveRemoteRecordingGainLinear — tutor_only forces 0", () => {
    const muted = new Set(["peer-muted"]);
    expect(
      resolveRemoteRecordingGainLinear("tutor_only", "peer-student", muted)
    ).toBe(0);
    expect(
      resolveRemoteRecordingGainLinear("tutor_only", "peer-other", new Set())
    ).toBe(0);
  });

  test("Gate F: resolveRemoteRecordingGainLinear — full respects moderation set", () => {
    const muted = new Set(["peer-muted"]);
    expect(
      resolveRemoteRecordingGainLinear("full", "peer-muted", muted)
    ).toBe(0);
    expect(
      resolveRemoteRecordingGainLinear("full", "peer-live", muted)
    ).toBe(1);
  });

  test("Gate F: resolveRemoteRecordingGainLinear — none leaves gain at 1 (attach blocked upstream)", () => {
    expect(
      resolveRemoteRecordingGainLinear("none", "peer-student", new Set())
    ).toBe(1);
  });
});

describe("WhiteboardWorkspaceAudioBridge consent gate A", () => {
  beforeEach(() => {
    mockObserve.mockClear();
    mockSubscribe.mockClear();
  });

  test("policy=none blocks handleStartRecording even when recordingActive", () => {
    const handleStartRecording = jest.fn();
    const audio = mockWorkspaceAudio({ handleStartRecording });

    render(
      <WhiteboardWorkspaceAudioBridge
        audio={audio}
        whiteboardSessionId="wbs-gate-a"
        userWantsRecording
        recordingActive
        audioCapturePolicy="none"
      />
    );

    expect(handleStartRecording).not.toHaveBeenCalled();
  });

  test("policy=full reaches handleStartRecording when recordingActive", () => {
    const handleStartRecording = jest.fn();
    const audio = mockWorkspaceAudio({ handleStartRecording });

    render(
      <WhiteboardWorkspaceAudioBridge
        audio={audio}
        whiteboardSessionId="wbs-gate-a-full"
        userWantsRecording
        recordingActive
        audioCapturePolicy="full"
      />
    );

    expect(handleStartRecording).toHaveBeenCalled();
  });
});

const baseWorkspaceProps = {
  whiteboardSessionId: "wbs-consent-test",
  studentId: "stu-1",
  studentName: "Test Student",
  adminUserId: "admin-1",
  startedAtIso: "2026-06-01T10:00:00.000Z",
  bothConnectedAtIso: null,
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
  syncUrl: null,
  initialUserWantsRecording: true,
  initialSessionPhase: "ACTIVE" as const,
  sessionMode: "LIVE",
};

describe("WhiteboardWorkspaceClient consent gates D/K", () => {
  beforeEach(() => {
    capturedRecorderOptions.length = 0;
    capturedWhiteboardRecorderOptions.length = 0;
    mockDraftClear.mockClear();
    mockDraftFindInProgress.mockClear();
    mockOutboxEnqueue.mockClear();
    mockDraftFindInProgress.mockResolvedValue({
      sessionId: "wbs-consent-test",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-pre-block-b",
      mimeType: "audio/webm",
      chunkCount: 3,
      estimatedDurationSec: 12,
      firstChunkMs: 1000,
      chunks: [],
    });
  });

  test("T-new-G: policy=none clears IDB draft on mount and skips recovery scan", async () => {
    render(
      <WhiteboardWorkspaceClient
        {...baseWorkspaceProps}
        initialHasConsentSnapshot={false}
        initialAllowAudioRecording={null}
      />
    );

    await waitFor(() => {
      expect(mockDraftClear).toHaveBeenCalledWith(
        "wbs-consent-test",
        TUTOR_MIC_STREAM_ID
      );
    });

    expect(screen.getByTestId("wb-audio-consent-draft-cleared")).toBeInTheDocument();
    expect(mockDraftFindInProgress).not.toHaveBeenCalled();
    expect(mockOutboxEnqueue).not.toHaveBeenCalled();

    const lastOpts = capturedRecorderOptions.at(-1);
    expect(lastOpts?.recordingDraft).toBeUndefined();
  });

  test("policy=full passes recordingDraft to useAudioRecorder (positive path)", () => {
    render(
      <WhiteboardWorkspaceClient
        {...baseWorkspaceProps}
        initialHasConsentSnapshot={true}
        initialAllowAudioRecording={true}
      />
    );

    const lastOpts = capturedRecorderOptions.at(-1);
    expect(lastOpts?.recordingDraft).toEqual({
      sessionId: "wbs-consent-test",
      streamId: TUTOR_MIC_STREAM_ID,
    });
  });

  test("CF-2: policy=none still passes wbEventsActive to useWhiteboardRecorder", () => {
    render(
      <WhiteboardWorkspaceClient
        {...baseWorkspaceProps}
        initialSessionPhase="ACTIVE"
        initialHasConsentSnapshot={true}
        initialAllowAudioRecording={false}
        sessionMode="IN_PERSON"
      />
    );

    const lastWbOpts = capturedWhiteboardRecorderOptions.at(-1);
    expect(lastWbOpts?.recordingActive).toBe(true);
  });
});

describe("WhiteboardWorkspaceClient audio-consent banner", () => {
  beforeEach(() => {
    capturedRecorderOptions.length = 0;
    mockDraftClear.mockClear();
    mockDraftFindInProgress.mockClear();
    mockDraftFindInProgress.mockResolvedValue(null);
  });

  test("policy=none + no snapshot shows recording-off copy", () => {
    render(
      <WhiteboardWorkspaceClient
        {...baseWorkspaceProps}
        initialSessionPhase="PENDING"
        initialHasConsentSnapshot={false}
        initialAllowAudioRecording={null}
      />
    );

    const banner = screen.getByTestId("wb-audio-consent-banner");
    expect(banner).toHaveTextContent("Recording & notes off");
    expect(banner).toHaveTextContent(
      "no audio consent on file for this student"
    );
    expect(banner).toHaveTextContent("Parent setup may be required");
  });

  test("policy=none + denied consent shows in-person denied copy", () => {
    render(
      <WhiteboardWorkspaceClient
        {...baseWorkspaceProps}
        initialSessionPhase="PENDING"
        initialHasConsentSnapshot={true}
        initialAllowAudioRecording={false}
        sessionMode="IN_PERSON"
      />
    );

    const banner = screen.getByTestId("wb-audio-consent-banner");
    expect(banner).toHaveTextContent("Audio not recorded");
    expect(banner).toHaveTextContent(
      "parent has not allowed session audio"
    );
    expect(banner).not.toHaveTextContent("Recording & notes off");
  });

  test("policy=tutor_only + active session shows student-audio-off copy", () => {
    render(
      <WhiteboardWorkspaceClient
        {...baseWorkspaceProps}
        initialSessionPhase="ACTIVE"
        initialHasConsentSnapshot={true}
        initialAllowAudioRecording={false}
        sessionMode="LIVE"
      />
    );

    const banner = screen.getByTestId("wb-audio-consent-banner");
    expect(banner).toHaveTextContent("Student audio not recorded");
    expect(banner).toHaveTextContent(
      "only your microphone is included in the recording and notes"
    );
  });

  test("policy=tutor_only + waiting room hides banner", () => {
    render(
      <WhiteboardWorkspaceClient
        {...baseWorkspaceProps}
        initialSessionPhase="PENDING"
        initialHasConsentSnapshot={true}
        initialAllowAudioRecording={false}
        sessionMode="LIVE"
      />
    );

    expect(
      screen.queryByTestId("wb-audio-consent-banner")
    ).not.toBeInTheDocument();
  });

  test("policy=full does not render consent banner", () => {
    render(
      <WhiteboardWorkspaceClient
        {...baseWorkspaceProps}
        initialHasConsentSnapshot={true}
        initialAllowAudioRecording={true}
      />
    );

    expect(
      screen.queryByTestId("wb-audio-consent-banner")
    ).not.toBeInTheDocument();
  });

  test("student role never sees consent banner", () => {
    render(
      <WhiteboardWorkspaceClient
        {...baseWorkspaceProps}
        role="student"
        initialHasConsentSnapshot={false}
        initialAllowAudioRecording={null}
      />
    );

    expect(
      screen.queryByTestId("wb-audio-consent-banner")
    ).not.toBeInTheDocument();
  });
});
