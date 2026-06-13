# v1 design-system post-review tweak wave — smoke runbook

**Branch:** `v1-design-system`
**Tip commit:** `[6587592](https://github.com/Arangarx/tutoring-notes/commit/6587592b02ad3026c6c9caab9a5a63d9eb776ca5)`
**Preview:** [v1-design-system preview](https://tutoring-notes-git-v1-design-system-arangarx-5209s-projects.vercel.app)
**Overall result:**

- [ ] PASS
- [ ] FAIL

---

## Legend

See `[SMOKEBOOK-TEMPLATE.md](SMOKEBOOK-TEMPLATE.md)` for field definitions. Run items top to bottom on the **Preview** URL unless noted.

---

## Feature smoke items

### 1. T1 — Account child tab strip (no stray vertical scrollbar)

**Action:** On the **Preview** URL, sign in as a parent account holder with at least one child profile. Navigate to `/account/children/[id]` (Overview tab). Resize the browser to a narrow width (~360px) so the tab strip (`Overview`, `Notes`, `Devices`, `Consent`) may scroll horizontally. Observe the tab row above the divider — scroll horizontally if needed. Repeat on `/account/children/[id]/consent`.

**Expect:** Horizontal scroll works when tabs overflow; **no vertical scrollbar** appears on the tab strip itself. Tab labels stay on one row; active tab underline/border renders cleanly without clipped descenders forcing vertical overflow.

**Ignore this run:** Content scrolling below the tab strip (expected). Consent save behavior (visual-only).

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 2. Consent copy — floor vs per-tutor labels

**Action:** On the **Preview** URL, signed in as parent, open `/account/children/[id]/consent` for a child with at least one tutor listed (or use placeholder tutors if shown). Read the section headings and helper copy for the per-tutor grant area and the cross-tutor restriction area.

**Expect:** Per-tutor grants are labeled **"What each tutor may do"** (or equivalent visible heading). Cross-tutor hard blocks are labeled **"Always-off limits"** (or equivalent). Copy clearly distinguishes floor vs per-tutor toggles; no logic/POST changes — layout and labels only.

**Ignore this run:** Save button behavior (still visual-only). Whether toggles persist (out of scope).

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Pass BUT we need to STRONGLY encourage allow live sessions (the app is almost pointless without it), and audio and whiteboard replay...basically the first option is required to do anything, the second two are needed to make replay and review ability have meaning.**

### 3. T8 — Admin desktop content width + sidebar gap

**Action:** On the **Preview** URL, sign in as tutor/admin on **desktop** (≥1280px wide). Open `/admin` (dashboard) and `/admin/students`. Observe the main content column width relative to the viewport and the gap between the left sidebar rail and the content area.

**Expect:** Main content uses the wider shell — noticeably wider than the old `max-w-4xl` (~896px) cap; at xl breakpoint content can grow toward ~1280px (`max-w-6xl` / `xl:max-w-7xl`). Sidebar↔content gap is **tighter** (`gap-6`, not `gap-8`). Layout does not overflow horizontally; mobile breakpoints unchanged.

**Ignore this run:** Whiteboard workspace routes (different chrome). Operator-only pages if sidebar is absent.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Pass BUT I should be able to click out of the menu to close it (when the view is narrow and nav is in the hamburger)**

### 4. schedule-nav — Schedule link on desktop sidebar

**Action:** On the **Preview** URL, signed in as tutor on **desktop** (sidebar visible, not mobile hamburger-only). Look at the left `AdminSidebarNav` link list. Click **Schedule**.

**Expect:** **Schedule** appears in the desktop sidebar nav (not mobile-only). Link navigates to `/admin/schedule` without error. Active state highlights when on the schedule route.

**Ignore this run:** Scheduler data/OAuth (visual-only placeholders). Mobile bottom-tab Schedule link (separate nav — should still work).

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:  When I shrink my view, the hamburger menu shouldn't pop up automatically.  For some reason it started doing that mid session when I'm changing size.  I know it's not hooked up yet, but if I get to calendar settings from the calendar, nav back should to back to the calendar, not the settings page.**

### 5. S1 — Scheduler calendar day dots under digit

**Action:** On the **Preview** URL, signed in as tutor, open `/admin/schedule`. In the month calendar, find a day cell that has one or more scheduled events (colored dots). Compare dot position relative to the day number.

**Expect:** Event indicator dots sit **below the day digit** (stacked under the number), not centered in the middle of the cell. Multi-event days show multiple dots in that lower stack. Day number remains readable above the dots.

**Ignore this run:** Agenda view layout. Placeholder event data accuracy.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Pass, BUT the dots and today highlighter (particularly the dots under the dates) need more visability in dark mode.  I reviewed light mode too and the today is maybe okay, but the dots underneath definitely need more visibility there too.  If I sit back a bit, I almost can't even see them.  When we do the comprehensive smoke before the master cut, make sure the smoke book is doing everything in both color schemes so I have looked at everything at least once before master.**

### 6. S2 — Scheduler day detail card spacing

**Action:** On `/admin/schedule`, select a day that shows sessions in the **Day detail** panel (right column on desktop, or below calendar on narrow widths). Inspect session rows: time range, student name, sync badge.

**Expect:** Day detail card has **comfortable padding** (not scrunched). Time ranges display on one line (`whitespace-nowrap` — no awkward mid-time wraps). Day-detail column is **wider** than before on desktop grid. Text does not collide with badges.

**Ignore this run:** Sync badge vocabulary / OAuth (wiring-phase). Create-session dialog behavior.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 7. T6 — Student detail contained scroll + scroll-spy tabs

**Action:** On the **Preview** URL, signed in as tutor, open `/admin/students/[id]` for a student with enough content to scroll (sessions, notes, or multiple sections). On **desktop**, click each section tab in the student detail header (e.g. Overview, Sessions, Notes — whatever tabs are present). Then scroll the **content area below the header divider** with the mouse wheel.

**Expect:** **Chrome stays fixed** — avatar, name, tabs, and top actions do not scroll away. Only the content **below the divider** scrolls inside a contained scroll region. Clicking a tab scrolls/jumps to the matching section; active tab updates as sections enter view (scroll-spy). No double scrollbars on the whole page.

**Ignore this run:** Recording FSM behavior. Whiteboard session start/end.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Pass BUT When I'm scrolled to the top of the section it doesn't highlight "Whiteboard"  The "which section am I" highlighting could use slightly better detection, but I love that it's there.**

### 8. T7 — Student detail recording controls layout

**Action:** On `/admin/students/[id]`, locate the recording control block (mic / start session / recording CTAs in the student detail chrome). View at desktop width and narrow (~400px). Inspect button alignment and wrapping.

**Expect:** Controls sit in a **clean row or deliberate stack** — no awkward mid-row wraps or misaligned baselines. Primary coral actions use `**<Button variant="accent">`** styling (coral pill). **No recording logic change** — same states as before; only layout/visual cleanup.

**Ignore this run:** Actual record/upload lifecycle. Outbox errors.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 9. T3 — StudentAvatar deterministic palette

**Action:** On the **Preview** URL, open `/admin/students` roster. Note avatar colors for two students. Open each student's detail page — confirm avatar color matches the roster. Optionally check `/account/dashboard` child cards or `/admin/schedule` session rows for the same student name.

**Expect:** Each student shows **1–2 white semibold initials** on a **colored circle** with a subtle ring. **Same display name → same color** across roster, detail, schedule, and account surfaces (FNV-1a hash into `--avatar-1`…`--avatar-8`). Colors are on-brand (not random hex).

**Ignore this run:** Learner waiting room if no easy test student. Upload photo avatars (not implemented).

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### 10. T4 — CheckboxField on email SMTP TLS toggle

**Action:** On the **Preview** URL, signed in as tutor, navigate to `/admin/settings/email`. Find the SMTP TLS / secure connection checkbox (or equivalent boolean field using the shared primitive).

**Expect:** Toggle renders as shadcn `**Checkbox` + `Label`** in a horizontal row with `**gap-3**` between box and label (`CheckboxField`). Label is clickable and toggles the box. **No native** `<input type="checkbox">` styling for this field. Focus ring visible on keyboard tab.

**Ignore this run:** Gmail OAuth connect flow (separate item). Actually sending email.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Pass for the spacing but fail for alignment.  The text should be in line with the checkbox, not higher.**

### 11. T5 — Connect Gmail notice above CTA

**Action:** On `/admin/settings/email`, locate the **Connect Gmail** section. Read the Mortensen Apps legal notice relative to the connect button.

**Expect:** `**AuthMortensenNotice`** (or equivalent mortensenapps.com copy) appears **above** the Connect Gmail button — not only below it. Connect CTA is a **coral accent button** (`<Button variant="accent" asChild>` wrapping the link/action). User can read the notice before clicking.

**Ignore this run:** Actual OAuth redirect / token storage. IMAP SMTP fields below.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

**T2 accent-recipe pass** is **not** in this smoke scope — it lives on proposal branch `v1ds/accent-recipe-proposal` awaiting Andrew's approval. Re-run a dedicated smokebook after that branch merges.

Run this section **after** the tweak wave merges into the integration branch (`v1-redesign` or `master`). Use the **integration branch preview** (fetch alias the same way — branch name changes).

**Integration branch:** `<e.g. v1-redesign>`
**Integration tip commit:** `<short-sha>`
**Integration preview:** 

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Regression spot-check — prior merged features still work

**Action:** On the integration **Preview**, smoke the highest-risk flows from recently merged branches. At minimum: tutor login, open one student, start or resume a whiteboard session, draw one stroke, end session without error toast.

**Expect:** No new failures vs. the last green integration smoke; end-session completes; no auth loop.

**Ignore this run:** Features not yet merged into this integration branch. T2 accent pass (pending separate approval).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**