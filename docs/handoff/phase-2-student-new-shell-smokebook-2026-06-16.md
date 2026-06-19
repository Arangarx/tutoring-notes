# Phase 2 — student on new shell — smoke runbook

**Branch:** `phase2/wb-student-new-shell`
**Tip commit:** `[b7dbe0c](https://github.com/Arangarx/tutoring-notes/commit/b7dbe0c38fad24bdc5be202da46554071ede3c3d)`
**Preview:** [phase2/wb-student-new-shell @ Vercel](https://tutoring-notes-git-phase2-wb-stu-9fb9ae-arangarx-5209s-projects.vercel.app)

> **Scope correction (Andrew 2026-06-17):** student = **full tutor-parity chrome + toolset** minus D1–D5 (+ D6 asset inserts tutor-only). No in-app `AVPermissionsPrompt`; browser-native getUserMedia only. A/V auto-requested on mount. **Exit** (not Leave). Read-only page strip. Student-color laser. Follow toggle preserved. No share link.

---

## Legend


| Field              | How to fill it                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **Branch**         | `phase2/wb-student-new-shell`                                                                 |
| **Tip commit**     | HEAD of `phase2/wb-student-new-shell` at smoke time (parity rework)                           |
| **Preview**        | Fetched via Vercel MCP — `meta.branchAlias` for `githubCommitRef=phase2/wb-student-new-shell` |
| **Overall result** | PASS only if every in-scope item PASS                                                         |


Run order: top to bottom. Item 12 repeats 1–5 in light and dark.

---

### 0. Loading scene repro (Step 0 spike)

**Action:** Tutor on new shell + student on new shell. Student hard-refresh 5×; cold join 5×. Watch for Excalidraw "Loading scene…" overlay or stuck board.

**Expect:** Document in Notes whether hang reproduces on new shell. If never seen, loading guard is belt-and-suspenders only.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:  No canvas loading message on any refresh/load**  
**Student on new page is not seeing video of either person.**  
**Student top bar has everything pushed off especially with the message there about it being recorded.**  
**Student is missing some options display, no "more styles" section in styles.  No other shapes drop down just the line button itself.**  
**Tutor laser pointer is orangish instead of red for tutor.**  
**Student laser point is same color. Tutor doesn't see**  
**Actually after several cold starts (didn't notice if after refresh) her video does show up on tutor side, but student still can't see either one**  
**The video tile(s) is/are flashing briefly before disappearing**  
My wife (acting as student) stepped away to use the restroom and it shows as connected on her side but on my side (tutor) it shows her as disconnected.  
  


---

### 1. Student chrome frame

**Action:** Student opens join link `/w/[token]#k=…`. Inspect DOM: `data-testid="mynk-wb-chrome"` with `data-role="student"`. Tutor on same session sees tutor chrome.

**Expect:** Student sees unified Mynk chrome; tutor chrome unchanged.

**Ignore this run:** Theme parity (item 12).

- [x] PASS
- [x] FAIL
- [ ] SKIP

**Notes: Not sure how to test this on phone.**  
**Passes on tutor side on desktop.**

---

### 1b. Full student toolset + Exit + no permission prompt

**Action:** Student join on desktop. Confirm left tool strip has select, pencil, eraser, text, laser (wand), shapes, more/overflow, collapse. Top bar: mic/cam + device pickers, undo/redo, view menu (grid), toolbar hide/show, theme toggle. Button reads **Exit** (`data-testid="wb-student-exit"`). No in-app A/V enable card — only browser permission dialogs if needed. A/V should auto-request on load.

**Expect:** Full tutor-parity chrome minus share link, asset inserts, and page add/switch/delete. Exit shows local leave card (no server end-session). No `AVPermissionsPrompt` in DOM.

**Ignore this run:** Tutor-only PDF/image/graph insert buttons (D6).

- [x] PASS
- [x] FAIL
- [ ] SKIP

**Notes:**  
**Can't see anything past the pill to the right of "Connected" pill on mobile.  Just noticed you're asking for desktop.  Is that just to confirm things at least exist?**  
**Tutor can't see student laser pointer.**  
**Styles display (of current selections) not visible at all on desktop (it was incomplete but at least showed on phone)**  
**Small screen for student loses stuff, even on desktop unless it is fullscreen it starts losing stuff.**  
**I liked the coral exit button with the exit symbol more than just the word "Exit"  At least maybe a coral button even if it's with text?**  
Student undo/redo not doing anything  
rest are present and appear to be working (other than graphics inserts which I guess you decided don't work well with auth)  
  


---

### 1b-exit. Exit disconnects tutor presence + A/V

**Action:** Two-device session (tutor + student). Confirm both connected (sync pill + call connected + session timer counting). Student clicks **Exit** (`data-testid="wb-student-exit"`). On **tutor** side, watch presence/timer/A/V cluster — do NOT close the student tab manually.

**Expect:** Student sees local "You left the session" card. Tutor sees student drop from presence (peer count / A/V tile gone), session timer stops accumulating for the departed student, and A/V mesh releases the student peer — same observable path as a real disconnect. Student tab may stay open on the leave card without holding the session open.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: After student rejoins, tutor side still shows disconnected and "waiting for video" instead of initials.**

---

### 1c. Read-only page strip

**Action:** Tutor adds/switches boards. Student observes bottom page strip.

**Expect:** Student strip shows active board indicator only — tabs not clickable, no `+` add, no delete. Page changes only when tutor applies.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Should it even highlight the board tab for student if it's not clickable?**  
**Tutor undo/redo is not working (tested while it thinks student is disconnected even though they aren't)**

---

### 1d. Student laser (D2)

**Action:** Student selects laser wand. Move pointer on board while tutor watches.

**Expect:** Tutor sees student-colored laser pointer trail (distinct from tutor laser color).

**Ignore this run:** Nothing.

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes: Both sides use same color laser pointer instead of having different colors.  Neither has it in the original red.  Student sees tutor, tutor does not see student.**

---

### 1e. Recording disclosure (B4)

**Action:** Student join on desktop and phone portrait. Read top bar without scrolling.

**Expect:** Copy visible: *This session is being recorded by your tutor. What you draw is visible live.*

**Ignore this run:** Consent toggle (P3).

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Mutual draw

**Action:** Tutor draws; student draws. Two devices or two browsers.

**Expect:** Each stroke appears on the other side within ~2s. Student may use full toolset (shapes, text, select, eraser).

**Ignore this run:** Student-initiated asset inserts (D6 tutor-only).

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Pass on desktop, fail on mobile.  Lots of tools missing mobile side, and most of top bar off screen.**

---

### 3. Page isolation

**Action:** Tutor on Board 1 vs Board 2. Student strokes on active page only.

**Expect:** Student strokes stay on active page; no cross-page bleed.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. PDF / image hydrate

**Action:** Tutor inserts PDF page. Student waits for hydrate.

**Expect:** Student sees tutor-inserted PDF content on the board.

**Ignore this run:** Student-initiated insert (out of scope).

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes: Student sees pdfs so that's good.  Her resolution is different so she sees a different amount of the pdf, not sure anything to be done about that.**  
**However, major regression, there is cross bleed AGAIN. Strokes from Board 2 showed up on Board 3 (pdf page 1) after it was imported.  I didn't notice if it was immediate or after I came back to the page but it bled  This has been solved TWICE.  Why is the data separation not being honored :(  This is getting stupid.**

---

### 5. Graph embed read-only

**Action:** Tutor inserts graph embed. Student views board.

**Expect:** Graph visible read-only on student; link does not navigate away.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:  I kinda wonder if the student shouldn't be able to enter expressions.  Wouldn't the tutor sometimes want them to graph something themselves?** 

---

### 6. Follow toggle

**Action:** Default follow ON. Toggle off; pan independently. Click Match view / follow checkbox on.

**Expect:** Default follows tutor viewport; independent view works; snap restores tutor view.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:  Student snaps back, but let's backlog making it so the student can't move their view in the first place if their views are synced.  Right now from a student perspective when they don't know what is happening it feels like a broken feature because they are moving/zooming and snapping back.**  
**I think the match tutor's view button could be much smaller.  We need to maybe see if we can find icons that convey the stay synced vs one tiem sync without taking so much space.**

---

### 7. Self-view ON

**Action:** Student grants camera (browser dialog on auto-request). Check own tile in `WbAVCluster`. Top-bar mic/cam device pickers on desktop. Repeat on mobile portrait ≤428px width.

**Expect:** Self-view tile visible when cam granted; top-bar device pickers work on desktop; touch overflow sheet covers mic/cam on mobile.

**Ignore this run:** Recording gain/chime controls (tutor recording graph only).

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes: Have no camera to confirm on other desktop, but no video shows on student side in these tests.**  

---

### 8. A/V bidirectional

**Action:** Tutor and student mic/cam on. Speak on each side.

**Expect:** Tutor hears student; student hears tutor.

**Ignore this run:** Nothing.

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes:  Slightly longer session seems to cause problems on my wife's old phone.  Hopefully it's just her old phone but it's something to watch out for, her chrome started wigging out/freezing.**  
**Retested with new session -> Audio goes both ways.  Video is still only on tutor side.**

---

### 8b. Device hotload (student path)

**Action:** Mid-session, plug in second webcam or headset on student device without refresh. Use top-bar mic/cam pickers.

**Expect:** Call stays up; new device appears in picker (mark **tested** vs **assumed** in Notes).

**Ignore this run:** Nothing.

- [x] PASS
- [x] FAIL
- [ ] SKIP

**Notes:**  
**desktop mic and camera selector dropsdowns are still terrible colors**  
**hotload seems to have worked on the student side, as soon as we plugged in the camera it tried to show camera on her side and she was able to switch to the camera mic.  It doesn't appear to have unloaded the unplugged mic, but that's probably "less" of an immediate concern, though it is something we need to cover.  We should probably do what teams does and ask the user if they want to switch devices when a new thing is plugged in.**  
**On student desktop she plugged in the web cam I normally have on my desktop.  Her mic dropdown has like 4 entries for the same brio mic but she doesn't appear to be sending any audio.  So camera transition from no camera seems okay, can't test from camera to camera.  Audio seems to pick up the new device but isn't hooking up correctly and possibly showing too many options.  This is not a new bug apparently, I looked on my desktop and it shows 3 entries for brio as well.  She selects the one as student I normally do and it doesn't send sound.**

---

### 9. Student hard refresh

**Action:** Mid-session student hard refresh (`Ctrl+Shift+R` / pull-to-refresh).

**Expect:** Board strokes on active page rehydrate; session reconnects.

**Ignore this run:** Nothing.

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes:  Board strokes stay, neither camera nor mic from web cam stayed recognized. She lost all A/V as student.**  
**I plugged the webcam back into my PC.  Bother are still in list (never left) but it doesn't hook back up.**

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
- [x] SKIP

**Notes: So much not working, not going to go to this right now, but mobile should rearrange in basically the same way that tutor does.**

---

### 12. Theme — light and dark

**Action:** Repeat items 1, 1b, 1e, 2, 3, 4, 5 in **light**, then **dark** (WB theme toggle on student top bar).

**Expect:** Both themes pass for each sub-check.

**Ignore this run:** Nothing.

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes:  Student switches to light mode, good.  Student switches back to dark mode, but their background of the canvas stayed white.  Stroke switched, background did not.**

---

### 13. Session ended

**Action:** Tutor ends session. Student page open.

**Expect:** Student sees ended copy; console `[wjg] … action=session_ended`.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 14. Tutor regression (extend-don't-rewrite)

**Action:** Tutor: start session, record FSM, page switch, self-view, End Session (while student is on new shell).

**Expect:** Tutor path unchanged vs pre-P2 baseline; no recording FSM regression.

**Ignore this run:** Student-only chrome items.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:  I didn't exhaustively test, but looks good.**

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