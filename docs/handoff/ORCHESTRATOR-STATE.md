# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## V1 Redesign (active epic)

Multi-day epic on branch **`v1-redesign`** (active V1 integration branch; **not yet merged to `master`**). **Decisions ledger + sub-pass tracker:** [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — do not duplicate the full ledger here.

---

## ⏩ HEAD — 2026-06-07 (slice 3 + component Chunk 1 shipped; awaiting smoke + merge)

| Field | Value |
|---|---|
| **Last action completed** | **Slice 3 smoke BLOCKERs fixed** — commit [`b7fb120`](https://github.com/Arangarx/tutoring-notes/commit/b7fb120) on `feat/recording-p1-slice3-autonotes`. Root cause: `void` fire-and-forget killed on Vercel before async work ran (no cron on Preview). Fixed: replaced with `after()` (Next.js 15) in both `chunk-transcribe-enqueue.ts` and `notes-enqueue.ts`; added 4.5-min polling loop for notes; added `status=transcribing` to cron sweep; `maxDuration=300` on workspace page; skeleton UX (spinner removed); `SessionCostPanel` gated to ADMIN/impersonating/test-account only. tsc + eslint clean; 24 recording tests green; 4 pre-existing dom/auth failures confirmed pre-existing (unaffected). Branch pushed. |
| **Next action(s)** | **Slice-3 Smoke 1 (Andrew 2026-06-07): mostly PASS** — notes auto-appear, no spinner, manual button gone, regenerate works, cost panel correctly hidden from normal tutor. **Smoke 1 opens RESOLVED:** cost $0.0000 = **display-precision artifact** (real notes cost ≈$0.000036; `fmtUsd` rounds sub-cent to 4dp) — **DEFER** to cost-obs follow-up (admin-only). Whisper 0.0min/$0 = **known `durationMs`/`audioSeconds`-null** (ffmpeg probe fails on Vercel; also starves offset derivation) — **DEFER** to cost-obs/clock follow-up. Notes prompt **did change intentionally** (slice-3 map-reduce markdown: Summary/Topics/Questions/Corrections/Homework) — not a regression. **DECISION (Andrew 2026-06-07) — notes schema:** do NOT straight-drop old form fields (`topics/homework/assessment/plan/links`); **`Plan` is mandatory** (departments require it); **`homework` may fold into `Plan`** ONLY per Sarah's documented feedback (find+cite the "homework doesn't add much" note); new sections OK only as **genuinely-useful additions** on top of canonical fields, not a replacement. Reduce runs `temperature:0.3` (variance source); map pinned at 0. **TODO:** capture this as a redesign notes-schema requirement (REQ-S3-4) on docs branch AFTER the in-flight smoke-reqs agent finishes (avoid worktree race). Partial-badge smoke item skipped (no repro). Overall slice-3 PASS/FAIL still pending Andrew after cost/prompt clarification. **Component Chunk 1 + IAC-13 smoke: not yet done.** **Merges: HELD** until Andrew finishes runbook. Original: **Andrew: re-smoke `feat/recording-p1-slice3-autonotes`** (fresh preview session — confirm `TutorNote.status=done` without cron, whisper+notes cost events logged, skeleton visible, cost panel hidden from tutor). **Then `merge --no-ff`** to `v1-redesign`. After that: smoke + merge `v1-component-spine`. **After merges:** full ORCHESTRATOR-STATE restructure (dispatch Composer 2.5). **Nav decision LOCKED (Andrew 2026-06-07):** sidebar admin shell + **workspace = chromeless full-bleed exempt surface** → Chunk 2 (B3 session list) introduces sidebar; fold into `V1-COMPONENT-LIBRARY.md`. **IAC-13** ready (migration-free, slice-3-disjoint) — awaiting Andrew device-revoke policy. **Phase 3 consent** migration-blocked behind slice 3 merge. |
| **Open Andrew-confirms** | **Re-smoke slice 3** before merge. **IAC-13 revoke policy RESOLVED** (Andrew: scoped — disconnect affects only this tutor's link, no effect on the learner's other tutors) → shipped. **Pending:** IAC-13(c) `CLAIM_INVITE_TTL_MS` 7d→48h (recommended yes). **Deferred / non-blocking:** cost-durability hardening build timing; Sarah WB bugs (FROZEN until redesign); legacy test-account cleanup (greenlight-gated destructive). |
| **In-flight subagents** | **Slice-3 notes Save-bridge build** (Sonnet, on `feat/recording-p1-slice3-autonotes` main working tree — DO NOT run other live-stack/main-tree tasks concurrently). Hybrid arch (Andrew-approved): reduce→structured `SessionNote` fields; auto-create DRAFT SessionNote (tutor-only) linked via `WhiteboardSession.noteId`; review page editable draft + **Save** (finalize DRAFT→published, into notes list) + **Cancel and delete session data** (confirm "Are you sure you want to delete this session and all related data?"); **Regenerate guarded** (confirm + non-destructive, keep prior note until new succeeds). Field map per REQ-S3-4 (no drops; Plan mandatory; homework→Plan per cited Sarah feedback). Ownership-asserted; 5-axis review; additive migration OK (slice-3 owns lock). Resolves S3-1/2/4 as one contained fix (visual polish stays in B4). **(2)** Cross-domain email-collision investigation (Composer explore, read-only) — see finding row below. (Component Chunk 1 process+feedback capture DONE @ `0b45529`.) |
| **⚠ Cross-domain email collision (2026-06-07)** | **CONFIRMED on preview-dev:** `arangarx@hotmail.com` exists as BOTH an `AdminUser` (tutor, role=TUTOR, non-test) AND an `AccountHolder` (parent, non-self-learner, non-tombstoned). **Cause:** `AdminUser.email` and `AccountHolder.email` are each `@unique` *within their own table* but there is **NO cross-domain uniqueness check** — same email can hold one tutor + one parent account. Likely a **test artifact** for Andrew (IAC-13 smoke needed a parent acct; reused hotmail) but a **systemic gap**: independent passwords/login flows, and the planned Google-OAuth signup fast-follow makes destination ambiguous. **Investigating:** intended-vs-gap (IAC design docs), any existing signup/login disambiguation, risk list, options (enforce cross-domain uniqueness / account-linking / allow-as-is). **DECISION PENDING (Andrew)** after investigation. |
| **Component pass — decision (Andrew 2026-06-07)** | Keep building in **tracked chunks**, but foundation chunks **merge on FUNCTIONAL-correctness only** (no per-chunk visual smoke); **one cohesive visual review later** when chunks form a complete page/flow (judged vs palette mock + accumulated UX feedback — no separate high-fi page mock being produced). **Root miss:** Chunk 1 was handed as "smoke the look" with no visual target → un-smokeable. **Chunk 1 (`v1-component-spine`) APPROVED to merge functional.** **MERGE QUEUED** behind the notes-bridge build (avoid concurrent heavy ops on the busy main tree). Merge prereqs: confirm `v1-component-spine` has **no prisma migration** (UI reskin — expected none); run **`npx next build`** green (build-surface gate); `merge --no-ff` into `v1-redesign`; expect an **add/add conflict on `V1-COMPONENT-LIBRARY.md`** vs the docs branch later (resolve by taking the superset). |
| **⚠ Slice-3 notes-persistence finding (2026-06-07) — RESOLUTION IN PROGRESS** | **Verdict (B) durable-but-siloed.** Auto-notes ARE durably saved (`TutorNote` row per `WhiteboardSession`, cron backstop) but are **NEVER promoted into `SessionNote`** (the student institutional-memory notes list at `/admin/students/[id]/notes`). Slice-3 removed the review-page Save flow (`WhiteboardNotesPanel`→`NewNoteForm`→`createNote`) that was the **bridge** TutorNote→SessionNote; no replacement. Net: **ending a session no longer creates a browsable student note = institutional-memory regression** vs pre-slice-3. Manual `NewNoteForm` save still exists but only on the student-detail page, not post-session. **Reliability nasties:** (i) **Regenerate overwrites `TutorNote.content` in place, no version history** → accidental regen = permanent loss; (ii) **no discard/delete path** for a session's notes from UI. **Mitigation:** v1-redesign NOT live to Sarah (she's on `master`), so no prod impact today — but **must close before v1→master cutover**; B4 notes pass rebuilds this surface. So **REQ-S3-2 is NOT cosmetic** — it's the institutional-memory promotion bridge. **DECISIONS (Andrew 2026-06-07):** HOLD slice-3 merge until the Save/promote bridge is added (build it on the slice-3 branch now); guard Regenerate NOW; hybrid architecture approved (see In-flight). S3-1/2/4 pulled forward into this one contained notes fix; only visual polish remains for B4. |
| **Uncommitted / unmerged** | **Unmerged pushed branches:** `feat/recording-p1-slice3-autonotes` @ [`b7fb120`](https://github.com/Arangarx/tutoring-notes/commit/b7fb120) (slice 3 + BLOCKER fix — **re-smoke→merge FIRST**; owns migration lock); `v1-component-spine` @ `9c9dfec` (component Chunk 1 — smoke→merge); `iac-13-connected-parent-disconnect` @ `edf4720` (IAC-13 visibility + scoped disconnect, 283 tests — smoke→merge); `feature/sarah-forward-migration-q6` @ `a396ab5` (parked till cutover, do NOT merge now); `docs/v1-redesign-notes-ux-reqs` @ [`0b45529`](https://github.com/Arangarx/tutoring-notes/commit/0b45529) (docs-only — REQ-S3-1/2/2a/3/4 + OAuth-signup fast-follow + `/admin/cost` recent-events backlog + component-pass review protocol + Chunk 1 smoke feedback → merge anytime; **note:** carries `V1-COMPONENT-LIBRARY.md` which also lives on `v1-component-spine` → merge spine first); `harden/auth-role-refresh` @ [`f5e44f8`](https://github.com/Arangarx/tutoring-notes/commit/f5e44f8) off `v1-redesign`, no schema (auth Fix A: server-side auth in `getSessionCostBreakdown()`; Fix B: DB role re-fetch on JWT refresh, 5-min throttle, fail-closed on deleted account / fail-open on DB error, new `rol` log prefix registered in AGENTS.md; 12 new + 59 pre-existing auth tests green, tsc/eslint clean — **smoke→merge**). **Login-guard follow-up CLOSED (Andrew 2026-06-07):** no Google "Sign in" exists on the login path (login is credentials-only; the only Google OAuth is the Gmail send-notes consent flow) → the silent-re-auth vector doesn't apply. Andrew's stale-ADMIN symptom = pre-migration token (role undefined → ADMIN routing fallback), already self-corrected by Fix B on next refresh. No login-page "switch account" guard being built. **New fast-follow item (Andrew 2026-06-07):** add Google/OAuth as a **signup + login** option for parents and tutors — **fast-follow AFTER V1** (captured in BACKLOG/roadmap). **Branch-hygiene note:** `V1-COMPONENT-LIBRARY.md` now exists on BOTH `v1-component-spine` and `docs/v1-redesign-notes-ux-reqs` (it didn't exist on `v1-redesign`; docs agent checked it out from spine) → expect a trivial merge-order conflict when both land; merge `v1-component-spine` first, then rebase/merge the docs branch. Working tree clean on slice-3 branch. |

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
