# Long-form transcribe — Tier 1 parallelize + duration-cap split + friendly-error UX — executor briefing

> **Recommended model: Composer.** Small, well-trodden surfaces — extend an existing ffmpeg-split helper, parallelize two existing `for` loops behind concurrency caps, add one UX copy patch. No novel architecture. Vercel Pro is now live (300s server-action ceiling, upgraded 2026-05-17 ~9:00 PM); this build's whole point is to give that 300s budget real headroom for 60-90+ min Sarah sessions. ~30-60 min Composer time + ~30 min Andrew validation on Vercel Preview.
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh Composer chat, your instructions are below — start by reading the AGENTS.md + the other files in the "Read first" section, then proceed through the commit plan in order. No further confirmation needed; begin work.

You are building **Phase 6 task 2 — Tier 1 transcribe parallelize** for the tutoring-notes app. **Branch + smoke + direct merge to master per AGENTS.md merging convention** — NO PR step.

## Workspace + path discipline

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Example: `src/lib/transcribe.ts` resolves to `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\transcribe.ts`. Verify with `Get-Location` (PowerShell) before any file write. NEVER create files at a path that starts with a sibling-repo name.

## Branch discipline

**You are starting in a workspace where the active branch may be ANYTHING.** Cursor's per-workspace git state persists across chats; do not assume `master`. Your FIRST action after the read-first reads is to set up the branch correctly.

Run in PowerShell, sequentially, verifying each succeeds:

```powershell
git status                                                # if uncommitted changes exist, STOP and ask the user
git fetch origin                                          # retry on transient DNS failures (Andrew's git-push-retry rule applies)
git checkout master                                       # switch to master
git pull origin master                                    # fast-forward
git log -1 --format='%H %s'                               # expect a tip at or after 2cccc04 (per-page view state merge); if older, STOP
git checkout -b feat/transcribe-tier-1-parallelize        # branch off master
git status                                                # confirm clean tree on new branch
```

