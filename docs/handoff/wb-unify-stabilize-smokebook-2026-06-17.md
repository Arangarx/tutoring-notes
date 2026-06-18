# WB unification + stabilization (Waves 1-3) — smoke runbook

**Branch:** `wb-unify-stabilize`
**Tip commit:** `[52a7d0d](https://github.com/Arangarx/tutoring-notes/commit/52a7d0d)`
**Preview:** [wb-unify-stabilize preview](https://tutoring-notes-git-wb-unify-stabilize-arangarx-5209s-projects.vercel.app)

**Context:** Waves 1–3 are stacked on this branch; automated gates GREEN (jest 894/894 whiteboard/AV; `wb-sync` relay 13 Playwright passed / 1 skip / 0 fail — the 12 live-sync invariants survived). The paint/bleed/eraser fixes are jsdom-blind so **this hardware smoke is their real gate**. Waves 4–5 (chrome/responsive, laser COLORS, polish) are **not** in this branch — see the global Ignore list below.

---

## Legend


| Field              | How to fill it                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Branch**         | `wb-unify-stabilize`                                                                                                            |
| **Tip commit**     | HEAD of `wb-unify-stabilize` at smoke time                                                                                      |
| **Preview**        | Verified Vercel `branchAlias` via MCP — do not guess                                                                            |
| **Overall result** | PASS only if every in-scope test item is PASS (deliberate SKIPs called out in Notes). FAIL if any in-scope item fails.          |
| **PARTIAL**        | Checked when the item mostly works but has a bounded defect that does not block the Wave 1–3 acceptance bar — explain in Notes. |


Run order: top to bottom. Use **two real devices** (or tutor desktop + student phone) for all A/V and sync items. Open DevTools console on at least one side when noted.

---

## Global "Ignore this run" (Waves 4–5 — do NOT fail this smoke on these)

The following are **known-deferred** to Waves 4–5. State them once here; each relevant item echoes them in its own **Ignore this run** field:

- Chrome layout/overflow, mobile/responsive sizing of the cluster/chrome.
- Laser pointer **COLORS** being tutor-vs-student **distinct** (bidirectional **visibility** should work now; distinct colors = Wave 4).
- General visual polish / theming nits.
- Notes content quality / hallucination (separate MAP-ACC thread).
- Replay/review-mode behavior (this is a **LIVE-session** smoke).

---

## (A) Tutor regression — must not have broken in the unify

### 1. Start live session — unified whiteboard chrome loads

**Action:** On the branch **Preview** URL, sign in as the pilot tutor account. From a student detail page, click **Start session** (or resume an existing live whiteboard). Confirm the unified `WhiteboardWorkspaceClient` opens — inspect `data-testid="mynk-wb-chrome"` with `data-role="tutor"`. Without resizing the window, verify: **top bar** (student name, session controls, mic/cam cluster entry, theme toggle, undo/redo, view menu); **left tool strip** (select, pencil, eraser, text, laser, shapes, more/overflow, collapse); **bottom page tabs** (at least Board 1 visible, `+` add-page control present). Draw one pencil stroke to confirm the canvas is interactive.

**Expect:** Full tutor chrome loads on first paint — no blank canvas shell, no missing tool strip, no stuck "Loading scene…" overlay. Page tabs render and Board 1 is active. Stroke appears immediately. No console errors containing `CSP`, `chunk`, or unhandled rejection on load.

**Ignore this run:** Student-role chrome (items 7+). Chrome overflow / mobile layout (Waves 4–5). Laser distinct colors (Wave 4).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**  
**Student doesn't see board 2 tab.  They do see board 2 strokes.  Technically a pass since you said "at least" board 1.**  
**Not seeing obvious errors, but in student console should I see a constant slew of entries? Is that it polling to stay synced?**

---

### 2. Recording FSM — Start → Pause → Resume → Stop

**Action:** With the live session from item 1 still open, exercise the recording controls in order: **Start** recording → confirm mic indicator animates / shows live state → **Pause** → confirm paused indicator → **Resume** → confirm live again → **Stop**. Open DevTools console and filter for `rid=` lines during each transition.

**Expect:** Each FSM transition completes without error toast. Mic indicator visually tracks recording state (live vs paused vs stopped). Console `[rid]` log lines show sane state transitions (no rapid flip-flop, no stuck `recording` after Stop). Session remains usable for drawing after Stop.

**Ignore this run:** Upload/outbox completion timing (async after Stop). Notes transcription quality (MAP-ACC). Replay/review depth (live session only).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:  Start and Pause are not a thing in the current controls.  I'm actually wondering if they're worth bringing back.**

---

### 3. Pages — add, switch, delete

**Action:** In the same live session: click **+** to add a second board page → draw a distinct stroke on Board 2 (e.g. a large X) → click Board 1 tab → draw a different stroke → switch back to Board 2 and confirm the X is still there → delete Board 2 via the page tab delete control (confirm if prompted).

**Expect:** New page appears in the tab strip. Switching tabs swaps the visible canvas content — Board 1 strokes do not appear on Board 2 and vice versa. Delete removes the tab; remaining pages stay usable. No orphan blank tab or stuck active indicator.

**Ignore this run:** Student page-strip behavior (item 17). Cross-peer bleed (item 11).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes: Board 2 appears for tutor but doesn't display to student, but pass because you said to ignore.  Canvas works for both appropriately.**

---

### 4. PDF insert → pages appear as boards

**Action:** Tutor uses the asset insert control to add a **PDF** (multi-page if available). Wait for import/hydration. Observe the page tab strip.

**Expect:** Each imported PDF page appears as its own board tab. PDF page content is visible on the canvas when that tab is active. Tutor can switch between native boards and PDF boards without error toast. Import does not freeze the tool strip.

**Ignore this run:** Student resolution/crop differences on PDF embeds (low severity). Student-initiated insert (tutor-only). Cross-page bleed on the **student** side (item 11).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**  
**We have not given student import tools for pdfs/images, etc.**  
**Actually this is a regression I forgot to mention.  We left out the image importer.  This is not a recent thing I just kept forgetting to bring it up.**

---

### 5. Tutor self-view camera thumbnail + mic mute/unmute

**Action:** Grant camera/mic via browser dialog if prompted. Locate the tutor **self-view** tile in the A/V cluster (thumbnail of own camera). Speak briefly — confirm local audio activity indicator responds. Click **mic mute** → speak again → click **unmute** → speak again.

**Expect:** Self-view thumbnail shows live camera feed (or initials placeholder if no camera — see item 9). Mute silences the outbound mic indicator; unmute restores it. No tile flash-then-disappear on tutor side.

**Ignore this run:** Student A/V path (items 7–9). Device hotload / picker duplicate entries (separate backlog). Chrome cluster layout polish (Wave 4).

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] SKIP

