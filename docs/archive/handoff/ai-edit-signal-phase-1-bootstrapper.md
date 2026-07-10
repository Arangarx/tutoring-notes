# AI edit signal capture — Phase 1 — executor briefing (Phase 11 self-improving transcription foundation)

> **Recommended model: Composer.** Schema migration on a well-trodden Prisma + Neon stack, additive form-threading of existing AI output fields, one new lightweight table with no business logic, no LLM calls (Phase 1 is pure data capture — categorization is Phase 2's job). ~half day Composer time + ~30 min Andrew validation on Vercel Preview. Opus is overkill.
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh Composer chat, your instructions are below — start by reading the AGENTS.md + the other files in the "Read first" section, then proceed through the deliverables in order. No further confirmation needed; begin work.

You are building **Phase 11 task 2 — AI edit signal capture (Phase 1: data accumulation, no categorizer, no dashboard)** for the tutoring-notes app. **Branch + smoke + direct merge to master per AGENTS.md merging convention** — NO PR step.

## Workspace + path discipline

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Verify with `Get-Location` (PowerShell) before any file write. NEVER create files at a path that starts with a sibling-repo name.

## Branch discipline

Run in PowerShell, sequentially, verifying each succeeds:

```powershell
git status                                                # if uncommitted changes exist, STOP and ask the user
git fetch origin                                          # retry on transient DNS failures (Andrew's git-push-retry rule applies)
git checkout master                                       # switch to master
git pull origin master                                    # fast-forward
git log -1 --format='%H %s'                               # expect tip at f30877e (UX foundation merge) or later; if older, STOP
git checkout -b feat/ai-edit-signal-capture               # branch off master
git status                                                # confirm clean tree on new branch
```

**After branch setup:**
- Push after Commit 1 (schema migration): `git push -u origin feat/ai-edit-signal-capture`. Triggers Vercel Preview deploy + Neon migration on the preview-dev DB.
- Andrew smokes on Vercel Preview by recording a couple of sessions, accepting AI fill, editing, saving — then inspecting the new tables.
- **NEVER push directly to master.** Branch → commit → push → smoke (Andrew) → merge (Andrew or you-on-Andrew's-go-ahead).

## Hard prerequisite (verify BEFORE you start)

The **mortensenapps.com umbrella privacy policy must already contain the "Improving our AI features from your edits" section** (drafted in the orchestrator chat, deployed by Andrew to the mortensenapps.com site repo). The product `/privacy` you'll edit in this bootstrapper must match that umbrella section verbatim per `docs/LEGAL-SYNC.md`.

**Action**: fetch `https://www.mortensenapps.com/privacy` and grep for the phrase "Improving our AI features" or "improving the prompts" in the response. If absent, **STOP and tell Andrew the umbrella deploy is pending — do not proceed**.

If you find the umbrella section, copy its exact text into your scratch buffer; Commit 5 of this build embeds it into the product `/privacy`.

## Project context

> Andrew proposed overnight 2026-05-17→18: track every time a tutor edits a field after AI has populated it, use the diff signal to improve the AI prompt over time. Phase 1 is **pure data capture** — schema + snapshot + persist — no categorization, no dashboard, no prompt iteration. Those are Phases 2 + 3, gated on data volume.
>
> The pilot is currently 1 tutor (Sarah, ~5 sessions/week × ~5 AI-filled fields per session = ~25 potential edit signals per week). Phase 2 unlocks at 50+ signals; Phase 3 at 100+. Phase 1's job is **ensure the data exists when those thresholds are hit**.

This is Phase 1 ONLY. Future bootstrappers:
- **Phase 2** (~half day, gated on 50+ signals): hybrid string-match + LLM categorizer assigns edit-kind labels, `/admin/insights/transcription` dashboard.
- **Phase 3** (~day, gated on 100+ signals + Phase 2 hand-validation): meta-LLM proposes prompt revisions, Andrew reviews, A/B via PostHog feature flag (depends on PostHog Tier-0+1 having shipped).

### What you are NOT building (explicit non-scope)

- **NOT a categorizer.** The `editKind` column exists in the schema but stays NULL in Phase 1. Phase 2 populates it.
- **NOT an LLM call per save.** Phase 1 captures raw strings only; no inference cost added to the save path.
- **NOT a dashboard.** `/admin/insights/transcription` is a Phase 2 deliverable.
- **NOT prompt iteration.** `PROMPT_VERSION` is unchanged in this build.
- **NOT a delete-on-request UI for edit signals.** The umbrella privacy paragraph commits to honoring deletion requests; for Phase 1 this is operational (email request → Andrew runs SQL). Self-serve deletion UI is a future deliverable.
- **NOT changing the AI prompt or generation behavior.** This build is purely observational.
- **NOT cleanup of pre-existing AI-filled notes.** Notes saved before this branch lands have no `aiTopics`/etc, so no signal rows are created for them. Backfill is not in scope (would require running historical transcripts through the current prompt, which is expensive and noisy).

## Critical safety constraints (READ before implementing)

**Constraint #1 — Additive schema only.** Per AGENTS.md migration discipline: never drop or rename a column. The new columns on `SessionNote` are `aiTopics`, `aiHomework`, `aiAssessment`, `aiPlan`, `aiLinksJson` — all `String? @db.Text` (nullable, no default). The new table `AiNoteEditSignal` is brand new. Generate the Prisma migration normally; Vercel preview-deploys run `prisma migrate deploy` against the preview-dev Neon DB automatically.

**Constraint #2 — The save path must not regress.** `createSessionNote` / `updateSessionNote` (or whatever the current save action is named — read the code) is on the customer-facing critical path. Adding signal-row creation must:
- Run inside the same Prisma transaction as the note save IF the signal write fails the entire save SHOULD NOT fail. Wrap signal-row creation in a try/catch that LOGS but does not throw. The customer-facing note save MUST succeed even if signal logging fails.
- Best pattern: do the note save in transaction, then do signal-row creates as a separate awaited operation post-transaction, catching+logging any errors. If you're tempted to batch signal-rows into the transaction "for atomicity," resist — observability data is lower-priority than customer data.

**Constraint #3 — Preserve all existing aiGenerated semantics.** `SessionNote.aiGenerated` (boolean) + `SessionNote.aiPromptVersion` (string) are already in the schema. Continue setting them as before. The new `aiTopics`/etc columns ADD information; they do not replace `aiGenerated`. If `aiGenerated=true` but `aiTopics=null`, that's a legitimate state for legacy notes (pre-this-branch).

**Constraint #4 — Form-threading discipline.** `NewNoteForm.tsx` currently receives `populate({ topics, homework, assessment, plan, links, promptVersion, recordingIds })` from `AiAssistPanel.tsx`. You'll add the same 5 content fields to a **separate piece of component state** that is NOT the form values themselves — i.e. preserve a snapshot of "what AI proposed" alongside the editable form. On save, send BOTH the current form values AND the snapshot to the save action. Resist the temptation to thread the snapshot through hidden form inputs (the tutor could edit them via DevTools, polluting signal data).

**Constraint #5 — Per-field signal rows, not per-note.** If the AI proposes values for 5 fields and the tutor edits 3 of them, create 3 `AiNoteEditSignal` rows (one per edited field), not 1 row for the whole note. This makes Phase 2's categorizer simpler and lets us track per-field prompt-quality independently.

**Constraint #6 — Skip signal rows for unchanged fields.** Only create a signal row when `aiText != finalText` (exact string equality, after `trim()`). Equal-text fields produce no row → no storage cost for the common "AI got it right" case. The implicit "AI got it right" signal is the absence of a row in the table (computable from `SessionNote.aiTopics IS NOT NULL AND no AiNoteEditSignal for this note+field`).

**Constraint #7 — Logging discipline.** New session-ID prefix: `npe` (note prompt edit). Per-save log line: `[npe noteId=<id> aiGenerated=<bool> signalRowsCreated=<n> fields=[<comma-list>]`. Per-row not needed (would be noisy). Register `npe` in AGENTS.md per the convention.

**Constraint #8 — Don't change the prompt or AI generation logic.** `src/lib/ai.ts` should not be edited in this branch except to ensure the `generateSessionNote` return type continues to expose the 5 content fields (which it already does — `topics`, `homework`, `assessment`, `plan`, `links`). Don't bump `PROMPT_VERSION`.

**Constraint #9 — Don't break existing tests.** The save action has tests; the AiAssistPanel has tests; the form populate path is exercised in dom tests. Extend them additively for the new threading; don't break existing assertions.

## Read first (in order)

1. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\AGENTS.md` — workspace conventions; you'll add `npe` to the per-session-ID logging registry.
2. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\LEGAL-SYNC.md` — read the sync protocol; your privacy-policy edit follows it.
3. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\prisma\schema.prisma` — find the `SessionNote` model (around line 57). Understand the field shape. You'll add 5 nullable text columns + a new `AiNoteEditSignal` model below it.
4. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\ai.ts` — the AI generation entry point. Confirm `generateSessionNote` returns `{ topics, homework, assessment, plan, links, promptVersion }`. No edits expected.
5. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\AiAssistPanel.tsx` — calls `formRef.current?.populate(...)` after generation. You'll add the snapshot capture here.
6. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\NewNoteForm.tsx` — the form receiving populate. You'll add separate snapshot state + thread it to the save call.
7. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\actions.ts` — the save server actions (`createSessionNote` / `updateSessionNote` / similar — read for the exact names). You'll extend the action signatures to accept the AI snapshot, persist it on the note, and create signal rows.
8. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\__tests__` — find existing tests for save actions, AiAssistPanel populate, and NewNoteForm. Plan additive test coverage.
9. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\privacy\page.tsx` — the product privacy policy; embed the umbrella's AI-improvement section.

## YOUR SCOPE — what is IN this chat

### Commit 1 — Schema migration (additive only)

Files: `prisma/schema.prisma`, new migration in `prisma/migrations/<timestamp>_ai_edit_signal_capture/migration.sql`.

- Add to `SessionNote`:
  ```prisma
  /** AI's original draft for each content field. Captured at populate-time, persisted on save. Null for non-AI-generated notes and for pre-Phase-11 historical notes. */
  aiTopics     String? @db.Text
  aiHomework   String? @db.Text
  aiAssessment String? @db.Text
  aiPlan       String? @db.Text
  aiLinksJson  String? @db.Text
  ```
- Add new model:
  ```prisma
  /**
   * Per-field edit signal — one row per note+field where the tutor's saved
   * value differs from the AI's draft. Drives Phase 2 categorizer + Phase 3
   * prompt iteration. NULL editKind in Phase 1 (categorizer is Phase 2).
   */
  model AiNoteEditSignal {
    id            String      @id @default(uuid())
    sessionNoteId String
    sessionNote   SessionNote @relation(fields: [sessionNoteId], references: [id], onDelete: Cascade)

    /** Which content field this signal is for. */
    fieldName String   // "topics" | "homework" | "assessment" | "plan" | "links" — enforced in code, not DB enum (Phase 2 may add new fields)

    /** Snapshot of what the AI proposed for this field. */
    aiText String @db.Text
    /** Snapshot of what the tutor actually saved (post-edits). */
    finalText String @db.Text

    /** The prompt version the AI was using when it produced aiText. Joins to PROMPT_VERSION in src/lib/ai.ts. */
    promptVersion String

    /** Phase 2 will populate this (string enum: "added-novel" | "added-from-transcript" | "deleted-hallucination" | "reclassified" | "style-rewrite"). Phase 1 always NULL. */
    editKind String?

    createdAt DateTime @default(now())

    @@index([sessionNoteId])
    @@index([promptVersion, createdAt]) // for Phase 3 trending across prompt versions
  }
  ```
- Add reverse relation on `SessionNote`: `aiEditSignals AiNoteEditSignal[]`.
- Generate migration: `npx prisma migrate dev --name ai_edit_signal_capture --create-only` then inspect the generated SQL, then commit. **Do NOT apply to prod yourself** — Vercel preview deploy applies to preview-dev; prod migration runs at production-deploy time.
- Update `docs/PLATFORM-ASSUMPTIONS.md` — add the new table + new columns to the schema inventory section.
- Commit message: `schema: add AiNoteEditSignal table + per-field AI-draft columns on SessionNote`.

Tests: extend whatever schema-shape sanity test exists (or add a minimal one) confirming the new model + new columns are present.

### Commit 2 — Snapshot threading in AiAssistPanel + NewNoteForm

Files: `src/app/admin/students/[id]/AiAssistPanel.tsx`, `src/app/admin/students/[id]/NewNoteForm.tsx`.

- In `AiAssistPanel`, after `transcribeAndGenerateAction` or `generateNoteFromTextAction` returns successfully, pass the AI output through to `formRef.populate(...)` (already does this) AND ALSO store the AI output as a snapshot. The snapshot lives in `NewNoteForm` component state, not the form values.
- In `NewNoteForm`, expose a new optional argument on the `populate` handle method: `populate({...existing, aiSnapshot?: { topics, homework, assessment, plan, links } })`. When `aiSnapshot` is provided, store it in a `useState` ref so it survives subsequent tutor edits but does NOT affect the form's value display.
- On save, the form's submit handler reads BOTH the current editable values AND the `aiSnapshot` state. Both are passed to the save action.
- **Critical**: the snapshot is captured at populate-time, NOT at save-time. The save-time form values are the tutor-edited final state. The snapshot is what the AI proposed.
- If the tutor invokes Re-record + AI-populates again before saving, the snapshot is REPLACED (most recent AI output is what we measure against).
- Commit message: `notes: thread AI draft snapshot from AiAssistPanel through NewNoteForm to save action`.

Tests: extend `src/__tests__/components/notes` (or wherever NewNoteForm is tested):
- populate without `aiSnapshot` → snapshot state stays null.
- populate with `aiSnapshot` → snapshot stored separately from form values.
- tutor edits form value → snapshot remains unchanged.
- subsequent populate with new `aiSnapshot` → snapshot replaced.

### Commit 3 — Save-action plumbing + signal row creation

Files: `src/app/admin/students/[id]/actions.ts` (the save action — read for current name; likely `saveSessionNote` or `createSessionNote`/`updateSessionNote` pair).

- Extend the action signature to accept an optional `aiSnapshot: { topics, homework, assessment, plan, links } | null`.
- In the action body:
  1. Persist `SessionNote` as before, additionally writing `aiTopics`/`aiHomework`/`aiAssessment`/`aiPlan`/`aiLinksJson` from the snapshot (or null if snapshot absent).
  2. AFTER the note save transaction commits, in a try/catch:
     - For each of the 5 fields, if `aiSnapshot[field]` is non-null AND `aiSnapshot[field].trim() !== final[field].trim()`, create one `AiNoteEditSignal` row with `aiText=aiSnapshot[field]`, `finalText=final[field]`, `promptVersion=note.aiPromptVersion`, `editKind=null`.
     - Log `[npe noteId=<id> aiGenerated=<bool> signalRowsCreated=<n> fields=[<comma-list>]`.
  3. If signal-row creation throws, log the error with prefix `[npe]` but do NOT re-throw. The user-facing save succeeds regardless.
- Update `assertOwnsStudent` / equivalent ownership check — the signal table doesn't need its own ownership check at write time because it's scoped to a note we already verified ownership on, but reads (Phase 2 dashboard) will need an `assertOwnsNote` helper. Add the helper now if it doesn't exist (`src/lib/student-scope.ts` is the likely home).
- Commit message: `notes: capture AI edit signals on save (additive, lossy-degraded, per-field)`.

Tests: extend existing save-action tests:
- save with snapshot, all fields unchanged → 0 signal rows created, note has aiTopics/etc populated.
- save with snapshot, 3 fields edited → 3 signal rows created, correct aiText + finalText per row.
- save without snapshot → 0 signal rows, note has aiTopics=null/etc.
- save with snapshot, mock signal-row create to throw → save still succeeds, error logged, no rows persisted.
- promptVersion correctly threaded to signal row.

### Commit 4 — Register `npe` in AGENTS.md per-session-ID registry

File: `AGENTS.md`.

- In the `Per-session ID logging is mandatory` section, add `npe` to the registry of in-use prefixes with the description "note prompt edit signal (AI edit-feedback capture — Phase 1 of self-improving transcription)".
- Commit message: `agents: register npe prefix in per-session-ID registry`.

### Commit 5 — Privacy-policy embed (umbrella sync)

Files: `src/app/privacy/page.tsx`, `docs/LEGAL-SYNC.md`.

- Fetch `https://www.mortensenapps.com/privacy` and locate the "Improving our AI features from your edits" section. Copy verbatim.
- Embed in `src/app/privacy/page.tsx` between "Data retention and deletion" and "Children" (matches umbrella order). May need product-specific framing wrapping the umbrella section (e.g. "For Tutoring Notes specifically, the AI-improvement feature applies when you use the Auto-fill from session feature; the edit signals stored are per-field comparisons between the AI's draft and your saved version, alongside the source transcript reference.") — keep the product-specific wrapping minimal; the umbrella section is the load-bearing legal text.
- Update file-header doc-comment `SYNCED FROM` date.
- Update in-UI "Last updated" string if umbrella's "Last updated" moved.
- Update `docs/LEGAL-SYNC.md`:
  - Add row to per-section table: `| Improving our AI features from your edits | **Umbrella** + product wrap — umbrella's section verbatim, plus product-specific paragraph naming "Auto-fill from session" |`.
  - Append History entry dated today: "AI-improvement section added (umbrella + product wrap). Triggered by ai-edit-signal Phase 1 install on feat/ai-edit-signal-capture."
- Commit message: `legal: sync /privacy with umbrella's new AI-improvement section`.

### Commit 6 — STATUS doc + opt-out operational note

Files: new `docs/PHASE-11-AI-EDIT-SIGNAL-STATUS.md` (or fold into the broader Phase 11 STATUS if PostHog Tier-0+1 already created one), brief operational instructions in `docs/BACKLOG.md`.

- STATUS doc captures: what shipped, schema diff summary, how to query the signal table for Phase 2 development (`SELECT promptVersion, COUNT(*) FROM "AiNoteEditSignal" GROUP BY promptVersion;`), unlock conditions for Phase 2 (50+ signal rows), Phase 3 (100+ signal rows + Phase 2 hand-validation).
- BACKLOG entry: "AI-improvement opt-out request handling — when a tutor emails requesting opt-out per the privacy paragraph, run `DELETE FROM \"AiNoteEditSignal\" WHERE sessionNoteId IN (SELECT id FROM \"SessionNote\" WHERE adminUserId = '<tutorId>')` and also clear the `aiTopics`/etc columns. Self-serve UI is a future deliverable; flagged in privacy paragraph as "contact us"."
- Commit message: `docs: AI-edit-signal Phase 1 STATUS + opt-out operational backlog entry`.

## SMOKE CHECKLIST FOR ANDREW (executor: copy verbatim into your final report)

### Pre-smoke setup
- [ ] Vercel Preview deploy completed → preview-dev Neon DB has the new schema. Verify via Neon dashboard or `npx prisma db pull --schema=temp.prisma` from a connected dev env.
- [ ] Confirm the umbrella deploy of `www.mortensenapps.com/privacy` contains the "Improving our AI features from your edits" section (the bootstrapper's hard prerequisite check should have passed; this is a re-confirmation).

### Functional smoke (Andrew on Vercel Preview)
- [ ] Record a short clip OR paste session text → AI fills the form → save without editing → verify in Neon: `SessionNote` row has `aiTopics`/`aiHomework`/etc populated AND zero `AiNoteEditSignal` rows for this note.
- [ ] Same but edit ONE field (e.g. homework) before save → 1 `AiNoteEditSignal` row with `fieldName='homework'`, correct `aiText` + `finalText`, `editKind=null`, `promptVersion` matching `SessionNote.aiPromptVersion`.
- [ ] Same but edit 3 fields → 3 signal rows with correct per-field aiText/finalText.
- [ ] Save WITHOUT using AI (Paste text → don't generate → just save) → `aiTopics`/etc all NULL, zero signal rows.
- [ ] Use AI → start editing → click Re-record → AI re-fills → make edits → save → signal rows reflect the SECOND AI output's diff, not the first.
- [ ] Check Vercel function logs → `[npe noteId=... aiGenerated=... signalRowsCreated=...]` line per save.
- [ ] Existing note flow not regressed: save a note without AI, save a note with AI no edits, save a note via paste-text → all complete normally, no user-visible change beyond what's intentional.

### Failure-mode smoke (Andrew or executor)
- [ ] Mock signal-row create to throw (e.g. add `throw new Error("simulated")` temporarily in the signal-create path, run a save, verify the save STILL SUCCEEDS for the tutor, error is logged with `[npe]` prefix). Remove the mock and re-deploy.

### Final QA bars
- [ ] `npx jest src/__tests__/components/notes` (or wherever you extended) — green.
- [ ] `npx jest` — no NEW failures vs repo baseline (known legacy DB-touching failures may remain).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint src/` — no new errors.
- [ ] `npx prisma validate` — schema valid.

## WRAP-UP

1. Full test suite: `npx jest` (modulo documented DB failures from prior phases).
2. `npx tsc --noEmit` clean.
3. Final push: `git push origin feat/ai-edit-signal-capture`.
4. Report back to Andrew with:
   - **Branch name**: `feat/ai-edit-signal-capture`
   - **Test counts** (passed / failed; flag any NEW failures)
   - **Commit hashes** (Commit 1 → Commit 6 with brief description each)
   - **Schema diff summary** (5 new columns on SessionNote + new AiNoteEditSignal table)
   - **Smoke checklist** (full list above, copy verbatim)
   - **Notable findings** (e.g. "Discovered the save action is split into createSessionNote + updateSessionNote — threaded snapshot through both consistently")
5. **STOP and wait for Andrew's smoke confirmation. Do NOT merge to master yourself.**
6. **If Andrew confirms smoke pass and asks you to merge**:
   ```powershell
   git checkout master
   git pull origin master
   git merge --no-ff feat/ai-edit-signal-capture
   git push origin master
   ```
   (Production migration runs automatically on the production-deploy build step.)

## STOP CONDITIONS

- **Don't build the Phase 2 categorizer.** No LLM calls per save, no `editKind` population. Phase 2 is a separate bootstrapper gated on 50+ rows accumulated.
- **Don't build a `/admin/insights/transcription` dashboard.** Phase 2.
- **Don't backfill historical notes.** Notes pre-this-branch have no AI snapshot to reconstruct.
- **Don't change the AI prompt or `PROMPT_VERSION`.** This build is purely observational.
- **Don't edit the umbrella mortensenapps.com legal text from this chat.** Andrew owns that repo; you only sync the product copy.
- **Don't fold signal-row creation into the note-save transaction.** Per-Constraint #2, signal writes are post-transaction with try/catch — they must not block or fail customer saves.
- **Don't thread the snapshot as hidden form inputs.** Component state only (Constraint #4 — tutor DevTools resistance).
- **Don't merge to master yourself.** Branch + push + WAIT for Andrew's smoke + go-ahead.
- **Don't modify the master plan file.** Orchestrator's job.

## HARD RULES

- Additive schema only; all new columns nullable, no defaults that would mask "AI never ran" vs "AI ran and proposed empty string" (NULL = no AI involvement, empty string = AI proposed empty).
- Per-field signal rows; unchanged fields produce no row.
- Save action degrades gracefully if signal write fails (logs, doesn't throw).
- `npe` registered in AGENTS.md per-session-ID registry.
- Privacy embed verbatim from upstream per LEGAL-SYNC.
- No LLM call in the save path; categorizer is Phase 2.
- assertOwnsNote helper added if absent (Phase 2 needs it for the dashboard read path).
