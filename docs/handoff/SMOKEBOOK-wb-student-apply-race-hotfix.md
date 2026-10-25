# Student edits no longer lost while a tutor update is landing (master hotfix) — smoke runbook

**Branch:** `fix/wb-student-apply-race`
**Tip commit:** [`0570a200`](https://github.com/Arangarx/tutoring-notes/commit/0570a2000861c3aa061af9793a96415310d56643)
**Base:** `master` [`eebafee1`](https://github.com/Arangarx/tutoring-notes/commit/eebafee1169acf8ba262140dc3efde6e60f83763)
**Preview:** [fix/wb-student-apply-race preview](https://tutoring-notes-git-fix-wb-studen-40796b-arangarx-5209s-projects.vercel.app)

---

## When Andrew runs this (mandatory policy)

Smokebooks are **not** mid-wave bug hunts. See [`.cursor/rules/smoke-when-done.mdc`](../../.cursor/rules/smoke-when-done.mdc).

| Phase | Who |
|-------|-----|
| Spec → implementation → Playwright per acceptance item → automated gates green | **Agents** |
| **One** hardware smoke when feature is **DONE** | **Andrew** |

**Smokebook items must be** new surface, subjective UX, or hardware / external-env paths Playwright cannot hermeticize. Use **Coverage** for automated citations; mark **N/A with notes** when Playwright already covers the behavior unless **human-only** applies. **Notes** is Andrew-only — leave blank during authoring.

Run order: top to bottom. Re-run **Cross-branch / post-merge** after this hotfix merges to `master` (and again when the same fix lands on `feat/org-qol`). This is a per-branch hotfix smoke, not the comprehensive pre-master both-theme run.

**Pair for every item:** real tutor laptop (desktop browser) and a real student iPhone (Safari), both on the **Preview** above, in one live whiteboard session. Student **follow** stays on unless an item says otherwise. Use a student you can scribble on.

---

## What this fix does

On the student phone, while a tutor update was being applied — and during the follow-view alignment right after it — anything the student drew, erased, undid, or typed into a graph was dropped, then overwritten by the tutor's copy. The update now merges with what is actually on the student's screen, and edits made during that window are saved and sent once it finishes. A student edit made right as the tutor switches to an already-loaded board is kept.

---

## Feature smoke items

### 1. Simultaneous drawing feel (tutor laptop + student iPhone)

**Action:** On the **Preview**, sign in as the tutor on the laptop. Open a student and start a **live** whiteboard session **with recording on** (you will end this same session in item 6). On the iPhone, open the student join link in Safari and join. Leave student **follow** on. Once both are on the live board, draw continuously at the same time for about one minute: tutor with the pencil (also pan and zoom while follow stays on), student with a finger on the phone. Vary stroke length. Glance at both screens while you draw, not only at the end.

**Expect:** Every student stroke stays on both screens. Nothing the student just drew flickers back to an older copy or disappears when the tutor's strokes, pans, or zooms land. Tutor strokes still show up on the phone. No new lag versus a normal master session.

**Ignore this run:** A stroke made in the split second the tutor switches to a brand-new empty board (item 4). Recording/replay behavior (item 6).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: real finger cadence and a live network — the relay hold is a parked apply, not a minute of overlapping touch]`. Hermetic window already green: `[automated: tests/integration/wb-student-apply-race.spec.ts › T3a — student stroke drawn inside the viewport-align window exists on both peers after the next apply]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T3b — pencil stroke started while the apply is parked and finished after release exists on both peers]`.

**Notes:**

### 2. Student graph editing while the tutor is active

**Action:** Same live pair, follow still on. On the laptop, drop a graph on the current board and keep drawing and moving other marks so tutor updates keep landing. On the iPhone, open that graph and type or edit an expression (for example `x^2`). Wait until the tutor has drawn at least a few more strokes after you finish typing. Look at the graph on both screens.

**Expect:** The expression you typed stays on the phone and shows on the tutor laptop. Later tutor strokes do not wipe it or revert the graph to empty.

**Ignore this run:** Graph styling, axis labels, or fit-to-view polish. Desmos-style math correctness beyond "the expression I typed is still there."

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: typing into a graph on a real iPhone while tutor updates arrive over the network]`. Hermetic window already green (webkit student is the iPhone 13 profile): `[automated: tests/integration/wb-student-apply-race.spec.ts › T1 (chromium student) — graph expression added while the apply is parked before hydrate survives and reaches the tutor]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T1 (webkit student) — graph expression added while the apply is parked before hydrate survives and reaches the tutor]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T2 (chromium student) — graph expression added inside the viewport-align window survives the next apply and reaches the tutor]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T2 (webkit student) — graph expression added inside the viewport-align window survives the next apply and reaches the tutor]`.

**Notes:**

### 3. Student undo and erase while the tutor is drawing

**Action:** Same live pair, follow still on. Tutor keeps drawing on the laptop the whole time. On the phone: (a) draw a short stroke, then **undo** it while the tutor is still drawing; (b) draw another short stroke and **erase** it (or erase one of your earlier marks) while the tutor is still drawing. After each, wait for a few more tutor strokes to land, then check both screens.

**Expect:** The undone stroke and the erased mark stay gone on the phone and on the laptop. They do not come back when the next tutor update arrives. Tutor strokes made during the undo/erase stay on both screens.

**Ignore this run:** Undo of the tutor's own strokes from the phone (tutor undo is not this item). Graph expression undo (item 2).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: real undo/erase gestures overlapping live tutor drawing]`. Hermetic cases already green: `[automated: tests/integration/wb-student-apply-race.spec.ts › T5a — student undo inside the viewport-align window is not resurrected by the next apply]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T5b — tutor erase while the student apply is held is not resurrected on either peer]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T5c — tutor undo followed in the same tick by another stroke: the undone stroke is gone on both peers]`.

**Notes:**

### 4. Board switch while the student is drawing

**Action:** Same live pair, follow still on. On the laptop, put a recognizable mark on **Board 1**. Add **Board 2** and put a different recognizable mark on it (both boards now have content and have been opened). Switch back to Board 1 so both are already loaded. Then, while the student is **mid-stroke** on the phone, switch to Board 2. Let the student finish that stroke (or start a new one on whichever board they landed on). Switch back to Board 1. Open each board on both devices and compare.

**Expect:** The student's stroke ends up only on the board where it was drawn. Marks from Board 1 do not show on Board 2, and marks from Board 2 do not show on Board 1, on either device.

**Ignore this run:** A stroke made in the split second while switching to a brand-new **empty** board may be lost. That is known, same as today, and backlogged. This item uses two boards that already have content.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: a finger still down across a real board switch]`. Hermetic cases already green (webkit student is the iPhone 13 profile): `[automated: tests/integration/wb-student-apply-race.spec.ts › T6 — tutor switches to a new blank board while the student apply is held: board 2 gets no board-1 elements]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T7 (chromium student) — stroke drawn on the new board while the tutor's board switch is held persists on both peers, only on that board]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T7 (webkit student) — stroke drawn on the new board while the tutor's board switch is held persists on both peers, only on that board]`.

**Notes:**

### 5. Idle check (follow on, nobody drawing)

**Action:** Same live pair. Stop drawing. Leave student follow on. Leave both devices on the live board, screen awake, for 1–2 minutes. Watch the phone and the laptop. Note whether the phone gets unusually warm or the battery drops faster than a normal idle session.

**Expect:** No flicker, no marks appearing or disappearing, no board jumping. Phone heat and battery drain stay in the normal range for an open live session. The board you left is the board still on screen.

**Ignore this run:** Ordinary screen-on battery use. Locking the phone or backgrounding Safari (not this item).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: phone heat, battery, and a minute of real idle on the network — no hermetic stand-in]`. Nearest automated echo guard (tutor activity must not make the student re-send the tutor's document; positive control is a real student stroke): `[automated: tests/integration/wb-student-apply-race.spec.ts › T8 — tutor-only activity (strokes, board add, board switch with prefetch) makes the student send zero post-apply flushes]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T8-control (chromium student) — a student stroke inside the viewport-align window logs at least one post-apply flush]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T8-control (webkit student) — a student stroke inside the viewport-align window logs at least one post-apply flush]`.

**Notes:**

### 6. Normal session end-to-end (recording, notes, replay)

**Action:** On the session from items 1–5 (recording was on from the start; if you already ended it, start a short new live session with recording on, draw one stroke from each device, then end). From the tutor laptop, end the session the way you usually do. Open that session's notes and the replay.

**Expect:** Start, draw, end, notes, and replay work as they do on master. The student strokes from this session are present. No new error toast on end.

**Ignore this run:** Some recording/replay automated tests already fail on master (known, being investigated separately; waiver recorded). If replay or recording misbehaves here, still mark **FAIL** and describe what you saw in Notes — it may be pre-existing, not this hotfix. Do not re-prove board-leak or follow-toggle alignment; those specs stayed green (see Coverage).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run the end-to-end pass. `[human-only: one real recorded session through notes and replay on this preview]`. Already green on this branch, do not re-smoke: `[automated: tests/integration/wb-e2-pdf-stroke-leak.spec.ts › board-3 strokes stay on board-3 after PDF import creates board-4+]`; `[automated: tests/integration/wb-e2-apply-remote-pdf-stroke-leak.spec.ts › applyRemote during fingerprint window does not merge foreign board-3 stroke onto PDF board]`; `[automated: tests/integration/wb-e3-blank-board-stroke-leak.spec.ts › addTutorPage path: injected stale Board-2 onChange rejected; pageDataRef[board3] stays empty]`; `[automated: tests/integration/wb-e3-blank-board-stroke-leak.spec.ts › selectTutorPage path: injected stale Board-2 onChange rejected; pageDataRef[board3] stays empty]`; `[automated: tests/integration/wb-e4-pdf-board-stroke-leak.spec.ts › post-fingerprint stale Board-3 onChange rejected; pageDataRef[board4] stays PDF-only]`; `[automated: tests/integration/wb-e5-pdf-board-stroke-bleed-initial-board.spec.ts › guard-clearing onChange + stale Board-1 onChange rejected; pageDataRef[board2] stays PDF-only]`; `[automated: tests/integration/wb-phantom-stroke-regression.spec.ts › degenerate line injected on tutor side does NOT propagate to student scene]`; `[automated: tests/integration/whiteboard-live-sync-regression.spec.ts › invariant 12d — student follow-toggle equal vertical inset in top bar (Wave 5 #9)]`.

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** `fix/wb-student-apply-race` merges into `master`. The same fix is then carried onto `feat/org-qol`. Fetch each preview via Vercel MCP (`list_deployments` → `meta.githubCommitRef` → `https://<meta.branchAlias>`). Do not pattern-match a `tutoring-notes-git-*` URL.

**Integration branch:** `master` (hotfix merge), then `feat/org-qol` (same fix carried forward)
**Integration tip commit:** `<short-sha after each merge — fill in; do not guess>`
**Integration preview:** `<unverified — fetch branchAlias via Vercel MCP after merge>`

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Master spot-check after the hotfix merge

**Action:** On the **master** preview (alias fetched after the merge), tutor laptop + student iPhone, one short live session with follow on. Draw at the same time for about 20 seconds, including one pan/zoom from the tutor. End the session.

**Expect:** Student strokes stay on both screens. No flicker back to an older copy. End session completes with no new error toast.

**Ignore this run:** Full items 1–6 again. Recording/replay failures already failing on master (item 6). Features that are only on `feat/org-qol`.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: one live pass on the post-merge master preview]`. Hermetic race tests stay the ones cited in items 1–4.

**Notes:**

### 2. Same fix on feat/org-qol, then Sarah's next production session

**Action:** After the same fix is on `feat/org-qol`, repeat the 20-second simultaneous-draw spot-check on that branch's preview (alias fetched at that time, not guessed). Separately, after the hotfix is on **production**, check Sarah's next real session (or the next session you sit in): student drawing while you draw, one board switch between boards that already have content, and a normal end.

**Expect:** On the `feat/org-qol` preview, student strokes survive tutor updates the same way as on this hotfix. On production, Sarah's session looks normal: no lost student strokes, no new flicker, end/notes as usual.

**Ignore this run:** Org-qol work that is not this apply-race fix. A stroke lost only in the split second of a switch onto a brand-new empty board (known, backlogged, same as item 4).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: feat/org-qol preview plus Sarah's next live production session]`.

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL
