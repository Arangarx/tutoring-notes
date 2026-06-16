# Phase 1 — WB Review Correct (in-frame) — smoke runbook

**Branch:** `phase1/wb-review-correct`  
**Tip commit:** `[eb3468e](https://github.com/Arangarx/tutoring-notes/commit/eb3468e1a0be08c939dc53936525ec167382b1b7)`  
**Preview:** [tutoring-notes-git-phase1-wb-rev-46b0a1](https://tutoring-notes-git-phase1-wb-rev-46b0a1-arangarx-5209s-projects.vercel.app)

> **Smoke focus = unified in-frame review surface** (one `TutorNotesSection` reflows prominent ↔ docked with **animated** transition; replay fills main frame inside live WB chrome; persist-once replay; **Hide replay** collapse). Standalone admin/share replay scrubber parity remains **DEFERRED** — regression-check only (D-items).

---

### 1. Hero landing — full-viewport notes primary (light theme)

**Action:** Tutor on desktop Chrome: start a whiteboard session → record ~30s with strokes and audio → **End session** (stay in workspace). Observe default view. Confirm **no** admin back-link, page `h1`, or `.container` framing — surface should take the full viewport like the live board.

**Expect:** **Notes-prominent** layout — single `TutorNotesSection` editable (`wb-review-notes-prominent`); confirm slot placeholder (`wb-review-confirm-slot`); board **final-frame** thumbnail (not black) in secondary column; **Replay session** CTA. **No** scrubber in hero. **No** "Open full replay". **Persistent Mynk WB top bar** (`wb-review-wb-topbar`) with **theme toggle** in hero state — not the old green "Session complete" bar. **No** Start whiteboard session anywhere on this surface (removed from top bar and More menu).

**Ignore this run:** Confirm section content (Phase 2). Notes AI quality. Tutor scratchy audio (B4). Polished blurred-line skeleton (backlogged).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Reset for 6th smoke @ eb3468e. FIX 4 (thumbnail WB theme): thumbnail now honors dark/light WB theme — dark board → dark bg thumbnail; re-exports on toggle. Prior fixes (B/C/D) still in place.**

---

### 2. Enter replay — animated transition + live chrome (light theme)

**Action:** From item 1 hero, click **Replay session** (with unsaved note edits if you like). Watch the transition — should be a **smooth ~250ms in-place reveal** (notes column narrows, replay pane slides in); **not** an instant hard swap or navigation feel. Scrubber at 0:00. Press **Play** without touching scrubber.

**Expect:** Notes recede to docked panel (`wb-review-notes-docked`) with CSS transition; replay pane fades/slides in (`wb-review-replay-pane--visible`). Replay uses **live whiteboard chrome** read-only; **Excalidraw canvas fills the chrome canvas region** (inside `mynk-wb-canvas`, below top bar, right of tool strip — **no dead-space gap** below chrome). Consolidated **WbCustomSlider** scrubber. Canvas shows **empty or first stroke** — NOT final-board flash. Audio from beginning. **Hide replay** (‹ chevron) on replay chrome top bar — **not** "Back to notes" on session top bar. **No** unsaved-changes confirm.

**Ignore this run:** Laser pointer. Live board tab switching (single static tab).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Reset for 6th smoke @ eb3468e. FIX 1 (recursion guard) removes the RangeError stack overflow that crashed the replay on first paint, and FIX 2 (replaySettledRef) prevents the hero↔replay loop. These were the root cause of item 2 instability. Prior: canvas-nesting + animated-transition already fixed. Verify: smooth animated entry, canvas inside chrome, audio starts from beginning (not t=0 bug).**

---

### 3. Scrubber true end — in-frame (light theme)

**Action:** Fresh in-frame replay entry. Let play to natural end.

**Expect:** Stops (no loop). Scrubber at 100%. Audio **stops** with scrubber (no orphan audio). Final stroke state. Press **Play** again → restarts from 0.

**Ignore this run:** Multi-segment boundary hitch (A6-1 deferred).

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Why is "Scroll back to content" excalidraw native button popping up when scrubber/audio reaches end.**

---

### 4. Scrub drag mid-session — audio seek (light theme)

**Action:** Pause in-frame replay. Drag scrubber to ~50% → release → **Play**.

**Expect:** Audio `currentTime` and scene resume from ~50%. **No audio from t=0** after drop. No corrupted audio during drag. (Hook test `useReplayTimelineController.scrub.test.ts` pins `audio.currentTime` on scrub commit + play; **Andrew must confirm in real browser with audible audio**.)

**Ignore this run:** Sub-250ms jitter.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Reset for 6th smoke @ eb3468e. FIX 1 (recursion guard) removes the stack overflow that crashed JS before any seek could fire. FIX 3 adds [avx] action=replay_scrub_seek console log — look for it on scrubber drop. Legacy seek contract still in place (Fix A from 5th smoke). Andrew must audible-confirm actual audio position after seek — automated console assert can only verify the seek LOG fires.**

---

### 5. Docked notes while replay playing (light theme)

**Action:** Enter in-frame replay; press **Play**. Edit notes in the **docked** panel (always visible — no drawer toggle). Type for 10s while replay continues.

**Expect:** Audio **keeps playing**. Docked notes do **not** cover scrubber or play/pause. Notes panel scrolls independently; canvas does not. Edits remain when switching back to prominent notes.

**Ignore this run:** Nothing.

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes:  I think there is some confusion here that you noted in your thinking earlier but never resolved.  If I click something like "hide replay" anything that makes the replay go away even visually, then yes the audio should pause.  When I said the audio didn't need to pause with a drawer, that was with the assumption that the replay would still be at least partly visible.**

---

### 6. Prominent↔docked edit survival — single notes instance (light theme)

**Action:** On hero, edit notes without saving. Click **Replay session** (no confirm expected). Edit another field in docked panel. Click **Hide replay**. Re-enter replay.

**Expect:** **No** dirty confirm on hero→replay. **Same text** in prominent and docked modes (one React state). Re-enter replay preserves edits. **Save** persists all via nsi.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Hide replay + replay return — persist-once replay (light theme)

**Action:** While replay playing, click **Hide replay** on replay chrome. Then re-enter via **Replay session**.

**Expect:** **Animated** return to prominent notes; edits preserved. Re-enter replay: scrubber shows **preserved position (not 0:00)**. Replay does **not** auto-pause audio on hide (persist-once; Andrew dropped auto-pause requirement). **No** escape to legacy standalone replay page.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Reset for 6th smoke @ eb3468e. FIX 1 removes the recursion crash that was preventing stable hide/return. FIX 2 (replaySettledRef) ensures hide-replay is a no-op until entry paint completes. Prior fix (init-effect never zeroes globalMs) still in place. Verify: hide → return → scrubber shows preserved position; re-enter plays from same point.**

---

### 8. No lossy transition guards (light theme)

**Action:** On hero, edit notes. Click **Replay session** — confirm no modal. Attempt browser tab close / navigate away (optional).

**Expect:** **No** "unsaved changes / continue?" dialog entering replay. **No** `beforeunload` guard (notes auto-save as DRAFT via nsi). Client-side prominence switch only (animated, not full navigation).

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9. Empty session — no recording CTA (light theme)

**Action:** End a session with **no audio and no whiteboard strokes** (instant end / no capture). Observe hero board column.

**Expect:** **No recording available.** message instead of Replay CTA. Thumbnail shows empty state (not a black frame). No broken empty replay player.

**Ignore this run:** Nothing.

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes:  "Cancel and delete session data" should not use javascript alert() >.>  Get that message in page ;p  Button says "Deleting..." but we didn't navigate away.  We should navigate away regardless and let cron clean the orphans.  I mention all this here because I was trying to do a new session to test this.**  
  
**New session is not starting a new session, it continues the last one.**  
  
**See empty thumbnail instead of message.  Though I'm not entirely certain it was a truly new session given the previous bug mentioned.**

---

### 10. No-audio session — synthetic clock (light theme)

**Action:** End a session with **whiteboard strokes but no audio** (mic denied or no capture). Enter in-frame replay via **Replay session**. Press **Play**; scrub to ~50%.

**Expect:** Replay advances on synthetic clock (strokes animate; scrubber moves). No crash. Scene state matches scrub position.

**Ignore this run:** Stroke/audio drift precision on long no-audio sessions.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:  Strokes play at right time.**

---

### 11. Multi-segment graceful degradation (if available)

**Action:** If a session has `audioSegments.length > 1`, enter in-frame replay.

**Expect:** Non-blocking chip *"Multi-part recording — timing may drift at part boundaries"*. Player does not crash.

**Ignore this run:** Boundary hitch fix (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [x] SKIP

**Notes:  Not going to bother testing this.  When everything works this won't even be a thing.**

---

### 12. Both themes — prominent + docked + replay

**Action:** Repeat items 1–2 and 5 with **dark** theme, then **light** (toggle via WB top bar theme menu in **both** hero and replay states).

**Expect:** Prominent notes, docked notes, and replay chrome readable in both themes. Theme reachable from hero (not replay-only). No white flash on stroke paint in dark.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 13. Ended `/workspace` revisit — notes-hero idempotent (light theme)

**Action:** After session ended (from item 1), navigate away then open `/admin/students/<id>/whiteboard/<wbsid>/workspace` directly. Also hard-refresh while on notes-hero after End Session.

**Expect:** Lands on the **same in-frame notes-hero** (`SessionReviewMode`), full viewport — **not** `WorkspacePreviousSessionPreview`. RSC refresh after End Session does not bounce to the old preview.

**Ignore this run:** Nothing.

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes:  Bug: Canvas thumbnail steals priority from theme dropdown.  If my mouse is over the thumbnail AND the theme selector, the thumbnail underneath takes priority on my click.**  
  
**Originally passed this till I tried playing the replay and it was the replay from a previous session.  These sessions are not idempotent at all now ;p**

---

### 14. Window resize — replay recenter (light theme)

**Action:** Enter in-frame replay with visible strokes. Note what's centered in the viewport. Resize browser window narrower, then wider.

**Expect:** After each resize, replay canvas **recenters** so the same scene content stays at viewport center (ResizeObserver + scroll recompute). No blank gap or canvas detached from chrome frame.

**Ignore this run:** Mobile/tablet layouts (desktop Chrome primary).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Reset for 6th smoke @ eb3468e. FIX 5: replaced createCameraFitter.fit() (bbox-refit flash) with center-preserving scroll math. viewportSnapshotRef captured after each applySceneAt; ResizeObserver computes new scrollX/scrollY so the pre-resize scene center stays at viewport center. Fallback to bbox-refit if no snapshot. Verify: no flash, content glides smoothly as window resizes.**

---

### ~~14. Start new session from review~~ — REMOVED

> **N/A this round.** Start whiteboard session was removed from the review surface entirely (new sessions start from student detail page). Former item 14 replaced by resize-recenter above.

---

## Deferred path — regression-check only

> Standalone admin (`/admin/students/<id>/whiteboard/<wbsid>`) and share replay still use legacy `WhiteboardReplay` with inline timeline — **scrubber fixes are NOT in scope this round.** Run these only to confirm **no regression** vs pre-branch behavior.

### D1. Standalone admin replay — load, play, scrub (regression)

**Action:** Tutor on desktop Chrome: open `/admin/students/<id>/whiteboard/<wbsid>` (full review page, **not** workspace). Session **with audio** and strokes. Press **Play**; pause; scrub ~50%; play again.

**Expect:** Page loads without crash. Legacy player still works. **Do not fail** on scrubber parity — in-frame only this round.

**Ignore this run:** Scrubber parity (deferred). Page chrome reskin. Tutor scratchy audio (B4).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### D2. Standalone admin replay — true end (regression)

**Action:** On D1 page, let playback run to natural end.

**Expect:** No crash. Legacy end behavior unchanged. **Do not fail** on scrubber-at-100% parity.

**Ignore this run:** Scrubber true-end parity (deferred). Multi-segment boundary hitch (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### D3. Share-link replay page — load (regression)

**Action:** Open valid share link (`/s/<token>`) for a session with recording. Press **Play** once.

**Expect:** Share replay loads and plays without crash. **Do not fail** on scrubber parity.

**Ignore this run:** Scrubber parity (deferred). Share chrome reskin.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

*(Run after merge to `v1-redesign` / `master` — not applicable on feature branch only.)*

---

## Overall result

- [ ] PASS
- [ ] FAIL