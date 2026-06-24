# Wave 5 — whiteboard chrome visual polish — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [`8050e95`](https://github.com/Arangarx/tutoring-notes/commit/8050e952b355d486f9c7c3a9bd07231b52fc7c4c)
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

**Context:** Wave 5 chrome polish on the unified whiteboard shell. Items 1–13 = original Wave 5 scope + round-2 hardware follow-ups. **Round-3 (`8050e95`):** AV mic/cam back on **self-tile overlay** (not cluster footer), student top-bar **mic level meter**, loading-guard race fix, student `[pvs]` console quieting, dark-theme native device-picker contrast. Item 19 = pilot audio triage on student desktop (phone already known-good).

**Playwright:** Items 1–7, 10–11, 13 + native-select regression are in `tests/integration/wb-wave5-polish.spec.ts`. Items 8/12 + exit/rejoin/banner in `wb-student-exit-rejoin.spec.ts` + invariants. Mark **N/A with notes** `[automated: …]` when Andrew is only re-spot-checking subjective UX.

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

**7a. Extreme-pan regression (view-lock sync bug, 2026-06-21 fix):** While **Follow tutor view is ON**, have the tutor **zoom way out** (e.g. 25–50% zoom) then **pan far in all four directions** — well past the quadrant boundaries, to the far edges of the infinite canvas. **Student must keep following continuously with no cutoff** — viewport must track the tutor the entire distance. Repeat on **desktop** and **phone** (portrait + landscape). Tutor viewport must be unchanged by this test.

**Expect:** While synced, student viewport is locked. While independent, free pan/zoom. Tutor viewport behavior unchanged. At extreme pan/zoom the student follows all the way — no premature cutoff.

**Ignore this run:** Graph embed entry (separate item).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 8. Student graph expression entry (BIDIRECTIONAL sync — updated Wave 5 round-2)

**Action:** Tutor inserts a **graph embed** on the board. **Student** opens the session (desktop or phone). Tap the graph embed — confirm **expression panel** is available (ƒ Expressions toggle, add field).

**Direction A — student→tutor:** Student enters an expression (e.g. `y=x^2`) and plots it. Confirm the tutor's graph embed **updates to show the student's expression** (broadcasts like a stroke). Both participants should now see `y=x^2` on the graph.

**Direction B — tutor→student:** Tutor enters a different expression (e.g. `y=2x+1`) on their graph. Confirm student's graph **updates to show the tutor's expression** (tutor state syncs down). Last-write-wins — whichever edit landed last is what both see.

**Both together:** Simultaneously edit on both sides a few times. Confirm neither side freezes or shows stale data indefinitely; both eventually converge to the last write.

**Expect:** Bidirectional sync — student graph edits broadcast to tutor/board; tutor graph edits sync to student. No permanent divergence. Expression panel available to student (not read-only). View-lock (item 7) still works — follow mode still locks student viewport while graph syncs.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

## Round-2 fix batch (2026-06-21 hardware smoke follow-ups)

Items 9–13 address issues found during Andrew's hardware smoke of the original 8 items above.

---

### 9. Follow-toggle pill vertical centering (student)

