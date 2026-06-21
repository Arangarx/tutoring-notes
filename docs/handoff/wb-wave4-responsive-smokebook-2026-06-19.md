# WB Wave 4 — responsive chrome parity — smoke runbook

**Branch:** `wb-wave4-responsive`
**Tip commit:** `[bff6a9b](https://github.com/Arangarx/tutoring-notes/commit/bff6a9b734a3edf02a18911c8d38242b53525869)`
**Preview:** [wb-wave4-responsive preview](https://tutoring-notes-git-wb-wave4-responsive-arangarx-5209s-projects.vercel.app)

**Context:** Restores tutor-known-good responsive behavior post-unification and brings the student role to parity at **desktop**, **phone portrait**, and **phone landscape**. Baseline reference: tutor chrome on `5d56f49` (last commit before wb-unify coding). Shared `data-layout` rules are role-agnostic; student-only top-bar compaction uses `data-role="student"` CSS + overflow sheet.

**Device matrix:** Use real hardware or DevTools device mode. Suggested viewports: **desktop** ≥1280×800; **portrait** 390×844 (iPhone 14); **landscape** 844×390 (iPhone 14 landscape). Tutor = signed-in admin workspace; student = `/w/<joinToken>#k=<key>` join link.

---

## Legend


| Field              | How to fill it                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Overall result** | PASS only if every in-scope item is PASS. FAIL if any in-scope item fails.               |
| **PARTIAL**        | Some sub-checks pass and others fail — spell out exactly what worked vs didn't in Notes. |


Run order: top to bottom. Re-run **Cross-branch / post-merge** after integration to `v1-redesign`.

---

## Cross-branch / post-merge

*(Stub — fill after merge to `v1-redesign` / master if this smokebook is re-run on the integration tip.)*

---

## Tutor — desktop (≥1280×800)

### 1. Tutor desktop — full chrome + tool strip

**Action:** Sign in as tutor. Start or resume a live whiteboard session at **desktop** width (≥1280px). Without resizing, confirm: top bar (LIVE pill, timer, Share, mic/cam, undo/redo, inserts, view menu, theme, End session); **left tool strip** (select, pencil, eraser, text, laser, shapes▾, more, collapse); **sidebar stroke props** when pencil active (compact panel on strip); board tab strip with `+`. Draw one stroke.

**Expect:** All chrome visible without horizontal scroll in the top bar. Left strip and props panel reachable. No items clipped off-screen. Stroke renders. `data-layout="desktop"` on `data-testid="mynk-wb-chrome"`.

**Ignore this run:** Student role. Laser distinct colors (deferred polish). Notes/review mode.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 2. Tutor desktop — styles / shapes / more menus

**Action:** With pencil selected, open the **compact props** trigger on the left strip (`data-testid="wb-props-compact-trigger"`). Change stroke color and width. Open **Shapes** pulldown from the strip; pick rectangle. Open **More** popover (desktop); confirm hand tool and z-order entries present.

**Expect:** Props panel opens beside strip; color/width changes apply. Shapes dropdown lists all shape types. More popover opens without clipping. No need for fullscreen to see tools.

**Ignore this run:** Student role. Mobile layouts (items 3–4).

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes: There actually hasn't been a hand tool for a long time.  We should probably have it somewhere just in case.  Right now it's roughness, edge sharpness, and z-order in "more styles"**

---

## Tutor — phone portrait (≈390×844)

### 3. Tutor portrait — top bar + bottom tool bar

**Action:** Resize to **phone portrait** (≈390×844) or use iPhone hardware. Reload tutor workspace. Confirm top bar shows: wordmark, LIVE, timer, **Hide/Show tools** toggle, mic/cam, **overflow (⋯)**, End session icon. Confirm **left strip hidden** and **bottom tool bar** visible (`data-testid="wb-bottom-toolbar"`). Tap **Styles** on bottom bar; confirm props sheet opens (`data-testid="wb-props-sheet"`). Tap Shapes; confirm shapes sheet. Draw with pencil.

**Expect:** Top bar fits without off-screen controls — overflow button reachable. Bottom bar shows Select · Pencil · Eraser · Shapes · Styles · Wand · More. Props/styles sheet opens and is usable. Canvas remains drawable. `data-layout="narrow"` or `tablet-portrait`.

**Ignore this run:** Phone-landscape left tool rail (item 4 — intended layout). Student role.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:  There is no "more styles" section with all the other options in the styles sheet.**  
**Shouldn't there be some sort of indicator on the shapes button that it let's you select more options?**  


---

## Tutor — phone landscape (≈844×390)

### 4. Tutor landscape — left tool rail + props chip

**Action:** Rotate to **phone landscape** (≈844×390). Reload tutor workspace. Confirm **tier-1 tools on the slim left vertical rail** — this is the **intended** landscape layout (bottom toolbar rendered vertically on the left). Confirm **Colors & styles** compact chip overlays top-left of canvas (`data-testid` props mobile bar). Open overflow **⋯** from top bar; confirm Share copy, theme, inserts reachable. Scroll the left rail if needed; draw and switch tools.

**Expect:** Left tool rail present and tools reachable (scroll if needed); canvas not obscured by chrome. Props chip visible and opens sheet on tap. Top bar not clipped. `data-layout="phone-landscape"`.

**Ignore this run:** Left-rail placement on the left edge (intended design — **do not fail** for vertical rail on the left). Fail only if tools are off-screen/unreachable, **More** cannot be scrolled into view, or the layout over-compacts top-bar controls despite available width.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes: No "other shapes" selector.**  
**Why is so much compacted in landscape? There is room in the top bar in landscape.**  
**Not sure what you're saying is a known acceptable quirk.  The bar is supposed to be on the left in landscape.  This same test even says to look for it.**

---

## Student — desktop (≥1280×800)

### 5. Student desktop — top bar fits with recording disclosure

**Action:** Open student join link on **desktop** width (window not necessarily fullscreen — e.g. 1100×700). Read top bar left-to-right without scrolling: tutor name, **recording disclosure** line (`data-testid="wb-student-recording-disclosure"`), Connected pill, timer, mic/cam, undo/redo, theme, **Exit**. Confirm **left tool strip** and stroke props (desktop) match tutor parity.

**Expect:** Disclosure visible (single-line ellipsis OK) and **not** pushing mic/cam/Exit off-screen. Full tool strip visible without fullscreen. Exit button always reachable.

**Ignore this run:** Tutor-only Share/End session. Asset inserts (tutor-only).

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes: Still double connected pill (call connected after connected).**  
**Follow tutor view checkbox still not inline**  
**If student shrinks desktop screen to about half the screen controls start running off the screen instead of contracting.**  


---

### 6. Student desktop — styles panel + shapes dropdown

**Action:** Student desktop. Select pencil. Open **compact props** on left strip OR styles controls. Change color. Open **Shapes** pulldown (desktop); pick ellipse. Open **More** menu.

**Expect:** Styles/props panel visible and functional (P2 regression: "no more styles section"). Shapes dropdown shows all shapes (not just line). Tools not lost when window is not fullscreen.

**Ignore this run:** Mobile layouts (items 7–8).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Student — phone portrait (≈390×844)

### 7. Student portrait — top bar compaction + overflow

**Action:** Student join on **phone portrait**. Before drawing, scan top bar: should show **Hide/Show tools**, **overflow (⋯)** (`data-testid="wb-student-topbar-overflow"`), and **Exit** — not a wall of pills pushing controls off-screen (P2: "can't see anything past Connected pill"). Open overflow sheet; confirm **recording disclosure**, connection/timer summary, undo/redo, cam toggle, follow tutor view, grid, theme. Tap **Styles** on bottom bar; confirm props sheet. Draw pencil + one shape.

**Expect:** No horizontal clipping of Exit/overflow. Status pills and disclosure live in overflow on touch, not inline. Bottom tool bar complete (Select · Pencil · Eraser · Shapes · Styles · Wand · More). Styles sheet opens.

**Ignore this run:** Follow toggle in top bar (desktop only; overflow on mobile).

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes: No "more styles" button.**

---

### 8. Student portrait — board tabs read-only

**Action:** Student portrait. Tutor adds Board 2 and draws on it. On student, confirm page strip shows tabs (`data-testid="wb-student-page-strip"`) but student **cannot** add/delete/switch arbitrarily (read-only strip — follows tutor page). Strokes sync.

**Expect:** Tabs visible and compact (≤40px height). No broken empty strip. Sync works.

**Ignore this run:** Tutor page admin controls.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Student — phone landscape (≈844×390)

### 9. Student landscape — left rail tools + props chip

**Action:** Student join in **phone landscape** (≈844×390). Confirm **left vertical tool rail** — same **intended** landscape layout as tutor. Scroll the rail if needed. Props chip top-left opens styles sheet. Top bar: overflow + Exit reachable. Draw and change stroke color via sheet.

**Expect:** Parity with tutor landscape layout. Left rail present; tools reachable (scroll if needed). Top bar not clipped.

**Ignore this run:** Left-rail placement on the left edge (intended design — **do not fail** for vertical rail on the left). Fail only if tools are off-screen/unreachable, **More** cannot be scrolled into view, or the layout over-compacts top-bar controls despite available width.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes: Same as with tutor in landscape, no "more" in left strip, probably off screen.**

---

## Shared — toolbar hide/show (touch)

### 10. Hide tools toggle — tutor + student (portrait)

**Action:** On **phone portrait**, tutor and student separately: tap **Hide tools** in top bar. Confirm bottom tool bar and props mobile bar collapse; canvas gains space. Tap **Show tools**; bars return.

**Expect:** `data-toolbar-hidden` toggles; tools hide/show without breaking layout. Toggle reachable in both roles.

**Ignore this run:** Desktop layout (toggle hidden on desktop).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Round 2 — post-fix re-smoke (branch wb-wave4-responsive @ 17dc8d4)

**Preview:** Same branch alias — [wb-wave4-responsive preview](https://tutoring-notes-git-wb-wave4-responsive-arangarx-5209s-projects.vercel.app) — now serving commit [`17dc8d4`](https://github.com/Arangarx/tutoring-notes/commit/17dc8d4). Re-verify only the six fixes below; round-1 results above stay authoritative for everything else.

---

### R2-1. Mobile styles sheet — "more styles" present (tutor + student, portrait + landscape)

**Action:** On the **Preview** URL @ `17dc8d4`, run **four passes**: **tutor** and **student** separately, each at **phone portrait** (≈390×844) and **phone landscape** (≈844×390). Select pencil. **Portrait:** tap **Styles** on the bottom tool bar (`data-testid="wb-bottom-toolbar"`). **Landscape:** tap the **Colors & styles** compact chip (`data-testid` props mobile bar). Scroll the sheet if needed.

**Expect:** The styles/props sheet shows **roughness**, **edge sharpness**, **z-order** (send back / backward / forward / front), and **delete selected** — all visible without hunting below the fold on every pass.

**Ignore this run:** Desktop props panel (round-1 item 6 PASS). Hand/pan tool re-add deferred ([`WB-HAND-TOOL-MISSING`](../BACKLOG.md)). Items already PASS in round 1 with no code change.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### R2-2. Mobile shapes — selector + affordance (tutor + student, portrait + landscape)

**Action:** Same four passes as R2-1 (tutor + student × portrait + landscape). Locate **Shapes** on the bottom bar (portrait) or left rail (landscape). Observe the button chrome for a **▾ / caret** affordance. Tap to open the shapes sheet; confirm **all** shape types listed (match desktop set — rectangle, diamond, ellipse, arrow, line, etc.). Pick a non-default shape (e.g. diamond). Tap **Shapes** again with a short tap (no long-press) — confirm it selects the current shape without reopening the sheet.

**Expect:** Shapes button shows a visible **▾/caret** affordance indicating more options. Sheet lists **all** shape types (same set as desktop). Main tap on the button selects the current shape; sheet opens on the explicit expand gesture.

**Ignore this run:** Desktop shapes pulldown (round-1 item 6 PASS). Device hotplug / rotation mid-gesture out of scope.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### R2-3. Phone-landscape no over-compaction (tutor + student)

**Action:** **Tutor** then **student** at **phone landscape** (≈844×390). Reload each workspace. Scan the **top bar** left-to-right: **tutor** — Share, mic/cam, undo/redo, theme should remain **inline** when width allows (not dumped to overflow while space remains). **Student** — mic/cam, undo/redo, theme inline similarly. Scroll the **left tool rail**; confirm **More** is reachable on-screen. Left vertical rail should be present (intended layout).

**Expect:** Landscape top bar **uses available width** — Share (tutor), mic/cam, undo/redo, and theme stay inline rather than over-compacting into overflow when room exists. Left tool rail scrolls so **More** is on-screen and tappable. Left rail on the left edge is **intended** — not a defect.

**Ignore this run:** Left-rail placement on the left (intended — fail only for unreachable tools or over-compaction). Phone portrait (round-1 items 3/7). Exact pixel spacing nits.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### R2-4. Student desktop — single connection pill

**Action:** Open the student join link at **desktop** width (≥1100px, window need not be fullscreen). Read the top-bar **connection status** area left-to-right. Join or resume a live session with A/V if needed to observe state transitions.

**Expect:** Exactly **one** connection-status pill — no duplicate **"Connected"** plus **"call connected"** (or similar double pill). Pill text shows **Joining…**, **Call reconnecting…**, or **Connected** appropriately for session state.

**Ignore this run:** Tutor role (different top bar). Mobile portrait/landscape where status lives in overflow (round-1 items 7/9). Transient reconnect flapping — note in Notes, do not fail on one blip.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### R2-5. Student desktop — progressive compaction (no off-screen overflow)

**Action:** Student join at **desktop** width (start ~1280px). Slowly shrink the browser window toward **~half width** (≈550–650px). Watch top-bar controls throughout; confirm **Exit** stays reachable at every width.

**Expect:** Controls **contract progressively** as width decreases — overflow **⋯** appears by **≤980px** and absorbs displaced items. No controls run **off-screen** horizontally at any width. **Exit** always reachable (inline or via overflow).

**Ignore this run:** Phone portrait/landscape (separate round-1 items). Tutor role. Fullscreen-only layouts.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### R2-6. Follow-tutor-view toggle inline + styled

**Action:** **Student desktop** (≥1100px): locate the **Follow tutor view / Match tutor's view** toggle in the top bar — confirm it sits **inline** with other chrome controls and uses chip-consistent styling (not an out-of-line raw checkbox). **Student phone portrait** (≈390×844): open top-bar overflow **⋯**; confirm the toggle lives in the overflow sheet (not required inline on touch).

**Expect:** **Desktop** — toggle is **inline** in the top bar, styled consistently with other chrome chips (not out-of-line). **Touch** — toggle remains in overflow, not cluttering the compact top bar.

**Ignore this run:** Tutor role (no follow toggle). Round-1 items already PASS where unchanged. Minor label copy differences.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Overall result

- [ ] PASS
- [ ] FAIL