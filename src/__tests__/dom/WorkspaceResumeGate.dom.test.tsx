/**
 * @jest-environment jsdom
 */

/**
 * UI contract for the Resume-or-End gate.
 *
 * Sarah's pilot fix (Apr 2026): the workspace must NOT auto-reconnect
 * stale sessions. The gate intercepts the workspace render so the
 * sync client never instantiates while the prompt is showing — that's
 * what stops a stale student tab from ghost-joining.
 *
 * Step 5b (SSG-2 gate fix, 2026-07-03): the gate's "End session" button
 * (which called endStaleWhiteboardSession — the silent-orphan path) is
 * replaced with three actions matching the roster:
 *   - Resume session — consent to reconnect (existing)
 *   - End and review — navigate to ?intent=endreview so the full
 *     handleEndSession pipeline runs (drain outbox → register audio →
 *     atomic end → flip to review). Does NOT call endStaleWhiteboardSession.
 *   - Cancel and delete — confirm-guarded; calls
 *     deleteWhiteboardSessionAndDataAction; returns to student detail.
 *
 * Things this test guards:
 *
 *   - Fresh sessions render children directly (no gate visible).
 *     A regression here would interrupt every workspace open.
 *
 *   - Stale sessions HIDE the children entirely until consent.
 *     If children leak through while the gate shows, the sync client
 *     in the workspace would still mount and connect — defeating
 *     the whole point of the gate.
 *
 *   - "Resume" reveals the children (the workspace mounts).
 *
 *   - "End and review" calls router.push with the ?intent=endreview URL.
 *     It must NOT call endStaleWhiteboardSession.
 *
 *   - "Cancel and delete" shows a confirm dialog; confirming calls
 *     deleteWhiteboardSessionAndDataAction and navigates to student page.
 *
 *   - Delete failure surfaces an alert and keeps the gate visible.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
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

import { WorkspaceResumeGate } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WorkspaceResumeGate";

const NOW = 1_750_000_000_000;

beforeEach(() => {
  deleteWhiteboardSessionAndDataActionMock.mockReset();
  finalizeWhiteboardSessionWithOutboxMock.mockReset();
  finalizeWhiteboardSessionWithOutboxMock.mockResolvedValue({
    ok: true,
    idempotent: false,
    endedAt: new Date().toISOString(),
    durationSeconds: 60,
    registeredSegments: 0,
  });
  routerPushMock.mockReset();
});

function CanaryChildren() {
  // We render a sentinel that the gate MUST NOT render until consent.
  return <div data-testid="workspace-canary">workspace mounted</div>;
}

describe("WorkspaceResumeGate", () => {
  it("renders children immediately when session is fresh (no gate)", () => {
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 30_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );
    expect(screen.getByTestId("workspace-canary")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-resume-gate")).not.toBeInTheDocument();
  });

  it("renders children directly in tutor-solo mode regardless of staleness", () => {
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 24 * 60 * 60_000).toISOString()}
        initialLastActiveAtIso={new Date(NOW - 12 * 60 * 60_000).toISOString()}
        syncEnabled={false}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );
    expect(screen.getByTestId("workspace-canary")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-resume-gate")).not.toBeInTheDocument();
  });

  it("HIDES children and shows the gate for a stale session (no-join case)", () => {
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 60 * 60_000).toISOString()} // 1h
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );
    expect(screen.getByTestId("wb-resume-gate")).toBeInTheDocument();
    // Critical: the workspace MUST NOT have mounted yet, or the sync
    // client would be opening a WebSocket while the gate is showing.
    expect(screen.queryByTestId("workspace-canary")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resume session/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /End and review/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cancel and delete/i })
    ).toBeInTheDocument();
    // Old "End session" button must NOT appear.
    expect(
      screen.queryByRole("button", { name: /^End session$/i })
    ).not.toBeInTheDocument();
  });

  it("clicking Resume reveals the children and never hides them again", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 60 * 60_000).toISOString()}
        initialLastActiveAtIso={new Date(NOW - 30 * 60_000).toISOString()}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    await user.click(screen.getByTestId("wb-resume-gate-resume"));

    expect(screen.getByTestId("workspace-canary")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-resume-gate")).not.toBeInTheDocument();
  });

  it("clicking End and review calls outbox-aware finalize then navigates to review URL", async () => {
    const onEndAndReview = jest.fn();
    const user = userEvent.setup();
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_42"
        studentId="stu_99"
        startedAtIso={new Date(NOW - 2 * 60 * 60_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW, onEndAndReview }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    await user.click(screen.getByTestId("wb-resume-gate-end-and-review"));

    await waitFor(() => {
      expect(finalizeWhiteboardSessionWithOutboxMock).toHaveBeenCalledWith(
        "wb_42",
        "stu_99"
      );
    });
    expect(onEndAndReview).toHaveBeenCalledWith(
      "/admin/students/stu_99/whiteboard/wb_42/workspace"
    );
    expect(deleteWhiteboardSessionAndDataActionMock).not.toHaveBeenCalled();
  });

  it("autoConsent prop change to true updates consented state (useEffect gate)", async () => {
    // Simulate router.push re-rendering the gate with autoConsent={true}.
    // The useEffect should set consented=true so the workspace mounts.
    const { rerender } = render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 60 * 60_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    // Gate is showing initially (stale session).
    expect(screen.getByTestId("wb-resume-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-canary")).not.toBeInTheDocument();

    // Simulate the RSC re-render with autoConsent=true (after router.push ?intent=endreview).
    rerender(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 60 * 60_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        autoConsent={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    // The useEffect should have fired and set consented=true.
    await waitFor(() => {
      expect(screen.getByTestId("workspace-canary")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("wb-resume-gate")).not.toBeInTheDocument();
  });

  it("clicking Cancel and delete shows confirm dialog", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_42"
        studentId="stu_99"
        startedAtIso={new Date(NOW - 2 * 60 * 60_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    await user.click(screen.getByTestId("wb-resume-gate-cancel-delete"));

    expect(screen.getByTestId("wb-resume-gate-cancel-delete-confirm")).toBeInTheDocument();
    // Action must not have fired yet.
    expect(deleteWhiteboardSessionAndDataActionMock).not.toHaveBeenCalled();
  });

  it("confirming Cancel and delete calls deleteWhiteboardSessionAndDataAction and pushes to student page", async () => {
    deleteWhiteboardSessionAndDataActionMock.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_42"
        studentId="stu_99"
        startedAtIso={new Date(NOW - 2 * 60 * 60_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    await user.click(screen.getByTestId("wb-resume-gate-cancel-delete"));
    await user.click(screen.getByTestId("wb-resume-gate-cancel-delete-confirm-yes"));

    await waitFor(() => {
      expect(deleteWhiteboardSessionAndDataActionMock).toHaveBeenCalledWith("wb_42");
    });
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/admin/students/stu_99");
    });
  });

  it("Cancel and delete — cancel dismisses confirm dialog without deleting", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_42"
        studentId="stu_99"
        startedAtIso={new Date(NOW - 2 * 60 * 60_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    await user.click(screen.getByTestId("wb-resume-gate-cancel-delete"));
    await user.click(screen.getByTestId("wb-resume-gate-cancel-delete-confirm-cancel"));

    expect(screen.queryByTestId("wb-resume-gate-cancel-delete-confirm")).not.toBeInTheDocument();
    expect(deleteWhiteboardSessionAndDataActionMock).not.toHaveBeenCalled();
    // Gate still showing.
    expect(screen.getByTestId("wb-resume-gate")).toBeInTheDocument();
  });

  it("Delete failure surfaces alert and keeps gate visible", async () => {
    deleteWhiteboardSessionAndDataActionMock.mockResolvedValueOnce({
      ok: false,
      error: "Database is on fire",
    });
    const user = userEvent.setup();
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_42"
        studentId="stu_99"
        startedAtIso={new Date(NOW - 2 * 60 * 60_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    await user.click(screen.getByTestId("wb-resume-gate-cancel-delete"));
    await act(async () => {
      await user.click(screen.getByTestId("wb-resume-gate-cancel-delete-confirm-yes"));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/database is on fire/i);
    });
    // Gate still showing, workspace still hidden.
    expect(screen.getByTestId("wb-resume-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-canary")).not.toBeInTheDocument();
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
