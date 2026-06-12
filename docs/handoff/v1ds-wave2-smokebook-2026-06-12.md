# v1 design-system Wave 2 — post-smoke fixes + accent refinements — smoke runbook

**Branch:** `v1-design-system`
**Tip commit:** [`14e09ea`](https://github.com/Arangarx/tutoring-notes/commit/14e09eab42f43dfed543efe0085c91c31e6550eb)
**Preview:** [v1-design-system preview](https://tutoring-notes-git-v1-design-system-arangarx-5209s-projects.vercel.app)

---

## Legend

See [`SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md) for field definitions. Run items top to bottom on the **Preview** URL unless noted.

**Both-theme rule (this smokebook):** Every item below must be exercised in **light** and **dark** mode. Each **Action** says where to toggle theme for that surface. **PASS** for an item requires both themes to pass; a failure in either theme → mark **FAIL** for that item.

---

## Feature smoke items

### 1. F7 — Email settings TLS checkbox label alignment

**Action:** On the **Preview** URL, sign in as tutor/admin. **Light mode:** use the admin desktop sidebar footer theme toggle (or marketing/account toggle if already on a route without sidebar — navigate to `/admin/settings/email` first). Open `/admin/settings/email`. Locate the SMTP TLS / secure-connection **CheckboxField** (checkbox + label in one row). Compare vertical alignment of the label text baseline/center to the checkbox square. **Dark mode:** toggle theme to **dark** via the same control; re-inspect the same TLS checkbox row — do not reload unless theme fails to apply.

**Expect:** In **both** themes, the label text is **vertically centered** with the checkbox (same horizontal row, aligned middle — label is not sitting higher than the box). Label remains clickable to toggle. No layout shift when switching themes.

**Ignore this run:** Gmail OAuth connect flow. IMAP field values. Actually sending mail.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 2. F8 — Destructive buttons readable in dark (and still legible in light)

**Action:** **Light mode** first, then **dark** — toggle via sidebar footer (admin) or route-appropriate theme control before each pass.

1. `/admin/dev-tools` — find **Delete** (or equivalent destructive) buttons and **Clear all fixtures** (or equivalent bulk-clear CTA).
2. `/admin/students` — open a test student detail `/admin/students/[id]`; locate the student **Delete** control (do not confirm delete unless using a disposable test student).

On each surface, read button label text on the coral/destructive fill at a normal viewing distance (~arm's length).

**Expect:** **Dark mode:** destructive buttons show **dark text on coral fill** with comfortable contrast (~8:1 or clearly readable — not washed-out light-on-light or illegible). **Light mode:** destructive buttons remain legible (no regression). Fill, border, and hover states do not clip or truncate labels in either theme.

**Ignore this run:** Actually deleting production students or fixtures (visual-only unless disposable test data). Non-destructive accent buttons (separate accent recipe scope).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 3. A4 — Accent-soft tints visible in dark mode (students list)

**Action:** Sign in as tutor. **Light mode:** open `/admin/students`. Observe the search field background and any list-row strips/cards that use accent-soft tinting. **Dark mode:** toggle theme (sidebar footer); stay on `/admin/students` and re-inspect the same search field and row/strip backgrounds.

**Expect:** **Dark mode:** accent-soft surfaces show a **perceptible coral-tinted background** — not invisible/indistinguishable from plain `--surface` gray. **Light mode:** tints remain visible (no regression). Search field and list chrome remain usable; text contrast on tinted areas stays readable in both themes.

**Ignore this run:** Student data accuracy. Avatar colors (T3 — prior wave). Mobile hamburger nav (F2/F3).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 4. F2 — Mobile admin: outside-click closes hamburger drawer

**Action:** Sign in as tutor. Narrow viewport to mobile width (~≤768px) so admin nav collapses to **hamburger**. **Repeat in light, then dark** (toggle via drawer/header theme control if exposed on mobile, or set theme on desktop then resize).

1. Tap hamburger → drawer opens.
2. Tap/click **outside** the drawer (on the dimmed overlay or main content area, not on a nav link).

**Expect:** In **both** themes, outside click **closes** the drawer/menu. Drawer does not trap focus incorrectly; reopening via hamburger works. No console errors on open/close.

**Ignore this run:** Desktop sidebar (no hamburger). Whiteboard workspace mobile chrome.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 5. F3 — Admin: resize does not auto-open hamburger

**Action:** Sign in as tutor on `/admin` (or any admin route with sidebar). **Light mode:** start **desktop-wide** (≥1280px) with hamburger **closed** (sidebar visible). Slowly drag the window narrower and wider across the desktop↔mobile breakpoint **multiple times** (~5 cycles). Do **not** click the hamburger during this pass. **Dark mode:** repeat the same resize exercise.

**Expect:** In **both** themes, the hamburger menu **never auto-opens** from viewport resize alone. It opens **only** on explicit user tap/click. Sidebar↔hamburger transition is smooth; no stuck-open overlay without user action.

**Ignore this run:** Intentional hamburger open/close behavior (F2). Schedule/calendar data.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 6. BG1 — "Mynk" wordmark lands on /admin (not /admin/students)

**Action:** **Light mode:** sign in as tutor. From any admin page, click the **"Mynk"** wordmark in the header/sidebar brand area. Note the URL after navigation settles. **Dark mode:** toggle theme; click wordmark again from a different admin sub-route (e.g. `/admin/students`).

**Expect:** Wordmark `href` targets `/`. While logged in as tutor, server redirect lands on **`/admin`** (dashboard), **not** `/admin/students`. Behavior is consistent in **both** themes. No flash of wrong destination or auth loop.

**Ignore this run:** Logged-out marketing home (`/` without redirect). Parent/account shell wordmark if different component (spot-check only if same brand link).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 7. T9 — Theme toggle present and working on all listed shells

**Action:** For **each** surface below, confirm a theme toggle is **visible** and **functional** (light ↔ dark flip applies immediately). Run **light → dark → light** on each. Use the toggle located on that shell (not devtools).

| Surface | Route / context | Toggle location |
|---|---|---|
| Admin desktop | `/admin` | Sidebar **footer** |
| Account/parent shell | `/account/dashboard` (or `/account/children/[id]`) | Account nav / shell |
| Marketing | `/` or `/features` (logged out OK) | Marketing **header** |
| Student login | `/students/login` | Top-**right** |
| Join flow | `/join` and `/join/preferences` | Header area |
| Share link | `/s/[token]` (valid share token) | Share **header** |

**Expect:** Every row above has a working theme control in **both** starting themes. Toggling updates that page's chrome immediately without full reload (unless share page requires reload — note if so). No missing toggle on any listed route.

**Ignore this run:** Whiteboard workspace theme (separate whiteboard smoke). System/follow-OS option unless explicitly labeled.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 8. A1 — Navy focal card eyebrow legible on navy (both themes)

**Action:** **Light mode:** (1) signed in as tutor on `/admin` — find the navy focal/operator card; read the **"OPERATOR"** eyebrow (or equivalent small caps label on navy). (2) Log out or use incognito — open marketing `/` landing; read the eyebrow on the **navy focal card** on the hero/landing layout. **Dark mode:** repeat both `/admin` operator card and landing navy card eyebrows.

**Expect:** Eyebrow text is **legible on navy background** in **both** light and dark app themes — sufficient contrast; not same-tone-on-navy invisible. Letter-spacing and size remain readable at normal zoom.

**Ignore this run:** Non-navy cards' eyebrows. Body copy inside cards (contrast is eyebrow-specific).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 9. A3 — Tutor approvals quick-link: navy focal only when pending > 0

**Action:** Sign in as tutor. **Light mode:** open `/admin` dashboard. Inspect the **"Tutor approvals"** quick-link card relative to sibling quick-link cards.

- **Case A (zero pending):** if no tutors await approval, confirm card styling.
- **Case B (≥1 pending):** if a pending tutor exists, confirm navy focal treatment and **"(N pending)"** suffix.

**Dark mode:** repeat on `/admin` for whichever case applies.

**Expect:** **Zero pending:** card matches **sibling** quick-link cards (no navy focal-only treatment; no misleading pending count). **≥1 pending:** card shows **navy focal** treatment **and** **"(N pending)"** with correct N. Both themes behave the same logic.

**Ignore this run:** Actually approving/rejecting tutors (optional). If no pending tutor available to verify Case B, **SKIP** with reason in Notes — Case A still must pass.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 10. F9 — Dev-tools copy button: fixed slot, no column reflow

**Action:** Sign in as tutor. Open `/admin/dev-tools`. **Light mode:** find a row with a **copy** button (env snippet, token, or fixture value). Click copy; observe the value text and feedback label. **Dark mode:** repeat on a different copy row if available.

**Expect:** In **both** themes: copied value **stays visible** (does not shrink or disappear). **"✓ copied"** (or equivalent) appears in a **fixed slot** without pushing sibling columns or causing text to jump/shrink. Layout width stable before/after click. Copy still works functionally.

**Ignore this run:** Whether copied value is correct secret (clipboard not verified unless easy). Destructive actions on same page (F8).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 11. F6 — Student detail scroll-spy: "Whiteboard" active at top

**Action:** Sign in as tutor. Open `/admin/students/[id]` on **desktop** (≥1024px) for a student with a **Whiteboard** section and enough content below to scroll. **Light mode:** scroll to the **very top** of the contained content area (first section fully in view). Note which section tab is highlighted. Slowly scroll through sections; watch tab highlight track. **Dark mode:** repeat scroll-spy pass from top.

**Expect:** At scroll top, the **first section tab ("Whiteboard")** is **highlighted/active**. As content scrolls, scroll-spy updates to the visible section without lag or stuck wrong tab. Chrome (avatar, tabs) stays fixed; only content below divider scrolls. Behavior identical in **both** themes.

**Ignore this run:** Mobile stacked layout if tabs differ. Recording FSM / session start.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 12. F5 — Schedule calendar: event dots and today highlight visible

**Action:** Sign in as tutor. Open `/admin/schedule`. **Light mode:** from a normal viewing distance (~arm's length), inspect month grid — **today** cell highlight and **event dots** under day numbers on days with events. **Dark mode:** toggle theme; re-inspect today highlight and dots without zooming browser.

**Expect:** In **both** themes, **event dots** under day digits and the **today** highlight are **clearly visible** at normal distance — not faint to the point of disappearing. Dots remain below digits (S1 regression). Today is distinguishable from other days.

**Ignore this run:** Agenda view. Placeholder event data accuracy. OAuth/sync badges.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 13. F4 — Schedule → integrations back link context

**Action:** Sign in as tutor. **Light mode:**

1. `/admin/schedule` → open **Calendar settings** / **Manage** (or equivalent) to reach calendar **integrations** page. Confirm back link label and destination.
2. Separately: reach the same integrations page from **Settings index** (`/admin/settings` → calendar integrations path).

**Dark mode:** repeat both entry paths.

**Expect:** From **schedule** entry (with `?from=schedule` or equivalent), back link reads **"← Schedule"** and returns to **`/admin/schedule`**. From **Settings index** entry, back link reads **"← Settings"** and returns to settings context. Correct link in **both** themes for both entry paths.

**Ignore this run:** OAuth connect buttons. Actual calendar sync.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 14. T10 — Child detail: per-tutor display names

**Action:** Sign in as **parent** account holder with a child who has **≥1 tutor**. Open `/account/children/[id]` (Overview or profile tab where tutor naming appears). **Light mode:** read the section that formerly said "Tutor's name for this student". **Dark mode:** toggle via account shell nav theme control; re-read the same section.

**Expect:** Heading shows **"What each tutor calls {child}"** (with child's name). **One row per tutor**, each row attributed to that **tutor's name** (not a single ambiguous field). Layout readable in both themes.

**Ignore this run:** Saving/editing names if not in scope. Children with zero tutors (empty state — note in Notes).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 15. F1 — Consent page: live-sessions callout + Recommended labels

**Action:** Sign in as parent. Open `/account/children/[id]/consent`. **Light mode:** read **"Allow live sessions"** block and the audio recording + whiteboard replay toggles. **Dark mode:** toggle theme; re-read same blocks.

**Expect:** **"Allow live sessions"** has a **prominent callout** that live sessions are **required for the app to function** (otherwise essentially just a calendar) — still a **normal switch, not pre-checked**. **Audio recording** and **whiteboard replay** show **"Recommended"** (or equivalent) **and** brief why-it-matters copy. **Nothing pre-checked** on arrival. All copy readable in both themes.

**Ignore this run:** POST/save persistence. Per-tutor grant matrix (T10/T2 prior items).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 16. BG2 — Students roster search pill shape

**Action:** Sign in as tutor. Open `/admin/students`. **Light mode:** inspect the search input at top of roster. **Dark mode:** toggle theme; re-inspect search field corners.

**Expect:** Search box is a deliberate **rounded pill** (`rounded-full` silhouette — fully rounded ends), **not** flat-cornered rectangular. Placeholder and text remain readable; focus ring visible in both themes.

**Ignore this run:** Search functionality/filter results. Accent tint inside pill (A4).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 17. A2 — /features cards: top accent border (3px accent-strong)

**Action:** Log out or use incognito. Open `/features`. **Light mode:** inspect all **6 feature cards** — top edge border. **Dark mode:** toggle via marketing header; re-inspect all six cards.

**Expect:** Each of the **6 feature cards** shows a **clearly visible top accent border** — **3px**, **accent-strong** color — in **both** themes. Border does not clip on hover/focus; card content unchanged.

**Ignore this run:** Feature copy accuracy. Other marketing pages' cards if not the six-up grid.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

This Wave 2 smokebook builds on the **Wave 1 tweak smoke** ([`v1ds-tweak-wave-smokebook-2026-06-12.md`](v1ds-tweak-wave-smokebook-2026-06-12.md) — all items passed) and the **accent recipe proposal** branch (merged into `v1-design-system`; Andrew verdict **KEEP**). Re-run regression spot-checks after this wave merges into the integration branch.

Run this section **after** Wave 2 merges into the integration branch (`v1-redesign` or `master`). Use the **integration branch preview** (fetch alias via Vercel MCP — branch name changes).

**Integration branch:** `<e.g. v1-redesign>`
**Integration tip commit:** `<short-sha>`
**Integration preview:** [<label>](https://<branchAlias>)

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Regression spot-check — Wave 1 + Wave 2 still green

**Action:** On the integration **Preview**, repeat in **light and dark**: tutor login → `/admin` → `/admin/students` → one student detail → `/admin/schedule` → parent `/account/children/[id]/consent`. Spot-check Wave 1 items that were PASS (tab strip, schedule sidebar link, avatar colors, CheckboxField on email).

**Expect:** No regressions vs. Wave 1 tweak smoke or this Wave 2 smokebook; prior PASS items still pass in both themes.

**Ignore this run:** Features not yet merged into integration branch.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 2. Accent recipe KEEP — no drift on merged tokens

**Action:** On integration **Preview**, in **light and dark**, visit `/admin/students`, `/features`, and one destructive button surface. Confirm accent-strong, accent-soft, and destructive fills match the approved proposal (visible tints, readable destructive text).

**Expect:** Accent tokens match merged KEEP verdict; no reversion to pre-proposal invisible dark tints or low-contrast destructive labels.

**Ignore this run:** Whiteboard canvas theme (separate).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Overall result

- [ ] PASS
- [ ] FAIL
