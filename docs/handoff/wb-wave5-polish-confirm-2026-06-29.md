# wb-wave5-polish — combined confirm (waiting-polish quick-wins + join-timer fixes + liveboard-chrome chrome parity, integrated) — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** `[f649c62](https://github.com/Arangarx/tutoring-notes/commit/f649c62)`
**Preview:** [wb-wave5-polish combined preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

This wave integrates the quick-wins (A/V remote initials, mic meter, camera control style, waiting-room picker dedup, login convergence) plus newly-fixed join-timer bugs and the liveboard student-chrome parity + tutor mic-meter fix. Most behavior is Playwright-covered (jest 735/735, Playwright 105 passed / 0 failed on the integrated tip); this confirm targets the HUMAN/HARDWARE items Andrew specifically reported. **Confirm the preview deployment is READY (not BUILDING) before starting.**

---

### 1. Adult self-learner stale-cookie join (the key fix)

**Action:** In a browser that previously typed a **wrong child PIN** on a session link (leaving a stale `mynk_learner_session` cookie), open the **adult self-learner** session link on the branch **Preview** URL. Sign in as the account holder.

**Expect:** You land in and **stay** in the waiting room — **no** brief "This link isn't usable anymore" flash. (Previously: waiting room flashed then died to `link_invalid`.)

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated: tests/integration/wb-session-lifecycle.spec.ts › adult self-learner stale non-participant child cookie + AH auth → join-timer poll stays LIVE] — **human item:** real stale cookie + real account-holder login flow; run and mark PASS/FAIL here.

**Notes:**

---

### 2. Tutor ends session → authed student sees friendly copy

**Action:** With an **authed student** in the session (in the room or waiting room), have the **tutor END** the session.

**Expect:** The student sees **"Session has ended"** (friendly), **not** "This link isn't usable anymore."

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated: tests/integration/wb-session-lifecycle.spec.ts › tutor ends session → authed student sees 'Session has ended' (not link_invalid)] — mostly automated; quick human confirm.

**Notes:**

---

### 3. verify-email on the CURRENT deploy

**Action:** Create a **new self-learner signup** on **this preview deploy** (do **not** reuse a verification link minted on an older deploy; do **not** host-swap an old email link). Click the verification link from the email.

**Expect:** You are verified and signed in (lands on dashboard via verify-done). If an email scanner pre-consumed the link, the human click should still verify-and-continue (idempotent replay), and any "already verified" message reads the softened **"Your email is already verified — sign in below."**

**Ignore this run:** If your email provider's link scanner is not in play, the idempotent-replay path may not trigger — that's fine.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**Pass, but.  Shouldn't there be a "successfully verified" style copy instead of no copy at all?**

---

### 4. Liveboard tutor mic-meter still animates (regression guard after merge)

**Action:** Start a session as **tutor**; speak.

**Expect:** The tutor live top-bar mic meter animates (**3 bars**).

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Andrew already confirmed this on the liveboard branch (`afb3abf`). [automated: src/**tests**/dom/WhiteboardWorkspaceClient.av-mount.dom.test.tsx asserts single meterBarRef host] — mark **N/A with notes** (covered by Playwright + already confirmed) unless you want a quick re-glance.

**Notes:**

---

### 5. Whiteboard chrome sanity (dual-toolbar fix)

**Action:** On **desktop**, open the **shapes flyout** and the **left-rail more (3-dot) menu**.

**Expect:** Each opens exactly once — no duplicate/ghost flyout; single-open behavior (opening one closes the other) works.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated: tests/integration/wb-chrome-interactions.spec.ts › shapes flyout / more menu / single-open] — fixed a pre-existing duplicate-portal bug; mark **N/A with notes** (covered by gate) unless you want a quick human glance.

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [x] PASS
- [ ] FAIL

---

## Addendum (2026-06-29, tip 2cabd94): tutor waiting-room mic parity

Post-confirm fix at tip `2cabd94` — confirm the rebuilt preview is **READY** (not BUILDING) before running.

### 6. Tutor waiting-room mic parity (activity-bar button + inline meter)

**Action:** Start a session as **TUTOR**. In the **WAITING ROOM** (before Start Session), look at the mic control; acquire/unmute mic and speak.

**Expect:** The tutor waiting-room mic is the **SAME** activity-bar button + dropdown as the student's (NOT an old checkbox/chip), and its inline meter animates while you speak. (Regression being guarded: chip-style revert from f6ca6b6.)

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated: tests/integration/wb-session-lifecycle.spec.ts › bilateral parity (student+tutor overlay mic toggle + meter)] + [automated: src/**tests**/dom/WhiteboardWorkspaceClient.av-mount.dom.test.tsx › single meterBarRef host]

**Notes: You didn't bring back the drop down on the mic control.  That was only supposed to be gone for the student.**

---

- [ ] Addendum PASS
- [x] Addendum FAIL

---

## Addendum 2 (2026-06-29, tip d0cd1b9): tutor mic dropdown re-confirm

Corrects the item-6 FAIL — confirm the d0cd1b9 preview is **READY** before running.

### 7. Tutor waiting-room mic — in-dropdown device picker restored (re-confirm of item 6)

**Action:** Start a session as **TUTOR**. In the **WAITING ROOM**, open the mic control's dropdown (the caret next to the activity-bar mic button); acquire/unmute mic and speak.

**Expect:** Tutor mic is the activity-bar button + inline animating meter (parity with student) **AND** its dropdown contains the mic **DEVICE PICKER**. Student waiting-room mic still has **NO** dropdown picker (its picker stays on-page). Tutor has no duplicate on-page mic picker.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated: tests/integration/wb-session-lifecycle.spec.ts › bilateral parity (student no dropdown picker, tutor has dropdown picker)] + [automated: src/__tests__/dom/WhiteboardWorkspaceClient.av-mount.dom.test.tsx › tutor caret present, no on-page audio-device-select, single meterBarRef host]

**Notes:**

---

- [ ] Addendum 2 PASS
- [ ] Addendum 2 FAIL