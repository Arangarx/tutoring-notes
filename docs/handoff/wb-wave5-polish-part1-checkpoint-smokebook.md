# Whiteboard reliability floor — Part 1 checkpoint (A/V hardware smoke) — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [2aaff59](https://github.com/Arangarx/tutoring-notes/commit/2aaff59)
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

This smokebook covers **only** the hardware/human-judgment A/V reliability items for the Part 1 checkpoint. All wave5 chrome/layout items are now Playwright-locked (green in `test:wb-sync`: wb-jest 672/672, wb-regression 39 passed/1 skipped) and must **not** be re-smoked — they are listed at the bottom under "Do NOT re-smoke (automated)". The three items below are things fake-device Playwright physically cannot reproduce (Windows multi-cam hardware; real `RTCPeerConnection` renegotiation; real network drop/rejoin).

---

### 1. Windows multi-cam device-picker integrity (WB-AV-GAP-1)

**Action:** On Windows with ≥2 cameras (or a real cam + a virtual cam) and ≥2 microphones, start a live whiteboard session. Open the mic/cam device picker; switch devices; change the window layout (full-screen → half-screen → narrow); then rapidly re-open the picker several times.

**Expect:** The device picker stays fully populated and shows the CORRECT current device every time — never "no webcam", empty, a wrong device, or duplicated entries. (This is the concurrent enumerateDevices×getUserMedia corruption the Part 1A enumerate-mutex fix targets.)

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes: Window seems to stay in "desktop" mode properly now, however when it gets thin enough some elements go off screen instead of compacting to more button.  I think the current setup is doing a good job using the whole bar instead of compacting too soon, but once buttons leave the viewport they should compact to more button.  And End Session should probably always stay on screen.**  
**Partial - was fail because student machine was not picking up the webcam, but eventually the mic was selectable.**

**So both audio and video are bidirectional now, but it took the student side a bit to pick up the camera.  Still a win though as it is eventually working, the detection just wasn't as fast as I'd expect.**  

**ooh and you made the left bar properly scrollable at very thin resolution.  we may need to come up with a better system later, but this is a win.**  

**Overall, I'd say this one is a major win, just worried about the time it took for the webcam to be selectable.**

---

### 2. Two-device "tutor hears student" incl. stalled-renegotiation recovery (WB-AV-GAP-2)

**Action:** Real two-device live session — tutor on one machine, student on another (ideally the dual-device join that historically wedged negotiation). After the student joins, have the student talk.

**Expect:** The tutor AUDIBLY hears the student, including the case where the first negotiation stalls. If watching logs: `[peer-mesh] event=renegotiation-watchdog-fire` appears, followed by the tutor's `event=remote-track kind=audio`.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:  Don't know about all the other bits but I can hear the student.**

---

### 3. Drop / rejoin recovery feel (stale-peer eviction + symmetric reconnect)

**Action:** Mid-session, have the student close their tab (or drop wifi briefly) then rejoin the same session; separately, briefly drop the tutor's sync connection.

**Expect:** The stale peer clears within ~6s; A/V re-establishes BOTH ways without a manual page refresh; no ghost/frozen remote tiles; no "student left" banner while the sync roster still shows the student present.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**  
**Student recovery was very snappy, but they have to re-pick mic. Better than before though.**  
**Both cases recover snappily.  I haven't tested this time, but I get a banner asking if I want to recover audio or discard it...I think we should always just keep it, no?**

---

## Do NOT re-smoke (automated)

These are Playwright-locked and regression re-proof — **not** to be smoked. If any misbehave on real hardware, that is a **new** Playwright gap to file, not an expected smoke item:

- half-width desktop stays desktop chrome (`tests/integration/wb-wave5-polish.spec.ts` › item 20)
- phone-landscape left rail Shapes + More reachable/not clipped (item 21)
- student narrow top-bar no overflow / no control overlap (item 22)
- overflow dropdown opens-downward + closes-on-widen (items 4 & 11)
- mic/cam picker readable on dark theme (native select item)
- student follow-toggle vertical alignment (`tests/integration/whiteboard-live-sync-regression.spec.ts` › invariant 12d)
- stuck loading spinner on join/rejoin (`tests/integration/wb-student-exit-rejoin.spec.ts` loading-guard asserts)

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [x] PASS
- [ ] FAIL