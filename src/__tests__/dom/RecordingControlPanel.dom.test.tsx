/**
 * @jest-environment jsdom
 */

import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordingControlPanel from "@/components/recording/RecordingControlPanel";
import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";

function recorderFixture(
  overrides: Partial<UseAudioRecorderReturn> = {}
): UseAudioRecorderReturn {
  return {
    state: "idle",
    uploadMode: null,
    elapsed: 0,
    sessionElapsed: 0,
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
    chimeEnabled: true,
    setChimeEnabled: jest.fn(),
    chimeVolume: 0.6,
    setChimeVolume: jest.fn(),
    permissionState: "unknown",
    error: null,
    isLive: false,
    lockDevice: false,
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

describe("RecordingControlPanel", () => {
  test("idle: same shell as MainPanel — panel, mic cluster, start enabled", () => {
    const deniedHint =
      "Microphone access is blocked for this site. Click the icon left of the address bar (lock or sliders), set Microphone to Allow, then reload.";
    const r = recorderFixture({
      permissionState: "denied",
    });
    render(<RecordingControlPanel recorder={r} />);
    expect(screen.getByTestId("audio-record-panel")).toBeInTheDocument();
    expect(screen.getByTestId("mic-controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
    expect(screen.getByText(deniedHint)).toBeInTheDocument();
  });

  test("delegates disabled to MainPanel start", () => {
    const r = recorderFixture();
    render(<RecordingControlPanel recorder={r} disabled />);
    expect(
      screen.getByRole("button", { name: /start recording/i })
    ).toBeDisabled();
  });

  test("clicking Start forwards to handleStartRecording", async () => {
    const handleStartRecording = jest.fn();
    const r = recorderFixture({ handleStartRecording });
    render(<RecordingControlPanel recorder={r} />);
    await userEvent.click(screen.getByRole("button", { name: /start recording/i }));
    expect(handleStartRecording).toHaveBeenCalledTimes(1);
  });

  test("recording: shows timer strip and control cluster", () => {
    const r = recorderFixture({
      state: "recording",
      isLive: true,
      lockDevice: true,
      elapsed: 65,
      segmentNumber: 3,
    });
    render(<RecordingControlPanel recorder={r} />);
    expect(screen.getByLabelText(/Segment 3, duration 01:05/i)).toBeInTheDocument();
    expect(screen.getByTestId("audio-record-controls")).toBeInTheDocument();
  });
});
