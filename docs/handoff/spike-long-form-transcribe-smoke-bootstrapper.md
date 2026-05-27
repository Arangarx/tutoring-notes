> **SUPERSEDED 2026-05-27.** See [`docs/handoff/long-form-transcribe-tier-1-orchestrator-report.md`](long-form-transcribe-tier-1-orchestrator-report.md) for the outcome artifact. This file is preserved for archival reference; do not act on it directly. Reason: spike completed; the orchestrator report is the canonical outcome.

# Spike — long-form transcribe controlled smoke (pre-Sarah-Monday)

Copy everything below the rule line into a fresh Composer chat. Do NOT include this header.

---

You are running a controlled-smoke spike for the tutoring-notes app. Composer-class. ~2-3 hr scope. Branch + PR — do NOT push to master.

## Workspace + path discipline (read carefully)

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown in this bootstrapper without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Example: `scripts/spike-long-form-transcribe-smoke.mjs` resolves to `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\scripts\spike-long-form-transcribe-smoke.mjs`. Do NOT trust your shell's working directory to be set correctly — verify with `Get-Location` (PowerShell) before any file write or destructive operation. NEVER create files at a path that starts with a sibling-repo name (e.g. `agenticPipeline/...`) — sibling repos require their own absolute root, which is OUT OF SCOPE for this spike.

## Branch discipline (read carefully)

- Create branch: `git checkout -b spike-long-form-transcribe-smoke` (off master at `d7fd583` or later).
- Push after Commit 1 (fixtures): `git push -u origin spike-long-form-transcribe-smoke`. This triggers a Vercel Preview deploy with a stable URL — **the preview URL is the spike's primary target**, since the 300s server-action timeout only manifests against the real serverless function, not localhost.
- Subsequent commits: `git push` (no `-u` needed); each push redeploys the preview.
- **NEVER push to master.** PR + review path only. If you accidentally `git push origin master`, STOP immediately and tell the user.

## Project context

Live commercial-pilot app — Sarah uses this for real sessions. Sarah's real Monday 2026-05-18 session is the first real-user test of the post-Phase-4 codebase, and it WILL exercise the long-form transcribe pipeline that's been intermittently broken since her 2026-04-24 test hit a Vercel server-action timeout (*"The server stopped responding before transcription finished"*). Your job is to characterize the failure mode in a controlled environment BEFORE Sarah does, so the Phase 6 reliability work has real evidence to prioritize against.

This is a SPIKE — it produces evidence, not production code. The deliverable is a markdown document with findings, not a feature.

## Background context (read first, in order)

1. `AGENTS.md` — workspace conventions. Live commercial pilot, North Star = "no backup recorder", reliability bar.
2. `docs/BACKLOG.md` — search for `long.*session`, `25 MB`, `ffmpeg`, `transcribe`. The relevant prior context: Sarah Apr 24 50:01+20:13 test hit the timeout; B1 client-direct upload shipped for the 4.5MB body-limit fix; server-side ffmpeg time-split + bisect (`src/lib/transcribe-ffmpeg.ts`) ships for oversized uploads; Vercel server-action timeout is ~300s on hobby/pro.
3. `c:\Users\arang\.cursor\plans\tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md` — search for "Captured 2026-05-15 late-evening" for the spike spec context and what the orchestrator wants out of this. Also Phase 6 task 1 (Large-file audio upload audit) + task 2 (Background transcription queue) are what this spike informs.
4. `src/lib/recording/upload.ts` — `uploadAudioDirect` (the B1 client-direct Vercel Blob path). Note any retry logic, timing, error handling.
5. `src/app/admin/students/[id]/actions.ts` — `transcribeAndGenerateAction` (the server action that timed out on Sarah). Note its current timeout config, any chunking, the path from upload → transcribe → AI generation.
6. `src/lib/transcribe.ts` + `src/lib/transcribe-ffmpeg.ts` — the actual Whisper + ffmpeg split paths. Note the 25MB-per-API-call limit, the bisect logic, any error retry.
7. `src/lib/ai.ts` — `generateSessionNote` (the AI form-fill from transcribed text). Note the model used, input bounds if any, response handling.
8. `next.config.js` / `vercel.json` (if exists) — current `maxDuration` for server actions / API routes. Confirm we're actually on the 300s ceiling and not something lower.
9. `src/app/admin/students/[id]/AiAssistPanel.tsx` — the UI that calls `transcribeAndGenerateAction`. Note how it handles errors / timeouts.
10. `git log master --oneline -10` — confirm master tip is `d7fd583` (Phase 4c merge) or later before starting.

