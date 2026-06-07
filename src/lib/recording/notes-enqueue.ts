import "server-only";

/**
 * Recording re-arch Phase 1, Slice 3 — D7 notes pipeline transport.
 *
 * Durable DB-as-queue for notes reduce jobs (mirrors chunk-transcribe-enqueue.ts):
 *   (1) This helper — upsert a durable TutorNote{status:'pending'} row, then
 *       fire-and-forget an immediate reduce attempt (low latency path).
 *   (2) Cron backstop sweep — `/api/cron/transcribe-sweep` is extended to also
 *       sweep TutorNote rows with status='pending' for sealed sessions where all
 *       chunks are done.
 *
 * The immediate attempt wins the typical case: session ends, all chunks already
 * transcribed (map phase ran during session), reduce fires in ~2s, TutorNote done.
 *
 * Log prefix: [tnt]
 */

import { upsertTutorNotePending, getTutorNoteBySessionId } from "@/lib/recording/transcript-store";
import { processNotesReduceJob } from "@/lib/recording/notes-worker";

function fireAndForgetReduce(sessionId: string): void {
  void (async () => {
    try {
      await processNotesReduceJob(sessionId);
    } catch (err: unknown) {
      console.error(
        `[tnt] wbsid=${sessionId} action=enqueue_immediate_error err=${err instanceof Error ? err.message : String(err)}`
      );
    }
  })();
}

/**
 * Enqueue a notes-reduce job for a session.
 *
 * Upserts a durable pending TutorNote row first (cron backstop durability),
 * then fires the reduce worker without awaiting.
 *
 * Idempotent: if a TutorNote row already exists and is done/partial, no-ops.
 * If it's failed, resets to pending so the retry can proceed.
 *
 * Safe to call from server actions. Never throws.
 */
export async function enqueueNotesReduce(sessionId: string): Promise<void> {
  console.log(`[tnt] wbsid=${sessionId} action=enqueue`);

  try {
    const existing = await getTutorNoteBySessionId(sessionId);

    if (existing?.status === "done" || existing?.status === "partial") {
      console.log(
        `[tnt] wbsid=${sessionId} action=enqueue_skip reason=already_${existing.status}`
      );
      return;
    }

    // Upsert pending row (idempotent — createOrSkip semantics via upsertTutorNotePending).
    await upsertTutorNotePending(sessionId);
    console.log(
      `[tnt] wbsid=${sessionId} action=enqueue_pending_upsert`
    );
  } catch (err: unknown) {
    console.error(
      `[tnt] wbsid=${sessionId} action=enqueue_pending_error err=${err instanceof Error ? err.message : String(err)}`
    );
    // Continue to fire the immediate attempt — worker is still useful even if DB upsert failed.
  }

  fireAndForgetReduce(sessionId);
}
