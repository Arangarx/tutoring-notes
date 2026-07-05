/**
 * @jest-environment jsdom
 *
 * WS-F — waiting-room exit affordances (Cancel / Leave).
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WaitingRoomOverlay } from "@/components/whiteboard/chrome/WaitingRoomOverlay";

const baseProps = {
  sessionMode: "IN_PERSON" as const,
  studentConnected: false,
  tutorName: "Ms. Smith",
  studentLabel: "Alex",
  canStart: true,
  isStarting: false,
  onStart: jest.fn(),
  onSessionModeChange: jest.fn(),
  micControlNode: <div data-testid="mock-mic" />,
  camControlNode: <div data-testid="mock-cam" />,
  avTilesNode: <div data-testid="mock-tiles" />,
};

describe("WaitingRoomOverlay — WS-F exit affordances", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("tutor: Cancel button renders; two-step confirm before onCancel fires", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();

    render(
      <WaitingRoomOverlay
        {...baseProps}
        role="tutor"
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId("wb-waiting-cancel")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-waiting-leave")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("wb-waiting-cancel"));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("wb-waiting-cancel-confirm"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("student: Leave button renders; onLeave fires on click", async () => {
    const user = userEvent.setup();
    const onLeave = jest.fn();

    render(
      <WaitingRoomOverlay
        {...baseProps}
        role="student"
        onLeave={onLeave}
      />
    );

    expect(screen.getByTestId("wb-waiting-leave")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-waiting-cancel")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("wb-waiting-leave"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  test("tutor: cancelError renders inline", () => {
    render(
      <WaitingRoomOverlay
        {...baseProps}
        role="tutor"
        onCancel={jest.fn()}
        cancelError="Could not cancel the session."
      />
    );

    expect(screen.getByTestId("wb-waiting-cancel-error")).toHaveTextContent(
      "Could not cancel the session."
    );
  });

  test("tutor: controls disabled while isCancelling", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();

    const { rerender } = render(
      <WaitingRoomOverlay
        {...baseProps}
        role="tutor"
        onCancel={onCancel}
        isCancelling={false}
      />
    );

    await user.click(screen.getByTestId("wb-waiting-cancel"));
    expect(screen.getByTestId("wb-waiting-cancel-confirm")).not.toBeDisabled();

    rerender(
      <WaitingRoomOverlay
        {...baseProps}
        role="tutor"
        onCancel={onCancel}
        isCancelling
      />
    );

    expect(screen.getByTestId("wb-waiting-cancel-confirm")).toBeDisabled();
    expect(screen.getByTestId("wb-waiting-cancel-back")).toBeDisabled();
  });
});
