import "server-only";

/**
 * Recording re-arch Phase 1, Slice 3 — D7 notes pipeline transport.
 *
 * Durable DB-as-queue for notes reduce jobs (mirrors chunk-transcribe-enqueue.ts):
 *   (1) This helper — upsert a durable TutorNote{status:'pending'} row, then schedule
 *       an immediate reduce attempt via `after()` (low latency; preview-safe).
 *   (2) Cron backstop sweep — `/api/cron/transcribe-sweep` sweeps pending TutorNote
 *       rows for sealed sessions on Production (cron does not run on Preview).
 *
 * `after()` keeps the serverless function alive after the response is sent.
 * The polling loop inside the callback handles the case where chunk transcription
 * is still in-flight when notes-reduce first fires (common on Preview where cron
 * is absent and chunk transcription runs concurrently in a separate invocation).
 * Max poll window is ~4.5 min — well under the 5-min NOTES_COMPLETION_TIMEOUT_MS,
 * and under the workspace page's maxDuration = 300s (§1.8 PLATFORM-ASSUMPTIONS.md).
 *
 * Log prefix: [tnt]
 */

import { after } from "next/server";
import { upsertTutorNotePending, getTutorNoteBySessionId } from "@/lib/recording/transcript-store";
import { processNotesReduceJob } from "@/lib/recording/notes-worker";

/** Max time to poll for chunk completion inside the after() callback (ms). */
const AFTER_POLL_DEADLINE_MS = 4.5 * 60 * 1000; // 4.5 min
/** Interval between completion-gate polls inside the after() callback (ms). */
const AFTER_POLL_INTERVAL_MS = 5_000;

function fireAndForgetReduce(sessionId: string): void {
  // Use `after()` so Vercel keeps the function alive until notes are generated.
  // Without this, bare `void` promises are dropped when the serverless response
  // is sent — leaving TutorNote rows stuck at `pending` on Preview (no cron).
  //
  // The polling loop handles the concurrent-chunk-transcription case:
  //   - kickSessionChunksAction fires in a separate invocation (chunk after() callbacks)
  //   - triggerNotesGenerationAction fires in this invocation (notes after() callback)
  //   - Notes reduce polls the DB until all chunks are done (or deadline exceeded)
  after(async () => {
    const deadline = Date.now() + AFTER_POLL_DEADLINE_MS;

    try {
      for (;;) {
        const result = await processNotesReduceJob(sessionId);

        if (result.outcome !== "pending") {
          console.log(
            `[tnt] wbsid=${sessionId} action=after_done outcome=${result.outcome}`
          );
          break;
        }

        // Chunks not yet done — poll until they finish or deadline.
        const remaining = deadline - Date.now();
        if (remaining <= AFTER_POLL_INTERVAL_MS) {
          console.warn(
            `[tnt] wbsid=${sessionId} action=after_poll_deadline_reached msSinceSeal=n/a`
          );
          break;
        }

        console.log(
          `[tnt] wbsid=${sessionId} action=after_poll_wait intervalMs=${AFTER_POLL_INTERVAL_MS} remainingMs=${Math.round(remaining)}`
        );
        await new Promise<void>((resolve) => setTimeout(resolve, AFTER_POLL_INTERVAL_MS));
      }
    } catch (err: unknown) {
      console.error(
        `[tnt] wbsid=${sessionId} action=after_reduce_error err=${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
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
