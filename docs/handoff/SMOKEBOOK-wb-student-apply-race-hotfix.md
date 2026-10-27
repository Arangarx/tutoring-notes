# Student drawing no longer disappears while the tutor is drawing — smoke runbook

**Branch:** `fix/wb-student-apply-race`
**Tip commit:** [`0570a200`](https://github.com/Arangarx/tutoring-notes/commit/0570a2000861c3aa061af9793a96415310d56643)
**Preview:** [whiteboard fix preview](https://tutoring-notes-git-fix-wb-studen-40796b-arangarx-5209s-projects.vercel.app)

---

## Before you start

This runbook is for you, Tyson. Plan on about **30 minutes**. Run the items from top to bottom. One live session covers items 1–6. Skip the **Cross-branch / post-merge** section at the bottom. Leave those boxes empty.

**What this is.** This is a fix for whiteboard drawing. When the student drew, erased, undid, or typed a graph formula at the same moment as the tutor was drawing or moving the board, the student's work could vanish. Open that fix in one of the two ways below. The six checks (items 1–6) are identical for either option.

**Devices.**

- **Device A** is your laptop or computer. You are the **tutor**.
- **Device B** is your phone (Android is fine). You are the **student**. If you have no phone, a second computer works; write that in **Notes** on item 1.

**Option A (simplest) — ask Andrew to switch preview.usemynk.com to the fix.** When you are ready to start this smoke, message Andrew and wait until he confirms [preview.usemynk.com](https://preview.usemynk.com) is switched. Then use [https://preview.usemynk.com](https://preview.usemynk.com) as usual: the same login, **Sign in with Google** is OK, and the camera and microphone are already allowed. The student link will also be on preview.usemynk.com. While it is switched, the organization features and the other preview fixes are **not** there. Finish or pause your other preview re-tests first, and do not test anything else during this smoke. Tell Andrew as soon as you are done so he can switch it back. If anything looks like the normal preview again mid-test (for example, organization pages reappear), stop and tell Andrew — it was switched back early.

**Option B — use the separate fix link directly (no need to wait for Andrew).** This link has **only** that fix. It is a different site address from [preview.usemynk.com](https://preview.usemynk.com). The other preview features (organizations and the rest) are **not** on this link. Do not test anything else here.

**Sign in on Device A (Option B).** Open the [whiteboard fix preview sign-in page](https://tutoring-notes-git-fix-wb-studen-40796b-arangarx-5209s-projects.vercel.app/login). Sign in with the **same tutor email and password** you use on preview.usemynk.com, then the second-factor code (email code, authenticator app, or text). You must sign in again here even if you are already signed in on preview.usemynk.com. Do **not** use **Sign in with Google**. Do not click password-reset or sign-up emails during this test.

**Which student (Option B).** Use a student that **you** (the tutor) added and connected. Do **not** use an organization learner. Organization learners will not work on this link. If you do not have a student you added and connected, **stop and tell Andrew**. Do not create a workaround.

**Starting a session.** Do this once, before item 1. These steps are the same for either option. Use the address you're using (Option A or B).

1. On Device A, open **Students** and open that student's page.
2. Press **Start**. The button may say **Start session**. You should land on a waiting screen that says **Ready to start?**
3. Leave the mode on **Online**. Do not choose **In person**.
4. Press **Copy student link**. Send that link to Device B (text or email to yourself is fine).
5. On your phone, open **that exact link**. Before you sign in, look at the address. It must be the address you're using (Option A or B). On Option B, open the student link exactly as copied and check it starts with `tutoring-notes-git-fix-wb-studen-40796b`. If Option B opens preview.usemynk.com or usemynk.com, **stop and tell Andrew**.
6. Sign in as the student or the parent, whichever the join page asks (**Child sign in** or **Parent sign in**).
7. On Option A, the camera and the microphone are already allowed. On Option B, allow the camera and the microphone on **both** devices when the browser asks. It asks again because this is a new address.
8. When Device B is in the waiting room, go back to Device A. When it is no longer waiting for the student to connect, press **Start session**. Both devices should now show the whiteboard.
9. On Device B, leave **Follow tutor view** on. If that switch is off, turn it on. The phone should keep looking at the same area of the board as the laptop.

**Stay on the address you're using (Option A or B) the whole time.** On Option B, do not open preview.usemynk.com or usemynk.com tabs for this test.

**Shared test database.** This preview uses the same data as preview.usemynk.com. Do not end or edit sessions you care about on preview.usemynk.com while you run this.

**If something blocks you** (you cannot log in, the link opens the wrong site, or the student will not connect): mark the item **FAIL** or **N/A with notes**, write what happened under **Notes**, and tell Andrew. Do not work around it.

**How to mark each item.** Check **one** box. Write what you actually saw under **Notes** (leave the line blank only if you have nothing to add).

- **PASS** — you ran it and it matched **Expect**.
- **FAIL** — you ran it and the main expectation failed, or it was wholly broken. Say what you saw.
- **PARTIAL** — some of the checks worked and some did not. Say which.
- **N/A with notes** — this item does not apply on this run (say why).
- **SKIP** — you chose not to run a valid test (say why).
- If every box is empty, the item was not run.

---

## Feature smoke items

### 1. Drawing at the same time

**Action:**

1. Use the live session from **Before you start**. Device A is the tutor on the computer. Device B is the student on your phone. **Follow tutor view** stays on. Near the top of Device A you should see the word **Recording**. Leave it. This same session is used through item 6. If you are not on the board yet, do **Starting a session** above first.
2. On Device A, choose the pencil. On Device B, draw with a finger (choose the pencil on the phone if it asks).
3. For about **one minute**, both of you draw at the same time. Mix short lines and longer lines.
4. On Device A, while you keep drawing, also move the board: hold the **Space** bar and drag. Then zoom in and out with the mouse wheel. If the wheel only slides the board up and down, hold **Ctrl** (or **Cmd** on a Mac) and roll the wheel.
5. Look at **both** screens while you are drawing, not only at the end. Watch the lines the student just made.

**Expect:** Every line the student draws stays on both screens. Nothing the student just drew flickers away or disappears when your lines, your pan, or your zoom show up on the phone. Your lines still show up on the phone. It should not feel slower than a normal session on preview.usemynk.com.

**Ignore this run:** A line made in the split second you switch to a brand-new empty board (item 4). Recording and replay (item 6).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: real finger cadence and a live network — the relay hold is a parked apply, not a minute of overlapping touch]`. Hermetic window already green: `[automated: tests/integration/wb-student-apply-race.spec.ts › T3a — student stroke drawn inside the viewport-align window exists on both peers after the next apply]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T3b — pencil stroke started while the apply is parked and finished after release exists on both peers]`.

**Notes:**

### 2. Student edits a graph formula while the tutor draws

**Action:**

1. Stay in the same live session. **Follow tutor view** stays on.
2. On Device A, press **Insert graph**. Choose **New blank graph**, then press **Insert**. A graph (a coordinate plane) appears on the board. Keep drawing other lines on the laptop the whole time the student is typing, so your updates keep arriving on the phone.
3. On Device B, tap the graph's formula line (the line on the graph that shows the formula). Type `x^2`, then leave that line (tap elsewhere on the graph, or press the keyboard's done / return key, so the formula is entered).
4. If the formula box is hard to reach on the phone, look for a button on the graph named **ƒ Expressions**, open it, and tap the formula line there. If you still cannot reach a box to type in, write that in **Notes**. That difficulty is a separate known issue. Do not invent another way to enter the formula.
5. After the formula is typed, wait until you have drawn at least a few more lines on Device A. Then look at the graph on **both** screens.

**Expect:** The formula you typed (`x^2`, or whatever you typed) stays on the phone and shows on the laptop. Later lines you draw on the laptop do not wipe it or put the graph back to empty.

**Ignore this run:** How the graph looks, the axis labels, and whether the math is "correct" beyond "the formula I typed is still there." If the phone's formula box was hard to reach, write that in **Notes**. That is a separate known issue. Do not fail this item only because the box was hard to open. If you could not type a formula at all, mark **PARTIAL** and say so.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: typing into a graph on a real iPhone while tutor updates arrive over the network]`. Hermetic window already green (webkit student is the iPhone 13 profile): `[automated: tests/integration/wb-student-apply-race.spec.ts › T1 (chromium student) — graph expression added while the apply is parked before hydrate survives and reaches the tutor]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T1 (webkit student) — graph expression added while the apply is parked before hydrate survives and reaches the tutor]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T2 (chromium student) — graph expression added inside the viewport-align window survives the next apply and reaches the tutor]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T2 (webkit student) — graph expression added inside the viewport-align window survives the next apply and reaches the tutor]`.

**Notes:**

### 3. Student undo and erase while the tutor draws

**Action:**

1. Stay in the same live session. **Follow tutor view** stays on.
2. On Device A, keep drawing the whole time. Do not stop for the student's undo or erase.
3. On Device B: draw a short line, then press **Undo** (the curved arrow in the toolbar) while Device A is still drawing. Wait until a few more of your lines have shown up on the phone. Look at both screens. The undone line should be gone on both.
4. On Device B: draw another short line, then switch to the **eraser** and rub that line out (or rub out one of your earlier marks) while Device A is still drawing. Wait until a few more of your lines have shown up. Look at both screens again.
5. You are watching two things: the student's undone or erased mark stays gone, and the lines you drew during that time stay on both screens.

**Expect:** The undone line and the erased mark stay gone on the phone and on the laptop. They do not come back when your next lines arrive. The lines you drew during the undo and the erase stay on both screens.

**Ignore this run:** Undoing the tutor's own lines from the phone. That is not this item. Undoing the graph formula is item 2.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: real undo/erase gestures overlapping live tutor drawing]`. Hermetic cases already green: `[automated: tests/integration/wb-student-apply-race.spec.ts › T5a — student undo inside the viewport-align window is not resurrected by the next apply]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T5b — tutor erase while the student apply is held is not resurrected on either peer]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T5c — tutor undo followed in the same tick by another stroke: the undone stroke is gone on both peers]`.

**Notes:**

### 4. Board switch while the student draws

**Action:**

1. Stay in the same live session. **Follow tutor view** stays on.
2. On Device A, on **Board 1**, draw a mark you will recognize, such as the letter **A**.
3. Press **Add board** (the **+** on the board tabs). A second tab appears (**Board 2**). Draw a different mark on it, such as the letter **B**. Both boards now have something on them, and you have opened both.
4. Switch back to **Board 1**.
5. On Device B, start a line and **keep your finger down**.
6. While that finger is still down, on Device A switch to **Board 2**.
7. On Device B, finish the line (lift your finger). If the phone changed boards, the line may finish on the board you landed on. That is fine. You can also draw one new short line on whichever board the phone is showing.
8. On Device A, switch back to **Board 1**.
9. On **both** devices, open **Board 1**, then **Board 2**. Compare what is on each.

**Expect:** The student's line is only on the board where it was drawn. Marks from Board 1 do not show on Board 2, and marks from Board 2 do not show on Board 1, on either device.

**Ignore this run:** A stroke made in the split second while switching to a brand-new **empty** board may be lost. That is known, same as today, and not a failure of this item. This item uses two boards that already have content.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: a finger still down across a real board switch]`. Hermetic cases already green (webkit student is the iPhone 13 profile): `[automated: tests/integration/wb-student-apply-race.spec.ts › T6 — tutor switches to a new blank board while the student apply is held: board 2 gets no board-1 elements]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T7 (chromium student) — stroke drawn on the new board while the tutor's board switch is held persists on both peers, only on that board]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T7 (webkit student) — stroke drawn on the new board while the tutor's board switch is held persists on both peers, only on that board]`.

**Notes:**

### 5. Idle for one to two minutes

**Action:**

1. Stay in the same live session. Stop drawing on both devices.
2. Leave **Follow tutor view** on. Leave both screens awake and on the live board.
3. Wait **1 to 2 minutes**. Watch the phone and the laptop. Do not lock the phone and do not switch away from the browser.
4. Notice whether the phone gets unusually warm, or the battery drops faster than a normal idle session with the board open.

**Expect:** No flicker. No marks appearing or disappearing. The board does not jump. The board you left is still the board on screen. Phone heat and battery drain stay in the normal range for an open live session.

**Ignore this run:** Ordinary screen-on battery use. Locking the phone or switching away from the browser. That is not this item.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run this item. `[human-only: phone heat, battery, and a minute of real idle on the network — no hermetic stand-in]`. Nearest automated echo guard (tutor activity must not make the student re-send the tutor's document; positive control is a real student stroke): `[automated: tests/integration/wb-student-apply-race.spec.ts › T8 — tutor-only activity (strokes, board add, board switch with prefetch) makes the student send zero post-apply flushes]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T8-control (chromium student) — a student stroke inside the viewport-align window logs at least one post-apply flush]`; `[automated: tests/integration/wb-student-apply-race.spec.ts › T8-control (webkit student) — a student stroke inside the viewport-align window logs at least one post-apply flush]`.

**Notes:**

### 6. A normal session, from recording through replay

**Action:**

1. Use the session from items 1–5. Recording starts by itself when the live session starts. On Device A, near the top, confirm you see the word **Recording**. You do not press a separate **Start recording** button. If the page says **Recording & notes off** instead, mark **N/A with notes** and tell Andrew.
2. If you already ended this session, start a short new one the same way as **Before you start** (Online, **Copy student link**, and check the join link is on the address you're using (Option A or B)). Draw one short line on each device before you end it. Do not use a session you care about.
3. On Device A, draw one short line if you have not already. On Device B, draw one short line. Confirm each line shows on the other device.
4. On Device A, press **End session**. Confirm if it asks.
5. Wait until you land on the review screen. Notes may still be filling in. That screen is the notes for this session.
6. Open the replay: a play control on that screen, or **View whiteboard** on the note. Press play and watch for a few seconds. Look for the lines from this session.

**Expect:** You can draw, end the session, open the notes, and play the replay. The student's lines from this session are there. No new error message traps you when you press **End session**.

**Ignore this run:** If the replay starts near the end, or jumps to the end, that is a known separate issue. Write what you saw in **Notes** and do not fail this item for that alone. Other recording or replay problems: still mark **FAIL** and describe what you saw. They may already happen on the normal site and are being looked at separately. Do not spend this item re-checking whether a mark leaked onto the wrong board, or whether the Follow control lines up with the button beside it.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Run the end-to-end pass. `[human-only: one real recorded session through notes and replay on this preview]`. Already green on this branch, do not re-smoke: `[automated: tests/integration/wb-e2-pdf-stroke-leak.spec.ts › board-3 strokes stay on board-3 after PDF import creates board-4+]`; `[automated: tests/integration/wb-e2-apply-remote-pdf-stroke-leak.spec.ts › applyRemote during fingerprint window does not merge foreign board-3 stroke onto PDF board]`; `[automated: tests/integration/wb-e3-blank-board-stroke-leak.spec.ts › addTutorPage path: injected stale Board-2 onChange rejected; pageDataRef[board3] stays empty]`; `[automated: tests/integration/wb-e3-blank-board-stroke-leak.spec.ts › selectTutorPage path: injected stale Board-2 onChange rejected; pageDataRef[board3] stays empty]`; `[automated: tests/integration/wb-e4-pdf-board-stroke-leak.spec.ts › post-fingerprint stale Board-3 onChange rejected; pageDataRef[board4] stays PDF-only]`; `[automated: tests/integration/wb-e5-pdf-board-stroke-bleed-initial-board.spec.ts › guard-clearing onChange + stale Board-1 onChange rejected; pageDataRef[board2] stays PDF-only]`; `[automated: tests/integration/wb-phantom-stroke-regression.spec.ts › degenerate line injected on tutor side does NOT propagate to student scene]`; `[automated: tests/integration/whiteboard-live-sync-regression.spec.ts › invariant 12d — student follow-toggle equal vertical inset in top bar (Wave 5 #9)]`.

**Notes:**

---

## Cross-branch / post-merge

Tyson: **do not run this section.** Leave every box below empty. It is only for after `fix/wb-student-apply-race` merges.

Run this section **after** `fix/wb-student-apply-race` merges into `master`. The same fix is then carried onto `feat/org-qol`. Fetch each preview via Vercel MCP (`list_deployments` → `meta.githubCommitRef` → `https://<meta.branchAlias>`). Do not pattern-match a `tutoring-notes-git-*` URL.

**Integration branch:** `master` (hotfix merge), then `feat/org-qol` (same fix carried forward)
**Integration tip commit:** `<short-sha after each merge — fill in; do not guess>`
**Integration preview:** `<unverified — fetch branchAlias via Vercel MCP after merge>`

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Master spot-check after the hotfix merge

**Action:** On the **master** preview (alias fetched after the merge), tutor laptop + student on your phone, one short live session with follow on. Draw at the same time for about 20 seconds, including one pan/zoom from the tutor. End the session.

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

Check this last, after items 1–6. The Cross-branch section is not part of this run.

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL
