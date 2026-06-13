# Phase 1 — WB Replay In-Frame — smoke runbook

**Branch:** `phase1/wb-replay-in-frame`  
**Tip commit:** [`5b78b92`](https://github.com/Arangarx/tutoring-notes/commit/5b78b92558771a58fdc533f3a89057ff33a0ff24)  
**Preview:** [phase1/wb-replay-in-frame preview](https://tutoring-notes-git-phase1-wb-rep-7d986c-arangarx-5209s-projects.vercel.app)

> Vercel deployment `dpl_BC5iFXchFzXBXVZHiGUpbxTfra2W` was **INITIALIZING** at smokebook authoring time — wait for READY before running hardware items.

---

### 1. Standalone admin replay — load, play, scrub sync (light theme)

**Action:** Tutor on desktop Chrome: log in → open `/admin/students/<id>/whiteboard/<wbsid>` (full review page, **not** workspace). Use a session **with audio** and whiteboard strokes. Press **Play** without touching the scrubber. Pause mid-session. Drag scrubber to ~50%, release, press **Play** again.

**Expect:** Player loads. Audio and scene stay in sync on play and after scrub. Scrubber range covers the session (not stuck at 0). No crash. *(Admin page still uses legacy `WhiteboardReplay` wrapper — shared restore cache only; full hook parity is in-frame.)*

**Ignore this run:** Page chrome reskin. Tutor scratchy audio (B4).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Standalone admin replay — true end (light theme)

**Action:** On the same admin review page as item 1, let playback run to natural end.

**Expect:** Playback stops (no loop). Scrubber at 100%. Final stroke state visible. Press **Play** again → restarts from beginning.

**Ignore this run:** Multi-segment boundary hitch (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Hero landing — notes primary (light theme)

**Action:** Tutor: start a whiteboard session → record ~30s with strokes and audio → **End session** (stay in workspace in-shell review). Observe default view.

**Expect:** **Notes-hero** layout — `TutorNotesSection` editable; reserved confirm slot placeholder (`wb-review-confirm-slot`); board **final-frame** thumbnail in secondary column; **Replay session** CTA. No full-viewport replay; no scrubber in hero.

**Ignore this run:** Confirm section content (Phase 2). Notes AI quality. Tutor scratchy audio (B4).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. Enter replay — true start (light theme)

**Action:** From item 3 hero, click **Replay session**. Observe full-viewport in-frame replay. Scrubber at 0:00. Press **Play** without touching scrubber.

**Expect:** Replay chrome mirrors live WB (top bar, canvas well, bottom scrubber) but read-only — no tool strip. Canvas shows **empty or first stroke** — NOT final-board flash. Audio from beginning. Strokes sync with audio.

**Ignore this run:** Laser pointer. Board tabs (A6-6).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. Back to notes + replay return (light theme)

**Action:** While replay playing, click **Back to notes**. Then re-enter replay via **Replay session**.

**Expect:** Returns to hero; notes edits preserved. Re-enter replay: scrubber shows **preserved position (not 0:00)**. No audio leak after back.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. Scrubber true end — in-frame (light theme)

**Action:** Fresh in-frame replay entry. Let play to natural end.

**Expect:** Stops (no loop). Scrubber at 100%. Final stroke state. Play again → restarts from 0.

**Ignore this run:** Multi-segment (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Scrub drag mid-session — in-frame

**Action:** Pause in-frame replay. Drag scrubber to ~50% → release → Play.

**Expect:** Audio and scene resume from ~50%. No corrupted audio during drag.

**Ignore this run:** Sub-250ms jitter.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. Notes drawer while replay playing (light theme)

**Action:** Enter in-frame replay; press Play. Open **Notes** drawer. Type in notes fields for 10s while replay continues.

**Expect:** Audio **keeps playing**. Drawer does **not** cover scrubber or play/pause. Drawer body scrolls; canvas does not. Close drawer — replay still at correct position.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9. Unsaved notes guard + drawer↔hero edit survival (light theme)

**Action:** On hero, edit notes without saving. Click **Replay session** — choose **Continue**. Open notes drawer; edit another field. **Back to notes**. Observe hero notes. Re-enter replay; open drawer.

**Expect:** Confirm dialog when dirty on hero→replay. **Continue** preserves edits. Drawer edits visible in hero. Drawer shows same edits on re-enter. **Save** persists all via nsi.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 10. Ended `/workspace` revisit (regression)

**Action:** After session ended, navigate away then open `/admin/students/<id>/whiteboard/<wbsid>/workspace` directly.

**Expect:** `WorkspacePreviousSessionPreview` still renders (start-new-session flow). **Not** the in-shell two-state review.

**Ignore this run:** Unifying ended-route with in-shell review (deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 11. Empty session — no recording CTA (light theme)

**Action:** End a session with **no audio and no whiteboard strokes** (instant end / no capture). Observe hero board column.

**Expect:** **No recording available.** message instead of Replay CTA. No broken empty replay player.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 12. Multi-segment graceful degradation (if available)

**Action:** If a session has `audioSegments.length > 1`, enter in-frame replay.

**Expect:** Non-blocking chip *"Multi-part recording — timing may drift at part boundaries"*. Player does not crash.

**Ignore this run:** Boundary hitch fix (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 13. Both themes — hero + replay + drawer

**Action:** Repeat items 3–4 and 8 with **dark** theme, then **light** (toggle app theme).

**Expect:** Hero and replay chrome readable in both themes. No white flash on stroke paint in dark.

**Ignore this run:** Nothing.

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
