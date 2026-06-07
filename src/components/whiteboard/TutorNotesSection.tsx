"use client";

/**
 * Recording re-arch Phase 1, Slice 3 — auto-notes post-session UX (REQ-S3-4 bridge).
 *
 * After session end, TutorNote is auto-generated as structured JSON; this component:
 *
 *   1. Shows a skeleton/loading state while TutorNote.status = pending | generating
 *   2. Polls every 3s until done, partial, or failed
 *   3. When done: shows an editable structured form (Topics / Assessment / Plan / Links)
 *      with Save (DRAFT → READY) and Cancel+delete session data buttons
 *   4. Shows error card with "Regenerate" escape hatch on failure
 *   5. Times out after 5 minutes with graceful defeat message
 *
 * Save → saveDraftSessionNoteAction → SessionNote finalized (READY), appears in
 *   student's notes list at /admin/students/[id]/notes.
 * Cancel+delete → confirm dialog ("Are you sure you want to delete this session
 *   and all related data?") → deleteWhiteboardSessionAndDataAction → redirect to
 *   student page.
 * Regenerate → confirm dialog → regenerateNotesAction → re-polls until done.
 *
 * Accessibility: status updates are announced via aria-live region.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  getTutorNoteStatusAction,
  regenerateNotesAction,
  saveDraftSessionNoteAction,
  deleteWhiteboardSessionAndDataAction,
  type TutorNoteStatusResult,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  whiteboardSessionId: string;
  studentId: string;
  /** Initial TutorNote state from SSR (may be null if no note yet). */
  initialNote: TutorNoteStatusResult;
  /** Whether the session has any audio recordings. */
  hasAudio: boolean;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StructuredFields = {
  topics: string;
  assessment: string;
  nextSteps: string;
  links: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Polling interval in ms while notes are pending/generating. */
const POLL_INTERVAL_MS = 3_000;

/** Client-side skeleton timeout in ms — matches ratified Q5 (5 min). */
const SKELETON_TIMEOUT_MS = 5 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse TutorNote.content as structured JSON.
 * Falls back gracefully for legacy markdown content (pre-bridge rows).
 */
function parseNoteContent(content: string | null): StructuredFields {
  if (!content) return { topics: "", assessment: "", nextSteps: "", links: "" };
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      topics: typeof parsed.topics === "string" ? parsed.topics : "",
      assessment:
        typeof parsed.assessment === "string" ? parsed.assessment : "",
      nextSteps:
        typeof parsed.nextSteps === "string"
          ? parsed.nextSteps
          : typeof parsed.plan === "string"
            ? parsed.plan
            : "",
      links: typeof parsed.links === "string" ? parsed.links : "",
    };
  } catch {
    // Legacy markdown content — surface in topics for manual review
    return { topics: content, assessment: "", nextSteps: "", links: "" };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TutorNotesSection({
  whiteboardSessionId,
  studentId,
  initialNote,
  hasAudio,
}: Props) {
  const router = useRouter();

  const [note, setNote] = useState<TutorNoteStatusResult>(initialNote);
  const [timedOut, setTimedOut] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Editable form state — initialized from parsed note content when done
  const [fields, setFields] = useState<StructuredFields>(() =>
    initialNote.found && initialNote.content
      ? parseNoteContent(initialNote.content)
      : { topics: "", assessment: "", nextSteps: "", links: "" }
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // Sync fields whenever a fresh note arrives from polling
  useEffect(() => {
    if (note.found && note.content) {
      setFields(parseNoteContent(note.content));
    }
  }, [note]);

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

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleRegenerate = useCallback(async () => {
    if (
      !window.confirm(
        "Regenerate the session notes? The current draft will be replaced if generation succeeds."
      )
    ) {
      return;
    }

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

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveDraftSessionNoteAction(
        whiteboardSessionId,
        fields
      );
      if (!result.ok) {
        setSaveError(result.error ?? "Could not save the note. Please try again.");
      } else {
        // Navigate to the student notes list to see the finalized note
        router.push(`/admin/students/${studentId}/notes`);
      }
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save the note. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }, [whiteboardSessionId, fields, router, studentId]);

  const handleDelete = useCallback(async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this session and all related data?"
      )
    ) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteWhiteboardSessionAndDataAction(whiteboardSessionId);
      if (!result.ok) {
        setDeleteError(result.error ?? "Could not delete the session. Please try again.");
        setDeleting(false);
      } else {
        router.push(`/admin/students/${studentId}`);
      }
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete the session. Please try again."
      );
      setDeleting(false);
    }
  }, [whiteboardSessionId, router, studentId]);

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
        {/* Regenerate escape hatch — confirm dialog required */}
        {(isDone || isFailed || timedOut) && (
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: "3px 10px" }}
            onClick={handleRegenerate}
            disabled={regenerating || saving || deleting}
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

      {/* Done: show editable structured form */}
      {isDone && (
        <div data-testid="tutor-notes-content">
          {note.found && note.isPartial && (
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

          <div style={{ display: "grid", gap: 12 }}>
            <NoteField
              label="Topics covered"
              id="wb-note-topics"
              value={fields.topics}
              onChange={(v) => setFields((f) => ({ ...f, topics: v }))}
              placeholder="e.g. Quadratics, factoring, FOIL method"
            />
            <NoteField
              label="Assessment"
              id="wb-note-assessment"
              value={fields.assessment}
              onChange={(v) => setFields((f) => ({ ...f, assessment: v }))}
              placeholder="Where the student stands — strengths, struggles, mastery level"
            />
            <NoteField
              label="Plan / Next steps"
              id="wb-note-nextsteps"
              value={fields.nextSteps}
              onChange={(v) => setFields((f) => ({ ...f, nextSteps: v }))}
              placeholder="What to do next, including any homework"
              hint="Covers both plan and homework"
            />
            <NoteField
              label="Links"
              id="wb-note-links"
              value={fields.links}
              onChange={(v) => setFields((f) => ({ ...f, links: v }))}
              placeholder="URLs mentioned (one per line)"
            />
          </div>

          {saveError && (
            <div
              role="alert"
              style={{
                background: "var(--error-soft)",
                border: "1px solid var(--error-border)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 13,
                color: "var(--sign-out)",
                marginTop: 8,
              }}
            >
              {saveError}
            </div>
          )}

          {deleteError && (
            <div
              role="alert"
              style={{
                background: "var(--error-soft)",
                border: "1px solid var(--error-border)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 13,
                color: "var(--sign-out)",
                marginTop: 4,
              }}
            >
              {deleteError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn primary"
              onClick={handleSave}
              disabled={saving || deleting || regenerating}
              data-testid="wb-save-note"
            >
              {saving ? "Saving…" : "Save to notes"}
            </button>
            <button
              type="button"
              className="btn"
              style={{ color: "var(--sign-out)", borderColor: "var(--error-border)" }}
              onClick={handleDelete}
              disabled={saving || deleting || regenerating}
              data-testid="wb-delete-session"
            >
              {deleting ? "Deleting…" : "Cancel and delete session data"}
            </button>
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
// NoteField — single editable textarea field
// ---------------------------------------------------------------------------

function NoteField({
  label,
  id,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label
        htmlFor={id}
        style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}
      >
        {label}
        {hint && (
          <span
            style={{ fontWeight: 400, marginLeft: 6, fontSize: 11, opacity: 0.7 }}
          >
            ({hint})
          </span>
        )}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={value.split("\n").length > 2 ? value.split("\n").length + 1 : 3}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: 13,
          lineHeight: 1.5,
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          resize: "vertical",
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      />
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
