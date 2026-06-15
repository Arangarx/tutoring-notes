# Phase 1 — WB Review Correct (in-frame) — smoke runbook

**Branch:** `phase1/wb-review-correct`  
**Tip commit:** [`fb53b2f`](https://github.com/Arangarx/tutoring-notes/commit/fb53b2f)  
**Preview:** <unverified — confirm in Vercel dashboard; MCP unavailable at commit time>

> **Smoke focus = corrected in-frame two-state review** (End Session → notes-hero; replay looks like live WB minus controls). Standalone admin/share replay scrubber parity remains **DEFERRED** — regression-check only (D-items).

---

### 1. Hero landing — full-viewport notes primary (light theme)

**Action:** Tutor on desktop Chrome: start a whiteboard session → record ~30s with strokes and audio → **End session** (stay in workspace). Observe default view. Confirm **no** admin back-link, page `h1`, or `.container` framing — surface should take the full viewport like the live board.

**Expect:** **Notes-hero** full-viewport layout — `TutorNotesSection` editable; confirm slot placeholder (`wb-review-confirm-slot`); board **final-frame** thumbnail in secondary column; **Replay session** CTA; **Start a new whiteboard session** control in the review top bar. No scrubber in hero.

**Ignore this run:** Confirm section content (Phase 2). Notes AI quality. Tutor scratchy audio (B4).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Enter replay — live chrome read-only (light theme)

**Action:** From item 1 hero, click **Replay session**. Observe full-viewport in-frame replay. Scrubber at 0:00. Press **Play** without touching scrubber.

**Expect:** Replay uses **live whiteboard chrome** visually — Mynk wordmark top bar, **disabled** left tool strip, disabled AV cluster, board tab strip, bottom scrubber. Controls are non-interactive except replay/back/notes/drawer. Canvas shows **empty or first stroke** — NOT final-board flash. Audio from beginning.

**Ignore this run:** Laser pointer. Live board tab switching (single static tab).

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

### 13. Ended `/workspace` revisit — notes-hero idempotent (light theme)

**Action:** After session ended (from item 1), navigate away then open `/admin/students/<id>/whiteboard/<wbsid>/workspace` directly. Also hard-refresh while on notes-hero after End Session.

**Expect:** Lands on the **same in-frame notes-hero** (`SessionReviewMode`), full viewport — **not** `WorkspacePreviousSessionPreview`. RSC refresh after End Session does not bounce to the old preview.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 14. Start new session from review top bar (light theme)

**Action:** On notes-hero (item 1 or 13), click **Start a new whiteboard session** in the review top bar.

**Expect:** Consent/start flow opens; minting a fresh session works. Deliberate affordance — not the default post-end view.

**Ignore this run:** Consent-click retirement (Phase 3).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

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
