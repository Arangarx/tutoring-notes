import "server-only";

/**
 * Recording re-arch Phase 1, Slice 2a — D2 transcription pipeline.
 *
 * Transcription worker: given a chunk-transcribe job, fetches the blob,
 * transcribes it, and persists the result.
 *
 * Reliability requirements (all enforced — make-or-break):
 *
 *  (a) IDEMPOTENT under at-least-once delivery.
 *      Re-processing the same (sessionId, chunkBlobUrl) must not duplicate or corrupt.
 *      If status is already 'done', the worker no-ops immediately.
 *      All DB writes use upsertTranscriptChunk which has a unique constraint on
 *      (sessionId, chunkBlobUrl).
 *
 *  (b) PARTIAL-FAILURE ISOLATION.
 *      This function is scoped to ONE chunk per invocation. On failure the chunk
 *      is marked 'failed' (with captured error) and the function returns normally
 *      (no throw). Other chunks are processed in separate invocations — never blocked.
 *      Failed chunks are retryable by re-delivering the queue message.
 *
 *  (c) NO SILENT LOSS.
 *      Every outcome writes a row/status. Status transitions:
 *      [new] → pending → transcribing → done | failed
 *
 * Log prefix: [txc]  Per-session ID on every line.
 */

import { fetchPrivateBlobBytes } from "@/lib/blob";
import {
  getTranscriptChunkByBlobUrl,
  upsertTranscriptChunk,
  getTranscriptChunksBySessionId,
} from "@/lib/recording/transcript-store";
import { transcribeChunk } from "@/lib/recording/transcribe-chunk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChunkTranscribeInput = {
  sessionId: string;
  chunkBlobUrl: string;
  /**
   * Preferred recording-time offset in ms from the session's monotonic clock.
   * When absent (producer did not supply it), the worker derives it from the
   * sum of prior completed TranscriptChunk.durationMs for this session.
   */
  recordingTimeOffsetMs?: number;
};

// ---------------------------------------------------------------------------
// Offset derivation
// ---------------------------------------------------------------------------

/**
 * Derive a recording-time offset by summing the durationMs of all existing
 * 'done' TranscriptChunk rows for the session.
 *
 * Phase 1 fallback only — the producer will supply recordingTimeOffsetMs in
 * slice 2b; this derivation is used only when the field is absent.
 */
async function deriveRecordingTimeOffsetMs(sessionId: string): Promise<number> {
  const existing = await getTranscriptChunksBySessionId(sessionId);
  let total = 0;
  for (const chunk of existing) {
    if (chunk.status === "done" && chunk.durationMs != null) {
      total += chunk.durationMs;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/**
 * Process a single chunk-transcribe job.
 *
 * Safe for at-least-once delivery: idempotent on (sessionId, chunkBlobUrl).
 * Never throws — all error paths are captured in the DB row and logged.
 *
 * @returns 'done' if successfully transcribed (or was already done),
 *          'failed' if a non-retryable failure was persisted to the row,
 *          'skipped' if the chunk was already done (idempotent no-op).
 */
export async function processChunkTranscribeJob(
  input: ChunkTranscribeInput
): Promise<"done" | "failed" | "skipped"> {
  const { sessionId, chunkBlobUrl } = input;

  console.log(
    `[txc] wbsid=${sessionId} action=worker_start chunkBlobUrl=${chunkBlobUrl}`
  );

  // --- 1. Idempotency check ---------------------------------------------------
  const existing = await getTranscriptChunkByBlobUrl(sessionId, chunkBlobUrl);
  const priorAttempts = existing?.attempts ?? 0;

  if (existing?.status === "done") {
    console.log(
      `[txc] wbsid=${sessionId} action=worker_skip reason=already_done chunkId=${existing.id}`
    );
    return "skipped";
  }

  // --- 2. Resolve recording-time offset ---------------------------------------
  const recordingTimeOffsetMs =
    typeof input.recordingTimeOffsetMs === "number"
      ? input.recordingTimeOffsetMs
      : await deriveRecordingTimeOffsetMs(sessionId);

  console.log(
    `[txc] wbsid=${sessionId} action=worker_offset offsetMs=${recordingTimeOffsetMs} source=${typeof input.recordingTimeOffsetMs === "number" ? "producer" : "derived"}`
  );

  // --- 3. Mark as transcribing ------------------------------------------------
  await upsertTranscriptChunk({
    sessionId,
    chunkBlobUrl,
    recordingTimeOffsetMs,
    status: "transcribing",
  });

  // --- 4. Fetch the blob -------------------------------------------------------
  let buffer: Buffer;
  let filename: string;
  let mimeType: string;

  try {
    const { buffer: blobBuffer, contentType } = await fetchPrivateBlobBytes(chunkBlobUrl);
    buffer = blobBuffer;

    // Infer filename from URL path; mimeType from Content-Type header.
    const urlPath = new URL(chunkBlobUrl).pathname;
    filename = urlPath.split("/").at(-1) ?? "chunk.webm";
    mimeType = contentType || "audio/webm;codecs=opus";

    console.log(
      `[txc] wbsid=${sessionId} action=blob_fetched bytes=${buffer.byteLength} file=${filename}`
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[txc] wbsid=${sessionId} action=blob_fetch_failed err=${errMsg}`
    );
    // Mark as failed — retryable via cron sweep / re-delivery.
    await upsertTranscriptChunk({
      sessionId,
      chunkBlobUrl,
      recordingTimeOffsetMs,
      status: "failed",
      error: `Blob fetch failed: ${errMsg}`,
      attempts: priorAttempts + 1,
    });
    return "failed";
  }

  // --- 5. Transcribe ----------------------------------------------------------
  const result = await transcribeChunk({ buffer, filename, mimeType, sessionId });

  if ("error" in result) {
    console.error(
      `[txc] wbsid=${sessionId} action=transcribe_failed err=${result.error}`
    );
    await upsertTranscriptChunk({
      sessionId,
      chunkBlobUrl,
      recordingTimeOffsetMs,
      status: "failed",
      error: result.error,
      attempts: priorAttempts + 1,
    });
    return "failed";
  }

  // --- 6. Persist result (status=done) ----------------------------------------
  await upsertTranscriptChunk({
    sessionId,
    chunkBlobUrl,
    recordingTimeOffsetMs,
    status: "done",
    transcript: result.transcript,
    durationMs: result.durationMs,
    transcribedAt: new Date(),
  });

  console.log(
    `[txc] wbsid=${sessionId} action=worker_done offsetMs=${recordingTimeOffsetMs} durationMs=${result.durationMs ?? "n/a"} model=${result.modelUsed}`
  );

  return "done";
}
