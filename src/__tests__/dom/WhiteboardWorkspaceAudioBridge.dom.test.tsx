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
    pauseRecording: jest.fn(),
    resumeRecording: jest.fn(),
    stopAndUpload: jest.fn(),
    handleReset: jest.fn(),
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

  test("mounts RecordingControlPanel — mic picker, meter, segment timer", () => {
    const audio = mockWorkspaceAudio();

    render(
      <WhiteboardWorkspaceAudioBridge
        audio={audio}
        whiteboardSessionId="wbs-test-1"
        userWantsRecording
        recordingActive
      />
    );

    expect(screen.getByTestId("mic-device-select")).toBeInTheDocument();
    expect(screen.getByTestId("mic-level-meter")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Segment 2, duration 00:42/i)
    ).toBeInTheDocument();
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