**Notes:  If I understood you, when muted it should not indicate it is receiving sound.  Picture shows muted but mic control at top bar shows activity even while muted.**

---

### 6. End Session → review mode loads (sanity)

**Action:** With student **not** joined (or after student has Exited), click **End Session** from the tutor workspace. Wait for navigation/transition.

**Expect:** Session ends cleanly — review/summary surface loads without auth loop or infinite spinner. No unhandled error toast. (Deep review-mode feature testing is out of scope; this is a sanity gate that End Session still works post-unify.)

**Ignore this run:** Replay/review-mode depth, notes quality, waveform accuracy (live-session smoke; MAP-ACC separate). Student `session_ended` UX (covered in prior smokebooks).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

## (B) Student parity + formerly-broken symptoms (Wave 1–3 fixes)

> Start a **fresh live session** for items 7–23. Tutor stays on desktop; student uses second device/browser.

### 7. Student join — board loads, disclosure, Connected pill, timer

**Action:** Tutor copies the student join link (`/w/[joinToken]` with key in URL hash `#k=…`). Student opens the link on the second device. Before interacting, read the top bar.

**Expect:** Unified student chrome loads (`data-testid="mynk-wb-chrome"` `data-role="student"`). Board/canvas is interactive (not stuck on "Loading scene…"). Top bar shows recording disclosure copy (*This session is being recorded by your tutor…*), a **Connected** pill, and a session timer that increments. No in-app `AVPermissionsPrompt` button — only native browser permission dialogs if needed.

