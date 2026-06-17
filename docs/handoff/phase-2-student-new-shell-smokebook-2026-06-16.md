# Phase 2 — student on new shell — smoke runbook

**Branch:** `phase2/wb-student-new-shell`
**Tip commit:** [`e7eec65`](https://github.com/Arangarx/tutoring-notes/commit/e7eec65)
**Preview:** [phase2/wb-student-new-shell preview](https://tutoring-notes-git-phase2-wb-stu-9fb9ae-arangarx-5209s-projects.vercel.app)

**Vercel env (required for items 2+):** set `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1` on this branch Preview before smoke. Production stays off until retire-legacy gate.

---

## Legend

| Field | How to fill it |
|---|---|
| **Branch** | `phase2/wb-student-new-shell` |
| **Tip commit** | `e7eec65` at smoke time |
| **Preview** | Fetched via Vercel MCP — `meta.branchAlias` for `githubCommitRef=phase2/wb-student-new-shell` |
| **Overall result** | PASS only if every in-scope item PASS |

Run order: top to bottom. Item 13 repeats 2–6 in light and dark.

---

### 0. Loading scene repro (Step 0 spike)

**Action:** Tutor on new shell + student on new shell (flag on). Student hard-refresh 5×; cold join 5×. Watch for Excalidraw "Loading scene…" overlay or stuck board.

**Expect:** Document in Notes whether hang reproduces on new shell. If never seen, loading guard is belt-and-suspenders only.

**Ignore this run:** Legacy student path (flag off).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 1. Flag off — legacy student path

**Action:** Set Preview `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=0` (or unset). Open student join link `/w/[token]#k=…`. Draw one stroke; confirm legacy card layout (not `mynk-wb-chrome`).

**Expect:** Legacy `StudentWhiteboardClient` unchanged; mutual draw still works within ~2s.

**Ignore this run:** New-shell chrome styling.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Flag on — student chrome frame

**Action:** Set Preview `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1`. Student opens join link. Inspect DOM: `data-testid="mynk-wb-chrome"` with `data-role="student"`. Tutor on same session sees tutor chrome.

**Expect:** Student sees unified Mynk chrome; tutor chrome unchanged.

**Ignore this run:** Theme parity (item 13).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2a. Recording disclosure (B4)

**Action:** Flag on. Student join on desktop and phone portrait. Read top bar without scrolling.

**Expect:** Copy visible: *This session is being recorded by your tutor. What you draw is visible live.*

**Ignore this run:** Consent toggle (P3).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Mutual draw

**Action:** Flag on. Tutor draws; student draws. Two devices or two browsers.

**Expect:** Each stroke appears on the other side within ~2s.

**Ignore this run:** Shape tools on student (pencil+eraser only).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. Page isolation

**Action:** Tutor on Board 1 vs Board 2. Student strokes on active page only.

**Expect:** Student strokes stay on active page; no cross-page bleed.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. PDF / image hydrate

**Action:** Tutor inserts PDF page. Student waits for hydrate.

**Expect:** Student sees tutor-inserted PDF content on the board.

**Ignore this run:** Student-initiated insert (out of scope).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. Graph embed read-only

**Action:** Tutor inserts graph embed. Student views board.

**Expect:** Graph visible read-only on student; link does not navigate away.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Follow toggle

**Action:** Flag on. Default follow ON. Toggle off; pan independently. Click Match view / follow checkbox on.

**Expect:** Default follows tutor viewport; independent view works; snap restores tutor view.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. Self-view ON

**Action:** Student grants camera. Check own tile in `WbAVCluster`. Repeat on mobile portrait ≤428px width.

**Expect:** Self-view tile visible when cam granted; not silently dropped on mobile.

**Ignore this run:** Device picker UI (P2 omit).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9. A/V bidirectional

**Action:** Flag on. Tutor and student mic/cam on. Speak on each side.

**Expect:** Tutor hears student; student hears tutor.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9b. Device hotload (student path)

**Action:** Mid-session, plug in second webcam or headset on student device without refresh.

**Expect:** Call stays up; new device enumerated (mark **tested** vs **assumed** in Notes).

**Ignore this run:** Video device picker UI.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 10. Student hard refresh

**Action:** Mid-session student hard refresh (`Ctrl+Shift+R` / pull-to-refresh).

**Expect:** Board strokes on active page rehydrate; session reconnects.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 11. Loading guard + dual-banner

**Action:** If board stuck loading, confirm single reload CTA. Check console for `[wjg]` lines (`loading_stuck`, `student_reload`).

**Expect:** Only one reload banner at a time (guard suppresses board-wait when stuck). `wjg` mount → `loading_cleared` or `loading_stuck`.

**Ignore this run:** If hang never reproduces (item 0), SKIP with reason.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 12. Mobile layout

**Action:** Phone portrait. Flag on. Use bottom tool bar; draw; switch board tabs.

**Expect:** Canvas ≥80% viewport; bottom bar usable; tabs ≤40px strip.

**Ignore this run:** Desktop layout.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 13. Theme — light and dark

**Action:** Repeat items 2, 2a, 3, 4, 5, 6 in **light**, then **dark** (WB theme toggle on student top bar).

**Expect:** Both themes pass for each sub-check.

**Ignore this run:** System-only theme on legacy path.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 14. Session ended

**Action:** Tutor ends session. Student page open.

**Expect:** Student sees ended copy; console `[wjg] … action=session_ended`.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 15. Tutor regression (extend-don't-rewrite)

**Action:** With flag **on** and **off**, tutor: start session, record FSM, page switch, self-view, End Session.

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

**Action:** After merge, set flag on integration Preview; repeat items 3, 8, 15.

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
