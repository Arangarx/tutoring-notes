# Smoke runbook — Mobile whiteboard chrome (phone-portrait core, Phases 0–3)

> **Scope:** Tutor-side **touch chrome** on phone portrait (~390×844) and a quick landscape rotate check. Student chrome is a later phase. Tests the build on branch `feat/wb-mobile-chrome` (Phases 0–3). Desktop regression check included in Section E.
>
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

- [ ] PASS / [ ] FAIL — **Action:** At phone-portrait width, open the tutor whiteboard workspace. **Expected:** Touch chrome is active — **bottom toolbar** (and props summary above it), **not** the desktop left tool strip.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Rotate to **landscape** (or set DevTools to ~844×390 landscape). **Expected:** Still shows **touch chrome**, **not** the desktop left strip. *(P0 fix — dedicated landscape rail is a later phase; layout may be rough; only verify touch-vs-desktop classification.)*
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** With an empty canvas, inspect the board surface in **light** theme. **Expected:** Subtle board-paper affordance — faint paper fill / vignette (not flat sterile white).
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Switch to **dark** theme (or System+dark) and repeat on empty canvas. **Expected:** Same subtle board-paper affordance reads in dark mode.
  **Notes:**

**Section A verdict** (check one):

- [ ] PASS
- [ ] FAIL

---

## Section B — Show/Hide tools toggle (Phase 1, `7e15518`)

- [ ] PASS / [ ] FAIL — **Action:** In portrait, look at the top bar after the LIVE/timer area (left cluster). **Expected:** A **"Hide tools"** pill is visible **in the top bar**, **not** floating over the canvas.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Tap **"Hide tools"**. **Expected:** Bottom toolbar **and** props summary bar collapse; canvas gains vertical space.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** While tools are hidden, inspect the pill. **Expected:** Label reads **"Show tools"** with a gentle pulse/accent so it's discoverable.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Tap **"Show tools"**. **Expected:** Bottom chrome returns to default (toolbar + props summary visible).
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Toggle hidden ↔ shown; watch pill placement. **Expected:** The toggle **never** sits over the canvas in either state.
  **Notes:**

**Section B verdict** (check one):

- [ ] PASS
- [ ] FAIL

---

## Section C — Tier-1 tool retier (Phase 2, `e36bab6`)

- [ ] PASS / [ ] FAIL — **Action:** Inspect the bottom tier-1 toolbar order. **Expected:** **Select · Pencil · Eraser · Shapes▾ · Styles · Wand · ⋮** (left to right).
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Tap **"Styles"**. **Expected:** Props **bottom sheet** opens (colors & styles).
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Scan tier-1 for Text. **Expected:** **Text is NOT** in tier-1.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Tap **⋮** and scan overflow. **Expected:** **Text** lives inside the overflow menu/sheet.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Exercise each tier-1 tool: Select (tap/move), Pencil (draw), Eraser (erase), Shapes▾ (pick a shape, draw), Wand. **Expected:** Each tool selects and works on the canvas.
  **Notes:**

**Section C verdict** (check one):

- [ ] PASS
- [ ] FAIL

---

## Section D — Button-opened bottom sheets (Phase 3, `25d7538`)

- [ ] PASS / [ ] FAIL — **Action:** With a shape already active, tap **Shapes▾** again (second tap). **Expected:** A **bottom sheet** of shape options opens; picking a shape selects it and **closes** the sheet.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Tap **⋮**. **Expected:** **Overflow bottom sheet** opens, including **Text**, z-order, delete, hand/pan (or equivalent overflow actions).
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Open props (Styles), then open Shapes sheet, then overflow. **Expected:** **Only ONE sheet** open at a time (opening shapes closes props, etc.).
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Open any sheet; dismiss via **swipe-down** on the handle. **Expected:** Sheet closes.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Re-open; dismiss by tapping the **backdrop/scrim**. **Expected:** Sheet closes.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Re-open; dismiss via the **×** close button. **Expected:** Sheet closes.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** Open shapes and overflow sheets in **portrait** and **landscape**. **Expected:** Sheets are **not clipped/cut off** at the screen edge in either orientation.
  **Notes:**

**Section D verdict** (check one):

- [ ] PASS
- [ ] FAIL

---

## Section E — Regression / desktop-unchanged check

- [ ] PASS / [ ] FAIL — **Action:** At **desktop width** (≥1024px or your usual tutor desktop), open the same whiteboard workspace. **Expected:** Looks/behaves **exactly as before** — persistent **left strip**, desktop shapes **flyout** + overflow **popover**, props **sidebar**. No mobile bottom toolbar or mobile sheets leaking in.
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** On **mobile**, open props via **Styles** and exercise color/stroke controls. **Expected:** Props bottom sheet still works as before (controls respond; sheet dismisses cleanly).
  **Notes:**

- [ ] PASS / [ ] FAIL — **Action:** On mobile (tools visible), locate the AV pip. **Expected:** AV pip stays **top-right on canvas**, clear of the top-bar Show/Hide tools toggle.
  **Notes:**

**Section E verdict** (check one):

- [ ] PASS
- [ ] FAIL

---

## Overall result (pick one)

- [ ] **PASS** — All sections green; safe to merge Phases 0–3 into integration branch.
- [ ] **PARTIAL** — Works with caveats (document below); decide before merge.
- [ ] **FAIL** — Blocking issues; do not merge until fixed.

**Blocking issues found:**

---

*After smoke: capture notable quotes or UX surprises in [`docs/whiteboard-smoke-log.md`](../whiteboard-smoke-log.md).*
