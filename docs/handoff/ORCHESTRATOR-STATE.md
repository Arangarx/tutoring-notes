# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

> **Operating contract (`.cursor/rules/orchestrator-discipline.mdc`, explicit @ [`7341ff9`](https://github.com/Arangarx/tutoring-notes/commit/7341ff9)):** State durability is a **primary reliability obligation**, not a nicety. Andrew offloads project memory to the orchestrator on purpose — at any moment a session can be lost and a fresh orchestrator must resume with **minimal re-guidance** (ideally just "continue"). Keep this file continuously current; treat "I'll update state later" as a silent failure.

---

## ⏩ HEAD — 2026-06-12 `v1-design-system` merged into `v1-redesign` (milestone)

| Field | Value |
|---|---|
| **Last action completed** | **MILESTONE — `v1-design-system` fully merged into `v1-redesign`** @ [`36727ea`](https://github.com/Arangarx/tutoring-notes/commit/36727ea) (`git merge --no-ff`), ZERO conflicts (this file auto-reconciled), `npx next build` exit 0, pushed. **119 files** — full epic: frozen component library → Groups A–G reskin → tweak wave → Wave 2 → accent (KEEP) → polish wave → CSS cascade fixes → Delete-button parity. Andrew full visual smoke (**both themes**): one flag — Delete student button lacked box at rest — **FIXED** @ [`17ae7dd`](https://github.com/Arangarx/tutoring-notes/commit/17ae7dd). **Worktree + branch sweep done:** 35 `v1ds/*` branches deleted (all merged), 31 orphaned worktree dirs purged (Windows long-path `node_modules` via robocopy mirror-empty); worktrees ~47→**6 keepers** — main `v1-redesign`; spikes `design/live-incremental-transcription-2026-06-02`, `feature/sarah-forward-migration-q6`, `spike/wb-chrome-poc-857e6d4c`; hand-placed siblings `tn-auth-harden` (`harden/auth-role-refresh`) + `tn-docs-notes` (`docs/v1-redesign-notes-ux-reqs`) untouched. Stray `.jest-config-dump.json` + `.worktrees/` removed. |
| **Next action(s)** | **(1) STRATEGY REFINED 2026-06-12 → `Experience-Driven Wedge` program** (`~/.cursor/plans/experience-driven_wedge_ae2776e1.plan.md`; rolling-wave cadence; full strategy in [continuity-wedge brainstorm](../research/continuity-wedge-brainstorm-2026-06-12.md) — see program note below). Docs reconciliation DONE ([`5c93920`](https://github.com/Arangarx/tutoring-notes/commit/5c93920) — this file + RELEASE-ROADMAP + BACKLOG overlays; finished v1ds smokebooks archived). **(1a) ⏸ AWAITING ANDREW — Phase 1 (WB floor) detailed plan + INDEPENDENT 5-axis review DONE on branch `phase1/wb-reliability-floor`** (pushed): [`phase-1-wb-floor-plan-2026-06-13.md`](phase-1-wb-floor-plan-2026-06-13.md) + [`phase-1-wb-floor-5axis-2026-06-13.md`](phase-1-wb-floor-5axis-2026-06-13.md). **B1 RESOLVED + 1b BUILT & VERIFIED-CLEAN (2026-06-13, on branch — awaits Andrew iOS smoke).** B1's original "swap to `AudioContext.currentTime`" was RULED OUT via primary sources (WebKit 263627: iOS can freeze `currentTime` while `state==="running"`) + code recon (replay plays decoded `<audio>.currentTime`; persisted audio = AudioContext mixdown→MediaRecorder). Correct fix BUILT: frame-counting captured-audio clock (`getAudioMs`, AudioWorklet + ScriptProcessor fallback) replacing the `performance.now()` `useAudioMsClock`; baseline at recording-start (cumulative across 50-min rollover); iOS no-timeslice path; wedge watchdog banner. **Pipeline:** plan → independent 5-axis → diff review CAUGHT a broken clock (t=0 on iOS / ~30s-behind compounding) + theater tests → Sonnet fix (baseline@recording-start, real fail-before/pass-after tests, + a real prod bug: dead `gainNode.disconnect` that'd kill the clock in Firefox-strict) → independent verify = **VERIFIED-CLEAN** (jest 882/886, only pre-existing SharePage fails; `next build` 0). Through `d63ac22` on `phase1/wb-reliability-floor` (pushed). **iOS DEFERRED-SAFE (Andrew getting hardware; not the live tutor path — pilot tutor records desktop):** added a strict 3-tier clock fallback (AudioWorklet → ScriptProcessor → `performance.now()` last-resort, gated `hasFrameClock===false` so a working frame source can NEVER be shadowed → no pre-1b drift regression). Worst case on iOS now = old status-quo clock, never broken t=0 replay. So iOS smoke is a **tighten-and-confirm pass when hardware arrives, NOT a merge gate.** **MERGE GATE for 1b = Andrew's DESKTOP smoke** (smokebook item 1 + watchdog banner — doable on his Mac/PC, no iPhone): [`phase-1-wb-floor-1b-smokebook-2026-06-13.md`](phase-1-wb-floor-1b-smokebook-2026-06-13.md). Deferred-to-hardware: background-suspend drift, phone-call wedge, timeslice playability, 50-min drift + NOTEs (N-CSP now degrades to perfnow-fallback not broken; ~30-60s watchdog latency; macOS-Safari mime heuristic). **B2/B3 STILL BLOCK 1c** (waiting-mode End/Cancel path + truthful "student waiting" copy — both fold into 1c, no judgment needed). **Recommended order:** Andrew DESKTOP-smokes 1b → merge 1b `--no-ff` → execute 1c with B2+B3 folded → smoke 1c; iOS tighten-pass whenever hardware lands. Phase 1 maps onto Gate A2/A5/A6. **(2)** Gate A→A6 pre-master gates **unchanged** — path to `v1-redesign → master` cut (whiteboard sync completeness, replay fidelity, etc.). **(3)** Optional: deeper local-branch prune (~10 merged non-`v1ds` branches still exist — `v1-component-spine`, `feat/theme-plumbing-a-prime`, `feature/phase-d-landing-about`, `feat/sec-1-design`, `design/recording-rearchitecture`, `docs/road-to-ga`, `cost-observability-design-2026-06-06`, `feature/cost-observability-phase1`, `iac-13-connected-parent-disconnect`, `brand/site-redesign-mocks-2026-06-10` — all merged, safe `-d`). **(4)** Consent v2 thread (BL-A tutor-visible consent, BL-B educational-use toggle) when Andrew prioritizes. |
| **Open Andrew-confirms** | **(c)** student URL keep vs retire · **(d)** learner-swap · **(e)** student camera default · **(f)** C1–C4 before `CONSENT_ENFORCEMENT` flip · **(g)** env scoping at master cut. **Standing:** B2 D-1/D-2/D-5, B1 deferred TODOs, N-2. **Ratified 2026-06-11:** platform→tutor metering = wall-clock (cash + tokens). **Lawyer-needed:** VPC method/copy, retention in /privacy, FERPA/SOPIPA. **Logged for wiring phase (not blocking cut):** waiting room (Gate A2), parent consent-edit (B2 Step 6), scheduler + Google OAuth — visual-only surfaces; design Qs in [`v1-design-system-morning-status-2026-06-12.md`](v1-design-system-morning-status-2026-06-12.md). |
| **In-flight subagents** | **None.** |
| **Uncommitted / unmerged** | **UNMERGED:** branch `phase1/wb-reliability-floor` (off `v1-redesign`, pushed @ `d63ac22`) holds Phase 1 plan + 5-axis + 1b-diff-review + smokebook docs AND the **1b audio-clock implementation + 3-tier iOS-safe fallback (VERIFIED-CLEAN; merge after Andrew DESKTOP smoke — iOS deferred-safe, not a gate)**. `v1-redesign` tree clean, in sync with origin. **NOT yet merged; 1c not started.** |

**Strategic posture (Andrew 2026-06-12, market-review thread):** De-emphasize **publicity-driven re-sequencing** — existing backlog is **~1 month from complete**; remaining work is **re-doing previously-solved problems + validation, not inventing**. Market-analysis PDF + [strategic review companion](../research/market-analysis-strategic-review-2026-06-12.md) committed ([`f885d8a`](https://github.com/Arangarx/tutoring-notes/commit/f885d8a)); its sequencing open-questions (move-X-ahead-of-Wave-6 for pitch optics) are largely **moot** under the ~1-month horizon. **What survives the filter:** (1) **notes _quality_** (not notes-shipped) is a genuine product-quality bar — bad notes that merely *exist* still refute the core wedge; (2) **positioning language** — when we market/pitch, lead with "the session becomes structured, searchable memory" (the moat) + compliance/session-log differentiation, not "we have a whiteboard"; coexist-with-Wyzant (don't trigger anti-disintermediation during pilot). **CRITICAL — reliability is NOT cleared:** the hardest WB problems were solved in prior implementations (so not *novel* risk) BUT WB wiring is **mid-re-hookup** — **two-way sync, student-on-same-board-different-mode, save segmentation, and same-WB-page notes review are all unvalidated/unfinished**; **Gate A5/A6 squarely open.** The de-emphasis applies to *pitch-driven feature sequencing*, **NOT** to reliability validation (the market review's #1 point: a *broken* whiteboard is worse than Zoom+OneNote).

**🧭 Experience-Driven Wedge program (defined 2026-06-12):** A multi-turn strategy brainstorm **refined the compass** (refinement, NOT pivot — original sequencing was market-research-aligned and remains so). The wedge is now named: **experience-driven competition** — WB + reliability = **ground floor (a GATE, earns no applause but blocks everything)**; the WIN = an **accreting, honest, transparent, seamless** experience the **tutor first** (then parent/student) can't imagine working without. **Founding principle (supersedes all): no dark patterns, total honesty + total transparency** — engagement claims are *derived from evidence* with drilldowns; a claim with no backing cannot render. Program: `~/.cursor/plans/experience-driven_wedge_ae2776e1.plan.md` — **Phase 1** WB reliability floor → **Phase 2** continuity engine V1 (tutor carryover loops + "would you agree?" three-state confirm) → **Phase 3** note-quality (the moat) → **Phase 4** first-party learner-type-keyed instrumentation. Engagement/dopamine + parent progress arc + marketplace = **design-compatible-for now, NOT near-term scope**. Full rationale (triple-moat, durability A/B, transparency-as-invariant, deliverability discipline, tutor-first/org/marketplace timing): [continuity-wedge brainstorm](../research/continuity-wedge-brainstorm-2026-06-12.md). **Cadence: rolling-wave** — only the next phase gets detailed; deep-planning ahead is wasted (Andrew + orchestrator ratified). **TODO (out of plan mode):** elevate the founding principle into `AGENTS.md`/a rule.

**Hard-won lesson — CSS `@layer` cascade (RESOLVED 2026-06-12):** Root cause of multiple "unreadable text" bugs: legacy base CSS (`src/app/globals.css` element rules + `src/styles/typography.css`) is **entirely unlayered**, so it beats Tailwind `@layer utilities` regardless of specificity — silently overriding component token/utility colors. One-off fixes landed: `.label-mono` eyebrow → `@layer base`/`:where` + measured `--brand-eyebrow` ([`9783e42`](https://github.com/Arangarx/tutoring-notes/commit/9783e42)); `.heading`/`.ai-prose` rogue `color` stripped so brand-card headline utility wins ([`8c173e2`](https://github.com/Arangarx/tutoring-notes/commit/8c173e2), 10.9:1/6.6:1); eyebrow render flip ([`3ad5a62`](https://github.com/Arangarx/tutoring-notes/commit/3ad5a62), 10.5:1/7.3:1); global `label {}` wrapped in `@layer base` ([`25e3050`](https://github.com/Arangarx/tutoring-notes/commit/25e3050) — CheckboxField centering + every shadcn `<Label>` app-wide). **Systemic end-state** (wrap ALL legacy base CSS in `@layer base`) logged to [`docs/BACKLOG.md`](../BACKLOG.md) under Component-duplication audit (Gate A1) — **not yet done**.

**⚠️ Pre-existing bug (unchanged):** `test:wb-sync` jest half: `sync-client.test.ts › broadcastSignal bypasses the scene throttle` fails deterministically (expects 1 broadcast, gets 2). **`git diff 300ef0b HEAD` for `src/lib/whiteboard/**` is EMPTY** → pre-existing, NOT redesign regression. Route to WB/sync (Phase 4a live-AV) thread. Playwright sync invariants green.

**Process directive (Andrew 2026-06-07):** prefer **agent-runnable validation harnesses** over manual smoke wherever behavior is verifiable without Andrew's hardware.

---

## Branch layering

```
master  ←  v1-redesign  (active base again @ 36727ea+)
          (Gate A +
           re-smoke
           held)

v1-design-system — MERGED into v1-redesign @ 36727ea
                     (branch still exists as ancestor / historical)
```

- **`v1-redesign`:** **Active working base again** (Andrew confirmed off `v1-design-system` smoke, pivoting strategy). Smoke round 1 **8/8 merged** @ [`27ac5db`](https://github.com/Arangarx/tutoring-notes/commit/27ac5db); full design-system epic merged @ [`36727ea`](https://github.com/Arangarx/tutoring-notes/commit/36727ea). **Not yet merged to `master`** — held for full Gate A + comprehensive re-smoke.
- **`v1-design-system`:** Historical — fully merged into `v1-redesign` @ [`36727ea`](https://github.com/Arangarx/tutoring-notes/commit/36727ea). Branch ref still exists locally/remotely as ancestor; no longer the active overnight layer. Branched off `v1-redesign` @ [`1456581`](https://github.com/Arangarx/tutoring-notes/commit/1456581).

**Decisions ledger + sub-pass tracker:** [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — do not duplicate the full ledger here.

---

## Project arc + North Star

Pre-public pilot with one tutor (Sarah). North Star from [`AGENTS.md`](../../AGENTS.md): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."* Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).

---

## Current Wave focus

**Active:** `v1-redesign` working base post design-system merge — **await Andrew strategy pivot.**  
**Imminent:** Gate A→A6 pre-master gates → `v1-redesign → master` cut (comprehensive re-smoke both themes at cut).  
**Wave 1 reliability floor** on `v1-redesign`: whiteboard sync + regression net **done**; SEC-1 **complete**; smoke round 1 **8/8 merged**; design-system epic **merged** @ `36727ea`.

---

## Latest committed state (`v1-redesign`)

| Commit | Summary |
|---|---|
| [`36727ea`](https://github.com/Arangarx/tutoring-notes/commit/36727ea) | **Merge tip** — `v1-design-system` epic into `v1-redesign` (119 files, build green, pushed) |
| [`17ae7dd`](https://github.com/Arangarx/tutoring-notes/commit/17ae7dd) | Delete student button parity — box at rest (post-merge smoke fix) |
| [`25e3050`](https://github.com/Arangarx/tutoring-notes/commit/25e3050) | Systemic `label {}` → `@layer base` (CheckboxField + shadcn Label app-wide) |
| [`9783e42`](https://github.com/Arangarx/tutoring-notes/commit/9783e42) | Eyebrow WCAG — `.label-mono` cascade fix |
| [`27ac5db`](https://github.com/Arangarx/tutoring-notes/commit/27ac5db) | Smoke round 1 complete — 8/8 branches merged |
| [`950d13a`](https://github.com/Arangarx/tutoring-notes/commit/950d13a) | Recording/replay invariant matrix I1–I5/M1–M6 ratified |
| [`1456581`](https://github.com/Arangarx/tutoring-notes/commit/1456581) | Platform→tutor metering = wall-clock (cash + tokens) |
| [`300ef0b`](https://github.com/Arangarx/tutoring-notes/commit/300ef0b) | Frozen v1 component-library foundation (27 primitives) |

---

## In-flight overnight fan-out (Groups A–G)

Surface agents **CONSUME** the frozen library and may **not** edit it (log gaps → consolidated foundation follow-up). Isolated worktrees (`best-of-n-runner`), branched off `300ef0b`, file-disjoint → safe true parallelism. Each merges `--no-ff` into `v1-design-system` with **`npx next build` exit 0** gate between merges.

| Group | Scope | Notes |
|---|---|---|
| **A** | Public/legal/feedback: `/`, `/features`, `/privacy`, `/terms`, `/feedback` | Heavy LEGACY |
| **B** | Parent share: `/s/[token]`, `/s/[token]/all`, `/s/[token]/whiteboard/[wsid]` | Faithful to parent-share mock |
| **C** | Admin/tutor: students, settings, outbox, cost, operator lists | Mocks: student-list, detail, settings |
| **D** | Account/parent: dashboard, children, **new parent consent-edit page** | |
| **E** | Student: `/students/login`, `/join` → **waiting room (Gate A2)**, sub-options page | |
| **F** | Scheduling | Visual-only per [`scheduling-requirements-2026-06-11.md`](scheduling-requirements-2026-06-11.md); net-new, no mock |
| **G** | WB phone-landscape bars-to-left | Sync-fenced; `npm run test:wb-sync`-gated; best-effort |

Auth pages (`/login`, `/signup`, `/account/*` auth, claim flow) already **V1** — minor polish only.

**Whiteboard fence (do NOT touch in visual pass):** `src/lib/whiteboard/**`, `useLiveAV.ts`, `WhiteboardWorkspaceClient.tsx`, `StudentWhiteboardClient.tsx`, recording components, etc. Safe chrome boundary: `src/components/whiteboard/chrome/**` only (Group G exception).

---

## Foundation deferred library gaps

Surface agents need these; log for consolidated foundation follow-up:

- `AdminSidebarNav` composed component **not built** — use `AdminPageShell` `sidebar`/`sidebarWidth` props + §1A.8 patterns.
- `FormattedNotesBody` / `RecapEditor` (B4) **not built**.
- No `rounded-panel` Tailwind alias — use `rounded-[10px]` until config extends.
- Legacy `.btn`/`.card`/`.container` still in `globals.css` — delete only after surfaces migrate.
- `next-themes` dep pulled by shadcn CLI but unused — removable in cleanup pass.
- 27 primitives in `src/components/ui/`; `Providers` mounts `TooltipProvider` + `Toaster` app-wide; `/admin/pending-approval` duplicate-nav fixed.

---

## Recently ratified (on `v1-redesign`, 2026-06-11)

### Recording/replay invariant matrix @ [`950d13a`](https://github.com/Arangarx/tutoring-notes/commit/950d13a)

Canonized in [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md) § Recording & Replay Invariant Matrix (I1–I5/M1–M6). D3/D4 SUPERSEDED/CLARIFIED notes preserve audit trail.

**Fix path B for replay:** build consolidation + restore native single-stream + defer-on-release scrub (M2); **don't polish the stitcher**.

### Platform→tutor metering @ [`1456581`](https://github.com/Arangarx/tutoring-notes/commit/1456581)

**Wall-clock** for both cash + tokens. Distinct from tutor→student billing (already settled). See [`docs/BACKLOG.md`](../BACKLOG.md) § Pricing; break-forgiveness = optional future grace layer.

---

## Parked threads (after the redesign)

| Thread | Notes |
|---|---|
| **Recording consolidation slice** | Fix path B implementing I1–I5/M1–M6 matrix |
| **Map/reduce auto-notes ACCURACY** | Currently poor — own design+eval pass |
| **Student-WB migration steps 3–9** | Flag-gated shell wiring + cutover; needs Andrew confirms: (c) student URL keep/retire, (e) camera default; real 2-device smoke |
| **Learner-swap design** | Learner-scoped tokens, per-learner privacy/consent + notes finalization |
| **VIDEO recording + replay** | Top post-smoke build candidate — designed, not built |
| **A6-1 replay player (R1/R2)** | Multi-segment regression — dedicated fix thread |
| **Live AV (X1)** | Video capture/display broken — dedicated investigation |

---

## Queued dispatches (post design-system merge)

1. **AWAIT Andrew strategy pivot** — next sequencing call
2. Gate A→A6 burndown → comprehensive pre-master smoke (both themes) → `v1-redesign → master` cut
3. Foundation follow-up for deferred library gaps (morning doc § library-gap follow-up)
4. Functional wiring: waiting room (A2), parent consent-edit (B2 Step 6), scheduler + Google OAuth
5. Consent v2 thread (BL-A/BL-B) when prioritized
6. Recording consolidation slice (fix path B)
7. Map/reduce accuracy workstream

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
| **X2** | **v1-design-application via shared components** | **COMPLETE** — merged into `v1-redesign` @ [`36727ea`](https://github.com/Arangarx/tutoring-notes/commit/36727ea) |

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

### Overnight push 2026-06-11 — COMPLETE (smoke + merge to `v1-redesign`)

**Andrew directive (2026-06-11):** drive hard toward V1→master cut. Overnight wave **delivered 8 branches**; smoke round 1 triaged; **all 8 merged to `v1-redesign`** @ [`27ac5db`](https://github.com/Arangarx/tutoring-notes/commit/27ac5db).

| Rule | Detail |
|---|---|
| **Branch discipline** | ✅ Each target on separate branch + smokebook/findings doc |
| **Merge gate** | ✅ Andrew smoke → fixes on branch → `merge --no-ff` to `v1-redesign` (8/8 complete) |
| **Not built overnight (smoke wave)** | VIDEO recording + replay; A2 waiting room; B2 Step 6 parent consent management UI; laser bidirectional; A6 multi-segment player regression fix |

**Component reuse standard (ratified 2026-06-11):** [`V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md) §2.12, [`.cursor/rules/component-reuse.mdc`](../../.cursor/rules/component-reuse.mdc), `BACKLOG.md` audit. `feat/component-dry-mechanical` is the mechanical pass — smoke for no visual drift.

### Pre-master gates — two-tier checklist (RATIFIED Andrew 2026-06-08)

> **Canonical operational list** — `BACKLOG.md`, `RELEASE-ROADMAP.md`, and `v1-redesign-STATUS.md` cross-reference here.

**Vocabulary:** **V1** = master cut (Gate A). **Release** = recruiting new pilots (Gate B era complete).

#### Gate A — blocks master cut

| # | Gate | Status (post smoke-round-1 merge) |
|---|---|---|
| A1 | Visual redesign + chrome + theme + component reuse | **MERGED** @ `36727ea` — full design-system epic on `v1-redesign`; systemic `@layer base` cleanup still in BACKLOG (Gate A1) |
| A2 | Waiting room | **Visual shell merged** (Group E); admit/presence/`getUserMedia` wiring deferred to live-AV thread |
| A3 | Pass-2 in-context end-session | **MERGED** @ `5922c6f` — Phase A functional (E1 fixed); Phase B polish deferred |
| A3a | PDF page-tab indicator | **MERGED** to `v1-redesign` @ `c05d939` |
| A3b | SR-04a video-tile sizing | **MERGED** to `v1-redesign` @ `c05d939` |
| A5 | Live bidirectional sync completeness | **Partial** — tutor→student laser MERGED @ `6f861ea` (L1 fixed; L2/L3 position deferred); student laser deferred |
| A6 | Replay fidelity + AV/timer sync | **Partial** — JSXGraph replay MERGED @ `e150e86`; 🔴 multi-segment player regression (R1/R2, A6-1) **not fixed** |

#### Gate B — post-V1 / pre-release

| # | Gate | Status (post smoke-round-1 merge) |
|---|---|---|
| B1 | Approval-gating / waitlist | **MERGED** @ `f0b9667` — W1/TFA1/W2/W4 fixed |
| B2 | Parent privacy consent | **MERGED** @ `27ac5db` — dormant `CONSENT_ENFORCEMENT`; C1/C2/C3/C4 block flag flip |
| B3 | Security Tier B | **MERGED** @ `6395771` — S1 + SHOULD-FIX-2 option A shipped |
| B4 | Scheduling + calendar | Requirements captured @ `37c114e`; **visual-only IN FLIGHT** (Group F); wiring post-V1 |

**Scope trap:** `Student.recordingDefaultEnabled` ≠ parent privacy consent. See `BACKLOG.md`.

**Cross-domain email collision — RESOLVED (Andrew 2026-06-07):** one email = one account (Option A).

**Open v1 requirements:** Theme-agnostic token-driven components (§2.11); single-source reuse (§2.12). **Notes-login cutover:** no grace — claim Sarah's pilot family before `NOTES_AUTH_WALL=true` at master. **Phase 1 notes-login: MERGED** @ `d3a9e8b`.

**Component pass:** `v1-component-spine` MERGED. **`v1-design-system` overnight build** is the cohesive visual application pass.

**Deferred reliability (slice-3 review):** S3 orphan DRAFT race, N1–N4 → `BACKLOG.md`.

---

**Process directive — runbook legend (Andrew 2026-06-07):** every smoke runbook opens with `[x]` = PASSED; per-target `- [ ] PASS` / `- [ ] FAIL` verdict at end. Embed concrete check items inline.

### ✅ Slice-3 save-bridge — Pass-1 rework MERGED (2026-06-07)

**Pass 1 complete** @ [`0fa2363`](https://github.com/Arangarx/tutoring-notes/commit/0fa2363) → **MERGED `--no-ff` → `v1-redesign` @ [`3f62b58`](https://github.com/Arangarx/tutoring-notes/commit/3f62b58)**. Target A smoke PASS. B4 Save-model LOCKED.

**Pass 2 (session-end UX — Gate A3):** **MERGED** @ `5922c6f` (Phase A; E1 fixed). Pass-1 INTERIM redirect still the fallback when `onSessionEnded` not wired.

**DEFERRED — MUST NOT MISS:** native `confirm()`/`alert()` → in-site modals (component pass); notes quality / Regenerate thread.

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

Recording Q1/Q5/Q6/Q7/Q8, cost Q8, pricing-floor, Vercel-lock OK — see [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md). Platform→tutor metering = wall-clock @ `1456581`. Replay invariant matrix I1–I5/M1–M6 @ `950d13a`.

---

## Parallel standing work (do not lose)

| Thread | Status |
|---|---|
| **v1 design-system overnight (X2)** | **IN FLIGHT** — `v1-design-system` branch, Groups A–G fan-out |
| **Identity / access** | Parent-create-learner + B1 + B2 **merged**; IAC-13 disconnect build open |
| **Replay player (A6-1)** | R1/R2 multi-segment regression — dedicated fix thread |
| **Live AV (X1)** | Video capture/display broken — dedicated investigation |
| **Phase 2 authed session chrome** | Notes page inside parent/child shell — post-overnight |
| **Sarah forward-migration** | `feature/sarah-forward-migration-q6` parked |
| **Master / pilot** | Sarah on `tutoring-notes.vercel.app` |

---

## Pilot context (Sarah — 2026-06-06)

[`sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](sarah-pilot-feedback-2026-06-06-orchestrator-report.md). Laser pointer (B9) merged @ `6f861ea`. **Apple Calendar integration** — Sarah's explicit scheduling request (captured @ `37c114e`).

---

## Open questions still in flight

| Question | Status |
|---|---|
| Two-way calendar sync (webhooks/subscriptions)? | **Unresolved** — see [`scheduling-requirements-2026-06-11.md`](scheduling-requirements-2026-06-11.md) |
| Learner-swap design (d) | Awaiting Andrew |
| Student URL keep vs retire (c) | Awaiting Andrew |
| Student camera default (e) | Awaiting Andrew |
| Map/reduce auto-notes accuracy | Poor today — needs design+eval pass |

---

## How we work (process — pointers only)

- **Orchestration model:** [`AGENTS.md`](../../AGENTS.md) § "Model usage protocol"
- **Dispatch boundary:** [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc)
- **Merging (solo pilot):** smokeable branch → Andrew smoke → `merge --no-ff` into integration branch; WB sync → `npm run test:wb-sync`; build-surface → `npx next build`
- **Overnight constraints:** one tree-writer at a time in main working tree; true parallelism = isolated worktrees; library FROZEN during surface fan-out
- **Commits on Windows/PowerShell:** `.git/COMMIT_MSG_DRAFT.txt` + `git commit -F`

---

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (this file) — **HEAD + merge status + open threads**
3. [`docs/handoff/overnight-v1-design-system-handoff-2026-06-11.md`](overnight-v1-design-system-handoff-2026-06-11.md) — **most current re: overnight run**
4. [`docs/handoff/scheduling-requirements-2026-06-11.md`](scheduling-requirements-2026-06-11.md) — Group F scheduler requirements (visual-only tonight)
5. [`docs/V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md) — frozen library catalog
6. [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — V1 epic ledger
7. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — before touching `handleEndSession`
8. [`docs/handoff/b2-consent-design-2026-06-11.md`](b2-consent-design-2026-06-11.md) — B2 consent design (merged on `v1-redesign`)
9. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)
10. [`docs/BACKLOG.md`](../BACKLOG.md)
11. [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md)

---

## History / audit trail

Updated in place; `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Template: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).

Deep history: `git log --oneline v1-redesign` and `git log --oneline v1-design-system`.
