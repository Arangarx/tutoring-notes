# Long-form transcribe Tier 1 — executor → orchestrator report

> **Audience:** orchestrator picking up after executor work on Phase 6 Task 2 (parallel transcribe + duration splits + timeout UX).  
> **Branch:** `feat/transcribe-tier-1-parallelize` (off `master` at push time — verify tip before merge).  
> **Commits:** Executor left changes **uncommitted** per Andrew’s “commits only when asked” rule; orchestrator should review diff, then commit/push using repo convention (`AGENTS.md`: descriptive commits + push to `origin`, retry transient network errors).

---

## 1. Summary

Tier 1 scope from [`docs/handoff/long-form-transcribe-tier-1-parallelize-bootstrapper.md`](long-form-transcribe-tier-1-parallelize-bootstrapper.md) is implemented in working tree:

- Duration-aware ffmpeg chunk planning (`WHISPER_TARGET_CHUNK_SECONDS = 240`) so small-but-long audio splits, not only oversized-byte audio.
- Parallel Whisper calls inside one recording (**inner cap 6**) with order-preserving join + `[transcribe-parallel]` logs.
- Parallel per-segment processing in **`transcribeAndGenerateAction`** and **`generateNotesFromWhiteboardSessionAction`** (**outer cap 3**) with same side effects as before (hallucination skip, blob/DB cleanup, ordered transcripts).
- Per-call **429 / 5xx** retries inside Whisper (`1s → 2s → 4s`, max **3** retries).
- Friendly timeout copy via **`FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE`** + **`shouldTreatAsTranscriptionTimeout`** (message substring, `TimeoutError` name, or **elapsed ≥ 290s**).
- Docs: **`docs/PHASE-6-TIER-1-STATUS.md`**, **`docs/BACKLOG.md`** (removed “plan-capped” wording for `maxDuration`).
- **Not done:** Commit 5 optional smoke harness script (`scripts/smoke-long-form-transcribe.mjs`) — skipped as time-optional.

**Runtime declaration:** `export const maxDuration = 300` remains on:

- `src/app/admin/students/[id]/page.tsx`
- `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/page.tsx`

---

## 2. Constants (tunable via `const` in source)

| Name | Value | Location |
|------|-------|-----------|
| `WHISPER_TARGET_CHUNK_SECONDS` | `240` | `src/lib/transcribe-constants.ts` |
| Inner concurrency | `6` | `src/lib/transcribe.ts` (`WHISPER_INNER_CONCURRENCY`) |
| Outer concurrency (sessions) | `3` | `src/app/admin/students/[id]/actions.ts` (`TRANSCRIPT_OUTER_CONCURRENCY`) |
| Outer concurrency (whiteboard) | `3` | `src/app/admin/students/[id]/whiteboard/actions.ts` (`WB_TRANSCRIPT_OUTER_CONCURRENCY`) |

---

## 3. Automated verification (executor ran)

| Check | Result |
|-------|--------|
| Targeted Jest (transcribe + actions mocks + whiteboard + plan + timeout helpers + `mapWithConcurrency`) | **42 passed** |
| `npx tsc --noEmit` | **Clean** |
| Full `npx jest` | Not re-run end-to-end on executor machine (DB globalSetup skipped when Postgres unreachable — orchestrator should run full suite with DB when available). |

**New / touched tests:**  
`src/__tests__/transcribe.test.ts`, `transcribe-ffmpeg-plan.test.ts`, `transcribe-result-timeout.test.ts`, `map-with-concurrency.test.ts`, plus mock updates in `audio-isolation.test.ts`, `transcribe-late-hallucination.test.ts`, `whiteboard/whiteboard-routes-actions.test.ts`.

---

## 4. Smoke checklist (for Andrew / pilot) — with “how” for step 1

Andrew runs these against the **Vercel Preview URL** after orchestrator pushes the branch.

### Pre-smoke — Step 1: Confirm **300s** serverless ceiling (not Hobby **60s**)

Andrew wasn’t sure how to do this; orchestrator can steer one of these paths:

