/**
 * @jest-environment jsdom
 */

import { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MicControls, { meterColor } from "@/components/recording/MicControls";

function baseProps(overrides: Partial<React.ComponentProps<typeof MicControls>> = {}) {
  return {
    meterBarRef: createRef<HTMLDivElement>(),
    devices: [] as MediaDeviceInfo[],
    selectedPickerSlot: 0,
    onPickMicSlot: jest.fn(),
    gainLinear: 1.0,
    onGainChange: jest.fn(),
    isLive: false,
    lockDevice: false,
    chimeEnabled: true,
    onChimeEnabledChange: jest.fn(),
    chimeVolume: 0.6,
    onChimeVolumeChange: jest.fn(),
    ...overrides,
  };
}

describe("MicControls", () => {
  test("placeholder option when no devices and not live: prompts to allow mic", () => {
    render(<MicControls {...baseProps()} />);
    expect(screen.getByRole("combobox", { name: /microphone device/i })).toBeDisabled();
    expect(screen.getByText(/allow mic access to choose/i)).toBeInTheDocument();
  });

  test("placeholder option when no devices but live: shows default mic", () => {
    render(<MicControls {...baseProps({ isLive: true })} />);
    // Picker is enabled because we're live (even with no enumerated devices yet)
    expect(screen.getByRole("combobox", { name: /microphone device/i })).not.toBeDisabled();
    expect(screen.getByText(/default microphone/i)).toBeInTheDocument();
  });

  test("renders enumerated devices and changing fires onPickMicSlot with the slot index", () => {
    const onPickMicSlot = jest.fn();
    const devices = [
      { deviceId: "a", label: "Built-in Mic", kind: "audioinput", groupId: "g" },
      { deviceId: "b", label: "USB Mic", kind: "audioinput", groupId: "g" },
    ] as unknown as MediaDeviceInfo[];
    render(
      <MicControls
        {...baseProps({ devices, selectedPickerSlot: 0, isLive: true, onPickMicSlot })}
      />
    );
    const select = screen.getByRole("combobox", { name: /microphone device/i });
    fireEvent.change(select, { target: { value: "1" } });
    expect(onPickMicSlot).toHaveBeenCalledWith(1);
  });

  test("device picker is disabled when locked, even if devices exist", () => {
    const devices = [
      { deviceId: "a", label: "Built-in Mic", kind: "audioinput", groupId: "g" },
    ] as unknown as MediaDeviceInfo[];
    render(
      <MicControls
        {...baseProps({ devices, selectedPickerSlot: 0, isLive: true, lockDevice: true })}
      />
    );
    expect(screen.getByRole("combobox", { name: /microphone device/i })).toBeDisabled();
  });

  test("gain slider is disabled when not live, enabled when live", () => {
    const { rerender } = render(<MicControls {...baseProps()} />);
    expect(screen.getByRole("slider", { name: /browser boost/i })).toBeDisabled();
    rerender(<MicControls {...baseProps({ isLive: true })} />);
    expect(screen.getByRole("slider", { name: /browser boost/i })).not.toBeDisabled();
  });

  test("gain slider change fires onGainChange with the parsed float", () => {
    const onGainChange = jest.fn();
    render(<MicControls {...baseProps({ isLive: true, onGainChange })} />);
    fireEvent.change(screen.getByRole("slider", { name: /browser boost/i }), {
      target: { value: "1.5" },
    });
    expect(onGainChange).toHaveBeenCalledWith(1.5);
  });

  test("chime checkbox toggles onChimeEnabledChange", () => {
    const onChimeEnabledChange = jest.fn();
    render(<MicControls {...baseProps({ onChimeEnabledChange })} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /sound alert/i }));
    expect(onChimeEnabledChange).toHaveBeenCalledWith(false);
  });

  test("chime volume slider is disabled when chimeEnabled is false", () => {
    render(<MicControls {...baseProps({ chimeEnabled: false })} />);
    expect(screen.getByRole("slider", { name: /time alert volume/i })).toBeDisabled();
  });

  test("time alert volume label and interval hint use segment-policy constants", () => {
    render(<MicControls {...baseProps()} />);
    expect(screen.getByText("Time alert volume:")).toBeInTheDocument();
    expect(screen.queryByText("Volume:")).toBeNull();
    const hint = screen.getByTestId("recording-time-alert-hint");
    expect(hint).toHaveTextContent(/5 minutes/i);
    expect(hint).toHaveTextContent(/each hour of session time/i);
  });

  test("hint text renders below the controls when provided", () => {
    render(<MicControls {...baseProps({ hint: "Mic is busy elsewhere" })} />);
    expect(screen.getByText("Mic is busy elsewhere")).toBeInTheDocument();
  });

  test("hideDevicePicker omits device select but keeps boost and chime controls", () => {
    const devices = [
      { deviceId: "a", label: "Built-in Mic", kind: "audioinput", groupId: "g" },
    ] as unknown as MediaDeviceInfo[];
    render(
      <MicControls
        {...baseProps({ devices, selectedPickerSlot: 0, isLive: true, hideDevicePicker: true })}
      />
    );
    expect(screen.queryByTestId("mic-device-select")).toBeNull();
    expect(screen.getByTestId("mic-gain-slider")).toBeInTheDocument();
    expect(screen.getByTestId("recording-chime-enabled")).toBeInTheDocument();
  });
});

describe("meterColor", () => {
  test("returns red for very loud", () => {
    expect(meterColor(0.9)).toMatch(/error|dc2626/);
  });
  test("returns amber-ish for medium loud", () => {
    expect(meterColor(0.6)).toBe("var(--meter-loud)");
  });
  test("returns success/green for talking-range", () => {
    expect(meterColor(0.2)).toMatch(/success|16a34a/);
  });
  test("returns muted/grey for ~silent", () => {
    expect(meterColor(0.01)).toMatch(/muted|9ca3af/);
  });
});
