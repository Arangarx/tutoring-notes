# Wave 5 — whiteboard chrome visual polish — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [`255e732`](https://github.com/Arangarx/tutoring-notes/commit/255e732)
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

**Context:** Wave 5 chrome polish on the unified whiteboard shell. Five scoped items: coral student Exit, smaller/iconic follow/match controls, overflow sheet alignment + scroll affordance, top-bar overflow dropdown opens downward, grid toggle as icon (shared). Tutor baseline CSS from `5d56f49` must remain untouched except intentional shared-control changes (#4, #5).

---

### 1. Coral Exit button (student)

**Action:** Join a live session as **student** on **desktop** (≥1100px), **phone portrait** (≈390×844), and **phone landscape** (≈844×390). Locate the **Exit** control in the top-bar trailing zone (`data-testid="wb-student-exit"`). Confirm it shows a **coral** fill (brand `--accent`) with an **exit/door icon** — not plain gray text-only "Exit". Click Exit; confirm leave flow still works.

**Expect:** Exit is visually distinct (coral CTA + icon). `aria-label="Exit"` present. Leave disconnects student and shows left-session status. **Tutor** top bar still shows **End session** (not coral Exit) — unchanged.

**Ignore this run:** View-lock-while-synced behavior (out of scope).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 2. Smaller Match tutor's view + follow/match iconography (student)

**Action:** **Student desktop:** find **Follow tutor view** chip and **Match tutor's view** control in the top bar (`data-testid="wb-student-follow-toggle"`, `data-testid="wb-student-match-view"`). Toggle follow on/off — note **link/sync icon** on follow chip and highlighted state when synced. Click match — **crosshair icon** button (compact, smaller than prior text "Match view"). **Student touch (portrait + landscape):** open top-bar overflow **⋯**; confirm follow row uses link icon, match row uses crosshair icon, both left-aligned with other items.

**Expect:** Follow vs one-time match are visually distinguishable by iconography. Match control is smaller (icon-forward) on desktop. Overflow sheet items align consistently (not mixed left/right).

**Ignore this run:** Tutor role (no follow/match controls).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 3. Overflow sheet alignment + scroll affordance

**Action:** **Student phone portrait** (and landscape if content is tall): open top-bar overflow **⋯** (`data-testid="wb-student-topbar-overflow"`). Scan all rows — follow, match, undo/redo, cam, grid, theme, disclosure blocks. Confirm **consistent left alignment** (icons + labels start at same edge). If the list exceeds viewport height, confirm **scroll is obvious** — visible thin scrollbar and/or bottom fade hinting more content below. Also open bottom-toolbar **More** sheet (`data-testid="wb-more-sheet"`) on touch; confirm same alignment + scroll affordance on long content.

**Expect:** No row sits right-aligned while others are left-aligned. Overflowing menus scroll with a clear affordance (scrollbar and/or fade).

**Ignore this run:** Desktop wide layout where overflow **⋯** is hidden (items inline).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 4. Overflow ⋯ menu drops down (tutor + student)

**Action:** On **touch layouts** (phone portrait + landscape) for **both tutor and student**: tap top-bar overflow **⋯** (`data-testid="wb-topbar-overflow"` or `wb-student-topbar-overflow`). Confirm the menu opens **downward below the trigger** (dropdown panel), **not** as a bottom sheet sliding up from the screen edge. At narrow width, confirm panel does not clip off the right edge; scroll inside if needed. Dismiss via outside tap.

**Expect:** Dropdown anchored under **⋯** with `data-testid="wb-topbar-overflow-dropdown"`. Opens downward. Usable at phone portrait and landscape widths.

**Ignore this run:** Desktop layout where **⋯** is `display:none` (controls inline).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 5. Grid toggle as icon (tutor + student, shared)

**Action:** **Tutor desktop:** locate grid icon toggle in top bar (`data-testid="wb-grid-toggle"`) — replaces old "View options" ⋯ submenu. Click to toggle canvas grid on/off; confirm icon shows active state when grid enabled. **Student desktop:** same grid icon toggle. **Both roles touch:** open top-bar overflow **⋯**; confirm grid row is an icon+label menu item (`data-testid="wb-overflow-grid-toggle"`), not a lone checkbox label. Toggle grid; confirm Excalidraw grid appears/disappears.

**Expect:** Grid is an icon control on desktop for both roles. Overflow uses icon+label row. Tutor top bar otherwise unchanged (Share, mic, End session, etc.).

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 6. Student active board tab highlight (read-only)

**Action:** Join a live session as **student** with **2+ boards** (tutor adds a second board). Confirm bottom board tab strip (`data-testid="wb-student-page-strip"`) shows all boards but tabs are **not clickable**. Confirm the **currently active board tab** has the same visual active treatment as tutor (accent underline, bold label, dot indicator) via `aria-current="page"` on the active tab. Tutor switches boards — confirm student's active highlight **updates** to match tutor's page without student clicking.

**Expect:** Active tab clearly highlighted as read-only indicator. Inactive tabs muted. No page switch on student click. Tutor tab strip unchanged (still interactive).

**Ignore this run:** View-lock and graph-entry items (separate smoke items).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 7. View lock while synced (desktop + phone)

**Action:** **Student desktop** and **phone portrait + landscape:** with **Follow tutor view ON** (synced), attempt to **pan and pinch/zoom** the canvas. Confirm the view **does not move** (no move-then-snap-back jank). Toggle follow **OFF** (independent view) — confirm pan/zoom works freely. Toggle follow back ON — confirm view re-syncs and pan/zoom locks again. Use **Match tutor's view** once while in independent mode — confirm it snaps and re-locks.

**Expect:** While synced, student viewport is locked. While independent, free pan/zoom. Tutor viewport behavior unchanged.

**Ignore this run:** Graph embed entry (separate item).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 8. Student graph expression entry (local)

**Action:** Tutor inserts a **graph embed** on the board. **Student** opens the session (desktop or phone). Tap the graph embed — confirm **expression panel** is available (ƒ Expressions toggle, add field). Enter a local expression (e.g. `x^2`) and plot it on **student screen only**. Tutor's graph should **not** update from student entry. Tutor adds/changes an expression on their side — confirm student graph **updates from tutor sync** (tutor state wins over stale local edits).

**Expect:** Student can interact with graph embed locally. No broadcast of student graph edits to tutor/board. Tutor-origin graph state still syncs to student.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

_Not applicable until Wave 5 merges to integration branch._

---

## Overall result

- [ ] PASS
- [ ] FAIL
