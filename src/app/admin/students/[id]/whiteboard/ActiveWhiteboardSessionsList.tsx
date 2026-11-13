"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";
import { SessionEntryBlocked } from "@/components/scheduling/SessionEntryBlocked";
import { Button } from "@/components/ui/button";
import { tutorControlState, type SessionEntryState } from "@/lib/scheduling/session-entry";
import { finalizeWhiteboardSessionWithOutbox } from "@/lib/recording/finalize-whiteboard-session-client";
import { deleteWhiteboardSessionAndDataAction } from "./notes-actions";
export type ActiveWbListItem = {
  id: string;
  startedAt: Date;
  /** Only a PENDING row shows the entry line under Resume. Omitted = no line. */
  sessionPhase?: string;
};

/**
 * Renders still-open (endedAt = null) whiteboard sessions for this
 * student so tutors can **Resume** the workspace, **End and review**
 * (SSG-2 anti-orphan path — navigates into workspace and runs the
 * full end-session pipeline), or **Cancel and delete** (destructive,
 * confirm-guarded).
 */
export function ResumeWhiteboardSessionLink({
  studentId,
  sessionId,
  entry,
  learnerName = "",
}: {
  studentId: string;
  sessionId: string;
  /**
   * The one entry rule's answer, passed only for a PENDING session (an ACTIVE one is past Start). Resume stays a
   * link either way: the waiting room it opens is where Start is disabled or offers "Start in person". The line
   * under the link is the SAME one Start shows (`SessionEntryBlocked`), so both controls give one answer.
   */
  entry?: SessionEntryState;
  learnerName?: string;
}) {
  const control = entry ? tutorControlState(entry) : null;
  const reason = control?.disabledReason ?? control?.onlineOnlyReason ?? null;
  const reasonId = `resume-whiteboard-session-reason-${sessionId}`;
  return (
    <div className="flex flex-col">
      <Button asChild variant="accent" className="min-h-11 whitespace-nowrap">
        <Link
          href={`/admin/students/${studentId}/whiteboard/${sessionId}/workspace`}
          data-testid="roster-resume-session"
          aria-describedby={reason ? reasonId : undefined}
        >
          Resume
        </Link>
      </Button>
      {reason ? (
        <SessionEntryBlocked
          size="line"
          id={reasonId}
          reason={reason}
          audience="tutor"
          learnerName={learnerName}
          inPersonStillOpen={control?.disabledReason == null}
          className="mt-2"
          data-testid="resume-whiteboard-session-reason"
        />
      ) : null}
    </div>
  );
}

export function ActiveWhiteboardSessionsList({
  studentId,
  sessions,
  variant = "card",
  entry,
  learnerName = "",
}: {
  studentId: string;
  sessions: readonly ActiveWbListItem[];
  /** The one entry rule's answer for this student and tutor; shown under Resume for PENDING rows. */
  entry?: SessionEntryState;
  learnerName?: string;
  /** `bare` omits the heading when a parent disclosure already titles the section. */
  variant?: "card" | "bare";
}) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
      {variant === "card" ? (
        <h4 className="m-0 text-sm font-semibold text-foreground">Open whiteboard sessions</h4>
      ) : null}
      <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
        These whiteboard rooms are still open — they haven&apos;t been ended yet. Resume one to
        pick up where you left off, or end it to finalize the recording and go to review.
        Starting a new room adds another open session, so end any you&apos;re no longer using.
      </p>
      <ul className="m-0 list-none divide-y divide-border p-0">
        {sessions.map((s) => (
          <RosterRow
            key={s.id}
            studentId={studentId}
            session={s}
            entry={s.sessionPhase === "PENDING" ? entry : undefined}
            learnerName={learnerName}
          />
        ))}
      </ul>
    </div>
  );
}

function RosterRow({
  studentId,
  session,
  entry,
  learnerName,
}: {
  studentId: string;
  session: ActiveWbListItem;
  entry?: SessionEntryState;
  learnerName: string;
}) {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, startDeleteTransition] = useTransition();
  const [finalizing, startFinalizeTransition] = useTransition();
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const handleEndAndReview = () => {
    setFinalizeError(null);
    startFinalizeTransition(async () => {
      const result = await finalizeWhiteboardSessionWithOutbox(
        session.id,
        studentId
      );
      if (!result.ok) {
        setFinalizeError(result.error);
        return;
      }
      router.push(
        `/admin/students/${studentId}/whiteboard/${session.id}/workspace`
      );
    });
  };
  const handleDelete = () => {
    setShowDeleteConfirm(false);
    startDeleteTransition(async () => {
      // Navigate away immediately (optimistic). Fire delete in background;
      // cron sweep reconciles any orphaned rows if the delete fails.
      router.push(`/admin/students/${studentId}`);
      const result = await deleteWhiteboardSessionAndDataAction(session.id);
      if (!result.ok) {
        console.error(
          `[nsi] wbsid=${session.id} roster_delete_failed err=${result.error}`
        );
      }
    });
  };

  const startedAtIso = session.startedAt.toISOString();

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <span className="min-w-0 flex-1 text-sm text-muted-foreground pt-1">
        Started{" "}
        <LocalDateTimeText dateTime={startedAtIso} className="text-muted-foreground" />
        <span className="label-mono ml-2 text-[11px] opacity-70">({session.id.slice(0, 8)}…)</span>
      </span>

      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        <div className="flex flex-wrap items-center gap-2">
          <ResumeWhiteboardSessionLink
            studentId={studentId}
            sessionId={session.id}
            entry={entry}
            learnerName={learnerName}
          />

          {/* End and review — WS-C server finalize, then straight to review overlay */}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 whitespace-nowrap"
            onClick={handleEndAndReview}
            disabled={finalizing || deleting || showDeleteConfirm}
            data-testid="roster-end-and-review"
          >
            {finalizing ? "Finalizing…" : "End and review"}
          </Button>
          {/* Cancel and delete — destructive, confirm-guarded */}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 whitespace-nowrap text-destructive hover:text-destructive"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting || showDeleteConfirm}
            data-testid="roster-cancel-delete"
            aria-label="Cancel and delete this session and its recording"
          >
            {deleting ? "Deleting…" : "Cancel and delete"}
          </Button>
        </div>

        {finalizeError && (
          <p
            role="alert"
            className="text-xs text-destructive"
            data-testid="roster-end-and-review-error"
          >
            {finalizeError}
          </p>
        )}

        {/* Inline confirm dialog for destructive delete */}        {showDeleteConfirm && (
          <div
            role="alertdialog"
            aria-label="Confirm cancel and delete"
            className="rounded-md border p-3 text-sm"
            style={{
              background: "var(--error-soft)",
              border: "1px solid var(--error-border)",
              maxWidth: 340,
            }}
            data-testid="roster-cancel-delete-confirm"
          >
            <p className="m-0 mb-2 font-semibold" style={{ color: "var(--sign-out)" }}>
              Delete this session and its recording?
            </p>
            <p className="m-0 mb-3 text-xs text-muted-foreground">
              This removes the session row, any audio recording, and any draft notes.
              This can&apos;t be undone.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                style={{
                  background: "var(--sign-out)",
                  color: "white",
                  borderColor: "var(--sign-out)",
                }}
                onClick={handleDelete}
                data-testid="roster-cancel-delete-confirm-yes"
              >
                Yes, delete
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setShowDeleteConfirm(false)}
                data-testid="roster-cancel-delete-confirm-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
