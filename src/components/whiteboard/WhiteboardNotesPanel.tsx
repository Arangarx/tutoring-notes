"use client";

/**
 * Panel on the whiteboard review page that provides:
 *
 *   1. "Generate notes from this session" — transcribes WB audio +
 *      runs AI, then fills `NewNoteForm` for tutor review — same cue as the
 *      student-detail AI assistant ("Form filled — review and save.").
 *
 *   2. "Attach to note" — links the whiteboard session to an existing
 *      note (or a new blank one).
 *
 * `createNote` links `WhiteboardSession` rows when recordings carry
 * `whiteboardSessionId`, so Save does not need a separate attach call.
 */

import { useCallback, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateNotesFromWhiteboardSessionAction,
  attachWhiteboardToNoteAction,
} from "@/app/admin/students/[id]/whiteboard/actions";
import NewNoteForm, {
  type NewNoteFormHandle,
  type PopulatePayload,
} from "@/app/admin/students/[id]/NewNoteForm";
import AiGeneratedNoteReviewGate from "@/components/notes/AiGeneratedNoteReviewGate";
import { formatUserFacingActionError } from "@/lib/action-correlation";

type Props = {
  whiteboardSessionId: string;
  studentId: string;
  /** ISO date string for the session — pre-fills the note date. */
  sessionDate: string;
  /** noteId if already attached. */
  attachedNoteId: string | null;
  /** Whether OpenAI is configured on this server. */
  aiEnabled: boolean;
  /** True when the session has audio recordings. */
  hasAudio: boolean;
};

export default function WhiteboardNotesPanel({
  whiteboardSessionId,
  studentId,
  sessionDate,
  attachedNoteId,
  aiEnabled,
  hasAudio,
}: Props) {
  const router = useRouter();
  const formRef = useRef<NewNoteFormHandle>(null);
  const draftPayloadRef = useRef<PopulatePayload | null>(null);
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [hasDraftReview, setHasDraftReview] = useState(false);
  const [prefillWarning, setPrefillWarning] = useState<string | null>(
    null
  );
  const [prefillWarningKind, setPrefillWarningKind] = useState<
    "skipped-only" | "ai-fallback" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const sessionDateSlash = sessionDate.slice(0, 10);

  useLayoutEffect(() => {
    if (!hasDraftReview) return;
    const payload = draftPayloadRef.current;
    if (!payload) return;
    formRef.current?.populate(payload);
  }, [draftGeneration, hasDraftReview]);

  const dismissDraftReview = useCallback(() => {
    formRef.current?.clear();
    draftPayloadRef.current = null;
    setHasDraftReview(false);
    setPrefillWarning(null);
    setPrefillWarningKind(null);
    setStatus(null);
  }, []);

  function handleGenerateNotes() {
    setError(null);
    setPrefillWarning(null);
    setPrefillWarningKind(null);
    setStatus("Transcribing session audio…");
    startTransition(async () => {
      try {
        const result = await generateNotesFromWhiteboardSessionAction(
          whiteboardSessionId
        );

        if (!result.ok) {
          setError(formatUserFacingActionError(result.error, result.debugId));
          setStatus(null);
          return;
        }

        if (result.warning) setPrefillWarning(result.warning);
        if (result.warningKind) setPrefillWarningKind(result.warningKind);

        draftPayloadRef.current = {
          topics: result.topics,
          homework: result.homework,
          assessment: result.assessment,
          plan: result.plan,
          links: result.links,
          promptVersion: result.promptVersion,
          recordingIds: result.recordingIds,
          sessionStartedAt: result.sessionStartedAt,
          sessionEndedAt: result.sessionEndedAt,
          noteDate: sessionDateSlash,
        };
        setHasDraftReview(true);
        setDraftGeneration((g) => g + 1);
        setStatus(
          'Review the AI-filled note below — click "Save note" when ready.'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus(null);
      }
    });
  }

  function handleAttachNewBlank() {
    setError(null);
    setStatus("Creating blank note…");
    startTransition(async () => {
      try {
        const result = await attachWhiteboardToNoteAction(whiteboardSessionId, {
          mode: "new",
          newNoteFromDate: sessionDateSlash,
        });
        if (!result.ok) {
          setError(result.error);
          setStatus(null);
          return;
        }
        setStatus("Done! Redirecting…");
        router.push(`/admin/students/${studentId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
      }
    });
  }

  return (
    <div className="card" style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>Session notes</h3>

      {attachedNoteId && (
        <div
          style={{
            fontSize: 13,
            background: "rgba(34,197,94,0.10)",
            border: "1px solid rgba(34,197,94,0.30)",
            borderRadius: 6,
            padding: "8px 10px",
          }}
        >
          Note attached.{" "}
          <a href={`/admin/students/${studentId}`} style={{ fontSize: 13 }}>
            View / edit on student page →
          </a>
        </div>
      )}

      {status && (
        <div className="muted" style={{ fontSize: 13 }}>
          {status}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            background: "rgba(220,38,38,0.10)",
            border: "1px solid rgba(220,38,38,0.30)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      )}

      {hasDraftReview && (
        <>
          <AiGeneratedNoteReviewGate
            warning={prefillWarning}
            warningKind={prefillWarningKind}
            dismissButtonLabel="Cancel"
            onDismiss={dismissDraftReview}
          />
          <NewNoteForm
            ref={formRef}
            studentId={studentId}
            initialNoteDate={sessionDateSlash}
            onSaved={() => {
              dismissDraftReview();
              router.push(`/admin/students/${studentId}`);
            }}
          />
        </>
      )}

      {!hasDraftReview && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {aiEnabled && hasAudio && (
            <button
              type="button"
              className="btn primary"
              disabled={isPending}
              onClick={handleGenerateNotes}
              data-testid="wb-generate-notes"
            >
              {isPending && status?.startsWith("Transcrib")
                ? "Transcribing…"
                : isPending
                ? "Working…"
                : "Generate notes from session"}
            </button>
          )}

          {!aiEnabled && (
            <span className="muted" style={{ fontSize: 12 }}>
              AI note generation requires an OpenAI API key.
            </span>
          )}

          {!hasAudio && aiEnabled && (
            <span className="muted" style={{ fontSize: 12 }}>
              No audio was recorded — generate notes from{" "}
              <a href={`/admin/students/${studentId}`}>the student page</a>.
            </span>
          )}

          {!attachedNoteId && (
            <button
              type="button"
              className="btn"
              disabled={isPending}
              onClick={handleAttachNewBlank}
              data-testid="wb-attach-blank-note"
            >
              Create blank note for this session
            </button>
          )}
        </div>
      )}
    </div>
  );
}
