/**
 * @jest-environment jsdom
 *
 * Consent wave C5 (E2, jsdom half) — when ONLINE cannot start, the waiting room offers only in person and says why,
 * and never changes the mode on the tutor's behalf. The real-browser half (the workspace page, `modeChosen`, the
 * `[wtr]`/`[cns]` log lines, no mode event before Start) is `consent-entry.spec.ts` E2.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WaitingRoomOverlay } from "@/components/whiteboard/chrome/WaitingRoomOverlay";

const baseProps = {
  role: "tutor" as const,
  studentConnected: false,
  tutorName: "Ms. Smith",
  studentLabel: "Alex",
  canStart: true,
  isStarting: false,
  micControlNode: <div data-testid="mock-mic" />,
  camControlNode: <div data-testid="mock-cam" />,
  avTilesNode: <div data-testid="mock-tiles" />,
};

describe("WaitingRoomOverlay — online blocked (C5 / E2)", () => {
  it("shows only in person (pressed), hides Online, and says why beside Start", () => {
    render(
      <WaitingRoomOverlay
        {...baseProps}
        sessionMode="IN_PERSON"
        onStart={jest.fn()}
        onSessionModeChange={jest.fn()}
        onlineBlockedReason="live_off"
      />
    );

    expect(screen.queryByTestId("wb-session-mode-live")).not.toBeInTheDocument();
    expect(screen.getByTestId("wb-session-mode-in-person")).toHaveAttribute("aria-pressed", "true");
    const line = screen.getByTestId("wb-waiting-online-blocked");
    expect(line).toHaveAttribute("data-entry-reason", "live_off");
    expect(line).toHaveTextContent("Alex");
    expect(screen.getByTestId("wb-start-session")).toHaveTextContent("Start in person");
  });

  it("does not call onSessionModeChange on mount, even when the mode prop is still LIVE (no hidden auto-flip)", () => {
    const onSessionModeChange = jest.fn();
    render(
      <WaitingRoomOverlay
        {...baseProps}
        sessionMode="LIVE"
        onStart={jest.fn()}
        onSessionModeChange={onSessionModeChange}
        onlineBlockedReason="live_off"
      />
    );

    expect(onSessionModeChange).not.toHaveBeenCalled();
  });

  it("pressing Start is the choice: it calls onStart once and nothing else changes the mode", async () => {
    const user = userEvent.setup();
    const onStart = jest.fn();
    const onSessionModeChange = jest.fn();
    render(
      <WaitingRoomOverlay
        {...baseProps}
        sessionMode="IN_PERSON"
        onStart={onStart}
        onSessionModeChange={onSessionModeChange}
        onlineBlockedReason="live_off"
      />
    );

    await user.click(screen.getByTestId("wb-start-session"));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onSessionModeChange).not.toHaveBeenCalled();
  });

  it("positive control: online allowed offers both modes and the plain Start label", () => {
    render(
      <WaitingRoomOverlay
        {...baseProps}
        sessionMode="LIVE"
        onStart={jest.fn()}
        onSessionModeChange={jest.fn()}
      />
    );

    expect(screen.getByTestId("wb-session-mode-live")).toBeInTheDocument();
    expect(screen.getByTestId("wb-session-mode-in-person")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-waiting-online-blocked")).not.toBeInTheDocument();
    expect(screen.getByTestId("wb-start-session")).toHaveTextContent("Start session");
  });
});
