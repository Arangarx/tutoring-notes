# V1 Component Library — Reference Spine

**Authored:** 2026-06-07 (Sonnet subagent, component-spine chunk-1 worktree)
**Branch:** `v1-component-spine`
**Purpose:** Canonical, skimmable component inventory + UX rubric for the V1 redesign. Future agents read and update this doc — it is the consistency contract across all chunk passes.

> **Read before any UI work in this repo.** This doc answers: what components exist, which are canonical, which are duplicates, and what conventions all new surfaces must follow.

---

## §0. Canonical Brand Reference

**Approved source of truth for colors and fonts:** `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`

Andrew has **approved this mock for COLORS and FONTS only** — not as a final component set. The component system evolves from this look and feel; it does NOT diverge from it.

**Light mode tokens (from mock `:root`):**

| Token | Value | Role |
|---|---|---|
| `--brand` | `#1e3d54` | Wordmark, brand fills |
| `--text` | `#15203a` | Primary text |
| `--text-muted` | `#5a6877` | Muted / helper text |
| `--surface` | `#f5f4ec` | Page background (warm cream) |
| `--surface-raised` | `#fcfbf4` | Cards, panels (slightly lighter) |
| `--surface-sunken` | `#ecebe1` | Recessed wells |
| `--border` | `#c5cfd0` | Card/panel borders |
| `--border-strong` | `#4a6680` | Focus rings, ghost-button outlines |
| `--accent` | `#e27d60` | Coral — primary CTA, live dot, active state |
| `--accent-soft` | `#f8e0d6` | AI panel background, pending-action tint |
| `--accent-text` | `#8a3c25` | Text on accent-soft backgrounds |
| `--accent-on` | `#15203a` | Dark text on coral CTA (5.64 AA) |

**Dark mode tokens (from mock `body[data-mode="dark"]`):**

| Token | Value | Role |
|---|---|---|
| `--brand` | `#7ea4b1` | Wordmark on dark |
| `--text` | `#f0ede4` | Warm off-white |
| `--text-muted` | `#a5b5c0` | Cool blue-grey |
| `--surface` | `#051a24` | Near-navy base |
| `--surface-raised` | `#0e2a38` | Cards (raised) |
| `--surface-sunken` | `#021018` | Deepest wells |
| `--border` | `#1c3548` | Borders |
| `--border-strong` | `#6a8fa0` | Focus rings |
| `--accent` | `#e27d60` | Coral (mode-invariant) |
| `--accent-soft` | `#2e1d18` | Deep coral-brown |
| `--accent-text` | `#e8a08a` | Light peach on dark |
| `--accent-on` | `#051a24` | Dark text on coral (6.22 AA) |

**Verify against `src/styles/tokens.css` — if any token drifts from the above values, flag it as a DRIFT and correct toward the mock values.**

**Font stack (from mock):**
- Display: `"Fraunces"` variable font with axes `opsz`, `SOFT`, `wght`
- Body: `"Inter"` weight 400 (V2 — lighter)
- Mono: `"JetBrains Mono"` weight 400/500

**No scheduling in V1.** The mock's Surface 2 shows a "Up next · Aiden K. at 4 PM today" card — this is mock-only illustration and is **explicitly NOT in V1 scope**. Do not implement scheduling UI anywhere in the component pass. The `.dash-upnext` card in the mock is a visual-only placeholder; replace it with the next-actions pattern per the component design doc (pending recaps + start session).

---

## §1. Component Inventory Table

### Shared UI Primitives (shadcn/ui — installed Phase B1)

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `Button` | `src/components/ui/button.tsx` | All interactive buttons | `variant` (default/outline/ghost/secondary/destructive/link), `size` (xs/sm/default/lg/icon) | App-wide | **canonical** |
| `Input` | `src/components/ui/input.tsx` | Text input fields | Standard HTML input props + shadcn styling | Forms app-wide | **canonical** |
| `Label` | `src/components/ui/label.tsx` | Form field labels (Radix) | Standard label props | Forms app-wide | **canonical** |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` | `src/components/ui/card.tsx` | Card container primitives | Standard div props | Via `AdminSectionCard`, `AccountSectionCard` | **canonical** |

### Admin Layout + Navigation

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `AdminNav` | `src/components/AdminNav.tsx` | Sticky top nav for all tutor/admin surfaces. Wordmark left, nav links, sign-out right. Mobile hamburger. **REQ-S3-3:** redesign must add a persistent signed-in identity indicator (display name/email; badge when impersonating or test account) — pairs with `ImpersonationBanner`. | `showOperatorLinks`, `sessionMode`, `isImpersonating`, `showDevTools`, `showCostDashboard` | All `/admin/**` pages via `admin/layout.tsx` | **canonical** |
| `AdminPageShell` | `src/components/admin/AdminPageShell.tsx` | Page chrome: `<h1>` title, optional eyebrow, optional description, optional actions slot | `title`, `description`, `eyebrow`, `actions`, `children`, `className` | Dashboard, students, settings (chunk 1) | **canonical** |
| `AdminSectionCard` | `src/components/admin/AdminSectionCard.tsx` | Section grouping within a page. Wraps shadcn `Card`. Title + optional description + optional actions header + content slot. | `title`, `description`, `actions`, `children`, `id`, `data-testid` | Dashboard, students, settings (chunk 1) | **canonical** |

### Account Holder (Parent) Layout

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `AccountPageShell` | `src/components/account/AccountPageShell.tsx` | Layout wrapper for authenticated AccountHolder pages. Includes its own nav with wordmark + email + sign-out. Same structural shape as `AdminPageShell` but owns its own nav (no `AdminNav`). | `title`, `description`, `eyebrow`, `actions`, `userEmail`, `children` | `/account/**` pages | **canonical — NOTE: structurally parallel to `AdminPageShell` but NOT the same component.** Both are intentional (different realms/nav); do not consolidate. |
| `AccountSectionCard` | `src/components/account/AccountSectionCard.tsx` | Section card for AccountHolder pages — mirrors `AdminSectionCard` | Same as `AdminSectionCard` | `/account/**` pages | **canonical — parallel to `AdminSectionCard`. Same reasoning: separate realms.** |

### Auth Surfaces

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `AuthShell` | `src/components/auth/AuthShell.tsx` | Centered card layout for public auth pages (login/signup/forgot/reset/setup) | `children`, misc | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/setup` | **canonical** |
| `MynkWordmark` | `src/components/auth/MynkWordmark.tsx` | "Mynk·" wordmark using `.wordmark` CSS class + Fraunces font-variation-settings | `size` (sm/md/lg) | Auth shell, `AdminNav`, `AccountPageShell`, `MarketingHeader` | **canonical** |
| `AuthMortensenNotice` | `src/components/auth/AuthMortensenNotice.tsx` | Legal notice about Google OAuth via mortensenapps.com — **ONLY on Google-OAuth click-points**, NOT on credentials pages | `variant` (connect/signin), `className`, `style` | `OAuthEmailSection` "Connect Gmail" only | **canonical — placement is legally binding (see v1-redesign-STATUS.md)** |
| `AuthFieldError` | `src/components/auth/AuthFieldError.tsx` | Inline field-level error message for form fields | `children`, `id` | Auth form fields | **canonical** |
| `PasswordStrengthField` | `src/components/auth/PasswordStrengthField.tsx` | Password input + strength indicator (zxcvbn). Shared across credential forms. | Props TBD (see file) | Signup, reset-password, change-password | **canonical — use for all 8 credential forms per B1 acceptance criteria** |

### Marketing Surfaces

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `MarketingHeader` | `src/components/marketing/MarketingHeader.tsx` | Sticky header for public marketing pages (`/`, `/features`) | `currentPath` | `/`, `/features` | **canonical** |
| `SiteFooter` | `src/components/SiteFooter.tsx` | Public site footer with About/Privacy/Terms/Feedback links | none | Public pages | **canonical** |

### Students

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `StudentsRoster` | `src/components/admin/StudentsRoster.tsx` | Student list with search + add student (B2 reskin) | `students`, `adminUserId` | `/admin/students` | **canonical** |
| `StudentAvatar` | `src/components/admin/StudentAvatar.tsx` | Initials avatar with `--avatar-N` color ring | `name`, `size` | Student list, student detail | **canonical** |

### Recording / Session Capture (Slice 3 collision zone — DO NOT EDIT from UI chunks)

| Component | File | Purpose | Dedup Status |
|---|---|---|---|
| `MainPanel` | `src/components/recording/MainPanel.tsx` | Recording main control panel | **owned by recording slice 3 — do not edit** |
| `RecordingControlPanel` | `src/components/recording/RecordingControlPanel.tsx` | Recording controls | **owned by recording slice 3 — do not edit** |
| `MicControls` | `src/components/recording/MicControls.tsx` | Mic on/off + level | **owned by recording slice 3 — do not edit** |
| `UploadingPanel` | `src/components/recording/UploadingPanel.tsx` | Upload progress panel | **owned by recording slice 3 — do not edit** |
| `ErrorCard` | `src/components/recording/ErrorCard.tsx` | Recording error state | **owned by recording slice 3 — do not edit** |
| `DoneCard` | `src/components/recording/DoneCard.tsx` | Recording done state | **owned by recording slice 3 — do not edit** |
| `SessionCostPanel` | `src/components/admin/SessionCostPanel.tsx` | Per-session AI cost display | **owned by recording slice 3 — do not edit** |

### Whiteboard (Slice 3 collision zone + live session — DO NOT EDIT from UI chunks)

| Component | File | Dedup Status |
|---|---|---|
| `WhiteboardReplay` | `src/components/whiteboard/WhiteboardReplay.tsx` | **owned by recording slice 3 — do not edit** |
| `WhiteboardNotesPanel` | `src/components/whiteboard/WhiteboardNotesPanel.tsx` | **owned by recording slice 3 — do not edit** |
| `TutorNotesSection` | `src/components/whiteboard/TutorNotesSection.tsx` | **owned by recording slice 3 — do not edit** |
| `ExcalidrawDynamic` | `src/components/whiteboard/ExcalidrawDynamic.tsx` | **live session — do not edit from UI chunks** |
| `PageStrip` | `src/components/whiteboard/PageStrip.tsx` | **live session — do not edit from UI chunks** |
| Others in `whiteboard/` | various | **do not edit from UI chunks** |

### A/V

| Component | File | Purpose | Dedup Status |
|---|---|---|---|
| `AVTilesPanel`, `AVTile`, `AVControls`, `AVPermissionsPrompt`, `VideoControls` | `src/components/av/` | Live A/V session components | **live session — do not edit from UI chunks** |

### Utilities

| Component | File | Purpose | Dedup Status |
|---|---|---|---|
| `ImpersonationBanner` | `src/components/ImpersonationBanner.tsx` | Operator impersonation indicator bar | **canonical** |
| `SubmitButton` | `src/components/SubmitButton.tsx` | Simple form submit button (pre-B1 era, some pages still use) | **candidate-for-consolidation** — new code should use `<Button>` from `ui/button.tsx`; migrate opportunistically |
| `ThemeInit` | `src/components/ThemeInit.tsx` | Hydrates theme from localStorage to avoid FOUC | **canonical** |
| `Providers` | `src/components/Providers.tsx` | Root client providers (session, theme, etc.) | **canonical** |
| `LocalDateTimeText` | `src/components/LocalDateTimeText.tsx` | Client-rendered local datetime from UTC | **canonical** |
| `ModalPortal` | `src/components/ModalPortal.tsx` | Portal for modals | **canonical** |

### Notes

| Component | File | Purpose | Dedup Status |
|---|---|---|---|
| `ParentShareNoteCard` | `src/components/notes/ParentShareNoteCard.tsx` | Note card on parent share view | **canonical** |
| `AiGeneratedNoteReviewGate` | `src/components/notes/AiGeneratedNoteReviewGate.tsx` | Gate for AI-generated note review (pre-slice-3 Cancel/dismiss) | **candidate — fold into B4 post-session controls** |
| `TutorStudentNoteExpandedBody` | `src/components/notes/TutorStudentNoteExpandedBody.tsx` | Expanded note body (structured fields, `pre-wrap`) | **canonical** for student notes list — **not** for markdown `TutorNote.content` |
| `NotesSearchBar` | `src/components/notes/NotesSearchBar.tsx` | Notes search | **canonical** |
| `PageSizeSelect` | `src/components/notes/PageSizeSelect.tsx` | Pagination size selector | **candidate-for-consolidation** — consider shadcn Select |
| **`FormattedNotesBody`** (planned) | `src/components/notes/FormattedNotesBody.tsx` *(not yet created)* | **Canonical** rendered-markdown display for AI session notes: parses MD → styled headings/lists inside `.ai-prose` (`src/styles/typography.css`). **REQ-S3-1** — slice 3 smoke found `TutorNotesSection` shows raw source; B4 must route all auto-notes through this (or alias `RecapEditor` read-only mode). **No duplicate raw-MD renderer.** | **canonical target — implement at Chunk 3** |
| **`RecapEditor`** (planned) | per [`v1-component-redesign-design-2026-05-31.md`](handoff/v1-component-redesign-design-2026-05-31.md) §5.5 | B4 session-detail recap panel: `.ai-prose`, editable inline, Regenerate. May compose `FormattedNotesBody` + edit chrome. | **canonical target — Chunk 3** |
| `NewNoteForm` | `src/app/admin/students/[id]/NewNoteForm.tsx` | Structured note create/edit; **"Save note"** submit (pre-slice-3 manual WB flow) | **canonical** for structured `SessionNote` fields — reference for Save affordance, not for markdown `TutorNote` |
| `WhiteboardNotesPanel` | `src/components/whiteboard/WhiteboardNotesPanel.tsx` | Pre-slice-3 manual generate → review → Save/Cancel flow | **superseded by auto-notes** — B4 replaces with post-session controls per **REQ-S3-2** |
| `TutorNotesSection` | `src/components/whiteboard/TutorNotesSection.tsx` | Slice 3 auto-notes polling UI (raw MD bug) | **owned by recording slice 3 — redesign absorbs into Chunk 3, do not patch ad hoc** |

---

## §2. UX Rubric — Consistency Contract

**Future chunks MUST follow these conventions. Deviating requires updating this doc and stating why.**

### 2.1 Layout & Spacing

- **Page max-width:** `max-w-4xl` (896px), centered with `mx-auto px-4 py-8`
- **Section spacing:** `gap-8` between `AdminPageShell` header and content; `gap-6` between sibling `AdminSectionCard` components
- **Form field spacing within a section:** `space-y-4` (between field groups), `space-y-1.5` (between label and input)
- **Content max-width within cards:** `max-w-md` or `max-w-lg` for form fields; never full card width for narrow inputs
- **Mobile:** single-column; cards stack naturally. Min touch target: `min-h-11` (44px)

### 2.2 Page Shell Pattern

Every tutor/admin page uses `AdminPageShell` inside the `admin/layout.tsx` main container:

```tsx
<AdminPageShell title="Settings" description="Manage your account and preferences.">
  <AdminSectionCard title="Profile" description="Your display name and password.">
    {/* form content */}
  </AdminSectionCard>
</AdminPageShell>
```

- `AdminNav` is provided by `admin/layout.tsx` — never add a second nav inside a page
- `AdminPageShell` handles the `<h1>` — never write a raw `<h1>` inside page content
- The `eyebrow` prop renders a back-link or breadcrumb above the `<h1>`

### 2.3 Card-Usage Convention — CRITICAL (Andrew's explicit guidance, reconciled with mock)

**The settings NAV/INDEX (the page listing Profile, Email, 2FA, etc.) MUST NOT be card-heavy.**

Andrew's approved mock (Surface 2 — dashboard) demonstrates the "variety of usage" he likes:
- Dashboard **stat tiles** (`.dash-stat`): each is a distinct data unit → cards appropriate
- Dashboard **session list panel** (`.dash-panel` + `.dash-session` rows): the panel is a card, but individual rows are NOT cards — they are horizontal rows with `border-bottom` separators, hover highlight only
- Dashboard **pending summaries**: uses accent-soft left-border strip (NOT a full card) for AI/pending-action signal
- **Marketing feature grid** (`.mkt-feature`): feature cells in a grid → light cards appropriate
- **Session detail** (`.session-summary-card`, `.session-side-panel`): content subsections → cards appropriate

**What the mock does NOT show:** A settings index with every nav item wrapped in a card. The mock's "variety" includes plain horizontal rows (`.dash-session`), borderless sections, and minimal nav links alongside cards — cards are contextually used for distinct content units, not for every grouping.

**Site-wide rule:**

| Surface type | Card appropriate? | Pattern to use |
|---|---|---|
| Navigation index (Settings index, sub-nav list) | **No** — over-chrome | Plain list with `<Link>` rows. Hover: `hover:bg-muted/60` row highlight, no card border. Group with a section divider or heading if needed. |
| Content subsections within a page (Profile form, Email form) | **Yes** | `AdminSectionCard` — groups and labels the subsection clearly |
| Stat/metric tiles on a dashboard | **Yes** | Raised-surface card (`.dash-stat` pattern) — each is a distinct numerical unit |
| Data rows within a list/panel | **No** — row styling only | `border-b border-border` row with hover background, inside a card container |
| Pending-action / AI signal | **Partial** — strip, not card | `accent-soft` tinted strip with `border-l-4 border-accent` (`.dash-pending-summaries` mock pattern) |
| Primary action on landing/dashboard | **Yes** | `AdminSectionCard` or custom card for each distinct action unit |
| Operator/debug pages (Outbox, Feedback, Waitlist) | **Minimal** | One `AdminPageShell` + one `AdminSectionCard` for the list; individual items = row styling |

**Current card usage audit (as of chunk 1):**
- Landing/marketing page (Phase D): cards for feature grid — **appropriate** per mock
- Dashboard B2 reskin: `AdminSectionCard` for pending recaps + recent sessions — **appropriate** (distinct action units per mock pattern)
- Settings index (pre-chunk-1): wraps every nav item in `className="card"` — **over-chrome; corrected in chunk 1**
- Settings sub-pages (post-chunk-1): `AdminSectionCard` per logical form group — **appropriate**

### 2.4 Typography Roles (from approved mock)

| Role | CSS class | Font variation | Usage |
|---|---|---|---|
| Wordmark "Mynk·" | `.wordmark` | Fraunces `opsz 144, SOFT 60, wght 700` | `<AdminNav>`, `<MynkWordmark>`, auth header |
| Page title (h1) | `.heading` | Fraunces `opsz 144, SOFT 0, wght 700` | `AdminPageShell title` prop |
| Section heading (h2/h3) | Tailwind `text-lg font-semibold text-foreground` | Inter 600 | `AdminSectionCard` title |
| Body text | `text-base text-foreground` | Inter 400 (V2 weight) | Page descriptions, form helper text |
| Muted body | `text-sm text-muted-foreground` | Inter 400 | Secondary descriptions |
| Form label | `text-sm font-medium leading-none` | Inter 500 | shadcn `Label` |
| Eyebrow / metadata | `.label-mono` | JetBrains Mono 500 | Timestamps (`.dash-stat-label`, `.dash-session-when`, `.rec-timer`), session metadata, status badges |
| AI prose | `.ai-prose` | Fraunces `opsz 14, SOFT 30, wght 400` | AI-generated content blocks (summaries, recaps — `.session-summary-section p`, `.parent-prose`) |
| Quote/italic prose | Fraunces `opsz 144, SOFT 30, wght 500` italic | Fraunces italic | Testimonials, pull quotes (mock: `.mkt-quote-body`) |

### 2.5 Nav Patterns

- **Active link:** `bg-accent-soft text-foreground`
- **Inactive link:** `text-muted-foreground hover:bg-muted hover:text-foreground`
- **Min height on all nav links:** `min-h-11` (44px touch target)
- **Settings sub-nav:** Use `<nav>` with role-appropriate `aria-label`. On mobile, settings sub-pages show an eyebrow back-link to "← Settings" via `AdminPageShell eyebrow` prop rather than a persistent sidebar.

### 2.6 Button Naming Conventions

| Context | Variant | Text pattern |
|---|---|---|
| Primary form submit | `default` (blue) | "Save [thing]", "Update [thing]" |
| Primary CTA on landing/empty states | `default` or custom coral | "Start a session →", "Add student" |
| Destructive action | `destructive` | "Delete [thing]", "Disconnect Gmail" |
| Secondary / cancel | `outline` | "Cancel" |
| Navigation-as-button | `ghost` | "← Back", "← All settings" |
| Sign out | `ghost` with `hover:text-destructive` | "Sign out" |

### 2.7 Form Field Pattern

Standard form field group:

```tsx
<div className="space-y-1.5">
  <Label htmlFor="field-id">Field label</Label>
  <Input id="field-id" name="fieldName" type="text" ... />
  <p className="text-sm text-muted-foreground">Helper text here.</p>
</div>
```

Error state: set `aria-invalid="true"` on the `Input`; display error text below with `role="alert"` or via `AuthFieldError`. Never use inline `style={{color: 'var(--sign-out-hover-text)'}}` for errors — use `text-destructive` class.

### 2.8 Empty / Loading / Error States

| State | Pattern |
|---|---|
| Loading | Skeleton matching content shape (Tailwind `animate-pulse bg-muted rounded`) |
| Empty list | `<p className="text-sm text-muted-foreground py-4">No [items] yet.</p>` |
| Form success | `<p className="text-sm text-success mt-2">Saved.</p>` |
| Form error | `<p className="text-sm text-destructive mt-2" role="alert">{error}</p>` |
| Network / server error | Inline banner, never swallowed silently |

### 2.9 Token Usage

- Always use structured tokens (`--surface-1`, `--text-default`, `--border-default`) or Tailwind semantic classes (`bg-card`, `text-foreground`, `border-border`)
- **Never use raw hex values** in component files (ESLint hex-ban active)
- Never use legacy aliases (`--bg`, `--panel`, `--text`) in new code
- Coral accent (`bg-accent text-accent-on`) for primary CTAs only

---

## §3. Component-Pass Chunk Tracker

| Chunk | Phase | Surface(s) | Status | Branch | Dedup-checked |
|---|---|---|---|---|---|
| A — Foundations | A | `tokens.css` dark mode, `fonts.ts`, `typography.css` | SHIPPED (on `v1-redesign`) | `v1-redesign` @ `5aa3c7d` | N/A |
| B1 — Auth surfaces | B1 | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/setup` | SHIPPED (on `v1-redesign`) | `v1-redesign` @ `b798494` | ✅ |
| B2 — Dashboard + Students | B2 | `/admin`, `/admin/students`, `/admin/students/[id]` | SHIPPED (on `v1-redesign` @ `0424206`) | `component-b2-dashboard-students` → merged | ✅ |
| D — Landing + Features | D | `/` (landing), `/features` | FIRST CUT (on `feature/phase-d-landing-about`, not merged) | `feature/phase-d-landing-about` @ `37d8178` | ✅ |
| **Chunk 1 — Settings + Operator** | B | `/admin/settings`, `/admin/settings/profile`, `/admin/settings/email`, `/admin/settings/2fa`, `/admin/outbox`, `/admin/feedback`, `/admin/waitlist` | **IN PROGRESS** | `v1-component-spine` | ✅ |
| Chunk 2 — Session list / billing log | B3 | `/sessions` (new route) | PENDING | — | — |
| Chunk 3 — Session detail / replay | B4 | `/sessions/[id]` | PENDING — **REQ-S3-1/2** (§3.1) | — | — |
| Chunk 4 — Live workspace + solo mode | B5 | `/sessions/[id]/workspace` | PENDING | — | — |
| Chunk 5 — Student-side mobile | B6 | `/join/[token]` | PENDING | — | — |
| C — URL restructure | C | All `/admin/**` → flatter routes | PENDING (Andrew-gated) | — | — |

---

## §3.1 Slice 3 smoke → B4 requirements (2026-06-07)

Captured from Andrew smoke of `feat/recording-p1-slice3-autonotes`. **Documentation only** — implementation belongs to Chunk 3 / Phase B4, not the recording slice.

### REQ-S3-1 — Formatted markdown display (dedupe)

- **Current bug surface:** `src/components/whiteboard/TutorNotesSection.tsx` renders `note.content` with `whiteSpace: pre-wrap` — users see literal `##` / `-` markdown.
- **Required:** one canonical path — `FormattedNotesBody` (or `RecapEditor` read-only) wrapping a markdown parser output in `.ai-prose`. No second ad-hoc raw-text renderer elsewhere on session review.
- **Repo today:** `.ai-prose` exists in `src/styles/typography.css`; **no** `ReactMarkdown` / `remark` utility yet — Chunk 3 introduces the shared renderer.

### REQ-S3-2 — Post-session note controls

- **Required actions:** **Save notes** (primary); **Cancel and delete session data** (destructive, confirmation dialog copy exactly: *"Are you sure you want to delete this session and all related data?"*).
- **Regression vs pre-slice-3:** `WhiteboardNotesPanel` paired `AiGeneratedNoteReviewGate` (Cancel) with `NewNoteForm` (Save note).

### REQ-S3-2a — OPEN design question

**Save notes** semantics undefined for auto-generated + regeneratable `TutorNote` rows. B4 design pass must choose before wiring (edit commit vs accept draft vs pin version, etc.). See [`v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md) § 2026-06-07.

### REQ-S3-3 — Signed-in identity indicator (shell)

- **Gap (slice 3 smoke):** no on-page indication of which account is active — hard to confirm normal tutor vs admin vs impersonating vs test account.
- **Required:** app shell / `AdminNav` (and parallel `AccountPageShell` nav where applicable) always shows current signed-in identity; clear badge when impersonating (`ImpersonationBanner` complements but does not replace) or on test accounts.
- **Pass:** shell / nav redesign (B3–B6), not recording slice 3.

---

## §4. "Owned by Other In-Flight Work — Do Not Edit"

The following files are locked to recording slice 3 or live-session infrastructure. **Future UI chunk passes must NOT touch these files.**

### Recording Slice 3 (feat/recording-p1-slice3-autonotes)

- `src/lib/recording/extract-chunk.ts`
- `src/lib/recording/notes-enqueue.ts`
- `src/lib/recording/notes-worker.ts`
- `src/lib/recording/transcribe-sweep.ts`
- `src/lib/recording/transcription-worker.ts`
- `src/components/recording/MainPanel.tsx`
- `src/components/recording/RecordingControlPanel.tsx`
- `src/components/recording/MicControls.tsx`
- `src/components/recording/UploadingPanel.tsx`
- `src/components/recording/ErrorCard.tsx`
- `src/components/recording/DoneCard.tsx`
- `src/components/admin/SessionCostPanel.tsx`
- `src/components/whiteboard/TutorNotesSection.tsx`

### Session Review Route (Slice 3 post-session)

- `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/page.tsx`
- `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx`
- `src/app/admin/students/[id]/whiteboard/notes-actions.ts`
- `src/components/whiteboard/WhiteboardNotesPanel.tsx`
- `src/components/whiteboard/WhiteboardReplay.tsx`

### Prisma Schema + Migrations

- `prisma/schema.prisma` — locked to identity phases + recording slice; all migration changes must come from the owning branch
- `prisma/migrations/` — additive only; never drop or rename columns

---

## Changelog

- **2026-06-07:** Initial doc. Component-pass chunk 1 (Settings/operator reskin). Authored by Sonnet subagent on branch `v1-component-spine`.
- **2026-06-07:** Slice 3 smoke requirements **REQ-S3-1/2/2a** added (§3.1, Notes inventory, Chunk 3 row). Branch `docs/v1-redesign-notes-ux-reqs`.
- **2026-06-07:** **REQ-S3-3** signed-in identity indicator (§3.1, `AdminNav` inventory). Branch `docs/v1-redesign-notes-ux-reqs`.
