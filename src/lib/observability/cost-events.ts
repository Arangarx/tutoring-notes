import { Prisma, type CostEventKind } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Optional FKs tying a cost row to tutor / student / session artifacts.
 * All fields optional so call sites with partial context still log usage.
 */
export type CostEventProvenance = {
  adminUserId?: string | null;
  studentId?: string | null;
  sessionRecordingId?: string | null;
  whiteboardSessionId?: string | null;
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
}

/**
 * OpenAI list pricing snapshot (non-batch). Captured 2026-05-17 from
 * https://openai.com/api/pricing/ — TODO: refresh when models or rates change.
 */
const WHISPER_USD_PER_MINUTE = 0.006;
const GPT_4O_MINI_INPUT_PER_MTOK_USD = 0.15;
const GPT_4O_MINI_OUTPUT_PER_MTOK_USD = 0.6;

/**
 * Rough USD estimate from usage. Returns `undefined` when the model is unknown
 * or required usage fields are missing (callers store null `estimatedCostUsd`).
 */
export function estimateCostUsd(params: {
  kind: CostEventKind;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
}): number | undefined {
  const m = params.model.trim().toLowerCase();

  if (params.kind === "WHISPER_TRANSCRIPTION") {
    if (m !== "whisper-1") return undefined;
    if (params.audioSeconds == null || params.audioSeconds < 0) return undefined;
    return (params.audioSeconds / 60) * WHISPER_USD_PER_MINUTE;
  }

  if (
    params.kind === "GPT_NOTES_GENERATION" ||
    params.kind === "GPT_ASSESSMENT_EXTRACTION"
  ) {
    if (!m.includes("gpt-4o-mini")) return undefined;
    if (
      params.inputTokens == null ||
      params.outputTokens == null ||
      params.inputTokens < 0 ||
      params.outputTokens < 0
    ) {
      return undefined;
    }
    return (
      (params.inputTokens / 1_000_000) * GPT_4O_MINI_INPUT_PER_MTOK_USD +
      (params.outputTokens / 1_000_000) * GPT_4O_MINI_OUTPUT_PER_MTOK_USD
    );
  }

  return undefined;
}

/**
 * Log an OpenAI cost event. Best-effort; failures are caught + logged but NEVER throw,
 * so the calling path (transcription, notes generation, etc.) is not affected by
 * observability infrastructure issues.
 *
 * Per CostEvent row: emits `[cost-events] cev=<uuid> kind=<kind> model=<model> ...` on success
 * and `[cost-events] cev=FAIL kind=<kind> error=<msg>` on failure.
 */
export async function logCostEvent(input: LogCostEventInput): Promise<void> {
  try {
    const created = await db.costEvent.create({
      data: {
        kind: input.kind,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        audioSeconds: input.audioSeconds,
        estimatedCostUsd:
          input.estimatedCostUsd != null
            ? new Prisma.Decimal(input.estimatedCostUsd)
            : null,
        adminUserId: input.adminUserId,
        studentId: input.studentId,
        sessionRecordingId: input.sessionRecordingId,
        whiteboardSessionId: input.whiteboardSessionId,
        metadata: input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonValue),
      },
    });
    console.log(
      `[cost-events] cev=${created.id} kind=${input.kind} model=${input.model} inTokens=${input.inputTokens ?? "n/a"} outTokens=${input.outputTokens ?? "n/a"} audioSec=${input.audioSeconds ?? "n/a"} costUsd=${input.estimatedCostUsd ?? "n/a"}`
    );
  } catch (err) {
    console.error(
      `[cost-events] cev=FAIL kind=${input.kind} model=${input.model} error=${err instanceof Error ? err.message : String(err)}`
    );
  }
}
