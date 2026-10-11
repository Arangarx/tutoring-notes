# Org sales — stage 1 handoff

## Stage status

Stage 1 design rewritten on `feat/org-qol`. Stages 2–7 not started. Not merged. No production. No smoke requested.

The conductor stopped the build because the review returned product calls. Stage 2 (staff UI) does not need the caps answer, the periodic-close answer, or the consent-row answer. This task did not start stage 2.

## Tests run

None. This stage is a design doc. No existing tests changed.

## Review

Sonnet 5-axis [5-axis review org design](99551dae-1717-40a4-81a0-70e1ac5dd099): STOP FOR ANDREW. Folds were inserted without answering the product questions. [Re-review folded org design](0b9caec0-6a8f-4b5f-8774-2a289d4b9af8): FIX THEN RE-REVIEW (stage 4 dependency, statusChangedAt writer, suspension pill marked proposed, End it now separated from the no-browser question). [Verify design fix sentences](7f4503f2-6aba-4bde-9f60-1eab5fbea01d): COMMIT STAGE 1 DOC. The four questions stay open. Learner code does not start.

## Awaiting Andrew

No recommended answer.

1. After erasure, do we keep the org consent row unchanged, as we do for a tutor's row, or delete it?
2. When no browser is open, does a server job force-end the room, or is the pill plus refusing new activity enough until someone ends it? End it now does not wait on this question.
3. Do the 20-learner and 30-claim-email daily limits apply to an org owner or admin, or does an org get its own number?
4. Are org learners in this finish only children (parent claim), or can an organization also add an adult who consents as themselves?

## Folds applied

- Org learner create requires a valid parent email, the same existing rule as `createStudent`. Adult-vs-child is awaiting, not decided.
- The org-sales finish plan (Andrew-approved, section "From the earlier sequencing plan") says: "Owner and admin can open the learner record they created. They do not open the board, the audio, or the note." "The record they created" is the org role, not a per-creator lock.
- `ConsentRecord` gains an org key. Version aggregate and unique race use (`learnerProfileId`, `organizationId`). Listed readers change. Tutor readers keep `adminUserId: string`. Do not pass `undefined`. Both-null is rejected on `ConsentRecord` only. Partial uniques and CHECKs are hand-written SQL.
- `Student.organizationId` and `OrganizationLearner.organizationId` are `onDelete: Restrict`.
- Env-admin is both ids null. `EmailMessage` uses a second named helper. The calendar callback is exempt. The grep guard is Student-scope only.
- Scheduled-session free-text scrub runs for all students. The name-writer test stays honest. An unclaimed learner has no erasure scope. The consent-row outcome is awaiting.
- All session routes go through `assertOwnsWhiteboardSession`. `openScheduledWhiteboardSession` replaces `assertOwnsStudent` for org rows. The org student layout admits workspace and notes only.
- Read-only after removal applies to ended sessions. A session with `endedAt` null stays writable until the § 6 deadline. `revokeOrgGrantedApprovals` does not cut a live session.
- The deadline hour is the hour containing `storedAt`. The instant is fixed. Clients do not recompute it. Jest covers a half-hour-offset zone and a DST-change day.
- For org-forced ends, `wb-asset` and checkpoint stay open for a named implementation window after `endedAt`. Deadline and removal state ride an existing poll. No new cron.
- Status, membership, and approval re-check, and the PENDING→ACTIVE `updateMany`, run in one transaction under `lockOrg`. Stage 5 tests Start racing suspension, and idempotent double removal.
- Existing self-learners get a version-1 consent backfill. Five named sites read the record. Stage 3 seeds a pre-migration learner with no record.
- `actorLabel` logs a fixed operator marker, never an email. New `[org]`, `[cns]`, and `[slc]` lines are named.
- Each stage handoff lists tested versus assumed per platform. The org claim page, invite page, and student pill are assumed on iOS Safari until real hardware.
- `setOrganizationStatus` is the only writer of `statusChangedAt` after create. `createOrganization` still sets it at create time. `revokeOrgGrantedApprovals`, `setOrganizationCaps`, and `updatedAt` are not the deadline clock.
- Nits recorded, not decided: suspension pill is proposed; calendar titles use `OrganizationLearner.givenName`; stage 3 writes the org `already_linked_to_tutor` sentence and lists it; reinvite waits on item 4, and this design builds no second invite path.

## New UI strings

Accepted removal pills:

"This session will end soon because you are no longer part of the organization that set up this tutoring."

"This session will end soon. The organization that set up this tutoring has changed who teaches it."

Suspension pill: PROPOSED, not accepted. The § 0 text is a description, not a quoted UI sentence. The displayed sentence is proposed for Andrew's review, capitalized as a sentence, and is not an accepted quote.

Proposed display string: "This session will end soon because the organization that set up this tutoring has had its account suspended."

No other new strings.

## What a successor must not do

- Guess the four answers.
- Merge to master.
- Touch production Neon.
- Seed Sarah or Tyson emails.
- Start learner code.
