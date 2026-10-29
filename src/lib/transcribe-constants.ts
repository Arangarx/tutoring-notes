/** Max audio file size sent to Whisper (25 MB — OpenAI's hard limit). */
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Pinned transcription language for every audio.transcriptions.create() call.
 * Sessions are English. Leaving language unset lets the model guess and invent
 * non-English silence hallucinations (CJK lines, repeated ä).
 */
export const TRANSCRIPTION_LANGUAGE = "en" as const;

/**
 * Display names for the pinned transcription language. The `satisfies`
 * constraint fails the build if TRANSCRIPTION_LANGUAGE changes without a name.
 */
const TRANSCRIPTION_LANGUAGE_NAMES = {
  en: "English",
} as const satisfies Record<typeof TRANSCRIPTION_LANGUAGE, string>;

/** Tutor-facing line while transcription is pinned to one language. */
export function transcriptionLanguageNotice(): string {
  const name = TRANSCRIPTION_LANGUAGE_NAMES[TRANSCRIPTION_LANGUAGE];
  return `Transcription currently supports ${name} only.`;
}

/** Target max duration per Whisper chunk when splitting long audio (parallel-friendly sub-budget per call). */
export const WHISPER_TARGET_CHUNK_SECONDS = 240;
