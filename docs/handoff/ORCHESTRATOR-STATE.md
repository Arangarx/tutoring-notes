# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## V1 Redesign (active epic)

Multi-day epic on branch **`v1-redesign`** (active V1 integration branch; **not yet merged to `master`**). **Decisions ledger + sub-pass tracker:** [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — do not duplicate the full ledger here.

---

## ⏩ HEAD — 2026-06-07 (slice 3 bridge shipped; awaiting smoke + merge)

| Field | Value |
|---|---|
| **Last action completed** | **REQ-S3-4 notes-bridge built and pushed** — commit [`acd41cf`](https://github.com/Arangarx/tutoring-notes/commit/acd41cf) on `feat/recording-p1-slice3-autonotes`. REDUCE phase now emits structured JSON → auto-creates `DRAFT SessionNote` linked via `WhiteboardSession.noteId`; review page shows editable fields (topics/assessment/Plan/links) + Save (DRAFT→READY), Cancel+delete (cascade-verified, confirm dialog), Regenerate guard (non-destructive, confirm dialog). DRAFT notes hidden from parent share pages. Field map: homework folds into nextSteps/Plan per REQ-S3-4. 28 new tests green + 92 regressions green; tsc clean; eslint clean. 5 pre-existing failures confirmed pre-existing. `test:wb-sync` (Docker/relay) **needs Andrew to run before merge** — `TutorNotesSection.tsx` was changed. |
| **Next action(s)** | **Andrew:** (1) run `npm run test:wb-sync` locally before merging (Docker relay required; TutorNotesSection changed). (2) Smoke `feat/recording-p1-slice3-autonotes` preview — click through Save→notes-list, Cancel+delete, Regenerate-no-loss, DRAFT-not-parent-visible. (3) `merge --no-ff` slice-3 → `v1-redesign` after smoke pass. (4) Then smoke + merge `v1-component-spine`. (5) After merges: full ORCHESTRATOR-STATE restructure (dispatch Composer 2.5). |
| **Open Andrew-confirms** | `test:wb-sync` green before slice-3 merge. **IAC-13 revoke policy RESOLVED.** **IAC-13(c)** `CLAIM_INVITE_TTL_MS` 7d→48h (recommended yes). Cross-domain email-collision decision pending (see ⚠ row below). |
| **In-flight subagents** | None active (bridge build complete). |
| **⚠ Cross-domain email collision (2026-06-07)** | **CONFIRMED on preview-dev:** `arangarx@hotmail.com` exists as BOTH `AdminUser` (tutor) AND `AccountHolder` (parent). No cross-domain uniqueness check. Likely test artifact but systemic gap. **DECISION PENDING (Andrew).** |
| **Component pass — decision (Andrew 2026-06-07)** | Foundation chunks merge on functional-correctness only; one cohesive visual review later. `v1-component-spine` APPROVED to merge functional. **MERGE QUEUED** after slice-3. Prereqs: confirm no Prisma migration; `npx next build` green; merge `--no-ff`; expect add/add conflict on `V1-COMPONENT-LIBRARY.md`. |
| **Uncommitted / unmerged** | **Unmerged pushed branches:** `feat/recording-p1-slice3-autonotes` @ [`acd41cf`](https://github.com/Arangarx/tutoring-notes/commit/acd41cf) (slice 3 + notes-bridge — **test:wb-sync → re-smoke → merge FIRST**; owns migration lock); `v1-component-spine` @ `9c9dfec`; `iac-13-connected-parent-disconnect` @ `edf4720`; `feature/sarah-forward-migration-q6` @ `a396ab5` (parked); `docs/v1-redesign-notes-ux-reqs` @ `0b45529` (merge after spine); `harden/auth-role-refresh` @ `f5e44f8`. Working tree clean on slice-3 branch. |

**Process directive (Andrew 2026-06-07):** prefer **agent-runnable validation harnesses** over manual smoke wherever behavior is verifiable without Andrew's hardware (transcription E2E + sweep validations were the exemplars).

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

**Superseded runbooks:** [`MORNING-RUNBOOK-2026-06-07.md`](MORNING-RUNBOOK-2026-06-07.md), [`RETURN-RUNBOOK-2026-06-06-PM.md`](RETURN-RUNBOOK-2026-06-06-PM.md) — smoke items complete; this file is canonical.

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
