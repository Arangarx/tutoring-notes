# wb-wave5-polish consent/permissions — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [`52ec9b2`](https://github.com/Arangarx/tutoring-notes/commit/52ec9b2d425e302e00296051762c9a96dae1977c)
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

> Note: Preview URL is the verified stable branchAlias fetched from Vercel MCP. My new commits (52ec9b2 tip) were pushed after the last READY deploy (6dcc987). Vercel should build and serve 52ec9b2 on this alias before smoke time; confirm latest build is READY in [Vercel dashboard](https://vercel.com/arangarx-5209s-projects/tutoring-notes) before running.

---

## ⚠️ Legal-review callout (read before running)

**Concern 1 removed the per-session tutor attestation modal.** Specifically:

- The "I have informed the student…" checkbox + Submit-disabled-until-checked modal is **gone** from the session-start flow.
- The `consentAcknowledged` DB column is **kept** (no migration, no drop). The server now defaults it to `true`; old rows with `false` are never written again.
- **The canonical policy text is entirely unchanged**: `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, Gmail OAuth consent, and `docs/LEGAL-SYNC.md`-governed copy were not touched.
- Recording consent is now covered durably by the parent's `ConsentRecord` + the session-scoped `SessionConsentSnapshot` frozen at session-creation time.

**Andrew: please verify you are comfortable with this change before approving the smoke.** The durable consent model is the enforcement path; the removed modal was a UI-only attestation gate.

---

### 1. Tutor start-session flow — no consent modal

**Action:** Log in as a tutor. Navigate to a claimed student. Click "Start whiteboard session" (the accented button on the student detail page). Observe the transition.

**Expect:** No consent modal appears. Clicking the button directly creates the session (PENDING) and navigates the tutor to the workspace with the waiting overlay. No checkbox, no confirmation dialog between the button and the workspace.

**Ignore this run:** Any minor loading delay or spinner while the session row is created and the redirect fires is fine.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated: `src/__tests__/whiteboard/createWhiteboardSession.test.ts` › "creates session without any consent field — per-session modal removed"]

**Notes:**

---

### 2. Tutor start-session — error handling still works

**Action:** If you can simulate a server error (e.g. temporarily bad network), try clicking "Start whiteboard session" while offline or after an expected server rejection. Alternatively, just confirm the button shows "Starting…" and navigates normally when online.

**Expect:** If an error occurs, an error message appears inline below the button (not in a modal). On success, the button shows "Starting…" while the action runs, then redirects to the workspace.

**Ignore this run:** The exact error copy is not critical; any visible inline error beats a silent failure. If you cannot simulate an error, mark this SKIP with a note.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [human-only — error UI path; automated covers the redirect/redirect-success path]

**Notes:**

---

### 3. Workspace page loads for existing sessions (no consentAcknowledged gate)

**Action:** Open an existing whiteboard session URL directly in the tutor's browser: `/admin/students/[id]/whiteboard/[sessionId]/workspace`. Use any session that was created before this branch (i.e., `consentAcknowledged=true` in DB). Also try navigating to the workspace after creating a new session via the updated start flow.

**Expect:** Workspace loads correctly — no 404, no redirect. The tutor sees the waiting overlay (PENDING) or the active session (ACTIVE) as expected.

**Ignore this run:** Old sessions with `consentAcknowledged=true` work identically to new sessions.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [human-only — page-level gate test; tsc confirms the gate was removed cleanly]

**Notes:**

---

### 4. Consent enforcement is ON — `allowNoteSending=false` blocks note generation

**Action:** In the parent/account-holder portal, set `allowNoteSending=false` for a claimed learner. Have the tutor run a session and end it. Observe the notes-generation result in the workspace review pane (or check Vercel logs for `action=trigger_notes_skip reason=notes_consent_denied`).

**Expect:** Notes are NOT generated when `allowNoteSending=false`. The tutor either sees no notes or an appropriate message. No server error; session closure is unaffected.

**Ignore this run:** Vercel logs are fine as the oracle for this if the UI surface is hard to reach in smoke. If consent setup for the test learner is too involved, mark SKIP with a note.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated: `src/__tests__/whiteboard/triggerNotesGeneration-consent.test.ts` › "allowNoteSending=false → skips enqueueNotesReduce"]

**Notes:**

---

### 5. `allowLiveSession=false` learner is denied at join with clear copy

**Action:** Set `allowLiveSession=false` for a claimed learner's consent record. Have the tutor create a session for that student and issue a join link. Log in as the learner and navigate to `/join/[sessionId]`.

**Expect:** The learner sees a **clear denial page**: heading "Session not available" with copy directing them to ask their parent/guardian to update preferences. The learner does NOT reach the whiteboard. The page is NOT a generic "link unusable" or a 404 — it is a role-aware message.

**Ignore this run:** Exact styling of the denial page is not critical; the message content is. If setting up a test learner with `allowLiveSession=false` is too involved, mark SKIP with a note.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated (Playwright, relay required): `tests/integration/wb-session-lifecycle.spec.ts` › "learner with allowLiveSession=false sees denial page on /join/[sessionId]" (@wb-presence)]

**Notes:**

---

### 6. PENDING-phase active ping does not stamp billable time

**Action:** Create a new session (leaves it in PENDING phase — tutor has NOT pressed Start). Check Vercel logs or verify via the workspace UI that the active-timer is **not incrementing** while the session is pending.

**Expect:** The active-time display in the workspace overlay shows 0:00 and does not count up until the tutor presses Start. No `bothConnectedAt` timestamp appears in the session row until after Start.

**Ignore this run:** Network latency in ping delivery is fine. A brief 0:01 flicker before the guard fires is acceptable. If you cannot observe timer behavior during PENDING, mark PARTIAL or SKIP with a note.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [human-only — timer behavior visible in workspace UI; automated guards the route return without stamping when PENDING]

**Notes:**

---

### 7. Recording does not start or register audio during PENDING

**Action:** Enable the mic on the workspace overlay while the session is still PENDING. Observe whether any audio is recorded or audio segments are registered. Then press Start — verify recording begins normally after Start.

**Expect:** No `SessionRecording` rows are created while PENDING. After Start (ACTIVE), recording works normally. The workspace correctly shows "waiting" state until Start.

**Ignore this run:** Pre-session mic level meter (the waveform in the waiting overlay) is still expected to animate — that uses the live audio stream but does NOT create recordings. Only segment registration is gated.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated: `src/__tests__/whiteboard/session-phase-guards.test.ts` › "PENDING session → returns ok=false without creating a row" (registerWhiteboardSessionAudioSegmentAction)]

**Notes:**

---

### 8. Consent enforcement active — `generateNotesFromWhiteboardSession` (legacy path)

**Action:** On the session review page, use the "Generate notes" button for a session whose student has `allowNoteSending=false`. Alternatively, verify the log line `result=denied` appears in Vercel logs.

**Expect:** Notes generation is blocked — the action returns an error or the UI shows a graceful denial. No OpenAI call is made.

**Ignore this run:** `generateNotesFromWhiteboardSessionAction` already had this gate before this branch; this item confirms the gate still works (regression). If you cannot set up the consent scenario, mark SKIP.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** [automated (integration, consent-b2.test.ts): `assertEffectiveConsent` denies permission; functional path verified in unit mock]

**Notes:**

---

## Overall result

- [ ] PASS
- [ ] FAIL
