/**
 * @jest-environment jsdom
 */

import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WbTopBarMicControl } from "@/components/whiteboard/chrome/WbTopBarMicControl";
import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";

function audioFixture(
  overrides: Partial<UseAudioRecorderReturn> = {}
): UseAudioRecorderReturn {
  return {
    state: "recording",
    uploadMode: null,
    elapsed: 0,
    sessionElapsed: 0,
    segmentNumber: 1,
    doneSegmentSeconds: 0,
    localMicStream: {} as MediaStream,
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
    permissionState: "granted",
    error: null,
    isLive: true,
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

describe("WbTopBarMicControl", () => {
  test("live top-bar mic dropdown retains the device picker (live board has no on-page picker)", async () => {
    const user = userEvent.setup();
    const devices = [
      { deviceId: "a", label: "Built-in Mic", kind: "audioinput", groupId: "g" },
    ] as unknown as MediaDeviceInfo[];

    render(
      <WbTopBarMicControl
        audio={audioFixture({ devices, pickedMicSlot: 0 })}
        isMicMuted={false}
        onToggleMute={jest.fn()}
        onAcquireMic={jest.fn()}
      />
    );

    await user.click(screen.getByTestId("wb-topbar-mic-settings"));

    const popover = screen.getByRole("dialog", { name: /microphone settings/i });
    expect(popover).toBeTruthy();
    // Regression guard: MicControls must render without hideDevicePicker on the live top bar.
    expect(screen.getByTestId("mic-device-select")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /microphone device/i })).toBeTruthy();
  });
});
