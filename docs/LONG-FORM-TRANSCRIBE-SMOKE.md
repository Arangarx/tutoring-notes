# Long-form transcribe — controlled smoke (pre–Sarah-Monday)

**Branch:** `spike-long-form-transcribe-smoke`  
**Last updated:** 2026-05-15 (spike authoring on Andrew’s machine; live Preview timings to be merged when runs complete)

## TL;DR

Empirical **Vercel Preview** runs for this spike were **not completed from the agent sandbox** (Neon `DATABASE_URL` unreachable from the automation host), so **wall-clock headroom against the real 300s (Pro) / 60s (Hobby) serverless ceiling is not yet measured** in `scripts/spike-long-form-transcribe-smoke-results.json`. The spike still delivers **reproducible fixtures + a Playwright harness** so Andrew can finish the binding run against a **preview URL + `SPIKE_TEST_*` student** before Sarah’s Monday session. From **code inspection**, the dominant risk for Sarah remains **`transcribeAndGenerateAction`**: sequential **Whisper-1** calls (after optional **ffmpeg** splitting for uploads &gt; ~25 MB) plus **`gpt-4o-mini`** form-fill all share **one** `maxDuration = 300` budget on `src/app/admin/students/[id]/page.tsx`. Upload is **client-direct to Vercel Blob** (no 4.5 MB server-action body limit). **Pasted-text** path is usually cheaper server-side but **`estimateTokens` &gt; 30k** still hard-fails in `generateNoteFromTextAction` (`MAX_INPUT_TOKENS` in `src/lib/ai.ts`).

## Test setup

| Item | Value |
|------|--------|
| Fixtures | `tests/fixtures/long-form-transcribe-smoke/` |
| Primary audio | `audio-55min-sine.webm` — **~55 min**, **~34 MB on disk** (ffmpeg **libopus ~64 kb/s**); forces **&gt;25 MB** `WHISPER_MAX_BYTES` split via `splitAudioIntoWhisperParts` |
| Primary paste | `pasted-text-50k.txt` — **48 000** UTF-8 characters (Gutenberg *Alice* body + synthetic header) |
| Runner | `node scripts/spike-long-form-transcribe-smoke.mjs` |
| Results artifact | `scripts/spike-long-form-transcribe-smoke-results.json` (gitignored pattern: treat as local output; re-run to regenerate) |
| Student detail `maxDuration` | **300** s — `src/app/admin/students/[id]/page.tsx` |
| `next.config.ts` `serverActions.bodySizeLimit` | **100mb** |
| `vercel.json` | No function timeout override |
| Whisper model | `whisper-1_VERBOSE_JSON` — `src/lib/transcribe.ts` |
| Form-fill model | `gpt-4o-mini`, `max_tokens` 800 — `src/lib/ai.ts` |
| **Preview tier check** | **Required before trusting Sarah relevance:** Hobby **60s** function cap would invalidate comparison to production Pro; confirm in Vercel project → plan + deployment logs. |

**Test student:** Create / use a row named e.g. **`SPIKE_TEST_long_form_transcribe`**; pass `--test-student-id=<uuid>`. **Never use Sarah’s real id.**

**Dates run:** Populate from `results.json` meta after Preview execution.

## Audio-pipeline results

_Client harness measures: (1) browser upload completion (`audio-upload-done`), (2) server action wall-clock until success banner or `role=alert` error. **ffmpeg split** and **per-segment Whisper** timings require **Vercel function logs** (grep `transcribeAndGenerateAction` / `rid=`)._

| Stage | How measured | Outcome (live) |
|-------|----------------|------------------|
| Upload | `setInputFiles` → `data-testid=audio-upload-done` | _Pending Preview run_ |
| `transcribeAndGenerateAction` | Click `ai-transcribe-btn` → review gate **or** error alert | _Pending Preview run_ |
| ffmpeg split | Server logs around `splitAudioIntoWhisperParts` | _Observe on first &gt;25 MB fixture run_ |
| Whisper segments | Count sequential API calls ≈ number of parts | _N parts for ~34 MB file_ |
| `generateSessionNote` | Included in server action duration | _Single `gpt-4o-mini` call_ |

### Failure modes to capture when live

- **Generic framework “unexpected response” / client `catch`** — see `AiAssistPanel` copy: often **serverless timeout** for long single-action work.
- **`ok: false`** returns — user-facing `error` + optional `debugId` / `rid` in Vercel logs.
- **Hallucination / silent segment** handling — per-segment drops **do not** shorten total wall-clock budget by much; still sequential.

