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
 *      pending | failed → refused (terminal; consent capabilities forbid the lane or notes)
 *
 * Log prefix: [txc]  Per-session ID on every line.
 */

import { fetchPrivateBlobBytes } from "@/lib/blob";
import {
  getTranscriptChunkByBlobUrl,
  upsertTranscriptChunk,
  getTranscriptChunksBySessionId,
  updateTranscriptChunkStatus,
} from "@/lib/recording/transcript-store";
import { transcribeChunk } from "@/lib/recording/transcribe-chunk";
import { extractChunkMap } from "@/lib/recording/extract-chunk";
import { db } from "@/lib/db";
import { isTutorApproved } from "@/lib/tutor-approval-scope";
import { gateTranscription, type LaneGateSurface } from "@/lib/recording/consent-gates";

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
  /**
   * Capture lane (`streamId`). Only used to CREATE a row. When a row already exists its stored lane wins and a
   * differing input is logged as `lane_mismatch`. There is no default: with neither a stored row nor an input
   * lane the worker cannot tell which lane this is, so it declines (`worker_skip reason=lane_unknown`).
   */
  streamId?: string;
  /** Per-speaker label. Like `streamId`, only used to create a row; the stored value wins afterwards. */
  speakerId?: string | null;
  /** Which entry called the worker, for the refusal log line. Defaults to `chunk`. */
  surface?: Exclude<LaneGateSurface, "segment">;
};

/**
 * `refused`: consent capabilities forbid this lane or notes (terminal: the row, if any, is marked `refused`).
 * `skipped`: nothing to do (already done, in flight, tutor unapproved, or lane unknown).
 */
export type ChunkTranscribeOutcome = "done" | "failed" | "skipped" | "refused";

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
 *          'refused' if the session's consent capabilities forbid this chunk's lane (terminal),
 *          'skipped' for an idempotent no-op (already done, in flight, unapproved tutor, unknown lane).
 */
export async function processChunkTranscribeJob(
  input: ChunkTranscribeInput
): Promise<ChunkTranscribeOutcome> {
  const { sessionId, chunkBlobUrl } = input;

  console.log(
    `[txc] wbsid=${sessionId} action=worker_start chunkBlobUrl=${chunkBlobUrl} streamId=${input.streamId ?? "n/a"}`
  );

  // --- 0. B1 cost gate — skip WAITLISTED tutor sessions ----------------------
  // Load the session's owning tutor and check approval before any Whisper spend.
  // This catches rows that were enqueued before approval was revoked (belt-and-suspenders).
  const wbRow = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: { adminUserId: true },
  });
  if (wbRow) {
    const approved = await isTutorApproved(wbRow.adminUserId);
    if (!approved) {
      console.log(
        `[tap] wbsid=${sessionId} action=worker_skip_unapproved adminUserId=${wbRow.adminUserId}`
      );
      return "skipped";
    }
  }

  // --- 1. Idempotency check ---------------------------------------------------
  const existing = await getTranscriptChunkByBlobUrl(sessionId, chunkBlobUrl);
  const priorAttempts = existing?.attempts ?? 0;

  if (existing?.status === "done") {
    console.log(
      `[txc] wbsid=${sessionId} action=worker_skip reason=already_done chunkId=${existing.id}`
    );
    return "skipped";
  }

  if (existing?.status === "refused") {
    // Terminal: a refusal is never re-litigated by a retry or a sweep.
    console.log(
      `[txc] wbsid=${sessionId} action=worker_skip reason=already_refused chunkId=${existing.id}`
    );
    return "refused";
  }

  if (existing?.status === "transcribing") {
    console.log(
      `[txc] wbsid=${sessionId} action=worker_skip reason=already_transcribing chunkId=${existing.id}`
    );
    return "skipped";
  }

  // --- 1b. Lane identity (consent wave C2, plan § 2.3) ---------------------------
  // The STORED row's lane wins over the input: a retry, a kick or a sweep must never relabel a chunk. With no row
  // the input names the lane; with neither there is no safe default (a missing lane used to become `tutor:mic`).
  if (
    existing &&
    input.streamId !== undefined &&
    input.streamId !== existing.streamId
  ) {
    console.log(
      `[cns] wbsid=${sessionId} action=lane_mismatch stored=${existing.streamId} input=${input.streamId}`
    );
  }
  const streamId = existing ? existing.streamId : input.streamId;
  if (streamId === undefined) {
    console.log(
      `[txc] wbsid=${sessionId} action=worker_skip reason=lane_unknown chunkBlobUrl=${chunkBlobUrl}`
    );
    return "skipped";
  }
  const speakerId = existing ? existing.speakerId : (input.speakerId ?? null);

  // --- 1c. Consent gate (re-check at the last entry) ------------------------------
  // Refusal is terminal. If the row exists it is marked `refused` (lane untouched), so the sweep, which selects only
  // pending/transcribing/retryable-failed rows, cannot loop on it. If no row exists none is created.
  const decision = await gateTranscription(sessionId, streamId, input.surface ?? "chunk");
  if (!decision.allow) {
    if (existing) {
      await updateTranscriptChunkStatus(sessionId, existing.id, "refused", {
        error: decision.reason,
      });
    }
    return "refused";
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
    streamId,
    speakerId,
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
      streamId,
      speakerId,
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
      streamId,
      speakerId,
    });
    return "failed";
  }

  // --- 6. Persist result (status=done) ----------------------------------------
  const doneChunk = await upsertTranscriptChunk({
    sessionId,
    chunkBlobUrl,
    recordingTimeOffsetMs,
    status: "done",
    transcript: result.transcript,
    durationMs: result.durationMs,
    transcribedAt: new Date(),
    streamId,
    speakerId,
  });

  console.log(
    `[txc] wbsid=${sessionId} action=worker_done offsetMs=${recordingTimeOffsetMs} durationMs=${result.durationMs ?? "n/a"} model=${result.modelUsed}`
  );

  // --- 7. Map phase: fire-and-forget extraction (best-effort, never blocks) ----
  // Runs incrementally during session so the reduce step at session-end is fast.
  void extractChunkMap(sessionId, doneChunk.id, result.transcript).catch(
    (mapErr: unknown) => {
      console.warn(
        `[tnt] wbsid=${sessionId} action=map_unexpected_throw chunkId=${doneChunk.id} err=${mapErr instanceof Error ? mapErr.message : String(mapErr)}`
      );
    }
  );

  return "done";
}