**Ignore this run:** Chrome overflow / controls pushed off-screen (Wave 4). Mobile layout (Wave 4). Theme canvas bg (item 18).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:  When I ended the last session edge asked for camera permissions.  After I started a new session, tutor is waiting for student video and student sees self initial and no tutor panel at all.  I will hard refresh and get the camera to tutor for fresh session to complete steps 7+.  Interestingly, now that edge has permission...Tutor can see self, but not student.  Student sees initial of self but no tutor tile.  Student shows disconnected. Okay, eventually Student sees tutor and tutor sees student initials and they show connected.  That's a really long recovery time.  Since you requested true fresh session I'll close edge and start over before doing 7+.**  
On true fresh session, edge is offering the student the browser recovery even though it should be a completely fresh session.  
Video loaded at first but at some point (I missed it) the video of tutor disappeared on student side till video frame resize.  


---

### 8. Bidirectional video paints without manual resize (Wave 2 fix 2.1)

**Action:** Both sides grant camera (browser dialogs). **Do not resize the browser window** at any point during this item. On **student**: confirm you see the **tutor's video** tile and your own self-view. On **tutor**: confirm you see the **student's video** tile. Wait at least 10 seconds on each side without touching window chrome.

**Expect:** **Both directions** show live video tiles on first paint — student sees tutor video AND own self-view; tutor sees student video. No blank A/V cluster, no permanent black tiles, no workaround requiring a manual window resize to make video appear. (Formerly: student saw no video at all; tutor only saw student after several cold starts; resize was required — AV-NOVIDEO-STUDENT / AV-DISCONNECT-RESIZE family.)

**Ignore this run:** Chrome layout/overflow (Wave 4). Distinct laser colors (Wave 4). Device hotload picker quirks (backlog).

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] SKIP

**Notes: See notes in 7.**  
**Testing in same machine, two browsers so bidirectional Video is n/a for now.**

---

### 9. No-camera participant shows initials placeholder (Wave 2 fix 2.1/2.2)

**Action:** Run a sub-case where **one participant has no camera** (deny cam or use a device without webcam). **Do not resize the window.** Observe the tile for the no-camera participant on the **other** side's A/V cluster.

**Expect:** The no-camera slot shows an **initials avatar placeholder** immediately — not blank empty space. Placeholder appears without requiring a manual resize to trigger reflow. (Formerly: blank space until resize made initials pop in — AV-NOCAM-INITIALS.)

**Ignore this run:** Chrome cluster layout polish (Wave 4). Video quality / codec nits.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 10. Mutual draw — student ↔ tutor live sync

**Action:** Two devices connected. **Student** draws a visible pencil stroke (e.g. write "S"). Wait ~2s. **Tutor** draws a different stroke (e.g. write "T"). Wait ~2s. Repeat once with a shape or eraser mark if time permits.

**Expect:** Student stroke appears on tutor board within ~2s. Tutor stroke appears on student board within ~2s. Strokes land on the **currently active page** for both sides. No permanent one-way dead sync.

**Ignore this run:** Student-initiated PDF/image/graph insert (tutor-only). Cross-page bleed (item 11). Laser colors (Wave 4).

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] SKIP

**Notes: Tutor size erasing is still not working.  The shape it's meant to delete flashes/fades but does not consistently delete at all.  Can click many times and no guarantee anything erases.  Student side erase works.**  
**Strokes and shapes working well.**

---

### 11. Cross-page stroke bleed — strokes stay on their own page (Wave 3 fix 3.1)