## Pasted-text results

Runner order: **10k → 48k → 100k** chars (100k built by repeating the fixture).

| Payload | Chars | `estimateTokens` (ceil len/4) | Expected guard | Outcome (live) |
|---------|-------|----------------------------------|----------------|----------------|
| text-10k | 10 000 | 10 000 | OK | _Pending_ |
| text-50k | 48 000 | 48 000 | OK | _Pending_ |
| text-100k | 100 000 | 100 000 | **`generateNoteFromTextAction` rejects** (`estimateTokens` &gt; `MAX_INPUT_TOKENS` 30 000) | Expect **ok: false** (“too long”) |

Token **usage** (exact prompt/completion tokens) is **not** surfaced to the browser; pull from OpenAI usage dashboard if needed.

## Sarah-Monday risk assessment

| Stage | Risk (code-informed) | Approx likelihood without live headroom | Recovery |
|-------|----------------------|----------------------------------------|----------|
| Blob upload | Retry-once transient policy (`uploadAudioWithRetry`) | Low for Wi-Fi / wired | Retry upload; smaller file |
| **Transcribe + AI single action** | **Dominant**: one function must cover download + optional ffmpeg + **N× Whisper** + **LLM** | **High** for 45–60+ min *speech* recordings if total sequential work nears **plan wall** | UI already suggests shorter files / split uploads (`AiAssistPanel` timeout message); tutor re-tries with segments |
| Pasted long text | Hitting **30k token** cap | Medium only if paste &gt; ~120k chars | Shorten text; future map-reduce (backlog) |
| UI error surfacing | Timeouts surface via **catch** with explicit “server stopped responding…” | N/A | Not silent — **improvement vs generic** failure |

## Phase 6 prioritization recommendation

1. **Task 2 — Background transcription queue / worker offload** (highest leverage if Preview confirms **~300s cliff** on long single files): **L** effort — decouple HTTP from Whisper fan-out; enables **progress** + retry semantics.
2. **Task 1 — Large-file audit** (verify Blob lifecycle, **ffmpeg** cold start, **Neon** contention, **OpenAI** rate limits): **M** effort — hardens what remains **in-process** even after a queue exists.
3. **Task 3 — Per-segment resilience** (partial success, resume, less “all or nothing”): **M–L** — pairs with queue; lowers blast radius of one bad segment.

_Order swaps to (1) if audit finds a **sub-minute** fix (e.g. wrong `maxDuration` deployment wiring) — verify preview tier first._

### Quick wins captured **but not shipped** (per spike rules)

- Confirm **Vercel plan** on the **same** deployment Sarah uses (Hobby **60s** vs Pro **300s**).
- **`MAX_INPUT_TOKENS` vs `estimateTokens`**: heuristic **≠** real tokenizer — could reject / accept marginally wrong edge payloads; tokenizer-based preflight is a small follow-up.
- Optional: use **speech-like** fixture (TTS or concatenated real audio) next spike — sine tone stresses **size + split + sequential API**, not **ASR** realism.

## Reproducer

```powershell
Set-Location c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes

# Ensure ADMIN_EMAIL / ADMIN_PASSWORD are in .env (same as Playwright local tests).

# Preview — set URL from the Vercel Git deployment for this branch:
$env:SPIKE_PREVIEW_URL = "https://YOUR-PREVIEW.vercel.app"
node .\scripts\spike-long-form-transcribe-smoke.mjs --target=preview-url --test-student-id=<uuid>

# Local dev — does not hit Vercel timeout envelope
node .\scripts\spike-long-form-transcribe-smoke.mjs --target=localhost --test-student-id=<uuid>

# Debug harness only (no Whisper spend on audio path)
node .\scripts\spike-long-form-transcribe-smoke.mjs --target=localhost --test-student-id=<uuid> --skip-audio
```

**Flags:** `--skip-text`, `--skip-audio`, `--no-text-variants` (only 48k paste), `--audio-path=…`, `--base-url=…`, `--headed` (debug).

## Cleanup (SPIKE data only)

```powershell
Set-Location c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes
node .\scripts\spike-long-form-transcribe-cleanup.mjs --student-id=<uuid>
```

Requires **`DATABASE_URL`**, **`BLOB_READ_WRITE_TOKEN`**. Script **refuses** students whose **`name`** lacks **`SPIKE_TEST`**.

## Fixture generation

See `tests/fixtures/long-form-transcribe-smoke/README.md`.
