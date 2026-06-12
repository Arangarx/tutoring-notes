# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## V1 Redesign (active epic)

Multi-day epic on branch **`v1-redesign`** (active V1 integration branch; **not yet merged to `master`**). **Decisions ledger + sub-pass tracker:** [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — do not duplicate the full ledger here.

---

## ⏩ HEAD — 2026-06-11 recording/replay invariant matrix ratified

| Field | Value |
|---|---|
| **Last action completed** | **Ratified recording/replay invariant matrix (2026-06-11)** + captured canonically in [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md) § Recording & Replay Invariant Matrix (I1–I5/M1–M6); D3/D4 SUPERSEDED/CLARIFIED notes preserved; lifecycle-brief freeze-vs-advance resolved; BACKLOG items added (billing basis open, map/reduce accuracy workstream). **Prior:** student-WB migration steps 1-2 merged @ [`dfb221c`](https://github.com/Arangarx/tutoring-notes/commit/dfb221c); trust-model + COPPA resolved. |
| **Next action(s)** | **Build recording consolidation slice (fix path B)** implementing I1–I5/M1–M6 matrix; restore defer-on-release scrub (M2) + native single-stream playback; map/reduce accuracy as separate workstream. **Parallel:** X2 v1 design + student-WB migration steps 3-9 (Andrew confirms c/e before step 4). |
| **Open Andrew-confirms** | **RESOLVED:** (a) Encryption trust model; (b) stored-content operator-blind encryption backlogged. **STILL OPEN:** (c) student URL keep vs retire; (d) learner-swap; (e) student camera default; (f) C1–C4 before `CONSENT_ENFORCEMENT`; (g) env scoping at master cut. Standing: B2 D-1/D-2/D-5, B1 deferred TODOs, N-2. **Open decision (not Andrew-confirm):** billing basis wall-clock vs session-timer — see [`docs/BACKLOG.md`](../BACKLOG.md) § Pricing. Lawyer-needed: VPC method/copy, retention in /privacy, FERPA/SOPIPA. |
| **In-flight subagents** | None. |
| **Uncommitted / unmerged** | **None uncommitted.** Merged to `v1-redesign`: harness-fix, steps-1-2. Feature + fix branches remain on remote (stale-sweep eligible). **`v1-redesign` → `master`:** held for full Gate A + comprehensive re-smoke. **Parked:** `feature/sarah-forward-migration-q6` @ `a396ab5`. |

**Process directive (Andrew 2026-06-07):** prefer **agent-runnable validation harnesses** over manual smoke wherever behavior is verifiable without Andrew's hardware (transcription E2E + sweep validations were the exemplars).

---

## Smoke round 1 — COMPLETE (merged to `v1-redesign` @ [`27ac5db`](https://github.com/Arangarx/tutoring-notes/commit/27ac5db))

> **Andrew — start here for next pass:** comprehensive re-smoke of **single merged `v1-redesign` preview** (full app). Per-branch smokebooks remain under `docs/handoff/` for reference; findings ledger: [`smoke-round-1-findings-2026-06-11.md`](smoke-round-1-findings-2026-06-11.md).

| # | Branch | Merge commit | What landed + fix applied |
|---|---|---|---|
| 1 | `feat/component-dry-mechanical` | [`f6e2f23`](https://github.com/Arangarx/tutoring-notes/commit/f6e2f23) | Mechanical DRY consolidation — no visual change (smoke base). |
| 2 | `feat/parent-create-learner` | [`8b196a5`](https://github.com/Arangarx/tutoring-notes/commit/8b196a5) | Parents create learners + child PIN login. **FIXED P1** (weak-PIN `123456` now rejected) + **P2** (username `no spaces` now rejected) via shared `src/lib/learner-credential-validation.ts` (claim + parent-create share it); root cause was missing client validation in `SetupLoginForm`. |
| 3 | `feat/security-tier-b` | [`6395771`](https://github.com/Arangarx/tutoring-notes/commit/6395771) | Chunk-transcribe auth guard, upload sanitization. **FIXED S1** (consume path now deletes superseded reset tokens — closes race; "3 links open the form" is expected client render, only newest completes) + **SHOULD-FIX-2 option A** (`CRON_SECRET` server-side bearer on F&F chunk-transcribe). **NOTE (email):** password-reset emails send via LEGACY tutor realm using tutor's connected Gmail ("from Andrew" intentional); account-holder realm only stubs/logs — parent-facing email (claim/notes/AH reset) NOT wired for real send; email flows untestable on previews (preview→prod loopback). |
| 4 | `feat/signup-waitlist` | [`f0b9667`](https://github.com/Arangarx/tutoring-notes/commit/f0b9667) | **Gate B1** — tutor approval gate. **FIXED W1/TFA1** (pending-approval ↔ 2FA-setup redirect loop: `/admin/pending-approval` now 2FA-exempt; predicates extracted to `src/lib/admin-routing.ts`; 429 was loop symptom; 20/min TOTP limit kept) + **W2** (signup button no longer ghosts on invalid email) + **W4** (deleted dup `/admin/waitlist` + nav link). |
| 5 | `feat/wb-laser-sync` | [`6f861ea`](https://github.com/Arangarx/tutoring-notes/commit/6f861ea) | Tutor→student laser broadcast. **FIXED L1** (coral both sides: student-remote already coral; tutor-local Excalidraw-native red overridden via CSS since `DEFAULT_LASER_COLOR` is not API-controllable). **L2/L3 position DEFERRED** (confounded by old-vs-new-WB interface skew — re-smoke after WB interface unified). |
| 6 | `feat/wb-end-session-review` | [`5922c6f`](https://github.com/Arangarx/tutoring-notes/commit/5922c6f) | **Gate A3** in-shell end-session review. **FIXED E1** (BLOCKER: End was navigating to old replay instead of flipping shell in-place — root cause was `revalidatePath('/workspace')` in `endWhiteboardSession` triggering RSC replacement that unmounted the shell mid-await; removed that call; de-theatered DOM test with real no-nav oracle). Reconciled cleanly with laser in `WhiteboardWorkspaceClient.tsx`. |
| 7 | `feat/wb-replay-a6-slice` | [`e150e86`](https://github.com/Arangarx/tutoring-notes/commit/e150e86) | JSXGraph embeddables render in replay (graph fix verified in smoke). **R1/R2** (multi-segment player: audio not synced, plays past scrubber end, scrub restarts audio) is a **SEPARATE replay-player regression thread (A6-1)** — NOT fixed here. |
| 8 | `feat/b2-consent` | [`27ac5db`](https://github.com/Arangarx/tutoring-notes/commit/27ac5db) | **Gate B2** consent schema/snapshot/claim Panel A, **DORMANT** behind `CONSENT_ENFORCEMENT` (default OFF; dormancy invariant confirmed = pre-B2 behavior). Reconciled B1 approval gate + B2 consent gate in `createWhiteboardSession` (order: approval → consent → Blob put). Schema has both B1 + B2 additions; both migrations coexist. |

**Post-smoke top build candidate (NOT built overnight):** VIDEO recording + replay integration — designed, flagged for sequencing, deferred as riskiest/least-defined per Andrew ("riskiest last").

---

## Open threads / carry-forward (from smoke round 1)

> Finding IDs reference [`smoke-round-1-findings-2026-06-11.md`](smoke-round-1-findings-2026-06-11.md).

### Before flipping `CONSENT_ENFORCEMENT`

| ID | Thread | Disposition |
|---|---|---|
| **C1** | Consent denial surfaces to tutor as generic 500 "Error ID …" instead of actionable "consent not granted" | Must catch `ConsentError` at UI boundary |
| **C2** | No parent UI to view/change consent (deferred B2 Step 6) | Build or defer past V1 |
| **C3** | Claim page: login-setup above privacy; frame "Allow live sessions" as base contract | UX/copy pass |
| **C4** | Consent×retention principle: if WB recording not consented, we cannot retain | Strongly-encourage + warn |

### Dedicated fix / investigation threads

| ID | Thread | Disposition |
|---|---|---|
| **R1/R2** | Replay multi-segment custom-player regression (A6-1) — audio not synced, plays past scrubber end, scrub restarts audio | Dedicated fix thread |
| **X1** | Live video capture/display broken (won't turn on; student video tile never appears) | Dedicated investigation |
| **L2/L3** | Laser + replay **position** | Re-smoke once tutor & student both run the **NEW** WB interface |
| **X2** | **v1-design-application via shared components** (Andrew's central point) — final v1 design not applied in many places (WB session start panel, 2FA setup page TFA2, pending-approval, signup, "Connected" pill L6, AV pip clarity X3); no-duplication rule = build components once + compose + apply everywhere | **Likely next major thread** |

### Polish / design backlog (see `docs/BACKLOG.md`)

C5/N1 billable-minutes display · X4 echo-cancellation/capture-start · X5 student-initials UX · X7 button text color · P1 interactive PIN strength feedback

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

**SHOULD-FIX-2 — RESOLVED (option A):** `CRON_SECRET` server-side bearer on F&F chunk-transcribe — merged @ [`6395771`](https://github.com/Arangarx/tutoring-notes/commit/6395771). See [`security-tier-b-findings-2026-06-11.md`](security-tier-b-findings-2026-06-11.md).

### Other standing confirms

| Item | Notes |
|---|---|
| **N-2 semantics** | Parent dashboard shows child notes regardless of share-link revocation (ownership-based access?) — awaiting confirm/override |
| **A3 Phase B** | Visual polish for in-shell review deferred to Andrew post-smoke |
| **Laser bidirectional** | Student wand → tutor deferred; tutor→student merged @ [`6f861ea`](https://github.com/Arangarx/tutoring-notes/commit/6f861ea) |

---

### Overnight push 2026-06-11 — COMPLETE (smoke + merge)

**Andrew directive (2026-06-11):** drive hard toward V1→master cut. Overnight wave **delivered 8 branches**; smoke round 1 triaged; **all 8 merged to `v1-redesign`** @ [`27ac5db`](https://github.com/Arangarx/tutoring-notes/commit/27ac5db).

| Rule | Detail |
|---|---|
| **Branch discipline** | ✅ Each target on separate branch + smokebook/findings doc |
| **Merge gate** | ✅ Andrew smoke → fixes on branch → `merge --no-ff` to `v1-redesign` (8/8 complete) |
| **Not built overnight** | VIDEO recording + replay; A2 waiting room; B2 Step 6 parent consent management UI; laser bidirectional; A6 multi-segment player regression fix |

**Component reuse standard (ratified 2026-06-11):** [`V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md) §2.12, [`.cursor/rules/component-reuse.mdc`](../../.cursor/rules/component-reuse.mdc), `BACKLOG.md` audit. `feat/component-dry-mechanical` is the mechanical pass — smoke for no visual drift.

### Pre-master gates — two-tier checklist (RATIFIED Andrew 2026-06-08)

> **Canonical operational list** — `BACKLOG.md`, `RELEASE-ROADMAP.md`, and `v1-redesign-STATUS.md` cross-reference here.

**Vocabulary:** **V1** = master cut (Gate A). **Release** = recruiting new pilots (Gate B era complete).

#### Gate A — blocks master cut

| # | Gate | Status (post smoke-round-1 merge) |
|---|---|---|
| A1 | Visual redesign + chrome + theme + component reuse | Desktop WB chrome DONE; mobile chrome merged; **component DRY MERGED** @ `f6e2f23`; cohesive visual review vs site mocks still pending — **X2 thread** |
| A2 | Waiting room | **Designed, NOT built** |
| A3 | Pass-2 in-context end-session | **MERGED** @ `5922c6f` — Phase A functional (E1 fixed); Phase B polish deferred |
| A3a | PDF page-tab indicator | **MERGED** to `v1-redesign` @ `c05d939` |
| A3b | SR-04a video-tile sizing | **MERGED** to `v1-redesign` @ `c05d939` |
| A5 | Live bidirectional sync completeness | **Partial** — tutor→student laser MERGED @ `6f861ea` (L1 fixed; L2/L3 position deferred); student laser deferred; full enumerated audit still open |
| A6 | Replay fidelity + AV/timer sync | **Partial** — JSXGraph replay MERGED @ `e150e86`; 🔴 multi-segment player regression (R1/R2, A6-1) **not fixed**; full enumerated pass still open |

#### Gate B — post-V1 / pre-release

| # | Gate | Status (post smoke-round-1 merge) |
|---|---|---|
| B1 | Approval-gating / waitlist | **MERGED** @ `f0b9667` — W1/TFA1/W2/W4 fixed; migration deployed on preview |
| B2 | Parent privacy consent | **MERGED** @ `27ac5db` — dormant `CONSENT_ENFORCEMENT`; C1/C2/C3/C4 block flag flip; Andrew design confirms (D-1/D-2/D-5) still open |
| B3 | Security Tier B | **MERGED** @ `6395771` — S1 + SHOULD-FIX-2 option A shipped |
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

**Pass 2 (session-end UX — Gate A3):** **MERGED** @ `5922c6f` (Phase A; E1 fixed). Pass-1 INTERIM redirect still the fallback when `onSessionEnded` not wired.

**DEFERRED — MUST NOT MISS:** native `confirm()`/`alert()` → in-site modals (component pass); notes quality / Regenerate thread.

---

## Current focus

**Priority:** Andrew **comprehensive re-smoke** of merged `v1-redesign` (single preview, full app) → pick next major thread (likely **X2** v1-design-application via shared components).

**Wave 1 reliability floor** on `v1-redesign`: whiteboard sync + regression net **done**; SEC-1 **complete**; mobile WB chrome **merged**; notes-login Phase 1 **merged**; smoke round 1 **8/8 merged** @ `27ac5db`.

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
| **v1 component redesign / UI pass (X2)** | Component DRY merged; **v1-design-application** (shared components everywhere) likely next major thread |
| **Identity / access** | Parent-create-learner + B1 + B2 **merged**; IAC-13 disconnect build open |
| **Replay player (A6-1)** | R1/R2 multi-segment regression — dedicated fix thread |
| **Live AV (X1)** | Video capture/display broken — dedicated investigation |
| **Phase 2 authed session chrome** | Notes page inside parent/child shell — post-overnight |
| **Sarah forward-migration** | `feature/sarah-forward-migration-q6` parked |
| **Master / pilot** | Sarah on `tutoring-notes.vercel.app` |

---

## Pilot context (Sarah — 2026-06-06)

[`sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](sarah-pilot-feedback-2026-06-06-orchestrator-report.md). Laser pointer (B9) merged @ `6f861ea`.

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
2. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (this file) — **HEAD + merge status + open threads**
3. [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — V1 epic ledger
4. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — before touching `handleEndSession`
5. [`docs/handoff/b2-consent-design-2026-06-11.md`](b2-consent-design-2026-06-11.md) — B2 consent design (merged on `v1-redesign`)
6. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)
7. [`docs/BACKLOG.md`](../BACKLOG.md)
8. [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md)

---

## History / audit trail

Updated in place; `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Template: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).
