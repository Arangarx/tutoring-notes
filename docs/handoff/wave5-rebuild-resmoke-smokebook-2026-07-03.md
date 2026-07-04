# Wave 5 rebuild — corrected-targets re-smoke — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [`37189fe`](https://github.com/Arangarx/tutoring-notes/commit/37189fe)
**Preview (branch alias):** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app) — confirmed READY serving tip `37189fe`.
**Preview (stable domain):** [preview.usemynk.com](https://preview.usemynk.com) — lands logged-in once repointed to this branch.

**Scope:** This is a **per-branch feature re-smoke** of the corrected rebuild after the 2026-07-03 fix-batch re-smoke FAIL — **not** the pre-master comprehensive both-themes gate. **Live A/V reconnect + camera-hotswap are OUT of scope** (parked as BUG-8/BUG-9; reachability branch parked unmerged). All items are tutor-side unless noted; open the **Preview** above for every item.

---

## Feature smoke items

### 1. Replay auto-play from start (in-shell review)

**Action:** On the branch **Preview**, sign in as the pilot tutor. Either (a) run a short live session — Start, record a bit of audio, draw a stroke or two, then End session and wait for review to load — or (b) open an **already-ended** session that has a saved recording (student detail → Sessions list → pick a completed session → open review). On the review surface, locate and click **Replay session** (or equivalent replay entry). Let replay load; note where the scrubber/playhead sits and whether playback advances from there with audio + board paint in sync. **Close** replay (back to review or dismiss the replay shell). **Re-open** replay a second time from the same review page and repeat the observation.

**Expect:** On **both** the first open and the re-open, the scrubber/playhead starts at the **beginning (~0:00), not parked at the end**. Pressing play (or auto-play if it starts on open) advances from the start; audio and whiteboard paint track together through the timeline. No silent stall at end-of-track on open.

**Ignore this run:** Exact millisecond of start position; minor scrubber UI nits unrelated to start position.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: replay start position + re-open behavior — regressed twice; requires real hardware review shell]`

**Notes:**

---

### 2. Notes generation shimmer (post-End)

**Action:** On the **Preview**, sign in as tutor. Start a session on a student with notes generation enabled. Record briefly and draw at least one stroke so there is content to summarize. Click **End session** in the in-session top bar and confirm through the honest End dialog (see item 4). Land on the session **review** surface. During the **generating** window (before notes fields populate), watch the **Tutor Notes** section continuously — do not navigate away. After generation completes, watch the same fields again.

**Expect:** **During** generation, the note **form fields stay VISIBLE** with a shimmer/animated overlay across them and dimmed placeholder text in empty fields — the form must **not** disappear or collapse into bare skeleton bars. **When** generation completes, the shimmer clears and generated content fills the fields (or sensible empty-state if generation produced nothing).

**Ignore this run:** Exact shimmer color, animation speed, or minor timing before first shimmer frame.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: subjective shimmer UX during notes generation — form visibility vs skeleton collapse]`

**Notes:**

---

### 3. Learner / student logged-in top bar size

**Action:** On the **Preview**, sign in as a **learner/student** (student login flow — family handle + learner username/password — not the tutor admin account). Land on the learner's **logged-in** page (home/join landing after login — **not** inside an active whiteboard session). Inspect the **top bar/header on that logged-in student page** (this is **not** the in-session whiteboard top bar; an earlier fix was mis-applied to the in-session bar). Note header height and layout. Open the theme control and run in **light**, then switch to **dark** and repeat the visual check.

**Expect:** The logged-in student page header is a **compact app-chrome band (~57px)**, consistent with the marketing/app header — **not** the previously oversized ~68px bar. Layout is clean in **both** light and dark themes (no clipped controls, no double-height padding).

**Ignore this run:** Sub-pixel height differences; in-session whiteboard top bar (out of scope for this item).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: logged-in learner shell header height — light + dark]`

**Notes:**

---

### 4. In-session "End session" button + honest confirm

**Action:** On the **Preview**, sign in as tutor and open a **live** whiteboard session (Start if needed; student join optional for this item). In the **in-session top bar**, locate the End control and read its label. Click it once. Read the **confirmation dialog** title, body, and both action buttons. Click **Keep going** (dismiss) and confirm you remain in the live session unchanged. Start a **separate** live session (or reuse after dismiss). Click End again and this time confirm with **End session**.

**Expect:** Button label is **"End session"** (not "Finish & save"). Confirm dialog copy is honest — e.g. title **"End this session?"**, body along the lines of **"You'll go to review to save your notes."**, with confirm **"End session"** and dismiss **"Keep going"**. Dismiss returns to the live session with no finalize side effects. Confirm proceeds to finalize → review.

**Ignore this run:** Exact button placement in the top bar; student-side End affordance (tutor-only item).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: End button label + confirm dialog copy on live session]`

