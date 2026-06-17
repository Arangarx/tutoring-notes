# Phase 2 — student on new shell — smoke runbook

**Branch:** `phase2/wb-student-new-shell`
**Tip commit:** [`b7dbe0c`](https://github.com/Arangarx/tutoring-notes/commit/b7dbe0c38fad24bdc5be202da46554071ede3c3d)
**Preview:** <unverified — confirm in Vercel dashboard after push; Vercel MCP unavailable in executor environment — fetch `meta.branchAlias` for `githubCommitRef=phase2/wb-student-new-shell`>

> **Scope correction (Andrew 2026-06-17):** student = **full tutor-parity chrome + toolset** minus D1–D5 (+ D6 asset inserts tutor-only). No in-app `AVPermissionsPrompt`; browser-native getUserMedia only. A/V auto-requested on mount. **Exit** (not Leave). Read-only page strip. Student-color laser. Follow toggle preserved. No share link.

---

## Legend

| Field | How to fill it |
|---|---|
| **Branch** | `phase2/wb-student-new-shell` |
| **Tip commit** | HEAD of `phase2/wb-student-new-shell` at smoke time (parity rework) |
| **Preview** | Fetched via Vercel MCP — `meta.branchAlias` for `githubCommitRef=phase2/wb-student-new-shell` |
| **Overall result** | PASS only if every in-scope item PASS |

Run order: top to bottom. Item 12 repeats 1–5 in light and dark.

---

### 0. Loading scene repro (Step 0 spike)

**Action:** Tutor on new shell + student on new shell. Student hard-refresh 5×; cold join 5×. Watch for Excalidraw "Loading scene…" overlay or stuck board.

**Expect:** Document in Notes whether hang reproduces on new shell. If never seen, loading guard is belt-and-suspenders only.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 1. Student chrome frame

**Action:** Student opens join link `/w/[token]#k=…`. Inspect DOM: `data-testid="mynk-wb-chrome"` with `data-role="student"`. Tutor on same session sees tutor chrome.

**Expect:** Student sees unified Mynk chrome; tutor chrome unchanged.

**Ignore this run:** Theme parity (item 12).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 1b. Full student toolset + Exit + no permission prompt

**Action:** Student join on desktop. Confirm left tool strip has select, pencil, eraser, text, laser (wand), shapes, more/overflow, collapse. Top bar: mic/cam + device pickers, undo/redo, view menu (grid), toolbar hide/show, theme toggle. Button reads **Exit** (`data-testid="wb-student-exit"`). No in-app A/V enable card — only browser permission dialogs if needed. A/V should auto-request on load.

**Expect:** Full tutor-parity chrome minus share link, asset inserts, and page add/switch/delete. Exit shows local leave card (no server end-session). No `AVPermissionsPrompt` in DOM.

**Ignore this run:** Tutor-only PDF/image/graph insert buttons (D6).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 1c. Read-only page strip

**Action:** Tutor adds/switches boards. Student observes bottom page strip.

**Expect:** Student strip shows active board indicator only — tabs not clickable, no `+` add, no delete. Page changes only when tutor applies.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 1d. Student laser (D2)

**Action:** Student selects laser wand. Move pointer on board while tutor watches.

**Expect:** Tutor sees student-colored laser pointer trail (distinct from tutor laser color).

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 1e. Recording disclosure (B4)

**Action:** Student join on desktop and phone portrait. Read top bar without scrolling.

**Expect:** Copy visible: *This session is being recorded by your tutor. What you draw is visible live.*

**Ignore this run:** Consent toggle (P3).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Mutual draw

**Action:** Tutor draws; student draws. Two devices or two browsers.

**Expect:** Each stroke appears on the other side within ~2s. Student may use full toolset (shapes, text, select, eraser).

**Ignore this run:** Student-initiated asset inserts (D6 tutor-only).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Page isolation

**Action:** Tutor on Board 1 vs Board 2. Student strokes on active page only.

**Expect:** Student strokes stay on active page; no cross-page bleed.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. PDF / image hydrate

**Action:** Tutor inserts PDF page. Student waits for hydrate.

**Expect:** Student sees tutor-inserted PDF content on the board.

**Ignore this run:** Student-initiated insert (out of scope).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. Graph embed read-only

**Action:** Tutor inserts graph embed. Student views board.

**Expect:** Graph visible read-only on student; link does not navigate away.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. Follow toggle

**Action:** Default follow ON. Toggle off; pan independently. Click Match view / follow checkbox on.

**Expect:** Default follows tutor viewport; independent view works; snap restores tutor view.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Self-view ON

**Action:** Student grants camera (browser dialog on auto-request). Check own tile in `WbAVCluster`. Top-bar mic/cam device pickers on desktop. Repeat on mobile portrait ≤428px width.

**Expect:** Self-view tile visible when cam granted; top-bar device pickers work on desktop; touch overflow sheet covers mic/cam on mobile.

**Ignore this run:** Recording gain/chime controls (tutor recording graph only).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. A/V bidirectional

**Action:** Tutor and student mic/cam on. Speak on each side.

**Expect:** Tutor hears student; student hears tutor.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8b. Device hotload (student path)

**Action:** Mid-session, plug in second webcam or headset on student device without refresh. Use top-bar mic/cam pickers.

**Expect:** Call stays up; new device appears in picker (mark **tested** vs **assumed** in Notes).

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9. Student hard refresh

**Action:** Mid-session student hard refresh (`Ctrl+Shift+R` / pull-to-refresh).

**Expect:** Board strokes on active page rehydrate; session reconnects.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 10. Loading guard + dual-banner

**Action:** If board stuck loading, confirm single reload CTA. Check console for `[wjg]` lines (`loading_stuck`, `student_reload`).

**Expect:** Only one reload banner at a time (guard suppresses board-wait when stuck). `wjg` mount → `loading_cleared` or `loading_stuck`.

**Ignore this run:** If hang never reproduces (item 0), SKIP with reason.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 11. Mobile layout

**Action:** Phone portrait. Use bottom tool bar (full strip); draw with pencil and a shape; confirm page strip is read-only (cannot switch tabs).

**Expect:** Canvas ≥80% viewport; bottom bar has full tool tier; page strip shows active board only (no tab switch).

**Ignore this run:** Desktop layout.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 12. Theme — light and dark

**Action:** Repeat items 1, 1b, 1e, 2, 3, 4, 5 in **light**, then **dark** (WB theme toggle on student top bar).

**Expect:** Both themes pass for each sub-check.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 13. Session ended

**Action:** Tutor ends session. Student page open.

**Expect:** Student sees ended copy; console `[wjg] … action=session_ended`.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 14. Tutor regression (extend-don't-rewrite)

**Action:** Tutor: start session, record FSM, page switch, self-view, End Session (while student is on new shell).

**Expect:** Tutor path unchanged vs pre-P2 baseline; no recording FSM regression.

**Ignore this run:** Student-only chrome items.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

**Integration branch:** `v1-redesign` (after Andrew merge)
**Integration preview:** fetch alias after merge

### 1. Student new shell on integration preview

**Action:** After merge, repeat items 2, 7, 14 on integration Preview.

**Expect:** Same as feature branch.

**Ignore this run:** Until merged.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Overall result

- [ ] PASS
- [ ] FAIL
