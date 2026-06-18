# WB unification + stabilization (Waves 1-3) — smoke runbook

**Branch:** `wb-unify-stabilize`
**Tip commit:** [`52a7d0d`](https://github.com/Arangarx/tutoring-notes/commit/52a7d0d)
**Preview:** [wb-unify-stabilize preview](https://tutoring-notes-git-wb-unify-stabilize-arangarx-5209s-projects.vercel.app)

**Context:** Waves 1–3 are stacked on this branch; automated gates GREEN (jest 894/894 whiteboard/AV; `wb-sync` relay 13 Playwright passed / 1 skip / 0 fail — the 12 live-sync invariants survived). The paint/bleed/eraser fixes are jsdom-blind so **this hardware smoke is their real gate**. Waves 4–5 (chrome/responsive, laser COLORS, polish) are **not** in this branch — see the global Ignore list below.

---

## Legend

| Field | How to fill it |
|---|---|
| **Branch** | `wb-unify-stabilize` |
| **Tip commit** | HEAD of `wb-unify-stabilize` at smoke time |
| **Preview** | Verified Vercel `branchAlias` via MCP — do not guess |
| **Overall result** | PASS only if every in-scope test item is PASS (deliberate SKIPs called out in Notes). FAIL if any in-scope item fails. |
| **PARTIAL** | Checked when the item mostly works but has a bounded defect that does not block the Wave 1–3 acceptance bar — explain in Notes. |

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

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 2. Recording FSM — Start → Pause → Resume → Stop

**Action:** With the live session from item 1 still open, exercise the recording controls in order: **Start** recording → confirm mic indicator animates / shows live state → **Pause** → confirm paused indicator → **Resume** → confirm live again → **Stop**. Open DevTools console and filter for `rid=` lines during each transition.

**Expect:** Each FSM transition completes without error toast. Mic indicator visually tracks recording state (live vs paused vs stopped). Console `[rid]` log lines show sane state transitions (no rapid flip-flop, no stuck `recording` after Stop). Session remains usable for drawing after Stop.

**Ignore this run:** Upload/outbox completion timing (async after Stop). Notes transcription quality (MAP-ACC). Replay/review depth (live session only).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 3. Pages — add, switch, delete

**Action:** In the same live session: click **+** to add a second board page → draw a distinct stroke on Board 2 (e.g. a large X) → click Board 1 tab → draw a different stroke → switch back to Board 2 and confirm the X is still there → delete Board 2 via the page tab delete control (confirm if prompted).

**Expect:** New page appears in the tab strip. Switching tabs swaps the visible canvas content — Board 1 strokes do not appear on Board 2 and vice versa. Delete removes the tab; remaining pages stay usable. No orphan blank tab or stuck active indicator.

**Ignore this run:** Student page-strip behavior (item 17). Cross-peer bleed (item 11).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 4. PDF insert → pages appear as boards

**Action:** Tutor uses the asset insert control to add a **PDF** (multi-page if available). Wait for import/hydration. Observe the page tab strip.

**Expect:** Each imported PDF page appears as its own board tab. PDF page content is visible on the canvas when that tab is active. Tutor can switch between native boards and PDF boards without error toast. Import does not freeze the tool strip.

**Ignore this run:** Student resolution/crop differences on PDF embeds (low severity). Student-initiated insert (tutor-only). Cross-page bleed on the **student** side (item 11).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 5. Tutor self-view camera thumbnail + mic mute/unmute

**Action:** Grant camera/mic via browser dialog if prompted. Locate the tutor **self-view** tile in the A/V cluster (thumbnail of own camera). Speak briefly — confirm local audio activity indicator responds. Click **mic mute** → speak again → click **unmute** → speak again.

**Expect:** Self-view thumbnail shows live camera feed (or initials placeholder if no camera — see item 9). Mute silences the outbound mic indicator; unmute restores it. No tile flash-then-disappear on tutor side.

**Ignore this run:** Student A/V path (items 7–9). Device hotload / picker duplicate entries (separate backlog). Chrome cluster layout polish (Wave 4).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 6. End Session → review mode loads (sanity)

**Action:** With student **not** joined (or after student has Exited), click **End Session** from the tutor workspace. Wait for navigation/transition.

**Expect:** Session ends cleanly — review/summary surface loads without auth loop or infinite spinner. No unhandled error toast. (Deep review-mode feature testing is out of scope; this is a sanity gate that End Session still works post-unify.)

**Ignore this run:** Replay/review-mode depth, notes quality, waveform accuracy (live-session smoke; MAP-ACC separate). Student `session_ended` UX (covered in prior smokebooks).

- [ ] PASS
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

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 8. Bidirectional video paints without manual resize (Wave 2 fix 2.1)

**Action:** Both sides grant camera (browser dialogs). **Do not resize the browser window** at any point during this item. On **student**: confirm you see the **tutor's video** tile and your own self-view. On **tutor**: confirm you see the **student's video** tile. Wait at least 10 seconds on each side without touching window chrome.

**Expect:** **Both directions** show live video tiles on first paint — student sees tutor video AND own self-view; tutor sees student video. No blank A/V cluster, no permanent black tiles, no workaround requiring a manual window resize to make video appear. (Formerly: student saw no video at all; tutor only saw student after several cold starts; resize was required — AV-NOVIDEO-STUDENT / AV-DISCONNECT-RESIZE family.)

**Ignore this run:** Chrome layout/overflow (Wave 4). Distinct laser colors (Wave 4). Device hotload picker quirks (backlog).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 9. No-camera participant shows initials placeholder (Wave 2 fix 2.1/2.2)

**Action:** Run a sub-case where **one participant has no camera** (deny cam or use a device without webcam). **Do not resize the window.** Observe the tile for the no-camera participant on the **other** side's A/V cluster.

**Expect:** The no-camera slot shows an **initials avatar placeholder** immediately — not blank empty space. Placeholder appears without requiring a manual resize to trigger reflow. (Formerly: blank space until resize made initials pop in — AV-NOCAM-INITIALS.)

**Ignore this run:** Chrome cluster layout polish (Wave 4). Video quality / codec nits.

- [ ] PASS
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
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 11. Cross-page stroke bleed — strokes stay on their own page (Wave 3 fix 3.1)

**Action:** Tutor on **Board 1**: draw a distinctive stroke (e.g. red circle). Tutor switches to **Board 2**: draw a different stroke (e.g. blue square). If a PDF board exists from item 4, also visit that tab. Student follows tutor page changes (follow toggle ON by default). Student switches pages using tutor-driven navigation (tutor changes tabs) and inspects each board.

**Expect:** Strokes remain on the board where they were drawn — **no cross-page bleed**. Board 2 strokes do not appear on Board 1 or PDF boards, and vice versa, including after navigating away and back. (Formerly: strokes from Board 2 bled onto Board 3 / PDF page — BLEED regression cluster.)

**Ignore this run:** PDF resolution/crop differences between devices. Chrome/page-tab polish (Wave 4).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 12. Tutor eraser works reliably mid-session (Wave 3 fix 3.4)

**Action:** With both sides connected and remote strokes actively syncing, **tutor** draws several pencil strokes. While student is also drawing (remote applies arriving), tutor selects **eraser** and erases multiple tutor-owned strokes — include at least one erase attempt while a remote stroke is still landing.

**Expect:** Eraser removes targeted strokes on the tutor side **reliably** — does not "refuse to erase" or require tool re-selection. Erased strokes disappear on student side within ~2s. (Formerly: eraser did not work at all for tutor while student eraser worked — ERASE-TUTOR.)

**Ignore this run:** Eraser on student path (should work; only tutor reliability is the regression gate). Perfect erase under extreme latency.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 13. Undo/redo — button works; remote strokes not undone locally (Wave 3 fix 3.2/3.3)

**Action:** **Tutor** draws stroke A. Click **Undo** via the **top-bar Undo button** (not keyboard shortcut). Confirm stroke A disappears. Click **Redo** — stroke A returns. While tutor watches, **student** draws stroke B. Tutor clicks **Undo** once.

**Expect:** Undo button removes tutor's own stroke A; Redo restores it. Tutor Undo does **not** remove the student's remote stroke B (local undo stack must not poison on remote applies). Redo/Undo are not no-ops. (Formerly: undo/redo did nothing for both roles — UNDO-REDO cluster.)

**Ignore this run:** Keyboard shortcut variants (button is the gate). Student-initiated undo (tutor path is the regression focus).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 14. Laser pointer bidirectional + visible (Wave 1 by-construction)

**Action:** **Tutor** selects laser wand; move pointer on board while student watches. Then **student** selects laser wand; move pointer while tutor watches. Run both passes without resizing the window.

**Expect:** **Tutor sees student's laser trail** and **student sees tutor's laser trail** — bidirectional visibility. Trails appear promptly on the remote canvas. (Formerly: tutor could not see student laser at all; LASER cluster.) **Distinct tutor-vs-student colors are NOT required this round.**

**Ignore this run:** Laser pointer **COLORS** being tutor-vs-student **distinct** (Wave 4). Exact hue matching legacy red. General visual polish.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 15. Right-click ends line/arrow for student (Wave 1 by-construction)

**Action:** **Student** selects line or arrow tool. Click to start a multi-point shape; add at least one segment. **Right-click** to finish/end the shape (same gesture that works for tutor).

**Expect:** Right-click completes the line/arrow — shape is finalized and tool returns to a sane state. Student has parity with tutor for this gesture. (Formerly: right-click end-line worked tutor-only — RIGHTCLICK-END-LINE.)

**Ignore this run:** Other shape tools beyond line/arrow. Chrome polish (Wave 4).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 16. Follow-tutor-view toggle — default ON, independent nav, snap back

**Action:** Fresh join with default settings. **Tutor** pans and zooms — student should follow. Student **unchecks** follow / "Match tutor's view" toggle. Student pans/zooms independently — confirm view diverges. Student **re-checks** follow toggle.

**Expect:** Default **ON** — student viewport tracks tutor pan/zoom. With toggle **OFF**, student navigates independently without forced snap-back on every frame. Re-check **snaps** student view back to tutor's viewport **at the student's current viewport size** (not a broken zoom). (Formerly working; guard against unify regression.)

**Ignore this run:** Match-view button size/icons (Wave 4 polish). Preventing student pan while synced (backlog idea).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 17. Page strip read-only for student

**Action:** Tutor adds a page and switches between boards. Student observes the bottom page strip throughout.

**Expect:** Student sees all tutor boards in the strip. Tabs are **not clickable** for independent switch — no `+` add, no delete. Active board indicator updates only when **tutor** changes pages. Student cannot switch pages independently while follow/sync is active.

**Ignore this run:** Whether inactive tabs should be highlighted (open design question). Chrome overflow (Wave 4).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 18. Dark theme — canvas background correct (Wave 1)

**Action:** On **student** top bar, open theme toggle. Switch to **Dark** mode. Inspect the canvas surround/background (not just stroke colors). Switch back to **Light** and confirm background restores.

**Expect:** In dark mode, the **canvas background** matches dark theme — not stuck white while strokes theme-switch. Light mode background is correct on return. (Formerly: background stayed white in dark mode — THEME-DARK-BG.)

**Ignore this run:** Minor contrast nits (Wave 4 polish). Marketing-site theme on non-WB routes.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 19. Student auto A/V — no in-app permission prompt

**Action:** Student cold-joins the session link on a device that has not yet granted permissions this browser session. Observe permission UX.

**Expect:** Mic and camera are **requested automatically** on mount (browser-native `getUserMedia` dialog is fine). There is **no** in-app `AVPermissionsPrompt` card/button in the DOM. After granting, A/V cluster attempts to start without an extra app-level "Enable camera" step.

**Ignore this run:** Browser denying permissions (user action). Device hotload / picker duplicates (backlog). Chrome overflow (Wave 4).

- [ ] PASS
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

- [ ] PASS
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
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 22. Step-away — tutor drops student within ~10s; recover on wake (Wave 2 fix 2.6)

**Action:** Two-device session connected. Student **suspends device** (close laptop lid, lock screen, or background the browser until the OS suspends the tab) for ~15–30 seconds. Tutor watches A/V cluster and presence. Student **wakes** device and returns to the session tab.

**Expect:** Within **~10 seconds** of suspend, tutor's A/V cluster **drops** the student (tile gone or disconnected state — not indefinitely "connected" while peer is gone). On wake/return, student **recovers** — reconnects, board sync alive, A/V can re-establish without a full cold restart. (Andrew-flagged recoverability watch item.)

**Ignore this run:** Exact timeout seconds (±few s OK if directionally correct). Mobile OS kill policies beyond suspend.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

### 23. Student audio indicator solid when mic live (Wave 2 fix 2.7)

**Action:** Student connected with **mic live** (speak continuously for 5–10s). Observe the **top-bar audio indicator** on the student chrome — especially on desktop student with **no camera** if available as a sub-case.

**Expect:** Audio indicator is **solid/steady** while mic is active — not rapidly blinking or flashing. Indicator still reflects real audio activity (may pulse gently with speech; not a seizure-frequency flicker). (Formerly: rapid blink especially with no camera — AV-AUDIO-INDICATOR-BLINK.)

**Ignore this run:** Exact animation curve / polish (Wave 4). Tutor-side indicator (student path is the regression).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** `merge --no-ff` of `wb-unify-stabilize` → `v1-redesign`. Fetch the integration preview alias via Vercel MCP (`meta.githubCommitRef=v1-redesign`).

**Integration branch:** `v1-redesign`
**Integration tip commit:** `<short-sha after merge>`
**Integration preview:** [<v1-redesign preview>](https://<branchAlias-from-Vercel-MCP>)

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
