# Pre-Sarah fix batch + A/V reachability Fix A — consolidated hardware re-smoke

**This smokebook uses TWO separate branch previews.** The reachability fix is on its own isolated branch and is **not** merged into the batch branch. Use the correct preview for each part.

| Part | Branch | Tip commit | Preview |
|------|--------|------------|---------|
| **A — batch fixes** | `wb-wave5-polish` | [`189fdb0`](https://github.com/Arangarx/tutoring-notes/commit/189fdb0991f57bdcbbefe8e82bba3fcf2fc1891b) | [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app) |
| **B — A/V reachability Fix A** | `wb-av-reachability-detection-fix` | [`a962171`](https://github.com/Arangarx/tutoring-notes/commit/a962171) | [wb-av-reachability-detection-fix preview](https://tutoring-notes-git-wb-av-reachab-bde990-arangarx-5209s-projects.vercel.app) |

**Preview 1 — batch (`wb-wave5-polish` @ `189fdb0`):** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app) — the `ef61c91` docs commit on top is docs-only; this preview serves current batch code.

**Preview 2 — reachability Fix A (`wb-av-reachability-detection-fix` @ `a962171`):** [wb-av-reachability-detection-fix preview](https://tutoring-notes-git-wb-av-reachab-bde990-arangarx-5209s-projects.vercel.app) — smoke **Part B on Android only**.

**Convenience domain:** [preview.usemynk.com](https://preview.usemynk.com) works once repointed to a single branch under test. When smoking **both** previews in one pass, use the per-branch aliases above (always-work fallback); repointing the convenience domain to one branch hides the other.

---

**Scope note:** This is a **per-branch feature re-smoke**, not the pre-master comprehensive both-themes gate. The separate FINAL full-arc both-themes smoke still runs before merge to `v1-redesign`. Items **A8**, **A9**, and **A10** require **light + dark** passes; all other items are single-theme.

---

## Part A — batch fixes (use Preview 1: `wb-wave5-polish`)

Open [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app) for every item in this section.

### A1. SMOKE-BUG-1 — student 405 console noise gone

**Action:** On **Preview 1**, start or join a **live whiteboard session as the student** (learner join flow — not the tutor). Open browser DevTools → **Console** and **Network** tabs. Stay in the active session for at least one minute without navigating away. Watch for repeated failed requests to `/active-ping` or auth redirects to `/login`.

**Expect:** **No** repeated `405 Method Not Allowed` responses on `/active-ping` or cascading `/login` GET noise from the student client. The student heartbeat must not fire tutor-only active-ping beacons (fix: `36d4bf3` gates billable-timer heartbeat + `pagehide` beacon to `role==="tutor"`).

**Ignore this run:** Unrelated pre-existing console warnings (CSP font preload, third-party extensions, benign React dev warnings).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A2. SMOKE-NOTES-1 — notes skeleton shimmer during post-End generation

**Action:** On **Preview 1**, as tutor, run a real session with **some audio captured** (speak or play audio for a few seconds). Press **End session**. Immediately watch the **notes section** in the post-End / review surface while notes are still generating (before the final note body appears).

**Expect:** A **skeleton/shimmer placeholder** (`SkeletonNotes`) renders during the generation window — not a blank or empty box. When generation completes, the placeholder resolves to the generated notes content. Fix: `1480592` wires existing shimmer into the post-End notes-generation window (was dead code).

**Ignore this run:** Notes **content quality** (wording, map/reduce accuracy) — only shimmer presence and transition behavior are under test.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A3. SMOKE-BLOCK-2 — note → in-shell replay

**Action:** On **Preview 1**, as tutor, open a **saved SessionNote** for a student that has a whiteboard recording attached. Click **"Watch the whiteboard recording"** (or equivalent link on the note detail).

**Expect:** Navigation lands in the **in-shell workspace review surface** — Board + replay controls inside the unified whiteboard shell — **not** the legacy standalone replay page. Fix: `c24c1a1`.

**Ignore this run:** Replay playback quality or sync timing (separate UX items).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A4. SMOKE-BLOCK-3 — review top bar back-nav (no stranding)

**Action:** On **Preview 1**, as tutor, from a **live session**: press **End** → land in **review mode** → **Save** the notes (complete the save flow). Inspect the **review-mode top bar** after save.

**Expect:** Top bar shows **"← Back to {student}"** that returns to the student detail page. An **all-notes** nav affordance is present and works. Tutor is **never stranded** with no way out after saving. Fix: `22e20e0`.

**Ignore this run:** Exact label punctuation; student-name truncation in narrow viewports.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A5. PRESARAH-2 — open-sessions block copy

**Action:** On **Preview 1**, as tutor, open a **student detail page** that has at least one **open (PENDING or ACTIVE) whiteboard session**. Read the **"Open whiteboard sessions"** block copy and its action buttons.

**Expect:** Wording is **clear and accurate** about what an open session is and what **Continue** vs **End** do. No confusing or stale phrasing. Fix: `682dd67`.

**Ignore this run:** Cosmetic typography nits filed in BACKLOG.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A6. SMOKE-BLOCK-4 — learner sign-out affordance

**Action:** On **Preview 1**, sign in as a **learner** (family login → join flow). Check (1) the **join landing page** shell and (2) the **in-session student top bar** during an active whiteboard session. Confirm a **sign-out control** is visible in **both** places. Click sign-out from each location (two separate checks or one thorough pass).

**Expect:** Sign-out control is **visible** on join shell and in-session student top bar. Clicking signs the learner out via `POST /api/auth/learner/logout` and lands on **`/students/login`**. Fix: `194bb40`.

**Ignore this run:** Tutor/admin sign-out paths (out of scope).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A7. PRESARAH-1 — always-on recording (no per-student toggle)

**Action:** On **Preview 1**, as tutor, inspect **student settings / student detail surfaces** for any **recording-default toggle** or "record by default" control — it should be **gone**. Then **start a whiteboard session** for that student, let recording arm, capture a few seconds of audio, **End** the session, and confirm a recording artifact exists (replay link or note attachment).

**Expect:** **No** per-student recording toggle anywhere in the UI. Recording **always arms** automatically from session activation. End-of-session produces a **recording** (not silently skipped). Fix: `6a8b6dc` removed toggle + `setStudentRecordingDefault`; DB column retained-but-deprecated.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A8. SMOKE-UX-1 — replay auto-plays + "Pause and hide replay" label

**Action:** On **Preview 1**, open a **session replay** (from a saved note or review surface). **Repeat in light, then dark** (use the product theme toggle between passes). On open, observe whether playback starts automatically and read the replay control label.

**Expect:** Replay **auto-starts playing** on open (both themes). The primary control is labeled **"Pause and hide replay"** (not a generic or stale label). Fixes: `a6fa9b5` / `254f2bf`. **PASS only if both light and dark pass.**

**Ignore this run:** Replay sync drift vs live board (not this item's scope).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A9. SMOKE-UX-2 — replay Play/Pause no longer overlaps Board tab

**Action:** On **Preview 1**, open a **session replay**. **Repeat in light, then dark.** Inspect the **footer/control stack** (Play/Pause) relative to the **Board** tab at desktop width and at least one **narrow / phone** viewport (resize browser or use phone). Scroll or interact if needed to expose both controls.

**Expect:** The **Play/Pause** control sits in the **footer stack** and does **not overlap** the Board tab at any viewport tested. Fix: `f0a14d8`. **PASS only if both light and dark pass.**

**Ignore this run:** Other footer chrome nits unrelated to Play/Pause vs Board tab stacking.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A10. SMOKE-UX-4 — wordmark navigation

**Action:** On **Preview 1**, **repeat in light, then dark.** Exercise all three wordmark behaviors:

1. **Non-live shells:** Click the wordmark from **admin (tutor)**, **account (parent)**, **marketing** (logged out), and **student-join** shells. Each should navigate to **`/`** and role-redirect to the correct home (tutor → students list, parent → account dashboard, learner → join, logged-out → marketing).
2. **Live WB session:** **During** an active live whiteboard session, click the wordmark — it must do **nothing** (inert; accidental-recorder-loss guard).
3. **Review / read-only replay:** In review mode or read-only replay, click the wordmark — it navigates to **`/`** (role home).

**Expect:** All three behavior groups match above. Fix: `37cff6b`. **PASS only if both light and dark pass.**

**Ignore this run:** A learner's harmless `/` → `/join` round-trip; operator account landing on `/admin` — both pre-existing role-redirect behavior.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### A11. SMOKE-BUG-6 — "Ended — needs review" group

**Action:** On **Preview 1**, as tutor, **start a whiteboard session** for a student. Press **End** but **do not Save or Delete** — abandon the review (navigate away or close without completing save/delete so `endedAt` is set with no linked note). Go to that **student's detail page**.

**Expect:** The ended session appears under a distinct **"Ended — needs review"** group (last 30 days, cap 20). Clicking a row opens **in-shell review** where you can then Save or Delete. Rows in this group have **no Continue/End buttons**. Fix: `189fdb0`.

**Ignore this run:** A stale-ended session may lack fully-flushed audio (known SSG-2) — under test is **reachability for review**, not audio completeness.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Part B — A/V reachability Fix A (use Preview 2: Android)

Open [wb-av-reachability-detection-fix preview](https://tutoring-notes-git-wb-av-reachab-bde990-arangarx-5209s-projects.vercel.app) on **Android** for this section.

**Out of scope this run:** **Fix B1** (Safari-aggregate ICE predicate) genuinely requires a **Safari / Apple device** and is **not** re-smokeable here.

### B1. SMOKE-BLOCK-1 Fix A — reachability detection no longer under-reports a connected peer

**Action:** On **Preview 2**, on **Android**, run a **tutor + student live session join** reproducing the prior failure mode: tutor **Start button stayed dead** and/or student stuck on **"Connecting…"** after A/V should have connected. Attempt **several joins** (the underlying race is intermittent). Use the same devices/network that previously exhibited the bug if possible.

**Expect:** Once student A/V is **genuinely connected**, the tutor **Start button enables**. The student reaches **Connected** state rather than remaining stuck on "Connecting…". Fix A (`a962171`): `peer-mesh.getPeerConnectionSnapshot` is re-read on entry-ensure so an early stale `"new"` snapshot cannot persist.

**Ignore this run:** Safari-only Fix B1 ICE predicate belt (no Apple device available). Intermittent race means a clean run is **reassuring, not proof** — the deterministic DOM test is the real guard.

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
