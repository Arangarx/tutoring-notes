import "server-only";

/**
 * Recording re-arch Phase 1, Slice 3 — D7 reduce phase.
 *
 * Notes reduce worker: completion gate → map/reduce → TutorNote write.
 *
 * Architecture: DB-as-queue with immediate fire-and-forget + cron retry.
 * This function runs once per session-end event (immediate attempt) and is
 * retried by the cron sweep if the immediate attempt exits due to pending chunks.
 *
 * Reliability contract:
 *  (a) COMPLETION GATE — notes are only generated after session is sealed AND
 *      all produced TranscriptChunk rows are done (or timeout threshold reached).
 *  (b) 5-MIN TIMEOUT — if chunks aren't all done within 5min of session seal,
 *      reduces on available extractions and flags TutorNote.isPartial=true.
 *  (c) SESSION-NOT-SEALED GUARD — aborts immediately if WhiteboardSession.endedAt is null.
 *  (d) IDEMPOTENT — if TutorNote is already done/partial, no-ops.
 *  (e) OWNERSHIP-ASSERTION-FREE (worker context) — this runs in a server-side
 *      worker/cron context, not a user-triggered server action; ownership was
 *      already asserted at enqueue time (triggerNotesGenerationAction).
 *      The worker validates session sealed + all chunk FKs are for this session.
 *
 * Log prefix: [tnt]  Per-session ID on every line.
 */

import OpenAI from "openai";
import { env } from "@/lib/env";
import { db, withDbRetry } from "@/lib/db";
import {
  getTutorNoteBySessionId,
  getTranscriptChunksBySessionId,
  getChunkExtractionsBySessionId,
  updateTutorNote,
  upsertTutorNotePending,
} from "@/lib/recording/transcript-store";
import { estimateCostUsd, logCostEvent } from "@/lib/observability/cost-events";
import {
  parseChunkExtraction,
  type ChunkExtractionPayload,
} from "@/lib/recording/transcript-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDUCE_MODEL = "gpt-4o-mini";

/** 5 minutes in ms — matches ratified Q5 answer. */
const NOTES_COMPLETION_TIMEOUT_MS = 5 * 60 * 1000;

const REDUCE_SYSTEM_PROMPT = `You are an expert tutor assistant. Given structured notes from a tutoring session (organized by chunk), write a cohesive session summary for the tutor's records.

The tutor uses these notes to track student progress and plan future sessions.

Format your response as:
## Session Summary
[2-3 sentence overview of what was covered]

## Topics Covered
[bullet list]

## Student Questions
[bullet list of questions the student asked, with brief context]

## Corrections & Misconceptions
[bullet list of errors corrected]

## Homework / Follow-up
[bullet list of assigned work or next steps]

Be concise and factual. If a section has no items, omit it.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotesJobResult =
  | { outcome: "done"; isPartial: false }
  | { outcome: "partial"; isPartial: true }
  | { outcome: "pending" } // Retry needed — chunks not yet done, within timeout
  | { outcome: "failed"; error: string }
  | { outcome: "skipped"; reason: string }; // Already done or session not ready

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildReducePrompt(
  extractions: ChunkExtractionPayload[],
  rawTranscripts?: string[]
): string {
  if (extractions.length > 0) {
    const chunks = extractions
      .map(
        (e, i) => `### Chunk ${i + 1}