**Action:** Tutor on **Board 1**: draw a distinctive stroke (e.g. red circle). Tutor switches to **Board 2**: draw a different stroke (e.g. blue square). If a PDF board exists from item 4, also visit that tab. Student follows tutor page changes (follow toggle ON by default). Student switches pages using tutor-driven navigation (tutor changes tabs) and inspects each board.

**Expect:** Strokes remain on the board where they were drawn — **no cross-page bleed**. Board 2 strokes do not appear on Board 1 or PDF boards, and vice versa, including after navigating away and back. (Formerly: strokes from Board 2 bled onto Board 3 / PDF page — BLEED regression cluster.)

**Ignore this run:** PDF resolution/crop differences between devices. Chrome/page-tab polish (Wave 4).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**  
**Just a notes, styles panel still waiting for mouse-up to close.**

---

### 12. Tutor eraser works reliably mid-session (Wave 3 fix 3.4)

**Action:** With both sides connected and remote strokes actively syncing, **tutor** draws several pencil strokes. While student is also drawing (remote applies arriving), tutor selects **eraser** and erases multiple tutor-owned strokes — include at least one erase attempt while a remote stroke is still landing.

**Expect:** Eraser removes targeted strokes on the tutor side **reliably** — does not "refuse to erase" or require tool re-selection. Erased strokes disappear on student side within ~2s. (Formerly: eraser did not work at all for tutor while student eraser worked — ERASE-TUTOR.)

**Ignore this run:** Eraser on student path (should work; only tutor reliability is the regression gate). Perfect erase under extreme latency.

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes: See notes in 10.**

---

### 13. Undo/redo — button works; remote strokes not undone locally (Wave 3 fix 3.2/3.3)

**Action:** **Tutor** draws stroke A. Click **Undo** via the **top-bar Undo button** (not keyboard shortcut). Confirm stroke A disappears. Click **Redo** — stroke A returns. While tutor watches, **student** draws stroke B. Tutor clicks **Undo** once.

**Expect:** Undo button removes tutor's own stroke A; Redo restores it. Tutor Undo does **not** remove the student's remote stroke B (local undo stack must not poison on remote applies). Redo/Undo are not no-ops. (Formerly: undo/redo did nothing for both roles — UNDO-REDO cluster.)

**Ignore this run:** Keyboard shortcut variants (button is the gate). Student-initiated undo (tutor path is the regression focus).

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:  Stroke meant to undo flashes on delete.  BTW, I'm suspecting a TON of these issues is that student side is taking way too much priority on sync.  I'm guessing anything on the student side is force syncing itself back in so deletes and undos and things don't work.**  
**Student undo undid some strokes previously done by tutor.**  
**Undo from student is redoing strokes from other pages into the current page.  This is another regression of something solved previously.  The agent's solution last time was to clear history on page swap.**

---

### 14. Laser pointer bidirectional + visible (Wave 1 by-construction)

**Action:** **Tutor** selects laser wand; move pointer on board while student watches. Then **student** selects laser wand; move pointer while tutor watches. Run both passes without resizing the window.

**Expect:** **Tutor sees student's laser trail** and **student sees tutor's laser trail** — bidirectional visibility. Trails appear promptly on the remote canvas. (Formerly: tutor could not see student laser at all; LASER cluster.) **Distinct tutor-vs-student colors are NOT required this round.**

**Ignore this run:** Laser pointer **COLORS** being tutor-vs-student **distinct** (Wave 4). Exact hue matching legacy red. General visual polish.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] SKIP

**Notes:**  
**Bidirectional vision now works.  Still don't know why the laser pointer is orange instead of the typical red.  So it's not quite what I imagined though but I guess this might be an acceptable type solution.  Student sees tutor laser, but same orange/coral color (I JUST now realized it's not orange it's our coral color).  Tutor NOW sees student laser, and for student it's coral, for tutor it's blue.**  
**When highlighted, current laser pointer icons have horrid visibility, there is barely any contrast between the laser icon and the white background.** 

