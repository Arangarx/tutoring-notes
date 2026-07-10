# BATCH F extraction — v1 redesign / design-system / brand / UX

> **Worktree:** `tutoring-notes-merge-audio` · branch `chore/doc-cleanup-master`  
> **Generated:** 2026-07-09  
> **Sources:** 11 handoff/design docs (v1 redesign spine, component redesign spec, gap inventory, design-system overnight/morning status, tokens plan, reliability redesign UX surfaces, DRY smokebook, A′ theme smoke, preview-badge smoke).  
> **Verification:** `src/` grep + `docs/V1-COMPONENT-LIBRARY.md` + `docs/BACKLOG.md` on tip of merge-audio worktree.

---

## CARRY table

| Item | Area | Priority | Evidence | Source doc |
|------|------|----------|----------|------------|
| **Gate A1 — cohesive visual review + mock-faithful composition** | Pre-master / UX | **P0** | Andrew-confirms still open in `v1-redesign-STATUS.md` HEAD; BACKLOG Gate A1 rows. `v1-design-gap-inventory` counted **0 FULL** surfaces (2026-06-11); tip has `AdminSidebarNav` / `ParentShareShell` but many WB/review/2FA paths still legacy `.card`/`.btn` (e.g. `admin/settings/2fa/setup/page.tsx`, `SessionReviewMode.tsx`, `WorkspaceResumeGate.tsx`). | `v1-redesign-STATUS.md`, `v1-design-gap-inventory-2026-06-11.md`, `BACKLOG.md` § Gate A |
| **X2 — v1 design via shared components (DRY + apply everywhere)** | Component library | **P0** | BACKLOG meta row; gap inventory §2 duplication kill-list still applies (`ParentShareNoteCard` vs admin notes vs expanded body — no unified `NoteCard`). | `v1-design-gap-inventory-2026-06-11.md`, `BACKLOG.md` |
| **REQ-S3-1 — Formatted markdown for auto-notes (`.ai-prose`)** | Notes / B4 | **P1** | `FormattedNotesBody` / `RecapEditor` **not in `src/`** (grep 0). `V1-COMPONENT-LIBRARY.md` §1 still "planned". `TutorNotesSection.tsx` handles legacy markdown path, not canonical renderer. | `v1-redesign-STATUS.md`, `V1-COMPONENT-LIBRARY.md` §3.1 |
| **REQ-S3-2 — Post-session Save notes + Cancel/delete session** | Notes / B4 | **P1** | Requirement open in STATUS + library Chunk 3; no `RecapEditor` save/discard affordances shipped. Cross-ref BACKLOG end-session discard (SSG-2) — related but distinct surface. | `v1-redesign-STATUS.md`, `v1-component-redesign-design-2026-05-31.md` §5.5 |
| **REQ-S3-2a — Define "Save notes" semantics** | Product / B4 design | **P1** | Explicit OPEN in STATUS — server-generated `TutorNote` vs legacy `SessionNote` commit semantics unresolved. | `v1-redesign-STATUS.md` |
| **REQ-S3-4 — Canonical notes schema (no field drops; Plan mandatory)** | Notes / AI | **P1** | STATUS + library §3.1; slice-3 map-reduce shape still diverges from `NewNoteForm` fields until B4 design locks schema. | `v1-redesign-STATUS.md`, `V1-COMPONENT-LIBRARY.md` |
| **Chunks B3–B6 — session log, replay detail, workspace solo, student mobile** | Component pass | **P1** | `V1-COMPONENT-LIBRARY.md` §3 tracker: B3–B6 **PENDING**; routes still `/admin/students/.../whiteboard/...` not `/sessions/[id]`. Session log export (`slg`/`exp` prefixes) not registered in AGENTS. | `v1-component-redesign-design-2026-05-31.md` §7, `V1-COMPONENT-LIBRARY.md` |
| **Phase C — IA/URL restructure + 301 redirects** | IA / routes | **P1** | Ratified Q-1–Q-3 but **not implemented**: `next.config.ts` has **no** `redirects()`; `/w/[joinToken]` still primary student join; `/s/[token]` parent share. | `v1-component-redesign-design-2026-05-31.md` §2, `RELIABILITY-REDESIGN-2026-05-27.md` Surface 4 |
| **L3 — Student WB chrome parity (`/w/[joinToken]`)** | Whiteboard chrome | **P1** | Gap inventory P0; student join path has **no** `mynk-wb-chrome` / `WbStatusPill` (grep on `src/app/w`). BACKLOG X2/L6. Tutor chrome exists on `WhiteboardWorkspaceClient`. | `v1-design-gap-inventory-2026-06-11.md`, `BACKLOG.md` |
| **TFA2 — 2FA setup/verify pages v1 redesign** | Auth / settings | **P1** | `admin/settings/2fa/setup/page.tsx` still `className="card"`; `TwoFactorSetupForm.tsx` uses `dark:` variants (lines ~181–191) — fails §2.11 token-only gate + System-mode debt. BACKLOG smoke-round-1. | `v1-design-gap-inventory-2026-06-11.md`, `BACKLOG.md` |
| **Gate A2 waiting room — functional wiring beyond visual** | Session lifecycle | **P1** | `WaitingRoomOverlay.tsx` shipped on workspace (functional tutor path); morning status Group E `/join` + prefs were **VISUAL-ONLY** with follow-up list (presence, admit, `getUserMedia`, persistence). `/join` routes exist (`src/app/join/**`) — verify against Gate A2 acceptance in ORCHESTRATOR-STATE, not just mock. | `v1-design-system-morning-status-2026-06-12.md`, `v1-redesign-STATUS.md` Gate A |
| **Gate A3 — Pass-2 in-context end-session / review shell** | Whiteboard UX | **P1** | BACKLOG Gate A3; `SessionReviewMode.tsx` still legacy `.card`/`.btn`. Design spec §5.6 defers to shell flip — not mock-faithful. | `v1-redesign-STATUS.md`, `BACKLOG.md`, `v1-component-redesign-design-2026-05-31.md` |
| **Component-duplication + `@layer base` CSS cleanup** | Tokens / cascade | **P1** | BACKLOG Gate A1 sub-item (2026-06-12): unlayered `globals.css`/`typography.css` beats Tailwind utilities; legacy `.btn`/`.card` remain in `globals.css` with **30+** consumer files in `src/`. | `BACKLOG.md`, `overnight-v1-design-system-handoff-2026-06-11.md` |
| **`dark:` → semantic token migration (incl. core primitives)** | Theme | **P1** | A′ smoke explicitly deferred (`SMOKE-RUNBOOK-A-prime-theme`); **~10** component files still use `dark:` (e.g. `TwoFactorSetupForm`, `claim/setup`, `dev-tools`). `DESIGN-TOKENS-PLAN.md` + library §2.11. | `SMOKE-RUNBOOK-A-prime-theme-2026-06-08.md`, `V1-COMPONENT-LIBRARY.md` |
| **TU-12 / Excalidraw theme follows app `data-theme`** | Whiteboard theme | **P1** | `DESIGN-TOKENS-PLAN.md` out-of-scope note → pre-master; BACKLOG points to V1 pre-master row. Excalidraw still OS-theme coupled per A′ smoke. | `DESIGN-TOKENS-PLAN.md`, `BACKLOG.md` |
| **REQ-S3-3 — Identity chip + test-account badge (complete)** | Shell / nav | **P2** | **Partial:** `AdminSidebarNav.tsx` shows email + initials + **Imp** when impersonating; `ImpersonationBanner` separate. **Missing:** explicit test-account badge when viewing as test shell; not on auth/marketing shells per library §1A.12. | `v1-redesign-STATUS.md`, `V1-COMPONENT-LIBRARY.md` |
| **T2 — accent-recipe pass (not merged)** | Visual polish | **P2** | Morning status: proposal branch `v1ds/accent-recipe-proposal` awaiting Andrew approval. | `v1-design-system-morning-status-2026-06-12.md` |
| **Foundation pass — promote surface-local shells to library** | Component library | **P2** | Morning status §Consolidated library-gap: `PublicDocumentShell`, `ParentShareShell`, `StudentDetailShell`, `SettingsNavList`, etc. still surface-local vs frozen `ui/*` catalog. | `v1-design-system-morning-status-2026-06-12.md`, `V1-COMPONENT-LIBRARY.md` |
| **Missing primitives (Chip, SheetMenuRow, iOS SettingsRow, week grid, sync Badge)** | Component library | **P2** | Morning status §(b); gap inventory §2.2 P1–P3 build list partly addressed (e.g. `CheckboxField` shipped T4) but list largely open. | `v1-design-system-morning-status-2026-06-12.md`, `v1-design-gap-inventory-2026-06-11.md` |
| **Tailwind aliases `rounded-panel`, `border-strong`** | Tokens config | **P2** | Morning status §(c); surfaces still use `rounded-[10px]` per overnight handoff deferred gaps. | `overnight-v1-design-system-handoff-2026-06-11.md` |
| **MarketingHeader inline styles → primitives** | Marketing | **P2** | Group A left-for-Andrew follow-up; `LandingPageContent.tsx` exists but hero still heavy inline style per gap inventory `/` row (pre-tweak; re-verify on tip). | `v1-design-system-morning-status-2026-06-12.md` |
| **L6 — Connected/sync status pill (`WbStatusPill`)** | WB chrome | **P2** | BACKLOG; student `StudentWhiteboardClient` legacy inline pills per gap inventory. | `BACKLOG.md`, `v1-design-gap-inventory-2026-06-11.md` |
| **X3 — AV pip on/off clarity** | A/V chrome | **P2** | BACKLOG smoke-round-1; tutor `WbAVCluster` vs student floating controls split. | `BACKLOG.md` |
| **PreSessionPanel / StartWhiteboardSession mock alignment** | Session start UX | **P2** | Gap inventory P1; X7 resolved for button color but panel layout still PARTIAL vs mock. | `v1-design-gap-inventory-2026-06-11.md`, `BACKLOG.md` |
| **Scheduler Group F — functional wiring (post-visual)** | Scheduling | **P2** | `/admin/schedule` + integrations UI shipped visual-only (`SchedulePageClient.tsx`); BACKLOG § Scheduling post-V1 pre-release; open Qs in morning status + `scheduling-requirements-2026-06-11.md`. | `v1-design-system-morning-status-2026-06-12.md`, `overnight-v1-design-system-handoff-2026-06-11.md` |
| **Parent consent editor — save wiring (Group D)** | Consent UX | **P2** | Morning status: `/account/children/[id]/consent` loads real rows but **save VISUAL-ONLY** (no POST). Gate B2 separate thread. | `v1-design-system-morning-status-2026-06-12.md` |
| **Cohesive pass open questions from Chunk 1** | Settings UX | **P2** | §2.10 #1 settings sub-nav — **partially shipped** (`SettingsSubNav.tsx`); #2 density/hierarchy, #4 color variety, #5 warning amber — library §2.14 resolutions exist but Gate A1 not signed off. #6 input validation-state coloring — **OPEN** product question. | `v1-redesign-STATUS.md`, `V1-COMPONENT-LIBRARY.md` §2.10–2.14 |
| **Auth password primitive — 8 credential forms** | Auth | **P2** | B1 acceptance in component redesign §7; BACKLOG B2 smoke + component redesign auth-form unification — drift across reset/change-password/PIN/claim. | `v1-component-redesign-design-2026-05-31.md` §7, `BACKLOG.md` |
| **Error/legal/public shells — legacy cleanup** | Public UX | **P2** | `not-found.tsx`, `error.tsx`, `feedback` — gap inventory OLD/PARTIAL; privacy/terms may be reskinned (no `.card` on privacy @ tip) — error routes still legacy. | `v1-design-gap-inventory-2026-06-11.md` |
| **Session-lifecycle redesign brief (auto-record + timer)** | Product / FSM | **P2** | STATUS §2026-06-02 — design brief only, not built; P0 timeline semantics ratified but implementation UNVERIFIED. Out of pure design-system but carried from spine. | `v1-redesign-STATUS.md` |
| **Solo / in-person production enable + B-5 consent copy** | Session mode | **P2** | RELIABILITY Surface 6 + component §5.11; FSM supports `sessionMode` but production gating/consent copy review called out as B-5 acceptance. | `RELIABILITY-REDESIGN-2026-05-27.md`, `v1-component-redesign-design-2026-05-31.md` §6 B-5 |
| **Time-storage / billing display (`billed*Local` frozen)** | Session log data | **P2** | RELIABILITY Surface 7 + §5.4 immutability — schema may exist on tip but **B3 UI** `/sessions` route not shipped. | `RELIABILITY-REDESIGN-2026-05-27.md`, `v1-component-redesign-design-2026-05-31.md` §5.4 |
| **T9 — Theme toggle on signup pages** | Theme UX | **P3** | BACKLOG v1 design-system smoke follow-ups; `/signup` has no `ThemeToggle` (grep 0) while `AdminNav` has it. | `BACKLOG.md` § v1 design-system smoke follow-ups |
| **T10 — Per-tutor names collapsible subsection** | Parent UX | **P3** | BACKLOG design-system smoke follow-ups. | `BACKLOG.md` |
| **BG2 — Students roster search inner effect** | Admin polish | **P3** | BACKLOG — intent unclear, needs Andrew clarification. | `BACKLOG.md` |
| **Consent floor-block checkbox contrast** | A11y polish | **P3** | BACKLOG pre-existing; CheckboxField shipped but floor-block contrast called out. | `BACKLOG.md` |
| **Impersonation pip clarity (mask icon / click-to-exit)** | Shell polish | **P3** | BACKLOG; sidebar shows "Imp" text only. | `BACKLOG.md` |
| **2FA inline verify-at-login (not separate page)** | Auth UX | **P3** | BACKLOG design-system smoke — distinct from TFA2 setup page. | `BACKLOG.md` |
| **Parents marketing page (Phase D v2 backlog)** | Marketing | **P3** | Component redesign §7 Phase D v2 table — parent-targeted page backlogged. | `v1-component-redesign-design-2026-05-31.md` |
| **Open scheduler/consent/student prefs design questions** | Product | **P3** | Morning status §Open design questions (month vs week grid, consent tab labels, `/join/preferences` vs `/students/settings`, etc.). | `v1-design-system-morning-status-2026-06-12.md` |
| **Log prefixes `slg` / `exp` registration** | Observability | **P3** | Component redesign §10 — must land before B3; not in AGENTS registry on tip (verify at B3 dispatch). | `v1-component-redesign-design-2026-05-31.md` §10 |
| **Per-org `data-org` theming (university pilot)** | Tokens | **P3** | `DESIGN-TOKENS-PLAN.md` §Per-org bonus — enabled after Phase 0 (shipped) but not productized. | `DESIGN-TOKENS-PLAN.md` |
| **Spacing/radius/motion tokens** | Tokens | **P3** | `DESIGN-TOKENS-PLAN.md` explicit out-of-scope; radius partial via `rounded-[10px]`. | `DESIGN-TOKENS-PLAN.md` |

