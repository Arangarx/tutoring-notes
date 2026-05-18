# Phase 6 — Tier 1 long-form transcribe (parallel + duration splits)

## Shipped (2026-05-17 branch `feat/transcribe-tier-1-parallelize`)

- **Duration-aware ffmpeg splitting:** `WHISPER_TARGET_CHUNK_SECONDS = 240` — segment count is `max(byte-based, duration-based)` so small-but-long Opus/WebM files split into parallel-sized chunks (see `planWhisperInitialSegmentCount` in `src/lib/transcribe-ffmpeg.ts`).
- **Inner parallelism:** Up to **6** concurrent Whisper calls per recording (`WHISPER_INNER_CONCURRENCY` in `src/lib/transcribe.ts`), preserving part order when joining transcripts.
- **Outer parallelism:** Up to **3** concurrent segments per session in `transcribeAndGenerateAction` and `generateNotesFromWhiteboardSessionAction` (`TRANSCRIPT_OUTER_CONCURRENCY` / `WB_TRANSCRIPT_OUTER_CONCURRENCY`), preserving segment order and all per-segment side effects (hallucination skip, blob cleanup, DB rows).
- **429 / 5xx retry:** Up to **3** exponential backoff retries inside `transcribeSinglePart` before surfacing the generic transcription failure string.
- **Timeout UX:** Shared helpers in `src/app/admin/students/[id]/transcribe-result.ts` — `shouldTreatAsTranscriptionTimeout` + `FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE` returned from action catch paths when Vercel/runtime budget is exceeded.

## Concurrency rationale

- Inner **6** × outer **3** ⇒ worst-case **18** simultaneous Whisper requests — under typical OpenAI Tier-1 RPM while shortening wall-clock on Sarah-length sessions.
- Constants are file-level `const` values (not env vars) for one-line tuning later.

## Deferred / non-scope

- **Tier 2:** Background `TranscribeJob` queue + worker — only if Tier 1 still misses real-session budgets after Pro (300s) + this parallelism.
- **Phase 6 task 6:** Speaker diarization — separate bootstrapper.

## Smoke / ops notes

- Vercel function logs should show `[transcribe-parallel]` lines with `inner-cap=6`, `parts=N`, `outer-cap=3`, `mode=parallel`.
- Verify Preview deploy sees **300s** ceiling (not Hobby 60s) before long-session smoke.
