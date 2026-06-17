# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

> **Operating contract (`.cursor/rules/orchestrator-discipline.mdc`, explicit @ [`7341ff9`](https://github.com/Arangarx/tutoring-notes/commit/7341ff9)):** State durability is a **primary reliability obligation**, not a nicety. Andrew offloads project memory to the orchestrator on purpose — at any moment a session can be lost and a fresh orchestrator must resume with **minimal re-guidance** (ideally just "continue"). Keep this file continuously current; treat "I'll update state later" as a silent failure.

---

## ⏩ HEAD — 2026-06-17 P2 student shell AWAITS SMOKE; parity rework DONE + adversarial N-fixes landed

| Field | Value |
|---|---|
| **Last action completed (2026-06-17)** | **P2 parity rework DONE** @ [`b7dbe0c`](https://github.com/Arangarx/tutoring-notes/commit/b7dbe0c) + **adversarial review** (0 BLOCKERs). **M1 consent** → proceed-as-is; P3 consent-consolidation captured in [`phase-3-waiting-room-plan-2026-06-16.md`](phase-3-waiting-room-plan-2026-06-16.md) + [`BACKLOG.md`](../BACKLOG.md). **N-fixes:** N2 Exit disconnects sync + A/V mesh; N1 `canSwitchPage` drives `BoardTabStrip` read-only; N4 dead `onRemoteScene` subscriber removed. Smokebook updated with verified preview alias + Exit-disconnect item. Gates green; pushed on `phase2/wb-student-new-shell`. |
| **Next action(s)** | **Andrew smoke** [`phase-2-student-new-shell-smokebook-2026-06-16.md`](phase-2-student-new-shell-smokebook-2026-06-16.md) on [branch preview](https://tutoring-notes-git-phase2-wb-stu-9fb9ae-arangarx-5209s-projects.vercel.app) → on PASS **`merge --no-ff`** `phase2/wb-student-new-shell` into `v1-redesign`. Then **(1b) P3 PLAN dispatch** ([`58ca872`](https://github.com/Arangarx/tutoring-notes/commit/58ca872)/[`0c92644`](https://github.com/Arangarx/tutoring-notes/commit/0c92644)) after greenlight. **(2)** `phase1/wb-reliability-floor` @ `d63ac22` — merge after Andrew **DESKTOP** smoke. **(3)** Ship-to-Sarah gate (SSG-1/2/3, F1). **Deferred post-master (BACKLOG):** WB-DRY-VIEWPORT, WB-REVIEW-TRANSITION, WB-IMPERSONATION-SESSION, WB-ERASE-RELIABILITY, WB-NEW-SESSION-FALSE-RECOVERY, WB-COMPONENTS-PASS, WB-AV-VIDEO-PAINT-REAL-FIX, WB / site composition + de-duplication audit, **WB-D6** student asset inserts. |
| **Open Andrew-confirms** | **P2 smoke PASS** on Exit-disconnect + full parity checklist → merge to `v1-redesign`. *(Prior resolved 2026-06-14/16 unchanged — see body.)* |
| **In-flight subagents** | **None** (N-fix pass complete). |
| **Uncommitted / unmerged** | **SMOKEABLE:** `phase2/wb-student-new-shell` — parity rework + N-fixes; awaiting Andrew smoke → `merge --no-ff` into `v1-redesign`. **ONE other unmerged feature branch:** `phase1/wb-reliability-floor` @ `d63ac22`. |
| **P1 replay-in-frame (MERGED 2026-06-16 — thread CLOSED)** | **MERGED** `phase1/wb-review-correct` → `v1-redesign` @ [`f68053c`](https://github.com/Arangarx/tutoring-notes/commit/f68053c). In-frame unified review + replay timeline scrubber + full A/V fix chain. Video-paint **RESOLVED** — bandaid @ [`1cc268d`](https://github.com/Arangarx/tutoring-notes/commit/1cc268d) (= [`3b996ae`](https://github.com/Arangarx/tutoring-notes/commit/3b996ae) AV code). Pre-merge: build green, wb-sync green, jest 659/659 @ [`6440ea7`](https://github.com/Arangarx/tutoring-notes/commit/6440ea7). Smokebook [`phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md`](phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md) — Andrew actively entering results (**do NOT edit**). Branch preserved for cleanup. |
| **P2 student-on-new-shell (AWAITS SMOKE 2026-06-17)** | Parity rework @ [`b7dbe0c`](https://github.com/Arangarx/tutoring-notes/commit/b7dbe0c) + N-fixes (Exit disconnect, capability-driven page strip, dead subscriber rm). Smokebook [`phase-2-student-new-shell-smokebook-2026-06-16.md`](phase-2-student-new-shell-smokebook-2026-06-16.md). **On smoke PASS → `merge --no-ff` into `v1-redesign`.** |
| **Ship-to-Sarah gate (CONFIRMED by Andrew 2026-06-16)** | Andrew wants to swap Sarah off `master` ("old & busted") onto the `v1-redesign`/`phase1` line **once waiting room → WB → end session is stable for tutor AND student — backend data pipeline INCLUDED** (per-segment flush + per-chunk transcription reliably producing notes, not just UI flow). Triggered by Sarah's 2026-06-16 prod chat (3 bugs; capture [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md) @ [`931e8f7`](https://github.com/Arangarx/tutoring-notes/commit/931e8f7); BACKLOG SSG-1/2/3 + F1 elevated). **Confirmed gate items:** **(1)** notes — legacy monolithic "Generate notes from session" path GONE from new surface (the button she clicked), per-chunk auto-notes the only path, verify up-to-50-min-segment transcribes clean; exact "too large to split" error structurally avoided (residual >25MB-per-segment risk = backlog SSG-1). **(2)** End/Continue on **student-detail open-sessions list** never silently deletes recording — save-then-end or explicit "Discard" label+behavior (SSG-2 / F1; `endStaleWhiteboardSession` currently stamps `endedAt` w/o flush). **(3)** single-segment seek (her actual case) works at EVERY review entry point she'd use — incl. not landing on the unfixed legacy standalone `WhiteboardReplay` (fix-for-single-seg or route to in-frame). **Multi-segment (>50-min) seek EXPLICITLY DEFERRED by Andrew → backlog SSG-3 only.** Items 1–3 fold into P2/P3 + a targeted backend pass; NOT separate threads. **Pre-master smoke deferral (Andrew 2026-06-16): relaxed strict "smoke-all-before-master" — some items OK post-master, but data-loss/security/backup-recorder items stay PRE-MASTER (not deferred).** Durable ledger [`pre-master-smoke-deferral-ledger-2026-06-16.md`](pre-master-smoke-deferral-ledger-2026-06-16.md) @ [`b7b2071`](https://github.com/Arangarx/tutoring-notes/commit/b7b2071) (35 keep / 11 defer-safe / 5 already-deferred). **Borderlines RESOLVED (Andrew 2026-06-16):** (a) MAP-ACC notes *quality* → DEFER post-master but it's the **#1 post-master follow-up — start immediately at cut** so Sarah generates feedback + real examples to tune against; (b) A1 freedraw latency → DEFER ("doesn't feel like an issue right now, we'll see") — watch, not a blocker. |
| **Live-A/V tutor video regression (RESOLVED 2026-06-16)** | **CLOSED — bandaid shipped @ [`1cc268d`](https://github.com/Arangarx/tutoring-notes/commit/1cc268d)** (merged @ `f68053c`). [`caaabf2`](https://github.com/Arangarx/tutoring-notes/commit/caaabf2) CSS-only fix failed on-device; Mechanisms A+B from [`3b996ae`](https://github.com/Arangarx/tutoring-notes/commit/3b996ae) restored. LV-1 + LV-2 satisfied (byte-identical to Andrew-confirmed checkpoint). Real fix → **WB-AV-VIDEO-PAINT-REAL-FIX** backlog. |

**Strategic posture (Andrew 2026-06-12, market-review thread):** De-emphasize **publicity-driven re-sequencing** — existing backlog is **~1 month from complete**; remaining work is **re-doing previously-solved problems + validation, not inventing**. Market-analysis PDF + [strategic review companion](../research/market-analysis-strategic-review-2026-06-12.md) committed ([`f885d8a`](https://github.com/Arangarx/tutoring-notes/commit/f885d8a)); its sequencing open-questions (move-X-ahead-of-Wave-6 for pitch optics) are largely **moot** under the ~1-month horizon. **What survives the filter:** (1) **notes _quality_** (not notes-shipped) is a genuine product-quality bar — bad notes that merely *exist* still refute the core wedge; (2) **positioning language** — when we market/pitch, lead with "the session becomes structured, searchable memory" (the moat) + compliance/session-log differentiation, not "we have a whiteboard"; coexist-with-Wyzant (don't trigger anti-disintermediation during pilot). **CRITICAL — reliability is NOT cleared:** the hardest WB problems were solved in prior implementations (so not *novel* risk) BUT WB wiring is **mid-re-hookup** — **two-way sync, student-on-same-board-different-mode, save segmentation, and same-WB-page notes review are all unvalidated/unfinished**; **Gate A5/A6 squarely open.** The de-emphasis applies to *pitch-driven feature sequencing*, **NOT** to reliability validation (the market review's #1 point: a *broken* whiteboard is worse than Zoom+OneNote).

**🧭 Experience-Driven Wedge program (defined 2026-06-12):** A multi-turn strategy brainstorm **refined the compass** (refinement, NOT pivot — original sequencing was market-research-aligned and remains so). The wedge is now named: **experience-driven competition** — WB + reliability = **ground floor (a GATE, earns no applause but blocks everything)**; the WIN = an **accreting, honest, transparent, seamless** experience the **tutor first** (then parent/student) can't imagine working without. **Founding principle (supersedes all): no dark patterns, total honesty + total transparency** — engagement claims are *derived from evidence* with drilldowns; a claim with no backing cannot render. Program: `~/.cursor/plans/experience-driven_wedge_ae2776e1.plan.md` — **Phase 1** WB reliability floor → **Phase 2** continuity engine V1 (tutor carryover loops + "would you agree?" three-state confirm) → **Phase 3** note-quality (the moat) → **Phase 4** first-party learner-type-keyed instrumentation. Engagement/dopamine + parent progress arc + marketplace = **design-compatible-for now, NOT near-term scope**. Full rationale (triple-moat, durability A/B, transparency-as-invariant, deliverability discipline, tutor-first/org/marketplace timing): [continuity-wedge brainstorm](../research/continuity-wedge-brainstorm-2026-06-12.md). **Cadence: rolling-wave** — only the next phase gets detailed; deep-planning ahead is wasted (Andrew + orchestrator ratified). **TODO (out of plan mode):** elevate the founding principle into `AGENTS.md`/a rule.

**Hard-won lesson — CSS `@layer` cascade (RESOLVED 2026-06-12):** Root cause of multiple "unreadable text" bugs: legacy base CSS (`src/app/globals.css` element rules + `src/styles/typography.css`) is **entirely unlayered**, so it beats Tailwind `@layer utilities` regardless of specificity — silently overriding component token/utility colors. One-off fixes landed: `.label-mono` eyebrow → `@layer base`/`:where` + measured `--brand-eyebrow` ([`9783e42`](https://github.com/Arangarx/tutoring-notes/commit/9783e42)); `.heading`/`.ai-prose` rogue `color` stripped so brand-card headline utility wins ([`8c173e2`](https://github.com/Arangarx/tutoring-notes/commit/8c173e2), 10.9:1/6.6:1); eyebrow render flip ([`3ad5a62`](https://github.com/Arangarx/tutoring-notes/commit/3ad5a62), 10.5:1/7.3:1); global `label {}` wrapped in `@layer base` ([`25e3050`](https://github.com/Arangarx/tutoring-notes/commit/25e3050) — CheckboxField centering + every shadcn `<Label>` app-wide). **Systemic end-state** (wrap ALL legacy base CSS in `@layer base`) logged to [`docs/BACKLOG.md`](../BACKLOG.md) under Component-duplication audit (Gate A1) — **not yet done**.

**⚠️ Pre-existing bug (unchanged):** `test:wb-sync` jest half: `sync-client.test.ts › broadcastSignal bypasses the scene throttle` fails deterministically (expects 1 broadcast, gets 2). **`git diff 300ef0b HEAD` for `src/lib/whiteboard/**` is EMPTY** → pre-existing, NOT redesign regression. Route to WB/sync (Phase 4a live-AV) thread. Playwright sync invariants green.

**Process directive (Andrew 2026-06-07):** prefer **agent-runnable validation harnesses** over manual smoke wherever behavior is verifiable without Andrew's hardware.

**Hard-won lesson — RSC cookie-write no-op masked by fail-closed catch (2026-06-14, 2FA remember-device):** The trusted-device login-skip silently never fired in prod despite green jest. Root cause: it re-minted the session via `cookies().set()` **inside a Server Component page render**, which **throws in Next 15** ("cookies only modifiable in a Server Action / Route Handler") — and that throw was **swallowed by the feature's own fail-closed try-catch**, so the skip just returned false forever with no error surfaced. Jest could not reproduce it (no RSC cookie-write restriction in the test env) → same class as the jsdom layout blind-spot. **Rules:** (1) **never write cookies / mutate auth session from an RSC render** — only Server Actions, Route Handlers, or middleware; a page that needs to set a cookie must redirect to a handler. (2) A **fail-closed catch can hide a wiring bug as "working safely"** — when a security/skip path can fail closed, add a test that asserts the SUCCESS path actually fires (cookie set on the response), not just that failure denies. (3) Verify auth cookie/session behavior on a **real runtime** (Route Handler test or live preview), never jest alone.

**Hard-won lesson — flag-gated feature + test-injected flag = synthetic green (2026-06-17, P2 student shell):** The new student shell passed every gate incl. `test:wb-sync`, yet on Andrew's smoke students still hit the LEGACY page. Root cause: the real route `/w/[joinToken]/page.tsx` gated the new shell on `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL` (unset on Preview/prod), and `test:wb-sync` only reached the new path because Playwright's `webServer` injected the flag — so green proved the shell works WHEN flagged, never that the **default route** was wired. **Rules:** (1) a test that injects a feature flag does NOT prove the production default — add an assertion against the route's **flag-unset** behavior, or verify the entry-point file directly. (2) Orchestrator: treat "executor says the gate passed" with suspicion for **headline-route wiring** — open the page/route the user actually hits and confirm it renders the new thing; green alone is necessary, not sufficient. (3) For one-way migrations, prefer a **hard switch over a flag** (Andrew's call) — a flag you never intend to turn off is just an un-exercised legacy path waiting to ship by default.

**Product decisions (Andrew 2026-06-14):** **(1) Live WB stays SINGLE-TAB by default** — no auto-opening the fullscreen board in a separate tab; the WB tab is the live recorder (audio + sync + upload outbox); separate tab raises accidental-close risk and — critically on iOS Safari (Sarah) — background-tab suspension wedges the AudioContext/recorder (the 1b wedge failure mode). Separate-tab = possible FUTURE desktop-only opt-in, never a mobile default (BL-WB-SEPARATE-TAB-OPTIN). **(2) WB wordmark → student detail page** — while a session is LIVE the wordmark is a guarded leave-session action (confirm / route via end-session), not free nav (BL-WB-WORDMARK-NAV).

**Process directive (Andrew 2026-06-14) — preview links come in PAIRS:** when surfacing a branch's preview (chat or smokebook), give **two** links: (1) the **always-works per-branch Vercel branch alias** (`tutoring-notes-git-<slug>-...vercel.app`, fetched via Vercel MCP `list_deployments` → `meta.branchAlias` — never guessed) and (2) the **stable `https://preview.usemynk.com`** which lands Andrew already-logged-in *once he's repointed it to that branch* (preview-SSO via the usemynk.com subdomain cookie carry-over). The alias is the safe fallback + the only option during multi-branch smoke parties; the stable domain is the stay-logged-in convenience for single-branch focus.

---

## Branch layering

```
master  ←  v1-redesign  (active base @ f68053c; P1 merged, P2 in flight)
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

**Active:** `v1-redesign` @ [`f68053c`](https://github.com/Arangarx/tutoring-notes/commit/f68053c) — Phase 1 replay-in-frame **merged**; Phase 2 student-on-new-shell **executing** on `phase2/wb-student-new-shell`.  
**Imminent:** P2 smoke + merge; `phase1/wb-reliability-floor` desktop smoke → merge; Gate A→A6 → `v1-redesign → master` cut.  
**Wave 1 reliability floor:** P1 in-frame review **merged**; student shell migration **in flight**; design-system epic **merged** @ `36727ea`.

---

## Latest committed state (`v1-redesign`)

| Commit | Summary |
|---|---|
| [`f68053c`](https://github.com/Arangarx/tutoring-notes/commit/f68053c) | **Merge tip** — `phase1/wb-review-correct` into `v1-redesign` (P1 replay-in-frame; build + wb-sync + jest 659/659 green, pushed) |
| [`36727ea`](https://github.com/Arangarx/tutoring-notes/commit/36727ea) | `v1-design-system` epic into `v1-redesign` (119 files, build green) |
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
| **Student-WB migration steps 3–9** | P2 **in flight** on `phase2/wb-student-new-shell`; (c) KEEP hybrid + (e) self-view ON **resolved** @ [`71b2c3e`](https://github.com/Arangarx/tutoring-notes/commit/71b2c3e); real 2-device smoke owed post-impl |
| **Learner-swap design** | Learner-scoped tokens, per-learner privacy/consent + notes finalization |
| **VIDEO recording + replay** | Top post-smoke build candidate — designed, not built |
| **A6-1 replay player (R1/R2)** | Multi-segment regression — dedicated fix thread |
| **Live AV (X1)** | Tutor remote-video paint **resolved** @ P1 merge (bandaid); student-shell A/V validation in P2 |

---

## Queued dispatches (post design-system merge)

1. **P2 student-on-new-shell** — executor in flight on `phase2/wb-student-new-shell`
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
| **Live AV (X1)** | Tutor remote-video paint **resolved** @ P1 merge (bandaid); student-shell A/V validation in P2 |
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
| Student URL keep vs retire (c) | **RESOLVED** — KEEP hybrid @ [`71b2c3e`](https://github.com/Arangarx/tutoring-notes/commit/71b2c3e) |
| Student camera default (e) | **RESOLVED** — self-view ON @ [`71b2c3e`](https://github.com/Arangarx/tutoring-notes/commit/71b2c3e) |
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
