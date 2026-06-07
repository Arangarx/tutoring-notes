"use client";

/**
 * Recording re-arch Phase 1, Slice 3 — auto-notes post-session UX.
 *
 * Replaces the manual "Generate notes from session" button on the whiteboard
 * review page. Notes are generated automatically on session end; this component:
 *
 *   1. Shows a skeleton/loading state while TutorNote.status = pending | generating
 *   2. Polls every 3s until done, partial, or failed
 *   3. Shows notes when done (with partial badge if isPartial=true)
 *   4. Shows error card with "Regenerate" escape hatch on failure
 *   5. Times out after 5 minutes with graceful defeat message
 *
 * Accessibility: status updates are announced via aria-live region.
 * The "Regenerate" button is present but not prominently surfaced (escape hatch).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getTutorNoteStatusAction,
  regenerateNotesAction,
  type TutorNoteStatusResult,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  whiteboardSessionId: string;
  /** Initial TutorNote state from SSR (may be null if no note yet). */
  initialNote: TutorNoteStatusResult;
  /** Whether the session has any audio recordings. */
  hasAudio: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Polling interval in ms while notes are pending/generating. */
const POLL_INTERVAL_MS = 3_000;

/** Client-side skeleton timeout in ms — matches ratified Q5 (5 min). */
const SKELETON_TIMEOUT_MS = 5 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TutorNotesSection({
  whiteboardSessionId,
  initialNote,
  hasAudio,
}: Props) {
  const [note, setNote] = useState<TutorNoteStatusResult>(initialNote);
  const [timedOut, setTimedOut] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  const startTimeRef = useRef<number>(Date.now());
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active = notes are in-flight. Includes the "not yet created" case (race between
  // fire-and-forget triggerNotesGenerationAction and immediate review page load):
  // if there's audio but no TutorNote row yet, we poll until the row appears.
  const isActive =
    (note.found && (note.status === "pending" || note.status === "generating")) ||
    (!note.found && hasAudio);
  const isDone = note.found && (note.status === "done" || note.status === "partial");
  const isFailed = note.found && note.status === "failed";
  const isNotStarted = !note.found;

  // Poll while active
  const scheduleNextPoll = useCallback(() => {
    pollTimerRef.current = setTimeout(async () => {
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed >= SKELETON_TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }

      try {
        const result = await getTutorNoteStatusAction(whiteboardSessionId);
        setNote(result);

        // Continue polling while in-flight (pending/generating or row not created yet).
        const stillActive =
          !result.found ||
          result.status === "pending" ||
          result.status === "generating";
        if (stillActive) {
          scheduleNextPoll();
        }
      } catch {
        // Network error — retry at next interval
        scheduleNextPoll();
      }
    }, POLL_INTERVAL_MS);
  }, [whiteboardSessionId]);

  useEffect(() => {
    if (isActive && !timedOut) {
      scheduleNextPoll();
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isActive, timedOut, scheduleNextPoll]);

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    setRegenError(null);
    startTimeRef.current = Date.now();
    setTimedOut(false);

    try {
      const result = await regenerateNotesAction(whiteboardSessionId);
      if (!result.ok) {
        setRegenError(result.error ?? "Regeneration failed. Please try again.");
        setRegenerating(false);
        return;
      }
      // Refresh note status after trigger
      const updated = await getTutorNoteStatusAction(whiteboardSessionId);
      setNote(updated);
    } catch (err: unknown) {
      setRegenError(
        err instanceof Error ? err.message : "Regeneration failed. Please try again."
      );
    } finally {
      setRegenerating(false);
    }
  }, [whiteboardSessionId]);

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  // No note yet + no audio: don't show the notes section at all
  if (isNotStarted && !hasAudio) {
    return null;
  }

  return (
    <div
      className="card"
      style={{ padding: "14px 16px", display: "grid", gap: 12 }}
      data-testid="tutor-notes-section"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>Session notes</h3>
        {/* Regenerate escape hatch — visible only when notes exist or failed */}
        {(isDone || isFailed || timedOut) && (
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: "3px 10px" }}
            onClick={handleRegenerate}
            disabled={regenerating}
            data-testid="wb-regenerate-notes"
          >
            {regenerating ? "Regenerating…" : "Regenerate notes"}
          </button>
        )}
      </div>

      {/* Aria-live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isActive && "Generating session notes…"}
        {isDone && "Session notes are ready."}
        {isFailed && "Note generation failed."}
        {timedOut && "Note generation timed out."}
      </div>

      {/* Loading state */}
      {(isActive || (isNotStarted && hasAudio)) && !timedOut && (
        <SkeletonNotes />
      )}

      {/* Timeout defeat state */}
      {timedOut && (
        <div
          role="alert"
          style={{
            background: "var(--warning-soft)",
            border: "1px solid var(--warning-border)",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          <strong>Notes are taking longer than expected.</strong>{" "}
          The session transcript may still be processing. Click{" "}
          <strong>Regenerate notes</strong> in a few minutes to retry.
        </div>
      )}

      {/* Done: show notes */}
      {isDone && note.found && note.content && (
        <div data-testid="tutor-notes-content">
          {note.isPartial && (
            <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "var(--warning-soft)",
            border: "1px solid var(--warning-border)",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 10,
            color: "var(--warning-text)",
          }}
              title="Notes generated from partial transcript — some audio may be missing"
            >
              Partial transcript
            </div>
          )}
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
            }}
          >
            {note.content}
          </div>
        </div>
      )}

      {/* Done but no content (shouldn't happen but defensive) */}
      {isDone && note.found && !note.content && (
        <div className="muted" style={{ fontSize: 13 }}>
          Notes were generated but the content is empty. Click Regenerate to retry.
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div
          role="alert"
          style={{
            background: "var(--error-soft)",
            border: "1px solid var(--error-border)",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 13,
            color: "var(--sign-out)",
          }}
          data-testid="tutor-notes-error"
        >
          <strong>Note generation failed.</strong>{" "}
          {note.found && note.error
            ? note.error
            : "An unexpected error occurred."}{" "}
          Click <strong>Regenerate notes</strong> above to retry.
        </div>
      )}

      {/* Regeneration error */}
      {regenError && (
        <div
          role="alert"
          style={{
            background: "var(--error-soft)",
            border: "1px solid var(--error-border)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            color: "var(--sign-out)",
          }}
        >
          {regenError}
        </div>
      )}

      {/* No audio recorded at all */}
      {isNotStarted && !hasAudio && (
        <div className="muted" style={{ fontSize: 13 }}>
          No audio was recorded for this session. Notes are generated from the
          session recording.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton component — pure shimmer, no spinner
// ---------------------------------------------------------------------------

function SkeletonNotes() {
  return (
    <div
      aria-busy="true"
      data-testid="tutor-notes-skeleton"
      style={{ display: "grid", gap: 10 }}
    >
      {/* Section header skeleton (wider) */}
      <div
        style={{
          height: 12,
          width: "55%",
          borderRadius: 4,
          background:
            "linear-gradient(90deg, var(--surface-muted) 25%, var(--surface-hover) 50%, var(--surface-muted) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }}
        aria-hidden="true"
      />
      {/* Body lines */}
      {[100, 82, 94, 68, 88, 74, 60].map((w, i) => (
        <div
          key={i}
          style={{
            height: 13,
            width: `${w}%`,
            borderRadius: 4,
            background:
              "linear-gradient(90deg, var(--surface-muted) 25%, var(--surface-hover) 50%, var(--surface-muted) 75%)",
            backgroundSize: "200% 100%",
            animation: `shimmer 1.5s ${i * 0.07}s infinite`,
          }}
          aria-hidden="true"
        />
      ))}
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
        Generating session notes — this usually takes under a minute.
      </div>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </div>
  );
}
