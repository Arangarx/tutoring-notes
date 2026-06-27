"use client";

/**
 * WaitingRoomOverlay — mutual waiting room shown while session phase is PENDING.
 *
 * Rendered OVER the already-mounted Excalidraw board (absolute fixed within the
 * chrome stacking context; board stays mounted so A/V mesh is continuous from
 * waiting into the live session).
 *
 * Composition contract: the workspace passes pre-built, already-wired
 * `micControlNode`, `camControlNode`, and `avTilesNode` React nodes — this
 * component provides only layout + role copy. No new A/V wiring lives here.
 *
 * In-person mode mechanics: `sessionMode` toggles locally; when IN_PERSON the
 * student-connected gate is bypassed (tutor beside student). Consent projection
 * onto tutor capture is explicitly Plan #2 and NOT implemented here.
 *
 * Log prefix: `wtr` (waiting room). Emits overlay_shown, student_connected,
 * start_clicked, live_entered at key transitions.
 */

import "./waiting-room-overlay.css";
import type { ReactNode } from "react";

export type WtrSessionMode = "LIVE" | "IN_PERSON";

export type WtrCopyStudentLinkState = "idle" | "copying" | "copied" | "error";

export type WaitingRoomOverlayProps = {
  /** Participant role — drives tutor vs student copy + affordances. */
  role: "tutor" | "student";
  /** Current session mode (local state owned by workspace). */
  sessionMode: WtrSessionMode;
  /**
   * True when sync presence AND ≥1 WebRTC-reachable peer.
   * Maps to `bothPartiesInRoom` in the workspace.
   * Tutor: gates the LIVE-mode Start button.
   * Student: drives the "connected" status copy (informational only).
   */
  studentConnected: boolean;
  /** Tutor display name — shown in student copy. */
  tutorName: string;
  /** Student display name — shown in tutor hint copy. */
  studentLabel: string;
  /**
   * True when all preconditions for the Start button are satisfied:
   *   - LIVE mode: studentConnected === true
   *   - IN_PERSON mode: always true
   */
  canStart: boolean;
  /** True while the Start server action is in-flight. */
  isStarting: boolean;
  /** Called when the tutor clicks Start. */
  onStart: () => void | Promise<void>;
  /** Called when the tutor changes the LIVE ↔ IN_PERSON toggle. */
  onSessionModeChange: (mode: WtrSessionMode) => void;
  /**
   * Pre-built mic control node (tutor: WbTopBarMicControl;
   * student: WbTopBarMicControlLive). Already wired to liveAv in the
   * workspace — no A/V coupling needed here.
   */
  micControlNode: ReactNode;
  /**
   * Pre-built cam control node (WbTopBarCamControl).
   * Already wired in the workspace.
   */
  camControlNode: ReactNode;
  /**
   * Pre-built A/V tiles panel node (AVTilesPanel with localTile + participants).
   * Already wired in the workspace.
   */
  avTilesNode: ReactNode;
  /**
   * Tutor-only: copies the authenticated /join/ student link (workspace handler).
   * Omitted for student role — control is not rendered.
   */
  onCopyStudentLink?: () => void | Promise<void>;
  /** Mirrors workspace `copyState` for label + disabled feedback. */
  copyStudentLinkState?: WtrCopyStudentLinkState;
  /** True when sync URL / key preconditions block copy (workspace-owned). */
  copyStudentLinkDisabled?: boolean;
};

/**
 * Full-surface overlay shown while the session is PENDING.
 *
 * z-index 51 sits just above the chrome (z-50) so the board stays mounted but
 * is obscured. Both roles see their own A/V preview; the tutor sees the Start
 * affordance + mode toggle; the student sees a calm waiting message.
 */