**Action:** Join a session as **student** on desktop (≥1100px). Look at the **"Follow tutor view"** pill/toggle in the top bar. Compare its vertical position to the other top-bar controls (e.g. Match tutor's view button, the board tabs, the Exit button). The pill and its checkbox should sit at the **same vertical midpoint** as the neighbouring controls — not floating above them.

Toggle the follow control on/off to confirm active styling (coral/accent highlight from slice-1) is unchanged.

**Expect:** Follow-toggle pill is vertically centred in the top bar. Active/synced colouring unchanged.

**Ignore this run:** Phone portrait (pill in overflow sheet; not affected by this fix).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 10. Left tool-rail "More" reachable on short window (tutor + student)

**Action:** Open a session as **tutor**. Resize the browser window to a **short viewport** (e.g. 500–600px tall). The left vertical tool rail (selection, pencil, eraser, line, connector, wand, …, **More** at the bottom) should be scrollable if its content overflows.

1. Hover / tap the left rail and **scroll down** (mousewheel or trackpad) — confirm the rail scrolls and the **"More"** button becomes visible and clickable.
2. Confirm the rail does NOT collapse to a tiny pane — at a normal viewport height (800px+) it still fills the full available height.
3. Repeat at a tall viewport — confirm no regression (rail still shows all tools without needing to scroll).
4. Repeat as **student** — same scrollable left rail.

**Expect:** Left rail scrolls vertically when the window is short. "More" button is reachable. Rail keeps full height at normal viewport. No horizontal scroll or clipping.

**Ignore this run:** The top-bar overflow ⋯ sheet (distinct control; item 3/4 above and item 11 below).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 11. Freeze bug: overflow dropdown open → resize wider → no hang (reliability)

**Action:** This is the reliability regression repro. Perform on **desktop**:

1. **Narrow** the browser window until the top-bar overflow **⋯** button is visible (touch/compact layout — roughly ≤900px).
2. **Open** the overflow dropdown (tap ⋯) so the dropdown panel is visible on screen.
3. With the dropdown still open, **drag the window wider** past the inline breakpoint (≈900–1100px) so the ⋯ button is no longer rendered (controls go inline).
4. Confirm the page **remains fully responsive** — tabs, buttons, board, all interactive. The dropdown should have closed cleanly.
5. Repeat: widen with dropdown closed (baseline) — no freeze expected.

**Expect:** No freeze, no "wait or kill page" browser prompt, no hang. Dropdown closes automatically when the layout switches. Page is immediately interactive after the resize.

**Ignore this run:** Nothing — this was a reliability crash; must PASS.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 12. Student graph entry bidirectional sync (new item — replaces item 8 expectation)

*See updated item 8 above for the full bidirectional sync test. This item is a checklist reminder for the specific round-2 fix (enabling student→tutor broadcast).*

**Action:** Quick verify of the fix direction: **student** enters an expression in the graph embed. Confirm the **tutor's graph** updates. Then confirm the prior direction (tutor → student) still works.

**Expect:** Both directions sync. Student edits broadcast to board/tutor. Tutor edits sync to student. Last-write-wins.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 13. Graph thumbnail renders actual graph (review/replay surface)

**Action:** Open a **completed session** (or a replayed session) that contains a **graph embed** on the board. Navigate to the session's **review / replay surface** (the hero thumbnail shown in the session card or review page).

1. Confirm the thumbnail shows the **actual JSXGraph board** (axes, plotted expressions if any were saved) — not the raw text `mynk://graph`.
2. Confirm sessions **without** graph embeds still show the static PNG thumbnail (unchanged — no regression).
3. Confirm the live whiteboard session view (tutor/student active session) still renders graph embeds correctly (not broken by this change).

**Expect:** Graph-containing sessions show a rendered graph in the thumbnail (read-only, view-only — no interaction needed in the thumbnail). Non-graph sessions: static PNG as before.

**Ignore this run:** Interaction within the thumbnail (it's view-only; no panning or expression entry expected).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

## Round-3 fix batch (2026-06-23 pilot / AV follow-ups @ `8050e95`)

Items 14–19 from hardware pilot feedback (student PC audio, UX confusion, console noise). **Human judgment items** — not all are Playwright-covered.

---

### 14. Mic/cam controls on self-tile overlay (not cluster footer)

**Action:** Join a live A/V session on **two devices** (tutor + student). On **each** role, locate the **local preview tile** (labelled "You" / your name) in the AV cluster.

1. Confirm **mic and cam toggles sit on the bottom of your own video tile** (semi-transparent bar over your preview) — `data-testid="av-controls"` on the **local** tile only.
2. Confirm there is **no separate mic/cam row** under the whole cluster (old footer layout gone).
3. **Student tester check:** controls must read as "mine" (on your face), not as if they control the tutor's tile.
4. Toggle mic/cam — confirm on/off styling matches top-bar buttons (green mic-on / red mic-off, etc.).

**Expect:** Self-tile overlay only. Remote tile has no mic/cam toggles. Controls work. Student does not think tutor controls are theirs.

**Ignore this run:** Waiting room / no A/V session.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 15. Student top-bar mic level meter (desktop)

**Action:** **Student desktop** (≥1100px), connected to live session with mic **on**. Open mic **▾** settings — confirm device list is readable (item 18). Speak at normal volume.

1. On the top-bar mic button (`data-testid="wb-topbar-mic-toggle"`), confirm **three small bars** beside the mic icon animate when you talk (same pattern as tutor top bar).
2. Mute mic — bars should go flat / inactive.
3. Wrong-device sanity: if bars stay flat while **Windows Settings → Sound → Input** meter moves, try each entry in mic **▾** until bars respond.

**Expect:** Visible inline meter on student desktop top bar. Bars track speech when correct device selected. Muted = no activity.

**Ignore this run:** Phone/narrow layout (student top-bar mic is desktop-only; use tile overlay mic on touch).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 16. Student loading banners (no false "Board is taking too long")

**Action:** **Student** cold-join while tutor is already in session with board content drawn.

1. Board should load without a persistent **"Board is taking too long to load"** banner if the canvas is actually usable underneath.
2. If tutor has **not** drawn yet, after ~8s you may see **"The board is still empty…"** (`student-board-sync-wait-banner`) — that's different from the loading-guard banner.
3. **Dismiss** works on any banner that appears inappropriately.
4. After **Exit → Rejoin**, should not get stuck on loading guard when sync reconnects quickly.

**Expect:** At most one reload-style banner at a time. No false loading-guard when board is visible and sync connected. Rejoin path clean.

**Ignore this run:** `[automated: wb-student-exit-rejoin.spec.ts]` — mark N/A if only re-spot-checking subjective feel.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 17. Student console not flooded with `[pvs]` viewport spam

**Action:** **Student** joins live session, opens DevTools → Console. Tutor pans/zooms for ~30 seconds while student follows.

1. Console should **not** fill with thousands of `[pvs] action=record-viewport` or `skip=recording-inactive` lines.
2. Optional filter `useLiveAV` — join/mute/device lines only; **no per-word logs when talking** (that is normal).
3. You may still see occasional `[student-apply] … viewport-align-applied` while following — much lower volume than old `[pvs]` flood.

**Expect:** Student console usable for audio debugging. No `[pvs]` spam during follow.

**Ignore this run:** Tutor console (tutor **will** see `[pvs] record-viewport append` while recording — expected on tutor side only).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 18. Mic/cam device picker readable on dark theme

**Action:** **Student or tutor desktop**, **dark theme**. Open mic **▾** (and cam **▾** if available). Open the native **Microphone** `<select>` dropdown.

**Expect:** Dropdown list text and background have sufficient contrast — options are readable (not white-on-white). Selected device visible in closed state.

**Ignore this run:** `[automated: wb-wave5-polish.spec.ts › native select — mic/cam device pickers readable on dark theme]` — N/A unless spot-checking on real hardware after deploy.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

### 19. Live audio — student desktop PC (hardware triage)

**Action:** `[human-only: requires second machine + mic hardware]` Pilot repro: phone audio worked previously; **student desktop PC** (webcam) — tutor could not hear student. Use **fresh join** on preview `@ 8050e95` after both sides hard-refresh.

**Student PC — before Mynk:**

1. Windows **Settings → Sound → Input** — pick webcam/headset; talk — **input meter moves**.
2. Optional: [webcammictest.com](https://webcammictest.com) with same device — records playback.

**In session — student:**

3. Mic **▾** — try each listed device (watch for duplicate names); note which makes **item 15 meter bars** move.
4. Mic **on** on self-tile overlay; speak.

**In session — tutor:**

5. Console filter once at join: `mixdown-attach` or `track received` — confirm `kind=audio` for student peer.
6. Confirm you **hear** student on student **remote tile** (not expecting "Tap to hear audio" on desktop tutor — autoplay usually fine).
7. **A/B:** same session link on **phone** (known good) vs **PC** — if phone works and PC doesn't with bars flat on PC → environment/device routing, not signaling.

**Expect:** Windows meter + Mynk meter bars move → tutor hears student. If bars move but tutor silent + `mixdown-attach` present → file bug. If bars flat → wrong device / OS mute.

**Ignore this run:** No second device available this run.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**


---

## Cross-branch / post-merge

*Not applicable until Wave 5 merges to integration branch.*

---

## Overall result

- [ ] PASS
- [ ] FAIL
