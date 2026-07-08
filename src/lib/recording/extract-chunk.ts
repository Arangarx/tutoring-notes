import "server-only";

/**
 * Recording re-arch Phase 1, Slice 3 — D8 map phase.
 *
 * Per-chunk structured extraction using gpt-4o-mini.
 * Runs after transcription completes (status=done) inside the transcription worker.
 *
 * Reliability contract:
 *  (a) IDEMPOTENT — if a TranscriptChunkExtraction already exists for the chunkId, no-ops.
 *  (b) BEST-EFFORT — never throws; errors are logged so the caller (transcription worker)
 *      is not affected by a map failure.
 *  (c) NO RUNAWAY CALLS — idempotency key on chunkId prevents double-billing on re-delivery.
 *
 * Log prefix: [tnt]  Per-session ID on every line.
 */

import OpenAI from "openai";
import { env } from "@/lib/env";
import {
  upsertChunkExtraction,
  getChunkExtractionsBySessionId,
} from "@/lib/recording/transcript-store";
import { estimateCostUsd, logCostEvent } from "@/lib/observability/cost-events";
import type { ChunkExtractionPayload } from "@/lib/recording/transcript-types";
import { MAP_MODEL } from "@/lib/ai-models";
import { enqueueLiveReduce } from "@/lib/recording/notes-enqueue";

const EXTRACT_SYSTEM_PROMPT = `You extract structured information from tutoring session audio transcripts.

Given a transcript segment, identify:
- topics: subject topics introduced or discussed (math, science, etc.)
- studentQuestions: questions the student asked (verbatim or tight paraphrase)
- corrections: errors or misconceptions the tutor corrected, including those signaled by in-session reactions ("almost!" / "not quite" / "try again" imply wrestling; "yes!" / "got it" / "perfect" imply mastery on that point)
- followUps: homework, practice problems, or next-session items mentioned

STRICT RULES:
(1) Only include information supported by the transcript — explicit statements or clear in-session reactions. Do not invent or fabricate content.
(2) Be terse — short phrases, not full sentences.
(3) Use empty arrays when nothing was found for a field.

Respond in JSON only — no markdown fences, no commentary:
{"topics":[],"studentQuestions":[],"corrections":[],"followUps":[]}`;

function buildExtractPrompt(transcript: string): string {
  return `Extract structured information from this tutoring session transcript segment.

Rules: include only what the transcript supports; map tutor reactions to corrections when they signal misunderstanding or mastery; use terse phrases.

Transcript:
${transcript}

Respond with JSON only.`;
}

/**
 * Parse the model response, tolerating minor formatting issues.
 * Returns null on parse failure.
 */
function parseExtractionResponse(text: string): ChunkExtractionPayload | null {
  const trimmed = text.trim();
  // Strip markdown code fences if present
  const jsonText = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      topics: Array.isArray(parsed.topics)
        ? (parsed.topics as unknown[]).map(String)
        : [],
      studentQuestions: Array.isArray(parsed.studentQuestions)
        ? (parsed.studentQuestions as unknown[]).map(String)
        : [],
      corrections: Array.isArray(parsed.corrections)
        ? (parsed.corrections as unknown[]).map(String)
        : [],
      followUps: Array.isArray(parsed.followUps)
        ? (parsed.followUps as unknown[]).map(String)
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Run the map-phase extraction for a single transcribed chunk.
 *
 * Safe to call from the transcription worker after status=done is written.
 * Never throws — all failures are logged and swallowed.
 *
 * @param sessionId - whiteboard session ID (for logging + FK)
 * @param chunkId   - TranscriptChunk.id (idempotency key)
 * @param transcript - transcribed text for this chunk
 * @returns 'done' | 'skipped' | 'failed'
 */
export async function extractChunkMap(
  sessionId: string,
  chunkId: string,
  transcript: string
): Promise<"done" | "skipped" | "failed"> {
  if (!env.OPENAI_API_KEY) {
    console.warn(
      `[tnt] wbsid=${sessionId} action=map_skip reason=no_openai_key chunkId=${chunkId}`
    );
    return "skipped";
  }

  if (!transcript.trim()) {
    console.log(
      `[tnt] wbsid=${sessionId} action=map_skip reason=empty_transcript chunkId=${chunkId}`
    );
    return "skipped";
  }

  // Idempotency: if extraction already exists for this chunk, no-op.
  try {
    const existing = await getChunkExtractionsBySessionId(sessionId);
    if (existing.some((e) => e.chunkId === chunkId)) {
      console.log(
        `[tnt] wbsid=${sessionId} action=map_skip reason=already_extracted chunkId=${chunkId}`
      );
      return "skipped";
    }
  } catch (err: unknown) {
    console.error(
      `[tnt] wbsid=${sessionId} action=map_idempotency_check_failed chunkId=${chunkId} err=${err instanceof Error ? err.message : String(err)}`
    );
    // Continue — worst case we get a duplicate upsert (still idempotent on chunkId unique constraint).
  }

  console.log(
    `[tnt] wbsid=${sessionId} action=map_start chunkId=${chunkId} transcriptLen=${transcript.length}`
  );

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: MAP_MODEL,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        { role: "user", content: buildExtractPrompt(transcript) },
      ],
      max_tokens: 512,
      temperature: 0,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const inputTokens = response.usage?.prompt_tokens;
    const outputTokens = response.usage?.completion_tokens;
    const modelId =
      typeof response.model === "string" && response.model.trim().length > 0
        ? response.model.trim()
        : MAP_MODEL;

    // Log cost event (best-effort — never blocks on failure).
    const est = estimateCostUsd({
      kind: "GPT_NOTES_GENERATION",
      model: modelId,
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
    });
    await logCostEvent({
      kind: "GPT_NOTES_GENERATION",
      model: modelId,
      inputTokens,
      outputTokens,
      estimatedCostUsd: est,
      whiteboardSessionId: sessionId,
      sessionId,
      metadata: { tnt: true, phase: "map", chunkId },
    }).catch((costErr: unknown) => {
      console.warn(
        `[tnt] wbsid=${sessionId} action=map_cost_log_failed chunkId=${chunkId} err=${costErr instanceof Error ? costErr.message : String(costErr)}`
      );
    });

    const payload = parseExtractionResponse(text);
    if (!payload) {
      console.warn(
        `[tnt] wbsid=${sessionId} action=map_parse_failed chunkId=${chunkId} rawText=${text.slice(0, 200)}`
      );
      // Store empty extraction so we don't retry this chunk on every cron pass.
      await upsertChunkExtraction({
        sessionId,
        chunkId,
        topics: [],
        studentQuestions: [],
        corrections: [],
        followUps: [],
      });
      return "failed";
    }

    await upsertChunkExtraction({
      sessionId,
      chunkId,
      ...payload,
    });

    console.log(
      `[tnt] wbsid=${sessionId} action=map_done chunkId=${chunkId} topics=${payload.topics.length} questions=${payload.studentQuestions.length} corrections=${payload.corrections.length} followUps=${payload.followUps.length}`
    );

    // WS-K: fire live reduce after each map completion (debounced in enqueueLiveReduce)
    void enqueueLiveReduce(sessionId).catch((err: unknown) => {
      console.warn(
        `[tnt] wbsid=${sessionId} action=live_reduce_enqueue_failed chunkId=${chunkId} err=${err instanceof Error ? err.message : String(err)}`
      );
    });

    return "done";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[tnt] wbsid=${sessionId} action=map_failed chunkId=${chunkId} err=${msg}`
    );
    return "failed";
  }
}
