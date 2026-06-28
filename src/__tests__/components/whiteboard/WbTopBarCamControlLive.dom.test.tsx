/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";

import { WbTopBarCamControlLive } from "@/components/whiteboard/chrome/WbTopBarCamControlLive";

describe("WbTopBarCamControlLive", () => {
  test("waiting-room overlay cam control matches live mic button styling", () => {
    render(
      <WbTopBarCamControlLive
        isCamMuted={false}
        hasCamPermission="granted"
        hasCamStream
        onToggleCam={jest.fn()}
      />
    );

    const toggle = screen.getByTestId("wb-topbar-cam-toggle");
    expect(toggle.className).toContain("mynk-wb-tb-btn");
    expect(toggle.className).toContain("mynk-wb-tb-btn--icon");
    expect(toggle.className).toContain("mynk-wb-tb-btn--cam-on");
    expect(screen.getByTestId("wb-topbar-cam")).toBeTruthy();
  });

  test("cam-off state uses shared top-bar cam-off class", () => {
    render(
      <WbTopBarCamControlLive
        isCamMuted
        hasCamPermission="granted"
        hasCamStream
        onToggleCam={jest.fn()}
      />
    );

    const toggle = screen.getByTestId("wb-topbar-cam-toggle");
    expect(toggle.className).toContain("mynk-wb-tb-btn--cam-off");
  });
});