---

### 15. Right-click ends line/arrow for student (Wave 1 by-construction)

**Action:** **Student** selects line or arrow tool. Click to start a multi-point shape; add at least one segment. **Right-click** to finish/end the shape (same gesture that works for tutor).

**Expect:** Right-click completes the line/arrow — shape is finalized and tool returns to a sane state. Student has parity with tutor for this gesture. (Formerly: right-click end-line worked tutor-only — RIGHTCLICK-END-LINE.)

**Ignore this run:** Other shape tools beyond line/arrow. Chrome polish (Wave 4).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 16. Follow-tutor-view toggle — default ON, independent nav, snap back

**Action:** Fresh join with default settings. **Tutor** pans and zooms — student should follow. Student **unchecks** follow / "Match tutor's view" toggle. Student pans/zooms independently — confirm view diverges. Student **re-checks** follow toggle.

**Expect:** Default **ON** — student viewport tracks tutor pan/zoom. With toggle **OFF**, student navigates independently without forced snap-back on every frame. Re-check **snaps** student view back to tutor's viewport **at the student's current viewport size** (not a broken zoom). (Formerly working; guard against unify regression.)

**Ignore this run:** Match-view button size/icons (Wave 4 polish). Preventing student pan while synced (backlog idea).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**  
**Odd...now undo redo seem to be working and indepedently...I won't even try to describe what led up to this. Lots of testing steps. It's almost like the history clear and independent undo/redo is suddenly working.  Only thing I can think of that I did differenly was using keyboard shortcuts first.**

---

### 17. Page strip read-only for student

**Action:** Tutor adds a page and switches between boards. Student observes the bottom page strip throughout.

**Expect:** Student sees all tutor boards in the strip. Tabs are **not clickable** for independent switch — no `+` add, no delete. Active board indicator updates only when **tutor** changes pages. Student cannot switch pages independently while follow/sync is active.

**Ignore this run:** Whether inactive tabs should be highlighted (open design question). Chrome overflow (Wave 4).

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] SKIP

**Notes: Basically pass, but not 100% verified as still only 1 board tab for student.**

---

### 18. Dark theme — canvas background correct (Wave 1)

**Action:** On **student** top bar, open theme toggle. Switch to **Dark** mode. Inspect the canvas surround/background (not just stroke colors). Switch back to **Light** and confirm background restores.

**Expect:** In dark mode, the **canvas background** matches dark theme — not stuck white while strokes theme-switch. Light mode background is correct on return. (Formerly: background stayed white in dark mode — THEME-DARK-BG.)

**Ignore this run:** Minor contrast nits (Wave 4 polish). Marketing-site theme on non-WB routes.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 19. Student auto A/V — no in-app permission prompt

**Action:** Student cold-joins the session link on a device that has not yet granted permissions this browser session. Observe permission UX.

**Expect:** Mic and camera are **requested automatically** on mount (browser-native `getUserMedia` dialog is fine). There is **no** in-app `AVPermissionsPrompt` card/button in the DOM. After granting, A/V cluster attempts to start without an extra app-level "Enable camera" step.

**Ignore this run:** Browser denying permissions (user action). Device hotload / picker duplicates (backlog). Chrome overflow (Wave 4).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

## (C) Presence / disconnect

### 20. Student Exit — leave screen + tutor A/V cluster shrinks (Wave 2 fix 2.1+2.4)

**Action:** Two-device session with both connected and video visible. Student clicks **Exit** (`data-testid="wb-student-exit"`). On **tutor** side, watch the A/V cluster — do **not** manually close the student tab.

**Expect:** Student sees local **"You left the session"** card. Tutor sees student **disconnected** (presence/timer reflects departure). A/V cluster **shrinks** — remaining tile(s) reflow; tutor self-view does **not** stretch to fill the entire cluster frame. (Formerly: cluster froze / tutor video grew to fill — AV-DISCONNECT-RESIZE / PRESENCE.)

