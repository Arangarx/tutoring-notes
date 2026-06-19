"use client";

/**
 * A3 in-shell mode flip — session shell wrapping live + review modes.
 *
 * P2 extension: discriminated union on `role` — tutor keeps live/review flip;
 * student is live-only (no resume gate, no review mode).
 */

import { useCallback, useState } from "react";
import { WhiteboardWorkspaceClient } from "./WhiteboardWorkspaceClient";
import { WorkspaceResumeGate } from "./WorkspaceResumeGate";
import { SessionReviewMode } from "./SessionReviewMode";

type ShellMode = "live" | "review";

type ShellBaseProps = {
  whiteboardSessionId: string;
  studentId: string;
};

export type TutorWhiteboardSessionShellProps = ShellBaseProps & {
  role: "tutor";
  studentName: string;
  adminUserId: string;
  startedAtIso: string;
  bothConnectedAtIso: string | null;
  initialActiveMs: number;
  initialLastActiveAtIso: string | null;
  syncUrl: string | null;
  initialUserWantsRecording: boolean;
  syncEnabled: boolean;
  initialMode?: ShellMode;
};

export type StudentWhiteboardSessionShellProps = ShellBaseProps & {
  role: "student";
  joinToken: string;
  syncUrl: string;
  tutorName: string;
  initialActiveMs: number;
  initialLastActiveAtIso: string | null;
};

export type WhiteboardSessionShellProps =
  | TutorWhiteboardSessionShellProps
  | StudentWhiteboardSessionShellProps;

export function WhiteboardSessionShell(props: WhiteboardSessionShellProps) {
  if (props.role === "student") {
    return (
      <WhiteboardWorkspaceClient
        role="student"
        whiteboardSessionId={props.whiteboardSessionId}
        studentId={props.studentId}
        joinToken={props.joinToken}
        syncUrl={props.syncUrl}
        tutorName={props.tutorName}
        initialActiveMs={props.initialActiveMs}
        initialLastActiveAtIso={props.initialLastActiveAtIso}
      />
    );
  }

  return <TutorWhiteboardSessionShell {...props} />;
}

function TutorWhiteboardSessionShell({
  whiteboardSessionId,
  studentId,
  studentName,
  adminUserId,
  startedAtIso,
  bothConnectedAtIso,
  initialActiveMs,
  initialLastActiveAtIso,
  syncUrl,
  initialUserWantsRecording,
  syncEnabled,
  initialMode = "live",
}: TutorWhiteboardSessionShellProps) {
  const [mode, setMode] = useState<ShellMode>(initialMode);

  const handleSessionEnded = useCallback(() => {
    setMode("review");
  }, []);

  if (mode === "review") {
    return (
      <SessionReviewMode
        key={whiteboardSessionId}
        whiteboardSessionId={whiteboardSessionId}
        studentId={studentId}
      />
    );
  }

  return (
    <WorkspaceResumeGate
      whiteboardSessionId={whiteboardSessionId}
      studentId={studentId}
      startedAtIso={startedAtIso}
      initialLastActiveAtIso={initialLastActiveAtIso}
      syncEnabled={syncEnabled}
    >
      <WhiteboardWorkspaceClient
        whiteboardSessionId={whiteboardSessionId}
        studentId={studentId}
        studentName={studentName}
        adminUserId={adminUserId}
        startedAtIso={startedAtIso}
        bothConnectedAtIso={bothConnectedAtIso}
        initialActiveMs={initialActiveMs}
        initialLastActiveAtIso={initialLastActiveAtIso}
        syncUrl={syncUrl}
        initialUserWantsRecording={initialUserWantsRecording}
        onSessionEnded={handleSessionEnded}
      />
    </WorkspaceResumeGate>
  );
}
