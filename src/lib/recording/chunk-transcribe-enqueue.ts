import "server-only";

/**
 * Recording re-arch Phase 1 — D2 transcription pipeline transport (layer 1 + 2).
 *
 * Durable DB-as-queue transport (Andrew ratified cron/sweep over Vercel Queues beta,
 * 2026-06-07):
 *   (1) This helper — upsert a durable `pending` TranscriptChunk row, then schedule
 *       an immediate worker attempt via `after()` so Vercel does not kill the work
 *       when the serverless response is sent (low-latency path; preview-safe).
 *   (2) Vercel Cron backstop sweep — `/api/cron/transcribe-sweep` catches orphans
 *       on Production (cron does not run on Preview deployments).
 *   (3) End-session sweep — kickSessionChunksAction in handleEndSession.
 *
 * `after()` (Next.js 15 §1.8 in PLATFORM-ASSUMPTIONS.md) keeps the serverless
 * function alive until the transcription callback completes, eliminating the
 * "fire-and-forget dropped on Preview" failure mode seen with bare `void`.
 *
 * The push-mode consumer at `src/app/api/queues/chunk-transcribe/route.ts` remains
 * available if a managed queue is provisioned later; not wired today.
 */

import { after } from "next/server";
import {
  getTranscriptChunkByBlobUrl,
  upsertTranscriptChunk,
} from "@/lib/recording/transcript-store";
import { processChunkTranscribeJob, type ChunkTranscribeInput } from "@/lib/recording/transcription-worker";
import { getPublicBaseUrl } from "@/lib/public-url";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";

export type { ChunkTranscribeInput };

function fireAndForgetWorker(job: ChunkTranscribeInput): void {
  // Use `after()` so Vercel keeps the function alive until the worker completes.
  // Without this, bare `void` promises are dropped when the serverless response
  // is sent — leaving TranscriptChunk rows stuck at `transcribing` on Preview.
  after(async () => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      // SHOULD-FIX-2 Option A: when CRON_SECRET is configured, route the work
      // through the guarded /api/queues/chunk-transcribe endpoint with a bearer
      // token so all worker invocations pass the same auth guard as the cron
      // sweep. The secret is only accessed server-side (this file is server-only).
      // When CRON_SECRET is absent, fall through to the direct-call path.
      const base = getPublicBaseUrl();
      try {
        const res = await fetch(`${base}/api/queues/chunk-transcribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify(job),
        });
        if (!res.ok) {
          console.error(
            `[txc] wbsid=${job.sessionId} action=after_worker_fetch_error status=${res.status}`
          );
        }
      } catch (err: unknown) {
        console.error(
          `[txc] wbsid=${job.sessionId} action=after_worker_fetch_error err=${err instanceof Error ? err.message : String(err)}`
        );
      }
      return;
    }
    // Fail-open: CRON_SECRET not set — call worker directly (local dev / pre-config).
    try {
      await processChunkTranscribeJob(job);
    } catch (err: unknown) {
      console.error(
        `[txc] wbsid=${job.sessionId} action=after_worker_error err=${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
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
  const streamId = job.streamId ?? TUTOR_MIC_STREAM_ID;
  const speakerId = job.speakerId ?? null;

  console.log(
    `[txc] wbsid=${sessionId} action=enqueue chunkBlobUrl=${chunkBlobUrl} offsetMs=${job.recordingTimeOffsetMs ?? "n/a"} streamId=${streamId}`
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
          streamId,
          speakerId,
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
