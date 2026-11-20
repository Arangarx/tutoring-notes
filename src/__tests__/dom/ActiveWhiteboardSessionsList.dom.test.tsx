/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteWhiteboardSessionAndDataActionMock = jest.fn();
const finalizeWhiteboardSessionWithOutboxMock = jest.fn();
const routerPushMock = jest.fn();
const routerRefreshMock = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: routerPushMock, refresh: routerRefreshMock }),
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
  routerRefreshMock.mockReset();
});

describe("ActiveWhiteboardSessionsList — End and review wiring (WS-N4)", () => {
  it("shows the section heading by default", () => {
    render(
      <ActiveWhiteboardSessionsList
        studentId="stu_roster"
        sessions={[{ id: "wb_roster_heading", startedAt: new Date("2026-07-05T12:00:00Z") }]}
      />
    );
    expect(screen.getByRole("heading", { name: "Open whiteboard sessions" })).toBeInTheDocument();
  });

  it("omits the section heading when nested in a disclosure", () => {
    render(
      <ActiveWhiteboardSessionsList
        studentId="stu_roster"
        sessions={[{ id: "wb_roster_bare", startedAt: new Date("2026-07-05T12:00:00Z") }]}
        variant="bare"
      />
    );
    expect(
      screen.queryByRole("heading", { name: "Open whiteboard sessions" })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("roster-end-and-review")).toBeInTheDocument();
  });

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

describe("ActiveWhiteboardSessionsList — cancel and delete awaits the action", () => {
  const session = { id: "wb_roster_delete", startedAt: new Date("2026-07-05T12:00:00Z") };

  async function confirmDelete() {
    const user = userEvent.setup();
    render(
      <ActiveWhiteboardSessionsList studentId="stu_roster" sessions={[session]} />
    );
    await user.click(screen.getByTestId("roster-cancel-delete"));
    await user.click(screen.getByTestId("roster-cancel-delete-confirm-yes"));
  }

  it("refreshes only after the delete action resolves", async () => {
    let resolveDelete: (value: { ok: true }) => void = () => {};
    deleteWhiteboardSessionAndDataActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        })
    );

    await confirmDelete();

    expect(deleteWhiteboardSessionAndDataActionMock).toHaveBeenCalledWith("wb_roster_delete");
    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("roster-cancel-delete-confirm-yes")).toBeDisabled();
    expect(screen.getByTestId("roster-resume-session")).toBeInTheDocument();

    resolveDelete({ ok: true });

    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
    // refresh() returns before the new RSC arrives. "Yes, delete" must stay
    // disabled so a second click cannot fire another delete.
    await waitFor(() => {
      expect(screen.getByTestId("roster-cancel-delete-confirm-yes")).toBeDisabled();
    });
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it("keeps the row and shows the error when the delete action fails", async () => {
    deleteWhiteboardSessionAndDataActionMock.mockResolvedValueOnce({
      ok: false,
      error: "Could not delete the session. Please try again.",
    });

    await confirmDelete();

    await waitFor(() => {
      expect(screen.getByTestId("roster-cancel-delete-error")).toHaveTextContent(
        /could not delete the session/i
      );
    });
    expect(screen.getByTestId("roster-resume-session")).toBeInTheDocument();
    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
