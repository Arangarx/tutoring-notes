# Wave5 fix-batch re-smoke — resolves 2026-07-03 FAIL findings — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f41276738b948a15683f5796e882877981f0a13d) — the `3955980` docs commit on top is docs-only.
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

Branch alias verified via Vercel MCP (short branch name → non-truncated stable alias); serves current batch code.

---

**Scope note:** This is a **per-branch feature re-smoke** re-verifying the items that FAILED / were fixed after Andrew's 2026-07-03 consolidated re-smoke — **not** the pre-master comprehensive both-themes gate. Live A/V reconnect + camera-hotswap are **out of scope** (parked as BUG-8/BUG-9; the reachability branch is parked unmerged). Open [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app) for every item below.

---

## Feature smoke items

### 1. SMOKE-UX-1 — replay auto-play position (fix `3bc7a8e`)

**Action:** On the **Preview**, sign in as the pilot tutor. Open a student with an **ended** session (or end a live session and land in review). In the in-shell review surface, click **"Replay session"**. Observe the replay transport: confirm the playhead starts at position 0 and playback auto-starts. Leave replay (back to the review hero / non-replay view). Click **"Replay session"** again. Repeat the open/leave/open cycle at least once more.

**Expect:** On **every** open, replay **auto-starts from position 0** — playhead at the start of the scrubber, **not** parked at the end — and plays. The second and subsequent opens behave the same as the first (no regression to end-parked scrubber).

**Ignore this run:** Exact first-frame paint timing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

### 2. SMOKE-NOTES-1 — notes shimmer either/or (fix `f412767`)

**Action:** On the **Preview**, as tutor, run and **end** a session so notes generate (capture some audio so generation has a visible window). Watch the **tutor-notes section** continuously: during the generating phase, then after generation completes.

**Expect:** **While generating:** **only** the shimmer/skeleton placeholder is visible — no empty editable fields showing underneath or overlapping the shimmer. **When generation completes:** the editable notes form appears with generated content (shimmer gone).

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

### 3. A5 End → "Finish & save" + confirm (fix `f412767`)

**Action:** On the **Preview**, as tutor, enter a **live** whiteboard session. In the top bar, locate and click the **end-session CTA** (do not confirm yet). Read the button label and the confirm popover copy. Click **"Keep going"** once — confirm the session stays live. Start the end flow again; this time confirm with **"Finish & save"**.

**Expect:** The top-bar CTA reads **"Finish & save"** (not "End session"). Clicking it opens an **inline confirm popover** with: title **"Finish this session?"**; body **"Saves your recording and generates notes."**; confirm button **"Finish & save"**; cancel **"Keep going"**. **"Keep going"** dismisses the popover and leaves the session active. **"Finish & save"** proceeds — saves recording and generates notes (non-destructive; nothing deleted).

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

### 4. SMOKE-BUG-6 — "Review" affordance (fix `f412767`)

**Action:** On the **Preview**, as tutor, open a **student detail page** that has at least one session in the **"Ended — needs review"** group (a session ended without Save/Delete). Inspect each row in that group.

**Expect:** Each row has a clear accent **"Review"** button — matching the **"Continue"** button styling on active sessions — that opens the **in-shell workspace review** for that session.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

### 5. In-session top-bar size (fix `f412767`)

**Action:** On the **Preview**, as tutor, enter a **live** whiteboard session. Inspect the in-session top bar. **Repeat in light, then dark** (use the theme toggle).

**Expect:** The in-session top bar is **compact (~44px tall)** and in line with the app's standard top bar — wordmark, LIVE badge, and timer are appropriately small (not oversized). **PASS only if both light and dark pass.**

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

### 6. Tutor post-end nav (fix `f412767`)

**Action:** On the **Preview**, as tutor, in a live session click **"Finish & save"** and confirm the end flow.

**Expect:** The tutor lands in the **in-shell review** of the just-ended session — **not** a dead-end surface and **not** the old standalone replay page.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

### 7. SMOKE-UX-2 — Play button centering (fix `f412767`)

**Action:** On the **Preview**, as tutor, open **replay** for an ended session (in-shell review → Replay session). Inspect the **Play/Pause** transport button in **both** states (pause if playing; play if paused). **Repeat in light, then dark.**

**Expect:** The **Play** and **Pause** glyphs are **horizontally centered** in the button — Play no longer looks left-shifted relative to Pause. **PASS only if both light and dark pass.**

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

### 8. Empty-notes guard (fix `f412767`)

**Action:** On the **Preview**, as tutor, in the **editable notes form** (post-generation review), clear **all** note fields so every field is empty. Attempt to **Save** (click Save if enabled; if disabled, note that). If any path allows a save attempt with all fields empty, observe the outcome.

**Expect:** **Save is disabled** when all fields are empty. If a save is attempted with everything empty, the UI **bails with a message** like **"Add at least one note field before saving."** — no blank/broken save persists.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL
