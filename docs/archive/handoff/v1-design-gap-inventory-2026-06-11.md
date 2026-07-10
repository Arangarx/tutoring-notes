# V1 design gap inventory — complete user-facing surface audit

**Date:** 2026-06-11  
**Branch:** `v1-redesign` (read-only audit; no production code changed)  
**Purpose:** Planning artifact for the **X2** workstream — *finish v1 design via shared components* ([`smoke-round-1-findings-2026-06-11.md`](smoke-round-1-findings-2026-06-11.md) **X2**).  
**Design source of truth:** [`docs/brand-previews/site-redesign-mocks-2026-06-10-INDEX.md`](../brand-previews/site-redesign-mocks-2026-06-10-INDEX.md) + referenced HTML mocks + [`whiteboard-mobile-mock-2026-06-10.html`](../brand-previews/whiteboard-mobile-mock-2026-06-10.html).  
**Component contract:** [`docs/V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md) (esp. §2.12 no-duplication) + [`.cursor/rules/component-reuse.mdc`](../../.cursor/rules/component-reuse.mdc).

### Status legend

| Status | Meaning |
|---|---|
| **FULL** | Mock-faithful composition; v1 shared primitives + tokens throughout; no legacy `.btn`/`.card` chrome on the surface. |
| **PARTIAL** | Some v1 shells/primitives (`AuthShell`, `AdminPageShell`, shadcn `ui/*`, token classes) but mixed legacy styling, wrong layout vs mock, or child components still OLD. |
| **OLD** | Predominantly `globals.css` `.btn`/`.card`, inline `style={{}}`, or pre-redesign chrome; not mock-aligned. |
| **UNKNOWN** | Could not classify from static code alone (needs browser smoke). |

### Executive counts

| Status | Route/error surfaces | Key sub-surfaces (non-route) |
|---|---|---|
| **FULL** | **0** | **0** |
| **PARTIAL** | **27** | **6** |
| **OLD** | **19** | **5** |
| **UNKNOWN** | **0** | **1** (WB waiting-room mode — not built) |
| **Total** | **46** | **12** noted below |

> **Andrew directive encoded:** No surface is “done” until shared components compose it — a token reskin on a legacy layout is **PARTIAL**, not FULL ([**X2**](smoke-round-1-findings-2026-06-11.md)).

---

## 1. Surface-by-surface inventory

### 1.1 Marketing & public legal

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` → `LandingPageContent.tsx` | **PARTIAL** | `MarketingHeader`, `Button`, token CSS vars; heavy inline `style={{}}` on hero/sections; not mock hero (“Session notes that write themselves”) | Phase D mock composition; extract `ValuePropCard` to shared marketing primitives; coral CTA pair |
| `/features` | `src/app/features/page.tsx` | **PARTIAL** | `MarketingHeader`, `MynkWordmark`, `Button`; inline styles not `MarketingPageShell` | Same marketing primitive stack as `/`; feature grid per mock |
| `/privacy` | `src/app/privacy/page.tsx` | **OLD** | `className="card"`, prose inline styles | `LegalPageShell` + token typography; keep legal-sync protocol |
| `/terms` | `src/app/terms/page.tsx` | **OLD** | `className="card"` | Same as privacy |
| `/feedback` | `src/app/feedback/page.tsx` | **OLD** | `className="card"`, `className="btn primary"` | `AuthShell` or `PublicFormShell` + shadcn `Button`/`Input`/`Label` |

### 1.2 Tutor / operator auth

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/login` | `src/app/login/page.tsx` | **PARTIAL** | `AuthShell`, `AuthFieldError`, shadcn `Input`/`Button`; mock wants mobile edge-to-edge 48px targets | Auth cluster primitive: `AuthShell` mobile variant per [login mock](../brand-previews/site-redesign-mock-login-2026-06-10.html) |
| `/signup` | `src/app/signup/page.tsx` + `SignupForm.tsx` | **PARTIAL** | `AuthShell` wrapper; form uses shadcn + `PasswordStrengthField`; [**W2**](smoke-round-1-findings-2026-06-11.md) pending-state bug separate | Mock-aligned signup card; shared submit pending pattern (**X2**) |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | **PARTIAL** | `AuthShell`, shadcn form fields | Mock login pattern reuse |
| `/reset-password` | `src/app/reset-password/page.tsx` | **PARTIAL** | `AuthShell`, `AuthFieldError`, fetch to API | Same |
| `/setup` | `src/app/setup/page.tsx` | **PARTIAL** | `AuthShell`, `SetupForm` | First-admin setup; align with auth cluster |

### 1.3 Account holder (parent) auth & account

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/account/login` | `src/app/account/login/page.tsx` | **PARTIAL** | `AuthShell`, shadcn fields | Claim/login mock pattern |
| `/account/signup` | `src/app/account/signup/page.tsx` | **PARTIAL** | `AuthShell`, `PasswordStrengthField` | Same |
| `/account/forgot-password` | `src/app/account/forgot-password/page.tsx` | **PARTIAL** | `AuthShell` | Same |
| `/account/reset-password` | `src/app/account/reset-password/page.tsx` | **PARTIAL** | `AuthShell`, `PasswordStrengthField` | Same |
| `/account/not-my-notes` | `src/app/account/not-my-notes/page.tsx` | **PARTIAL** | `AuthShell` | Minor; keep in auth cluster pass |
| `/account/dashboard` | `src/app/account/dashboard/page.tsx` | **PARTIAL** | `AccountPageShell`, `AccountSectionCard`, shadcn `Button`; not parent-dashboard mock | Parent home mock (learner cards, empty states); [**C2**](smoke-round-1-findings-2026-06-11.md) consent UI gap |
| `/account/children/[id]` | `src/app/account/children/[id]/page.tsx` | **PARTIAL** | `AccountPageShell`, `AccountSectionCard`; inline forms | Child detail mock; consent management (**C2**, **C3**) |
| `/account/children/[id]/notes` | `src/app/account/children/[id]/notes/page.tsx` | **PARTIAL** | `AccountPageShell` + **`ParentShareNoteCard` (OLD)** | Rebuild notes via shared `NoteCard` primitive (**X2**, **C5**) |
| `/account/children/[id]/devices` | `src/app/account/children/[id]/devices/page.tsx` | **PARTIAL** | `AccountPageShell`, `AccountSectionCard` | Settings-list row pattern |

### 1.4 Claim flow

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/claim/[token]` | `src/app/claim/[token]/page.tsx` | **PARTIAL** | `MynkWordmark`, shadcn `Card`; custom `ClaimShell` not `AuthShell` | Login mock pattern; `ClaimAuthGate`/`ClaimInterstitial` compose shared auth primitives |
| `/claim/[token]/setup` | `src/app/claim/[token]/setup/page.tsx` | **PARTIAL** | shadcn `Card`, `MynkWordmark`; `dark:` on success banner (**§2.11 debt**); Panel A (consent) **above** Panel B (credentials) — wrong order per [**C3**](smoke-round-1-findings-2026-06-11.md) | Reorder panels; `ConsentSetupForm` → shared consent primitive; auth mock layout |

### 1.5 Student / learner surfaces

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/students/login` | `src/app/students/login/page.tsx` | **PARTIAL** | `MynkWordmark`, shadcn `Card`/`Input`/`Button`; not `AuthShell` | Child-friendly auth shell (large touch targets per login mock) |
| `/join` | `src/app/join/page.tsx` | **PARTIAL** | Token classes (`bg-background`, `heading`); simple “waiting for tutor” card — **A2 waiting room (learner)** | Dedicated `LearnerWaitingRoom` component per WB session lifecycle mock; link from parent flow |
| `/w/[joinToken]` | `src/app/w/[joinToken]/page.tsx` + `StudentWhiteboardClient.tsx` | **OLD** | Error state: `className="card"`; client: **no** `mynk-wb-chrome`, **no** `WbActionSheet`/`WbStrokePropsPanel`/`WbTopBar`; legacy inline Connected pill; `PageStrip`/`UndoRedoButtons` old chrome; [**L3**](smoke-round-1-findings-2026-06-11.md) tutor-new/student-old split | **Critical:** Shared `WbChrome` package used by tutor **must** compose student join ([mobile WB mock](../brand-previews/whiteboard-mobile-mock-2026-06-10.html)); student laser cyan; `WbStatusPill` (**L6**) |

### 1.6 Parent share

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/s/[token]` | `src/app/s/[token]/page.tsx` | **OLD** | Page chrome: `className="card"`, `className="btn"`; body uses **`ParentShareNoteCard`** (legacy) | [Parent share mock](../brand-previews/site-redesign-mock-parent-share-2026-06-10.html): full-bleed cards, accent NEW, collapsed older notes |
| `/s/[token]/all` | `src/app/s/[token]/all/page.tsx` | **OLD** | `className="btn"`, `className="card"` pagination | Shared pagination + note list primitives |
| `/s/[token]/whiteboard/[id]` | `src/app/s/[token]/whiteboard/[whiteboardSessionId]/page.tsx` | **OLD** | `WhiteboardReplay` + legacy `.card`/inline wrapper | Replay chrome deferred to B4; minimum token shell |

### 1.7 Admin — dashboard & students

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/admin` | `src/app/admin/page.tsx` | **PARTIAL** | `AdminPageShell`, `AdminSectionCard`, `Button`; top-nav layout not mock sidebar ([student-list mock](../brand-previews/site-redesign-mock-student-list-2026-06-10.html) § desktop nav) | `AdminSidebarShell` (220px) + identity chip (**REQ-S3-3**); stats/start-session mock composition |
| `/admin/students` | `src/app/admin/students/page.tsx` | **PARTIAL** | `AdminPageShell`, `StudentsRoster` (shadcn search, `AdminSectionCard`); no FAB/bottom sheet on mobile | Mock: sticky search, FAB + bottom sheet “Add student”; [**X5**](smoke-round-1-findings-2026-06-11.md) avatar polish |
| `/admin/students/[id]` | `src/app/admin/students/[id]/page.tsx` | **PARTIAL** | `AdminPageShell`, `AdminSectionCard`, `StudentAvatar`, `Button`; embeds `StartWhiteboardSession`; many child sections still bespoke JSX | [Student detail mock](../brand-previews/site-redesign-mock-student-detail-2026-06-10.html): mobile tab bar, sticky Start CTA, overflow sheet |
| `/admin/students/[id]/notes` | `src/app/admin/students/[id]/notes/page.tsx` | **OLD** | `className="card"`, `className="btn"` throughout; `TutorStudentNoteExpandedBody` inline styles | Shared `TutorNoteCard` + search bar primitives; [**C5**](smoke-round-1-findings-2026-06-11.md) billable minutes |

### 1.8 Admin — whiteboard session surfaces

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/admin/.../workspace` (live) | `workspace/page.tsx` + `WhiteboardSessionShell.tsx` + `WhiteboardWorkspaceClient.tsx` | **PARTIAL** | **Tutor live:** `mynk-wb-chrome`, `WbActionSheet`, `WbStrokePropsPanel`, `WbTopBarMicControl`, `whiteboard-chrome.css`; **Page wrapper:** legacy `container`, raw `<h1>`, inline styles; `WorkspaceResumeGate` OLD `.card`/`.btn` | Remove admin layout chrome from workspace (no `AdminNav` wrap — mock session bar only); extract resume gate to shared dialog; pre-session mock (**X7**) |
| `/admin/.../workspace` (ended preview) | `WorkspacePreviousSessionPreview.tsx` on ended sessions | **OLD** | Legacy `.card`/`.btn`; inline styles; hosts `StartWhiteboardSession` | Pre-session / preview mock (mic check + context strip) — [**X2**](smoke-round-1-findings-2026-06-11.md) |
| `/admin/.../workspace` (in-shell review) | `SessionReviewMode.tsx` | **OLD** | Legacy `.card`/`.btn`; `TutorNotesSection` raw MD; no mock “Session complete” top bar | B4 `RecapEditor`/`FormattedNotesBody`; shell mock top bar (**E1** functional separate) |
| `/admin/.../whiteboard/[id]` (standalone review) | `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/page.tsx` | **OLD** | `className="btn"`, `className="card"`; `WhiteboardReplay`, `TutorNotesSection` | Absorb into in-shell review or apply B4 session-detail mock |
| WB sub: `StartWhiteboardSession` | `src/app/admin/students/[id]/whiteboard/StartWhiteboardSession.tsx` | **PARTIAL** | shadcn `Card`/`Button` modal; not mock pre-session panel; [**X7**](smoke-round-1-findings-2026-06-11.md) Continue button text color | `PreSessionPanel` shared component from mock |
| WB sub: `WorkspaceResumeGate` | `workspace/WorkspaceResumeGate.tsx` | **OLD** | `className="card"`, `className="btn btn-primary"` | `AlertDialog` / `AdminSectionCard` + coral CTA primitive |
| WB sub: waiting room | `WhiteboardSessionShell.tsx` comment L20 | **UNKNOWN** | `mode === "waiting"` **not implemented** (A5 deferred) | Design + build `WbWaitingRoom` per session-shell mock |

### 1.9 Admin — settings & security

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/admin/settings` | `src/app/admin/settings/page.tsx` | **PARTIAL** | `AdminPageShell`; iOS-style row list (good); mock wants **left sub-nav** 180px | `SettingsSubNav` + two-column settings shell ([settings mock](../brand-previews/site-redesign-mock-settings-2026-06-10.html)) |
| `/admin/settings/profile` | `src/app/admin/settings/profile/page.tsx` | **PARTIAL** | `AdminPageShell`, `AdminSectionCard`, `ProfileForm` shadcn | Settings sub-nav shell; density pass (**§2.10 #2**) |
| `/admin/settings/email` | `src/app/admin/settings/email/page.tsx` | **PARTIAL** | `AdminPageShell`, `OAuthEmailSection`; `AuthMortensenNotice` placement below CTA (**§2.14 #3**) | Move notice above Connect Gmail |
| `/admin/settings/2fa` | `src/app/admin/settings/2fa/page.tsx` | **PARTIAL** | `AdminPageShell`, `AdminSectionCard`; embeds `TwoFactorSetupForm` | Unified 2FA management layout |
| `/admin/settings/2fa/setup` | `src/app/admin/settings/2fa/setup/page.tsx` | **OLD** | `className="card"`, raw `<h1>`, `className="muted"`; **outside** `AdminPageShell`; [**TFA2**](smoke-round-1-findings-2026-06-11.md) off-center tile, unreadable backup codes | Wrap in settings shell; rebuild `TwoFactorSetupForm` with shadcn + `BackupCodesPanel` token styling |
| `/admin/settings/2fa/verify` | `src/app/admin/settings/2fa/verify/page.tsx` | **OLD** | `className="card"`, legacy headings | `AuthShell` or settings sub-layout + shadcn form |

### 1.10 Admin — operator, approval, ops

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| `/admin/pending-approval` | `src/app/admin/pending-approval/page.tsx` | **PARTIAL** | shadcn `Card`, `AdminNav` (duplicate nav: page + layout); centered gate — [**X2**](smoke-round-1-findings-2026-06-11.md) | Dedicated `PendingApprovalShell` (auth-card style); fix double-`AdminNav`; [**W1**](smoke-round-1-findings-2026-06-11.md) redirect loop is functional |
| `/admin/tutor-approvals` | `src/app/admin/tutor-approvals/page.tsx` | **PARTIAL** | `AdminPageShell`, `AdminSectionCard`, row list | Operator table primitive; [**W4**](smoke-round-1-findings-2026-06-11.md) stale `/admin/waitlist` **not present** on this branch |
| `/admin/outbox` | `src/app/admin/outbox/page.tsx` | **PARTIAL** | `AdminPageShell`, row list in `AdminSectionCard` | Session row primitive (1A.7); low priority |
| `/admin/feedback` | `src/app/admin/feedback/page.tsx` | **PARTIAL** | `AdminPageShell`, `AdminSectionCard` | Row list OK; polish |
| `/admin/cost` | `src/app/admin/cost/page.tsx` | **OLD** | Multiple `className="card"` + inline padding styles | `AdminSectionCard` + stat tiles (1A.5) |
| `/admin/dev-tools` | `src/app/admin/dev-tools/page.tsx` | **PARTIAL** | `AdminPageShell`; `dark:` in description | Dev-only; token cleanup when touched |

### 1.11 Global errors & misc routes

| Route | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| Global 404 | `src/app/not-found.tsx` | **OLD** | `container`, `card`, `btn primary` | `ErrorPageShell` shared with marketing tokens |
| Global error | `src/app/error.tsx` | **OLD** | `card`, `btn` | Same |
| Admin 404 | `src/app/admin/not-found.tsx` | **OLD** | Legacy `.card`/`.btn` | `AdminPageShell` error state |
| Admin error | `src/app/admin/error.tsx` | **OLD** | Legacy | Same |
| WB workspace error | `src/app/admin/students/.../error.tsx` | **OLD** | Legacy `.card`/inline | WB chrome error boundary styling (`WbChromeErrorBoundary` exists) |
| `/verify-email` | `src/app/verify-email/route.ts` | **N/A** | API redirect only — no UI | — |
| `/auth/verify-done` | `src/app/auth/verify-done/route.ts` | **N/A** | Cookie handoff redirect — no UI | — |

### 1.12 Cross-surface components (not routes, user-visible)

| Surface | File | Status | Evidence | What's needed |
|---|---|---|---|---|
| Connected / sync pill (student WB) | `StudentWhiteboardClient.tsx` ~L625–681 | **OLD** | Inline `style={{ background, color }}` pills; [**L6**](smoke-round-1-findings-2026-06-11.md) | `WbStatusPill` / `SessionStatusPill` (1A.6) shared with tutor chrome |
| AV pip on/off | `AVControls.tsx`, `AVTile.tsx`, `WbAVCluster.tsx` | **PARTIAL** | Functional; tutor uses chrome cluster; student uses legacy floating controls; [**X3**](smoke-round-1-findings-2026-06-11.md) | Unified `AvPip` primitive with clear on/off states |
| `ParentShareNoteCard` | `src/components/notes/ParentShareNoteCard.tsx` | **OLD** | `className="card"`, inline NEW badge, no accent mock treatment | Single `NoteCard` for `/s/*` + account notes + admin list bodies |
| `TutorStudentNoteExpandedBody` | `src/components/notes/TutorStudentNoteExpandedBody.tsx` | **OLD** | Inline styles | Compose from `NoteCard` sections + `.ai-prose` |
| `ImpersonationBanner` | `src/components/ImpersonationBanner.tsx` | **PARTIAL** | Canonical; complements identity chip | Wire into `AdminSidebarShell` identity chip (**REQ-S3-3**) |
| `ThemeToggle` | `src/components/ThemeToggle.tsx` | **PARTIAL** | Exists in `AdminNav`; WB has `WbThemeToggle` duplicate | Single `ThemeToggle` consumed everywhere (**A′** plumbing) |

---

## 2. Shared components — have vs build

### 2.1 Have today (canonical inventory)

| Category | Components | Notes |
|---|---|---|
| **shadcn primitives** | `ui/button`, `ui/input`, `ui/label`, `ui/card`, `ui/switch` | Coral CTA = `Button` default variant — verify `bg-accent text-accent-on` |
| **Auth** | `AuthShell`, `MynkWordmark`, `AuthFieldError`, `PasswordStrengthField`, `AuthMortensenNotice` | Auth cluster exists; not mock-complete on mobile |
| **Admin shell** | `AdminNav`, `AdminPageShell`, `AdminSectionCard` | Top-nav + max-w-4xl — **not** mock sidebar shell |
| **Account shell** | `AccountPageShell`, `AccountSectionCard`, `AccountSignOutButton` | Parallel to admin — intentional |
| **Marketing** | `MarketingHeader`, `SiteFooter` | No `MarketingPageShell` / hero primitives |
| **Students** | `StudentsRoster`, `StudentAvatar` | Roster lacks mobile FAB/sheet |
| **WB chrome (tutor only)** | `WbActionSheet`, `WbStrokePropsPanel`, `WbTopBarMicControl`, `WbAVCluster`, `BoardTabStrip`, `WbThemeToggle`, `whiteboard-chrome.css` | Scoped to `WhiteboardWorkspaceClient` — **not shared with `/w/[joinToken]`** |
| **Notes** | `ParentShareNoteCard`, `NotesSearchBar`, `TutorStudentNoteExpandedBody`, `PageSizeSelect` | Cards duplicate structure 3× — violates §2.12 |
| **AV** | `AVTilesPanel`, `AVTile`, `AVControls`, `AVPermissionsPrompt`, `VideoControls` | Recording slice owns behavior; chrome styling split |
| **Utilities** | `ImpersonationBanner`, `ModalPortal`, `SubmitButton`, `ThemeToggle`, `ThemeProvider`, `LocalDateTimeText` | `SubmitButton` → migrate to `Button` |
| **Recording (locked)** | `MainPanel`, `MicControls`, `RecordingControlPanel`, etc. | Slice 3 — redesign wraps, don't fork |

### 2.2 Missing / must build (blocks X2)

| Priority | Primitive | Mock / doc ref | Unblocks |
|---|---|---|---|
| **P0** | `WbChrome` shared package (top bar, action sheets, status pill, student layout adapter) | [WB mobile mock](../brand-previews/whiteboard-mobile-mock-2026-06-10.html) | `/w/[joinToken]`, [**L3**](smoke-round-1-findings-2026-06-11.md), [**L6**](smoke-round-1-findings-2026-06-11.md) |
| **P0** | `NoteCard` (+ `NoteCardList`, NEW badge, recording chips) | [Parent share mock](../brand-previews/site-redesign-mock-parent-share-2026-06-10.html) | `/s/[token]`, account notes, admin notes |
| **P0** | `AdminSidebarShell` + `NavIdentityChip` | §1A.8, [student-list mock](../brand-previews/site-redesign-mock-student-list-2026-06-10.html) | All `/admin/**` except live workspace |
| **P1** | `SettingsSubNav` (180px) + two-column settings layout | [Settings mock](../brand-previews/site-redesign-mock-settings-2026-06-10.html) | `/admin/settings/**` |
| **P1** | `PreSessionPanel` / `StartSessionGate` | Mock Surface 3, `StartWhiteboardSession` | Student detail + workspace preview; [**X7**](smoke-round-1-findings-2026-06-11.md) |
| **P1** | `TwoFactorSetupPanel` + `BackupCodesPanel` | [**TFA2**](smoke-round-1-findings-2026-06-11.md) | `/admin/settings/2fa/*` |
| **P1** | `PendingApprovalShell` | Signup/waitlist flow | [**X2**](smoke-round-1-findings-2026-06-11.md) |
| **P1** | `StudentDetailChrome` (mobile tab bar, sticky CTA, overflow sheet) | [Student detail mock](../brand-previews/site-redesign-mock-student-detail-2026-06-10.html) | `/admin/students/[id]` |
| **P2** | `FormattedNotesBody` + `RecapEditor` | §3.1 REQ-S3-1/4 | Review surfaces, `TutorNotesSection` |
| **P2** | `LegalPageShell`, `ErrorPageShell`, `PublicFormShell` | — | privacy, terms, feedback, 404 |
| **P2** | `MarketingHero`, `ValuePropGrid`, `TrustCta` | Landing mock | `/`, `/features` |
| **P2** | `ConsentPreferencesPanel` | [**C3**](smoke-round-1-findings-2026-06-11.md) | claim setup + parent dashboard |
| **P2** | `LearnerWaitingRoom` | A2 / `/join` | `/join` + future WB waiting mode |
| **P2** | `SessionStatusPill` / `WbStatusPill` | §1A.6, [**L6**](smoke-round-1-findings-2026-06-11.md) | WB tutor + student |
| **P2** | `AvPip` unified control | [**X3**](smoke-round-1-findings-2026-06-11.md) | WB + recording |
| **P3** | `PaginationBar` | — | `/s/*/all`, admin notes |
| **P3** | `StatTile`, `SessionRow`, `AccentStrip` | §1A.4–1A.7 | Dashboard, outbox, cost |

---

## 3. Duplication / parallel systems to kill

| Parallel system | Where it lives | Target |
|---|---|---|
| **Legacy `globals.css` `.btn` / `.card`** | `src/app/globals.css`; 40+ files still use `className="card"` or `"btn"` | Migrate to shadcn `Button`/`Card` + §1A token classes; grep gate in CI |
| **Three note card implementations** | `ParentShareNoteCard`, admin `notes/page.tsx` inline cards, `TutorStudentNoteExpandedBody` | Single `NoteCard` composed of section primitives |
| **Two WB chrome stacks** | Tutor: `mynk-wb-chrome` + CSS; Student: `StudentWhiteboardClient` legacy toolbar | One `WbChrome` with `role=tutor|student` props |
| **Two theme toggles** | `ThemeToggle` (nav) vs `WbThemeToggle` (overflow menu) | One toggle component |
| **`SubmitButton` vs `Button`** | Forms across admin/account | Opportunistic migration to `Button` |
| **Inline `style={{}}` vs tokens** | `LandingPageContent`, `features`, `ParentShareNoteCard`, AV, WB student | Extract to components with Tailwind semantic classes only |
| **`dark:` in component code** | `TwoFactorSetupForm`, `claim/setup`, `dev-tools`, shadcn `button` | Migrate to tokens per §2.11 |
| **Top nav vs sidebar admin shell** | `AdminNav` + `max-w-4xl` layout vs mock 220px sidebar | `AdminSidebarShell` replaces layout pattern |
| **Duplicate `AdminNav` on pending-approval** | `pending-approval/page.tsx` renders own `AdminNav` inside `admin/layout.tsx` | Remove page-level nav |
| **2FA setup dual entry** | `/admin/settings/2fa` (shell) vs `/admin/settings/2fa/setup` (legacy card, middleware forced) | Single settings-wrapped enrollment flow |

---

## 4. Proposed sequencing (X2 workstream)

### Phase 1 — Build/finish shared primitives (from mocks)

Do **not** page-sweep until these exist — otherwise duplication returns ([**X2**](smoke-round-1-findings-2026-06-11.md)).

1. **Layout spine:** `AdminSidebarShell`, `NavIdentityChip`, `SettingsSubNav`, `ErrorPageShell`
2. **Auth cluster completion:** `AuthShell` mobile/desktop variants, `PublicFormShell`, coral CTA consistency (**X7**)
3. **Note system:** `NoteCard`, `NoteSection`, `NewBadge`, `RecordingChip` → replaces `ParentShareNoteCard`
4. **WB chrome extraction:** `WbChrome`, `WbStatusPill`, `WbActionSheet` APIs shared tutor/student; `AvPip`
5. **Session flows:** `PreSessionPanel`, `WorkspaceResumeGate` → shadcn dialog, `TwoFactorSetupPanel` + `BackupCodesPanel` (**TFA2**)
6. **Marketing/legal:** `MarketingHero`, `LegalPageShell`
7. **Theme:** consolidate `ThemeToggle` / `WbThemeToggle` (**A′**)

**Gate:** Each primitive ships theme-agnostic + light/dark verified (§2.11). Reviewer greps consumers — fix once, fixes everywhere (§2.12).

### Phase 2 — Apply per surface group

| Order | Cluster | Routes | Depends on |
|---|---|---|---|
| **2a** | Auth | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/setup`, account auth mirrors | Phase 1 auth primitives |
| **2b** | Admin shell + settings | `/admin`, `/admin/settings/**`, `/admin/pending-approval`, `/admin/tutor-approvals` | Sidebar + settings sub-nav + 2FA panel |
| **2c** | Students roster + detail | `/admin/students`, `/admin/students/[id]`, `StartWhiteboardSession` | Student detail chrome + pre-session panel |
| **2d** | Notes (3 surfaces) | `/s/[token]`, `/s/[token]/all`, `/account/children/[id]/notes`, `/admin/students/[id]/notes` | `NoteCard` |
| **2e** | Account / claim | `/account/dashboard`, `/account/children/[id]`, `/claim/**` | Consent panel (**C3**), account shell |
| **2f** | Share replay | `/s/[token]/whiteboard/[id]` | Note/replay chrome (functional R1/R2 separate) |
| **2g** | WB tutor workspace wrapper | `/admin/.../workspace` page shell, resume gate, preview, review mode | WbChrome + pre-session |
| **2h** | **Student WB join** | `/w/[joinToken]` | **Same WbChrome as tutor** — unblocks [**L3**](smoke-round-1-findings-2026-06-11.md) |
| **2i** | Learner | `/students/login`, `/join` | Auth shell + waiting room |
| **2j** | Marketing + legal + errors | `/`, `/features`, `/privacy`, `/terms`, `/feedback`, 404/error pages | Marketing/legal shells |
| **2k** | Operator ops | `/admin/cost`, `/admin/outbox`, `/admin/feedback`, `/admin/dev-tools` | Stat/row primitives (lower priority) |

### Phase 2 critical path (Andrew smoke blockers for design)

```
P0: WbChrome shared → student /w/[joinToken]     (L3, L6)
P0: NoteCard → three notes surfaces               (X2, C5)
P1: TwoFactorSetupPanel → TFA2
P1: PreSessionPanel → StartWhiteboardSession X7
P1: AdminSidebarShell → dashboard + students mocks
```

---

## 5. Smoke finding cross-reference index

| Finding | Surfaces in this inventory |
|---|---|
| [**X2**](smoke-round-1-findings-2026-06-11.md) | Entire doc — meta workstream |
| [**TFA2**](smoke-round-1-findings-2026-06-11.md) | `/admin/settings/2fa/setup`, `TwoFactorSetupForm` |
| [**L6**](smoke-round-1-findings-2026-06-11.md) | `StudentWhiteboardClient` Connected pill; build `WbStatusPill` |
| [**L3**](smoke-round-1-findings-2026-06-11.md) | `/w/[joinToken]` vs tutor `mynk-wb-chrome` split |
| [**X3**](smoke-round-1-findings-2026-06-11.md) | `AVControls` / `WbAVCluster` / student floating AV |
| [**X7**](smoke-round-1-findings-2026-06-11.md) | `StartWhiteboardSession`, `WorkspacePreviousSessionPreview` |
| [**X5**](smoke-round-1-findings-2026-06-11.md) | `StudentsRoster` / `StudentAvatar` |
| [**C3**](smoke-round-1-findings-2026-06-11.md) | `/claim/[token]/setup` panel order + consent framing |
| [**C5**](smoke-round-1-findings-2026-06-11.md) | All three notes surfaces |
| [**W1**](smoke-round-1-findings-2026-06-11.md) | `/admin/pending-approval` + 2FA setup (functional; design still PARTIAL) |
| [**W2**](smoke-round-1-findings-2026-06-11.md) | `/signup` (functional) |
| [**W4**](smoke-round-1-findings-2026-06-11.md) | `/admin/waitlist` — **not on branch**; use `/admin/tutor-approvals` |
| [**E1**](smoke-round-1-findings-2026-06-11.md) | `SessionReviewMode` / shell flip (functional; design OLD) |

---

## 6. Audit method & limits

- Enumerated all `src/app/**/page.tsx` (46) plus `error.tsx` / `not-found.tsx` variants.
- Classified from **static source** (imports, `className`, mock diff) — no browser screenshots on this pass.
- **Read-only** w.r.t. production components per Andrew directive.
- `/admin/waitlist` referenced in [**W4**](smoke-round-1-findings-2026-06-11.md) — **file absent** on `v1-redesign` at audit time (`Test-Path` false).
- Recording slice 3 components (`MainPanel`, `TutorNotesSection`, etc.) flagged as **locked** — X2 wraps with new chrome, does not fork logic ([`V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md) §4).

---

*Next step: X2 dispatch — Phase 1 primitives first (`WbChrome` student parity + `NoteCard` + `AdminSidebarShell`), then Phase 2a→2h cluster passes.*
