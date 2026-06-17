/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { WhiteboardSessionShell } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell";

jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/SessionReviewMode",
  () => ({
    SessionReviewMode: ({
      whiteboardSessionId,
      studentId,
    }: {
      whiteboardSessionId: string;
      studentId: string;
    }) => (
      <div
        data-testid="wb-session-review-mode"
        data-wbsid={whiteboardSessionId}
        data-student-id={studentId}
      >
        Notes hero
      </div>
    ),
  })
);

jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WorkspaceResumeGate",
  () => ({
    WorkspaceResumeGate: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="mock-resume-gate">{children}</div>
    ),
  })
);

jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient",
  () => ({
    WhiteboardWorkspaceClient: () => (
      <div data-testid="mock-live-workspace-client">Live</div>
    ),
  })
);

const baseProps = {
  whiteboardSessionId: "wbs-ended",
  studentId: "stu-1",
  studentName: "Alex",
  adminUserId: "admin-1",
  startedAtIso: "2026-06-01T10:00:00.000Z",
  bothConnectedAtIso: null,
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
  syncUrl: null,
  initialUserWantsRecording: false,
  syncEnabled: false,
};

describe("WhiteboardSessionShell ended-session routing", () => {
  it("renders notes-hero review when initialMode is review", () => {
    render(<WhiteboardSessionShell {...baseProps} initialMode="review" />);
    expect(screen.getByTestId("wb-session-review-mode")).toBeInTheDocument();
    expect(screen.getByTestId("wb-session-review-mode")).toHaveAttribute(
      "data-wbsid",
      "wbs-ended"
    );
    expect(
      screen.queryByTestId("mock-live-workspace-client")
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-resume-gate")).not.toBeInTheDocument();
  });

  it("renders live workspace when initialMode is live", () => {
    render(<WhiteboardSessionShell {...baseProps} initialMode="live" />);
    expect(screen.getByTestId("mock-live-workspace-client")).toBeInTheDocument();
    expect(
      screen.queryByTestId("wb-session-review-mode")
    ).not.toBeInTheDocument();
  });
});
