# Org sales — stage 1 handoff

## Stage status

Stage 1 design is on `feat/org-qol`. Andrew answered the four open questions on 2026-10-11. Those answers are in `docs/handoff/org-learner-design.md`. Stages 2–7 are not started. Stage 2 build starts only when Andrew says go. Stages 3, 5, and 7 are not waiting on an answer. Stage 4 still depends on stage 3. Not merged. No production. No smoke requested.

## Tests run

None. This stage is a design doc. No existing tests changed.

## Review

Sonnet 5-axis [5-axis review org design](99551dae-1717-40a4-81a0-70e1ac5dd099): STOP FOR ANDREW. Folds were inserted without answering the product questions. [Re-review folded org design](0b9caec0-6a8f-4b5f-8774-2a289d4b9af8): FIX THEN RE-REVIEW (stage 4 dependency, statusChangedAt writer, suspension pill marked proposed, End it now separated from the no-browser question). [Verify design fix sentences](7f4503f2-6aba-4bde-9f60-1eab5fbea01d): COMMIT STAGE 1 DOC. Andrew answered the four questions on 2026-10-11. Learner code does not start until he says go.

## Answered 2026-10-11

1. Consent rows are kept after erasure, for an organization row exactly as for a tutor row. Stage 7 also stores a keyed one-way fingerprint of the account email.
2. No new background job. The first server touch after the deadline marks the room ended through the single end-session core.
3. Daily caps are per organization, all staff combined: 20 new learners, 30 claim emails, and 25 staff invites. Tutors keep 20 new students and 30 claim emails.
4. Org learners can be self-learners or child learners. Staff choose "the student" or "their parent."

## Folds applied

- Org learner create requires the invite email, the same existing rule as `createStudent`. Self-learner or child is decided (Andrew 2026-10-11).
- The org-sales finish plan (Andrew-approved, section "From the earlier sequencing plan") says: "Owner and admin can open the learner record they created. They do not open the board, the audio, or the note." "The record they created" is the org role, not a per-creator lock.
- `ConsentRecord` gains an org key. Version aggregate and unique race use (`learnerProfileId`, `organizationId`). Listed readers change. Tutor readers keep `adminUserId: string`. Do not pass `undefined`. Both-null is rejected on `ConsentRecord` only. Partial uniques and CHECKs are hand-written SQL.
- `Student.organizationId` and `OrganizationLearner.organizationId` are `onDelete: Restrict`.
- Env-admin is both ids null. `EmailMessage` uses a second named helper. The calendar callback is exempt. The grep guard is Student-scope only.
- The org name-and-brief row is deleted outright at erasure. Free text on the erased learner's own rows is cleared by ownership. Consent rows are kept. The fingerprint is stage 7.
- All session routes go through `assertOwnsWhiteboardSession`. `openScheduledWhiteboardSession` replaces `assertOwnsStudent` for org rows. The org student layout admits workspace and notes only.
- Read-only after removal applies to ended sessions, with the notes window in § 6.2. The 7 days start at session end, when endedAt is set. Let it finish stays writable until the deadline. `revokeOrgGrantedApprovals` does not cut a live session.
- The deadline hour is the hour containing `storedAt`. The instant is fixed. Clients do not recompute it. Jest covers a half-hour-offset zone and a DST-change day.
- For org-forced ends, `wb-asset` and checkpoint stay open for a named implementation window after `endedAt`. Deadline and removal state ride an existing poll. No new cron.
- Status, membership, and approval re-check, and the pending-to-active `updateMany`, run in one transaction under `lockOrg`. Stage 5 tests Start racing suspension, and idempotent double removal.
- Existing self-learners get a version-1 consent backfill. Five named sites read the record. Stage 3 seeds a pre-migration learner with no record.
- `actorLabel` logs a fixed operator marker, never an email. New `[org]`, `[cns]`, and `[slc]` lines are named.
- Each stage handoff lists tested versus assumed per platform. The org claim page, invite page, and student pill are assumed on iOS Safari until real hardware.
- `setOrganizationStatus` is the only writer of `statusChangedAt` after create. `createOrganization` still sets it at create time. `revokeOrgGrantedApprovals`, `setOrganizationCaps`, and `updatedAt` are not the deadline clock.
- Suspension pill is proposed. Calendar titles use `OrganizationLearner.givenName`. The duplicate-claim sentence is the proposed sentence in the design. Reinvite goes through `mintStudentClaimInvite`. There is no second invite implementation.

## New UI strings

Accepted removal pills:

"This session will end soon because you are no longer part of the organization that set up this tutoring."

"This session will end soon. The organization that set up this tutoring has changed who teaches it."

Proposed, not accepted:

"This session will end soon because the organization that set up this tutoring has had its account suspended."

"No notes will come from this session. Ending it does not give the time back. After the free pilot, that time still counts as time used."

"This student is already set up with this organization. Ask the organization to remove the extra entry."

"After an account is deleted, we keep a record of the consent choices that were made and a one-way fingerprint of the account email, so we can answer questions about consent later. The fingerprint cannot be turned back into the email."

"Consent is recorded in a Mynk account before any session. A parent records it for a child. A self-learner records it for themselves."

The consent sentence is proposed legal copy. Andrew reviews it before it is applied to the privacy and terms pages.

## Answered later the same day

1. The 7 days to finalize notes start at session end, when endedAt is set, not at removal and not at the force-end deadline. Stage 5 tests that the window is endedAt plus 7 days.
2. "No notes" is only a sub-option of ending the session immediately. If the session is allowed to finish on the timer, the tutor can always finalize notes for those 7 days. Removing a live tutor and Mynk suspending the organization use the same three choices. Let it finish: the timer runs, and the tutor may finalize notes, 7 days from session end. End it now, and the tutor may finalize notes, 7 days from session end. End it now, and no notes: read-only for the tutor immediately, and no finalize window. The operator's default when suspending is Let it finish.
3. Privacy and terms must be accurate for both children and self-learners. The consent sentence in the proposed list above is the wording Andrew approved for review. An organization owner, admin, and scheduler can see learners they did not personally teach, and the organization enters the learner.

The reinvite that uses `student.adminUserId!` is `retryStudentClaimInvite` in `src/app/admin/students/actions.ts`. An earlier draft named `students/[id]/actions.ts`. That file does not contain the assertion.

## What a successor must not do

- Reopen the 2026-10-11 decisions.
- Start stage 2 until Andrew says go.
- Merge to master.
- Touch production Neon.
- Seed real people's email addresses.
- Start the 7 days at removal or at the force-end deadline. They start when endedAt is set.
- Leave a live room running when the choice is "no notes." "No notes" ends the session immediately, and there is no finalize window.
- Apply the proposed consent sentence to the privacy and terms pages before Andrew reviews it.