**Notes:**

---

### 5. End-and-review from the student-detail roster (SSG-2)

**Action:** On the **Preview**, sign in as tutor. Open a **student detail** page that has at least one **open (not-yet-ended)** session in the sessions list (create one by starting a session and leaving without ending, if needed). On that open session row, verify three actions are offered: **Resume**, **End and review**, **Cancel and delete**. Click **End and review**. After landing, open **Replay session** if available and skim notes state. Return to the student detail page. On another open session (or recreate one), click **Cancel and delete** — confirm the destructive prompt — and verify return to student detail. On a third open session, click **Resume** and confirm the live workspace loads.

**Expect:** **End and review** takes you into the session's **review** with the session ended, its recording **saved/preserved** (replay available), and notes generating or present — it does **not** silently discard the recording. **Cancel and delete** shows a destructive confirm, then removes the session and returns you to the student detail page. **Resume** continues the live session as before.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: SSG-2 gate tests — recordings > 0 anti-orphan]` — `[human-only: roster three-action UX + recording preserved on End and review]`

**Notes:**

---

### 6. End-and-review from the resume gate (reopen stale session directly)

**Action:** On the **Preview**, sign in as tutor. Start a session, record briefly, then **leave without ending** (navigate to student list or close the tab). Re-open the **same session directly** via its workspace URL or wordmark navigation (not via the roster row) so the **resume prompt/gate** appears. Verify the gate offers **Resume**, **End and review**, and **Cancel and delete** — and **not** a bare silent "End session" only. Click **End and review**. Verify review + replay + notes as in item 5. Separately (fresh stale session): exercise **Cancel and delete** (confirm → session gone) and **Resume** (live session continues).

**Expect:** Same outcomes as item 5: **End and review** lands in review with recording preserved (not orphaned), notes generating or present; **Cancel and delete** removes the session after destructive confirm; **Resume** continues live. Gate exposes all three explicit actions.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: resume gate three-action UX + End and review data preservation]`

**Notes:**

---

### 7. SSG-2 data-preservation spot-check (the core value)

**Action:** On the **Preview**, sign in as tutor. Start a session on a student. Click **Start**, then record **clearly audible** audio for ~15–30 seconds and draw several strokes on the board. **Without clicking End**, navigate away (student detail, another route, or close the tab). Return later. From the **roster** (item 5 path) **or** the **resume gate** (item 6 path), choose **End and review**. On review, open **Replay session** and scrub/listen; confirm the board strokes from before you left are present.

**Expect:** The recording and board content you made **before leaving without ending** are **preserved and reviewable** afterward — the previously-lost-recording failure mode is gone. Replay plays your audio; board state matches what you drew.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: pilot-critical orphan-recording regression — exact failure mode that lost the tutor's recording]`

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** `wb-wave5-polish` merges into the integration branch (`v1-redesign`). Use the **integration branch preview** (fetch alias via Vercel MCP — do not guess).

**Integration branch:** `v1-redesign`
**Integration tip commit:** *(fill at merge time)*
**Integration preview:** *(fetch branchAlias at merge time)*

**Merge gate reminder:** Before `merge --no-ff` into `v1-redesign`, run **`npm run test:wb-sync`** on the integrated tip (relay Playwright gate — merge-boundary, not per-commit).

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Wave 5 rebuild regressions — spot-check on integration preview

**Action:** On the integration **Preview** after merge, re-run items **1**, **5**, and **7** from this smokebook at minimum (replay start position, roster End and review, orphan-recording preservation). Optionally spot-check item **2** (notes shimmer) if notes generation is enabled on the integration DB.

**Expect:** No regression vs. this branch's green hardware re-smoke; integration tip behaves the same on the three spot-check flows.

**Ignore this run:** Features not yet merged into `v1-redesign`; Live A/V reconnect + camera-hotswap (BUG-8/BUG-9 — still out of scope).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL
