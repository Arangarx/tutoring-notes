"use server";

/**
 * Recording re-arch Phase 1, Slice 3 — notes pipeline server actions.
 *
 * These actions are the tutor-facing entry points for:
 *   - Triggering notes generation after session end (called from workspace client)
 *   - Kicking straggler transcript chunks at session end (end-session sweep)
 *   - Polling for TutorNote status (called from review page)
 *   - Regenerating notes (escape hatch for failures) — confirm dialog required client-side
 *   - Saving a DRAFT SessionNote as finalized (DRAFT → READY)
 *   - Deleting a session and all related data (with ownership assertion)
 *
 * Trust posture:
 *   - ALL actions start with assertOwnsWhiteboardSession (multi-tenant gate).
 *   - Downstream workers that run in fire-and-forget contexts are invoked only
 *     AFTER ownership has been validated here.
 *   - logCostEvent uses whiteboardSessionId FK — validated against existing session row.
 *
 * Log prefixes: [tnt] (TutorNote pipeline), [nsi] (notes-session-integration).
 */

import { revalidatePath } from "next/cache";
import { db, withDbRetry } from "@/lib/db";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { enqueueNotesReduce } from "@/lib/recording/notes-enqueue";
import { enqueueChunkTranscribe } from "@/lib/recording/chunk-transcribe-enqueue";
import {
  getTutorNoteBySessionId,
  getTranscriptChunksBySessionId,
  updateTutorNote,
} from "@/lib/recording/transcript-store";
import type { TutorNote } from "@prisma/client";
import { TRANSCRIBE_SWEEP_MAX_ATTEMPTS } from "@/lib/recording/transcribe-sweep-config";
import { REDUCE_PROMPT_VERSION } from "@/lib/recording/notes-worker";

// ---------------------------------------------------------------------------
// (a) End-session sweep — kick non-done chunks for this session
// ---------------------------------------------------------------------------

/**
 * Called from WhiteboardWorkspaceClient after finalizeOutboxAfterEnd.
 * Kicks any non-done, non-permanently-failed TranscriptChunk rows so
 * transcription completes quickly before the reduce step fires.
 *
 * Fire-and-forget from the client — this action itself returns fast.
 * The actual chunk work runs in fire-and-forget sub-workers.
 *
 * Trust: assertOwnsWhiteboardSession before touching transcription infra.
 */
export async function kickSessionChunksAction(
  whiteboardSessionId: string
): Promise<{ kicked: number }> {
  await assertOwnsWhiteboardSession(whiteboardSessionId);

  const chunks = await getTranscriptChunksBySessionId(whiteboardSessionId);

  // Kick non-done, non-permanently-failed chunks (under max attempts).
  const toKick = chunks.filter(
    (c) =>
      c.status !== "done" &&
      !(c.status === "failed" && c.attempts >= TRANSCRIBE_SWEEP_MAX_ATTEMPTS)
  );

  console.log(
    `[txc] wbsid=${whiteboardSessionId} action=session_sweep_kick eligible=${toKick.length} total=${chunks.length}`
  );

  for (const chunk of toKick) {
    // Fire-and-forget per chunk — reuses existing enqueue mechanism with durability.
    await enqueueChunkTranscribe({
      sessionId: whiteboardSessionId,
      chunkBlobUrl: chunk.chunkBlobUrl,
      recordingTimeOffsetMs: chunk.recordingTimeOffsetMs,
    });
  }

  return { kicked: toKick.length };
}

// ---------------------------------------------------------------------------
// (c) Notes reduce trigger — called after session end
// ---------------------------------------------------------------------------

/**
 * Trigger auto-notes generation for a session.
 *
 * Called from WhiteboardWorkspaceClient after finalizeOutboxAfterEnd (fire-and-forget).
 * Upserts a pending TutorNote row, then fires the immediate reduce attempt.
 *
 * Idempotent: if TutorNote is already done/partial, no-ops.
 *
 * Trust: assertOwnsWhiteboardSession before enqueue.
 */
export async function triggerNotesGenerationAction(
  whiteboardSessionId: string
): Promise<void> {
  await assertOwnsWhiteboardSession(whiteboardSessionId);

  console.log(
    `[tnt] wbsid=${whiteboardSessionId} action=trigger_notes_generation`
  );

  // Validate session is sealed — the worker also checks, but fail fast here.
  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: { endedAt: true },
      }),
    { label: "triggerNotesGenerationAction.session" }
  );

  if (!session?.endedAt) {
    console.warn(
      `[tnt] wbsid=${whiteboardSessionId} action=trigger_notes_skip reason=session_not_sealed`
    );
    return;
  }

  await enqueueNotesReduce(whiteboardSessionId);
}

// ---------------------------------------------------------------------------
// (d) Poll for TutorNote status — called from review page
// ---------------------------------------------------------------------------

