"use server";

/**
 * Recording re-arch Phase 1, Slice 3 — notes pipeline server actions.
 *
 * These actions are the tutor-facing entry points for:
 *   - Triggering notes generation after session end (called from workspace client)
 *   - Kicking straggler transcript chunks at session end (end-session sweep)
 *   - Polling for TutorNote status (called from review page)
 *   - Regenerating notes (escape hatch for failures)
 *
 * Trust posture:
 *   - ALL actions start with assertOwnsWhiteboardSession (multi-tenant gate).
 *   - Downstream workers that run in fire-and-forget contexts are invoked only
 *     AFTER ownership has been validated here.
 *   - logCostEvent uses whiteboardSessionId FK — validated against existing session row.
 */

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