## YOUR SCOPE — what is IN this spike

**Goal**: Run the full existing audio → upload → transcribe → AI-form-fill pipeline against synthetic inputs at real Sarah-session scale (45-60 min recording, large pasted-text counterpart). Characterize what breaks and where, OR document the real performance envelope if nothing breaks. Output a markdown document that informs Phase 6 task 1 + task 2 prioritization with concrete evidence.

**Deliverables (one branch, one PR — `spike-long-form-transcribe-smoke` off master)**:

1. **Synthetic test fixtures**:
   - **~45-60 min audio file** for the recording-pipeline test. Generation approach (pick whichever is fastest to produce):
     - (a) Concatenate an existing real-session recording from local dev DB (if Andrew has one with verified Sarah-style content); ffmpeg `-c copy` to avoid re-encoding.
     - (b) Use an existing test fixture from `src/__tests__/fixtures/` looped + concatenated to 45-60 min length.
     - (c) Generate via TTS (espeak-ng / macOS `say` / Web Speech) reading a long English text file (Project Gutenberg book chapter etc.) — works on any platform, low setup cost. Target a fixture under `tests/fixtures/long-form-transcribe-smoke/audio-45min.m4a` (or .webm matching what MediaRecorder produces in browser, since the upload path expects that format).
   - **~30-50k char pasted-text payload** for the AI-from-text path. Generation: extract a long transcript from a public-domain source (e.g. a Khan Academy lecture transcript, a Project Gutenberg chapter — pick something with subject/homework/assessment-like content so the AI form-fill has plausible content to extract). Save under `tests/fixtures/long-form-transcribe-smoke/pasted-text-50k.txt`.
   - Both fixtures are committed to the branch so the spike is reproducible.

