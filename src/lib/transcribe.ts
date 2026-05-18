import OpenAI, { APIError, RateLimitError, toFile } from "openai";
import { env } from "@/lib/env";
import { WHISPER_MAX_BYTES } from "@/lib/transcribe-constants";
import { splitAudioIntoWhisperParts, type WhisperAudioPart } from "@/lib/transcribe-ffmpeg";
import {
  estimateCostUsd,
  logCostEvent,
  type CostEventProvenance,
} from "@/lib/observability/cost-events";

export { WHISPER_MAX_BYTES } from "@/lib/transcribe-constants";

/** Parallel Whisper calls per recording segment (within inner multi-part split). */
const WHISPER_INNER_CONCURRENCY = 6;

const WHISPER_CREATE_MAX_RETRIES = 3;
const WHISPER_RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;

export type TranscribeSuccess = {
  transcript: string;
  durationSeconds: number | null;
};

export type TranscribeResult = TranscribeSuccess | { error: string };

export type { CostEventProvenance as TranscribeCostProvenance } from "@/lib/observability/cost-events";

export type TranscribeAudioLogMeta = {
  rid?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableWhisperHttpError(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  if (err instanceof APIError && typeof err.status === "number") {
    if (err.status === 429) return true;
    if (err.status >= 500 && err.status < 600) return true;
  }
  return false;
}

export async function mapWithConcurrency<T, U>(
  items: T[],
  cap: number,
  fn: (item: T, idx: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let nextIdx = 0;
  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(cap, items.length) }, () => worker()));
  return results;
}

type PartCtx = {
  rid?: string;
  partIndex: number;
  partCount: number;
};

async function transcribeSinglePart(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  costProvenance: CostEventProvenance | null | undefined,
  ctx: PartCtx
): Promise<TranscribeResult> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY! });
  const modelRequested = "whisper-1";
  const ridLog = ctx.rid ? ` rid=${ctx.rid}` : "";

  for (let attempt = 0; attempt <= WHISPER_CREATE_MAX_RETRIES; attempt++) {
    try {
      const file = await toFile(buffer, filename, { type: mimeType });

      const response = await client.audio.transcriptions.create({
        model: modelRequested,
        file,
        response_format: "verbose_json",
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
      const duration = durationRaw != null ? Math.round(durationRaw) : null;

      const responseModel =
        typeof response === "object" &&
        response !== null &&
        "model" in response &&
        typeof (response as { model: unknown }).model === "string" &&
        (response as { model: string }).model.trim()
          ? (response as { model: string }).model.trim()
          : modelRequested;

      const est =
        durationRaw != null
          ? estimateCostUsd({
              kind: "WHISPER_TRANSCRIPTION",
              model: responseModel,
              audioSeconds: durationRaw,
            })
          : undefined;

      await logCostEvent({
        kind: "WHISPER_TRANSCRIPTION",
        model: responseModel,
        audioSeconds: durationRaw ?? undefined,
        estimatedCostUsd: est,
        adminUserId: costProvenance?.adminUserId,
        studentId: costProvenance?.studentId,
        sessionRecordingId: costProvenance?.sessionRecordingId,
        whiteboardSessionId: costProvenance?.whiteboardSessionId,
      });

      console.log(
        `[transcribe-parallel]${ridLog} part=${ctx.partIndex + 1}/${ctx.partCount} outcome=ok bytes=${buffer.byteLength}`
      );

      return { transcript, durationSeconds: duration };
    } catch (err: unknown) {
      const retryable = isRetryableWhisperHttpError(err);
      const msg = err instanceof Error ? err.message : String(err);

      if (!retryable || attempt >= WHISPER_CREATE_MAX_RETRIES) {
        console.error("[transcribe] Whisper request failed:", msg);
        return { error: "Transcription failed. Please try again." };
      }

      const backoff = WHISPER_RETRY_BACKOFF_MS[attempt] ?? 4000;
      console.warn(
        `[transcribe-parallel]${ridLog} part=${ctx.partIndex + 1}/${ctx.partCount} retry attempt=${attempt + 1}/${WHISPER_CREATE_MAX_RETRIES} backoffMs=${backoff} err=${msg}`
      );
      await sleep(backoff);
    }
  }

  return { error: "Transcription failed. Please try again." };
}

function normalizeMime(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

/**
 * Transcribe an audio buffer with OpenAI Whisper.
 *
 * Large or long recordings are split server-side with ffmpeg into time-aligned parts,
 * transcribed in parallel (bounded concurrency), and concatenated in original order.
 *
 * Returns {transcript, durationSeconds} on success, or {error} on failure.
 * Degrades gracefully when OPENAI_API_KEY is absent.
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  costProvenance?: CostEventProvenance | null,
  logMeta?: TranscribeAudioLogMeta | null
): Promise<TranscribeResult> {
  if (!env.OPENAI_API_KEY) {
    return { error: "not configured" };
  }

  const rid = logMeta?.rid;

  let parts: WhisperAudioPart[];
  try {
    parts = await splitAudioIntoWhisperParts(buffer, filename, mimeType);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (buffer.byteLength <= WHISPER_MAX_BYTES) {
      console.warn(
        `[transcribe] ffmpeg unavailable or probe failed — falling back to single part (bytes=${buffer.byteLength} file=${filename}):`,
        msg
      );
      parts = [{ buffer, filename, mimeType: normalizeMime(mimeType) }];
    } else {
      console.error(
        `[transcribe] ffmpeg split failed (file=${filename} bytes=${buffer.byteLength}):`,
        msg
      );
      return {
        error:
          "This recording is too large to split automatically — the audio processor couldn't prepare it for transcription. " +
          "Try uploading the recording in two shorter parts, or paste a text summary instead.",
      };
    }
  }

  const ridLog = rid ? ` rid=${rid}` : "";
  console.log(
    `[transcribe-parallel]${ridLog} inner-cap=${WHISPER_INNER_CONCURRENCY} parts=${parts.length} mode=parallel`
  );

  const partResults = await mapWithConcurrency(parts, WHISPER_INNER_CONCURRENCY, async (part, idx) => {
    if (part.buffer.byteLength > WHISPER_MAX_BYTES) {
      console.error(
        `[transcribe-parallel]${ridLog} part=${idx + 1}/${parts.length} outcome=oversize bytes=${part.buffer.byteLength}`
      );
      return {
        ok: false as const,
        error:
          "Could not split audio into small enough parts for transcription. Try a shorter recording or use Upload.",
      };
    }

    const result = await transcribeSinglePart(
      part.buffer,
      part.filename,
      part.mimeType,
      costProvenance,
      { rid, partIndex: idx, partCount: parts.length }
    );

    if ("error" in result) {
      return { ok: false as const, error: result.error };
    }
    return { ok: true as const, result };
  });

  const transcripts: string[] = [];
  let totalDuration: number | null = 0;

  for (const pr of partResults) {
    if (!pr.ok) {
      return { error: pr.error };
    }
    const result = pr.result;
    if (result.transcript) transcripts.push(result.transcript);
    if (result.durationSeconds != null) {
      totalDuration = (totalDuration ?? 0) + result.durationSeconds;
    } else {
      totalDuration = null;
    }
  }

  return {
    transcript: transcripts.join("\n\n").trim(),
    durationSeconds: totalDuration,
  };
}