export function WaitingRoomOverlay({
  role,
  sessionMode,
  studentConnected,
  tutorName,
  studentLabel,
  canStart,
  isStarting,
  onStart,
  onSessionModeChange,
  micControlNode,
  camControlNode,
  avTilesNode,
  onCopyStudentLink,
  copyStudentLinkState = "idle",
  copyStudentLinkDisabled = false,
}: WaitingRoomOverlayProps) {
  const isTutor = role === "tutor";
  const inPerson = sessionMode === "IN_PERSON";

  const copyLinkLabel =
    copyStudentLinkState === "copying"
      ? "Copying…"
      : copyStudentLinkState === "copied"
        ? "Copied!"
        : copyStudentLinkState === "error"
          ? "Copy failed — try again"
          : "Copy student link";

  const startHintText = !canStart
    ? inPerson
      ? null
      : `Waiting for ${studentLabel} to connect…`
    : null;

  return (
    <div
      className="mynk-wtr-overlay"
      data-testid="wb-waiting-overlay"
      data-role={role}
      data-session-mode={sessionMode}
      aria-label={isTutor ? "Waiting room — ready to start" : "Waiting for session to start"}
    >
      {/* ── inner card ── */}
      <div className="mynk-wtr-card">

        {/* ── header ── */}
        <div className="mynk-wtr-header">
          {isTutor ? (
            <h2 className="mynk-wtr-title">Ready to start?</h2>
          ) : (
            <h2 className="mynk-wtr-title mynk-wtr-title--student" data-testid="wb-waiting-overlay-student-heading">
              {studentConnected
                ? `You're in\u2014${tutorName} will start the session shortly`
                : `Connecting\u2026`}
            </h2>
          )}
        </div>

        {/* ── A/V preview tiles ── */}
        <div className="mynk-wtr-tiles">
          {avTilesNode}
        </div>

        {/* ── A/V controls row ── */}
        <div className="mynk-wtr-av-controls">
          {micControlNode}
          {camControlNode}
        </div>

        {isTutor && (
          <>
            {/* ── mode toggle ── */}
            <div className="mynk-wtr-mode-toggle-wrap">
              <span className="mynk-wtr-mode-label">Session type</span>
              <div
                className="mynk-wtr-mode-toggle"
                role="group"
                aria-label="Session type"
                data-testid="wb-session-mode-toggle"
              >
                <button
                  type="button"
                  className={`mynk-wtr-mode-btn${sessionMode === "LIVE" ? " mynk-wtr-mode-btn--active" : ""}`}
                  onClick={() => onSessionModeChange("LIVE")}
                  aria-pressed={sessionMode === "LIVE"}
                  data-testid="wb-session-mode-live"
                >
                  Live (remote)
                </button>
                <button
                  type="button"
                  className={`mynk-wtr-mode-btn${sessionMode === "IN_PERSON" ? " mynk-wtr-mode-btn--active" : ""}`}
                  onClick={() => onSessionModeChange("IN_PERSON")}
                  aria-pressed={sessionMode === "IN_PERSON"}
                  data-testid="wb-session-mode-in-person"
                >
                  In-person
                </button>
              </div>
              {inPerson && (
                <p className="mynk-wtr-mode-note">
                  In-person: student is beside you — no remote connection required.
                  {/* Plan #2: consent-snapshot projection onto tutor capture hooks in here. */}
                </p>
              )}
            </div>

            {onCopyStudentLink && (
              <button
                type="button"
                className={`mynk-wtr-copy-link-btn${copyStudentLinkState === "copied" ? " mynk-wtr-copy-link-btn--copied" : ""}`}
                onClick={() => { void onCopyStudentLink(); }}
                disabled={copyStudentLinkDisabled || copyStudentLinkState === "copying"}
                data-testid="wb-waiting-copy-student-link"
                aria-label={copyLinkLabel}
              >
                {copyLinkLabel}
              </button>
            )}

            {/* ── start CTA ── */}
            <div className="mynk-wtr-cta">
              {startHintText && (
                <p
                  className="mynk-wtr-hint"
                  data-testid="wb-waiting-overlay-hint"
                  aria-live="polite"
                >
                  {startHintText}
                </p>
              )}
              <button
                type="button"
                className="mynk-wtr-start-btn"
                onClick={() => { void onStart(); }}
                disabled={!canStart || isStarting}
                data-testid="wb-start-session"
                aria-label={isStarting ? "Starting session…" : "Start session"}
              >
                {isStarting ? "Starting…" : "Start session"}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
