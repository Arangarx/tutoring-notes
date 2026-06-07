import "server-only";

/**
 * Recording re-arch Phase 1 — D2 transcription pipeline transport (layer 1 + 2).
 *
 * Durable DB-as-queue transport (Andrew ratified cron/sweep over Vercel Queues beta,
 * 2026-06-07):
 *   (1) This helper — upsert a durable `pending` TranscriptChunk row, then fire-and-
 *       forget an immediate worker attempt (low latency).
 *   (2) Vercel Cron backstop sweep — `/api/cron/transcribe-sweep` catches orphans.
 *   (3) End-session sweep — deferred to slice 3 (handleEndSession).
 *
 * The push-mode consumer at `src/app/api/queues/chunk-transcribe/route.ts` remains
 * available if a managed queue is provisioned later; not wired today.
 */

import {
  getTranscriptChunkByBlobUrl,
  upsertTranscriptChunk,
} from "@/lib/recording/transcript-store";
import { processChunkTranscribeJob, type ChunkTranscribeInput } from "@/lib/recording/transcription-worker";

export type { ChunkTranscribeInput };

function fireAndForgetWorker(job: ChunkTranscribeInput): void {
  void (async () => {
    try {
      await processChunkTranscribeJob(job);
    } catch (err: unknown) {
      console.error(
        `[txc] wbsid=${job.sessionId} action=enqueue_immediate_error err=${err instanceof Error ? err.message : String(err)}`
      );
    }
  })();
}

/**
 * Enqueue a chunk-transcribe job.
 *
 * Upserts a durable `pending` row first so a cron sweep can recover if the
 * immediate attempt never runs. Then fires the worker without awaiting it.
 *
 * Safe to call from server actions and API routes. Never throws — errors
 * are logged and swallowed to keep the upload-confirm path non-blocking.
 */
export async function enqueueChunkTranscribe(job: ChunkTranscribeInput): Promise<void> {
  const { sessionId, chunkBlobUrl } = job;

  console.log(
    `[txc] wbsid=${sessionId} action=enqueue chunkBlobUrl=${chunkBlobUrl} offsetMs=${job.recordingTimeOffsetMs ?? "n/a"}`
  );

  try {
    const existing = await getTranscriptChunkByBlobUrl(sessionId, chunkBlobUrl);

    if (existing?.status !== "done") {
      const recordingTimeOffsetMs =
        typeof job.recordingTimeOffsetMs === "number" ? job.recordingTimeOffsetMs : 0;

      // Only (re-)mark pending when not actively transcribing — avoids clobbering in-flight work.
      if (!existing || existing.status === "pending" || existing.status === "failed") {
        await upsertTranscriptChunk({
          sessionId,
          chunkBlobUrl,
          recordingTimeOffsetMs,
          status: "pending",
        });
        console.log(
          `[txc] wbsid=${sessionId} action=enqueue_pending_upsert chunkBlobUrl=${chunkBlobUrl}`
        );
      }
    }
  } catch (err: unknown) {
    console.error(
      `[txc] wbsid=${sessionId} action=enqueue_pending_error err=${err instanceof Error ? err.message : String(err)}`
    );
    // Continue to fire the immediate attempt — worker may still succeed.
  }

  fireAndForgetWorker(job);
}
