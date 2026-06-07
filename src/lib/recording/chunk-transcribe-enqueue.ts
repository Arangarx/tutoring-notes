import "server-only";

/**
 * Recording re-arch Phase 1, Slice 2a — D2 transcription pipeline.
 *
 * Server-side publish helper: enqueues a chunk-transcribe job behind a
 * clean typed interface that slice 2b's producer will call when a chunk
 * blob is confirmed uploaded.
 *
 * QUEUE ABSTRACTION STATUS:
 *   Vercel Queues is not yet provisioned for this project.
 *   TODO(vercel-queues): Wire the real Vercel Queues SDK/binding here.
 *   Steps to upgrade:
 *     1. Provision the 'chunk-transcribe' Vercel Queue topic (infra/greenlight item).
 *     2. Install the Vercel Queues SDK when available.
 *     3. Replace the direct-invocation body below with a Queue.publish() call.
 *     4. The consumer endpoint at src/app/api/queues/chunk-transcribe/route.ts
 *        already implements the push-mode contract — register it as the consumer.
 *
 *   Until the real binding is wired in, this helper invokes the worker directly
 *   (synchronous in-process call). This means:
 *   - Transcription is synchronous with the upload-confirm path (not truly decoupled yet).
 *   - No at-least-once delivery retry from the queue layer.
 *   - Unit tests remain valid: they call the worker directly via this interface.
 *
 * The INTERFACE is stable — slice 2b callers need not change when the queue binding lands.
 */

import { processChunkTranscribeJob, type ChunkTranscribeInput } from "@/lib/recording/transcription-worker";

export type { ChunkTranscribeInput };

/**
 * Enqueue a chunk-transcribe job.
 *
 * When Vercel Queues is provisioned, this publishes a message to the
 * 'chunk-transcribe' topic. Until then, invokes the worker directly.
 *
 * Safe to call from server actions and API routes. Never throws — errors
 * are logged and swallowed to keep the upload-confirm path non-blocking.
 */
export async function enqueueChunkTranscribe(job: ChunkTranscribeInput): Promise<void> {
  // TODO(vercel-queues): Replace the body below with:
  //   await vercelQueue("chunk-transcribe").publish(job);
  // The consumer at src/app/api/queues/chunk-transcribe/route.ts handles the push.

  console.log(
    `[txc] wbsid=${job.sessionId} action=enqueue_direct chunkBlobUrl=${job.chunkBlobUrl} offsetMs=${job.recordingTimeOffsetMs ?? "n/a"}`
  );

  try {
    await processChunkTranscribeJob(job);
  } catch (err: unknown) {
    // Swallow — the worker logs failures; the caller (upload-confirm path)
    // must not be blocked by transcription infrastructure issues.
    console.error(
      `[txc] wbsid=${job.sessionId} action=enqueue_direct_error err=${err instanceof Error ? err.message : String(err)}`
    );
  }
}
