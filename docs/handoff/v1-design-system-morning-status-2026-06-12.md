# Morning status — full-site v1 design-system build (`v1-design-system`)

**Created:** 2026-06-12 (morning handoff after overnight fan-out)
**For:** Andrew (morning surface review) + any fresh orchestrator chat picking up post-overnight.
**Read order:** [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (HEAD section) → **this doc** → [`overnight-v1-design-system-handoff-2026-06-11.md`](overnight-v1-design-system-handoff-2026-06-11.md) (overnight context) → [`V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md).

---

## Header

| Field | Value |
|---|---|
| **Branch** | `v1-design-system` |
| **Tip commit** | [`f932c06`](https://github.com/Arangarx/tutoring-notes/commit/f932c06) (merge train + state head) |
| **Merge-train build commit** | [`20f175d`](https://github.com/Arangarx/tutoring-notes/commit/20f175d) |
| **Build gate** | Combined `npx next build` **exit 0** — **41 static pages**, full route table. Only pre-existing whiteboard/recording ESLint warnings (fenced files untouched). |
| **Branch layering** | `master` ← `v1-redesign` (held) ← `v1-design-system` |
| **Preview** | [tutoring-notes-git-v1-design-system](https://tutoring-notes-git-v1-design-system-arangarx-5209s-projects.vercel.app) — branch alias (always tracks latest `v1-design-system` push; confirmed via Vercel MCP `list_deployments`, `meta.branchAlias` for `githubCommitRef=v1-design-system`). Latest deploy `d4a6e75` was BUILDING at handoff — give it a minute. |

---

## Foundation

Frozen component-library foundation @ [`300ef0b`](https://github.com/Arangarx/tutoring-notes/commit/300ef0b) — **27 primitives** in `src/components/ui/`, `next build` green at foundation land.

Surface fan-out **consumed** the frozen library; the library was **not edited** during Groups A–F. Gaps discovered during surface work are logged below under [Consolidated library-gap follow-up](#consolidated-library-gap-follow-up).

---

## Per-surface results

### Summary table

| Group | Scope | Status | Commit |
|---|---|---|---|
| **A** | Public / legal / feedback | **DONE** | [`67df02e`](https://github.com/Arangarx/tutoring-notes/commit/67df02e) |
| **B** | Parent share | **DONE** | [`fd201af`](https://github.com/Arangarx/tutoring-notes/commit/fd201af) |
| **C** | Admin / tutor | **DONE** | [`2b46345`](https://github.com/Arangarx/tutoring-notes/commit/2b46345) |
| **D** | Account / parent | **DONE** | [`851f243`](https://github.com/Arangarx/tutoring-notes/commit/851f243) |
| **E** | Student | **DONE** | [`18eaccf`](https://github.com/Arangarx/tutoring-notes/commit/18eaccf) |
| **F** | Scheduler | **DONE** (visual-only) | [`7c839f8`](https://github.com/Arangarx/tutoring-notes/commit/7c839f8) |
| **G** | WB phone-landscape bars-to-left | **PENDING** | — |

---

### Group A — public / legal / feedback @ [`67df02e`](https://github.com/Arangarx/tutoring-notes/commit/67df02e)

**Routes:** `/`, `/features`, `/privacy`, `/terms`, `/feedback` — all **DONE**.

- Legal copy preserved **verbatim** (visual/layout reskin only; "Last updated: May 31, 2026" intact).
- Updated `SiteFooter` (+ added missing Feedback link).

**Left for Andrew:**
- Browser pass on legal pages mobile (long prose in Card).
- `MarketingHeader` still inline-styles (follow-up polish).

---

### Group B — parent share @ [`fd201af`](https://github.com/Arangarx/tutoring-notes/commit/fd201af)

**Routes:**
- `/s/[token]`, `/s/[token]/all` — **DONE** (faithful to parent-share mock).
- `/s/[token]/whiteboard/[wsid]` — **chrome-only** (replay player fenced/untouched).

**New / reskinned components:** `ParentShareShell`; reskinned `ParentShareNoteCard`, `NotesSearchBar`, `PageSizeSelect`.

**Tests:** 10/10 DOM tests pass.

**Left for Andrew:**
- Phone-portrait smoke.
- Replay player internal controls remain legacy (intentional fence).

---

### Group C — admin / tutor @ [`2b46345`](https://github.com/Arangarx/tutoring-notes/commit/2b46345)

**Routes (all DONE, mocks faithful):**
- `/admin/students`, `/admin/students/[id]` (+ `notes`)
- `/admin/settings/**`
- `/admin/outbox`, `/admin/cost`, `/admin`
- Operator lists (`/admin/feedback`, `/admin/tutor-approvals`, `/admin/dev-tools`, etc.)
- `2fa/setup` + `verify` — visual-only

**UX patterns shipped:** FAB + sheet roster, mobile bottom tabs + sticky CTA + overflow sheet, iOS settings list.

**New surface-local components:** `AdminSidebarNav`, `StudentDetailShell`, `SettingsNavList`, `SettingsSubNav`, `StudentOverflowActions`.

---

### Group D — account / parent @ [`851f243`](https://github.com/Arangarx/tutoring-notes/commit/851f243)

**Routes:**
- `/account/dashboard` — **DONE**
- `/account/children/[id]` (+ `notes` + `devices`) — **DONE**
- **NEW** `/account/children/[id]/consent` (B2 Step 6) — loads real per-tutor `ConsentRecord` / `ConsentRestriction` but **save is VISUAL-ONLY** (no POST route; `CONSENT_ENFORCEMENT` untouched; self-learner bypass shown).

**New route-local components:** `AccountChildNav`, `ParentConsentEditor`.

---

### Group E — student @ [`18eaccf`](https://github.com/Arangarx/tutoring-notes/commit/18eaccf)

**Routes:**
- `/students/login` — minor polish
- `/join` — now the **Gate A2 waiting room (VISUAL-ONLY)**; `?preview=admitted` toggles admitted visual
- **NEW** `/join/preferences` — visual-only

**New components:** `StudentPageShell`, `LearnerWaitingRoom`, `StudentDevicePreview`, `StudentPreferencesClient`.

**Waiting-room functional follow-up (live-AV thread):**
- Presence detection
- Tutor admit → session transition
- Real `getUserMedia` device preview
- Poll/subscribe to session start/admit
- Prefs persistence to `LearnerProfile`
- Eventual unify with tutor session shell

---

### Group F — scheduler @ [`7c839f8`](https://github.com/Arangarx/tutoring-notes/commit/7c839f8)

**Routes (NEW, VISUAL-ONLY):**
- `/admin/schedule` — month/agenda calendar, per-event sync badges, create-session dialog
- `/admin/settings/integrations` — Apple/Google/Other connect UI

**No OAuth / DB / server actions** — placeholder data only.

**Nav wired:** `AdminNav` "Schedule" link + Settings "Calendar integrations" entry.

**Requirements model:** Backs [`scheduling-requirements-2026-06-11.md`](scheduling-requirements-2026-06-11.md) — native-first, connect-calendar affordance, per-event sync state, integrations area; two-way sync flagged open.

---

### Group G — WB phone-landscape bars-to-left — SHIPPED + MERGED

**SHIPPED** @ [`11ad38e`](https://github.com/Arangarx/tutoring-notes/commit/11ad38e), merged `--no-ff` into `v1-design-system` (merge commit [`287aa3d`](https://github.com/Arangarx/tutoring-notes/commit/287aa3d)). **CSS-only — touched only** `whiteboard-chrome.css` (fence-compliant).

On phone-landscape (`data-layout="phone-landscape"`, e.g. 844×390): tier-1 tools move to a **44px left vertical rail** (bottom toolbar hidden), props bar becomes a **compact canvas chip** (top-left), board tabs pin bottom with a 44px left inset past the rail. Matches the mobile mock intent.

**WB gate (run in main repo):** `npx next build` exit 0; **`test:wb-playwright` 13 passed / 1 skipped** (all live-sync invariants green — invariant 8 PDF pre-existing skip). G's CSS change provably does not affect live sync.

> ⚠️ **Pre-existing failure logged (NOT caused by tonight's work):** `test:wb-sync` jest half has 1 deterministic failure — `src/__tests__/whiteboard/sync-client.test.ts › broadcastSignal bypasses the scene throttle (Phase 4a webrtc-signal envelope)` (expects 1 server-broadcast, receives 2). **`git diff 300ef0b HEAD` for `src/lib/whiteboard/**` + the sync test is EMPTY** — the code under test is byte-identical to the foundation, so this fails identically on `300ef0b`/`v1-redesign` independent of the redesign merges or G's CSS. **Action:** route to the WB/sync (Phase 4a live-AV) thread; do NOT treat as a redesign blocker.

**Left for WB thread:** real-device phone-landscape smoke (rail visibility, props-chip tap, board-tab overlap); student shell if it adopts `LiveBoardChrome`; popover/sheet anchoring in the vertical rail; the props-chip "hide label" rule targets `> span:last-child` (fragile if the fenced `WhiteboardWorkspaceClient` markup changes).

---

## Merge train notes

Six branches merged `--no-ff` into `v1-design-system` in order: **A, B, D, E, C, F**.

| Order | Group | Commit |
|---|---|---|
| 1 | A | [`67df02e`](https://github.com/Arangarx/tutoring-notes/commit/67df02e) |
| 2 | B | [`fd201af`](https://github.com/Arangarx/tutoring-notes/commit/fd201af) |
| 3 | D | [`851f243`](https://github.com/Arangarx/tutoring-notes/commit/851f243) |
| 4 | E | [`18eaccf`](https://github.com/Arangarx/tutoring-notes/commit/18eaccf) |
| 5 | C | [`2b46345`](https://github.com/Arangarx/tutoring-notes/commit/2b46345) |
| 6 | F | [`7c839f8`](https://github.com/Arangarx/tutoring-notes/commit/7c839f8) |

**Only conflict:** `src/components/AdminNav.tsx` — C's `buildNavLinks()` helper vs F's inlined Schedule link. Resolved by keeping C's helper and folding F's `{ href: "/admin/schedule", label: "Schedule" }` into it. Settings index auto-merged cleanly (both C reskin + F integrations entry survive).

**Merge commit:** [`20f175d`](https://github.com/Arangarx/tutoring-notes/commit/20f175d).

---

## Consolidated library-gap follow-up

For a future **foundation pass** — the big actionable list after Andrew's morning review.

### (a) Composed shells/components to promote to library

| Surface-local component | Notes |
|---|---|
| `PublicDocumentShell` | Public/legal pages |
| `ParentShareShell` | Parent share routes |
| `StudentDetailShell` | Admin student detail |
| `AdminSidebarNav` | Admin sidebar |
| `SettingsNavList` / `SettingsSubNav` | Merge into one parameterized settings-nav |
| `AccountChildNav` | Parent account child routes |
| `ParentConsentEditor` | Consent edit page |
| `StudentPageShell` (`LearnerPageShell`) | Student routes |
| `StudentDevicePreview` (`LearnerDevicePreview`) | Waiting room / prefs |

### (b) Missing primitives

- `Chip` / `ActionChip`
- `SheetMenuRow`
- iOS `SettingsRow`
- `CalendarProviderIcon`
- Semantic sync-status `Badge` variant
- Coral pill CTA `Button` variant
- Week/time-grid calendar view

### (c) Tailwind aliases missing

- `rounded-panel` — surfaces used `rounded-[10px]`
- `border-strong` — surfaces used `border-ring`

### (d) Misc

- `StudentAvatar` lives under `admin/` (awkward for learner surfaces — rename/realm-neutral move)
- Radix `Select` doesn't submit `FormData` natively (hidden-input workaround in feedback)
- Legacy `.btn` / `.card` / `.container` still in `globals.css` (final cleanup once grep shows zero usages)
- `MarketingHeader` still inline-styles
- `NoteEntrySection` double-card on mobile (cosmetic)

---

## Open design questions for Andrew

### Scheduler (Group F)

1. Month + day vs week time-grid?
2. Integrations standalone page vs inline panel (both exist now)?
3. Schedule-row "Start session" deep-link target?
4. Sync-badge vocabulary ("Synced" vs "Pushed to Google")?
5. Connect-button placement when OAuth lands?

### Consent (Group D)

1. Tab label — Privacy / Consent / Data sharing?
2. Child-restrictions same page vs advanced section?
3. Per-tutor accordion expanded vs collapsed-with-summary?
4. Save per-tutor vs global atomic?
5. No-tutor placeholder UX?
6. Multi-tutor notes explainer?

### Student (Group E)

1. Prefs route — `/join/preferences` vs `/students/settings`?
2. Student camera default (self-view off? confirm w/ Sarah)?
3. Post-admit redirect target?
4. Learner name editing — here vs parent-only?

---

## Bottom line

**All seven groups A–G** shipped, merged `--no-ff`, build-green, and pushed to `v1-design-system` (tip after G merge: [`287aa3d`](https://github.com/Arangarx/tutoring-notes/commit/287aa3d)). All new feature surfaces (waiting room, consent editor, scheduler) are **VISUAL-ONLY** pending Andrew's design calls + functional wiring threads. One **pre-existing** WB sync-client jest failure logged for the Phase 4a thread (not a redesign regression — see Group G).

**Andrew's morning job:** review every surface on the [`v1-design-system` preview](https://tutoring-notes-git-v1-design-system-arangarx-5209s-projects.vercel.app), answer the design questions above, and decide merge/cut timing relative to `v1-redesign` and `master`.

**Library remains FROZEN** until a dedicated foundation follow-up pass absorbs the gap list above.
