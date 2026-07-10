# Consent-honesty pre-merge smoke — findings triage

**Branch:** `wb-wave5-polish`
**Tip commit:** [`8e38935`](https://github.com/Arangarx/tutoring-notes/commit/8e38935)
**Smoke date:** 2026-07-01
**Preview:** Smoke ran against the live branch preview at tip `8e38935` (includes all session fixes through that commit).

**Source smokebooks (annotated):**

- [`consent-honesty-premerge-smoke-index.md`](consent-honesty-premerge-smoke-index.md)
- [`wb-block-b-consent-gate-smokebook-2026-06-30.md`](wb-block-b-consent-gate-smokebook-2026-06-30.md)
- [`cc1-cc2-consent-gate-smokebook.md`](cc1-cc2-consent-gate-smokebook.md)
- [`erasure-smokebook.md`](erasure-smokebook.md)

**Merge verdict:** **NOT PASS** — merge blocked until merge-blocking items are fixed or explicitly accepted.

---

## A. MERGE-BLOCKING (must fix or explicitly accept before merge)

> **Investigation note:** MB-1, MB-6, MB-2, and MB-3 may share a root cause in impersonation / multi-tab session state — under investigation.

### MB-1 — Start Session regression (Block B #1)

| Field | Value |
|---|---|
| **Source** | Block B #1 — Consented LIVE session |
| **Andrew's note (verbatim)** | Regression: Start Session is not starting again. This seems to happen the first time in every new branch, but it is consistently happening again, we have to figure this one out, people will nope out when shit doesn't work like a fucking start button. How the hell can a start button be so fickle?? Harden the hell out of that, make it so it CAN'T not work. Is there any possibility, that it happens when in a separate window I've exited impersonation in order to check something as my admin level, which is invalidating the other tab's ability to start because I'm the wrong account now or something? Actually I think that may be exactly it. I start a lot of this testing with impersonation and I leave the impersonation in another tab to give my wife creds. |
| **Classification** | **MERGE-BLOCKING** — intermittent Start failure on consented LIVE sessions; recurring "first time in every new branch"; must harden so Start **cannot** fail silently. |

### MB-2 — Full-family erasure ineffective (erasure #5)

| Field | Value |
|---|---|
| **Source** | Erasure #5 — Trigger full-family erasure |
| **Andrew's note (verbatim)** | Is any uuid in the family supposed to work or specifically the parent's uuid? If the parent is not a learner...where do I get a uuid from? What even IS the family display name? The last name? the family id that children have with child@family? I tried bobsley (the name after @) it errored with "Account holder not found". I tried Bob Bobsley, "Account holder not found" Finally just used DELETE. Failure: Full family erasure using uuid of parent self learner id, shows in erasure jobs, but my wife was able to continue operations on the family page and also log out AND log back in as the parent. |
| **Classification** | **MERGE-BLOCKING** — full-family erasure job created but account holder not actually tombstoned / locked out; identifier UX confused operator (family display name unclear; only `DELETE` worked). |

### MB-3 — Per-learner tombstone not reflected; new sessions not blocked (erasure #4 PARTIAL + #10 FAIL)

| Field | Value |
|---|---|
| **Source** | Erasure #4 (PASS+PARTIAL) + Erasure #10 (FAIL) |
| **Andrew's note — #4 (verbatim)** | Possible failure: I'm not sure where I'm looking for the redacted placeholder. Tutor page still shows the student "Delete Test2" and I can even start a whiteboard session??? And it still shows connected to Bob Bobsley the parent...if we delete the learner, should it not disconnect the student? |
| **Andrew's note — #10 (verbatim)** | I didn't actually test this but, I made notes above about some weirdness after deleting a learner. I could still see the student's name, not redaction, and I could start a whiteboard session. |
| **Classification** | **MERGE-BLOCKING (nuanced)** — grace-window **read-access** to existing content is ratified/expected, BUT: (a) display-name redaction should be **immediate** on tutor surfaces, and (b) starting **new** sessions for a tombstoned learner likely should be **blocked**. Disentangle expected-vs-bug before merge. |

### MB-4 — IN_PERSON: no replay despite strokes (Block B #2)

| Field | Value |
|---|---|
| **Source** | Block B #2 — IN_PERSON + audio denied |
| **Andrew's note (verbatim)** | Failure: Cannot replay even though there were strokes. |
| **Classification** | **MERGE-BLOCKING** — in-person session with strokes should offer replay (stroke-only); no replay surfaced. |

### MB-5 — tutor_only: no notes generated at all (Block B #3)

| Field | Value |
|---|---|
| **Source** | Block B #3 — LIVE + student audio denied (`tutor_only`) |
| **Andrew's note (verbatim)** | Possible Failure: I don't see any notes AT ALL. Not even gobbledegook from our conversation. |
| **Classification** | **MERGE-BLOCKING** — contrast with Block B #1 (full consent) where notes **did** generate; tutor_only path may be dropping transcription/notes entirely. |

### MB-6 — SECURITY: student landed on parent's page (Block B #2)

| Field | Value |
|---|---|
| **Source** | Block B #2 — IN_PERSON + audio denied |
| **Andrew's note (verbatim)** | Possible security issue: Student navigated from ended session to base site and landed on PARENT'S page. |
| **Classification** | **MERGE-BLOCKING (security)** — student post-session navigation must not land on parent/account-holder surfaces. |

---

## B. BUGS (real, likely non-blocking — confirm)

### B-1 — Student microphone setting not remembered

| Field | Value |
|---|---|
| **Source** | Block B #1 (appears twice in notes) |
| **Andrew's note (verbatim)** | Student microphone is still not being remembered. |
| **Classification** | **BUG (likely non-blocking)** — recurring device-persistence gap; cross-ref existing WB-P1SMOKE-3 family but student-specific mic called out again here. |

### B-2 — Interstitial never appears when parent is logged in

| Field | Value |
|---|---|
| **Source** | Block B #5 — Consent UI |
| **Andrew's note (verbatim)** | Side Note: Why do we NEVER get the interstitial anymore even when the parent is logged in? |
| **Classification** | **BUG (possible regression)** — parent-logged-in interstitial path may have regressed; confirm intended behavior vs bug. |

### B-3 — "Save preferences" weak/no click feedback on privacy manage page

| Field | Value |
|---|---|
| **Source** | Block B #1 side note |
| **Andrew's note (verbatim)** | On that note, save preferences on the privacy manage page gives no click feedback. |
| **Classification** | **BUG (verify post-fix)** — smoke ran POST the `d7be4b3` fix; confirm whether feedback is still inadequate vs test was pre-build. |

---

## C. UX / POST-SARAH-PRE-RELEASE (backlog)

### C-1 — Play/Pause overlaps Board tab on replay screen

| Field | Value |
|---|---|
| **Source** | Block B (screenshot referenced in smoke session) |
| **Andrew's tag** | **POST SARAH PRE RELEASE** |
| **Classification** | **UX backlog** — replay chrome layout: Play/Pause control overlaps Board tab. |

### C-2 — Student should have mic-boost controls like tutor

| Field | Value |
|---|---|
| **Source** | Block B #1 |
| **Andrew's note (verbatim)** | Post Sarah Pre Release: Student should have mic boost controls just like the tutor. |
| **Andrew's tag** | **POST SARAH PRE RELEASE** |
| **Classification** | **UX backlog** — parity: student-side mic boost/gain controls. |

### C-3 — Settings pages should save-on-toggle

| Field | Value |
|---|---|
| **Source** | Block B #1 side note |
| **Andrew's note (verbatim)** | I don't know if this is a principle for ALL settings pages but less and less pages require you to click "save" when you're done. I feel like, on the manage privacy page as an example, that the values should be saved the second the toggle is clicked. They shouldn't have to go find "Save preferences". This should probably be true of anything that doesn't require an "are you sure?" type gate, I imagine. |
| **Classification** | **UX backlog** — save-on-toggle pattern for non-gated settings. |

### C-4 — "Follow tutor view" vs "Match tutor's view" copy + disable logic

| Field | Value |
|---|---|
| **Source** | Block B #1 side note |
| **Andrew's note (verbatim)** | My wife asked what the difference was between "Follow tutor view" and "Match tutor's view". I think we may need better copy or something on "Match tutor's view" to indicate it's a one time action. Also, "Match tutor's view" should be disabled when "Follow tutor view" (maybe should be "tutor's"?) is toggled on. |
| **Classification** | **UX backlog** — clarify one-time vs continuous actions; mutual-exclusion when follow is on. |

### C-5 — "Save to notes" should navigate away

| Field | Value |
|---|---|
| **Source** | Block B #1 |
| **Andrew's note (verbatim)** | Save to notes should navigate away shouldn't it, maybe to the student's detail page? It gives me a notification, but...what do I do now as a tutor? |
| **Classification** | **UX backlog** — post-save navigation affordance (student detail page?). |

### C-6 — Light-mode discoverability: checkboxes + off-state toggles too light

| Field | Value |
|---|---|
| **Source** | Block B #2 side note |
| **Andrew's note (verbatim)** | In light mode, checkboxes are not very visible on the "Always off" section's checkboxes. Toggles while off in light mode might need a slight discoverability boost (they're very light right now, visible, but light) |
| **Classification** | **UX backlog** — light-theme contrast on consent "Always off" checkboxes and off-state toggles. |

### C-7 — Session-notes page should explain why no auto-notes

| Field | Value |
|---|---|
| **Source** | Block B #2 |
| **Andrew's note (verbatim)** | I think we need to make sure that the session notes page explicitly reminds the tutor why there are no auto generated notes, otherwise they might assume product failure. The copy in the whiteboard (if it doesn't already) should tell the tutor, that there will be no notes generated after the session and the session notes page should remind them. |
| **Classification** | **UX backlog** — in-person / no-audio-consent paths need explicit "why no notes" copy on WB + session-notes surfaces. |

### C-8 — Navigation confusion: child manage / self-learner / account pages

| Field | Value |
|---|---|
| **Source** | Erasure #5 |
| **Andrew's note (verbatim)** | Child manage page needs clearer navigation back to parent dashboard. Wife was getting confused by self learner leaner page vs account page. Page maybe needs condense a little or better nav in general...she got lost twice in a row. After creating another learner to test family deletion she already forgot how to get back. |
| **Classification** | **UX backlog** — parent-facing nav clarity between child manage, self-learner learner page, and account dashboard. |

### C-9 — Claim page dead-end when login already configured

| Field | Value |
|---|---|
| **Source** | Erasure #4 side note |
| **Andrew's note (verbatim)** | When learner is already configured, claim page where parent chooses privacy and child credentials, they have no way to navigate away. It says login is already configured...etc but no links or navigation. |
| **Classification** | **UX backlog** — claim setup needs escape links when credentials already configured. |

### C-10 — Disable "Copy student link" when In-Person + single student

| Field | Value |
|---|---|
| **Source** | Block B #2 side note |
| **Andrew's note (verbatim)** | If there is only one student then copy student link should probably be disabled when in person mode is on. |
| **Classification** | **UX backlog** — in-person mode should disable irrelevant student join-link affordance. |

---

## D. DESIGN QUESTIONS (need Andrew decision — capture, do not answer)

### DQ-1 — Grace-period ACCOUNT recovery

| Field | Value |
|---|---|
| **Source** | Erasure #2 |
| **Andrew's note (verbatim)** | I know I approved immediate tombstone and no recovery to start...but...why don't we allow the account to come back within the grace period? What's the point of the grace period for data but not the account, so the tutor can keep access but the account is still gone? |
| **Classification** | **DESIGN QUESTION** — reconcile grace-period data recovery vs immediate account tombstone. |

### DQ-2 — "Request erasure" should require 2FA step-up

| Field | Value |
|---|---|
| **Source** | Erasure #2 |
| **Andrew's note (verbatim)** | "Request erasure" should be a step up operation that requires 2fa again. |
| **Classification** | **DESIGN QUESTION** — should admin erasure trigger require TOTP step-up? |

### DQ-3 — Parent-facing deletion-right copy (non-technical tombstone/grace)

| Field | Value |
|---|---|
| **Source** | Erasure #2 |
| **Andrew's note (verbatim)** | Obviously, our copy that notifies parents of their right to delete should notify them of the tombstone/grace period. We need to make sure the copy makes sense to non technical users, e.g. we probably can't just say blob, a lot of people won't have a clue what that means. We might even have to clarify in the operator copy. Now that I think about it, future operators might not know what a blob is either. |
| **Classification** | **DESIGN QUESTION** — parent + operator copy must explain tombstone/grace without jargon ("blob"). |

### DQ-4 — Account lookup UX for erasure targeting

| Field | Value |
|---|---|
| **Source** | Erasure #2, #5 |
| **Andrew's note (verbatim)** | Learner profile ID...is going to be kind of a pain to get, We'll need better ways to find the acounts later. / What even IS the family display name? |
| **Classification** | **DESIGN QUESTION** — real find-the-account UX; clarify full-family identifier semantics. |

### DQ-5 — Multi-student live sessions: who is live, permission stacking

| Field | Value |
|---|---|
| **Source** | Block B #2 side note |
| **Andrew's note (verbatim)** | We are going to have to have the tutor at some point mark WHO is live, (1) so we can stack permissions and be as permissible as the least permissive permissions among the live students and (2) if that student joins the session after, then should consent switch to their screen? This can get really weird with mixes. Backlog for discussion. |
| **Classification** | **DESIGN QUESTION** — multi-student live consent model; least-permissive stacking; mid-session join consent switching. |

### DQ-6 — Live consent-satisfied notification on tutor student page

| Field | Value |
|---|---|
| **Source** | Block B #1 future enhancement |
| **Andrew's note (verbatim)** | Future enhancement: ajax /admin/students "Before you can start a session, the student's parent..." notification to change as soon as the parent toggles it. |
| **Classification** | **DESIGN QUESTION** — real-time tutor callout update when parent changes consent (ajax/push). |

---

## E. PLAYWRIGHT COVERAGE GAP (Andrew's core process complaint)

Andrew skipped CC-1/CC-2 entirely (all 10 items N/A+SKIP) and several erasure items, repeatedly arguing these surfaces are **totally Playwright-testable** and should not require manual hardware smoke.

### Verbatim complaints

| Source | Andrew's note (verbatim) |
|---|---|
| CC-1 #1 | I'm skipping all these consent-record ones. Frankly...shouldn't playwright tests be able to smoke ALL of this???? Why am I being asked to smoke this kind of thing? |
| Erasure #1 | I feel the need to point out once again, just like the consentRecord smokebook... Why in the world am I smoking this stuff? This is totally playwright testable things. |
| Erasure #7 | Yes the copy shows up...those other things you want me to do sound like something you could playwright so I'm skipping that. |
| Erasure #11 | This is definitely playwright/database manipulation testing stuff. |

### Items that should become Playwright e2e (reduce future manual smoke)

**CC-1/CC-2 (all 10 items — Andrew skipped entire book):**

1. No ConsentRecord blocks session create
2. Unclaimed learner blocks session create
3. ConsentRecord exists → session create proceeds
4. startWhiteboardSession backstop (legacy PENDING, no record)
5. Mandatory consent choice at claim setup
6. Decline path writes all-off ConsentRecord
7. Self-learner exempt from mandatory consent
8. Re-submit already-saved consent → 409
9. All-off record satisfies CC-1; join gate blocks live entry
10. Theme parity — claim setup + parent consent editor

**Erasure (admin/automation-testable):**

1. Admin gate — non-admin 404 (`/admin/erasure`)
7. Cancel during `requested` — halts purge; cancel absent after
8. Worker/cron — `erasure:resume` advances past-grace job
9. Post-purge content 404 — replay + APIs
11. `[Deleted learner]` placeholder in student lists
12. `blob-cleanup.mjs` chunk-blob reference set (dry-run/code-confirm)

### Future manual smoke should narrow to genuinely hardware-only

- Real audio mixdown isolation (student absent from recording, heard live)
- Multi-device live A/V (WebRTC, device picker, ICE)
- Real transcription / notes quality judgment
- Theme parity on physical devices when subjective contrast matters
- Security flows requiring two real browsers / roles simultaneously

---

## F. SMOKE SCORECARD

**Overall:** **NOT PASS** — merge blocked.

### Block B (`wb-block-b-consent-gate-smokebook-2026-06-30.md`)

| Item | Title | State |
|---|---|---|
| 1 | Consented LIVE session | PARTIAL |
| 2 | IN_PERSON + audio denied | FAIL |
| 3 | LIVE + tutor_only | PARTIAL |
| 4 | No consent snapshot / no record | N/A with notes + SKIP |
| 5 | Consent UI — dead WB toggle hidden | PASS |
| 6 | Theme parity | PASS |

### CC-1/CC-2 (`cc1-cc2-consent-gate-smokebook.md`)

| Item | Title | State |
|---|---|---|
| 1 | No ConsentRecord blocks create | N/A with notes + SKIP |
| 2 | Unclaimed learner blocks create | N/A with notes + SKIP |
| 3 | ConsentRecord exists → create | N/A with notes + SKIP |
| 4 | startWhiteboardSession backstop | N/A with notes + SKIP |
| 5 | Mandatory consent choice at claim | N/A with notes + SKIP |
| 6 | Decline writes all-off record | N/A with notes + SKIP |
| 7 | Self-learner exempt | N/A with notes + SKIP |
| 8 | Re-submit → 409 | N/A with notes + SKIP |
| 9 | All-off record + join denied | N/A with notes + SKIP |
| 10 | Theme parity | N/A with notes + SKIP |

### Erasure (`erasure-smokebook.md`)

| Item | Title | State |
|---|---|---|
| 1 | Admin gate 404 | PASS |
| 2 | Confirmation phrase enforced | PASS |
| 3 | Irreversible-warning copy | PASS |
| 4 | Immediate tombstone | PASS + PARTIAL |
| 5 | Full-family erasure | FAIL |
| 6 | Jobs table grace countdown | PASS |
| 7 | Cancel during requested | PARTIAL + N/A with notes + SKIP |
| 8 | Worker/cron processing | N/A with notes + SKIP |
| 9 | Post-purge content 404 | N/A with notes + SKIP |
| 10 | Grace-window read-access | FAIL |
| 11 | Deleted learner placeholder | N/A with notes + SKIP |
| 12 | blob-cleanup chunk refs | N/A with notes + SKIP |