---

## Already-in-backlog list

Cross-check `docs/BACKLOG.md` — these OPEN items from BATCH F sources are **already tracked** (do not duplicate as new backlog rows):

| BACKLOG ID / section | Overlaps BATCH F item |
|---------------------|----------------------|
| **Gate A1 — Visual redesign + theme parity** | Cohesive review, both-theme gate, whiteboard chrome cross-ref |
| **Gate A1 — Component-duplication audit + `@layer` cleanup** | X2, legacy `.btn`/`.card`, cascade fix |
| **Gate A2 — Waiting room** | Group E visual + functional follow-ups |
| **Gate A3 — Pass-2 in-context end-session** | SessionReviewMode / shell flip |
| **Gate A3a/b** (PDF tab icon, SR-04a tiles) | Deferred wb-chrome items referenced from redesign gate |
| **v1-design-application via shared components (X2)** | Gap inventory meta workstream |
| **TFA2** | 2FA setup page redesign |
| **L6** | Connected/status pill |
| **X3** | AV pip clarity |
| ~~**X7**~~ | Continue button color — **RESOLVED** `e31ea76` |
| **§ v1 design-system smoke follow-ups (2026-06-12)** | T9, T10, BG2, consent checkbox contrast, 2FA inline verify, impersonation pip, operator login, pricing strategy |
| **BL-A / BL-B / F1** | Consent v2 tutor visibility + educational-use toggle + allowLiveSession framing |
| **§ Scheduling + external calendar** | Group F visual + requirements doc |
| **§ Component redesign — B2 smoke (2026-06-01)** | NewNoteForm clear bugs, outbox responsive, a11y id/name, bold-on-teal verify |
| **Auth-form unification (8 credential forms)** | B1 acceptance / password primitive |
| **Excalidraw theme / TU-12** (whiteboard queue cross-ref) | App-theme sync for canvas |
| **End-session discard / SSG-2** | Related to REQ-S3-2 Cancel semantics (distinct anchor) |
| **Freedraw latency PR-01** | P1.1 — pre-master but wb-chrome thread, not design-system doc batch |

