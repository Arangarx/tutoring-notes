/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";

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
});