**After branch setup:**
- Push after Commit 1: `git push -u origin feat/transcribe-tier-1-parallelize`. Triggers Vercel Preview deploy.
- Smoke happens against the Vercel Preview URL Andrew will share back, using a long-form audio fixture. You do NOT smoke this; Andrew smokes it. Your job is build + unit tests + push + report.
- **NEVER push directly to master.** Branch → commit → push → smoke (Andrew) → merge (Andrew or you-on-Andrew's-go-ahead).

## Project context

Live commercial-pilot app. Current pain point this build addresses:

> Sarah's pilot includes 60-90 min tutoring sessions. The existing transcribe path runs synchronously inside a Vercel server action, hitting Whisper sequentially across N audio chunks. Until 2026-05-17 ~9:00 PM the app was on Vercel Hobby (60s function ceiling, silently plan-capping the `maxDuration = 300` declarations in the code). Sarah's April 24 50:01+20:13 test hit that ceiling and the session failed to transcribe. Andrew has now upgraded to Vercel Pro (300s ceiling). That alone might save Sarah's typical session length, but the sequential loop is still fragile near the ceiling. This build adds real headroom.

**The fix is two `for` loops and one ffmpeg split-by-duration option.** Nothing structurally clever — just parallelism + smaller chunks behind a concurrency cap that respects OpenAI Whisper rate limits.

### What you are NOT building (explicit non-scope)

- **NOT a background `TranscribeJob` queue + cron worker.** That's Tier 2, deferred unless Tier 1 proves insufficient. Do not introduce any new tables, no `prisma migrate`, no cron route.
- **NOT a multi-track speaker-diarization pass.** That's Phase 6 task 6, separate scope.
- **NOT a UI redesign of the AI panel.** Only ONE small UX patch: the friendly-error copy on timeout. Don't refactor the panel.
- **NOT a refactor of the per-segment side effects** (hallucination detection, blob cleanup on failure, segment skipping). Preserve them exactly; just change the iteration shape from sequential to parallel-with-cap.
- **NOT changing the cost-events instrumentation.** `logCostEvent` calls inside `transcribeSinglePart` are already per-call and parallel-safe.

### Concurrency math (rationale for the caps you'll use)

- **Inner cap (per-Whisper-part within one segment): 6.** Single audio file → ffmpeg splits into N parts (now duration-capped). Calling Whisper on 6 parts in parallel keeps comfortably under OpenAI Tier-1 paid limits (~50 RPM for `whisper-1`). At 300s ceiling: a 30 MB single segment splits into ~6-8 parts × ~30-60s Whisper each → parallel wall-clock ~30-60s. Fits.
- **Outer cap (per-outbox-segment): 3.** Each segment internally fans out to up to 6 parallel Whisper calls; outer cap of 3 means worst-case 18 simultaneous Whisper calls per session — well under 50 RPM but enough for typical Sarah sessions (5-10 segments) to finish in ~max-segment-time + a bit, not sum-of-segments. For a 60-min session with 8 segments at ~30-60s each: parallel wall-clock ~60-120s. Fits comfortably in 300s with headroom for GPT-notes-generation that runs after.
- **Both caps are tunable via constants** at the top of the touched files; default values above. Don't make them env vars yet (over-engineering for now); just `const` so a future tuning patch is one-liner.

## Critical safety constraints (READ before implementing)

**Constraint #1 — Preserve all per-iteration side effects exactly.** The current outer loop in `transcribeAndGenerateAction` (and its whiteboard sibling) does a lot per segment: downloads the blob, runs hallucination detection, deletes the blob + DB row on hallucination, accumulates transcripts in order, surfaces per-segment failures. Parallelizing must NOT lose any of this. The simplest preservation pattern: build an array of "work item" objects from `recordings`, run `Promise.all(workItems.slice(0, cap).map(processOne))` with a small queue helper, then aggregate results in the SAME ORDER as the original `recordings` array (so the joined transcript text matches recording order, not completion order).

**Constraint #2 — Order of joined transcript matters.** Today the transcript is joined as `transcripts.join("\n\n")` in `transcribeAudio`, and across segments the outer loop appends in order. Parallel execution returns out of order; you MUST reorder by original index before joining. A failure here would mix up Sarah's session chronology in the AI panel.

**Constraint #3 — Whisper rate-limit awareness.** OpenAI returns 429 on rate-limit. The current code does NOT retry on 429. Add a small per-call retry with exponential backoff (e.g. 1s, 2s, 4s, max 3 retries) inside `transcribeSinglePart`. Without it, a transient 429 fails the whole session — that's a worse regression than the no-parallelism baseline.

**Constraint #4 — Don't break the existing tests.** `src/__tests__/transcribe.test.ts` + `src/__tests__/transcribe-late-hallucination.test.ts` + `src/__tests__/whiteboard/whiteboard-routes-actions.test.ts` mock `transcribeAudio` and assume specific call shapes. Extend tests for parallel behavior; preserve old test invariants. Pre-existing DB-touching test failures (~9 from baseline) are allowed; new failures are not.

**Constraint #5 — Friendly-error patch must NOT change error-payload shape.** The AI panel reads error strings from the action result. Add a NEW string when timeout-class errors fire (detect via `error?.message?.includes("FUNCTION_INVOCATION_TIMEOUT")` or similar Vercel pattern), but keep the existing error-string shape so the panel renders it normally. Don't add new fields the panel doesn't read.

**Constraint #6 — Logging discipline.** The existing transcribe code logs `[transcribeAndGenerate] rid=${rid}` per session. Extend with `parallel=<cap> parts=<n> attempt=<n>` markers on the relevant log lines so prod debugging can confirm parallelism actually ran. Sub-prefix suggestion: `[transcribe-parallel] rid=<rid> ...`. Without these, "did the parallel actually fire?" is unanswerable from logs.

## Read first (in order)

1. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\AGENTS.md` — workspace conventions: per-session ID logging (`rid` for recordings already registered; no new prefix needed for this build), CSP discipline (n/a — no app code changes here), the merging convention.
2. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\transcribe.ts` — the inner-loop site. ~167 lines. Currently has the sequential `for (const part of parts)` Whisper-calls loop you'll parallelize.
3. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\transcribe-ffmpeg.ts` — the ffmpeg splitter. ~243 lines. Currently splits by SIZE only (`CHUNK_TARGET_BYTES = 22 MB`). You'll add a duration-cap option so even small-but-long audio gets split into ~3-5 min chunks.
4. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\transcribe-constants.ts` — single constant. Add a sibling `WHISPER_TARGET_CHUNK_SECONDS` constant (default 240 = 4 min, safe sub-300s budget per call).
5. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\actions.ts` — the OUTER loop site (one of two). Around line 480+ — `transcribeAndGenerateAction`. Read the per-segment side-effect block carefully (Constraint #1).
6. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\whiteboard\actions.ts` — the OTHER outer loop site (whiteboard recording transcribe path). Same per-segment side-effect pattern. Around line 946. Verify it's structurally similar to actions.ts; the parallelize change should be roughly the same diff in both.
7. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\__tests__\transcribe.test.ts` — existing tests. Extend for parallel-call + concurrency-cap + 429-retry behavior.
8. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\__tests__\transcribe-late-hallucination.test.ts` — verify the hallucination-detection path still works under parallel execution (the test mocks `transcribeAudio` — confirm parallelization at the OUTER layer doesn't break the hallucination-skip semantic).
9. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\AiAssistPanel.tsx` — the UX surface for the friendly-error patch. Find where transcribe errors are surfaced to the user and add the timeout-friendly copy path.
10. **OPTIONAL**: `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\scripts\spike-long-form-transcribe-smoke.mjs` (on branch `spike-long-form-transcribe-smoke`, NOT master) — if you can fetch that branch's fixture-generation scripts, they're useful for the smoke harness in Commit 5. If not, skip — Andrew can produce a long fixture manually.

## YOUR SCOPE — what is IN this chat

### Commit 1 — Add duration-cap to `splitAudioIntoWhisperParts`

Files: `src/lib/transcribe-ffmpeg.ts`, `src/lib/transcribe-constants.ts`.

- Add `WHISPER_TARGET_CHUNK_SECONDS = 240` (4 min) to `transcribe-constants.ts`.
- In `splitAudioIntoWhisperParts`, replace the current `segmentCount = ceil(buffer.length / CHUNK_TARGET_BYTES)` with `segmentCount = max(byteBasedCount, durationBasedCount)` where `durationBasedCount = ceil(durationSec / WHISPER_TARGET_CHUNK_SECONDS)`. Effect: small-but-long audio (e.g. a 30-min webm at 14 MB, under the 22 MB byte threshold but well over 240s) NOW gets split into ~8 parts instead of being 1 part.
- Preserve all existing recursive bisection logic for VBR oversize cases (no semantic change there).
- **Don't break the small-file fast path.** If `buffer.length <= WHISPER_MAX_BYTES` AND `durationSec <= WHISPER_TARGET_CHUNK_SECONDS`, return as a single part (current `transcribeAudio` already does this check; keep it).

Tests: extend `src/__tests__/transcribe.test.ts` (or add `src/__tests__/transcribe-ffmpeg.test.ts` if needed):
- A 14 MB / 30-min synthetic file → splits into ≥6 parts based on duration cap.
- A 10 MB / 2-min synthetic file → stays single part (small fast path preserved).
- An oversize VBR file → still bisects correctly (existing test pattern preserved).

### Commit 2 — Parallelize the inner Whisper-call loop with cap + 429 retry

File: `src/lib/transcribe.ts`.

- Replace the sequential `for (const part of parts) { const result = await transcribeSinglePart(...) }` loop with a small concurrency-capped parallel helper.
- Add `const WHISPER_INNER_CONCURRENCY = 6` at the top of the file.
- Helper pattern (inline, no new lib):
  ```typescript
  async function mapWithConcurrency<T, U>(
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
    await Promise.all(Array.from({ length: Math.min(cap, items.length) }, worker));
    return results;
  }
  ```
- Use it to run `transcribeSinglePart` in parallel across `parts`. **CRITICAL: preserve order** — results indexed by original position, joined in order. The helper above does this.
- Inside `transcribeSinglePart`, wrap the `client.audio.transcriptions.create(...)` call with a small retry on 429 / 5xx: max 3 attempts, exponential backoff 1s → 2s → 4s. If all retries fail, return the existing error shape so the outer loop's error-handling path is preserved.
- Add logging: `console.log("[transcribe-parallel] rid=" + ... + " inner-cap=" + WHISPER_INNER_CONCURRENCY + " parts=" + parts.length + " mode=parallel")` at the start; per-part log includes part index + duration + outcome.
- Aggregate per-part failures: if ANY part errors after retries, return the existing single-error shape (preserves outer-loop semantics). Don't try to be clever about partial success at this layer — that's an Option B for later if needed.

Tests: extend `src/__tests__/transcribe.test.ts`:
- 5-part input → all 5 Whisper calls fire (not sequentially-blocked); transcript is in order.
- Concurrency cap respected: with cap=2 and 6 parts, at most 2 in-flight at any moment (assert via mock with deliberate delays).
- 429 retry: mock that fails twice with 429 then succeeds → final result has the success transcript.
- 429 exhaustion: mock that fails 4 times with 429 → returns error.
- Order preservation: parts with deliberately staggered resolution times → joined transcript is `part0\n\npart1\n\npart2`, not in completion order.

### Commit 3 — Parallelize the outer per-segment loop with cap

Files: `src/app/admin/students/[id]/actions.ts`, `src/app/admin/students/[id]/whiteboard/actions.ts`.

- Apply the same `mapWithConcurrency` pattern (export it from `src/lib/transcribe.ts` or duplicate inline if cleaner) to the OUTER per-segment loop.
- Cap = 3 (outer cap; combined with inner cap=6 gives worst-case 18 simultaneous Whisper calls).
- **Preserve all per-iteration side effects exactly** (Constraint #1):
  - Per-segment blob download
  - Per-segment hallucination detection + skip + blob/DB cleanup on skip
  - Per-segment transcript accumulation IN ORIGINAL ORDER
  - Per-segment failure → error returned for the whole batch (same as today)
- Logging: `[transcribe-parallel] rid=<rid> outer-cap=3 segments=<n> mode=parallel`.
- The two action files have structurally similar loops; the diff should be roughly identical in both. Verify by reading both fully before changing either.

Tests: extend `src/__tests__/transcribe-late-hallucination.test.ts` + `src/__tests__/whiteboard/whiteboard-routes-actions.test.ts`:
- Multi-segment input where one segment is hallucination → that segment is skipped + blob deleted, other segments processed normally, final transcript is in original order minus the skipped segment.
- Multi-segment input where one segment errors → action returns the error (whole batch fails, existing behavior preserved).
- Order preservation: 4 segments with mock-staggered Whisper response times → final joined transcript is in segment-index order.

### Commit 4 — Friendly-error UX patch on Vercel function timeout

Files: `src/app/admin/students/[id]/actions.ts` (+ whiteboard sibling), `src/app/admin/students/[id]/AiAssistPanel.tsx`.

- In the action's catch / error-aggregation path, detect Vercel function-timeout errors. Heuristics (try in order, take whichever matches):
  - Error message contains `FUNCTION_INVOCATION_TIMEOUT`.
  - Error name is `TimeoutError`.
  - Total elapsed time inside the action ≥ 290s (10s safety margin under 300s) — measure via `performance.now()` at action start vs error site.
- When detected, return the error message:
  > "This recording is taking longer than expected to process. For long sessions (60+ min), try uploading the recording in two shorter parts from Voice Memos / Audacity, or paste a text summary. We're improving long-session handling in the background."
- In `AiAssistPanel.tsx`, verify this string renders as-is (no special-casing needed — it's just a longer error string). If the panel truncates long errors, lift the truncation for this one case.

Tests: extend whichever test file is appropriate:
- Action with mocked-to-throw timeout error → returns the friendly-copy string.
- Action with non-timeout error → returns the original error string (no regression on existing error paths).

### Commit 5 — Smoke harness (synthetic long-form fixture) — OPTIONAL if time-pressed

File: `scripts/smoke-long-form-transcribe.mjs` (new).

- A small Node script that generates a synthetic 60-min audio fixture (silence + occasional tones, or concatenated short Whisper test clips), uploads it via the existing audio-upload path against a Vercel Preview URL, triggers transcribe, prints timing + outcome.
- IF the spike branch `spike-long-form-transcribe-smoke` has reusable fixture-generation logic, fork-port it here and credit the source in a comment. If not, write minimal new fixture-gen using ffmpeg silence + sine tones.
- Document usage in script header: `node scripts/smoke-long-form-transcribe.mjs --target=<preview-url> --test-student-id=<id> --duration-minutes=60`.
- This is for ANDREW to run during smoke; you do NOT run it (Composer envs can't reach Neon).
- **SKIP this commit if you're past the ~60 min budget.** The manual smoke checklist below covers it.

### Commit 6 — Docs + STATUS update

- Update `docs/PHASE-1B-STATUS.md` or create `docs/PHASE-6-TIER-1-STATUS.md` (executor judgment — match the existing per-phase STATUS doc pattern). Document:
  - What shipped (duration-cap + parallel + retry + friendly-error).
  - Configured caps + rationale.
  - Known follow-up: Tier 2 (background `TranscribeJob` queue) is deferred unless Tier 1 proves insufficient on Sarah's actual sessions.
- Update `docs/BACKLOG.md` line ~59 to remove "(plan-capped)" from the `maxDuration` note — Pro is live now, so the declaration takes effect.

## SMOKE CHECKLIST FOR ANDREW (executor: copy verbatim into your final report)

Andrew runs these against the Vercel Preview URL.

### Pre-smoke setup
- [ ] Confirm Vercel function logs for the Preview deploy show 300s ceiling (not 60s). If logs report 60s timeouts, Pro upgrade hasn't propagated — STOP and re-check Vercel dashboard before continuing.
- [ ] Have a ~60-min audio file ready (real Sarah recording from prior session, or synthetic from the Commit 5 harness, or self-record).

### Functional smoke
- [ ] **Short session unchanged**: record a 2-min session as you normally would → transcribes successfully, timing is comparable to pre-parallelize baseline (parallel of 1-2 parts is essentially the same as sequential).
- [ ] **Medium session improvement**: record or upload a 15-min session → transcribes successfully, completes in roughly the same time as before or slightly faster (parallelism kicks in but small N keeps benefit modest).
- [ ] **Long-form (60+ min) success**: upload the prepared 60-min fixture → transcribes successfully WITHIN 300s function ceiling. Pre-Pro this would have hit the 60s wall; post-Pro pre-parallelize it would have hit 300s sequentially; post-this-build it should fit with headroom.
- [ ] **Logs confirm parallelism**: in Vercel function logs for the long-form run, grep `[transcribe-parallel]` lines → confirm `inner-cap=6 parts=N mode=parallel` shows N > 1. If N=1 for a 60-min recording, the duration-cap split isn't firing — bug.
- [ ] **Cost-events recorded per part**: query the `CostEvent` table in dev DB after the long-form run → expect N rows (one per Whisper-part), not 1 (per-call cost-events shipped 2026-05-17 are per-part).

### Edge cases
- [ ] **Hallucination skip still works**: include in your long-form fixture a long silent section (or use a real session with a known-silent stretch) → the hallucination-detection path skips it as before, blob is deleted, other segments transcribe normally. Final transcript shows no silence-derived text.
- [ ] **Order preservation**: if you can stage segments where part 1 is shorter/faster than part 2 → final transcript starts with part 1 content, not part 2.
- [ ] **429 / rate-limit handling**: hard to deliberately trigger, but if it fires in any run, look for `[transcribe-parallel] ... retry attempt=` lines. Don't engineer a test; just confirm no 429 mention crashes the run.
- [ ] **Friendly-error copy**: if any run does hit the 300s ceiling (e.g. you push a 120-min fixture deliberately), confirm the AI panel shows the new "long sessions: try uploading in two shorter parts" copy, not a generic error.

### Tests + lint
- [ ] `npx jest src/__tests__/transcribe.test.ts src/__tests__/transcribe-late-hallucination.test.ts src/__tests__/whiteboard/whiteboard-routes-actions.test.ts` → all green; pre-existing DB-touching test failures (~9 from baseline) ignored as documented.
- [ ] `npx jest` (full suite) — no NEW failures vs baseline.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx eslint src/` 0 new errors.

## WRAP-UP

1. Full test suite: `npx jest` (modulo documented DB failures from prior phases).
2. `npx tsc --noEmit` clean.
3. Final push: `git push origin feat/transcribe-tier-1-parallelize`.
4. Report back to Andrew with:
   - **Branch name**: `feat/transcribe-tier-1-parallelize`
   - **Test counts** (passed / failed; flag any NEW failures)
   - **Commit hashes** (Commit 1 → Commit 6 with brief description each)
   - **Constants chosen**: `WHISPER_TARGET_CHUNK_SECONDS`, `WHISPER_INNER_CONCURRENCY`, outer-cap value
   - **Smoke checklist** (full list above, copy verbatim)
   - **Logs to look for during smoke** (the `[transcribe-parallel]` prefix conventions)
   - **Notable findings** (e.g. "Existing splitter already had partial duration-awareness via X; reused; net diff smaller than expected")
   - **Deferred items** (Tier 2 background queue; Phase 6 task 6 speaker diarization; anything you ran out of time on in Commit 5)
5. **STOP and wait for Andrew's smoke confirmation. Do NOT merge to master yourself.**
6. **If Andrew confirms smoke pass and asks you to merge**:
   ```powershell
   git checkout master
   git pull origin master
   git merge --no-ff feat/transcribe-tier-1-parallelize
   git push origin master
   ```

## STOP CONDITIONS

- **Don't build Tier 2.** No background `TranscribeJob` queue, no cron worker, no polling endpoint. Only if Tier 1 proves insufficient on Sarah's actual sessions does Tier 2 fire — that's a future bootstrapper.
- **Don't refactor `AiAssistPanel.tsx` beyond the friendly-error copy patch.** Adjacent UX cleanup is scope creep.
- **Don't introduce new package.json deps.** All needed primitives (`Promise.all`, OpenAI SDK, ffmpeg-static) are already present.
- **Don't change CSP / middleware.** No new external origins here.
- **Don't touch `prisma/schema.prisma` or generate migrations.** Zero schema work; pure runtime parallelism.
- **Don't change the error-payload shape** the AI panel reads. Add a new error STRING for the timeout case, but keep the shape.
- **Don't merge to master yourself.** Branch + push + WAIT for Andrew's smoke + his go-ahead.
- **Don't modify the master plan file.** Orchestrator's job.
- **Don't run the script in Commit 5 yourself.** Composer environments can't reach Neon / Vercel Preview; Andrew runs it.

## HARD RULES

- Never push directly to master without smoke + Andrew's confirmation.
- Per-session ID logging mandatory: extend existing `rid=<rid>` with sub-prefix `[transcribe-parallel]` for all new log lines.
- Order preservation across parallel parts AND parallel segments is non-negotiable (Constraint #2). A failure here would mix up Sarah's session chronology.
- 429 retry inside `transcribeSinglePart` is mandatory (Constraint #3). Without it, transient rate-limits are worse than sequential.
- Side-effect preservation in the outer loop is non-negotiable (Constraint #1). Hallucination skip, blob cleanup, error semantics — all must work identically post-parallelization.
- Concurrency caps default 6 (inner) and 3 (outer); both as `const` at top of files, not env vars. Future tuning is a one-liner patch.
- Tests must cover order preservation, concurrency-cap enforcement, 429-retry, and timeout-friendly-error paths.
- Friendly-error message wording (Constraint #5) — copy verbatim from this brief, do NOT paraphrase. Andrew may want to tweak it later; for now match exactly.
