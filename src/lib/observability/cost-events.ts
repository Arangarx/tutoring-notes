import { Prisma, type CostEventKind } from "@prisma/client";
import { db } from "@/lib/db";
import {
  GPT_4O_MINI_INPUT_USD_PER_MTOK,
  GPT_4O_MINI_OUTPUT_USD_PER_MTOK,
  GPT_4O_MINI_TRANSCRIBE_USD_PER_AUDIO_MINUTE,
  NEON_COMPUTE_USD_PER_CU_HR,
  RATE_CARD_VERSION,
  VERCEL_BLOB_EGRESS_USD_PER_GB,
  VERCEL_BLOB_STORAGE_USD_PER_GB_MONTH,
  VERCEL_PROVISIONED_MEMORY_USD_PER_GB_HR,
  WHISPER_1_USD_PER_AUDIO_MINUTE,
} from "@/lib/observability/rate-card";

/**
 * Optional FKs tying a cost row to tutor / student / session artifacts.
 * All fields optional so call sites with partial context still log usage.
 */
export type CostEventProvenance = {
  adminUserId?: string | null;
  studentId?: string | null;
  sessionRecordingId?: string | null;
  whiteboardSessionId?: string | null;
  sessionId?: string | null;
};

export interface LogCostEventInput {
  kind: CostEventKind;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  estimatedCostUsd?: number;
  adminUserId?: string | null;
  studentId?: string | null;
  sessionRecordingId?: string | null;
  whiteboardSessionId?: string | null;
  metadata?: Record<string, unknown>;
  bytesTransferred?: number;
  gbMonths?: number;
  computeGbHr?: number;
  rateCardVersion?: string;
  sessionId?: string | null;
}

export interface EstimateCostUsdInput {
  kind: CostEventKind;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  bytesTransferred?: number;
  gbMonths?: number;
  computeGbHr?: number;
}

const BYTES_PER_GB = 1_000_000_000;

function isGpt4oMiniModel(model: string): boolean {
  return model.trim().toLowerCase().includes("gpt-4o-mini");
}

function isWhisperModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m === "whisper-1" || m.includes("gpt-4o-mini-transcribe");
}

/**
 * Rough USD estimate from usage × rate-card. Returns `undefined` when the model
 * is unknown or required usage fields are missing.
 *
 * Swapped models via OPENAI_*_MODEL env vars may log `estimatedCostUsd: undefined`
 * until the rate-card in rate-card.ts is extended for the new model family.
 */
export function estimateCostUsd(params: EstimateCostUsdInput): number | undefined {
  const m = params.model.trim().toLowerCase();

  if (params.kind === "WHISPER_TRANSCRIPTION") {
    if (!isWhisperModel(m)) return undefined;
    if (params.audioSeconds == null || params.audioSeconds < 0) return undefined;
    const ratePerMinute =
      m.includes("gpt-4o-mini-transcribe")
        ? GPT_4O_MINI_TRANSCRIBE_USD_PER_AUDIO_MINUTE
        : WHISPER_1_USD_PER_AUDIO_MINUTE;
    return (params.audioSeconds / 60) * ratePerMinute;
  }

  if (
    params.kind === "GPT_NOTES_GENERATION" ||
    params.kind === "GPT_ASSESSMENT_EXTRACTION"
  ) {
    if (!isGpt4oMiniModel(m)) return undefined;
    if (
      params.inputTokens == null ||
      params.outputTokens == null ||
      params.inputTokens < 0 ||
      params.outputTokens < 0
    ) {
      return undefined;
    }
    return (
      (params.inputTokens / 1_000_000) * GPT_4O_MINI_INPUT_USD_PER_MTOK +
      (params.outputTokens / 1_000_000) * GPT_4O_MINI_OUTPUT_USD_PER_MTOK
    );
  }

  if (params.kind === "BLOB_EGRESS") {
    if (params.bytesTransferred == null || params.bytesTransferred < 0) return undefined;
    return (params.bytesTransferred / BYTES_PER_GB) * VERCEL_BLOB_EGRESS_USD_PER_GB;
  }

  if (params.kind === "BLOB_STORAGE") {
    if (params.gbMonths == null) return undefined;
    return params.gbMonths * VERCEL_BLOB_STORAGE_USD_PER_GB_MONTH;
  }

  if (params.kind === "VERCEL_COMPUTE") {
    if (params.computeGbHr == null || params.computeGbHr < 0) return undefined;
    return params.computeGbHr * VERCEL_PROVISIONED_MEMORY_USD_PER_GB_HR;
  }

  if (params.kind === "NEON_COMPUTE") {
    if (params.computeGbHr == null || params.computeGbHr < 0) return undefined;
    return params.computeGbHr * NEON_COMPUTE_USD_PER_CU_HR;
  }

  return undefined;
}

function resolveEstimatedCostUsd(input: LogCostEventInput): number | undefined {
  if (input.estimatedCostUsd != null) return input.estimatedCostUsd;
  return estimateCostUsd({
    kind: input.kind,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    audioSeconds: input.audioSeconds,
    bytesTransferred: input.bytesTransferred,
    gbMonths: input.gbMonths,
    computeGbHr: input.computeGbHr,
  });
}