**Ignore this run:** Coral Exit button styling (Wave 4 polish). Student tab left open on leave card (expected).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 21. Exit then re-join — video re-establishes (Wave 2 fix 2.4)

**Action:** Immediately after item 20, student re-opens the **same join link** (or refreshes and re-joins with key). Tutor stays in session. Wait up to 15s without resizing the window.

**Expect:** Tutor **re-detects** the student — presence shows connected again. Bidirectional video **re-establishes** without permanent "Waiting for video…" ghost state. Initials placeholder shows correctly if cam off (per item 9). (Formerly: after rejoin tutor still showed disconnected / waiting for video — PRESENCE / 1b-exit notes.)

**Ignore this run:** Chrome polish (Wave 4). Hard-refresh mid-session A/V loss (separate AV-REFRESH-LOSS backlog unless reproducing incidentally).

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**  
**As soon as student begins connecting, student tile pops up on tutor side but says waiting for video.  Student side doesn't show tutor tile at all yet.  I suspect this is going to take a while to recover again.  Student side is not "double" mounting to mic this time.  Been 30+ seconds, student still "joining".  Hard refresh on student side not recovering this time.**

---

### 22. Step-away — tutor drops student within ~10s; recover on wake (Wave 2 fix 2.6)

**Action:** Two-device session connected. Student **suspends device** (close laptop lid, lock screen, or background the browser until the OS suspends the tab) for ~15–30 seconds. Tutor watches A/V cluster and presence. Student **wakes** device and returns to the session tab.

**Expect:** Within **~10 seconds** of suspend, tutor's A/V cluster **drops** the student (tile gone or disconnected state — not indefinitely "connected" while peer is gone). On wake/return, student **recovers** — reconnects, board sync alive, A/V can re-establish without a full cold restart. (Andrew-flagged recoverability watch item.)

**Ignore this run:** Exact timeout seconds (±few s OK if directionally correct). Mobile OS kill policies beyond suspend.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] SKIP

**Notes: N/A for this setup.**

---

### 23. Student audio indicator solid when mic live (Wave 2 fix 2.7)

**Action:** Student connected with **mic live** (speak continuously for 5–10s). Observe the **top-bar audio indicator** on the student chrome — especially on desktop student with **no camera** if available as a sub-case.

**Expect:** Audio indicator is **solid/steady** while mic is active — not rapidly blinking or flashing. Indicator still reflects real audio activity (may pulse gently with speech; not a seizure-frequency flicker). (Formerly: rapid blink especially with no camera — AV-AUDIO-INDICATOR-BLINK.)

**Ignore this run:** Exact animation curve / polish (Wave 4). Tutor-side indicator (student path is the regression).

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] SKIP

**Notes:  This is a pass with Edge.  I have not confirmed with chrome as student.  So I say partial only because I cannot verify receiving end stays stable in chrome in current smoke setup.**

---

## Cross-branch / post-merge

Run this section **after** `merge --no-ff` of `wb-unify-stabilize` → `v1-redesign`. Fetch the integration preview alias via Vercel MCP (`meta.githubCommitRef=v1-redesign`).

**Integration branch:** `v1-redesign`
**Integration tip commit:** `<short-sha after merge>`
**Integration preview:** 

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Regression spot-check — tutor item 1 + student join after merge

**Action:** On the **v1-redesign** integration Preview, repeat **item 1** (tutor start session, chrome loads, one stroke) and **item 7** (student join via `/w/[joinToken]#k=…`, disclosure + Connected pill + timer). Then run **item 8** (bidirectional video without resize) as a high-risk merge check.

**Expect:** Same pass criteria as feature-branch items 1, 7, and 8. No new regression vs. the `wb-unify-stabilize` smoke PASS.

**Ignore this run:** Until merged into `v1-redesign`. Waves 4–5 deferred items (global Ignore list).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

### 2. Full student parity re-spot-check on integration preview

