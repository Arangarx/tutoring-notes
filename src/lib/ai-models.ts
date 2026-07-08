/**
 * Resolved OpenAI model names for transcription, map, and reduce pipelines.
 *
 * Override via optional env vars (see src/lib/env.ts); defaults match the
 * historical hardcoded literals so behavior is byte-identical unless set.
 */
import { env } from "@/lib/env";

export const TRANSCRIBE_PRIMARY_MODEL =
  env.OPENAI_TRANSCRIBE_PRIMARY_MODEL ?? "gpt-4o-mini-transcribe";

export const TRANSCRIBE_FALLBACK_MODEL =
  env.OPENAI_TRANSCRIBE_FALLBACK_MODEL ?? "whisper-1";

export const LEGACY_TRANSCRIBE_MODEL =
  env.OPENAI_LEGACY_TRANSCRIBE_MODEL ?? "whisper-1";

export const MAP_MODEL = env.OPENAI_MAP_MODEL ?? "gpt-4o-mini";

export const REDUCE_MODEL = env.OPENAI_REDUCE_MODEL ?? "gpt-4o-mini";

export const LEGACY_NOTES_MODEL = env.OPENAI_LEGACY_NOTES_MODEL ?? "gpt-4o-mini";
