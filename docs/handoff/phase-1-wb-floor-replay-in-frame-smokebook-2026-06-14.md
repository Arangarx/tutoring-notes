# Phase 1 — WB Replay In-Frame — smoke runbook

**Branch:** `phase1/wb-replay-in-frame`  
**Tip commit:** [`b412faa`](https://github.com/Arangarx/tutoring-notes/commit/b412faa817882bc76675286945e9d88c25342dbc) (was `030a3c2`; bumped after back-merging `v1-redesign` in — auth/badge/docs only, NO replay-logic change, smoke steps unchanged)  
**Preview:** [phase1/wb-replay-in-frame preview](https://tutoring-notes-git-phase1-wb-rep-7d986c-arangarx-5209s-projects.vercel.app)

> **Smoke focus = the NEW in-frame two-state review surface** (reach it via **End Session → in-shell review** on a session with a recording). The standalone admin/share replay page parity refactor is **DEFERRED this round** — do **NOT** expect its scrubber fixed; only check it for **NO REGRESSION vs before**.

> **Preview deploy:** smoke against the latest **READY** deploy for `phase1/wb-replay-in-frame` @ `b412faa` on the stable branch alias above. Confirm **READY** in the [Vercel deployments list](https://vercel.com/arangarx-5209s-projects/tutoring-notes) before hardware smoke (Vercel MCP auth had lapsed at header-bump time, so the exact `dpl_…` id was not re-fetched; the branch alias is unchanged). Earlier deploys @ `030a3c2` / `40cbcfb` reached **READY** on the same alias.

---

### 1. Hero landing — notes primary (light theme)

**Action:** Tutor on desktop Chrome: start a whiteboard session → record ~30s with strokes and audio → **End session** (stay in workspace in-shell review). Observe default view.

**Expect:** **Notes-hero** layout — `TutorNotesSection` editable; reserved confirm slot placeholder (`wb-review-confirm-slot`); board **final-frame** thumbnail in secondary column; **Replay session** CTA. No full-viewport replay; no scrubber in hero.

**Ignore this run:** Confirm section content (Phase 2). Notes AI quality. Tutor scratchy audio (B4).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Enter replay — true start (light theme)

**Action:** From item 1 hero, click **Replay session**. Observe full-viewport in-frame replay. Scrubber at 0:00. Press **Play** without touching scrubber.

**Expect:** Replay chrome mirrors live WB (top bar, canvas well, bottom scrubber) but read-only — no tool strip. Canvas shows **empty or first stroke** — NOT final-board flash. Audio from beginning. Strokes sync with audio.

**Ignore this run:** Laser pointer. Board tabs (A6-6).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Scrubber true end — in-frame (light theme)

**Action:** Fresh in-frame replay entry. Let play to natural end.

**Expect:** Stops (no loop). Scrubber at 100%. Final stroke state. Press **Play** again → restarts from 0.

**Ignore this run:** Multi-segment boundary hitch (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. Scrub drag mid-session — in-frame (light theme)

**Action:** Pause in-frame replay. Drag scrubber to ~50% → release → **Play**.

**Expect:** Audio and scene resume from ~50%. No corrupted audio during drag.

**Ignore this run:** Sub-250ms jitter.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. Notes drawer while replay playing (light theme)

**Action:** Enter in-frame replay; press **Play**. Open **Notes** drawer. Type in notes fields for 10s while replay continues.

**Expect:** Audio **keeps playing**. Drawer does **not** cover scrubber or play/pause. Drawer body scrolls; canvas does not. Close drawer — replay still at correct position.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. Drawer↔hero edit survival — BLOCKER-1 (light theme)

**Action:** On hero, edit notes without saving. Click **Replay session** — choose **Continue**. Open notes drawer; edit another field. **Back to notes**. Observe hero notes. Re-enter replay; open drawer.

**Expect:** Confirm dialog when dirty on hero→replay. **Continue** preserves edits. Drawer edits visible in hero (**same text**). Drawer shows same edits on re-enter. **Save** persists all via nsi.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Back to notes + replay return — BLOCKER-2 (light theme)

**Action:** While replay playing, click **Back to notes**. Then re-enter replay via **Replay session**.

**Expect:** Returns to hero; notes edits preserved. Re-enter replay: scrubber shows **preserved position (not 0:00)**. No audio leak after back.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. Unsaved notes beforeunload guard (light theme)

**Action:** On hero, edit notes without saving. Attempt to close the browser tab or navigate away from the workspace (do **not** click **Replay session**).

**Expect:** Browser `beforeunload` / unsaved-changes guard fires. Staying on page preserves unsaved edits.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9. Empty session — no recording CTA (light theme)

**Action:** End a session with **no audio and no whiteboard strokes** (instant end / no capture). Observe hero board column.

**Expect:** **No recording available.** message instead of Replay CTA. No broken empty replay player.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 10. No-audio session — synthetic clock (light theme)

**Action:** End a session with **whiteboard strokes but no audio** (mic denied or no capture). Enter in-frame replay via **Replay session**. Press **Play**; scrub to ~50%.

**Expect:** Replay advances on synthetic clock (strokes animate; scrubber moves). No crash. Scene state matches scrub position.

**Ignore this run:** Stroke/audio drift precision on long no-audio sessions.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 11. Multi-segment graceful degradation (if available)

**Action:** If a session has `audioSegments.length > 1`, enter in-frame replay.

**Expect:** Non-blocking chip *"Multi-part recording — timing may drift at part boundaries"*. Player does not crash.

**Ignore this run:** Boundary hitch fix (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 12. Both themes — hero + replay + drawer

**Action:** Repeat items 1–2 and 5 with **dark** theme, then **light** (toggle app theme).

**Expect:** Hero and replay chrome readable in both themes. No white flash on stroke paint in dark.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 13. Ended `/workspace` revisit (regression)

**Action:** After session ended, navigate away then open `/admin/students/<id>/whiteboard/<wbsid>/workspace` directly.

**Expect:** `WorkspacePreviousSessionPreview` still renders (start-new-session flow). **Not** the in-shell two-state review.

**Ignore this run:** Unifying ended-route with in-shell review (deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Deferred path — regression-check only

> Standalone admin (`/admin/students/<id>/whiteboard/<wbsid>`) and share replay still use legacy `WhiteboardReplay` with inline timeline — **scrubber fixes are NOT in scope this round.** Run these only to confirm **no regression** vs pre-branch behavior. **SKIP** scrubber-parity expectations unless you have a pre-branch baseline to compare.

### D1. Standalone admin replay — load, play, scrub (regression)

**Action:** Tutor on desktop Chrome: log in → open `/admin/students/<id>/whiteboard/<wbsid>` (full review page, **not** workspace). Use a session **with audio** and whiteboard strokes. Press **Play** without touching the scrubber. Pause mid-session. Drag scrubber to ~50%, release, press **Play** again.

**Expect:** Page loads without crash. Player still plays (legacy behavior). **Do not fail** on scrubber sync / true-start / true-end — those fixes are in-frame only this round.

**Ignore this run:** Scrubber parity (deferred — use in-frame items 2–4 instead). Page chrome reskin. Tutor scratchy audio (B4).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:** *(Reason if SKIP: deferred scrubber parity — regression-only optional.)*

---

### D2. Standalone admin replay — true end (regression)

**Action:** On the same admin review page as D1, let playback run to natural end.

**Expect:** Page does not crash. Legacy end-of-play behavior unchanged vs pre-branch. **Do not fail** on loop/scrubber-at-100% parity — deferred.

**Ignore this run:** Scrubber true-end parity (deferred). Multi-segment boundary hitch (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:** *(Reason if SKIP: deferred scrubber parity — regression-only optional.)*

---

### D3. Share-link replay page — load (regression)

**Action:** Open a valid share link (`/s/<token>`) for a session with recording. Press **Play** once.

**Expect:** Share replay page loads and plays without crash. **Do not fail** on scrubber parity — deferred same as admin standalone.

**Ignore this run:** Scrubber parity (deferred). Share chrome reskin.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:** *(Reason if SKIP: deferred scrubber parity — regression-only optional.)*

---

## Cross-branch / post-merge

*(Run after merge to `v1-redesign` / `master` — not applicable on feature branch only.)*

---

## Overall result

- [ ] PASS
- [ ] FAIL
