# Smoke runbook — Mobile whiteboard chrome (phone-portrait core, Phases 0–3)

> **Scope:** Tutor-side **touch chrome** on phone portrait (~390×844) and a quick landscape rotate check. Student chrome is a later phase. Tests the build on branch `feat/wb-mobile-chrome` (Phases 0–3). Desktop regression check included in Section E.

> **Legend (ratified convention):** `[x]` on a step = **PASS** (executed + behaved as expected). For each item, check **one** of `PASS` or `FAIL`. Leave both unchecked = not-yet / N/A. Put observations on the **Notes:** line. A fully-passing section = green for that section. Pick **one** overall verdict at the bottom.

| Field | Value |

|---|---|

| **Date** | 2026-06-10 |

| **Tester** | |

| **Branch under test** | `feat/wb-mobile-chrome` @ `25d7538` (HEAD — Phases 0–3) |

| **Commits covered** | `133a5fa` (Phase 0) · `7e15518` (Phase 1) · `e36bab6` (Phase 2) · `25d7538` (Phase 3) |

| **Viewport** | Phone portrait **~390×844** (real phone or browser DevTools device mode). Also rotate to **landscape** for Section A item 2 and Section D sheet clipping. |

| **Route** | Log in as tutor → open a student whiteboard workspace: `/admin/students/<studentId>/whiteboard/<wbsid>/workspace` (start a new session or resume an in-progress one). |

## Open it