**Action:** On integration Preview, re-run items **11** (cross-page bleed), **12** (tutor eraser), **13** (undo/redo), and **20–21** (Exit + rejoin) if the Wave 1–3 merge touched additional integration commits.

**Expect:** No bleed, eraser, undo, or disconnect regressions on the integration branch.

**Ignore this run:** Until merged. Waves 4–5 deferred items.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes; PARTIAL items count as **not PASS** unless Andrew explicitly accepts them in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete.

- [ ] PASS
- [ ] FAIL

---

## Re-smoke round — Fix waves landed (2026-06-18)

**Branch:** `wb-unify-stabilize`
**Tip commit:** [`c0d80bd`](https://github.com/Arangarx/tutoring-notes/commit/c0d80bd)
**Preview:** [wb-unify-stabilize branch alias](https://tutoring-notes-git-wb-unify-stabilize-arangarx-5209s-projects.vercel.app) · [preview.usemynk.com](https://preview.usemynk.com) (stable — repoint to this branch first; alias always works)

**Context:** Engine fix wave [`4a07cfa`](https://github.com/Arangarx/tutoring-notes/commit/4a07cfa) + A/V rejoin wave [`e2466e8`](https://github.com/Arangarx/tutoring-notes/commit/e2466e8) / [`c0d80bd`](https://github.com/Arangarx/tutoring-notes/commit/c0d80bd) landed after W1-3 smoke FAILs. Automated merge-boundary gate GREEN (`wb-sync` 13/13 relay invariants, jest 666/666). **This round re-tests only the 4 merge-blockers + a short regression spot-check** — prior W1-3 item results above are **unchanged** (do not re-edit).

**Overall result:**

- [ ] PASS
- [ ] FAIL

---

## Global "Ignore this run" (Waves 4–5 + W1-3 backlog — do NOT fail this re-smoke on these)

Waves 4–5 (chrome/responsive, laser **colors**, general polish) plus the 11 non-blocking backlog IDs from W1-3 triage — **not** in scope for this re-smoke:

- Chrome layout/overflow, mobile/responsive sizing.
- Laser pointer **COLORS** being tutor-vs-student distinct (bidirectional visibility is in regression spot-check).
- General visual polish / theming nits.
- Notes content quality / MAP-ACC.
- Replay/review-mode behavior (live-session smoke).
- **WB-RECORDING-START-PAUSE**, **WB-MIC-MUTED-ACTIVITY**, **WB-IMAGE-IMPORTER**, **WB-STUDENT-BOARD-TABS**, **WB-LASER-ICON-CONTRAST**, **WB-STYLES-PANEL-MOUSEUP**, **WB-STUDENT-CONSOLE-NOISE**, **WB-AV-TILE-SESSION-IDENTITY**, **WB-ENDSESSION-THUMBNAIL-TABS**, **WB-FOLLOW-TUTOR-TOGGLE-STYLE**, **IAC-PARENT-TERMINOLOGY**.

---

### R1. Tutor eraser reliability (was item 12; related item 10)

**Action:** Two real devices, fresh live session. With both sides connected and remote strokes actively syncing, **tutor** draws several pencil strokes while **student** also draws. Tutor selects **eraser** and erases multiple tutor-owned strokes — include at least one erase while a remote stroke is still landing. **What was fixed:** engine wave reconciles from `getSceneElementsIncludingDeleted()` so student stale broadcast cannot resurrect tutor deletes ("flash then reappear").

**Expect:** Eraser removes targeted strokes on the tutor side **reliably** — no "refuse to erase" or tool re-selection required. Erased strokes disappear on student side within ~2s and **stay gone** (no resurrection flash).

**Ignore this run:** Waves 4–5 chrome/polish. Laser distinct colors. The 11 W1-3 backlog IDs (global list above). Student-path eraser polish (tutor reliability is the regression gate).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A
- [ ] SKIP

**Notes:**

---

### R2. Undo/redo correctness — no cross-role / cross-page pollution (was item 13)

**Action:** **Tutor** draws stroke A → **Undo** via top-bar button → stroke A disappears → **Redo** restores it. While tutor watches, **student** draws stroke B → tutor **Undo** once (must NOT remove B). Then: tutor on **Board 1** draws a mark → switches to **Board 2** → student draws on Board 2 → student clicks **Undo** on Board 2. **What was fixed:** per-page `history.clear()` on **both** student page-switch paths (`runV3Apply` + `selectStudentPage`); tombstone-aware reconcile baseline (same engine wave as R1).

**Expect:** Tutor undo/redo affects **only tutor-local** strokes. Student undo on Board 2 does **not** pull strokes from Board 1 or tutor-owned strokes onto the current page. No "flash delete then reappear" on undo.

**Ignore this run:** Waves 4–5 chrome/polish. Keyboard shortcut variants (button is the gate). The 11 W1-3 backlog IDs.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A
- [ ] SKIP

**Notes:**

---

### R3. Exit → re-join A/V recovery — no ghost / long stall (was item 21)

**Action:** Two-device session with bidirectional video visible. Student clicks **Exit** (`data-testid="wb-student-exit"`) — tutor cluster should shrink (item 20 behavior). Student immediately re-opens the **same join link**. Tutor stays in session. Wait up to 15s — **do not resize the window**. **What was fixed:** A/V wave — `rejoin-detected` resets stale streams/flags before re-adding peer; additive `onPeerLeave` proactive per-peer reset; `cancelEviction` cleanup.

**Expect:** Tutor re-detects student — presence shows connected. Bidirectional video re-establishes without permanent "Waiting for video…" ghost or 30s+ "joining" stall. No hard-refresh required.

**Ignore this run:** Waves 4–5 chrome/polish. Hard-refresh mid-session A/V loss (AV-REFRESH-LOSS backlog). The 11 W1-3 backlog IDs.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A
- [ ] SKIP

**Notes:**

---

### R4. Video paints on reconnect without manual resize (was items 7/8)

**Action:** Two devices, fresh session, both grant camera. **Do not resize the browser window** at any point. Confirm bidirectional video tiles paint on first connect. Then induce a reconnect path: student **Exit** and re-join (same as R3) **or** brief network toggle if easier — observe whether video **repaints** without touching window chrome. **What was fixed:** fresh `MediaStream` wrapper on video-track re-arrival (new `stream.id` → `videoKey` change → `AVTile` remount → paints without resize).

**Expect:** Both directions show live video on first paint. After reconnect, video tiles paint again **without** manual window resize. No permanent black/frozen tiles.

**Ignore this run:** Waves 4–5 chrome/polish. Distinct laser colors. Device hotload picker quirks. The 11 W1-3 backlog IDs.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A
- [ ] SKIP

**Notes:**

---

### R5. Regression spot-check — previously-PASS shared-code paths

**Action:** On the same session (or a quick second fresh session), re-verify four items that **passed** in W1-3 but whose engine/AV apply paths changed: **(a)** cross-page stroke bleed (was item 11 — strokes stay on their board); **(b)** laser bidirectional visibility (was item 14 — both sides see trails; distinct colors NOT required); **(c)** student Exit → tutor A/V cluster shrinks (was item 20); **(d)** no-camera participant shows initials without resize (was item 9).

**Expect:** Same pass criteria as original items 9, 11, 14, 20 — no regressions from the additive engine/AV fixes.

**Ignore this run:** Waves 4–5 chrome/polish. Laser **color** asymmetry (Wave 4). The 11 W1-3 backlog IDs.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A
- [ ] SKIP

**Notes:**

---

## Overall result (re-smoke round)

Check **PASS** only if every in-scope re-smoke item (R1–R5) is PASS. Check **FAIL** if any in-scope item fails. PARTIAL counts as not PASS unless explicitly accepted in Notes.

- [ ] PASS
- [ ] FAIL