2. **Test runner script** at `scripts/spike-long-form-transcribe-smoke.mjs` (or `.ts` if the repo uses ts-node for scripts — match existing convention):
   - Takes a `--target` arg (`localhost` | `preview-url` | `production`) so it can run against either Vercel Preview (which actually hits the 300s serverless timeout the way Sarah will) OR localhost (faster iteration; doesn't hit the real timeout). **Default to preview-url to get the real evidence.**
   - Takes a `--test-student-id` arg (the dev DB row to attach test recordings to). **Create a clearly-named test student row in dev DB first** (e.g. `name: "SPIKE_TEST_long_form_transcribe"`) so the spike doesn't pollute Sarah's real student data, and the cleanup script can find + remove the spike's data easily afterward.
   - Pipeline-stage instrumentation: every step gets a `console.time` / `console.timeEnd` block with size + duration + outcome (success / failure / error code / timeout signal). Captures: (a) upload start → upload end + uploaded bytes / sec, (b) `transcribeAndGenerateAction` start → first response chunk → final response or timeout, (c) Whisper API call timing inside the action (instrument via patch / hook if practical, otherwise just outer), (d) ffmpeg split path timing if it activates, (e) `generateSessionNote` AI call timing + token counts in / out.
   - Runs both paths sequentially: (i) audio-recording path (upload → transcribe → AI form-fill), (ii) AI-from-text path (pasted text → AI form-fill).
   - Emits a structured `results.json` next to the script with all the timing + outcome data so the markdown writeup can be generated from it deterministically.

3. **Findings document** at `docs/LONG-FORM-TRANSCRIBE-SMOKE.md`. Structure:
   - **TL;DR** — one paragraph: did the pipeline survive 45-60 min sessions, where did it break or come close to breaking, what's the headroom.
   - **Test setup** — fixtures, target environment, test student id, dates run, Vercel function `maxDuration` config in effect.
   - **Audio-pipeline results** — per-stage timing table (upload / transcribe / ffmpeg-split / AI form-fill / total), pass/fail per stage, observed error mode if failed (timeout message, HTTP status, server log excerpt). If timeout: how close to the 300s ceiling was the successful run? What was the size + duration of input?
   - **Pasted-text results** — same shape: timing of `generateNoteFromTextAction`, observed truncation or error or success, model token counts if observable.
   - **Sarah-Monday risk assessment** — based on findings, what's the probability Sarah's real session breaks at each stage? What's the recovery path if it does? Does the current UI surface the failure usefully or silently swallow it?
   - **Phase 6 prioritization recommendation** — concrete ordering for Phase 6 task 1 (large-file audit) vs task 2 (background queue) vs task 3 (per-segment resilience) based on what actually broke. Estimated effort per task to close the highest-leverage gap.
   - **Reproducer commands** — how to re-run the spike when needed, what env vars to set, how to point at preview vs prod.

4. **Cleanup**:
   - After the spike completes, delete the spike's test recordings from dev DB AND the corresponding Vercel Blob entries (the test student id makes them findable). Document the cleanup commands in the findings doc.
   - Do NOT delete real student data. The test-student-row pattern + a name prefix filter makes this safe.

## What is OUT of this spike

- **Do NOT actually fix the failure modes you find.** This is a characterization spike. Fixes are Phase 6 work, prioritized based on what you find. If you discover a 1-line fix that's clearly safe (e.g. add `language: "en"` to Whisper call, bump a timeout), capture it in the findings doc as a "quick win" recommendation but do NOT ship it in this PR.
- **Do NOT modify production code paths** beyond instrumentation. If you need timing data the existing code doesn't emit, add `console.time` calls — but mark them clearly as `// SPIKE: remove before merge` and remove them before the PR is opened (the findings doc captures the data, not the code).
- **Do NOT introduce a background job queue or change the transcribe architecture.** That's Phase 6 task 2 proper, gated by what this spike learns.
- **Do NOT touch the Vercel Blob cleanup utility scope.** That's Phase 2 task 11 (separate spike when prioritized — coordinate with Andrew on the prod→dev DB mirror harness).
- **Do NOT test against Sarah's real student row.** Create a `SPIKE_TEST_...` student in dev DB.
- **Do NOT publish or share findings outside the orchestrator chat / commit.** Test data may contain content from copyrighted source material (Gutenberg is fine; other sources may not be).

## CRITICAL CONSTRAINTS

- **Test student row isolation**: the spike's test data is attributed to a clearly-named `SPIKE_TEST_...` row. Multi-tenant ownership assertions still apply — `assertOwnsStudent` will block cross-student access by design; verify the test student belongs to the admin user running the spike.
- **No master pushes**. Branch + PR. Even though this is a spike, the test fixtures + script + findings doc are committed for reproducibility.
- **No DB migrations expected**. The test student row uses the existing `Student` schema; no schema changes.
- **No CSP / middleware changes**. The spike runs against existing endpoints.
- **No removing instrumentation from prod code before PR open**. The spike's `console.time` adds in prod code paths must be reverted in the PR (the findings doc + results.json capture the data permanently; the code stays clean).
- **Vercel function `maxDuration` is the binding constraint** the spike must hit. Verify before running which tier the test target is on (hobby vs pro vs enterprise) — the timeout differs (60s / 300s / 900s). Default assumption is 300s pro tier; document the actual value in findings.
- **Run against Vercel Preview, not localhost**, for the binding evidence. Localhost runs are useful for iteration but don't hit the real serverless timeout. Production target is fine ONLY against the SPIKE_TEST student row.
- **Cost budget**: each long-form transcribe run costs ~$0.30-0.60 in Whisper API + ~$0.20-0.50 in OpenAI completion. Budget ~$10 total for the spike (15-20 runs across both pipelines). If you find yourself running > 20 calls, stop and ask Andrew before continuing.

## EXECUTION ORDER

1. **Commit 1 — Test fixtures.**
   - Generate audio + text fixtures, commit under `tests/fixtures/long-form-transcribe-smoke/`.
   - Add `.gitattributes` line if the audio file is large (`filter=lfs` if LFS is set up, else just commit as-is — 45 min m4a at ~64 kbps is roughly 22 MB, within git's reasonable limit; if it's larger, use LFS or just an external download script).
   - Document the generation method in the findings doc stub (commit the doc as a stub now so subsequent commits update it).

2. **Commit 2 — Test runner script.**
   - `scripts/spike-long-form-transcribe-smoke.mjs` (or `.ts`).
   - Verify it runs against `--target=localhost` first (cheap, fast iteration; doesn't burn Whisper $).
   - Once happy with the shape, document the `--target=preview-url` invocation in the findings doc.

3. **Commit 3 — First Preview-URL run + initial findings.**
   - Run against Vercel Preview with the test-student-id.
   - Capture results.json + any error logs.
   - Update findings doc with first-run data.
   - **Critical observation moment**: did the audio pipeline survive? If timeout: at what point? If success: what was the headroom?

4. **Commit 4 — Targeted re-runs to characterize edge.**
   - If the first run failed: try a shorter audio (~30 min) to confirm the breakpoint. Try a longer one (~75 min) to confirm the failure mode is consistent.
   - If the first run succeeded: try a longer audio (~75 min, ~90 min) until either it fails or you've established the real headroom.
   - 3-5 runs total in this commit, all captured in results.json + findings doc.

5. **Commit 5 — Pasted-text pipeline runs.**
   - Repeat the characterization shape for `generateNoteFromTextAction` with the 30-50k char fixture.
   - Try a smaller (~10k char) and larger (~100k char) variant to bracket.
   - Capture in results.json + findings doc.

6. **Commit 6 — Findings doc finalization + cleanup.**
   - Fill in TL;DR, Sarah-Monday risk assessment, Phase 6 prioritization sections.
   - Run the spike-test-student-cleanup commands + verify dev DB + Vercel Blob are clean of spike data.
   - Remove any `// SPIKE:` instrumentation adds in prod code.
   - Open PR.

## WRAP-UP

1. PR title: `Spike — long-form transcribe controlled smoke (pre-Sarah-Monday characterization)`.
2. PR body (~600 chars):

   ```markdown
   ## Spike — long-form transcribe smoke

   Characterizes the audio-recording + AI-from-text pipelines at Sarah-session scale (45-60 min audio, 30-50k char pasted text) against Vercel Preview, where the 300s server-action timeout is the binding constraint. NO PRODUCTION CODE CHANGES — fixtures + spike runner script + findings doc only.

   Findings: `docs/LONG-FORM-TRANSCRIBE-SMOKE.md`. Headroom + breakage modes inform Phase 6 task 1 (large-file audit) + task 2 (background queue) prioritization.

   Reproducer: `node scripts/spike-long-form-transcribe-smoke.mjs --target=preview-url --test-student-id=<id>`.
   ```

3. Report back to the orchestrator chat (Andrew) with: PR URL, the TL;DR paragraph from the findings doc, the Phase 6 prioritization recommendation, any "quick win" candidates that were tempting but not shipped (so they get slotted as separate Composer follow-ups).

## STOP CONDITIONS

- **Don't fix what you find.** Characterize, document, recommend. Phase 6 ships fixes based on this evidence.
- **Don't burn through the $10 cost budget without asking.** If you're > 20 calls and haven't characterized fully, stop and surface the budget question.
- **Don't run against Sarah's real student row.** SPIKE_TEST_ prefix is mandatory.
- **Don't leave SPIKE instrumentation in production code paths.** Remove before PR.
- **Don't push to master.** Branch + PR.
- **Don't modify wire encryption / CSP / DB schema.** None of those should be needed for a characterization spike.
- If you discover the test target (Preview URL) is on a tier with a different `maxDuration` than expected (60s on hobby, 900s on enterprise), STOP and report — the binding constraint matters for whether the spike's evidence is Sarah-relevant.
- If a single run takes > 8 min and hasn't returned, kill it and capture as a "timeout / hang" data point. Don't let runaway runs eat budget.

## HARD RULES

- Never push to master.
- Don't modify the master plan file. Orchestrator's job.
- Multi-tenant ownership assertions still apply — `assertOwnsStudent` for any DB writes you do.
- Don't change wire encryption, CSP headers, or DB schema.
- If anything in this bootstrapper is unclear, ask the user (who will route through the orchestrator if needed). DO NOT guess on the test student id, target URL, or cost budget.
