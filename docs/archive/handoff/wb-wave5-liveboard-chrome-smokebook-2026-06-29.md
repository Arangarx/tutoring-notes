# WB-LIVEBOARD-STUDENT-CHROME (Thread A) — smoke runbook

**Branch:** `wb-wave5-liveboard-chrome`
**Tip commit:** [`dbdc3b0`](https://github.com/Arangarx/tutoring-notes/commit/dbdc3b0bdf0b8c36a9c66e331c27e0da3d8dddce)
**Preview:** [liveboard-chrome preview](https://tutoring-notes-git-wb-wave5-live-bc1168-arangarx-5209s-projects.vercel.app) *(Vercel state: BUILDING at smokebook authoring — confirm READY before run)*

Thread A fixes for student LIVE-board (post-Start) narrow-desktop chrome + mic meter parity. Playwright gates cover compaction, overflow device pickers, and inline meter DOM presence; this smokebook is for **feel + real microphone animation** only.

---

### 1. Student narrow-desktop top bar feel (8a)

**Action:** On the branch **Preview** URL, tutor starts a LIVE session and student joins. After tutor clicks **Start**, resize the **student** browser window to ~700px wide (half a laptop screen, non-touch desktop). Inspect the student top bar: exit (⋯ overflow), mic/cam controls, and whether anything clips off-screen horizontally.

**Expect:** The bar feels usable at half-screen — no horizontal scroll, exit and overflow controls reachable without hunting, recording-disclosure text not eating the row. Subjective: controls don't feel cramped or overlapping.

**Ignore this run:** Exact pixel widths of individual buttons; theme colors.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-chrome-interactions.spec.ts › 8a: student top bar compacts at narrow desktop — exit + overflow reachable, no horizontal overflow]`

**Notes:**  
**At some point we need to address the over compaction instead of fine-grained compaction, but that can be done later. Just make sure at some point we DO come back to it.  Probably not a massively high priority.**

---

### 2. Student overflow device pickers at narrow desktop (8b)

**Action:** Same session as item 1, student viewport ~700px wide. Open the student top-bar **⋯ overflow** menu. Look for mic and camera device picker sections.

**Expect:** You can change mic and camera from the overflow menu on a resized desktop window (not only on touch). Pickers are readable and don't clip outside the menu.

**Ignore this run:** Exact picker label copy; number of devices listed.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-chrome-interactions.spec.ts › 8b: student overflow menu includes device pickers at narrow desktop]`

**Notes:**

**We should probably put the mic and camera toggles right next to their pickers. Either that or maybe the pickers should move to the bottom of the "more" dropdown.  They take a lot of space.**  
**I think this passes, the only thing I notice is that on desktop the dropdown options go outside the browser window which is fine on desktop, will it stay inside on a phone?**

---

### 3. Student live-board mic inline meter visible (8c)

**Action:** After **Start**, on the **student** LIVE board at a wide viewport (~1280px), locate the mic control in the top bar (not the waiting-room overlay). Confirm a small vertical bar meter appears beside/near the mic chip.

**Expect:** The inline meter DOM is visible on the live-board mic control (parity with waiting-room overlay).

**Ignore this run:** Whether bars animate (item 4); meter styling polish.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-chrome-interactions.spec.ts › 8c: student live-board mic control contains inline meter DOM node]`

**Notes:**  
**Passes on student view, but has regressed on tutor view.**  
**Regression: Tutor bars no longer animate, whether muted or not on the live board.**

---

### 4. Voice-activity meter spans bars with real speech (8d — tutor + student)

**Action:** On real hardware with a laptop mic, join as **student** on the LIVE board (post-Start). Speak at quiet, normal, and louder volume — watch the inline mic meter on the **student** top bar. Repeat as **tutor** on the tutor top bar. Try both muted and unmuted (meter should still react to input when muted, per waiting-room parity).

**Expect:** During normal conversation, the meter lights **more than 1–2 bars** — quiet speech lights bar 1, normal speech reaches bar 2, louder speech can reach bar 3. Not pinned at ~2 bars for typical laptop-mic levels.

**Ignore this run:** Exact animation timing; bar color.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/mic-recorder-audio.test.ts › calibrateMicLevel — noise-floor calibration (8d)]` · `[human-only: live bar animation requires real microphone input — PLAYWRIGHT-GAP documented in wb-chrome-interactions.spec.ts]`

**Notes:**

**Passes for student. Same regression as noted for 3 for tutor.**

---

## Overall result

- [ ] PASS
- [x] FAIL