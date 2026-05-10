/**
 * @jest-environment jsdom
 */

import { createRef } from "react";
import { render, screen } from "@testing-library/react";
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
  test("mounts RecordingControlPanel — mic picker, meter, segment timer", () => {
    const pendingRef = { current: [] as Promise<void>[] };
    const audio = mockWorkspaceAudio();

    render(
      <WhiteboardWorkspaceAudioBridge
        audio={audio}
        pendingSegmentTasksRef={pendingRef}
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
});
