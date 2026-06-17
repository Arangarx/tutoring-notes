/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { WhiteboardSessionShell } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell";

jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/SessionReviewMode",
  () => ({
    SessionReviewMode: () => <div data-testid="wb-session-review-mode" />,
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

jest.mock("@/app/w/[joinToken]/StudentLiveWorkspaceClient", () => ({
  StudentLiveWorkspaceClient: () => (
    <div data-testid="mock-student-live-workspace" data-role="student">
      Student live
    </div>
  ),
}));

const tutorBaseProps = {
  role: "tutor" as const,
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
    render(<WhiteboardSessionShell {...tutorBaseProps} initialMode="review" />);
    expect(screen.getByTestId("wb-session-review-mode")).toBeInTheDocument();
    expect(
      screen.queryByTestId("mock-live-workspace-client")
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-resume-gate")).not.toBeInTheDocument();
  });

  it("renders live workspace when initialMode is live", () => {
    render(<WhiteboardSessionShell {...tutorBaseProps} initialMode="live" />);
    expect(screen.getByTestId("mock-live-workspace-client")).toBeInTheDocument();
    expect(
      screen.queryByTestId("wb-session-review-mode")
    ).not.toBeInTheDocument();
  });
});

describe("WhiteboardSessionShell student branch", () => {
  it("mounts StudentLiveWorkspaceClient without WorkspaceResumeGate", () => {
    render(
      <WhiteboardSessionShell
        role="student"
        whiteboardSessionId="wbs-stu"
        studentId="stu-1"
        joinToken="join-tok"
        syncUrl="ws://localhost:3002"
        tutorName="Tutor"
        initialActiveMs={0}
        initialLastActiveAtIso={null}
      />
    );
    expect(screen.getByTestId("mock-student-live-workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-resume-gate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wb-session-review-mode")).not.toBeInTheDocument();
  });
});
