import "server-only";

/**
 * Recording re-arch Phase 1 — Vercel Cron backstop for orphaned TranscriptChunk rows.
 *
 * Layer 2 of the durable DB-as-queue transport:
 *   (1) immediate fire-and-forget on enqueue (chunk-transcribe-enqueue.ts)
 *   (2) this periodic sweep — catches stragglers when the immediate attempt dies
 *   (3) end-session sweep — deferred to slice 3 (handleEndSession)
 *
 * Log prefix: [txc]
 */

import type { TranscriptChunk } from "@prisma/client";
import { findStaleTranscriptChunksForSweep } from "@/lib/recording/transcript-store";
import {
  TRANSCRIBE_SWEEP_BATCH_LIMIT,
  TRANSCRIBE_SWEEP_MAX_ATTEMPTS,
  TRANSCRIBE_SWEEP_STALE_THRESHOLD_MS,
  TRANSCRIBE_SWEEP_TIME_BUDGET_MS,
} from "@/lib/recording/transcribe-sweep-config";
import { processChunkTranscribeJob } from "@/lib/recording/transcription-worker";

export type TranscribeSweepResult = {
  scanned: number;
  processed: number;
  done: number;
  skipped: number;
  failed: number;
  timedOut: boolean;
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

  return result;
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
