# Remaining human tests

Date: 2026-11-11. Branch: `feat/org-qol` @ [`7741b792`](https://github.com/Arangarx/tutoring-notes/commit/7741b792).

Andrew's rule (2026-11-11): Tyson verifies mechanical hardware and human-feel only. Everything else needs a full automated test. He does not re-run a behavior a Playwright or jest test already covers.

Counts: **human-only 3**, **automated 4**, **gaps 6**, **closed 67**.

## Sources

Current docs, read in full:

- [Session joining, organization accounts, and whiteboard quality — Tyson test packet](https://docs.google.com/document/d/1fWbEITzh2gxAifXzGO11jPNpQTYYEr3wtFhe_rieZik/edit) (live packet, modified 2026-10-29). Header inside the doc still says tip `c2e97afb`. Checkboxes and his notes are in this doc.
- [Re-test Oct 28 2026, part 1 of 2](https://docs.google.com/document/d/1DoBCLd24LqQxyTb9Ol3W-69ezvd5BHm1EYCOuWQyd-E/edit) and [part 2 of 2](https://docs.google.com/document/d/1DmkKUjgFmfJI5BjZGQ_RsYAPZwXJR0avms5k1CkAy04/edit). Both are the item list for that round. Every result box is empty and every Notes line is blank. Those empty boxes are not scores. Scored results are the live packet, the new-items doc, and the Discord relay in `docs/handoff/tyson-feedback-2026-10-28.md`.
- [New items to test on the same qol branch — Oct 28 2026](https://docs.google.com/document/d/1LfQ0RIO78839vyXu6oFuhXOI2VI8il5DnOeY-8TLuV8/edit). Items 71, 72, and 73 are PASS.
- [Whiteboard fix smoke test — student drawing no longer disappears — Oct 2026](https://docs.google.com/document/d/1CE2Pf0WbNvfHCiI-oZX9mGeiUFmH10QjmNwNgE0PHoI/edit) (modified 2026-10-29). Items 1–6 and the cross-branch section are unchecked. The connect failure is in the Discord relay, not in those boxes.
- [Still to test — SMS (after approval) and Apple Calendar — Sep 26 2026](https://docs.google.com/document/d/15m0f01aCCzKoiSyYX650aFZTDUzpMrp0lYOarZRvdPw/edit).

Local: `docs/handoff/ORG-QOL-TYSON-TEST-PACKET.md` (repo packet; item 48 there tells him to narrow the window; the Google Doc he ran did not), `docs/handoff/tyson-feedback-2026-10-28.md` (Andrew's relay plus the 2026-10-29 Discord results), `docs/handoff/tyson-retest-2026-10-28.md` (the retest letter; untracked; read only), `docs/handoff/SMOKEBOOK-wb-student-apply-race-hotfix.md`.

The 2026-10-29 Discord relay, after he ran the retest list: most retests are fixed; the three new tests pass; still broken then were 35, 48, and 60. He had not run the apply-race hotfix. He also said the 2026-10-28 list was still outstanding. Later the same day, item 48's wide-desktop button was the designed hidden state, and he found a new menu bug under that item. The hotfix join then failed before any drawing check.

## Still open — Tyson or Andrew must do these (HUMAN-ONLY only)

### H1. Apply-race + TURN hotfix re-smoke (smoke items 1–6)

- **Source:** [student-drawing smoke](https://docs.google.com/document/d/1CE2Pf0WbNvfHCiI-oZX9mGeiUFmH10QjmNwNgE0PHoI/edit), items 1–6. Local copy: `docs/handoff/SMOKEBOOK-wb-student-apply-race-hotfix.md`. Branch on that doc: `fix/wb-student-apply-race` @ `0570a200`.
- **Last result:** unchecked. Blocked before item 1. Discord 2026-10-29, relayed in `docs/handoff/tyson-feedback-2026-10-28.md`: "it doesn't work / the student is just stuck on connecting so i can't actually start the session / i've refreshed a few times and even gone back and clicked the link again, still nothing / student is stuck on connecting, tutor is stuck waiting for student to connect." After preview.usemynk.com was pointed at the hotfix, the tutor waiting room showed the student tile with "Connection failed · Retry", looping every few seconds. The same day, `feat/org-qol` on that preview had connected.
- **His note:** the quotes above. The smoke doc Notes lines are blank because he never reached the drawing steps.
- **Classification:** HUMAN-ONLY. Playwright cannot close a public-preview join that never leaves "Connection failed · Retry" on his phone, and it cannot judge a minute of overlapping finger drawing, phone heat, or battery. The hermetic race tests are already green (`tests/integration/wb-student-apply-race.spec.ts`, T1–T8, including the WebKit student). `tests/integration/wb-av-mesh.spec.ts` › `relay-only peers connect through the server-issued TURN servers` uses the local relay, not his phone on the preview.
- **Next action:** Tyson re-smokes items 1–6 on real hardware after the apply-race + TURN hotfix is on the preview he is told to use. One live session. Cross-branch items on that doc stay blank until the hotfix is on `master` and then on `feat/org-qol`.

### H2. Text-message two-factor (SMS), after approval

- **Source:** [SMS and Apple Calendar](https://docs.google.com/document/d/15m0f01aCCzKoiSyYX650aFZTDUzpMrp0lYOarZRvdPw/edit), item 1. Live-packet items 33 and 44 are PASS for the on-screen checkbox order and do not require a real text.
- **Last result:** unchecked. Blocked until Andrew says the texting campaign is approved.
- **His note:** "Earlier note (Sep 21 packet): Not ready yet."
- **Classification:** HUMAN-ONLY. A real US handset has to receive one setup text and one sign-in text from Mynk, with no link and no phone number in the body, and STOP must not be sent. Carrier filtering is outside the app. Jest and Playwright already cover the checkbox, the mocked body (`src/__tests__/identity/sms-a2p-consent-actions.test.ts` › `startSmsOtpEnrollment with consent sends SMS body containing Mynk and STOP`), and login with a fake code (`tests/integration/identity/tutor-sms-2fa-login.spec.ts` › `happy path: SMS-enrolled tutor login verify lands authed`).
- **Next action:** Tyson, on usemynk.com, only after Andrew texts that the campaign is approved.

### H3. Subscribe the schedule in Apple Calendar

- **Source:** [SMS and Apple Calendar](https://docs.google.com/document/d/15m0f01aCCzKoiSyYX650aFZTDUzpMrp0lYOarZRvdPw/edit), item 2. Live-packet items 15 and 43 are PASS for the title shape and for a calendar app accepting the feed; this item is the Apple app itself.
- **Last result:** unchecked. The doc tells Tyson to mark N/A.
- **His note:** "I don't have an apple device or account." (Tyson, Sep 2026 calendar walkthrough, written under this item.)
- **Classification:** HUMAN-ONLY. Apple Calendar on a Mac or iPhone has to subscribe to the webcal link and show the session after its own refresh. Playwright cannot drive Calendar.app. Feed contents are already tested (`src/__tests__/calendar/ics-summary-first-last-initial.test.ts` › `uses first + last initial in SUMMARY`; `src/__tests__/schedule/tutor-schedule-and-feed.integration.test.ts` › `lists my org appointments with source, the full name, and nothing private`).
- **Next action:** Andrew or Sarah, on usemynk.com, with a Mac or iPhone. Do not paste the feed link into the doc.

## Already covered by automation (do not re-ask a person)

### A1. Item 54 — Book an instructor for an organization learner

- **Source:** live packet, item 54.
- **Last result:** FAIL (checkbox still FAIL; he has not re-scored it).
- **His note:** "The appointment is not listed on the instructor’s schedule for today. And the instructor isn’t even supposed to see the organization tab, so there’s nothing on their page that even says they’re an organization instructor."
- **Classification:** AUTOMATED. `tests/integration/wb-org-booking.spec.ts` › `a scheduler-booked appointment appears on the instructor's Schedule with the organization badge`. Same file: `an instructor sees only their own org appointments`, `the assigned instructor sees their taught session on the organization home, and another instructor does not`, `another instructor's Schedule does not show it`. Andrew's 2026-10-28 decision is that the instructor does get a scoped Organization tab and a badge on Schedule. That is what these tests assert.
- **Next action:** none for Tyson.

### A2. Item 55 — End it now, and no notes

- **Source:** live packet, item 55.
- **Last result:** SKIP, blocked by item 54.
- **His note:** "Because 54 failed, this can’t be tested since the appointment doesn’t show up to start."
- **Classification:** AUTOMATED. `tests/integration/wb-org-removal.spec.ts` › `End it now, and no notes shows the proposed warning and finalize leaves DRAFT`. `tests/integration/wb-consent-matrix.spec.ts` › `N7: org "no notes" session (notesForbidden): nothing is transcribed or drafted`.
- **Next action:** none for Tyson. He does not need a live org session to prove this path.

### A3. Item 60 — Child home, notes, and replay

- **Source:** live packet, item 60. Also Discord 2026-10-29.
- **Last result:** PARTIAL. Still failing against the packet's "button is there after save" expect. Andrew put privacy switches on hold the same week (decision 9 in `docs/handoff/tyson-feedback-2026-10-28.md`).
- **His note:** "I do not see a view whiteboard on the note that is saved." Update: "There is still no view or watch whiteboard button on the student notes. The tutor can see it, but the student can not." Discord: "Test 60 still does not show the view or watch whiteboard for the student, just the tutor."
- **Classification:** AUTOMATED. The missing student control matches recording-off, which is the current child default he was looking at. `tests/integration/wb-child-home.spec.ts` › `learner replay is limited to that child and to sessions that allow whiteboard recording` expects no "Watch the whiteboard recording" link, and a 404 on the replay URL, when `allowWhiteboardRecording` is false. The same file › `shows Watch the whiteboard recording for a saved note with no share link` expects the link when recording is allowed. `tests/integration/parent-child-notes-whiteboard-replay.spec.ts` › `a self-learner who turned whiteboard recording off has no View whiteboard link`.
- **Next action:** Tyson does not re-run item 60. If Andrew's privacy review changes the default, the two child-home tests above are the oracles to update with that decision.

### A4. Organization list rows look like plain text

- **Source:** `docs/handoff/tyson-feedback-2026-10-28.md`, section "Organization UI". Written there, not under a numbered packet item. Screenshot description in that file: page title "Organization", card "Your organizations", row "DeWitt Tootering / active. Your roles: Owner, Admin." with no link styling. He reported the same on the site-admin org list.
- **Last result:** note on 2026-10-28. No Drive checkbox.
- **His note:** the org names in the list don't look clickable.
- **Classification:** AUTOMATED. `tests/integration/wb-org-link-row.spec.ts` › `org list rows are full-width click targets` covers `/admin/organization` (`org-staff-link`) and `/admin/orgs` (the operator list). It expects a link, a list item, a full-width click, and it rejects the plain "active." sentence.
- **Next action:** none for Tyson. The separate "which org am I in after I leave and come back" note is G5 below.

## Automation gaps (we owe a test; person should not be the first net)

### G1. Item 35 — Audio and video tiles

- **Source:** live packet, item 35. Same camera symptom written under item 6, which he marked PASS. Discord 2026-10-29.
- **Last result:** PARTIAL.
- **His note (item 35):** "On reload of the tutor screen, the camera view for the student does not return, just the box." Update: "There is still a problem here. When the student successfully connects the first time they try (and that’s not something that happens all the time) they can see their camera and the tutor’s camera but the tutor can only see their own camera, the student’s camera is just a colored box. When you refresh the student page, sometimes it connects, sometimes it doesn’t and the tutor only sees the colored box. If you reload the tutor’s page, it takes a while to reconnect the student."
- **His note (item 6, same symptom):** "The camera view for the tutor of the student doesn’t show up. This may not have to do specifically with this test case or it might, still trying to figure out what caused it."
- **Discord, under test 35:** "There is still a problem with the camera views from test 35, especially if either the tutor or student refresh their page while in the waiting room."
- **Classification:** GAP. The open failure is a tile that stays a colored placeholder, on first connect and after a waiting-room reload by either person. `tests/integration/wb-av-mesh.spec.ts` already drives fake cameras. These tests do not match that failure: `item 35: Pixel 7 student, waiting-room cameras, student cam off then on, tutor reload keeps the student's video`; `item 35: Pixel 7 student, waiting-room cameras, tutor reload only (no camera toggle) keeps the student's video`; `after the tutor reloads, both peers still see the other's camera playing`; `student reload: tutor's PC with an extra video m-line still shows the tutor's camera on the student` (the other direction).
- **Next action:** add the failing case to `tests/integration/wb-av-mesh.spec.ts`: waiting-room reload by the tutor and by the student, and the tutor's student tile showing video on first connect. Tyson does not re-run item 35 until that test exists. The phone's camera light is a hardware remainder after the tile test is green.

### G2. Item 48 — Session menu stays open after the window goes wide

- **Source:** live packet, item 48. Follow-up in `docs/handoff/tyson-feedback-2026-10-28.md` (Discord 2026-10-29 13:52–13:55).
- **Last result:** PARTIAL in the Drive doc. The wide-desktop "missing button" part was then closed as design. The menu bug is still open.
- **His note (doc):** "I didn’t find a more session options button on device A (my computer) only on device B (my phone)." Update: "Still not on device A."
- **His note (Discord, under item 48):** he ran full screen at 3840×2160 and did not narrow the window. The Google Doc he used has no "narrow the window" step (`docs/handoff/ORG-QOL-TYSON-TEST-PACKET.md` item 48 does). After he narrowed, the button appeared and opened. New bug, same item: "if i have the menu open and expand the window so the button goes away, the menu stays pulled up and won't go away until I shrink it and click the button again."
- **Classification:** GAP. The hidden-on-wide button is already asserted by `tests/integration/wb-org-qol-surface.spec.ts` › `session menu and drawing menu use different icons and a more-below cue` (hidden at 1280px, visible at 1000px). That test never opens the menu at 1000px and resizes to 1280px.
- **Next action:** in that same spec, next to that test: open the session menu at 1000px, resize to 1280px, assert the menu is closed. Tyson does not re-check the wide-desktop button.

### G3. Item 52 — Organization learner missing from the tutor's student list

- **Source:** live packet, item 52 (checkbox PASS, question in Notes). The failure is the relay the same day in `docs/handoff/tyson-feedback-2026-10-28.md`, written as packet item 52. He did not retest 52 on 2026-10-29; he said yesterday's list was still open.
- **Last result:** Drive checkbox PASS. Relayed result PARTIAL.
- **His note (doc, under item 52):** "When an instructor with students already assigned joins an organization, should their current students be automatically added as learners to that organization too?"
- **Relayed under item 52:** "Org scheduler schedules a brand-new student (not in the tutor's list) → the student does not appear in the tutor's student list." Andrew: if it is the same learner the tutor already has, show that learner once, with the appointment flagged as from the organization. Display-only merge; records stay separate. Private students are not auto-added to the org.
- **Classification:** GAP. `tests/integration/wb-org-booking.spec.ts` › `the personal booking picker never lists an org learner` asserts the schedule picker stays free of org-only learners. No test asserts the tutor Students list shows that org learner once, with an organization badge.
- **Next action:** add that Students-list case to `tests/integration/wb-org-booking.spec.ts`, beside `a scheduler-booked appointment appears on the instructor's Schedule with the organization badge`. Tyson does not re-run item 52 to discover this.

### G4. Graph expression delete controls work for the student and not the tutor

- **Source:** `docs/handoff/tyson-feedback-2026-10-28.md`, section "Graph". Not written under item 28. Item 28 in the live packet is PASS, and its update says trig and log now plot. Items 71 and 72 are PASS in the new-items doc.
- **Last result:** note on 2026-10-28. No Drive checkbox. Not in the three retest failures, and not retested as its own item.
- **His note:** "tutor enters an equation in the expressions box + Enter → graphs. The list of expressions beside the box has red X delete buttons. They work for the student but NOT for the tutor."
- **Classification:** GAP. No test mentions deleting a plotted expression. Log and trig plotting is covered by `tests/integration/wb-org-qol-surface.spec.ts` › `plotted log and trig expressions match Math at a sampled x` and › `unreadable expressions show the error state and draw no curve`.
- **Next action:** add a tutor-deletes-expression test to `tests/integration/wb-org-qol-surface.spec.ts`. The student control is the oracle that delete removes that expression on both peers. Calculus functions (derivatives, integrals, and the rest of the college list in that same Graph section) are a backlog request, not this bug.

### G5. Organization tab returns to the org you were in

- **Source:** `docs/handoff/tyson-feedback-2026-10-28.md`, section "Organization UI", same note as A4. Andrew's decision 6: remember the last org per account; a single-org user never sees switcher chrome.
- **Last result:** note on 2026-10-28. No Drive checkbox.
- **His note:** first login lands on the specific org page; after clicking away, Organization lands on the organizations list and the name must be clicked to get back in. He asked which org a multi-org person lands on, and said that coming back should still be that org.
- **Classification:** GAP. `tests/integration/wb-org-link-row.spec.ts` › `org list rows are full-width click targets` opens the index on purpose. Nothing asserts that leaving `/admin/organization/<id>` for Students and opening Organization again returns to that id.
- **Next action:** add that return-to-last-org test to `tests/integration/wb-org-link-row.spec.ts`. Tyson does not walk the tab again as the first check.

### G6. Transcript silence hotfix

- **Source:** `docs/handoff/tyson-feedback-2026-10-28.md`, section "Notes / review". Item 30 in the live packet is PASS (Finish review was present). The bad transcript text was written under item 30, and the full examples were written under Notes / review. Andrew's decision: hotfix off master, then into `feat/org-qol`. Known wait: Andrew smokes that hotfix after the test and the fix, not before.
- **Last result:** note on 2026-10-28. No Drive checkbox. Full example blocks are in that feedback file.
- **His note (item 30):** "The notes were definitely not accurate."
- **His note (Notes / review):** the review screen shows the whole session transcript. Block 1 is what he said, plus junk ("Thanks for watching!", "Silence.", runs of "ä", mixed scripts). Block 2: he was whistling, humming, and clicking; the only real speech was "trigonometric functions work again, finally. The log of x. OK"; the rest is junk ("Thank you for watching!", repeated "Bye").
- **Classification:** GAP. `src/__tests__/transcribe-chunk.test.ts` › `fallback: quality guard trips on primary result → whisper-1 used` treats a primary "Thanks for watching!" as a reason to call whisper-1 and store that second transcript. That is the path that stored the hallucination. It does not assert that silence or a cliché primary is discarded. The review toggle is already covered: `tests/integration/wb-session-review-transcript.spec.ts` › `review transcript is collapsed until Show transcript`.
- **Next action:** add a test in `src/__tests__/transcribe-chunk.test.ts` that a silent or cliché chunk is dropped and whisper-1's invented text is not stored. Andrew's transcript-silence listen waits until that test fails on the old path and passes on the hotfix. He is not the first net.

## Passed and closed in the Drive docs

Live packet checkbox PASS, doc modified 2026-10-29, except where a later update is named. Items 35, 48, 52, 54, 55, and 60 are in the sections above, so they are not in this table. New items 71–73 are PASS in the Oct 28 new-items doc; Discord on 2026-10-29 said all three new tests passed.

| Item | Result | Date |
| --- | --- | --- |
| 1, 2, 3, 8, 9, 12, 14, 15, 17, 18, 19, 20, 21, 22, 24, 26, 27, 29, 31, 32, 33, 34, 36, 37, 40, 41, 43, 44, 45, 46, 50, 51, 53, 56, 57, 59, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70 | PASS, Notes blank | Live packet, as of 2026-10-29 |
| 4 | PASS | 2026-10-29 |
| 5 | PASS | 2026-10-29 |
| 6 | PASS | 2026-10-29 |
| 7 | PASS | 2026-10-29 |
| 10 | PASS | 2026-10-29 |
| 11 | PASS | 2026-10-29 |
| 13 | PASS | 2026-10-29 |
| 16 | PASS, after a failure note | 2026-10-29 |
| 23 | PASS | 2026-10-29 |
| 25 | PASS | 2026-10-29 |
| 28 | PASS, after a failure note | 2026-10-29 |
| 30 | PASS | 2026-10-29 |
| 38 | PASS, after a failure note | 2026-10-29 |
| 39 | PASS, after a failure note | 2026-10-29 |
| 42 | PASS | 2026-10-29 |
| 47 | PASS | 2026-10-29 |
| 49 | PASS | 2026-10-29 |
| 58 | PASS, after a failure note | 2026-10-29 |
| 71, 72, 73 | PASS | New-items doc 2026-10-28; Discord 2026-10-29 |

Notes kept on PASS items (a note stays under the item it was written on; the 2026-10-29 retest did not name these among the three still broken):

- **4.** "The Join opens shortly before the scheduled start sentence appears as a description for the whole section, not next to a future appointment. I’m assuming that’s fine."
- **5.** "The test passes with the expected results, but maybe the message should say why the session is unavailable so they can decide whether or not they want to change the permission?" Andrew later decided disabled Join / Open room / Start show a one-line reason. `tests/integration/wb-org-booking.spec.ts` › `online sessions off: Open room is reachable on the org home and the Schedule, each with the reason under it` is the org-surface test, and it is currently failing 3/3 on `feat/org-qol` (also 3/3 at `3f4e9cb6`, so not caused by C2). Bisect is queued. Do not treat item 5 as proven until that test is green again.
- **6.** Camera note quoted under G1. The join-without-a-key check itself passed.
- **7.** "I’m confused about what this test is trying to look for. I’m not seeing anything they’re talking about." A clarification under the item removed the old "child's own login" sentence.
- **10.** "If you’re an unapproved tutor then you always see the account pending approval message no matter which window you try to go to." That matches the clarified expect.
- **11.** "Looks like you don’t actually need to go into the Account & Sharing section to get the create claim link button. This is just on the student info page." The retest list included 11. He did not name it on 2026-10-29. The Drive note was not cleared.
- **13.** "I don’t see a Display Name card when I look at the child account when logged in as the parent." Same retest situation as 11. The Drive note was not cleared.
- **16.** Screenshot note: save across midnight showed an error. Update: "This has been fixed. It only shows on the starting date on the schedule and calendar, it does not show as an appointment on both dates, but the times are right and the number of minutes is correct."
- **23.** "There are no shortcuts shown when you have the pencil selected, but I also wouldn’t expect there to be since it’s a free writing tool not a shape creating one."
- **25.** "This will only work on a phone or tablet for the student if they have unchecked the ‘Follow tutor view’ option, otherwise they can’t shrink or pan their view."
- **28.** Labels missing, graph larger than the phone, log and trig did not plot. Update: "It does now plot trig and log functions and a button has been added to fit the graph to the student view, which does allow for the student to zoom, pan and add expressions." The tutor-only delete buttons are G4, written under Graph in the feedback file, not under this item.
- **30.** "The notes were definitely not accurate." Finish review passed. The transcript text is G6.
- **38.** "The loading scene spinning wheel stays spinning while the session is being replayed." Update: "The loading circle no longer appears while the video is being played."
- **39.** "Device B stays in the waiting room" (screenshot). Update: "The student is now sent to the same page as if they were in a session and left it."
- **42.** "This is still good. Not sure why it wanted me to retest unless a fix might have changed this."
- **47.** "This again still works, but was retested as requested."
- **49.** "Still passing, retested but nothing has changed."
- **58.** "there is no note that the privacy preferences are not complete, just that the whiteboard session is unavailable." Update: "This has been fixed. There is now a message that tells you why you can’t start a session."

Left blank on purpose, and not counted above: the live packet's cross-branch items and overall result; the drawing-smoke cross-branch items (the doc tells Tyson not to run them); the drawing-smoke overall result. The Oct 28 retest part 1 and part 2 Docs were never filled in.

## Appendix

Not re-opened: `1qNlyOH_eBY-z1PJ7wTep6BAKjp7wTwFljvX_OA4dnpQ`, `1lOFMJZdYuSA38t3CJA2IDonYW8huz96vE2QhQIUfNVE`, `1ONeXM23xymv6-k9LcQBIgoc1eU2bBl8f8UjYTdZdVTs`, `1u7q2vH3r8qGdXVWUmkAljTxwmTmN2J7D081m_rWjr9Y`, `1hg5CSABzAC7GbfYrw3PfLOqa8Aienhtsx5kxegRbF28`.
