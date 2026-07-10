import "server-only";

import OpenAI, { APIError, RateLimitError, toFile } from "openai";
import { env } from "@/lib/env";
import { WHISPER_MAX_BYTES } from "@/lib/transcribe-constants";
import {
  probeAudioBufferDurationSeconds,
  splitAudioIntoWhisperParts,
  type WhisperAudioPart,
} from "@/lib/transcribe-ffmpeg";
import { looksLikeSilenceHallucination } from "@/lib/whisper-guardrails";
import { estimateCostUsd, logCostEvent } from "@/lib/observability/cost-events";
import {
  TRANSCRIBE_FALLBACK_MODEL,
  TRANSCRIBE_PRIMARY_MODEL,
} from "@/lib/ai-models";

export { TRANSCRIBE_FALLBACK_MODEL, TRANSCRIBE_PRIMARY_MODEL } from "@/lib/ai-models";

/**
 * Recording re-arch Phase 1, Slice 2a — D2 transcription pipeline.
 *
 * Transcribe a single audio chunk blob (one uploaded segment blob).
 *
 * Primary model:  gpt-4o-mini-transcribe ($0.003/min, ~35% better WER than whisper-1).
 * Fallback model: whisper-1 — engaged when looksLikeSilenceHallucination fires on the
 *                 primary pass result (quality guard from whisper-guardrails.ts).
 *
 * Large chunks are split via ffmpeg (reusing splitAudioIntoWhisperParts from
 * transcribe-ffmpeg.ts — read-only reuse; that file is NOT modified).
 *
 * Returns transcript text + durationMs. Does NOT consume Whisper segment timestamps —
 * text + duration only (gpt-4o-mini-transcribe may not provide them).
 *
 * Log prefix: [txc]  Session ID: sessionId param.
 */

// ---------------------------------------------------------------------------
// Constants / types
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;

export type TranscribeChunkInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** Session ID for [txc] logging and cost-event provenance. */
  sessionId: string;
};

export type TranscribeChunkSuccess = {
  transcript: string;
  /** Chunk audio duration in milliseconds, or null when the API did not return it. */
  durationMs: number | null;
  /** Which model actually produced this result (primary or fallback). */
  modelUsed: string;
};

export type TranscribeChunkResult = TranscribeChunkSuccess | { error: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Response format is coupled to TRANSCRIBE_FALLBACK_MODEL: the fallback path
 * (silence-hallucination guard) expects verbose_json + duration. If the resolved
 * fallback is not whisper-1, the same rule still applies to whatever fallback is.
 */
function responseFormatForModel(model: string): "json" | "verbose_json" {
  return model === TRANSCRIBE_FALLBACK_MODEL ? "verbose_json" : "json";
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  if (err instanceof APIError && typeof err.status === "number") {
    if (err.status === 429) return true;
    if (err.status >= 500 && err.status < 600) return true;
  }
  return false;
}

/**
 * Call the transcription API for a single pre-sized part.
 * Retries on transient/rate-limit errors up to MAX_RETRIES times.
 */
async function callTranscribeApi(
  part: WhisperAudioPart,
  model: string,
  sessionId: string,
  partLabel: string,
  /** ffmpeg-probed duration when the API omits it (primary json path). */
  probedDurationSeconds: number | null = null
): Promise<{ transcript: string; durationSeconds: number | null; responseModel: string }> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY! });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const file = await toFile(part.buffer, part.filename, { type: part.mimeType });
      const response = await client.audio.transcriptions.create({
        model,
        file,
        response_format: responseFormatForModel(model),
      });

      const transcript =
        typeof response === "object" && response !== null && "text" in response
          ? String((response as { text: string }).text).trim()
          : "";

      const durationRaw =
        typeof response === "object" &&
        response !== null &&
        "duration" in response &&
        typeof (response as { duration: unknown }).duration === "number"
          ? (response as { duration: number }).duration
          : null;

      const responseModel =
        typeof response === "object" &&
        response !== null &&
        "model" in response &&
        typeof (response as { model: unknown }).model === "string" &&
        (response as { model: string }).model.trim()
          ? (response as { model: string }).model.trim()
          : model;

      const durationForCost = durationRaw ?? probedDurationSeconds;

      // Log cost event — never throws (best-effort).
      const est =
        durationForCost != null
          ? estimateCostUsd({
              kind: "WHISPER_TRANSCRIPTION",
              model: responseModel,
              audioSeconds: durationForCost,
            })
          : undefined;
      await logCostEvent({
        kind: "WHISPER_TRANSCRIPTION",
        model: responseModel,
        audioSeconds: durationForCost ?? undefined,
        estimatedCostUsd: est,
        whiteboardSessionId: sessionId,
        sessionId,
        metadata: {
          txc: true,
          filename: part.filename,
          bytes: part.buffer.byteLength,
          partLabel,
        },
      });

      const durationSeconds = durationRaw ?? probedDurationSeconds;

      console.log(
        `[txc] wbsid=${sessionId} action=api_ok model=${model} part=${partLabel} bytes=${part.buffer.byteLength} durationSec=${durationSeconds ?? "n/a"}`
      );

      return { transcript, durationSeconds, responseModel };
    } catch (err: unknown) {
      const retryable = isRetryableError(err);
      const msg = err instanceof Error ? err.message : String(err);

      if (!retryable || attempt >= MAX_RETRIES) {
        throw err;
      }

      const backoff = RETRY_BACKOFF_MS[attempt] ?? 4000;
      console.warn(
        `[txc] wbsid=${sessionId} action=api_retry model=${model} part=${partLabel} attempt=${attempt + 1}/${MAX_RETRIES} backoffMs=${backoff} err=${msg}`
      );
      await sleep(backoff);
    }
  }

  // Should not reach here — the loop always throws or returns.
  throw new Error("[txc] Exhausted retries without resolving");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transcribe a single audio chunk blob.
 *
 * Caller responsibilities:
 *  - Pass a valid buffer (blob bytes already downloaded from Vercel Blob).
 *  - Pass sessionId for [txc] logging and cost-event provenance.
 *
 * Returns { transcript, durationMs, modelUsed } on success, or { error } on failure.
 */
