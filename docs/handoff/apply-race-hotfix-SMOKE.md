# Student apply-race hotfix + Cloudflare TURN — smoke runbook

**Branch:** `fix/wb-student-apply-race`
**Tip commit:** [`8d159bf1`](https://github.com/Arangarx/tutoring-notes/commit/8d159bf1d8d8e03b0dcaea34b1a7cc077b08e672)
**Preview:** [preview.usemynk.com](https://preview.usemynk.com) · [tutoring-notes-git-fix-wb-studen-40796b](https://tutoring-notes-git-fix-wb-studen-40796b-arangarx-5209s-projects.vercel.app)

Both preview links are aliases on the READY deployment for `8d159bf1` (`githubCommitRef` `fix/wb-student-apply-race`). Use either one. Sign in as the tutor on desktop Chrome. Allow the camera and the microphone on every device when the browser asks.

This pass is hardware judgment only: real same-network and cellular paths, the join-time board, and a live refresh. Leave every box unchecked until you run that item.

### 1. Same Wi-Fi — student joins, Start enables, video and audio both ways

**Action:** Put the tutor desktop and the student device (a phone, or a second laptop) on the same Wi-Fi. On the phone, turn cellular data off so the path is the shared network. On the preview, open a student and start a whiteboard session. Stay on **Live (remote)** in the waiting room ("Ready to start?"). Click **Copy student link** and open that link on the student device. Allow camera and microphone on both sides. Wait in the waiting room; do not press **Start session** until it enables itself. After it enables, press **Start session**. Speak on the tutor, then on the student. Look at each other's camera tiles.

**Expect:** The student's tile on the tutor leaves "Connecting…" (and never sits on "Connection failed"). The hint "Waiting for {student} to connect…" goes away and **Start session** is clickable. The student's waiting-room heading leaves "Connecting…" and reads that they are in and the tutor will start shortly. After **Start session**, both people are on the live board. Each person hears the other, and each person's camera shows on the other device.

**Ignore this run:** The 12 waived master Playwright failures are not smoke items. Camera-tile glitches after a refresh are item 35 tracked on `feat/org-qol` — ignore them. This item does not use cellular data (that is item 2) and does not use **In-person**.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-av-mesh.spec.ts › relay-only peers connect through the server-issued TURN servers]` `[human-only: real NAT / same-network routing]`

**Notes:**

### 2. Cellular student, desktop tutor — video and audio both ways

**Action:** Tutor stays on desktop Chrome on the preview (Wi-Fi or ethernet is fine). Student uses a phone with Wi-Fi turned off and cellular data on. Repeat the item 1 path: tutor opens a live-remote whiteboard waiting room, copies the student link, student opens it on cellular, both allow camera and microphone. Wait until **Start session** enables, then start. Speak each way and look at the camera tiles.

**Expect:** Same as item 1, on a cellular path. The student's tile on the tutor leaves "Connecting…" and does not stick on "Connection failed". **Start session** becomes clickable without a reload or a Retry. After start, each person hears the other and sees the other's camera.

**Ignore this run:** The 12 waived master Playwright failures are not smoke items. Camera-tile glitches after a refresh are item 35 tracked on `feat/org-qol` — ignore them. Same-Wi-Fi behavior is item 1; leave the phone off Wi-Fi for this item.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: phone on cellular data against a desktop tutor; no hermetic stand-in for carrier NAT]`

**Notes:**

### 3. Join-time board — tutor marks during the student's load all arrive, and student edits are not wiped

**Action:** Use a live session that is already started (item 1 or a new **Live (remote)** session). Close the student tab. On the tutor, stay on Board 1 of the live board. Reopen the student link so the student's board is loading again. While that board is still coming up — before it looks ready — on the tutor draw three strokes in different places on Board 1, click **Add board**, draw one stroke on Board 2, click the **Board 1** tab, then the **Board 2** tab. When the student's pencil works, on the student draw one stroke, Undo it (Undo control, or Ctrl+Z on a desktop), then draw a second stroke and leave that one. On the tutor, click **Insert graph** and wait until that graph is visible on the student. Then draw one more tutor stroke and, in that same moment, on the student open **ƒ Expressions** on the graph, type `x^2`, and press Enter. On the tutor, Undo the stroke you just drew and immediately draw a different stroke in another spot.

**Expect:** Every tutor stroke you kept is on the student, on the board where you drew it. Board 2 shows the Board 2 stroke and does not show the Board 1 strokes. Board 1 shows the Board 1 strokes and does not show the Board 2 stroke. The student's undone stroke is absent on both boards. The stroke the student left in place is on both boards, including after your later strokes land. The graph shows `x^2` on both boards. The tutor stroke you undid is absent on both boards, and the stroke you drew immediately after that undo is present on both boards.

**Ignore this run:** The 12 waived master Playwright failures are not smoke items. Camera-tile glitches after a refresh are item 35 tracked on `feat/org-qol` — ignore them. Whether video reconnects within ~15 s is item 4; judge the board here. Do not read console flush logs.

**Coverage:** `[automated: tests/integration/wb-student-apply-race.spec.ts › T8 — tutor-only activity (strokes, board add, board switch with prefetch) makes the student send zero post-apply flushes]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T3a — student stroke drawn inside the viewport-align window exists on both peers after the next apply]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T3b — pencil stroke started while the apply is parked and finished after release exists on both peers]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T5a — student undo inside the viewport-align window is not resurrected by the next apply]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T5b — tutor erase while the student apply is held is not resurrected on either peer]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T5c — tutor undo followed in the same tick by another stroke: the undone stroke is gone on both peers]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T6 — tutor switches to a new blank board while the student apply is held: board 2 gets no board-1 elements]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T7 (chromium student) — stroke drawn on the new board while the tutor's board switch is held persists on both peers, only on that board]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T7 (webkit student) — stroke drawn on the new board while the tutor's board switch is held persists on both peers, only on that board]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T1 (chromium student) — graph expression added while the apply is parked before hydrate survives and reaches the tutor]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T1 (webkit student) — graph expression added while the apply is parked before hydrate survives and reaches the tutor]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T2 (chromium student) — graph expression added inside the viewport-align window survives the next apply and reaches the tutor]` `[automated: tests/integration/wb-student-apply-race.spec.ts › T2 (webkit student) — graph expression added inside the viewport-align window survives the next apply and reaches the tutor]` `[human-only: unforced timing while a real student board is loading; the specs park the apply on a test-only hold]`

**Notes:**

### 4. Student refresh mid-session — back within about 15 seconds, tutor does nothing

**Action:** Continue a live session that already has video, audio, and at least one stroke on the board (item 1 and item 3, or a short new session). Note one stroke you can recognize. On the student device only, refresh the browser tab. On the tutor, do nothing: no Retry, no reload, no mic or camera toggle, no second link. Time from the student refresh until the student is back.

**Expect:** Within about 15 seconds the student is back on the live board without the tutor doing anything. The student's tile on the tutor is not stuck on "Connecting…" or "Connection failed". Each person hears the other again. The stroke you noted before the refresh is still on the student's board.

**Ignore this run:** The 12 waived master Playwright failures are not smoke items. Camera-tile glitches after a refresh are item 35 tracked on `feat/org-qol` — ignore them (a glitchy camera tile after refresh is not a failure of this item). Judge the link coming back, the audio, and the board.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: real tab refresh and WebRTC reconnect timing on a live session]`

**Notes:**

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL
