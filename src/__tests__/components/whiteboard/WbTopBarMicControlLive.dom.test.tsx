/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WbTopBarMicControlLive } from "@/components/whiteboard/chrome/WbTopBarMicControlLive";

jest.mock("@/hooks/useMicInputLevel", () => ({
  useMicInputLevel: () => 0.6,
}));

const defaultDevices = [] as MediaDeviceInfo[];

describe("WbTopBarMicControlLive", () => {
  test("renders inline 3-bar mic meter on the toggle button (parity with tutor top bar)", () => {
    render(
      <WbTopBarMicControlLive
        isMicMuted={false}
        hasMicPermission="granted"
        hasMicStream
        audioDevices={defaultDevices}
        selectedPickerSlot={0}
        showInlineMeter
        micStream={null}
        onToggleMute={jest.fn()}
        onAcquireMic={jest.fn()}
        onPickMicSlot={jest.fn()}
      />
    );

    const toggle = screen.getByTestId("wb-topbar-mic-toggle");
    expect(toggle.querySelector(".mynk-wb-mic-meter")).toBeTruthy();
    expect(toggle.querySelectorAll(".mynk-wb-mic-bar--active").length).toBeGreaterThan(0);
  });

  test("inline meter still receives micStream when muted (local activity cue)", () => {
    const fakeStream = { id: "meter-stream" } as MediaStream;
    render(
      <WbTopBarMicControlLive
        isMicMuted
        hasMicPermission="granted"
        hasMicStream
        audioDevices={defaultDevices}
        selectedPickerSlot={0}
        showInlineMeter
        micStream={fakeStream}
        onToggleMute={jest.fn()}
        onAcquireMic={jest.fn()}
        onPickMicSlot={jest.fn()}
      />
    );

    const toggle = screen.getByTestId("wb-topbar-mic-toggle");
    expect(toggle.querySelector(".mynk-wb-mic-meter")).toBeTruthy();
    expect(toggle.className).toContain("mynk-wb-tb-btn--mic-off");
  });

  test("student path: no inline meter by default; mic stays enabled before enumerate", () => {
    render(
      <WbTopBarMicControlLive
        isMicMuted={false}
        hasMicPermission="granted"
        hasMicStream={false}
        audioDevices={defaultDevices}
        selectedPickerSlot={0}
        onToggleMute={jest.fn()}
        onAcquireMic={jest.fn()}
        onPickMicSlot={jest.fn()}
      />
    );

    const toggle = screen.getByTestId("wb-topbar-mic-toggle");
    expect(toggle.querySelector(".mynk-wb-mic-meter")).toBeNull();
    expect(toggle).not.toBeDisabled();
  });

  test("mic picker shows placeholder when enumerate list is still empty", async () => {
    const user = userEvent.setup();
    render(
      <WbTopBarMicControlLive
        isMicMuted={false}
        hasMicPermission="prompt"
        hasMicStream={false}
        audioDevices={defaultDevices}
        selectedPickerSlot={0}
        isAcquiring
        onToggleMute={jest.fn()}
        onAcquireMic={jest.fn()}
        onPickMicSlot={jest.fn()}
      />
    );

    await user.click(screen.getByTestId("wb-topbar-mic-settings"));
    const select = screen.getByTestId("audio-device-select");
    expect(select).toHaveTextContent("(allow microphone access to choose)");
  });

  test("showDevicePickerInDropdown=false hides settings caret (on-page picker owns device UI)", () => {
    render(
      <WbTopBarMicControlLive
        isMicMuted={false}
        hasMicPermission="granted"
        hasMicStream
        audioDevices={defaultDevices}
        selectedPickerSlot={0}
        showDevicePickerInDropdown={false}
        onToggleMute={jest.fn()}
        onAcquireMic={jest.fn()}
        onPickMicSlot={jest.fn()}
      />
    );

    expect(screen.queryByTestId("wb-topbar-mic-settings")).toBeNull();
    expect(screen.queryByTestId("audio-device-select")).toBeNull();
    expect(screen.getByTestId("wb-topbar-mic-toggle")).toBeTruthy();
  });
});
