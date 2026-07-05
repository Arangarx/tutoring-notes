/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteWhiteboardSessionAndDataActionMock = jest.fn();
const finalizeWhiteboardSessionWithOutboxMock = jest.fn();
const routerPushMock = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: routerPushMock }),
}));

jest.mock("@/lib/recording/finalize-whiteboard-session-client", () => ({
  __esModule: true,
  finalizeWhiteboardSessionWithOutbox: (...args: unknown[]) =>
    finalizeWhiteboardSessionWithOutboxMock(...args),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  __esModule: true,
  deleteWhiteboardSessionAndDataAction: (...args: unknown[]) =>
    deleteWhiteboardSessionAndDataActionMock(...args),
}));

import { ActiveWhiteboardSessionsList } from "@/app/admin/students/[id]/whiteboard/ActiveWhiteboardSessionsList";

beforeEach(() => {
  deleteWhiteboardSessionAndDataActionMock.mockReset();
  finalizeWhiteboardSessionWithOutboxMock.mockReset();
  finalizeWhiteboardSessionWithOutboxMock.mockResolvedValue({
    ok: true,
    idempotent: false,
    endedAt: new Date().toISOString(),
    durationSeconds: 60,
    registeredSegments: 1,
  });
  routerPushMock.mockReset();
});

describe("ActiveWhiteboardSessionsList — End and review wiring (WS-N4)", () => {
  it("calls finalizeWhiteboardSessionWithOutbox with studentId (outbox drain path)", async () => {
    const user = userEvent.setup();
    render(
      <ActiveWhiteboardSessionsList
        studentId="stu_roster"
        sessions={[{ id: "wb_roster_1", startedAt: new Date("2026-07-05T12:00:00Z") }]}
      />
    );

    await user.click(screen.getByTestId("roster-end-and-review"));

    await waitFor(() => {
      expect(finalizeWhiteboardSessionWithOutboxMock).toHaveBeenCalledWith(
        "wb_roster_1",
        "stu_roster"
      );
    });
    expect(routerPushMock).toHaveBeenCalledWith(
      "/admin/students/stu_roster/whiteboard/wb_roster_1/workspace"
    );
  });

  it("surfaces drain timeout error and does not navigate", async () => {
    finalizeWhiteboardSessionWithOutboxMock.mockResolvedValueOnce({
      ok: false,
      timedOut: true,
      remainingCount: 1,
      lastError: null,
      error:
        "Couldn't finalize — 1 audio segment still saving. Try again in a moment, your data isn't lost.",
    });
    const user = userEvent.setup();
    render(
      <ActiveWhiteboardSessionsList
        studentId="stu_roster"
        sessions={[{ id: "wb_roster_2", startedAt: new Date("2026-07-05T12:00:00Z") }]}
      />
    );

    await user.click(screen.getByTestId("roster-end-and-review"));

    await waitFor(() => {
      expect(screen.getByTestId("roster-end-and-review-error")).toHaveTextContent(
        /still saving/i
      );
    });
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