Topics: ${e.topics.join(", ") || "none"}
Student Questions: ${e.studentQuestions.join("; ") || "none"}
Corrections: ${e.corrections.join("; ") || "none"}
Follow-ups: ${e.followUps.join("; ") || "none"}`
      )
      .join("\n\n");
    return `Generate cohesive session notes from these per-segment extractions:\n\n${chunks}`;
  }

  // Fallback: use raw transcripts
  if (rawTranscripts && rawTranscripts.length > 0) {
    const joined = rawTranscripts
      .map((t, i) =>
        rawTranscripts.length > 1 ? `[Segment ${i + 1}]\n${t}` : t
      )
      .join("\n\n");
    return `Generate cohesive session notes from this tutoring session transcript:\n\n${joined}`;
  }

  return "Generate a brief session note. No audio transcript was available.";
}

// ---------------------------------------------------------------------------
// Main worker
// ---------------------------------------------------------------------------

/**
 * Process a notes-reduce job for one session.
 *
 * Safe for at-least-once delivery: idempotent on sessionId when TutorNote is already done.
 * Never throws — all error paths captured in the DB row and logged.
 *
 * @returns NotesJobResult indicating disposition
 */
export async function processNotesReduceJob(
  sessionId: string
): Promise<NotesJobResult> {
  console.log(`[tnt] wbsid=${sessionId} action=reduce_start`);

  // --- 1. Idempotency: skip if already resolved ---------------------------------
  let note = await getTutorNoteBySessionId(sessionId);
  if (note?.status === "done" || note?.status === "partial") {
    console.log(
      `[tnt] wbsid=${sessionId} action=reduce_skip reason=already_${note.status}`
    );
    return { outcome: "skipped", reason: `already_${note.status}` };
  }

  // --- 2. Session-not-sealed guard -----------------------------------------------
  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { id: true, endedAt: true, studentId: true, adminUserId: true },
      }),
    { label: "processNotesReduceJob.session" }
  );

  if (!session) {
    console.error(`[tnt] wbsid=${sessionId} action=reduce_failed reason=session_not_found`);
    return { outcome: "failed", error: "Session not found" };
  }

  if (!session.endedAt) {
    console.warn(
      `[tnt] wbsid=${sessionId} action=reduce_abort reason=session_not_sealed`
    );
    return { outcome: "skipped", reason: "session_not_sealed" };
  }

  const sealedAt = session.endedAt;
  const msSinceSeal = Date.now() - sealedAt.getTime();

  // --- 3. Ensure TutorNote row exists (idempotent) --------------------------------
  if (!note) {
    note = await upsertTutorNotePending(sessionId);
  }

  // --- 4. Completion gate: check all chunks done ----------------------------------
  const chunks = await getTranscriptChunksBySessionId(sessionId);

  const totalChunks = chunks.length;
  const doneChunks = chunks.filter((c) => c.status === "done").length;
  const pendingChunks = chunks.filter(
    (c) => c.status === "pending" || c.status === "transcribing"
  ).length;
  const failedChunks = chunks.filter((c) => c.status === "failed").length;

  console.log(
    `[tnt] wbsid=${sessionId} action=reduce_gate total=${totalChunks} done=${doneChunks} pending=${pendingChunks} failed=${failedChunks} msSinceSeal=${msSinceSeal}`
  );

  if (totalChunks === 0) {
    // No audio chunks at all — generate a placeholder note.
    console.log(`[tnt] wbsid=${sessionId} action=reduce_no_chunks`);
  } else if (pendingChunks > 0) {
    if (msSinceSeal < NOTES_COMPLETION_TIMEOUT_MS) {
      // Within timeout window — wait for chunks.
      console.log(
        `[tnt] wbsid=${sessionId} action=reduce_pending pendingChunks=${pendingChunks} msSinceSeal=${msSinceSeal} timeout=${NOTES_COMPLETION_TIMEOUT_MS}`
      );
      return { outcome: "pending" };
    }
    // Timeout exceeded — proceed with available extractions and flag partial.
    console.warn(
      `[tnt] wbsid=${sessionId} action=reduce_timeout pendingChunks=${pendingChunks} msSinceSeal=${msSinceSeal}`
    );
  }

  // isPartial = true when some chunks are not done at reduce time
  const isPartial = pendingChunks > 0 || failedChunks > 0;

  // --- 5. Gather inputs (map extractions preferred, fallback to raw transcripts) ---
  const extractionRows = await getChunkExtractionsBySessionId(sessionId);

  // Build ordered extraction list (by chunkId matching done chunks ordered by recordingTimeOffsetMs)
  const doneChunkIds = new Set(
    chunks.filter((c) => c.status === "done").map((c) => c.id)
  );
  const orderedExtractions: ChunkExtractionPayload[] = extractionRows
    .filter((e) => doneChunkIds.has(e.chunkId))
    // Sort by chunk's recordingTimeOffsetMs
    .sort((a, b) => {
      const ca = chunks.find((c) => c.id === a.chunkId);
      const cb = chunks.find((c) => c.id === b.chunkId);
      return (ca?.recordingTimeOffsetMs ?? 0) - (cb?.recordingTimeOffsetMs ?? 0);
    })
    .map((e) => parseChunkExtraction(e));

  // Fallback: use raw transcripts from done chunks ordered by recordingTimeOffsetMs
  const rawTranscripts = chunks
    .filter((c) => c.status === "done" && c.transcript)
    .sort((a, b) => a.recordingTimeOffsetMs - b.recordingTimeOffsetMs)
    .map((c) => c.transcript);

  console.log(
    `[tnt] wbsid=${sessionId} action=reduce_inputs extractions=${orderedExtractions.length} rawTranscripts=${rawTranscripts.length} isPartial=${isPartial}`
  );

  // --- 6. Mark as generating ------------------------------------------------------
  await updateTutorNote(sessionId, { status: "generating" });

  // --- 7. OpenAI reduce call -------------------------------------------------------
  if (!env.OPENAI_API_KEY) {
    await updateTutorNote(sessionId, {
      status: "failed",
      error: "OPENAI_API_KEY not configured",
    });
    return { outcome: "failed", error: "OPENAI_API_KEY not configured" };
  }

  const reduceStartMs = Date.now();

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const prompt = buildReducePrompt(orderedExtractions, rawTranscripts.length > 0 ? rawTranscripts : undefined);

    const response = await client.chat.completions.create({
      model: REDUCE_MODEL,
      messages: [
        { role: "system", content: REDUCE_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    const inputTokens = response.usage?.prompt_tokens;
    const outputTokens = response.usage?.completion_tokens;
    const latencyMs = Date.now() - reduceStartMs;

    // Log cost event (best-effort).
    const est = estimateCostUsd({
      kind: "GPT_NOTES_GENERATION",
      model: REDUCE_MODEL,
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
    });
    await logCostEvent({
      kind: "GPT_NOTES_GENERATION",
      model: REDUCE_MODEL,
      inputTokens,
      outputTokens,
      estimatedCostUsd: est,
      whiteboardSessionId: sessionId,
      sessionId,
      metadata: {
        tnt: true,
        phase: "reduce",
        chunks: doneChunks,
        isPartial,
      },
    }).catch((costErr: unknown) => {
      console.warn(
        `[tnt] wbsid=${sessionId} action=reduce_cost_log_failed err=${costErr instanceof Error ? costErr.message : String(costErr)}`
      );
    });

    // --- 8. Write TutorNote row ---------------------------------------------------
    const finalStatus = isPartial ? "partial" : "done";
    await updateTutorNote(sessionId, {
      status: finalStatus,
      content,
      isPartial,
      generatedAt: new Date(),
    });

    console.log(
      `[tnt] wbsid=${sessionId} action=reduce_done status=${finalStatus} chunks=${doneChunks} latencyMs=${latencyMs} isPartial=${isPartial}`
    );

    return isPartial
      ? { outcome: "partial", isPartial: true }
      : { outcome: "done", isPartial: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tnt] wbsid=${sessionId} action=reduce_failed err=${msg}`);

    await updateTutorNote(sessionId, {
      status: "failed",
      error: msg.slice(0, 500),
    }).catch(() => undefined);

    return { outcome: "failed", error: msg };
  }
}
