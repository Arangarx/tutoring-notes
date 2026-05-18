/** Max audio file size sent to Whisper (25 MB — OpenAI's hard limit). */
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

/** Target max duration per Whisper chunk when splitting long audio (parallel-friendly sub-budget per call). */
export const WHISPER_TARGET_CHUNK_SECONDS = 240;