**A. Dashboard / plan (fast sanity check)**  
1. Open [Vercel Dashboard](https://vercel.com) → select **this project** (tutoring-notes).  
2. **Settings → Billing** (or team settings): confirm plan is **Pro** (not Hobby). Hobby hard-limits serverless duration (~60s); Pro honors higher limits where configured.  
3. **Settings → Functions** (if shown for the framework): note default/max duration policies for the team.

**B. Code truth + deployment**  
1. Confirm `maxDuration = 300` on the student routes listed in §1 (already in repo).  
2. Open the **Preview deployment** for `feat/transcribe-tier-1-parallelize` → **Building / Deployment** summary — ensure deploy succeeded after Pro upgrade.

**C. Runtime evidence (strongest)**  
1. **Preview → Logs** (or **Observability → Logs**) during a **long transcribe** run.  
2. If the platform kills the function early, Vercel often surfaces **`FUNCTION_INVOCATION_TIMEOUT`** or similar around **~60s on Hobby** vs **~300s on Pro** when `maxDuration` is 300.  
3. Optional: compare wall-clock until failure with a deliberate stress case (e.g. very long fixture); Hobby fails near **60s**, Pro near configured ceiling.

**Stop gate:** If logs/timeouts still look like **60s**, do **not** trust long-session smoke — fix plan/dashboard before continuing.

---

### Pre-smoke — Step 2

- [ ] Have a **~60 minute** audio fixture ready (real pilot recording, or synthetic — Commit 5 harness was **not** added).

### Functional smoke

- [ ] **Short (~2 min):** Record/transcribe as usual → success; timing roughly comparable to before (few parts ⇒ parallelism is a no-op).
- [ ] **Medium (~15 min):** Completes; may be modestly faster than sequential baseline.
- [ ] **Long (60+ min):** Upload/process → completes **within** function budget (**300s** on Pro).  
- [ ] **Logs:** Search **`[transcribe-parallel]`** → expect `inner-cap=6 parts=N mode=parallel` with **N > 1** for long audio; **`outer-cap=3`** when multiple segments. **If N = 1** on a long file → duration split likely not firing (investigate).
- [ ] **Cost events:** After long run, DB **`CostEvent`** rows ≈ **one per Whisper part** (not a single aggregate for the whole hour).

### Edge cases

- [ ] **Hallucination guard:** Silent/junk segment skipped; blobs/rows cleaned per existing semantics; remaining transcript usable.
- [ ] **Order:** Final transcript follows **recording / segment order**, not completion order.
- [ ] **429:** Rare in manual smoke; if it appears, confirm retries don’t hard-fail the whole session (logs may show **`retry attempt=`**).
- [ ] **Friendly timeout:** If something hits the ceiling, AI panel should show the exact **`FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE`** string from `src/app/admin/students/[id]/transcribe-result.ts` (returned as normal `ok: false` `error`, prefixed by **`Ref:`** in UI via `formatUserFacingActionError`).

### Final QA bars

- [ ] `npx jest src/__tests__/transcribe.test.ts src/__tests__/transcribe-late-hallucination.test.ts src/__tests__/whiteboard/whiteboard-routes-actions.test.ts` — green.
- [ ] `npx jest` — **no new failures** vs repo baseline (known legacy DB-touching failures may remain).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint src/` — no new errors.

---

## 5. Merge / hygiene notes for orchestrator

- **Untracked noise (do not commit unless intentional):** `blob-dryrun.txt`, `blob-dryrun-2.txt` at repo root — exclude from commits.
- **Merge discipline:** Per `AGENTS.md`, Andrew smoke-checks Preview → **`git merge --no-ff feat/transcribe-tier-1-parallelize`** into `master` after pass — **no direct push to `master`** without smoked branch.
- **Tier 2:** Background `TranscribeJob` queue — explicitly **out of scope** unless Tier 1 proves insufficient on real sessions.

---

## 6. Files changed (high level)

| Area | Paths |
|------|--------|
| Constants | `src/lib/transcribe-constants.ts` |
| FFmpeg split | `src/lib/transcribe-ffmpeg.ts` |
| Whisper parallel + retry | `src/lib/transcribe.ts` |
| Session transcribe action | `src/app/admin/students/[id]/actions.ts` |
| Whiteboard transcribe action | `src/app/admin/students/[id]/whiteboard/actions.ts` |
| Timeout copy + helpers | `src/app/admin/students/[id]/transcribe-result.ts` |
| Tests | `src/__tests__/…` (see §3) |
| Docs | `docs/PHASE-6-TIER-1-STATUS.md`, `docs/BACKLOG.md` |

---

## 7. Open questions / follow-ups

1. Orchestrator: **commit granularity** — bootstrapper suggested six commits; Andrew may prefer one logical commit — align before push.
2. Full **`npx jest`** + Neon test DB when available (executor had Postgres unreachable in globalSetup).
3. Optional future: **`scripts/smoke-long-form-transcribe.mjs`** from spike branch if pilot wants repeatable long fixtures.
