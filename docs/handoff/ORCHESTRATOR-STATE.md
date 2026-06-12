# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## V1 Redesign (active epic)

Multi-day epic on branch **`v1-redesign`** (active V1 integration branch; **not yet merged to `master`**). **Decisions ledger + sub-pass tracker:** [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — do not duplicate the full ledger here.

---

## ⏩ HEAD — 2026-06-11 smoke round 1 triaged

| Field | Value |
|---|---|
| **Last action completed** | **Smoke round 1 COMPLETE** — Andrew smoked all 8 overnight branches; inline notes committed @ [`a176e4f`](https://github.com/Arangarx/tutoring-notes/commit/a176e4f) (`MASTER-CUT-SMOKE-2026-06-11.md`). Findings triaged in [`smoke-round-1-findings-2026-06-11.md`](smoke-round-1-findings-2026-06-11.md) (40 items: 8 BLOCKER, 9 HIGH, 4 MED, 5 LOW, 5 DESIGN, 9 INFO). **None merged to `v1-redesign`.** Integration tip unchanged @ [`5fe29b1`](https://github.com/Arangarx/tutoring-notes/commit/5fe29b1). |
| **Next action(s)** | **Fix BLOCKERs + sequence merges** (pending Andrew): W1/TFA1 redirect loop, C1 ConsentError UI, C2 Step 6 parent consent UI, P1/P2 child credential validation, E1 end-session shell flip; then re-smoke and merge to `v1-redesign` in recommended order. Many cross-branch tests (L2/L3 laser position, replay) require `v1-redesign` re-merged into WB branches first. |
| **Open Andrew-confirms** | **SHOULD-FIX-2** (S-DEC) — orchestrator to recommend chunk-transcribe F&F bearer option A vs B. **Merge/fix order** — which BLOCKERs before first merge vs fix-on-branch. **`NOTES_AUTH_WALL` + `CONSENT_ENFORCEMENT`** — env-scope-at-cut note (preview vs prod flip playbook). Plus standing: B2 D-1/D-2/D-5, flag flip timing, B1 deferred TODOs, N-2 parent dashboard semantics. |
| **In-flight subagents** | **None**. |
| **Uncommitted / unmerged** | **8 feature branches** still unmerged to `v1-redesign` (see Morning smoke queue). **This commit:** findings doc + BACKLOG append + state HEAD on `v1-redesign`. **`v1-redesign` → `master`:** entire epic held for full Gate A. **Parked:** `feature/sarah-forward-migration-q6` @ `a396ab5`. |

**Process directive (Andrew 2026-06-07):** prefer **agent-runnable validation harnesses** over manual smoke wherever behavior is verifiable without Andrew's hardware (transcription E2E + sweep validations were the exemplars).

---

## Morning smoke queue (Andrew — start here)

> **Legend (every smokebook):** `[x]` = step **PASSED**; unchecked = skipped/failed with reason on **Notes:** line. Each target ends with a per-target `- [ ] PASS` / `- [ ] FAIL` verdict checkbox.
>
> **Preview:** deploy each branch tip to Vercel Preview (or local `npm run dev`). Smokebooks live on the **branch tip** under `docs/handoff/` — check out the branch or read via `git show <branch>:docs/handoff/<file>`.

| # | Branch | Tip | What it does | Smokebook | Risk / smoke notes | Merge slot |
|---|---|---|---|---|---|---|
| 1 | `feat/component-dry-mechanical` | [`c3abe88`](https://github.com/Arangarx/tutoring-notes/commit/c3abe88) | Mechanical component DRY — shared notes display utils, `SubmitButton` variants, dead `.admin-nav*` CSS removed, `useThemeDropdown` hook. **No visual change intended.** | [`component-dry-mechanical-smokebook-2026-06-11.md`](component-dry-mechanical-smokebook-2026-06-11.md) | Touches `globals.css`, theme toggles, admin nav, submit buttons across admin/parent surfaces. Low behavioral risk; spot-check theme + nav. | **1st** — styling/base pass; merge before WB chrome branches |
| 2 | `feat/security-tier-b` | [`09eabc0`](https://github.com/Arangarx/tutoring-notes/commit/09eabc0) | Security Tier B — chunk-transcribe auth guard, forgot-pw stale-token cleanup, upload error sanitization + tests + runbooks. | [`security-tier-b-findings-2026-06-11.md`](security-tier-b-findings-2026-06-11.md) § Smoke checklist *(no separate smokebook)* | **Andrew decision:** SHOULD-FIX-2 — F&F chunk-transcribe calls may 401 when `CRON_SECRET` set. Verify E2E transcription still works. API-only; no UI. | **2nd** — independent of WB; merge early |
| 3 | `feat/wb-laser-sync` | [`72c4c35`](https://github.com/Arangarx/tutoring-notes/commit/72c4c35) | A5 sub-item — tutor→student laser pointer broadcast (B9 pilot fix). Bidirectional student wand **deferred**. | [`wb-laser-sync-smokebook-2026-06-11.md`](wb-laser-sync-smokebook-2026-06-11.md) | **Real hardware required** — jsdom cannot prove laser visibility. `test:wb-sync` green on branch. | **3rd** — before end-session review (conflicts on `WhiteboardWorkspaceClient.tsx`) |
| 4 | `feat/wb-end-session-review` | [`29d2f7c`](https://github.com/Arangarx/tutoring-notes/commit/29d2f7c) | **Gate A3 Phase A** — in-shell mode flip on End Session (notes-primary review, board preview, lazy replay drill-down). No `router.replace` off workspace. | [`wb-end-session-review-smokebook-2026-06-11.md`](wb-end-session-review-smokebook-2026-06-11.md) | **Real browser required.** Touches recorder lifecycle + `WhiteboardWorkspaceClient`. Reconcile with laser-sync if merging out of order. | **4th** — after laser-sync |
| 5 | `feat/wb-replay-a6-slice` | [`15ee25a`](https://github.com/Arangarx/tutoring-notes/commit/15ee25a) | A6 safe slice — JSXGraph embeddables render in replay (admin + share). **Does not** fix multi-segment player regression. | [`wb-replay-a6-slice-smokebook-2026-06-11.md`](wb-replay-a6-slice-smokebook-2026-06-11.md) | Smokebook §2 characterizes master vs preview replay regression. Graph sessions required. | **5th** — mostly `WhiteboardReplay.tsx`; low conflict if A3 merged first |
| 6 | `feat/parent-create-learner` | [`e1ffe8c`](https://github.com/Arangarx/tutoring-notes/commit/e1ffe8c) | Parents create learners without claim link + set up child login (PIN). Auth boundary HIGH. | [`parent-create-learner-smokebook-2026-06-11.md`](parent-create-learner-smokebook-2026-06-11.md) | Children's credentials + ownership. 14 unit tests green. Independent of WB branches. | **6th** — identity UI; before schema branches |
| 7 | `feat/signup-waitlist` | [`5cb137e`](https://github.com/Arangarx/tutoring-notes/commit/5cb137e) | **Gate B1** — tutor signup waitlist + cost gating. Grandfather backfill approves existing tutors. `/admin/pending-approval` + `/admin/tutor-approvals`. | [`signup-waitlist-smokebook-2026-06-11.md`](signup-waitlist-smokebook-2026-06-11.md) | **Migration required** before preview smoke (`20260611000000_b1_tutor_approval`). Cost-path negative tests critical. | **7th** — schema migration; merge before B2 |
| 8 | `feat/b2-consent` | [`8e8ab9c`](https://github.com/Arangarx/tutoring-notes/commit/8e8ab9c) | **Gate B2** — parent privacy consent FULLY behind dormant `CONSENT_ENFORCEMENT` (default OFF). Schema + capture gates + claim Panel A. 77 tests. | [`b2-consent-smokebook-2026-06-11.md`](b2-consent-smokebook-2026-06-11.md) | **Migration required** (`20260611010000_b2_consent_schema`). Smoke flag-OFF first (Sarah-safe). Flag-ON smoke on preview only. Design: [`b2-consent-design-2026-06-11.md`](b2-consent-design-2026-06-11.md). | **8th (last)** — heaviest schema + overlaps B1 on `schema.prisma`, actions |

### Recommended merge order → `v1-redesign`

```
1 feat/component-dry-mechanical
2 feat/security-tier-b
3 feat/wb-laser-sync
4 feat/wb-end-session-review   ← reconcile WhiteboardWorkspaceClient with #3
5 feat/wb-replay-a6-slice
6 feat/parent-create-learner
7 feat/signup-waitlist         ← apply B1 migration first
8 feat/b2-consent              ← apply B2 migration; reconcile with B1 on schema + actions
```

**Conflict hotspots (merge-tree verified):**

| Pair | Files | Mitigation |
|---|---|---|
| `feat/wb-laser-sync` ↔ `feat/wb-end-session-review` | `WhiteboardWorkspaceClient.tsx`, `RECORDER-LIFECYCLE.md`, `WhiteboardWorkspaceEnd.dom.test.tsx` | Merge laser **before** end-session; manual reconcile on workspace client |
| `feat/signup-waitlist` ↔ `feat/b2-consent` | `prisma/schema.prisma`, `src/app/admin/students/[id]/actions.ts`, `whiteboard/actions.ts`, `createWhiteboardSession.test.ts`, `consent-scope.ts` | Merge B1 then B2; single combined migration deploy on preview |
| WB stack (any order violation) | Shared `WhiteboardWorkspaceClient.tsx`, `page.tsx`, `TutorNotesSection.tsx` | Serial WB merges 3→4→5 |

**Post-smoke top build candidate (NOT built overnight):** VIDEO recording + replay integration — designed, flagged for sequencing, deferred as riskiest/least-defined per Andrew ("riskiest last").

---

## Open decisions — Andrew confirms

### B2 parent privacy consent (`feat/b2-consent`)

| Item | Status | Andrew action |
|---|---|---|
| **D-1** — `events.json` always uploaded; `allowWhiteboardRecording` gates **parent replay access**, not upload | Built — confirm in smoke | Confirm or override in [`b2-consent-smokebook-2026-06-11.md`](b2-consent-smokebook-2026-06-11.md) § Design decisions |
| **D-2** — `ConsentRestriction` schema built; all-false defaults; **no child UI** in V1 | Built — confirm | Confirm child-narrowing deferred is acceptable |
| **D-5** — Self-learners (`isSelfLearner`) auto-pass all consent | Built — confirm | Confirm adult self-learner bypass |
| **When to flip `CONSENT_ENFORCEMENT=true`** | Not decided | Same dormant-then-flip playbook as `NOTES_AUTH_WALL` — pilot families must set consent at claim **before** production flip |
| **Step 6 deferred** — parent per-tutor consent management `/account/children/[id]` + update route + tutor workspace toggle display | **Not built** | Schedule follow-up build or defer past V1 |

### B1 tutor waitlist (`feat/signup-waitlist`)

Deferred TODOs (not in overnight scope): REJECTED status, revocation UI, approval email, Google OAuth auto-provision, marketing-waitlist separation, pagination.

### Security Tier B (`feat/security-tier-b`)

**SHOULD-FIX-2:** `enqueueChunkTranscriptionAction` fire-and-forget to `/api/queues/chunk-transcribe` lacks Bearer token — will **401 when `CRON_SECRET` set**. Options: (A) pass secret in server-side F&F header, or (B) rely on cron/sweep only. **Decide before merge.** See [`security-tier-b-findings-2026-06-11.md`](security-tier-b-findings-2026-06-11.md).

### Other standing confirms

| Item | Notes |
|---|---|
| **N-2 semantics** | Parent dashboard shows child notes regardless of share-link revocation (ownership-based access?) — awaiting confirm/override |
| **Merge order** | Recommended order above — approve or reorder before first `--no-ff` merge |
| **A3 Phase B** | Visual polish for in-shell review deferred to Andrew post-smoke |
| **Laser bidirectional** | Student wand → tutor deferred; tutor→student only in overnight slice |

---

### Overnight push 2026-06-11 — COMPLETE

**Andrew directive (2026-06-11):** drive hard toward V1→master cut. Overnight wave **delivered 8 branches**; Andrew smokes tomorrow; merges follow smoke pass.

| Rule | Detail |
|---|---|
| **Branch discipline** | ✅ Each target on separate branch + smokebook/findings doc |
| **Merge gate** | Andrew smoke PASS → `merge --no-ff` to `v1-redesign` in recommended order |
| **Not built overnight** | VIDEO recording + replay; A2 waiting room; B2 Step 6 parent consent management UI; laser bidirectional; A6 multi-segment player regression fix |

**Component reuse standard (ratified 2026-06-11):** [`V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md) §2.12, [`.cursor/rules/component-reuse.mdc`](../../.cursor/rules/component-reuse.mdc), `BACKLOG.md` audit. `feat/component-dry-mechanical` is the mechanical pass — smoke for no visual drift.

### Pre-master gates — two-tier checklist (RATIFIED Andrew 2026-06-08)

> **Canonical operational list** — `BACKLOG.md`, `RELEASE-ROADMAP.md`, and `v1-redesign-STATUS.md` cross-reference here.

**Vocabulary:** **V1** = master cut (Gate A). **Release** = recruiting new pilots (Gate B era complete).

#### Gate A — blocks master cut

| # | Gate | Status (post-overnight) |
|---|---|---|
| A1 | Visual redesign + chrome + theme + component reuse | Desktop WB chrome DONE; mobile chrome merged; **component DRY branch awaiting smoke**; cohesive visual review vs site mocks still pending |
| A2 | Waiting room | **Designed, NOT built** |
| A3 | Pass-2 in-context end-session | **BUILD on `feat/wb-end-session-review` @ `29d2f7c`** — Phase A functional; Phase B polish deferred; **awaiting smoke** |
| A3a | PDF page-tab indicator | **MERGED** to `v1-redesign` @ `c05d939` |
| A3b | SR-04a video-tile sizing | **MERGED** to `v1-redesign` @ `c05d939` |
| A5 | Live bidirectional sync completeness | **Partial overnight** — tutor→student laser on `feat/wb-laser-sync`; full enumerated audit still open; student laser deferred |
| A6 | Replay fidelity + AV/timer sync | **Partial overnight** — JSXGraph replay on `feat/wb-replay-a6-slice`; 🔴 multi-segment player regression on preview **not fixed** this branch; full enumerated pass still open |

#### Gate B — post-V1 / pre-release

| # | Gate | Status (post-overnight) |
|---|---|---|
| B1 | Approval-gating / waitlist | **BUILD on `feat/signup-waitlist` @ `5cb137e`** — awaiting smoke + migration |
| B2 | Parent privacy consent | **BUILD on `feat/b2-consent` @ `8e8ab9c`** — dormant flag; awaiting smoke + migration + Andrew design confirms |
| B3 | Security Tier B | **Partial on `feat/security-tier-b` @ `09eabc0`** — 3 fixes + runbooks; awaiting smoke + SHOULD-FIX-2 decision |
| B4 | Scheduling + calendar | Post-V1 — not started |

**Scope trap:** `Student.recordingDefaultEnabled` ≠ parent privacy consent. See `BACKLOG.md`.

**Cross-domain email collision — RESOLVED (Andrew 2026-06-07):** one email = one account (Option A). Enforcement in Google-OAuth-signup fast-follow wave.

**Open v1 requirements:** Theme-agnostic token-driven components (§2.11); single-source reuse (§2.12). **Notes-login cutover:** no grace — claim Sarah's pilot family before `NOTES_AUTH_WALL=true` at master. **Phase 1 notes-login: MERGED** @ `d3a9e8b`.

**Component pass:** `v1-component-spine` MERGED. Cohesive visual review still pending for master cut.

**Deferred reliability (slice-3 review):** S3 orphan DRAFT race, N1–N4 → `BACKLOG.md`.

---

**Process directive — runbook legend (Andrew 2026-06-07):** every smoke runbook opens with `[x]` = PASSED; per-target `- [ ] PASS` / `- [ ] FAIL` verdict at end. Embed concrete check items inline.

### ✅ Slice-3 save-bridge — Pass-1 rework MERGED (2026-06-07)

**Pass 1 complete** @ [`0fa2363`](https://github.com/Arangarx/tutoring-notes/commit/0fa2363) → **MERGED `--no-ff` → `v1-redesign` @ [`3f62b58`](https://github.com/Arangarx/tutoring-notes/commit/3f62b58)**. Target A smoke PASS. B4 Save-model LOCKED.

**Pass 2 (session-end UX — Gate A3):** now **built overnight** on `feat/wb-end-session-review` (Phase A). Pass-1 INTERIM redirect still the fallback when `onSessionEnded` not wired.

**DEFERRED — MUST NOT MISS:** native `confirm()`/`alert()` → in-site modals (component pass); notes quality / Regenerate thread.

---

## Current focus

**Morning priority:** smoke the **8-branch overnight queue** (table above), then serial `--no-ff` merges to `v1-redesign`.

**Wave 1 reliability floor** on `v1-redesign`: whiteboard sync + regression net **done**; SEC-1 **complete**; mobile WB chrome **merged**; notes-login Phase 1 **merged**.

**WB/recording smoke FROZEN** for interim whiteboard bugs until v1 redesign ships (Sarah 2026-06-06 backlog items).

---

## Recording P1 Slice 3 — SHIPPED (on `v1-redesign`)

Merged on `v1-redesign`. Map-reduce auto-notes, end-session sweep, manual transcribe button retired. See [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md).

---

## Recording transport thread — CLOSED (2026-06-07)

DB-as-queue + cron sweep ratified and shipped. Q1 `gpt-4o-mini-transcribe` PASS.

---

## Known follow-ups (non-blocking)

| Item | Notes |
|---|---|
| **`durationMs` null on Vercel** | ffmpeg probe in serverless — revisit with recording-clock work |
| **Preview cron limitation** | [`PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §1.6 |
| **Cost-event durability hardening** | Ratified, NOT BUILT — [`cost-observability-design-2026-06-06.md`](cost-observability-design-2026-06-06.md) |
| **Sarah WB bugs (FROZEN)** | Ctrl+Z, copy-link, "Loading scene" — `BACKLOG.md` |
| **VIDEO recording + replay** | Top post-smoke build candidate — designed, not built |

---

## Standing ratified decisions (condensed)

Recording Q1/Q5/Q6/Q7/Q8, cost Q8, pricing-floor, Vercel-lock OK — see [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md).

---

## Parallel standing work (do not lose)

| Thread | Status |
|---|---|
| **v1 component redesign / UI pass** | A1 + component DRY branch awaiting smoke |
| **Identity / access** | Parent-create-learner + B1 + B2 branches awaiting smoke; IAC-13 disconnect build open |
| **Phase 2 authed session chrome** | Notes page inside parent/child shell — post-overnight |
| **Sarah forward-migration** | `feature/sarah-forward-migration-q6` parked |
| **Master / pilot** | Sarah on `tutoring-notes.vercel.app` |

---

## Pilot context (Sarah — 2026-06-06)

[`sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](sarah-pilot-feedback-2026-06-06-orchestrator-report.md). Laser pointer (B9) addressed on `feat/wb-laser-sync`.

---

## Project arc (compressed)

- **North star:** [`AGENTS.md`](../../AGENTS.md)
- **Reliability bar:** [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc)
- **SEC-1:** complete
- **Whiteboard view-sync:** `npm run test:wb-sync` gate for WB sync touches

**Deep history:** `git log --oneline v1-redesign` and `git log -p docs/handoff/ORCHESTRATOR-STATE.md`.

---

## How we work (process — pointers only)

- **Orchestration model:** [`AGENTS.md`](../../AGENTS.md) § "Model usage protocol"
- **Dispatch boundary:** [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc)
- **Merging (solo pilot):** smokeable branch → Andrew smoke → `merge --no-ff` into `v1-redesign`; WB sync → `npm run test:wb-sync`; build-surface → `npx next build`
- **Commits on Windows/PowerShell:** `.git/COMMIT_MSG_DRAFT.txt` + `git commit -F`

---

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (this file) — **morning smoke queue table**
3. [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — V1 epic ledger
4. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — before touching `handleEndSession`
5. [`docs/handoff/b2-consent-design-2026-06-11.md`](b2-consent-design-2026-06-11.md) — on `feat/b2-consent` tip
6. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)
7. [`docs/BACKLOG.md`](../BACKLOG.md)
8. [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md)

---

## History / audit trail

Updated in place; `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Template: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).
