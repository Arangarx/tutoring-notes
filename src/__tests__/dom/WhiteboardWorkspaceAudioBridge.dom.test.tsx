/**
 * @jest-environment jsdom
 */

import { createRef } from "react";
import { render, screen } from "@testing-library/react";

// Stub the outbox singleton BEFORE importing the bridge — the bridge's
// effect calls `getOrCreateUploadOutbox()` on mount, which would throw
// without IndexedDB in JSDOM.
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
const mockDrainAndAwait = jest.fn(async () => ({
  timedOut: false,
  remainingCount: 0,
  remainingByStream: new Map<string, number>(),
  lastError: null,
}));

jest.mock("@/lib/recording/upload-outbox-instance", () => ({
  getOrCreateUploadOutbox: () => ({
    observe: mockObserve,
    drainAndAwait: mockDrainAndAwait,
  }),
}));

import { WhiteboardWorkspaceAudioBridge } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge";
import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";

function mockWorkspaceAudio(
  overrides: Partial<UseAudioRecorderReturn> = {}
): UseAudioRecorderReturn {
  return {
    state: "recording",
    uploadMode: null,
    elapsed: 42,
    segmentNumber: 2,
    doneSegmentSeconds: 0,
    localMicStream: null,
    addRemoteAudio: () => () => {},
    setRemoteRecordingGain: () => {},
    devices: [
      {
        deviceId: "dev-mock-1",
        kind: "audioinput",
        label: "Mock classroom mic",
        groupId: "g1",
        toJSON: () => ({}),
      } as MediaDeviceInfo,
    ],
    selectedDeviceId: "dev-mock-1",
    pickedMicSlot: 0,
    gainLinear: 1,
    setGainLinear: jest.fn(),
    chimeEnabled: true,
    setChimeEnabled: jest.fn(),
    chimeVolume: 0.6,
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

describe("WhiteboardWorkspaceAudioBridge", () => {
  beforeEach(() => {
    mockObserve.mockClear();
    mockSubscribe.mockClear();
    mockUnsubscribe.mockClear();
    mockDrainAndAwait.mockClear();
  });

  test("headless by default — no visible RecordingControlPanel on live board", () => {
    const audio = mockWorkspaceAudio();

    const { container } = render(
      <WhiteboardWorkspaceAudioBridge
        audio={audio}
        whiteboardSessionId="wbs-test-1"
        userWantsRecording
        recordingActive
      />
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("mic-device-select")).not.toBeInTheDocument();
  });

  test("showPanel renders RecordingControlPanel for legacy surfaces", () => {
    const audio = mockWorkspaceAudio();

    render(
      <WhiteboardWorkspaceAudioBridge
        audio={audio}
        whiteboardSessionId="wbs-test-panel"
        userWantsRecording
        recordingActive
        showPanel
      />
    );

    expect(screen.getByTestId("mic-device-select")).toBeInTheDocument();
    expect(screen.getByTestId("mic-level-meter")).toBeInTheDocument();
  });

  test("subscribes to outbox.observe(whiteboardSessionId) on mount", () => {
    const audio = mockWorkspaceAudio();
    render(
      <WhiteboardWorkspaceAudioBridge
        audio={audio}
        whiteboardSessionId="wbs-test-observe"
        userWantsRecording
        recordingActive
      />
    );

    expect(mockObserve).toHaveBeenCalledWith("wbs-test-observe");
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });
});
