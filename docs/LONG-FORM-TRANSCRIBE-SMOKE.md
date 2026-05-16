# Long-form transcribe — controlled smoke (pre–Sarah-Monday)

**Branch:** `spike-long-form-transcribe-smoke`  
**Status:** stub (filled across spike commits; finalized before PR).

## TL;DR

_(Final paragraph added in Commit 6.)_

## Test setup

| Item | Value |
|------|--------|
| Fixtures | `tests/fixtures/long-form-transcribe-smoke/` |
| Primary audio | `audio-55min-sine.webm` (~55 min, >25 MB — triggers ffmpeg split) |
| Primary paste | `pasted-text-50k.txt` (48k chars) |
| Runner | `node scripts/spike-long-form-transcribe-smoke.mjs` |
| Results artifact | `scripts/spike-long-form-transcribe-smoke-results.json` |
| App `maxDuration` (student detail page) | `300` s (`src/app/admin/students/[id]/page.tsx`) |
| `next.config.ts` serverActions.bodySizeLimit | `100mb` |
| Vercel `vercel.json` | No `maxDuration` override (per-route export applies) |

**Preview tier / effective limit:** _Document after first Preview run (Hobby 60s vs Pro 300s invalidates Sarah-relevance)._

**Test student:** Must be a dedicated row (e.g. name `SPIKE_TEST_long_form_transcribe`); pass `--test-student-id=<uuid>` — **never Sarah’s row.**

**Dates run:** _See `results.meta.runs[].startedAt`._

## Audio-pipeline results

_Per-stage table from `results.json` + any Vercel log excerpts._

| Run | Upload (s) | Transcribe + AI (s) | Outcome | Notes |
|-----|------------|---------------------|---------|-------|

## Pasted-text results

| Payload | Chars | Duration (s) | Outcome | Notes |
|---------|------|--------------|---------|-------|

## Sarah-Monday risk assessment

_(Commit 6.)_

## Phase 6 prioritization

_(Commit 6 — tasks 1 large-file audit, 2 background queue, 3 per-segment resilience.)_

## Reproducer

```bash
# Load ADMIN_EMAIL / ADMIN_PASSWORD from .env (same as local dev / Playwright).

# Preview (binding serverless timeout — set SPIKE_PREVIEW_URL from the Vercel deployment):
set SPIKE_PREVIEW_URL=https://….vercel.app
node c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\scripts\spike-long-form-transcribe-smoke.mjs --target=preview-url --test-student-id=<uuid>

# Local (faster iteration; does not hit Vercel timeout ceiling):
node c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\scripts\spike-long-form-transcribe-smoke.mjs --target=localhost --test-student-id=<uuid>

# Optional: skip Whisper spend while debugging the harness
node c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\scripts\spike-long-form-transcribe-smoke.mjs --target=localhost --test-student-id=<uuid> --skip-audio
```

**Env vars:**

| Var | Purpose |
|-----|---------|
| `SPIKE_PREVIEW_URL` | Required when `--target=preview-url` (unless `--base-url` set) |
| `SPIKE_PRODUCTION_URL` | Required when `--target=production` (explicit prod base) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credentials login |

## Cleanup (SPIKE test data only)

After the spike, remove the test student’s **DB rows** and **Vercel Blob** objects for those recordings. Do not run against real students.

```bash
node c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\scripts\spike-long-form-transcribe-cleanup.mjs --student-id=<uuid>
```

_(Requires `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` — same as app env.)_

## Fixture generation recap

See `tests/fixtures/long-form-transcribe-smoke/README.md`.
