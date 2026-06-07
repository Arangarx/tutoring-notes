import "server-only";

/**
 * Recording re-arch Phase 1 — Vercel Cron backstop for orphaned TranscriptChunk
 * rows AND pending TutorNote rows.
 *
 * Layer 2 of the durable DB-as-queue transport:
 *   (1) immediate fire-and-forget on enqueue (chunk-transcribe-enqueue.ts / notes-enqueue.ts)
 *   (2) this periodic sweep — catches stragglers when the immediate attempt dies
 *   (3) end-session sweep (slice 3) — kickSessionChunksAction in handleEndSession
 *
 * Log prefix: [txc] for chunk transcription, [tnt] for notes pipeline
 */

import type { TranscriptChunk } from "@prisma/client";
import { db, withDbRetry } from "@/lib/db";
import { findStaleTranscriptChunksForSweep } from "@/lib/recording/transcript-store";
import {
  TRANSCRIBE_SWEEP_BATCH_LIMIT,
  TRANSCRIBE_SWEEP_MAX_ATTEMPTS,
  TRANSCRIBE_SWEEP_STALE_THRESHOLD_MS,
  TRANSCRIBE_SWEEP_TIME_BUDGET_MS,
} from "@/lib/recording/transcribe-sweep-config";
import { processChunkTranscribeJob } from "@/lib/recording/transcription-worker";
import { processNotesReduceJob } from "@/lib/recording/notes-worker";

export type TranscribeSweepResult = {
  scanned: number;
  processed: number;
  done: number;
  skipped: number;
  failed: number;
  timedOut: boolean;
  notesScanned: number;
  notesProcessed: number;
  notesDone: number;
  notesPending: number;
  notesFailed: number;
};

export async function runTranscribeSweep(
  now: Date = new Date()
): Promise<TranscribeSweepResult> {
  const staleBefore = new Date(now.getTime() - TRANSCRIBE_SWEEP_STALE_THRESHOLD_MS);
  const deadline = now.getTime() + TRANSCRIBE_SWEEP_TIME_BUDGET_MS;

  const chunks = await findStaleTranscriptChunksForSweep({
    staleBefore,
    maxAttempts: TRANSCRIBE_SWEEP_MAX_ATTEMPTS,
    limit: TRANSCRIBE_SWEEP_BATCH_LIMIT,
  });

  console.log(
    `[txc] action=sweep_start eligible=${chunks.length} staleBefore=${staleBefore.toISOString()} maxAttempts=${TRANSCRIBE_SWEEP_MAX_ATTEMPTS}`
  );

  const result: TranscribeSweepResult = {
    scanned: chunks.length,
    processed: 0,
    done: 0,
    skipped: 0,
    failed: 0,
    timedOut: false,
    notesScanned: 0,
    notesProcessed: 0,
    notesDone: 0,
    notesPending: 0,
    notesFailed: 0,
  };

  for (const chunk of chunks) {
    if (Date.now() >= deadline) {
      result.timedOut = true;
      console.warn(`[txc] action=sweep_time_budget_exceeded processed=${result.processed}`);
      break;
    }

    await processSweepChunk(chunk, result);
    result.processed += 1;
  }

  console.log(
    `[txc] action=sweep_done scanned=${result.scanned} processed=${result.processed} done=${result.done} skipped=${result.skipped} failed=${result.failed} timedOut=${result.timedOut}`
  );

  // Notes sweep — retry pending TutorNote rows for sealed sessions.
  if (!result.timedOut && Date.now() < deadline) {
    await runNotesSweep(result, deadline);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Notes sweep — retry pending TutorNote rows
// ---------------------------------------------------------------------------

/** Max notes rows processed per cron invocation. */
const NOTES_SWEEP_BATCH_LIMIT = 10;

/** Min age before a pending TutorNote is eligible for cron pickup. */
const NOTES_SWEEP_STALE_THRESHOLD_MS = 60_000;

async function runNotesSweep(
  result: TranscribeSweepResult,
  deadline: number
): Promise<void> {
  const staleBefore = new Date(Date.now() - NOTES_SWEEP_STALE_THRESHOLD_MS);

  // Find TutorNote rows that are pending for sealed sessions and haven't been
  // updated recently (to avoid racing the immediate attempt).
  const pendingNotes = await withDbRetry(
    () =>
      db.tutorNote.findMany({
        where: {
          status: { in: ["pending", "generating"] },
          createdAt: { lt: staleBefore },
          session: { endedAt: { not: null } },
        },
        select: { sessionId: true, status: true },
        orderBy: { createdAt: "asc" },
        take: NOTES_SWEEP_BATCH_LIMIT,
      }),
    { label: "notesSweep.findPending" }
  );

  result.notesScanned = pendingNotes.length;

  console.log(
    `[tnt] action=notes_sweep_start eligible=${pendingNotes.length} staleBefore=${staleBefore.toISOString()}`
  );

  for (const noteRow of pendingNotes) {
    if (Date.now() >= deadline) {
      console.warn(`[tnt] action=notes_sweep_time_budget_exceeded processed=${result.notesProcessed}`);
      break;
    }

    console.log(
      `[tnt] wbsid=${noteRow.sessionId} action=notes_sweep_pick status=${noteRow.status}`
    );

    try {
      const outcome = await processNotesReduceJob(noteRow.sessionId);
      result.notesProcessed += 1;

      if (outcome.outcome === "done" || outcome.outcome === "partial") {
        result.notesDone += 1;
      } else if (outcome.outcome === "pending") {
        result.notesPending += 1;
      } else if (outcome.outcome === "failed") {
        result.notesFailed += 1;
      }
    } catch (err: unknown) {
      console.error(
        `[tnt] wbsid=${noteRow.sessionId} action=notes_sweep_error err=${err instanceof Error ? err.message : String(err)}`
      );
      result.notesFailed += 1;
    }
  }

  console.log(
    `[tnt] action=notes_sweep_done scanned=${result.notesScanned} processed=${result.notesProcessed} done=${result.notesDone} pending=${result.notesPending} failed=${result.notesFailed}`
  );
}

async function processSweepChunk(
  chunk: TranscriptChunk,
  result: TranscribeSweepResult
): Promise<void> {
  console.log(
    `[txc] wbsid=${chunk.sessionId} action=sweep_pick chunkId=${chunk.id} status=${chunk.status} attempts=${chunk.attempts}`
  );

  const outcome = await processChunkTranscribeJob({
    sessionId: chunk.sessionId,
    chunkBlobUrl: chunk.chunkBlobUrl,
    recordingTimeOffsetMs: chunk.recordingTimeOffsetMs,
  });

  if (outcome === "done") {
    result.done += 1;
  } else if (outcome === "skipped") {
    result.skipped += 1;
  } else {
    result.failed += 1;
  }
}
