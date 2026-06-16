# Phase 1 — WB Review Correct (in-frame) — smoke runbook

**Branch:** `phase1/wb-review-correct`  
**Tip commit:** [`90f8d8f`](https://github.com/Arangarx/tutoring-notes/commit/90f8d8fd5285363af46e07103762f24bb19e8ef9)  
**Preview:** [tutoring-notes-git-phase1-wb-rev-46b0a1](https://tutoring-notes-git-phase1-wb-rev-46b0a1-arangarx-5209s-projects.vercel.app)

> **Smoke focus = unified in-frame review surface** (one `TutorNotesSection` reflows prominent ↔ docked; replay fills main frame; no lossy transition, no dirty confirm, no "Open full replay"). Standalone admin/share replay scrubber parity remains **DEFERRED** — regression-check only (D-items).

---

### 1. Hero landing — full-viewport notes primary (light theme)

**Action:** Tutor on desktop Chrome: start a whiteboard session → record ~30s with strokes and audio → **End session** (stay in workspace). Observe default view. Confirm **no** admin back-link, page `h1`, or `.container` framing — surface should take the full viewport like the live board.

**Expect:** **Notes-prominent** layout — single `TutorNotesSection` editable (`wb-review-notes-prominent`); confirm slot placeholder (`wb-review-confirm-slot`); board **final-frame** thumbnail (not black) in secondary column; **Replay session** CTA. **No** scrubber in hero. **No** "Open full replay" link. While transcribe+reduce runs, notes form stays visible with inline **Generating notes…** (not blanked). **Start whiteboard session** is under top-bar **More** menu (low prominence), not a competing primary button.

**Ignore this run:** Confirm section content (Phase 2). Notes AI quality. Tutor scratchy audio (B4). Polished blurred-line skeleton (backlogged).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Enter replay — live chrome read-only, notes docked (light theme)

**Action:** From item 1 hero, click **Replay session** (with unsaved note edits if you like). Observe transition — should be **instant** layout reflow, no modal, no dynamic-import flash. Scrubber at 0:00. Press **Play** without touching scrubber.

**Expect:** **Same notes surface** recedes to docked panel (`wb-review-notes-docked`) — still visible and editable; **not** a discoverable drawer toggle. Replay uses **live whiteboard chrome** read-only; canvas **fills** the main frame (no dead-space gap). Consolidated **WbCustomSlider** scrubber (same component family as opacity). Canvas shows **empty or first stroke** — NOT final-board flash. Audio from beginning. **No** unsaved-changes confirm. **No** "Open full replay".

**Ignore this run:** Laser pointer. Live board tab switching (single static tab).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Scrubber true end — in-frame (light theme)

**Action:** Fresh in-frame replay entry. Let play to natural end.

**Expect:** Stops (no loop). Scrubber at 100%. Audio **stops** with scrubber (no orphan audio). Final stroke state. Press **Play** again → restarts from 0.

**Ignore this run:** Multi-segment boundary hitch (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. Scrub drag mid-session — in-frame (light theme)

**Action:** Pause in-frame replay. Drag scrubber to ~50% → release → **Play**.

**Expect:** Audio `currentTime` and scene resume from ~50%. No audio from t=0 after drop. No corrupted audio during drag.

**Ignore this run:** Sub-250ms jitter.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. Docked notes while replay playing (light theme)

**Action:** Enter in-frame replay; press **Play**. Edit notes in the **docked** panel (always visible — no drawer toggle). Type for 10s while replay continues.

**Expect:** Audio **keeps playing**. Docked notes do **not** cover scrubber or play/pause. Notes panel scrolls independently; canvas does not. Edits remain when switching back to prominent notes.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. Prominent↔docked edit survival — single notes instance (light theme)

**Action:** On hero, edit notes without saving. Click **Replay session** (no confirm expected). Edit another field in docked panel. Click **Back to notes**. Re-enter replay.

**Expect:** **No** dirty confirm on hero→replay. **Same text** in prominent and docked modes (one React state). Re-enter replay preserves edits. **Save** persists all via nsi.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Back to notes + replay return — persist-once replay (light theme)

**Action:** While replay playing, click **Back to notes**. Then re-enter replay via **Replay session**.

**Expect:** Returns to prominent notes layout; edits preserved. Re-enter replay: scrubber shows **preserved position (not 0:00)**. No audio leak after back. **No** escape to legacy standalone replay page anywhere on this surface.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. No lossy transition guards (light theme)

**Action:** On hero, edit notes. Click **Replay session** — confirm no modal. Attempt browser tab close / navigate away (optional).

**Expect:** **No** "unsaved changes / continue?" dialog entering replay. **No** `beforeunload` guard (notes auto-save as DRAFT via nsi). Instant client-side prominence switch only.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9. Empty session — no recording CTA (light theme)

**Action:** End a session with **no audio and no whiteboard strokes** (instant end / no capture). Observe hero board column.

**Expect:** **No recording available.** message instead of Replay CTA. Thumbnail shows empty state (not a black frame). No broken empty replay player.

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

### 12. Both themes — prominent + docked + replay

**Action:** Repeat items 1–2 and 5 with **dark** theme, then **light** (toggle app theme).

**Expect:** Prominent notes, docked notes, and replay chrome readable in both themes. No white flash on stroke paint in dark.

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

### 14. Start new session from review More menu (light theme)

**Action:** On notes-hero (item 1 or 13), open top-bar **More** → **Start whiteboard session**.

**Expect:** Consent/start flow opens; minting a fresh session works. Deliberate low-prominence affordance — not competing with review.

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