export async function transcribeChunk(
  input: TranscribeChunkInput
): Promise<TranscribeChunkResult> {
  if (!env.OPENAI_API_KEY) {
    return { error: "OPENAI_API_KEY not configured" };
  }

  const { buffer, filename, mimeType, sessionId } = input;

  console.log(
    `[txc] wbsid=${sessionId} action=chunk_start bytes=${buffer.byteLength} file=${filename}`
  );

  // --- 1. Split into API-sized parts if needed --------------------------------
  let parts: WhisperAudioPart[];
  try {
    parts = await splitAudioIntoWhisperParts(buffer, filename, mimeType);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (buffer.byteLength <= WHISPER_MAX_BYTES) {
      // ffmpeg unavailable but chunk is small enough to pass directly.
      console.warn(
        `[txc] wbsid=${sessionId} action=ffmpeg_unavailable fallback=single_part msg=${msg}`
      );
      const normalMime = mimeType.split(";")[0].trim().toLowerCase();
      parts = [{ buffer, filename, mimeType: normalMime }];
    } else {
      console.error(
        `[txc] wbsid=${sessionId} action=ffmpeg_split_failed bytes=${buffer.byteLength} err=${msg}`
      );
      return { error: `ffmpeg split failed: ${msg}` };
    }
  }

  // --- 2. Transcribe each part ------------------------------------------------
  const partTranscripts: string[] = [];
  let totalDurationMs: number | null = 0;
  let lastModelUsed = TRANSCRIBE_PRIMARY_MODEL;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partLabel = `${i + 1}/${parts.length}`;

    let transcript: string;
    let durationSeconds: number | null;
    let modelUsed = TRANSCRIBE_PRIMARY_MODEL;

    let probedDurationSeconds: number | null = null;
    try {
      probedDurationSeconds = await probeAudioBufferDurationSeconds(
        part.buffer,
        part.filename,
        part.mimeType
      );
    } catch {
      probedDurationSeconds = null;
    }

    try {
      // Primary pass — gpt-4o-mini-transcribe
      const primary = await callTranscribeApi(
        part,
        TRANSCRIBE_PRIMARY_MODEL,
        sessionId,
        partLabel,
        probedDurationSeconds
      );
      transcript = primary.transcript;
      durationSeconds = primary.durationSeconds;

      // Quality guard — if result looks like a silence hallucination, retry with whisper-1.
      if (looksLikeSilenceHallucination(transcript, durationSeconds)) {
        console.log(
          `[txc] wbsid=${sessionId} action=quality_guard_trip part=${partLabel} primary_model=${TRANSCRIBE_PRIMARY_MODEL} fallback=${TRANSCRIBE_FALLBACK_MODEL}`
        );
        const fallback = await callTranscribeApi(
          part,
          TRANSCRIBE_FALLBACK_MODEL,
          sessionId,
          `${partLabel}-fallback`,
          probedDurationSeconds
        );
        transcript = fallback.transcript;
        durationSeconds = fallback.durationSeconds;
        modelUsed = TRANSCRIBE_FALLBACK_MODEL;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[txc] wbsid=${sessionId} action=part_failed part=${partLabel} err=${msg}`
      );
      return { error: `Transcription failed on part ${partLabel}: ${msg}` };
    }

    if (transcript) partTranscripts.push(transcript);
    if (durationSeconds != null) {
      totalDurationMs = (totalDurationMs ?? 0) + Math.round(durationSeconds * 1000);
    } else {
      totalDurationMs = null;
    }
    lastModelUsed = modelUsed;

    console.log(
      `[txc] wbsid=${sessionId} action=part_done part=${partLabel} model=${modelUsed}`
    );
  }

  const transcript = partTranscripts.join("\n\n").trim();
  console.log(
    `[txc] wbsid=${sessionId} action=chunk_done parts=${parts.length} durationMs=${totalDurationMs ?? "n/a"} model=${lastModelUsed}`
  );

  return { transcript, durationMs: totalDurationMs, modelUsed: lastModelUsed };
}
