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

describe("WbTopBarMicControlLive", () => {
  test("renders inline 3-bar mic meter on the toggle button (parity with tutor top bar)", () => {
    render(
      <WbTopBarMicControlLive
        isMicMuted={false}
        hasMicPermission="granted"
        hasMicStream
        showInlineMeter
        micStream={null}
        onToggleMute={jest.fn()}
        onAcquireMic={jest.fn()}
        onMicDeviceChange={jest.fn()}
      />
    );

    const toggle = screen.getByTestId("wb-topbar-mic-toggle");
    expect(toggle.querySelector(".mynk-wb-mic-meter")).toBeTruthy();
    expect(toggle.querySelectorAll(".mynk-wb-mic-bar--active").length).toBeGreaterThan(0);
  });

  test("student path: no inline meter by default; mic stays enabled before enumerate", () => {
    render(
      <WbTopBarMicControlLive
        isMicMuted={false}
        hasMicPermission="granted"
        hasMicStream={false}
        onToggleMute={jest.fn()}
        onAcquireMic={jest.fn()}
        onMicDeviceChange={jest.fn()}
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
        isAcquiring
        onToggleMute={jest.fn()}
        onAcquireMic={jest.fn()}
        onMicDeviceChange={jest.fn()}
      />
    );

    await user.click(screen.getByTestId("wb-topbar-mic-settings"));
    const select = screen.getByTestId("wb-topbar-mic-device-select");
    expect(select).toHaveTextContent("(starting microphone…)");
  });
});