- **Preview (give it ~2 min if cold):** [feat/wb-mobile-chrome @ 25d7538](https://tutoring-notes-git-feat-wb-mobil-fe878a-arangarx-5209s-projects.vercel.app)
- **Branch alias (stable):** `tutoring-notes-git-feat-wb-mobil-fe878a-arangarx-5209s-projects.vercel.app` — Vercel hashes long branch names; if the alias 404s, open [Vercel → tutoring-notes → Deployments](https://vercel.com/arangarx-5209s-projects/tutoring-notes) and pick the latest **READY** deploy for `feat/wb-mobile-chrome`.
- **Deploy inspector (this commit):** [Inspector for dpl_CXuF9…](https://vercel.com/arangarx-5209s-projects/tutoring-notes/CXuF9LJPZT6mNMvZnjGEz9w2nLZd)

## Merge bar (read first)

This smoke validates **Phases 0–3 tutor touch chrome** only. **Do not fail** on polish items explicitly deferred (dedicated phone-landscape left rail, student chrome, bottom board tabs). **Do fail** on: desktop chrome leaking into mobile, mobile chrome leaking into desktop, broken tool selection/draw, sheets that clip or won't dismiss, or the P0 landscape misclassification (desktop left strip on phone landscape).

---

## Section A — Responsive scaffold & P0 fix (Phase 0, `133a5fa`)

- **Action:** At phone-portrait width, open the tutor whiteboard workspace. **Expected:** Touch chrome is active — **bottom toolbar** (and props summary above it), **not** the desktop left tool strip.

- [ ] PASS
- [x] FAIL

**Notes:**

> *The top bar extends off the screen.  When I click Share to get a link the video button pops into view for a second.  By default, I can see up to the audio button and part of the pulldown next to it.  For the popups for options, the left edge of the white ink selector is cut off.  I think there's a hard border just to the left. I don't think options should auto close till I tap out. Also, clicking "more styles" or "less styles" closes the options panel.  In landscape, the bars are on the bottom, not the left like approved.  The n-gon funtionality on phone could use some QOL, like showing the line you are ABOUT to draw, kust right now just tapping you see nothing till the second tap.  Also on the n-gon I think the "I clicked near the origin node, so snap and end it" needs to have a little more range on mobile.  I tapped near origin to end an n-gon and it just made a new vertice very near by.  FYI, don't forget that by default students need to track the tutor's view (pan and zoom) and there needs to be a way for the student to toggle it.  Student laser is red, but pretty sure that's a follow up to change it, just in case though I'm mentioning it.  On mobile to select a different alt shape I have to tap then tap again...is there possibly a better pattern for this?  I tried to see if long press was an alternate to open it and it was not.  I tried sliding the opacity slider and it didn't seem to want to follow my finger very far.  I tried several times to slide more than a percent or two and then got an application error. "Application error: a client-side exception has occurred while loading [tutoring-notes-git-feat-wb-mobil-fe878a-arangarx-5209s-projects.vercel.app](http://tutoring-notes-git-feat-wb-mobil-fe878a-arangarx-5209s-projects.vercel.app) (see the browser console for more information)"   Board crashed entirely.  Dunno that I should bother with the rest of the smoke right now.*

- **Action:** Rotate to **landscape** (or set DevTools to ~844×390 landscape). **Expected:** Still shows **touch chrome**, **not** the desktop left strip. *(P0 fix — dedicated landscape rail is a later phase; layout may be rough; only verify touch-vs-desktop classification.)*

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** With an empty canvas, inspect the board surface in **light** theme. **Expected:** Subtle board-paper affordance — faint paper fill / vignette (not flat sterile white).

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Switch to **dark** theme (or System+dark) and repeat on empty canvas. **Expected:** Same subtle board-paper affordance reads in dark mode.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

**Section A verdict** (check one):

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

---

## Section B — Show/Hide tools toggle (Phase 1, `7e15518`)

- **Action:** In portrait, look at the top bar after the LIVE/timer area (left cluster). **Expected:** A **"Hide tools"** pill is visible **in the top bar**, **not** floating over the canvas.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Tap **"Hide tools"**. **Expected:** Bottom toolbar **and** props summary bar collapse; canvas gains vertical space.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** While tools are hidden, inspect the pill. **Expected:** Label reads **"Show tools"** with a gentle pulse/accent so it's discoverable.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Tap **"Show tools"**. **Expected:** Bottom chrome returns to default (toolbar + props summary visible).

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Toggle hidden ↔ shown; watch pill placement. **Expected:** The toggle **never** sits over the canvas in either state.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

**Section B verdict** (check one):

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

---

## Section C — Tier-1 tool retier (Phase 2, `e36bab6`)

- **Action:** Inspect the bottom tier-1 toolbar order. **Expected:** **Select · Pencil · Eraser · Shapes▾ · Styles · Wand · ⋮** (left to right).

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Tap **"Styles"**. **Expected:** Props **bottom sheet** opens (colors & styles).

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Scan tier-1 for Text. **Expected:** **Text is NOT** in tier-1.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Tap **⋮** and scan overflow. **Expected:** **Text** lives inside the overflow menu/sheet.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Exercise each tier-1 tool: Select (tap/move), Pencil (draw), Eraser (erase), Shapes▾ (pick a shape, draw), Wand. **Expected:** Each tool selects and works on the canvas.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

**Section C verdict** (check one):

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

---

## Section D — Button-opened bottom sheets (Phase 3, `25d7538`)

- **Action:** With a shape already active, tap **Shapes▾** again (second tap). **Expected:** A **bottom sheet** of shape options opens; picking a shape selects it and **closes** the sheet.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Tap **⋮**. **Expected:** **Overflow bottom sheet** opens, including **Text**, z-order, delete, hand/pan (or equivalent overflow actions).

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Open props (Styles), then open Shapes sheet, then overflow. **Expected:** **Only ONE sheet** open at a time (opening shapes closes props, etc.).

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Open any sheet; dismiss via **swipe-down** on the handle. **Expected:** Sheet closes.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Re-open; dismiss by tapping the **backdrop/scrim**. **Expected:** Sheet closes.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Re-open; dismiss via the **×** close button. **Expected:** Sheet closes.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** Open shapes and overflow sheets in **portrait** and **landscape**. **Expected:** Sheets are **not clipped/cut off** at the screen edge in either orientation.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

**Section D verdict** (check one):

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

---

## Section E — Regression / desktop-unchanged check

- **Action:** At **desktop width** (≥1024px or your usual tutor desktop), open the same whiteboard workspace. **Expected:** Looks/behaves **exactly as before** — persistent **left strip**, desktop shapes **flyout** + overflow **popover**, props **sidebar**. No mobile bottom toolbar or mobile sheets leaking in.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** On **mobile**, open props via **Styles** and exercise color/stroke controls. **Expected:** Props bottom sheet still works as before (controls respond; sheet dismisses cleanly).

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

- **Action:** On mobile (tools visible), locate the AV pip. **Expected:** AV pip stays **top-right on canvas**, clear of the top-bar Show/Hide tools toggle.

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

**Section E verdict** (check one):

- [ ] PASS
- [ ] FAIL

**Notes:**

> *(type here)*

---

## Overall result (pick one)

- [ ] **PASS** — All sections green; safe to merge Phases 0–3 into integration branch.
- [ ] **PARTIAL** — Works with caveats (document below); decide before merge.
- [ ] **FAIL** — Blocking issues; do not merge until fixed.

**Blocking issues found:**

> *(type here)*

---

*After smoke: capture notable quotes or UX surprises in `[docs/whiteboard-smoke-log.md](../whiteboard-smoke-log.md)`.*