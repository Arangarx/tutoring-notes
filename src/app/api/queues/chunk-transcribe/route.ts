/**
 * Recording re-arch Phase 1, Slice 2a — D2 transcription pipeline.
 *
 * Vercel Queue consumer endpoint for the 'chunk-transcribe' topic.
 *
 * Push-mode contract (at-least-once delivery):
 *   - Vercel invokes this POST endpoint for each queued message.
 *   - Return HTTP 200 on success OR idempotent no-op (already done).
 *   - Return HTTP 500 on transient failures to signal the queue to retry.
 *   - Payload validation failures return HTTP 400 (bad message — do not retry).
 *
 * The worker is idempotent on (sessionId, chunkBlobUrl), so safe redelivery is
 * guaranteed by design — a duplicate message finds the chunk already 'done' and
 * returns 200 immediately without re-transcribing.
 *
 * When the real Vercel Queues binding is wired (TODO(vercel-queues) in
 * chunk-transcribe-enqueue.ts), register this route as the consumer handler
 * for the 'chunk-transcribe' topic.
 *
 * TODO(vercel-queues): Replace the CRON_SECRET bearer-token guard below with
 * proper Vercel Queue HMAC signature verification once the topic is provisioned
 * and the Vercel-Signature secret is available. The CRON_SECRET guard is a
 * placeholder that protects the endpoint in the interim.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { processChunkTranscribeJob } from "@/lib/recording/transcription-worker";

// ---------------------------------------------------------------------------
// Payload schema
// ---------------------------------------------------------------------------

const ChunkTranscribePayloadSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  chunkBlobUrl: z.string().url("chunkBlobUrl must be a valid URL"),
  recordingTimeOffsetMs: z.number().int().nonnegative().optional(),
});

export type ChunkTranscribePayload = z.infer<typeof ChunkTranscribePayloadSchema>;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  // --- Internal-caller guard ------------------------------------------------
  // When CRON_SECRET is configured, require it as a Bearer token so this
  // endpoint is not callable by unauthenticated external actors. Fail-open
  // when CRON_SECRET is absent (preserves local-dev / pre-config behaviour).
  // TODO(vercel-queues): replace with Vercel Queue HMAC signature check.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      console.warn("[txc] action=queue_auth_rejected");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  // --- Parse + validate payload ---------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = ChunkTranscribePayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    console.error("[txc] action=route_invalid_payload errors=", JSON.stringify(errors));
    // 400 = bad message shape — do not retry, it will never be valid.
    return NextResponse.json(
      { ok: false, error: "Invalid payload", details: errors },
      { status: 400 }
    );
  }

  const { sessionId, chunkBlobUrl, recordingTimeOffsetMs } = parsed.data;

  console.log(
    `[txc] wbsid=${sessionId} action=route_received chunkBlobUrl=${chunkBlobUrl} offsetMs=${recordingTimeOffsetMs ?? "n/a"}`
  );

  // --- Invoke worker ---------------------------------------------------------
  // The worker is idempotent — already-done chunks return 'skipped' with 200.
  // Transient failures return 'failed' and the chunk row is marked; we return 500
  // so the queue retries delivery (the worker's idempotency guard prevents
  // double-processing if the first attempt partially succeeded).
  let outcome: "done" | "failed" | "skipped";
  try {
    outcome = await processChunkTranscribeJob({
      sessionId,
      chunkBlobUrl,
      recordingTimeOffsetMs,
    });
  } catch (err: unknown) {
    // Unexpected error in the worker (should not happen — worker catches internally,
    // but guard here for belt-and-suspenders).
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[txc] wbsid=${sessionId} action=route_worker_threw err=${errMsg}`
    );
    // 500 → queue retries delivery.
    return NextResponse.json(
      { ok: false, error: "Internal worker error", detail: errMsg },
      { status: 500 }
    );
  }

  if (outcome === "failed") {
    // Worker marked the chunk 'failed' and logged the error.
    // Return 500 so the queue retries — the next delivery will find the chunk in
    // 'failed' status and re-process it (idempotency allows overwriting failed→done).
    console.warn(
      `[txc] wbsid=${sessionId} action=route_returning_500 reason=chunk_failed_retryable`
    );
    return NextResponse.json(
      { ok: false, outcome: "failed", retryable: true },
      { status: 500 }
    );
  }

  // outcome === 'done' or 'skipped' — ack the delivery.
  return NextResponse.json({ ok: true, outcome }, { status: 200 });
}
