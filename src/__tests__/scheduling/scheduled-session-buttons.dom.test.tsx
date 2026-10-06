/**
 * @jest-environment jsdom
 *
 * Scheduled join / open-room buttons compose FormSubmitButton.
 * Oracle: visible label, test id, disabled-before-window, and refusal copy.
 */

import { render, screen } from "@testing-library/react";
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

describe("scheduled session buttons", () => {
  beforeEach(() => {
    mockJoinFromForm.mockReset();
    mockOpenRoom.mockReset();
  });

  it("keeps Join disabled with the same test id before the window opens", () => {
    render(
      <JoinScheduledSessionButton scheduledSessionId="sched-1" joinWindowOpen={false} />
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
    render(<JoinScheduledSessionButton scheduledSessionId="sched-2" joinWindowOpen />);

    const button = screen.getByTestId("join-scheduled-session-sched-2");
    expect(button).toHaveTextContent("Join");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("type", "submit");

    await user.click(button);

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("data-testid", "join-scheduled-refusal-sched-2");
    expect(status).toHaveTextContent("Join opens shortly before the scheduled start.");
  });

  it("renders Open room as a submit control with the scheduled-session test id", () => {
    render(<OpenScheduledRoomButton scheduledSessionId="sched-3" />);
    const button = screen.getByTestId("open-scheduled-room-sched-3");
    expect(button).toHaveTextContent("Open room");
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeEnabled();
  });
});
