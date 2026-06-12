"use client";

/**
 * A3 in-shell mode flip — session shell wrapping live + review modes.
 *
 * Structural design (three-mode shell, from whiteboard-session-shell-design-2026-06-08.md):
 *
 *   mode === "live"    → WorkspaceResumeGate → WhiteboardWorkspaceClient
 *   mode === "review"  → SessionReviewMode
 *   (mode === "waiting" reserved for a future Phase)
 *
 * CONDITIONAL MOUNT is intentional: flipping to "review" UNMOUNTS the
 * live subtree, which fires all existing cleanup effects:
 *   - sync client disconnect() (WhiteboardWorkspaceClient useEffect ~L791-812)
 *   - useLiveAV mesh/signaling dispose + non-recorder track stop (~L1142-1168, L1549-1571)
 *   - active-ping interval clear + final inactive beacon (~L2663-2740)
 * Mic and camera are therefore released on the mode flip with no extra effort.
 *
 * Phase B TODOs (deferred):
 *   - waiting room ("waiting" mode, A5 or later)
 *   - end-confirmation modal in the shell chrome (replaces window.confirm)
 *   - top-bar "Session complete" chrome shared across both modes
 *   - "Return to board" live→review escape hatch (design Q6 unresolved)
 *
 * Logging: no dedicated prefix here — the live subtree and review mode each
 * carry their own [WhiteboardWorkspaceClient] / [nsi] prefixes.
 */

import { useCallback, useState } from "react";
import { WhiteboardWorkspaceClient } from "./WhiteboardWorkspaceClient";
import { WorkspaceResumeGate } from "./WorkspaceResumeGate";
import { SessionReviewMode } from "./SessionReviewMode";

type ShellMode = "live" | "review";

export type WhiteboardSessionShellProps = {
  whiteboardSessionId: string;
  studentId: string;
  studentName: string;
  adminUserId: string;
  startedAtIso: string;
  bothConnectedAtIso: string | null;
  initialActiveMs: number;
  initialLastActiveAtIso: string | null;
  syncUrl: string | null;
  initialUserWantsRecording: boolean;
  syncEnabled: boolean;
};

export function WhiteboardSessionShell({
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
}: WhiteboardSessionShellProps) {
  const [mode, setMode] = useState<ShellMode>("live");

  const handleSessionEnded = useCallback(() => {
    setMode("review");
  }, []);

  if (mode === "review") {
    return (
      <SessionReviewMode
        whiteboardSessionId={whiteboardSessionId}
        studentId={studentId}
      />
    );
  }

  // mode === "live": render WorkspaceResumeGate + WhiteboardWorkspaceClient
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