export type TutorNoteStatusResult =
  | { found: false }
  | {
      found: true;
      status: string;
      content: string | null;
      isPartial: boolean;
      error: string | null;
      generatedAt: string | null;
    };

/**
 * Fetch the current TutorNote status for a session.
 * Used by the review page to poll until done.
 *
 * Trust: assertOwnsWhiteboardSession.
 */
export async function getTutorNoteStatusAction(
  whiteboardSessionId: string
): Promise<TutorNoteStatusResult> {
  await assertOwnsWhiteboardSession(whiteboardSessionId);

  const note = await getTutorNoteBySessionId(whiteboardSessionId);
  if (!note) {
    return { found: false };
  }

  return {
    found: true,
    status: note.status,
    content: note.content ?? null,
    isPartial: note.isPartial,
    error: note.error ?? null,
    generatedAt: note.generatedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// (e) Regenerate notes — escape hatch for failures
// ---------------------------------------------------------------------------

/**
 * Regenerate notes for a session.
 *
 * Resets the TutorNote to 'pending' and re-fires the reduce worker.
 * Used from the review page "Regenerate" escape hatch.
 *
 * Trust: assertOwnsWhiteboardSession.
 */
export async function regenerateNotesAction(
  whiteboardSessionId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertOwnsWhiteboardSession(whiteboardSessionId);

    const existing = await getTutorNoteBySessionId(whiteboardSessionId);
    if (existing && (existing.status === "generating")) {
      // Already generating — don't interrupt.
      console.log(
        `[tnt] wbsid=${whiteboardSessionId} action=regenerate_skip reason=already_generating`
      );
      return { ok: true };
    }

    if (existing) {
      // Reset to pending so the worker can re-run.
      await updateTutorNote(whiteboardSessionId, {
        status: "pending",
        error: null,
      });
      console.log(
        `[tnt] wbsid=${whiteboardSessionId} action=regenerate_reset`
      );
    }

    console.log(
      `[tnt] wbsid=${whiteboardSessionId} action=regenerate_trigger`
    );
    await enqueueNotesReduce(whiteboardSessionId);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[tnt] wbsid=${whiteboardSessionId} action=regenerate_failed err=${msg}`
    );
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Internal: load TutorNote for authorized session (used by review page SSR)
// ---------------------------------------------------------------------------

/**
 * Load TutorNote for a session during SSR of the review page.
 * assertOwnsWhiteboardSession must already have been called by the page.
 * This is a lightweight helper — not a server action.
 */
export async function loadTutorNoteForReview(
  whiteboardSessionId: string
): Promise<TutorNote | null> {
  return getTutorNoteBySessionId(whiteboardSessionId);
}

// ---------------------------------------------------------------------------
// (f) Save DRAFT SessionNote — finalize to READY (tutor-facing)
// ---------------------------------------------------------------------------

export type SaveDraftNoteFields = {
  topics: string;
  assessment: string;
  nextSteps: string;
  links: string;
};

export type SaveDraftNoteResult =
  | { ok: true; noteId: string }
  | { ok: false; error: string };

/**
 * Finalize the DRAFT SessionNote for a whiteboard session (DRAFT → READY).
 *
 * The tutor can edit the fields on the review page before saving.
 * If no DRAFT note exists yet (edge case: notes still generating when tutor
 * clicks Save), this action creates a new READY note from the provided fields.
 *
 * Trust: assertOwnsWhiteboardSession.
 * Log prefix: [nsi]
 */
export async function saveDraftSessionNoteAction(
  whiteboardSessionId: string,
  fields: SaveDraftNoteFields
): Promise<SaveDraftNoteResult> {
  try {
    const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

    const linksJson = fields.links
      ? JSON.stringify(
          fields.links
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
        )
      : "[]";

    let noteId: string;

    const existingNoteId = await withDbRetry(
      () =>
        db.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
          select: { noteId: true },
        }),
      { label: "saveDraftSessionNote.fetchNoteId" }
    ).then((s) => s?.noteId ?? null);

    if (existingNoteId) {
      // Update the existing DRAFT note and mark as READY
      await withDbRetry(
        () =>
          db.sessionNote.update({
            where: { id: existingNoteId },
            data: {
              topics: fields.topics,
              assessment: fields.assessment,
              nextSteps: fields.nextSteps,
              linksJson,
              status: "READY",
              aiGenerated: true,
              aiPromptVersion: REDUCE_PROMPT_VERSION,
            },
          }),
        { label: "saveDraftSessionNote.update" }
      );
      noteId = existingNoteId;
      console.log(
        `[nsi] wbsid=${whiteboardSessionId} action=save_draft_finalized noteId=${noteId}`
      );
    } else {
      // Edge case: no note exists yet — create a READY note directly
      const note = await withDbRetry(
        () =>
          db.sessionNote.create({
            data: {
              studentId: session.studentId,
              date: new Date(),
              topics: fields.topics,
              homework: "",
              assessment: fields.assessment,
              nextSteps: fields.nextSteps,
              linksJson,
              status: "READY",
              aiGenerated: true,
              aiPromptVersion: REDUCE_PROMPT_VERSION,
            },
            select: { id: true },
          }),
        { label: "saveDraftSessionNote.create" }
      );
      noteId = note.id;
      // Link the session → note
      await withDbRetry(
        () =>
          db.whiteboardSession.update({
            where: { id: whiteboardSessionId },
            data: { noteId },
          }),
        { label: "saveDraftSessionNote.linkNote" }
      );
      console.log(
        `[nsi] wbsid=${whiteboardSessionId} action=save_draft_created_ready noteId=${noteId}`
      );
    }

    revalidatePath(`/admin/students/${session.studentId}/notes`);
    revalidatePath(`/admin/students/${session.studentId}`);

    return { ok: true, noteId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[nsi] wbsid=${whiteboardSessionId} action=save_draft_failed err=${msg}`
    );
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// (g) Delete session and all related data — with confirm dialog client-side
// ---------------------------------------------------------------------------

export type DeleteSessionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Delete a whiteboard session and ALL related data:
 *   - DRAFT SessionNote (if exists and status=DRAFT; refuses if READY)
 *   - SessionRecording rows for this session
 *   - WhiteboardSession (cascades: TutorNote, TranscriptChunks, extractions, JoinTokens)
 *
 * IMPORTANT: Audio and events Blob files are NOT deleted here (that is the
 * stale-branch sweep utility's responsibility). DB rows only.
 *
 * Refuses (with error) if the attached SessionNote has already been finalized
 * (status=READY or SENT) — the tutor must manually detach the note first.
 *
 * Requires a confirm dialog client-side with the exact copy:
 * "Are you sure you want to delete this session and all related data?"
 *
 * Trust: assertOwnsWhiteboardSession. All deletes verified against the session's
 * studentId to prevent cross-student data leakage.
 * Log prefix: [nsi]
 */
export async function deleteWhiteboardSessionAndDataAction(
  whiteboardSessionId: string
): Promise<DeleteSessionResult> {
  try {
    const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

    const sessionDetail = await withDbRetry(
      () =>
        db.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
          select: { noteId: true, studentId: true },
        }),
      { label: "deleteSession.fetchDetail" }
    );

    if (!sessionDetail) {
      return { ok: false, error: "Session not found." };
    }

    // Verify ownership cross-check (belt + suspenders)
    if (sessionDetail.studentId !== session.studentId) {
      console.error(
        `[nsi] wbsid=${whiteboardSessionId} action=delete_session_rejected reason=studentId_mismatch`
      );
      return { ok: false, error: "Not authorized to delete this session." };
    }

    const noteId = sessionDetail.noteId;

    // If a note is linked, verify it's a DRAFT (not already finalized)
    if (noteId) {
      const note = await withDbRetry(
        () =>
          db.sessionNote.findUnique({
            where: { id: noteId },
            select: { id: true, status: true },
          }),
        { label: "deleteSession.checkNoteStatus" }
      );
      if (note && (note.status === "READY" || note.status === "SENT")) {
        console.warn(
          `[nsi] wbsid=${whiteboardSessionId} action=delete_session_rejected reason=note_already_finalized noteId=${noteId} status=${note.status}`
        );
        return {
          ok: false,
          error:
            "Cannot delete: this session's note has already been saved. Detach the note first if you wish to delete the session.",
        };
      }
    }

    console.log(
      `[nsi] wbsid=${whiteboardSessionId} action=delete_session_start noteId=${noteId ?? "none"} studentId=${session.studentId}`
    );

    await withDbRetry(
      () =>
        db.$transaction(async (tx) => {
          // 1. Delete DRAFT SessionNote (before deleting WB session, since SetNull cascade
          //    would otherwise just null noteId rather than delete the note)
          if (noteId) {
            await tx.sessionNote.delete({ where: { id: noteId } });
          }

          // 2. Delete SessionRecording rows for this session
          //    (WhiteboardSession FK is SetNull not Cascade — must delete explicitly)
          await tx.sessionRecording.deleteMany({
            where: { whiteboardSessionId },
          });

          // 3. Delete WhiteboardSession (cascades: TutorNote, TranscriptChunks,
          //    TranscriptChunkExtractions, WhiteboardJoinTokens)
          await tx.whiteboardSession.delete({
            where: { id: whiteboardSessionId },
          });
        }),
      { label: "deleteSession.transaction" }
    );

    console.log(
      `[nsi] wbsid=${whiteboardSessionId} action=delete_session_done studentId=${session.studentId}`
    );

    revalidatePath(`/admin/students/${session.studentId}`);
    revalidatePath(`/admin/students/${session.studentId}/notes`);

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[nsi] wbsid=${whiteboardSessionId} action=delete_session_failed err=${msg}`
    );
    return { ok: false, error: msg };
  }
}
