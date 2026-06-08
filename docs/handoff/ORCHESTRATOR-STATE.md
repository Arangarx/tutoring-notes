# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## V1 Redesign (active epic)

Multi-day epic on branch **`v1-redesign`** (active V1 integration branch; **not yet merged to `master`**). **Decisions ledger + sub-pass tracker:** [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — do not duplicate the full ledger here.

---

## ⏩ HEAD — 2026-06-07 (slice-3 Pass-1 rework SHIPPED → awaiting re-smoke; whiteboard reqs + docs-policy on v1-redesign)

| Field | Value |
|---|---|
| **Last action completed** | **Slice-3 Pass-1 notes rework SHIPPED** on `feat/recording-p1-slice3-autonotes` @ [`0fa2363`](https://github.com/Arangarx/tutoring-notes/commit/0fa2363) — implements the LOCKED B4 save-model (reduce→`TutorNote` only, no auto-`SessionNote`; Save = one live READY `SessionNote` idempotent; delete-guard dropped + redirect-regardless resilience + `maxDuration` 60→300; `test:wb-sync` import-coupling fixed → **12/12 GREEN**; share-page `findFirst` wrong-tutor-name leak fixed). All 3 smoke defects resolved. **Also this session (on `v1-redesign`):** whiteboard chrome requirements consolidated → [`126b7ce`](https://github.com/Arangarx/tutoring-notes/commit/126b7ce) (43 reqs, LOCKED custom-chrome decision, feasibility tags); docs cleanup/archival policy captured → [`1a8edbf`](https://github.com/Arangarx/tutoring-notes/commit/1a8edbf) (INDEX policy + BACKLOG next-pass entry w/ whiteboard archival candidates). **Earlier:** `docs/v1-redesign-notes-ux-reqs` merged → `v1-redesign` @ [`c728102`](https://github.com/Arangarx/tutoring-notes/commit/c728102); slice-3 B1 privacy fix + S1/S2 [`770f370`](https://github.com/Arangarx/tutoring-notes/commit/770f370); `v1-component-spine` + `iac-13` (TTL 7d→48h) merged → `v1-redesign`. |
| **Next action(s)** | **Andrew:** (1) `npm run test:wb-sync` locally (confirm the 12/12 green reproduces on your hardware). (2) **Re-smoke** slice-3 Pass-1 per `SMOKE-RUNBOOK-2026-06-07.md` **§4** (5-step: end→no auto-note; Save→live READY parent-visible; Save again→in-place; delete saved note→returns to student detail; share page→correct tutor). (3) Confirm PASS → orchestrator merges slice-3 `--no-ff` → `v1-redesign` (LAST; carries the migration). **Orchestrator (ready now, migration-free):** merge `harden/auth-role-refresh` → `v1-redesign` (pending Andrew go). Heavy ORCHESTRATOR-STATE restructure at the `v1-redesign → master` milestone. |
| **Open Andrew-confirms** | (1) Slice-3 Pass-1 re-smoke PASS + `test:wb-sync` green → slice-3 merge gate. (2) Merge `harden/auth-role-refresh` (role-bleed Fix A+B) — verified/authorized? (3) **IAC-13 disconnect-copy = HARD pre-master gate** (Andrew: student-record-name vs learner-name terminology is backwards/confusing; parent — not tutor — should name the child). |
| **In-flight subagents** | None active. |
| **Cross-domain email collision — RESOLVED (Andrew 2026-06-07)** | **Decision: one email = one account (Option A); no tutor+parent dual persona.** Enforcement + one-time collision cleanup folded into the **Google-OAuth-signup fast-follow wave** (post-V1). Captured `6986370`: `BACKLOG.md`, `v1-redesign-STATUS.md`, new **IAC-14** invariant. (`arangarx@hotmail.com` dual-account = the exploit that surfaced it.) |
| **Component pass** | `v1-component-spine` **MERGED** to `v1-redesign` (merge `aac690c`) on functional-correctness per Andrew's policy. One cohesive **visual review still pending** for a complete page/flow vs palette mocks (foundation chunks don't get per-chunk visual sign-off). |
| **Deferred reliability (slice-3 review)** | **S3:** concurrent `after()`+cron `processNotesReduceJob` can orphan a 2nd DRAFT (no job-in-flight lock; both read `noteId=null`). Fix = unique constraint on `WhiteboardSession.noteId` + migration, or `SELECT FOR UPDATE`. **N1** dashboard count inflation, **N2** SENT→READY downgrade, **N3** mark-seen accepts DRAFT, **N4** regen update lacks cross-student check. → capture in `BACKLOG.md`. |
| **Uncommitted / unmerged** | **`v1-redesign` @ [`1a8edbf`](https://github.com/Arangarx/tutoring-notes/commit/1a8edbf)** (component + IAC-13 + notes-UX/cross-domain/backlog docs + whiteboard reqs `126b7ce` + docs-policy in). **Unmerged branches → v1-redesign:** `feat/recording-p1-slice3-autonotes` @ [`0fa2363`](https://github.com/Arangarx/tutoring-notes/commit/0fa2363) (slice-3 + Pass-1 rework — gated on re-smoke + `test:wb-sync`; carries migration → merge LAST); `harden/auth-role-refresh` @ `f5e44f8` (role-bleed Fix A+B — needs Andrew go); `feature/sarah-forward-migration-q6` @ `a396ab5` (parked). Main tree on slice-3 with uncommitted SMOKE-RUNBOOK §4 edit. |

**Process directive (Andrew 2026-06-07):** prefer **agent-runnable validation harnesses** over manual smoke wherever behavior is verifiable without Andrew's hardware (transcription E2E + sweep validations were the exemplars).

**Process directive — runbook legend (Andrew 2026-06-07):** every smoke runbook MUST open with an explicit legend: `[x]` = step **PASSED** (executed + behaved as expected); skipped/failed steps stay unchecked with the reason on the **Notes:** line; a fully-checked target = green merge gate. Removes the "done vs pass" ambiguity. Any future runbook (or runbook-generating dispatch) includes this legend verbatim.

### ✅ Slice-3 save-bridge — Pass-1 rework SHIPPED (2026-06-07) → awaiting re-smoke

**Pass 1 complete** @ [`0fa2363`](https://github.com/Arangarx/tutoring-notes/commit/0fa2363): all 3 smoke defects fixed, `test:wb-sync` 12/12 GREEN, LOCKED B4 save-model implemented (details below). **Re-smoke pending** (runbook §4) before `--no-ff` merge to `v1-redesign`. Original failure context retained below for the audit trail.

Andrew smoked the *original* bridge (runbook §4). It was **NOT merge-ready**. Root issue: the bridge **guessed** on REQ-S3-2a "Save semantics" which the spec explicitly deferred to the B4 design pass ("Do not guess"). It built a `DRAFT→READY→SENT` model that **conflicted with Andrew's intent** (no DRAFT, Save = immediately parent-visible, "new/unseen" via the **existing `NoteView`** mechanism, no SENT). Investigation: [`8f7e28d3`](8f7e28d3-40cf-42c3-8b77-ae6d77ad529e).

**B4 Save-model decision: LOCKED (Andrew 2026-06-07).** Principle: **everything is immediately live, both directions.**
- `TutorNote` = AI working draft (never parent-visible, regeneratable). `SessionNote` = the live note.
- **Save** = create/update ONE live `SessionNote` per session (idempotent via `WhiteboardSession.noteId`), status `READY` (never DRAFT). Instantly parent-visible.
- After save: review page edits the **live** note (each save instantly live). **Regenerate** re-seeds editable fields from a fresh AI pass; not live until Save again.
- **Delete** a saved note = allowed + instantly removed for parent (DROP the bridge's "refuse delete on finalized" guard).
- **Parent markers (V1):** "New" (never seen) + "Updated" (changed since seen) via existing `NoteView`.
- **"Send" = notification only** (manual now, scheduled later — "you have new notes" → share page). NOT a note state. `DRAFT/READY/SENT` enum is **legacy** (from when sending was stateful) → retire in the separate cleanup; decouple sending from status there.

**Execution split (Andrew 2026-06-07):**
- **Pass 1 (notes correctness — merge-blocker, dispatching now):** remove auto-DRAFT-`SessionNote` creation; reduce writes structured fields into `TutorNote`; Save creates/updates one READY `SessionNote`; drop delete-guard + delete-resilience (redirect-regardless + cron + fix 60s timeout); fix `test:wb-sync` import coupling (move `REDUCE_PROMPT_VERSION` out of `notes-worker.ts`); fix `s/[token]/page.tsx` `findFirst` wrong-tutor-name leak. Notes stay on current review page. → re-smoke → merge.
- **Pass 2 (session-end UX — V1 follow-on, Opus-designed):** shared **session shell** (thin top nav + sidebar tabs); live mode = today's workspace UNCHANGED; **review mode** = lightweight notes editor (replay lazy-loaded on "Review video while editing", controls stripped); end-session auto-transitions shell into review mode (same shell, no nav-away); same review component for first-review vs after-the-fact edit (different buttons); unsaved-session **recovery** surface (V1 req). **Caution captured:** keep live engine + replay/notes engine as SEPARATE implementations under a shared shell — do NOT literally merge them (the `WhiteboardWorkspaceClient` reliability boundary; the `test:wb-sync` break is this coupling class). Overlaps the component-pass workspace-chrome redesign — coordinate.

**Defects found — ALL RESOLVED in Pass 1 (`0fa2363`):**
1. ✅ `test:wb-sync` FAIL (6 tests/2 suites) — bridge made `notes-actions.ts` import `REDUCE_PROMPT_VERSION` from `notes-worker.ts`, dragging `next/cache` into `WhiteboardWorkspaceClient`'s import graph → `TextEncoder is not defined`. **Fixed:** constant moved to dep-free `notes-reduce-config.ts`; DOM suites mock `notes-actions` at the boundary → 12/12 green.
2. ✅ Delete-session timeout — review page `maxDuration=60` + sync cascade delete. **Fixed:** `handleDelete` redirects to student detail regardless of outcome (cron sweeps orphans); `maxDuration` 60→300.
3. ✅ Share-page tutor name — `src/app/s/[token]/page.tsx` `db.adminUser.findFirst()` with NO `where` → arbitrary admin's name to every parent. **Fixed:** `findUnique({ where: { id: student.adminUserId } })`; null `adminUserId` → no name (safe).

**Scope decisions (Andrew 2026-06-07):** legacy `DRAFT/READY/SENT` enum + `sendUpdateEmail` + "Mark ready/draft" controls → **separate** BACKLOG cleanup (do not balloon slice-3). 

**DEFERRED — MUST NOT MISS (Andrew flagged explicitly):**
- **Native `confirm()`/`alert()` → in-site modals** (Save/Cancel/Regenerate). Deferred to the **component pass**, but Andrew said do not lose it.
- **Notes quality poor + Regenerate returned identical output** → prompt/quality thread (REQ-S3-4 / `REDUCE_PROMPT_VERSION` iteration). Separate from the architecture rework.

---

## Current focus

**Wave 1 reliability floor** on `v1-redesign`: whiteboard sync redesign + regression net **done**; SEC-1 **complete**; usemynk.com cutover **merged** (Sarah still on `tutoring-notes.vercel.app` until Search Console + OAuth watch-items clear).

**Active build thread:** **Recording re-architecture Phase 1** — slices 1–2b + durable transport **shipped** on `v1-redesign`. **Slice 3** (auto-notes, map-reduce, end-session sweep, retire manual transcribe button) is the **next major dispatch**.

**WB/recording smoke FROZEN** for interim whiteboard bugs until the v1 redesign ships (Sarah feedback 2026-06-06: Ctrl+Z, copy-link clipboard, intermittent "Loading scene" join — all **backlog**, not slice-3 blockers).

---

## Recording P1 Slice 3 — SHIPPED (awaiting smoke + merge)

**Status:** **SHIPPED** on `feat/recording-p1-slice3-autonotes` — awaiting Andrew smoke + `merge --no-ff` to `v1-redesign`.

**Branch head:** [`4f601a3`](https://github.com/Arangarx/tutoring-notes/commit/4f601a3)

**Path shipped:** Full map-reduce (D8) — not the reduce-at-end fallback.

| # | Deliverable | Status |
|---|---|---|
| **(a)** | **End-session sweep** | ✅ `kickSessionChunksAction` fired F&F from workspace after `endWhiteboardSession`. |
| **(b)** | **Map phase** | ✅ `extract-chunk.ts` runs per-chunk after `status=done`; idempotent on `chunkId`. |
| **(c)** | **Reduce phase** | ✅ `notes-worker.ts` — completion gate, 5-min timeout, partial path, DB-as-queue + cron sweep. |
| **(d)** | **Post-session UX** | ✅ Manual button retired; `TutorNotesSection` auto-polls, skeleton, partial badge, regenerate. |

**5-axis review:** 1 BLOCKER found + fixed (stuck skeleton when TutorNote row not yet created). See commit `4f601a3`.

**Design ref:** [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md). Bootstrapper: [`recording-slice3-autonotes-bootstrapper.md`](recording-slice3-autonotes-bootstrapper.md).

---

## Recording transport thread — CLOSED (2026-06-07)

Supersedes the 2026-06-06 PM/AM smoke queues and open DECISION bullets for transport + Q1.

**What shipped (all on `v1-redesign`, merged + pushed):**

| Milestone | Merge / SHA | What |
|---|---|---|
| Slice 1 schema | `6abbc30` | `TranscriptChunk` / `TranscriptChunkExtraction` / `TutorNote` + store scaffolding (`txc`/`tnt`). Zero runtime. |
| Cost-obs Phase 1 | `83870a3` (`b040276`) | `rate-card.ts`, `cev` v2, `/admin/cost` dashboard. **Smoke PASSED** Andrew 2026-06-06. |
| Slice 2a pipeline | `359bd16` | `transcribe-chunk.ts` (`gpt-4o-mini-transcribe` + `whisper-1` fallback), idempotent worker, queue-consumer route. |
| Slice 2b producer | `758230f` | `enqueueChunkTranscriptionAction` + fire-and-forget client wire. |
| Transcription fixes | `93157d5` | Private-blob auth (`fetchPrivateBlobBytes`, Bearer `BLOB_READ_WRITE_TOKEN`); `gpt-4o-mini-transcribe` uses `response_format: json`; `durationMs` via ffmpeg probe (see follow-up); whisper-1 keeps `verbose_json`. |
| Durable transport | `234d05b` | DB-as-queue (enqueue upserts `pending` before fire-and-forget) + Vercel Cron `* * * * *` backstop (`/api/cron/transcribe-sweep`, `CRON_SECRET`, migration `20260607120000` `attempts`/`updatedAt`). |

**Decisions resolved:**

- **Transport:** DB-as-queue + cron/sweep **ratified** over Vercel Queues beta — built + validated.
- **Q1 (`gpt-4o-mini-transcribe`):** **PASS** — orchestrator E2E on real audio + Andrew confirmed; swept rows produced clean transcripts of a real 2-voice math lesson.

**Validated on live infra:**

- Transcription E2E (real blob + real OpenAI → `status=done`, good quality).
- Cron sweep recovers stragglers (2 previously-failed chunks: 403 + `verbose_json` → `failed`→`transcribing`→`done` via authenticated sweep on deployed preview).

**Deferred from transport slice (intentional):** end-session sweep → **slice 3** (guarded `handleEndSession`).

**Superseded runbooks:** `MORNING-RUNBOOK-2026-06-07.md` + `RETURN-RUNBOOK-2026-06-06-PM.md` — smoke items complete; **archived to `docs/archive/handoff/` (cold storage) 2026-06-07**. Live smoke runbook: [`SMOKE-RUNBOOK-2026-06-07.md`](SMOKE-RUNBOOK-2026-06-07.md).

---

## Known follow-ups (non-blocking — track in state / fold into slice 3 where sensible)

| Item | Notes |
|---|---|
| **`durationMs` null on Vercel** | ffmpeg-static probe not resolving in serverless/sweep context; offsets use producer wall-clock approximation. Revisit with recording-clock work (design D3/D4). Address in slice 3 or consciously defer with logged decision. |
| **Preview cron limitation** | Vercel Cron runs on **production deployments only**; preview can't auto-fire cron AND Deployment Protection blocks non-browser clients → preview cron testing = manual authenticated endpoint call (or protection-bypass). Documented in [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §1.6. |
| **Cost-event FK on `whiteboardSessionId`** | `logCostEvent` can FK-fail during worker run if session row not present (was local-only artifact) — verify on real preview session during slice 3 work. |
| **Cost-event durability hardening** | Design [`cost-observability-design-2026-06-06.md`](cost-observability-design-2026-06-06.md) §3.2.4: `isTestFixture` + `tutorKey` + `tutorLabel` snapshot + orphaned/unattributed bucket + fixture-vs-real pricing-floor filter — **RATIFIED FULL** (Andrew 2026-06-06) but **NOT BUILT**. Ready-to-build, additive. |
| **Sarah WB bugs (FROZEN)** | Ctrl+Z/Cmd+Z undo misbehaves; copy-link silent clipboard failure; intermittent student "Loading scene" on join — [`docs/BACKLOG.md`](../BACKLOG.md). |

---

## Standing ratified decisions (recording + cost — condensed)

- **Recording Q1:** `gpt-4o-mini-transcribe` (cheaper + better on realistic audio; whisper-1 fallback retained).
- **Recording Q5:** skeleton/blurred notes-loading timeout → **5 min** before "acknowledge defeat."
- **Recording Q6:** **migrate-forward** Sarah's real prod data at cutover (not purge) — tiny scope (4 WB sessions + 19 recordings).
- **Recording Q7:** start with `gpt-4o-mini` for reduce; escalate if quality insufficient.
- **Recording Q8:** log prefixes `txc`/`tnt` — don't-care on naming.
- **Cost Q8:** no tutor-facing cost until pricing model locked (session-tokens leaning).
- **Baseline principle:** clean industry-standard architecture; **storage is cheap — never skimp per user.**
- **Vercel-lock OK if documented:** every Vercel-specific dep = capability-contract in [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md).
- **Pricing-floor cross-doc:** cost doc used whisper-1 floor (~$0.36/60min); recording doc's `gpt-4o-mini-transcribe` halves transcription cost (~$0.18/60min) — conservative floor in cost doc, real floor likely ~half.

Full Q-answers + adversarial review: [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md).

---

## Parallel standing work (not slice 3 — do not lose)

| Thread | Status |
|---|---|
| **v1 component redesign / UI pass** | Whiteboard bigger, declutter, Wyzant-like, pen UX, button rename — Sarah feedback maps here. |
| **Identity / access epic** | Phase 3 consent models, IAC-13 disconnect build, etc. — see [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md). |
| **Sarah forward-migration** | One-time cutover script as part of Phase 1 recording cutover (Q6). |
| **Cost-durability hardening** | Ratified, ready-to-build — separate dispatch from slice 3 unless folded deliberately. |
| **Master / pilot** | Sarah on `tutoring-notes.vercel.app` until usemynk watch-items clear; `interim-capture-attestation` on `master` awaits migrate+smoke. |

---

## Pilot context (Sarah — 2026-06-06 live session)

**Capture:** [`sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](sarah-pilot-feedback-2026-06-06-orchestrator-report.md) + 5 backlog items.

**Themes:** notes-as-institutional-memory; wants auto-notes without manual click (slice 3 directly addresses); WB UX issues **deferred** to redesign pass (do not chase in slice 3).

---

## Project arc (compressed)

- **North star:** [`AGENTS.md`](../../AGENTS.md) — Sarah must use the app with confidence; no backup recorder alongside our app.
- **Reliability bar:** 5-axis adversarial review; BLOCKERs in Phase-1 acceptance — [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).
- **SEC-1:** complete + extended (ADMIN/TUTOR role split merged).
- **Whiteboard view-sync:** resolved; standing `npm run test:wb-sync` gate for WB sync touches.
- **Strategic pivot (2026-06-05):** stop interim WB/recording patches; recording re-arch is the foundation pillar for B5 workspace.

**Deep history (2026-06-04 overnight chain, session-wrong-identity, replay v3, join-reliability, landing-B, etc.):** all merged to `v1-redesign` in prior sessions — audit via `git log --oneline v1-redesign` and `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Do not re-derive from this file.

---

## How we work (process — pointers only)

- **Orchestration model:** [`AGENTS.md`](../../AGENTS.md) § "Model usage protocol" — Opus orchestrates; Composer 2.5 ships by default; Sonnet for auth boundaries + adversarial/5-axis review. Dispatch inline via `Task`; **always set `model` explicitly**, including on `resume`.
- **Dispatch vs in-chat boundary:** [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc).
- **Merging (solo pilot):** smokeable branch → Andrew smoke → `merge --no-ff` on feature branch into `v1-redesign` (then `v1-redesign` → `master` at V1 cutover); branch preserved. Whiteboard sync touches require `npm run test:wb-sync` green. Build-surface changes require `npx next build` green.
- **Commits on Windows/PowerShell:** multi-line messages via `.git/COMMIT_MSG_DRAFT.txt` + `git commit -F` — see `AGENTS.md` § Conventions.

---

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (this file)
3. [`docs/handoff/recording-slice3-autonotes-bootstrapper.md`](recording-slice3-autonotes-bootstrapper.md) — **next dispatch**
4. [`docs/handoff/recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md) — slice 3 design (D7, D8, Q1–Q8)
5. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — **before touching `handleEndSession`**
6. [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — V1 epic ledger
7. [`docs/handoff/cost-observability-design-2026-06-06.md`](cost-observability-design-2026-06-06.md) — cost durability follow-up
8. [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) — cron §1.6, Vercel contracts
9. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)
10. [`docs/BACKLOG.md`](../BACKLOG.md)
11. [`docs/handoff/sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](sarah-pilot-feedback-2026-06-06-orchestrator-report.md)

---

## History / audit trail

This file is **updated in place**; full history: `git log -p docs/handoff/ORCHESTRATOR-STATE.md`.

Dated `docs/handoff/orchestrator-state-<YYYY-MM-DD>-<HHMM>.md` files are **legacy snapshots** (retained, not the live source). Template for heavy restructures: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).
