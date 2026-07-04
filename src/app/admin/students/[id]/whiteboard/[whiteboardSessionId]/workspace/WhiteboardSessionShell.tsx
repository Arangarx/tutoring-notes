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
  /** Session phase: PENDING (waiting room) or ACTIVE (tutor has clicked Start). */
  initialSessionPhase?: "PENDING" | "ACTIVE";
  sessionMode?: string;
  activatedAt?: string | null;
  /** Frozen session consent: null = no snapshot (unclaimed / no ConsentRecord). */
  initialAllowAudioRecording?: boolean | null;
  /** True when SessionConsentSnapshot exists for this session. */
  initialHasConsentSnapshot?: boolean;
  /** Claimed student's LearnerProfile id — per-speaker lane attribution. */
  studentLearnerProfileId?: string | null;
  /**
   * When "endreview": auto-bypass the resume gate and fire handleEndSession
   * once on mount. Used by the roster "End and review" button (SSG-2 fix).
   */
  initialIntent?: "endreview";
};

export type StudentWhiteboardSessionShellProps = ShellBaseProps & {
  role: "student";
  /**
   * Join token for the legacy /w/[joinToken] path.
   * Omit (or pass undefined) when the student joins via the authenticated
   * /join/[sessionId] path — learner-session cookie auth is used instead.
   */
  joinToken?: string;
  syncUrl: string;
  tutorName: string;
  initialActiveMs: number;
  initialLastActiveAtIso: string | null;
  /** Session phase at SSR time — allows the client to start in PENDING state. */
  initialSessionPhase?: "PENDING" | "ACTIVE";
  /**
   * identity-peerid workstream: session-scoped opaque identity token
   * (authenticated /join/[sessionId] path only). Computed server-side as
   * sha256(learnerProfileId:sessionId)[:12hex]. Enables identity-derived
   * peerId and dual-device takeover detection. Absent on the legacy
   * /w/[joinToken] path (unauthenticated).
   */
  identityKey?: string;
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
        initialSessionPhase={props.initialSessionPhase}
        identityKey={props.identityKey}
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
  initialSessionPhase,
  sessionMode,
  activatedAt,
  initialAllowAudioRecording,
  initialHasConsentSnapshot,
  studentLearnerProfileId,
  initialIntent,
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
      autoConsent={initialIntent === "endreview"}
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
        initialSessionPhase={initialSessionPhase}
        sessionMode={sessionMode}
        activatedAt={activatedAt}
        initialAllowAudioRecording={initialAllowAudioRecording}
        initialHasConsentSnapshot={initialHasConsentSnapshot}
        studentLearnerProfileId={studentLearnerProfileId}
        initialIntent={initialIntent}
      />
    </WorkspaceResumeGate>
  );
}