/**
 * Log a cost event. Best-effort; failures are caught + logged but NEVER throw,
 * so the calling path is not affected by observability infrastructure issues.
 *
 * Every row stores `rateCardVersion` (defaults to current RATE_CARD_VERSION).
 * `estimatedCostUsd` is computed from usage × rate-card when not supplied.
 *
 * Per CostEvent row: emits `[cost-events] cev=<uuid> kind=<kind> ...` on success
 * and `[cost-events] cev=FAIL kind=<kind> error=<msg>` on failure.
 *
 * Recording-pipeline call sites (transcribe.ts, whiteboard notes actions) are
 * being re-architected on a parallel track — they inherit rateCardVersion +
 * auto-compute via defaults here without requiring edits in that track.
 * VERCEL_COMPUTE inline instrumentation at those call sites is deferred to that track.
 */
export async function logCostEvent(input: LogCostEventInput): Promise<void> {
  const rateCardVersion = input.rateCardVersion ?? RATE_CARD_VERSION;
  const estimatedCostUsd = resolveEstimatedCostUsd(input);

  try {
    const created = await db.costEvent.create({
      data: {
        kind: input.kind,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        audioSeconds: input.audioSeconds,
        bytesTransferred: input.bytesTransferred,
        gbMonths: input.gbMonths,
        computeGbHr: input.computeGbHr,
        rateCardVersion,
        sessionId: input.sessionId,
        estimatedCostUsd:
          estimatedCostUsd != null
            ? new Prisma.Decimal(estimatedCostUsd)
            : null,
        adminUserId: input.adminUserId,
        studentId: input.studentId,
        sessionRecordingId: input.sessionRecordingId,
        whiteboardSessionId: input.whiteboardSessionId,
        metadata: input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonValue),
      },
    });
    console.log(
      `[cost-events] cev=${created.id} kind=${input.kind} model=${input.model} inTok=${input.inputTokens ?? "n/a"} outTok=${input.outputTokens ?? "n/a"} audioSec=${input.audioSeconds ?? "n/a"} bytesXfr=${input.bytesTransferred ?? "n/a"} costUsd=${estimatedCostUsd ?? "n/a"} rateCard=${rateCardVersion} session=${input.sessionId ?? input.whiteboardSessionId ?? "n/a"}`
    );
  } catch (err) {
    console.error(
      `[cost-events] cev=FAIL kind=${input.kind} model=${input.model} error=${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export type LogBlobEgressInput = {
  bytesTransferred: number;
  sessionRecordingId: string;
  adminUserId?: string | null;
  studentId?: string | null;
  whiteboardSessionId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Log optimistic BLOB_EGRESS at audio proxy serve time (see design §3.3.1). */
export async function logBlobEgressEvent(input: LogBlobEgressInput): Promise<void> {
  await logCostEvent({
    kind: "BLOB_EGRESS",
    model: "vercel-blob",
    bytesTransferred: input.bytesTransferred,
    adminUserId: input.adminUserId,
    studentId: input.studentId,
    sessionRecordingId: input.sessionRecordingId,
    whiteboardSessionId: input.whiteboardSessionId,
    sessionId: input.sessionId ?? input.whiteboardSessionId,
    metadata: input.metadata,
  });
}

export type LogBlobStorageReclaimInput = {
  /** Negative GB-months reclaimed (design §8 Q10). */
  gbMonths: number;
  metadata?: Record<string, unknown>;
};

/** Log storage reclaimed by blob cleanup CLI (negative gbMonths). */
export async function logBlobStorageReclaimEvent(
  input: LogBlobStorageReclaimInput
): Promise<void> {
  await logCostEvent({
    kind: "BLOB_STORAGE",
    model: "vercel-blob",
    gbMonths: input.gbMonths,
    metadata: input.metadata,
  });
}

/**
 * Estimate Vercel function compute cost from elapsed wall time + provisioned memory.
 * Deferred instrumentation at transcription/notes call sites — helper ready for recording track.
 */
export function estimateVercelComputeGbHr(
  elapsedMs: number,
  memoryGb: number = 0.5
): number {
  return memoryGb * (elapsedMs / 3_600_000);
}

export async function logVercelComputeEvent(input: {
  elapsedMs: number;
  memoryGb?: number;
  model?: string;
  adminUserId?: string | null;
  studentId?: string | null;
  sessionRecordingId?: string | null;
  whiteboardSessionId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const memoryGb = input.memoryGb ?? 0.5;
  const computeGbHr = estimateVercelComputeGbHr(input.elapsedMs, memoryGb);
  await logCostEvent({
    kind: "VERCEL_COMPUTE",
    model: input.model ?? "vercel-serverless",
    computeGbHr,
    adminUserId: input.adminUserId,
    studentId: input.studentId,
    sessionRecordingId: input.sessionRecordingId,
    whiteboardSessionId: input.whiteboardSessionId,
    sessionId: input.sessionId ?? input.whiteboardSessionId,
    metadata: input.metadata,
  });
}
