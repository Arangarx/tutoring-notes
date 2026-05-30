/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { WhiteboardDebugHud } from "@/components/whiteboard/WhiteboardDebugHud";
import { createWbFollowDebugTelemetry } from "@/lib/whiteboard/wb-follow-debug-telemetry";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";

const mockGetAppState = jest.fn(() => ({
  scrollX: 10,
  scrollY: 20,
  zoom: { value: 1 },
  width: 800,
  height: 600,
  offsetLeft: 0,
  offsetTop: 0,
}));

const mockApi = {
  getAppState: mockGetAppState,
} as unknown as ExcalidrawApiLike;

describe("WhiteboardDebugHud", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("renders nothing without wbdebug flag", () => {
    const { container } = render(
      <WhiteboardDebugHud
        role="tutor"
        syncOn
        activePageId="p1"
        excalidrawAPI={mockApi}
        telemetry={createWbFollowDebugTelemetry()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders HUD when ?wbdebug=1 and persists in sessionStorage", () => {
    window.history.replaceState({}, "", "/?wbdebug=1");
    render(
      <WhiteboardDebugHud
        role="student"
        syncOn={false}
        activePageId="p2"
        excalidrawAPI={mockApi}
        telemetry={createWbFollowDebugTelemetry()}
      />
    );
    expect(screen.getByTestId("whiteboard-debug-hud")).toBeTruthy();
    expect(screen.getByText(/role=student/)).toBeTruthy();
    expect(screen.getByText(/sync=off/)).toBeTruthy();
    expect(screen.getByText(/pvs=p2/)).toBeTruthy();
    expect(sessionStorage.getItem("wbdebug")).toBe("1");
  });
});
