# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

> **Operating contract (`.cursor/rules/orchestrator-discipline.mdc`, explicit @ [`7341ff9`](https://github.com/Arangarx/tutoring-notes/commit/7341ff9)):** State durability is a **primary reliability obligation**, not a nicety. Andrew offloads project memory to the orchestrator on purpose — at any moment a session can be lost and a fresh orchestrator must resume with **minimal re-guidance** (ideally just "continue"). Keep this file continuously current; treat "I'll update state later" as a silent failure.

---

## ⏩ HEAD — 2026-06-11 overnight v1 design-system build (`v1-design-system`)

| Field | Value |
|---|---|
| **Last action completed** | **Post-review TWEAK WAVE merged + pushed** — 4 isolated Composer worktrees (T1+consent-copy, T8+schedule-nav+S1+S2, T6+T7, T3+T4+T5) merged `--no-ff` zero-conflict, combined `next build` exit 0, pushed `cf595f6..6587592`. T2 accent-recipe + docs/smokebook agents dispatched (in-flight). See "✅ Tweak wave DONE" row. **Prior:** **A11y fix (X7) — dark-mode coral CTA dark text** @ [`e31ea76`](https://github.com/Arangarx/tutoring-notes/commit/e31ea76) (+ backlog ref `0147965`), pushed. Root cause was NOT a token regression (tokens unchanged; `--accent-on` dark in both themes) — it was ad-hoc coral CTAs built as `Button asChild`+`<Link>` inheriting body text via `globals.css` `a{color:inherit}`, plus manual `rounded-full` pills. Fixed single-source: new **`Button variant="accent"`** coral-pill, `globals` link-inherit guard, 18 call sites migrated, jest guards 27/27; **X7 closed** + documented (`V1-COMPONENT-LIBRARY.md` §1A.1, `UX-AND-A11Y-SPEC.md`). **Prior:** **OVERNIGHT v1 DESIGN-SYSTEM RUN COMPLETE — all 7 groups A–G merged `--no-ff` + build-gated + pushed** to `v1-design-system`. Merge-train tip after G: [`287aa3d`](https://github.com/Arangarx/tutoring-notes/commit/287aa3d) (A–F combined `next build` exit 0 @ [`20f175d`](https://github.com/Arangarx/tutoring-notes/commit/20f175d), 41 static pages; G CSS-only @ [`11ad38e`](https://github.com/Arangarx/tutoring-notes/commit/11ad38e), WB gate `test:wb-playwright` 13/13 green in main repo). Branches: A `67df02e`, B `fd201af`, C `2b46345`, D `851f243`, E `18eaccf`, F `7c839f8`, G `11ad38e`. Only conflict was `AdminNav.tsx` (C's `buildNavLinks` helper kept + F's Schedule link folded in). **Morning status doc** @ [`bb70897`](https://github.com/Arangarx/tutoring-notes/commit/bb70897) → [`v1-design-system-morning-status-2026-06-12.md`](v1-design-system-morning-status-2026-06-12.md) (G section + bottom line patched post-merge). Foundation `300ef0b`; scheduling reqs `37c114e`; state restructure `0bfe4b1`. |
| **Next action(s)** | **(0) IN PROGRESS:** when the 2 background agents report — merge the **docs** branch (`v1ds/tweak-wave-docs`) `--no-ff` (docs-only, safe) + push; **do NOT merge** the **T2 accent-recipe** branch — leave it for Andrew to review the per-surface table and approve/trim in the morning. **(1)** Andrew morning review of `v1-design-system` preview (tweak wave + base redesign) + the T2 accent proposal branch. **(2)** Andrew morning review of every surface on the `v1-design-system` Vercel preview: `https://tutoring-notes-git-v1-design-system-arangarx-5209s-projects.vercel.app` (branch alias, confirmed via Vercel MCP). **(2)** Andrew answers consolidated design Qs (scheduler ×5, consent ×6, student ×4 — in morning doc). **(3)** After review: integrate `v1-design-system` → `v1-redesign`, plan functional-wiring threads for the 3 visual-only surfaces (waiting-room/Gate A2, consent-edit/B2 Step 6, scheduler+Google-OAuth). Library remains **FROZEN** pending a foundation follow-up that absorbs the gap list (morning doc § library-gap follow-up). |
| **Open Andrew-confirms** | **NEW from fan-out (visual-only, need Andrew calls):** waiting room (Gate A2, Group E) admit/presence/`getUserMedia` wiring deferred to live-AV thread; parent consent-edit page (Group D, B2 Step 6) save is visual-only; scheduler (Group F) fully visual-only — morning doc has F's 5 design Qs + D's 6 consent-UX Qs + E's 4 student Qs. **STILL OPEN:** (c) student URL keep vs retire; (d) learner-swap; (e) student camera default; (f) C1–C4 before `CONSENT_ENFORCEMENT`; (g) env scoping at master cut. Standing: B2 D-1/D-2/D-5, B1 deferred TODOs, N-2. **RATIFIED 2026-06-11:** platform→tutor metering = wall-clock (cash + tokens). Lawyer-needed: VPC method/copy, retention in /privacy, FERPA/SOPIPA. |
| **In-flight subagents (2026-06-12 ~03:40)** | **2 best-of-n-runner worktrees (Composer), branched from `v1-design-system` @ `6587592`, background.** **T2 proposal** [accent-recipe](755363e3-c01a-4ae0-a15c-3594dd43894a) = fuller Mynka-blue accent recipe on flat surfaces, branch `v1ds/accent-recipe-proposal` — built but **left UNMERGED for Andrew morning approval** (per-surface table owed). **Docs** [tweak-wave-docs](508e2068-e99a-4cab-ae68-e1236e40ca66) = ✅ DONE + merged `--no-ff` + pushed (tip now `d0cb983`): morning-status updated, `V1-COMPONENT-LIBRARY.md` synced (max-w-6xl, CheckboxField, --avatar-N), new smokebook [`v1ds-tweak-wave-smokebook-2026-06-12.md`](v1ds-tweak-wave-smokebook-2026-06-12.md) (11 items, template-compliant). **Logged for wiring phase:** S3 (Agenda as default tab/landing), S4 (Month won't scale 8+/day). |
| **✅ Tweak wave DONE (2026-06-12 ~03:40)** | All 4 tweak worktrees (T1+consent-copy / T8+schedule-nav+S1+S2+S3/S4-docs / T6+T7 / T3+T4+T5) merged `--no-ff` into `v1-design-system` with **ZERO conflicts** (disjoint file sets), combined `npx next build` **exit 0** (all routes), pushed `cf595f6..6587592`. Merge tip **6587592**. Per-branch: account `95669a5`, admin-shell-scheduler `861bfdb`, student-detail `b57de9e` (4/4 DOM test, fenced files untouched), primitives-email `6036b8d`. Coral CTAs now use `Button variant="accent"`; consent copy clarified; StudentAvatar deterministic `--avatar-N`; new shared `CheckboxField`. |
| **Uncommitted / unmerged** | **None uncommitted** (untracked `.jest-config-dump.json` throwaway). `v1-design-system` @ tip `6587592` (tweak wave) pushed to origin. **Unmerged on purpose:** `v1ds/accent-recipe-proposal` (T2 — awaits Andrew approval). **Docs branch** `v1ds/tweak-wave-docs` to merge when its agent reports. **Stale worktrees** (`v1ds-tweak-*`, `v1ds-admin-*`, `v1ds-tweaks-*` + prior group worktrees) sweep-eligible after review. Branch layering: **`master`** ← **`v1-redesign`** (held for Gate A + re-smoke) ← **`v1-design-system`** (all 7 groups merged). **Parked:** `feature/sarah-forward-migration-q6` @ `a396ab5`. **Per-group worktrees** (`v1ds-group-*`, `group-g-*`) remain — stale-sweep eligible after Andrew review. |
| **⚠️ Pre-existing bug logged** | `test:wb-sync` jest half: `sync-client.test.ts › broadcastSignal bypasses the scene throttle (Phase 4a webrtc-signal)` fails deterministically (expects 1 broadcast, gets 2). **`git diff 300ef0b HEAD` for `src/lib/whiteboard/**` is EMPTY** → pre-existing on foundation, NOT a redesign regression. **Route to WB/sync (Phase 4a live-AV) thread.** Real-browser Playwright sync invariants are all green. |

**Andrew directive (2026-06-11 overnight):** By morning, produce a single branch with the **entire site** redesigned into the v1 look & feel from a **frozen canonical component library**. Maximize breadth/coverage; he reviews every surface in the morning. Explicitly **not** WB-sync work (low regression risk).

**Process directive (Andrew 2026-06-07):** prefer **agent-runnable validation harnesses** over manual smoke wherever behavior is verifiable without Andrew's hardware.

---

## Branch layering

```
master  ←  v1-redesign  ←  v1-design-system
          (Gate A +      (tonight's full-site
           re-smoke       v1 design-system layer;
           held)          created off v1-redesign @ 1456581)
```

- **`v1-redesign`:** Active V1 integration branch; smoke round 1 **8/8 merged** @ [`27ac5db`](https://github.com/Arangarx/tutoring-notes/commit/27ac5db). **Not yet merged to `master`** — held for full Gate A + comprehensive re-smoke.
- **`v1-design-system`:** Overnight redesign layer branched off `v1-redesign` @ [`1456581`](https://github.com/Arangarx/tutoring-notes/commit/1456581). All overnight surface work merges here for Andrew's morning review, then eventually merges into `v1-redesign`.

**Decisions ledger + sub-pass tracker:** [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — do not duplicate the full ledger here.

---

## Project arc + North Star

Pre-public pilot with one tutor (Sarah). North Star from [`AGENTS.md`](../../AGENTS.md): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."* Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).

---

## Current Wave focus

**Active:** Overnight full-site v1 design-system build on `v1-design-system` (library-first, coverage-over-caution).  
**Imminent after morning review:** Andrew comprehensive re-smoke of merged `v1-redesign` + integration of `v1-design-system` layer.  
**Wave 1 reliability floor** on `v1-redesign`: whiteboard sync + regression net **done**; SEC-1 **complete**; smoke round 1 **8/8 merged**.

---

## Latest committed state (`v1-design-system`)

| Commit | Summary |
|---|---|
| [`20f175d`](https://github.com/Arangarx/tutoring-notes/commit/20f175d) | **Merge train tip** — Groups A–F merged `--no-ff`; combined `next build` green (41 pages); pushed |
| [`0bfe4b1`](https://github.com/Arangarx/tutoring-notes/commit/0bfe4b1) | Heavy ORCHESTRATOR-STATE restructure (overnight thread active) |
| [`37c114e`](https://github.com/Arangarx/tutoring-notes/commit/37c114e) | Scheduling requirements capture + BACKLOG § Scheduling expand |
| [`7341ff9`](https://github.com/Arangarx/tutoring-notes/commit/7341ff9) | State-durability operating contract explicit |
| [`06f4dc3`](https://github.com/Arangarx/tutoring-notes/commit/06f4dc3) | Overnight v1-design-system bootstrap handoff |
| [`300ef0b`](https://github.com/Arangarx/tutoring-notes/commit/300ef0b) | Frozen v1 component-library foundation (27 primitives, build gate green) |

**On `v1-redesign` (recent, not on design-system branch yet):**

| Commit | Summary |
|---|---|
| [`950d13a`](https://github.com/Arangarx/tutoring-notes/commit/950d13a) | Recording/replay invariant matrix I1–I5/M1–M6 ratified |
| [`1456581`](https://github.com/Arangarx/tutoring-notes/commit/1456581) | Platform→tutor metering = wall-clock (cash + tokens) |

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

## Queued dispatches (post fan-out)

1. Final `next build` gate + morning status doc (every surface: done/partial + logged library gaps)
2. Andrew morning review of all surfaces on `v1-design-system`
3. Merge `v1-design-system` → `v1-redesign` (after Andrew approval)
4. Foundation follow-up for deferred library gaps
5. Recording consolidation slice (fix path B)
6. Map/reduce accuracy workstream

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
| **X2** | **v1-design-application via shared components** — **IN FLIGHT** as overnight `v1-design-system` build | Was "likely next major thread"; now active overnight run |

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
| A1 | Visual redesign + chrome + theme + component reuse | Desktop WB chrome DONE; mobile chrome merged; **component DRY MERGED** @ `f6e2f23`; **X2 IN FLIGHT** as `v1-design-system` overnight build |
| A2 | Waiting room | **Designed; IN FLIGHT** as Group E overnight build |
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
