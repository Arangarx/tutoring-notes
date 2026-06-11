import "server-only";

/**
 * Recording re-arch Phase 1, Slice 3 — D7 reduce phase (REQ-S3-4: locked design).
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
 *  (f) STRUCTURED OUTPUT — reduce emits JSON {topics, assessment, nextSteps, links}.
 *      Stored in TutorNote.content as JSON string. TutorNote is the AI working draft
 *      (never parent-visible). The tutor-facing Save action creates the live SessionNote.
 *  (g) REGENERATE-SAFE — content is never overwritten mid-run; new content replaces
 *      old only on successful API response.
 *
 * Log prefix: [tnt] (TutorNote pipeline).
 * Per-session ID on every line.
 */

import OpenAI from "openai";
import { env } from "@/lib/env";
import { db, withDbRetry } from "@/lib/db";
import { isTutorApproved } from "@/lib/tutor-approval-scope";
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
import { REDUCE_PROMPT_VERSION } from "@/lib/recording/notes-reduce-config";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDUCE_MODEL = "gpt-4o-mini";

/** 5 minutes in ms — matches ratified Q5 answer. */
const NOTES_COMPLETION_TIMEOUT_MS = 5 * 60 * 1000;

// REDUCE_PROMPT_VERSION is imported from notes-reduce-config (lightweight, no heavy deps).

/**
 * Reduce phase system prompt — emits JSON matching SessionNote field shape.
 *
 * Field semantics mirror src/lib/ai.ts generateSessionNote (v7):
 *  - topics: subjects covered, comma list, past tense
 *  - assessment: where the student stands (strengths, struggles, mastery)
 *  - nextSteps: what to do next, including any homework (Plan — covers both plan + homework)
 *  - links: URLs mentioned, one per line, "" if none
 *
 * homework is intentionally omitted from the AI output and will be stored as ""
 * on the SessionNote row (per REQ-S3-4: homework folds into nextSteps/Plan).
 */
const REDUCE_SYSTEM_PROMPT = `You are an expert tutoring assistant. Given structured session data (per-segment extractions of topics, student questions, corrections, and follow-ups), synthesize a concise session note as JSON.

STRICT RULES:
(1) Be terse — short phrases or comma lists, not full sentences.
(2) Only include information present in the source data — do not fabricate.
(3) assessment synthesizes corrections + questions into a student-standing picture (strengths, struggles, mastery level).
(4) nextSteps covers ALL follow-ups AND any assigned homework — this is the complete "Plan" including homework.
(5) If a field has no information, return empty string "".

Respond with JSON ONLY — no markdown fences, no commentary:
{"topics":"...","assessment":"...","nextSteps":"...","links":"..."}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotesJobResult =
  | { outcome: "done"; isPartial: false }
  | { outcome: "partial"; isPartial: true }
  | { outcome: "pending" } // Retry needed — chunks not yet done, within timeout
  | { outcome: "failed"; error: string }
  | { outcome: "skipped"; reason: string }; // Already done or session not ready

/**
 * Structured note fields matching SessionNote DB columns.
 * homework is intentionally omitted: it folds into nextSteps per REQ-S3-4.
 */
export type StructuredNoteFields = {
  topics: string;
  assessment: string;
  /** UI label "Plan". Includes follow-ups + homework per REQ-S3-4. */
  nextSteps: string;
  links: string;
};

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
    return `Synthesize a structured session note from these per-segment extractions:\n\n${chunks}`;
  }

  // Fallback: use raw transcripts
  if (rawTranscripts && rawTranscripts.length > 0) {
    const joined = rawTranscripts
      .map((t, i) =>
        rawTranscripts.length > 1 ? `[Segment ${i + 1}]\n${t}` : t
      )
      .join("\n\n");
    return `Synthesize a structured session note from this tutoring session transcript:\n\n${joined}`;
  }

  return "Synthesize a structured session note. No audio transcript was available.";
}

/**
 * Parse the JSON reduce response, tolerating minor formatting issues.
 * Returns null on parse failure.
 */
function parseReduceResponse(text: string): StructuredNoteFields | null {
  const trimmed = text.trim();
  // Strip markdown code fences if present
  const jsonText = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      topics: typeof parsed.topics === "string" ? parsed.topics : "",
      assessment: typeof parsed.assessment === "string" ? parsed.assessment : "",
      nextSteps:
        typeof parsed.nextSteps === "string"
          ? parsed.nextSteps
          : typeof parsed.plan === "string"
            ? parsed.plan
            : "",
      links: typeof parsed.links === "string" ? parsed.links : "",
    };
  } catch {
    return null;
  }
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

  // --- 2. Session-not-sealed guard + B1 cost gate --------------------------------
  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          endedAt: true,
          adminUserId: true,
        },
      }),
    { label: "processNotesReduceJob.session" }
  );

  if (!session) {
    console.error(`[tnt] wbsid=${sessionId} action=reduce_failed reason=session_not_found`);
    return { outcome: "failed", error: "Session not found" };
  }

  // B1 cost gate: skip notes reduce for WAITLISTED tutors (OpenAI spend).
  {
    const approved = await isTutorApproved(session.adminUserId);
    if (!approved) {
      console.log(
        `[tap] wbsid=${sessionId} action=reduce_skip_unapproved adminUserId=${session.adminUserId}`
      );
      return { outcome: "skipped", reason: "tutor_not_approved" };
    }
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
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: REDUCE_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    const rawText = response.choices[0]?.message?.content?.trim() ?? "";
    const inputTokens = response.usage?.prompt_tokens;
    const outputTokens = response.usage?.completion_tokens;
    const latencyMs = Date.now() - reduceStartMs;

    // Parse structured JSON response
    const structuredFields = parseReduceResponse(rawText);
    if (!structuredFields) {
      console.warn(
        `[tnt] wbsid=${sessionId} action=reduce_parse_failed rawText=${rawText.slice(0, 200)}`
      );
      // Fall back to storing raw text as legacy content so the tutor isn't left with nothing
      await updateTutorNote(sessionId, {
        status: "failed",
        error: "Notes generated but could not be parsed. Try regenerating.",
      });
      return {
        outcome: "failed",
        error: "Notes generated but could not be parsed. Try regenerating.",
      };
    }

    // Serialize structured fields as JSON for TutorNote.content storage
    const content = JSON.stringify(structuredFields);

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
        structured: true,
      },
    }).catch((costErr: unknown) => {
      console.warn(
        `[tnt] wbsid=${sessionId} action=reduce_cost_log_failed err=${costErr instanceof Error ? costErr.message : String(costErr)}`
      );
    });

    // --- 8. Write TutorNote row (structured JSON content) -------------------------
    const finalStatus = isPartial ? "partial" : "done";
    await updateTutorNote(sessionId, {
      status: finalStatus,
      content,
      isPartial,
      generatedAt: new Date(),
    });

    console.log(
      `[tnt] wbsid=${sessionId} action=reduce_done status=${finalStatus} chunks=${doneChunks} latencyMs=${latencyMs} isPartial=${isPartial} topics=${structuredFields.topics.length} assessment=${structuredFields.assessment.length} nextSteps=${structuredFields.nextSteps.length}`
    );

    return isPartial
      ? { outcome: "partial", isPartial: true }
      : { outcome: "done", isPartial: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tnt] wbsid=${sessionId} action=reduce_failed err=${msg}`);

    // REGENERATE-SAFE: on failure, do NOT touch content — preserve prior good note
    await updateTutorNote(sessionId, {
      status: "failed",
      error: msg.slice(0, 500),
    }).catch(() => undefined);

    return { outcome: "failed", error: msg };
  }
}
