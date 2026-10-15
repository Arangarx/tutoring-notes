/**
 * @jest-environment jsdom
 *
 * Scheduled join / open-room buttons compose FormSubmitButton.
 * Oracle: visible label, test id, disabled-before-window, and refusal copy.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JoinScheduledSessionButton } from "@/components/scheduling/JoinScheduledSessionButton";
import { OpenScheduledRoomButton } from "@/components/scheduling/OpenScheduledRoomButton";

const mockJoinFromForm = jest.fn();
const mockOpenRoom = jest.fn();

jest.mock("@/app/join/scheduled-actions", () => ({
  joinScheduledSessionFromForm: (...args: unknown[]) => mockJoinFromForm(...args),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  openScheduledWhiteboardSession: (...args: unknown[]) => mockOpenRoom(...args),
}));

function hoursFromNow(startOffsetMs: number, durationMs: number) {
  const start = new Date(Date.now() + startOffsetMs);
  return {
    startAtIso: start.toISOString(),
    endAtIso: new Date(start.getTime() + durationMs).toISOString(),
  };
}

describe("scheduled session buttons", () => {
  beforeEach(() => {
    mockJoinFromForm.mockReset();
    mockOpenRoom.mockReset();
  });

  it("keeps Join disabled with the same test id before the window opens", () => {
    render(
      <JoinScheduledSessionButton
        scheduledSessionId="sched-1"
        liveEntryAllowed
        {...hoursFromNow(2 * 60 * 60 * 1000, 60 * 60 * 1000)}
      />
    );
    const button = screen.getByTestId("join-scheduled-session-sched-1");
    expect(button).toHaveTextContent("Join");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("type", "button");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the action refusal on the status line and keeps the Join test id", async () => {
    mockJoinFromForm.mockResolvedValue({ error: "not_yet" });
    const user = userEvent.setup();
    render(
      <JoinScheduledSessionButton
        scheduledSessionId="sched-2"
        liveEntryAllowed
        {...hoursFromNow(5 * 60 * 1000, 60 * 60 * 1000)}
      />
    );

    const button = screen.getByTestId("join-scheduled-session-sched-2");
    expect(button).toHaveTextContent("Join");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("type", "submit");

    await user.click(button);

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("data-testid", "join-scheduled-refusal-sched-2");
    expect(status).toHaveTextContent("Join opens shortly before the scheduled start.");
  });

  it("enables Join when the window opens without a reload", () => {
    jest.useFakeTimers();
    try {
      const start = new Date("2026-10-06T18:00:00.000Z");
      const end = new Date("2026-10-06T19:00:00.000Z");
      const beforeOpen = start.getTime() - 15 * 60_000 - 5_000;
      jest.setSystemTime(beforeOpen);
      render(
        <JoinScheduledSessionButton
          scheduledSessionId="sched-timer"
          liveEntryAllowed
          startAtIso={start.toISOString()}
          endAtIso={end.toISOString()}
        />
      );
      expect(screen.getByTestId("join-scheduled-session-sched-timer")).toBeDisabled();
      act(() => {
        jest.advanceTimersByTime(5_000);
      });
      expect(screen.getByTestId("join-scheduled-session-sched-timer")).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps Join inactive inside the window when live entry is not allowed", () => {
    render(
      <JoinScheduledSessionButton
        scheduledSessionId="sched-blocked"
        liveEntryAllowed={false}
        {...hoursFromNow(5 * 60 * 1000, 60 * 60 * 1000)}
      />
    );
    const button = screen.getByTestId("join-scheduled-session-sched-blocked");
    expect(button).toHaveTextContent("Join");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("type", "button");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders Open room as a submit control with the scheduled-session test id", () => {
    render(<OpenScheduledRoomButton scheduledSessionId="sched-3" liveEntryAllowed />);
    const button = screen.getByTestId("open-scheduled-room-sched-3");
    expect(button).toHaveTextContent("Open room");
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeEnabled();
  });

  it("keeps Open room inactive when live entry is not allowed", () => {
    render(
      <OpenScheduledRoomButton scheduledSessionId="sched-4" liveEntryAllowed={false} />
    );
    const button = screen.getByTestId("open-scheduled-room-sched-4");
    expect(button).toHaveTextContent("Open room");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("type", "button");
    expect(mockOpenRoom).not.toHaveBeenCalled();
  });
});