---

## Shipped / obsolete list

| Item | Verdict | Evidence |
|------|---------|----------|
| **Phase 0 design tokens (`tokens.css`)** | **SHIPPED** | `src/styles/tokens.css` — Mynka Blue light/dark, no `#7c5cff`; `DESIGN-TOKENS-PLAN.md` marks SHIPPED 2026-05-27 |
| **Phase A — dark Mynka Blue + fonts** | **SHIPPED** | `src/app/fonts.ts` (Fraunces/Inter/JetBrains); dark palette in tokens; library Chunk A @ `5aa3c7d` |
| **Phase B1 — Tailwind 4 + shadcn + auth surfaces** | **SHIPPED** | `AuthShell`, `ui/*` catalog; library @ `b798494` |
| **Phase B2 — dashboard/students reskin floor** | **SHIPPED** | Merged `0424206`; `AdminPageShell`, `StudentsRoster` |
| **A′ theme plumbing + `ThemeToggle`** | **SHIPPED** | `ThemeToggle.tsx` in `AdminNav`/`AdminSidebarNav`; smoke runbook **GREEN** merge 2026-06-08 |
| **OAuth notice above Connect Gmail** | **SHIPPED** | `OAuthEmailSection.tsx` — `AuthMortensenNotice` before `Button` (T5 / §2.14 #3) |
| **`CheckboxField` + email TLS toggle migration** | **SHIPPED** | `ui/checkbox.tsx` + morning status T4 |
| **`StudentAvatar` FNV-1a palette** | **SHIPPED** | `StudentAvatar.tsx` + morning status T3 |
| **v1-design-system Groups A–G surface fan-out** | **SHIPPED** (visual) | `AdminSidebarNav`, `SettingsSubNav`, `StudentDetailShell`, `ParentShareShell`, `/admin/schedule`, Group G CSS @ `11ad38e` per morning status |
| **Phase D landing + `/features`** | **SHIPPED** (pending brand sign-off) | `LandingPageContent.tsx`, `/features`; v2 copy decisions in component doc §7 |
| **Q-1–Q-10 URL/OAuth/stack ratifications** | **OBSOLETE as open questions** | Locked in component redesign §8 — do not re-litigate |
| **Component-pass review protocol (chunk vs cohesive)** | **SHIPPED process** | STATUS 2026-06-07 + library §3 — still authoritative |
| **Overnight foundation @ `300ef0b` (27 ui primitives)** | **SHIPPED** | `V1-COMPONENT-LIBRARY.md` §1 inventory |
| **Preview branch badge feature** | **SHIPPED** (feature-complete) | Separate from redesign; smokebook documents verification only |
| **Component DRY mechanical branch (`feat/component-dry-mechanical`)** | **OBSOLETE as branch smoke** | Utilities merged or superseded; smokebook checklist historical if branch merged |
| **`v1-redesign-bootstrapper.md` §3 snapshot (2026-05-31)** | **OBSOLETE** | Branch SHAs, BLOCKERs (2FA merge, umbrella deploy) superseded by STATUS + ORCHESTRATOR-STATE |
| **Gap inventory "0 FULL surfaces" baseline** | **PARTIALLY OBSOLETE** | Pre–`v1-design-system` audit; tip is ahead on admin/marketing/share — do not treat counts as current without re-audit |
| **Dark mode = legacy purple** | **OBSOLETE** | Component redesign §1 gap table — fixed in Phase A |
| **Fonts "never implemented"** | **OBSOLETE** | `fonts.ts` + `typography.css` on tip |
| **Nav redesign "NOT pulled forward" decision** | **SHIPPED policy** | Admin sidebar landed; decision remains valid — don't spin standalone nav pass |

---

## Per-doc archive note table

| Doc | Safe to archive? | Unique info that must survive + where |
|-----|------------------|--------------------------------------|
| `docs/handoff/v1-redesign-STATUS.md` | **No** — trim only | **Keep living spine** until `v1-redesign → master`; durable gates → `ORCHESTRATOR-STATE.md` § Pre-master; REQ-S3-* → `V1-COMPONENT-LIBRARY.md` §3.1 (already mirrored). Archive only after master cut + HEAD migrated. |
| `docs/handoff/v1-redesign-bootstrapper.md` | **Yes** (after extract) | Opus orchestrator onboarding superseded by `ORCHESTRATOR-STATE.md` + discipline rule. No unique open items beyond STATUS. |
| `docs/handoff/v1-component-redesign-design-2026-05-31.md` | **No** — protected spec | Per-surface B1–D specs, §6 five-axis, §7 phased plan, §8 ratified Q&A. **Do not archive** until B3–C shipped or spec folded into `V1-COMPONENT-LIBRARY.md` §5. |
| `docs/handoff/v1-design-gap-inventory-2026-06-11.md` | **Yes** (after extract) | Surface FULL/PARTIAL/OLD matrix + X2 sequencing → captured in this EXTRACT-F CARRY + `V1-COMPONENT-LIBRARY.md` §5 checklist. Re-run audit before major merge, not keep doc alive. |
| `docs/handoff/v1-design-system-morning-status-2026-06-12.md` | **Yes** (after extract) | Merge train SHAs, Group A–G done table, tweak wave T1–T8, library-gap list, open design Qs → this EXTRACT-F + BACKLOG scheduling/consent sections. |
| `docs/handoff/overnight-v1-design-system-handoff-2026-06-11.md` | **Yes** (after extract) | Locked decisions (library-first, WB fence, scheduling intent) → `AGENTS.md` / `V1-COMPONENT-LIBRARY.md` / `scheduling-requirements-2026-06-11.md`. Process notes (one tree-writer) already in orchestrator discipline. |
| `docs/DESIGN-TOKENS-PLAN.md` | **No** — protected plan | Phase 0 done statement + token taxonomy + per-org pattern + A′/TU-12 cross-refs. Keep until `dark:` debt closed and TU-12 shipped. |
| `docs/RELIABILITY-REDESIGN-2026-05-27.md` | **No** — cross-cutting | Surfaces 4–7 (URL, mobile student, solo, session log) inform open CARRY; wave structure in `RELEASE-ROADMAP.md`. Archive only after waves absorbed into STATUS/ROADMAP. |
| `docs/handoff/component-dry-mechanical-smokebook-2026-06-11.md` | **Yes** | Branch-specific smoke checklist; durable utilities → `src/lib/notes/display-utils.ts`, `useThemeDropdown.ts` (verify on tip). No open redesign items. |
| `docs/handoff/SMOKE-RUNBOOK-A-prime-theme-2026-06-08.md` | **Yes** | A′ **merged GREEN** — historical smoke + System-mode gotcha. Standing requirement → BACKLOG Gate A1 + library §2.11. |
| `docs/handoff/preview-branch-badge-smokebook-2026-06-14.md` | **Yes** | Feature smoke for `feat/preview-branch-badge`; unrelated to redesign carry. Preview badge behavior is shipped product docs if needed in `LOCAL-DEV.md`/`DEPLOY.md` one-liner. |

---

## Notes for orchestrator

1. **Tip codebase is ahead of June handoff docs** — always verify with `src/` grep, not inventory alone (e.g. `AdminSidebarNav`, `ParentShareShell`, `WaitingRoomOverlay`, privacy reskin).
2. **Gate A1 is the umbrella** — most BATCH F CARRY rows roll up to cohesive visual + shared-component completion, not individual doc threads.
3. **Do not archive** `v1-component-redesign-design-2026-05-31.md`, `DESIGN-TOKENS-PLAN.md`, or living `v1-redesign-STATUS.md` until master cut; protected list in `MANIFEST.md` already covers `V1-COMPONENT-LIBRARY.md`, `BRAND.md`, `UX-AND-A11Y-SPEC.md`.
