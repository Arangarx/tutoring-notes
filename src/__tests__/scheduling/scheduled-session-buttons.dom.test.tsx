/**
 * @jest-environment jsdom
 *
 * Scheduled join / open-room buttons compose FormSubmitButton and read the one
 * entry rule's answer (`SessionEntryState`).
 * Oracle: visible label, test id, enabled/disabled, and a visible reason line wired
 * with aria-describedby (never tooltip-only). Expected strings are written by hand
 * from the W4 spec, not read from the copy table.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JoinScheduledSessionButton } from "@/components/scheduling/JoinScheduledSessionButton";
import { OpenScheduledRoomButton } from "@/components/scheduling/OpenScheduledRoomButton";
import type { SessionEntryState } from "@/lib/scheduling/session-entry";

const mockJoinFromForm = jest.fn();
const mockOpenRoom = jest.fn();

jest.mock("@/app/join/scheduled-actions", () => ({
  joinScheduledSessionFromForm: (...args: unknown[]) => mockJoinFromForm(...args),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  openScheduledWhiteboardSession: (...args: unknown[]) => mockOpenRoom(...args),
}));

const ALLOWED: SessionEntryState = {
  online: { allowed: true },
  inPerson: { allowed: true },
};
const ONLINE_OFF: SessionEntryState = {
  online: { allowed: false, reason: "live_off" },
  inPerson: { allowed: true },
};
const UNCLAIMED: SessionEntryState = {
  online: { allowed: false, reason: "unclaimed" },
  inPerson: { allowed: false, reason: "unclaimed" },
};
const NO_RECORD_PARENT: SessionEntryState = {
  online: { allowed: false, reason: "consent_missing_parent" },
  inPerson: { allowed: false, reason: "consent_missing_parent" },
};

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

  it("keeps Join disabled before the window opens and says when it opens", () => {
    render(
      <JoinScheduledSessionButton
        scheduledSessionId="sched-1"
        entry={ALLOWED}
        learnerName="Maya"
        {...hoursFromNow(2 * 60 * 60 * 1000, 60 * 60 * 1000)}
      />
    );
    const button = screen.getByTestId("join-scheduled-session-sched-1");
    expect(button).toHaveTextContent("Join");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("type", "button");
    const reason = screen.getByTestId("join-scheduled-reason-sched-1");
    expect(reason).toHaveTextContent("Join opens 15 minutes before the start.");
    expect(reason).toBeVisible();
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);
  });

  it("shows the action refusal on the status line and keeps the Join test id", async () => {
    mockJoinFromForm.mockResolvedValue({ error: "not_yet" });
    const user = userEvent.setup();
    render(
      <JoinScheduledSessionButton
        scheduledSessionId="sched-2"
        entry={ALLOWED}
        learnerName="Maya"
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
    expect(status).toHaveTextContent("Join opens 15 minutes before the start.");
  });

  it("enables Join when the window opens without a reload, and the reason line goes away", () => {
    jest.useFakeTimers();
    try {
      const start = new Date("2026-10-06T18:00:00.000Z");
      const end = new Date("2026-10-06T19:00:00.000Z");
      const beforeOpen = start.getTime() - 15 * 60_000 - 5_000;
      jest.setSystemTime(beforeOpen);
      render(
        <JoinScheduledSessionButton
          scheduledSessionId="sched-timer"
          entry={ALLOWED}
          learnerName="Maya"
          startAtIso={start.toISOString()}
          endAtIso={end.toISOString()}
        />
      );
      expect(screen.getByTestId("join-scheduled-session-sched-timer")).toBeDisabled();
      expect(screen.getByTestId("join-scheduled-reason-sched-timer")).toBeVisible();
      act(() => {
        jest.advanceTimersByTime(5_000);
      });
      expect(screen.getByTestId("join-scheduled-session-sched-timer")).toBeEnabled();
      expect(screen.queryByTestId("join-scheduled-reason-sched-timer")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps Join inactive inside the window when online sessions are off, with the reason", () => {
    render(
      <JoinScheduledSessionButton
        scheduledSessionId="sched-blocked"
        entry={ONLINE_OFF}
        learnerName="Maya"
        {...hoursFromNow(5 * 60 * 1000, 60 * 60 * 1000)}
      />
    );
    const button = screen.getByTestId("join-scheduled-session-sched-blocked");
    expect(button).toHaveTextContent("Join");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("type", "button");
    const reason = screen.getByTestId("join-scheduled-reason-sched-blocked");
    expect(reason).toHaveTextContent("Live sessions are off in privacy settings.");
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);
  });

  it("tells a family with no privacy preferences what to do, without org-internal wording", () => {
    render(
      <JoinScheduledSessionButton
        scheduledSessionId="sched-norecord"
        entry={NO_RECORD_PARENT}
        learnerName="Maya"
        {...hoursFromNow(5 * 60 * 1000, 60 * 60 * 1000)}
      />
    );
    expect(screen.getByTestId("join-scheduled-session-sched-norecord")).toBeDisabled();
    expect(screen.getByTestId("join-scheduled-reason-sched-norecord")).toHaveTextContent(
      "Finish privacy preferences for Maya to join."
    );
  });

  it("renders Open room as a submit control with the scheduled-session test id", () => {
    render(<OpenScheduledRoomButton scheduledSessionId="sched-3" entry={ALLOWED} learnerName="Maya" />);
    const button = screen.getByTestId("open-scheduled-room-sched-3");
    expect(button).toHaveTextContent("Open room");
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeEnabled();
    expect(screen.queryByTestId("open-scheduled-room-reason-sched-3")).not.toBeInTheDocument();
  });

  it("keeps Open room reachable when online sessions are off, and says what is limited", () => {
    render(<OpenScheduledRoomButton scheduledSessionId="sched-4" entry={ONLINE_OFF} learnerName="Maya" />);
    const button = screen.getByTestId("open-scheduled-room-sched-4");
    expect(button).toHaveTextContent("Open room");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("type", "submit");
    const reason = screen.getByTestId("open-scheduled-room-reason-sched-4");
    expect(reason).toHaveTextContent("Live sessions are off in Maya's privacy settings.");
    expect(reason).toHaveTextContent("You can still open the room in person.");
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);
  });

  it("disables Open room with the reason when neither mode can be entered", () => {
    render(<OpenScheduledRoomButton scheduledSessionId="sched-5" entry={UNCLAIMED} learnerName="Maya" />);
    const button = screen.getByTestId("open-scheduled-room-sched-5");
    expect(button).toHaveTextContent("Open room");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("type", "button");
    const reason = screen.getByTestId("open-scheduled-room-reason-sched-5");
    expect(reason).toHaveTextContent("Maya hasn't connected their Mynk account yet.");
    expect(reason).not.toHaveTextContent("in person");
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);
    expect(mockOpenRoom).not.toHaveBeenCalled();
  });
});
