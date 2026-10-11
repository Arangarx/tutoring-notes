# Org learner — implementation contract (stages 2–7)

- **Branch:** `feat/org-qol`. Tip this design was written against: `266732a6`.
- **Status:** Andrew's decisions of 2026-10-11 are written in below. The four review questions are closed. Stage 2 build starts only when Andrew says go. Stages 3, 5, and 7 are not waiting on an answer. Stage 4 still depends on stage 3. A second Sonnet pass on this design has not happened. No learner code in this stage. No tests, schema, or migrations in this stage.
- **Contract:** § 0 below (Andrew, 2026-10-07) plus the org-sales finish plan. This body is the build contract for stages 2–7. A later executor builds from this file and that plan.
- **Slice 1 is already on this branch.** Call it. Do not redesign it. Facts are in § 7.
- **Log prefix:** `[org]`. Never log a token or an email.

---

## 0. Andrew, 2026-10-07 — assignment, roster, and consent

Note (2026-10-11): two factual lines in this section were updated for the rewrite — the sentence that said the body was not rewritten yet (and the conflict sentence that followed it), and the schedule-bridge sequencing sentence.

This pass supersedes the Q1–Q8 defaults below, and it supersedes any later section that treats "assignment ended" as a normal lifecycle. The body was rewritten on 2026-10-11 to match this section and the org-sales finish plan. Where an older sentence in § 0 conflicts with a later Andrew decision cited in the body, the later dated decision wins and is called out at the point of conflict.

**Scheduling is the relationship.** An org learner can have lessons with more than one tutor, for example two subjects. The org decides who teaches which lesson by scheduling it. Keeping the same tutor is a scheduling choice, not a hard lock that one tutor owns the learner.

**Taking a tutor off a live session is a deliberate cancel.** It is not something that falls out of "unassigning" a learner. Someone at the org would be ending that open session on purpose.

**The access cut is removal from the org roster.** A tutor who is still a member keeps access to the org sessions they teach, including replay of the board, audio, and transcript for their own sessions (Andrew: yes to replay). Booking a different tutor next week does not create an "after unassignment" state.

**After removal, org sessions are read-only (Andrew 2026-10-07).** Sessions the org initiated, that this tutor taught, stay readable and stop being writable. Personal students are a different record and are not part of this cut. When that read-only rule starts for a session that is still open is § 3 and § 6.3: ended sessions are read-only; a session with `endedAt` null stays writable for upload and `endWhiteboardSession` until the § 6 deadline. Later, the org may choose what a removed tutor keeps, including cutting them off entirely (for example after a removal for behavioral issues). That choice waits on org feedback. The default until then is read-only.

Note (Andrew 2026-10-11): notes are narrower than the read-only sentence above. See § 6.2. The later decision wins for notes. The 7 days to finalize notes start at session end, when `endedAt` is set, not at removal and not at the force-end deadline.

**A live org session requires a Mynk account.** Anonymous guest links are out. "Do not record" does not cover consent to be in an online session at all (COPPA). Signing up for tutoring with the org includes creating a Mynk account. The signup can be branded for the organization. Consent to be online is collected there, before the first session. A later lightweight login, if any, still has to be a specific person who already consented, so we know it is the same person.

**Suspended or not-yet-approved org.** A session already live may finish. It must not be able to run out to the normal runaway guard (`SESSION_SAFETY_MAX_SECONDS`, 8 hours in `src/lib/recording/segment-policy.ts`). For a **suspended** org (Andrew 2026-10-07): show a pill that the session will force end because the organization that set up the tutoring has had its account suspended. Force-end is the end of the current clock hour, with a floor of 10 minutes from the moment of suspension. Five minutes left in the hour still means 10 minutes before force close. The same timing covers a session already live while the org is not yet approved. The pill copy above is the suspension copy (description only; the display string is proposed in §6.2).

Note (Andrew 2026-10-11): the timer in the paragraph above is Let it finish. Suspension uses the same three choices as removal (§ 6.2). The operator's default when suspending is Let it finish. End it now ends the session immediately. End it now and no notes is read-only for the tutor immediately, with no finalize window. If the session is allowed to finish on the timer, the tutor can always finalize notes. The 7 days start at session end, when `endedAt` is set.

**Scheduler.** The scheduler sees the learner's full name and the brief, and not parent contact, consent detail, or notes. Seeing more means holding another role as well (admin or owner), not widening scheduler.

**Erasure.** Today the in-app control is operator-only (`/admin/erasure`: "Operator-only. Use for verified parental erasure requests."). A person who only came in through an org can ask Mynk directly. The org may pass a request along. The org is not the only door. The operator still performs the erasure, same as a verified parent request today.

**Schedule bridge.** This is the scheduled-session join work on `feat/org-qol` (open the room from an appointment, 15-minute join window, server-held key, parent can join as the child). It is not org code. `feat/org` was cut from master before that work, so it does not have the bridge. No org features are on the branch Tyson is testing. Superseded 2026-10-11: the sentence "Slice 2 should call that bridge after `feat/org-qol` is on master, and must not copy it" is superseded by Andrew's plan, which builds stages 1–7 on `feat/org-qol` now. The bridge already exists on this branch (`src/lib/whiteboard/schedule-bridge.ts`). Slice 2 calls `getOrCreateWhiteboardForSchedule` and does not copy it.

**Closed 2026-10-07 (later the same day)**

- Removed tutor: org-initiated sessions they taught become read-only. A later org setting may retain less, including nothing. Default is read-only until orgs are asked.
- Suspended org: pill as above. Force-end at the end of the current clock hour, and never sooner than 10 minutes after suspension.

---

## Standards for every stage

These apply to every line stages 2–7 add or touch. A stage is not done until all of them hold. Only Andrew can waive one, in writing.

**Testing.**

- Everything added and everything touched gets comprehensive tests: the happy path, edge cases, failure cases, and the exact behavior the change is for.
- Every test is shown red before the change and green after. A test that cannot fail does not count.
- Tests assert the spec, what the user sees or the rule in this design, using an independent oracle. Never constants copied from the code under test.
- Right layer. Playwright for UI, layout, session, recording, sync, and anything multi-person. Jest for pure logic and scope decisions. Green Jest alone never proves UI or session behavior. Layout tests check relationships (centered, aligned, not clipped), not pixel positions.
- Existing tests that cover changed behavior are updated to the new spec. Never deleted or loosened to make them pass. If an existing test conflicts with this design, this design wins, and the handoff says which test changed and why.
- New Playwright tests carry domain tags from `tests/test-tags.ts` and are enrolled in `wb-regression` when they touch whiteboard, sync, or session flows.

**Reuse and maintainability.**

- No duplication. Before building anything, look for the existing primitive, component, hook, or service and compose from it. Check `docs/V1-COMPONENT-LIBRARY.md` first.
- Two things that are almost the same are one component with a parameter, not two copies. The parent and self-learner consent switches are one component. The setup cards are one card with different text.
- When a change touches code that already has a duplicate nearby, consolidate it if that is safe and covered by tests.
- A new primitive is created only when nothing composable exists. It becomes the one canonical version, and it gets an entry in the component library doc.
- Changing a shared component means checking every place it is used, and running a green `npx next build`.

**CSS.**

- Each component owns its own styling (its own module and tokens). Variation comes through props, never through outside CSS reaching in to override it.
- No new global CSS unless it is truly global (design tokens, resets). Style the reusable component, and reuse the component.
- No page-local hardcoded colors or spacing. Use the tokens.

**Verification.** A separate Sonnet agent (`claude-sonnet-5-5-high`, read-only) reviews each stage against these standards: tests match the spec and went red first, code is sound, no duplication, CSS owned by components. A rejection blocks the stage until it is fixed and reviewed again.

The rules behind this are in `AGENTS.md`, `.cursor/rules/exhaustive-testing-mandate.mdc`, `.cursor/rules/composition-no-duplication.mdc`, `.cursor/rules/agentic-verification-pipeline.mdc`, `.cursor/rules/playwright-on-fix.mdc`, and `.cursor/rules/visual-layout-oracles.mdc`.

---

## Decided 2026-10-11

Andrew answered the open design questions on 2026-10-11. Do not reopen them. Do not soften them. The review record is `docs/handoff/org-sales-stage1-handoff.md`. A second Sonnet pass on this design has not happened.

Stage 2 build starts only when Andrew says go. Stages 3, 5, and 7 are not waiting on an answer. Stage 4 still depends on stage 3.

1. **Consent rows after erasure.** Kept, for an organization row exactly as for a tutor row. A keyed one-way fingerprint of the account email is stored in stage 7. Details are in § 2.7.
2. **A room with no browser.** No new background job. The first server touch after the deadline marks the session ended. Details are in § 6.1.
3. **Daily caps.** Counted per organization, all staff combined. Tutors keep their own caps. Details are in § 9. Review the numbers later.
4. **Who an org learner can be.** A self-learner or a child learner. All account types are supported. Details are in § 2.3.
5. **Removing a tutor who is teaching live.** The warning offers three choices. Details are in § 6.2.
6. **Suspension.** Mynk's action on the whole organization. Suspension uses the same three choices as removal. The operator's default when suspending is Let it finish. Details are in § 6.2. The suspension pill text stays proposed.

---

## 1. What finished means

After this branch is on master, Andrew can create an organization, invite its staff, and that organization can add learners, collect consent, and run scheduled live sessions. A math department is its own organization. There is no parent-org tree and no public "start an organization" signup. Andrew still creates the org; the school does not self-serve.

Scheduling is the relationship (§ 0). A live org session requires a Mynk account. Consent to be online is collected at signup. A removed tutor's ended org sessions are read-only (§ 3, § 6.3), with the notes exception in § 6.2. A session still open under "Let it finish" stays writable for upload and end until the § 6 deadline. A suspended org's live session, when the operator chose Let it finish, shows the suspension pill and uses the clock in § 6. The operator's default when suspending is Let it finish. A room with no browser is not closed by a background job (§ 6.1).

Text-message two-factor is already live. It is not a gap in this finish.

When this plan is built, tested, and on master, a real organization can use the production site. Apple Calendar subscribe on a real device stays with Andrew. Stripe is not required for a free pilot. A school may still ask for a signed data agreement; that is a document Andrew sends, not a feature.

---

## 2. Data model

One additive migration. Run it on the local test database only. Production Neon is forbidden. Andrew approved (2026-10-11) migrating the preview database once the local gates pass; that approval is separate from this migration and from production. Nothing is dropped or renamed. This stage does not add the migration. The single additive migration lands in stage 3, includes `statusChangedAt` so stage 5 does not migrate again, and stage 2 adds no learner columns.

### 2.1 One org-owned `Student`

An org learner is one `Student` row:

- `organizationId` set
- `adminUserId` null forever

A tutor who also teaches that person privately has a different `Student` row (`adminUserId` set, `organizationId` null). Both rows may point at the same `LearnerProfile`. Personal rows stay tutor-owned. Org access is an added path (§ 3). It is not a bypass of `assertOwnsStudent`.

`Student` today has no `organizationId`. `adminUserId` is already nullable. The comment on `adminUserId` says null means legacy rows or the env-only admin. That is the leak in § 2.6.

A database CHECK forbids a row that has both owners:

```sql
ALTER TABLE "Student" ADD CONSTRAINT student_single_owner
  CHECK (NOT ("adminUserId" IS NOT NULL AND "organizationId" IS NOT NULL));
```

Both null remains allowed on `Student`. That is the env-admin row. Tutor-only and org-only remain allowed. The env-admin both-null meaning applies to `Student` only. Under the § 2.4 CHECK, both-null is rejected on `ConsentRecord`.

`Student.organizationId` and `OrganizationLearner.organizationId` are `onDelete: Restrict`. `Organization` cascades to members and invites. A cascade on these learner foreign keys would delete learners, sessions, and recordings.

### 2.2 One org learner row per organization and learner profile

Add a unique index on (`organizationId`, `learnerProfileId`).

Postgres unique indexes are NULLS DISTINCT by default. The existing `@@unique([adminUserId, learnerProfileId])` does **not** cover org rows: `adminUserId` is null, so many org rows with the same `learnerProfileId` all pass that index. The new `(organizationId, learnerProfileId)` unique is the one that enforces one org learner per organization and profile.

The same NULLS DISTINCT rule applies to the new index. A null `learnerProfileId` does not collide with another null. Several not-yet-linked learners in one org are separate rows. Do not add a unique that collapses those rows.

### 2.3 Side table: given name, family name, and one brief

New model `OrganizationLearner`, one-to-one with the org `Student`:

- `studentId` unique
- `organizationId`
- `givenName`
- `familyName`
- `brief` (one string)
- `createdByAdminUserId`
- `createdAt`, `updatedAt`

There is one brief. The scheduler sees "the brief". Do not add `briefGrade`, `briefSubject`, or `briefGoals`. Those columns are not in the schema on this branch.

Parent email stays on `Student.parentEmail`. The side table does not copy it. Staff enter the name, the brief, who the invite is for, and that person's email.

Org learner create requires that email, the same existing rule as `createStudent`. It is stored on `Student.parentEmail` and is the `intendedEmail` of the claim invite. `mintStudentClaimInvite` requires `recipientEmail`. A blank email is already rejected (`createStudent`: "A valid email address is required."; claim-invites: 422 `missing_invite_email`). That is the existing rule.

**Who an org learner can be (Andrew 2026-10-11).** An org learner can be a self-learner or a child learner. All account types are supported. When staff add a learner they choose "the student" or "their parent", the same way a tutor chooses today. The invite email is the student's own email for a self-learner, or the parent's email for a child. That choice is stored as `inviteTargetKind` on the invite, the same values a tutor invite already uses. Do not refuse a self-learner. Do not add a second invite implementation.

The organization's link to a person is its own org-owned `Student` row pointing at the learner profile, the same shape as a tutor's student row. One row per organization per learner profile (§ 2.2). A parent with several children at one organization has several rows under the same parent account. The same child can also have a row with a tutor and rows with other organizations.

The scheduler books the student by name. On the day, the parent signs in and joins for the child, or the child uses the family login if the parent made one. That is today's schedule bridge. Do not change it.

A self-learner accepts the general agreement at setup and gets the four switches in Settings. That consent is written to the organization. A parent consents on the child consent page. That consent is written to the organization. The agreement text and the four switches are § 4.4 and § 4.1. Do not write a second consent path.

Duplicate before claim: the organization may add the same person twice before either invite is claimed. `learnerProfileId` is still null, so § 2.2 allows both rows. The second claim fails the uniqueness rule and shows this proposed message, not an accepted quote: "This student is already set up with this organization. Ask the organization to remove the extra entry."

The reinvite that passes `student.adminUserId!` is `retryStudentClaimInvite` in `src/app/admin/students/actions.ts`. An earlier draft of this design named `students/[id]/actions.ts`. That file does not contain that assertion. Stage 3 gives this reinvite an organization-aware caller through `mintStudentClaimInvite`. It does not add a second invite implementation.

One writer, `writeOrgLearnerName`, in `src/lib/org-learner.ts`, is the only function that writes `givenName`, `familyName`, and `Student.name` for an org row. `Student.name` is the trimmed given name, a single space, and the trimmed family name. A test asserts the two never drift. No other writer sets `Student.name` on an org row.

**Implementation cap, not an Andrew product decision.** `ORG_LEARNER_BRIEF_MAX_CHARS = 500`, defined once in `src/lib/org-learner.ts`. Tests and the create path import that constant. Do not copy the number anywhere else. Andrew did not choose 500.

### 2.4 `ConsentRecord` gains `organizationId`

Do not add `OrganizationConsentRecord`. Andrew 2026-10-10 (5-axis blockers, folded into the 2026-10-11 plan): the claim form's four toggles live on the existing `ConsentRecord`, and that row is frozen into the existing session snapshot.

`ConsentRecord` today (`prisma/schema.prisma`) requires `adminUserId` and versions with `@@unique([learnerProfileId, adminUserId, version])`. The four toggles are already `allowLiveSession`, `allowAudioRecording`, `allowWhiteboardRecording`, and `allowNoteSending` (notes). Keep those column names.

The migration:

- Add nullable `organizationId`, foreign key to `Organization`, `onDelete: Restrict`.
- Make `adminUserId` nullable.
- CHECK, exactly one owner:

```sql
CHECK (
  ("adminUserId" IS NOT NULL AND "organizationId" IS NULL)
  OR
  ("adminUserId" IS NULL AND "organizationId" IS NOT NULL)
)
```

- Version uniqueness cannot stay a single unique that includes a nullable column. NULLS DISTINCT would let org versions collide. In the same migration, replace that unique with two partial unique indexes:
  - tutor: (`learnerProfileId`, `adminUserId`, `version`) WHERE `adminUserId` IS NOT NULL
  - org: (`learnerProfileId`, `organizationId`, `version`) WHERE `organizationId` IS NOT NULL

Existing tutor rows have `adminUserId` set. They satisfy the check with `organizationId` null.

An org consent row has `organizationId` set and `adminUserId` null. It is written for the organization, not for the admin who minted the claim link (§ 4).

`createVersionedConsentRecord` (`src/lib/consent-write.ts`) gains an org key. Its version aggregate and unique race use (`learnerProfileId`, `organizationId`) for org rows. Every `ConsentRecord` reader goes through the resolver or is listed and changed: `createSessionConsentSnapshot`, `assertConsentRecordExists`, `assertConsentFromLiveRecord`, `claim/[token]/setup/page.tsx`, `account/children/[id]/consent/page.tsx`, and `admin/students/[id]/page.tsx`. `assertConsentRecordExists` is the CC-1 gate in both `createWhiteboardSessionCore` and `startWhiteboardSession`. Tutor-keyed readers keep `adminUserId: string` (never optional). Org readers take `organizationId: string`. Prisma `where: { adminUserId: undefined }` matches every tutor's rows for that learner, so do not pass `undefined`.

No env-admin `ConsentRecord` exists or can exist (`createStudent` rejects env scope; `adminUserId` was required). Under the CHECK, both-null is rejected on `ConsentRecord`. The env-admin both-null meaning applies to `Student` only. Partial unique indexes and CHECKs go in hand-written migration SQL, as `ErasureJob` already does.

The freeze is the existing `SessionConsentSnapshot` (`allowLiveSession`, `allowAudioRecording`, `allowWhiteboardRecording`, `allowNoteSending`, `consentRecordId`, `consentRecordVersion`). Do not add a parallel snapshot or an `orgConsentRecordId` column.

### 2.5 What this migration does not add

- No `OrganizationLearnerAssignment` table. Scheduling is the relationship. Booking a different tutor next week is another appointment.
- No guest-token tables.
- No per-tutor parent-approval columns.
- No tutor-must-accept flag.

### 2.6 Env-admin scope

`studentsWhereForScope` and `canAccessStudentRow` in `src/lib/student-scope.ts` treat `adminUserId` null as the env-only admin. The env branch of `studentsWhereForScope` returns `{ adminUserId: null }`. `canAccessStudentRow` for `kind: "env"` returns `student.adminUserId === null`. An org learner would match both.

The same shortcut is inlined in:

- `src/app/api/audio/admin/[recordingId]/route.ts` — env branch `student: { adminUserId: null }`
- `src/app/admin/outbox/page.tsx` — env branch `{ adminUserId: null }` on `EmailMessage`

Env-admin scope is `adminUserId` null AND `organizationId` null, in one helper. Home: `src/lib/student-scope.ts`. Name: `envOnlyNullOwnerWhere()`. It returns `{ adminUserId: null, organizationId: null }`.

- `studentsWhereForScope` (env branch) uses `envOnlyNullOwnerWhere()`.
- `canAccessStudentRow`'s env branch tests `adminUserId === null && organizationId === null` strictly. Every caller's select adds `organizationId`. The type requires it.
- The audio admin route uses `student: envOnlyNullOwnerWhere()`.
- `envOnlyNullOwnerWhere()` is not spread into `EmailMessage`. The outbox page uses `{ adminUserId: null }` through a second named helper, because `EmailMessage` has no `organizationId`. Do not add `organizationId` to `EmailMessage` for this fix.

The grep guard covers Student-scope queries only. It fails if a student-scope query outside `envOnlyNullOwnerWhere` writes `adminUserId: null` as the env-admin owner. `src/app/api/auth/calendar/callback/route.ts` uses `adminUserId: null` on a different table and is exempt.

### 2.7 Erasure

The operator still performs erasure at `/admin/erasure`. An org is not the only way a person asks (§ 0).

**Decided (Andrew 2026-10-11).** Do not move all identity into separate tables that hold only personal information. Content is deleted outright. Identity columns are scrubbed in place, as today. The guards below make that checkable.

Erasure deletes and clears by ownership, the erased learner's ids and the account's ids. It never matches text. Free text on that learner's own rows is cleared because the row belongs to them, not because the text contains their name. That includes `ScheduledSession.subject`, `notes`, and `location`, and any other free text tied to their rows.

`scrubDbContent` in `src/lib/erasure/process-erasure-job.ts` already sets `Student.name` to the existing deleted-learner name and `parentEmail` to null. Extend that same function. Do not add a second erasure path.

The `OrganizationLearner` row is deleted outright. Do not scrub the name and brief and leave the row. `Student.name` is still scrubbed in place. The test that `Student.name` equals the side-table name does not apply once that row is gone.

An unclaimed org learner has no `LearnerProfile` and so no erasure scope. Owner or admin removal of an unclaimed learner is out of scope here.

**Consent rows are kept** after erasure, for an organization row exactly as for a tutor row. The reason, for this design, is an audit trail and a legal defense. The row shows what we were allowed to collect, and when. The kept row holds no personal information. It holds ids, the four on or off answers, who set them by id, and when. Today `process-erasure-job.ts` does not touch `ConsentRecord`, and the tutor-row test asserts the row is retained. Stage 7 asserts the same retain for the organization row. Do not delete it.

**Fingerprint.** At erasure, before identity is scrubbed, store a keyed one-way hash (HMAC) of the account email in its own row, linked to the erasure record. The account email is the parent's email, or the self-learner's own email. The key is a server secret in an environment variable. The key is never stored in the database. The hash cannot be turned back into the email. If someone later comes forward, we hash the email they give and find the matching consent rows and erasure record. Stage 7 builds this. Stage 7 does not name the variable in this design; Andrew did not name it. The stage 7 commit adds that environment variable to `docs/PLATFORM-ASSUMPTIONS.md`. Do not edit that file before stage 7.

**Privacy** is updated to match in stage 7. This sentence is proposed for Andrew's review. It is not accepted copy: "After an account is deleted, we keep a record of the consent choices that were made and a one-way fingerprint of the account email, so we can answer questions about consent later. The fingerprint cannot be turned back into the email."

Counsel reviews the fingerprint and the keeping of consent rows when Andrew has counsel. The list is `docs/LEGAL-SYNC.md`, Questions for counsel. Do not start a second list.

**Guard 1.** A registry classifies every database column as personal or not personal. A test fails if a column is unclassified. A second test fails if erasure does not clear or delete every personal column for the erased scope.

**Guard 2.** An end-to-end test seeds a learner with a unique marker string in the name, the email, and free text. It runs erasure. It searches every text column in every table for the marker. Any hit fails.

**Guard 3 (Andrew 2026-10-11).** The same test seeds a second learner with exactly the same name and similar email-like text. It erases the first learner. It asserts every row of the second learner is unchanged. Names are not unique. Erasure must never touch another learner's data.

**Copies outside the database.** Stage 7 writes an inventory. For each place it says what we delete, what we cannot delete, and what the privacy copy says. The places are: Google Calendar events on the tutor's calendar (first name and last initial), the ICS feed, sent email and outbox email, application logs, OpenAI, Vercel Blob, Neon restore history (backups until the window passes), and preview and test databases. Stage 7 must check how today's erasure handles outbox emails and Google events, and report that. Unresolved items are added to the counsel list in `docs/LEGAL-SYNC.md`. Do not guess them in this design.

**Billing.** When billing is built, billing rows reference ids only. They never store names or emails. Billing itself is not in this finish (§ 12).

One integration test erases an org learner end to end and asserts this section: side table deleted, consent row kept, free text cleared by ownership, fingerprint row present and not reversible from the database, and guards 1 through 3 green.

### 2.8 Status-change time

`Organization` has `status` (`pending`, `active`, `suspended`) and `timezone`. It has no column for when status last changed. `updatedAt` also moves when caps change, so it is not that time.

Name the field `Organization.statusChangedAt` (`DateTime`). `createOrganization` still sets `statusChangedAt` at create time. `setOrganizationStatus` is the only writer of `statusChangedAt` after create, and the write is added there, on every status change. `revokeOrgGrantedApprovals`, `setOrganizationCaps`, and `updatedAt` are not the deadline clock. Existing rows backfill to `createdAt` so the column is non-null. That backfill is the migration default, not an Andrew decision about force-end at deploy.

Deadline math is § 6. Removal "Let it finish" does not reuse this column. Membership removal already stores `OrganizationMember.removedAt`.

---

## 3. Access

One session-access check, `resolveOrgSessionAccess`, in `src/lib/org-session-access.ts`. It is the only org session decision. These four call it:

- `assertOwnsWhiteboardSession` (`src/lib/whiteboard-scope.ts`)
- `openScheduledWhiteboardSession` (`src/app/admin/students/[id]/whiteboard/actions.ts`)
- the student layout (`src/app/admin/students/[id]/layout.tsx`), which today calls `canAccessStudentRow`
- the notes actions on that student

All session routes go through `assertOwnsWhiteboardSession`, which calls `resolveOrgSessionAccess`. The stage 4 handoff lists every direct `assertOwnsStudent` caller and states fail-closed or org-aware for each. `openScheduledWhiteboardSession`'s `assertOwnsStudent(owned.studentId)` is replaced for org rows, not supplemented. For org rows the student layout admits only the workspace and notes routes the instructor needs. The personal student page, claim, share-link, and email actions stay closed (`canAccessStudentRow` false).

`assertOwnsStudent` / `assertOwnsMutableStudent` gain no org bypass. For a tutor login they stay `student.adminUserId === me`, which is false for an org row. Personal actions fail closed on org learners.

Org sessions are created only from an appointment (`ScheduledSession`). There is no ad hoc org session.

`resolveOrgSessionAccess` returns read-write, read-only, or denied:

- **While the tutor is an active member** (`OrganizationMember.removedAt` null) and `approvalStatus` is `APPROVED`, and the caller is the session's tutor (`WhiteboardSession.adminUserId`): read and write that session. Notes, replay, audio, and transcript for sessions they taught. They never receive parent email. The loader must not select `Student.parentEmail`.
- **After removal** (`removedAt` set): read-only applies to ended sessions, with the notes exception in § 6.2. If the remover chose Let it finish, a session with `endedAt` null stays writable for upload and `endWhiteboardSession` until its § 6 deadline. If the remover chose End it now and no notes, the session is read-only for the tutor immediately, there is no finalize window, and uploads already on their way still land. Personal students are untouched. No code in the removal path reads or writes a `Student` with `adminUserId` set. An operator `revokeOrgGrantedApprovals` does not cut a session already live.
- **Owner and admin** of the organization can open any learner record of that organization (full name, the brief, parent email, because the organization entered it). The org-sales finish plan (Andrew-approved, section "From the earlier sequencing plan") says: "Owner and admin can open the learner record they created. They do not open the board, the audio, or the note." "The record they created" is the org role, not a per-creator lock. That record is the organization learner screen, not a grant on `resolveOrgSessionAccess`. § 0 says seeing more than the scheduler sees means holding admin or owner, which includes notes in that "more." The note line is that plan sentence.
- **The access cut is removal** (§ 0). Dropping the `instructor` role without setting `removedAt` is not the cut. Booking a different tutor is another appointment, not an "after unassignment" state.

**Scheduler (Andrew 2026-10-10, extending § 0).** § 0 says the scheduler sees full name and the brief, and not parent contact, consent detail, or notes. The 2026-10-10 decision adds a short blocked reason, such as waiting on the family or live sessions off. That reason is not parent email, not the consent toggles, and not notes. The loader selects full name, the brief, and that short reason. It must not select parent email, consent toggles, or notes. Consent detail beyond that short reason still requires owner or admin (§ 0). The note does not (the plan sentence quoted in § 3).

Denied access is not found, so a probe cannot tell "exists" from "forbidden". A member of another org is denied. Every org lookup is scoped by `organizationId` after `assertOrgRole`.

---

## 4. Consent resolver

One resolver, `resolveRecordedConsent`, in `src/lib/consent-scope.ts`. It is the consent read. Do not add a second consent module.

It feeds:

- `getOrCreateWhiteboardForSchedule`
- `createWhiteboardSessionCore`
- `startWhiteboardSession`
- the session snapshot (`createSessionConsentSnapshot`)
- `/join`

Personal appointments keep today's tutor-keyed `ConsentRecord` lookup inside that function. Org rows look up `ConsentRecord` by `learnerProfileId` plus `organizationId`, with `adminUserId` null. `assertConsentFromLiveRecord` calls the resolver. It does not keep a tutor-only lookup that ignores org rows.

`getOrCreateWhiteboardForSchedule`, `createWhiteboardSessionCore`, and `startWhiteboardSession` all use the resolver and re-check that the org `status` is `active` and the instructor is still an approved member (`removedAt` null, `approvalStatus` `APPROVED`).

Today the bridge denies unless `student.adminUserId === appointment.adminUserId` (`schedule-bridge.ts`). An org learner has `adminUserId` null, so that line denies every org appointment. The org case is the one added case: `organizationId` set and `adminUserId` null. Personal appointments keep that owner check and today's consent checks. Slice 2 calls `getOrCreateWhiteboardForSchedule`. It does not copy it. (Sequencing: Andrew 2026-10-11, § 0.)

### 4.1 Org claim

Org claim is authorized by an owner or admin of that org. Consent from the claim is written to the org (`organizationId` set, `adminUserId` null), not to whichever admin minted the link. The claim page shows the organization name.

The parent consent editor lists the organization by name, with the same edit and withdraw behavior as a tutor row. One component, parameterized. The four switches are the existing toggles.

Nit, not a product decision: the claim-complete `attach_existing` unique-violation path answers `already_linked_to_tutor`. For an org row that label is wrong. Stage 3 uses the proposed sentence in § 2.3 and lists it in the handoff. Do not invent a different sentence.

The reinvite path is § 2.3. It calls `mintStudentClaimInvite` with an organization-aware owner. It does not get a second invite implementation.

### 4.2 Pending or suspended org

A pending or suspended org cannot start a new session, including a room created just before the status change. `startWhiteboardSession` re-checks status. A session already live when the status changes uses the § 6 timer. It is not a new start.

The org status, membership, and approval re-check and the pending-to-active `updateMany` run in one transaction under the existing `lockOrg` row lock. Stage 5 has a test for Start racing suspension, and for a double-submitted removal being idempotent. A room with no browser is § 6.1. There is no new background job.

### 4.3 Live sessions off

LIVE start is refused when live sessions are off. The Start button is hidden. In-person start stays allowed. The server refusal and the hidden button are both required. Hiding the button alone is not the rule.

### 4.4 Self-learner consent

This lands in stage 3 because it changes the same check.

Today `resolveModeAwareAudioRecordingConsent` in `src/lib/consent-scope.ts` allows a self-learner before it reads any toggle (the `isSelfLearner` return, including the branch that runs when a consent record exists). The same file has other self-learner passes that grant consent before reading the toggles. Remove those skips. A missing toggle read must not allow recording.

Settings off is what the server enforces. "Existing self-learners count as agreed" is a data rule. It is not a code path that ignores the toggles.

Exact agreement checkbox:

"I agree that my tutoring sessions may be recorded — the shared whiteboard and the audio — and that Mynk drafts session notes from them. I can turn any of this off later in Settings."

Settings: the same four switches the parent sees. Audio help text:

"Off means your voice is left out of the saved recording. Online, your tutor's microphone can still be saved. In person, nothing is saved."

Existing self-learners are treated as having agreed (Andrew 2026-10-11). They get the off switches, with no prompt.

The migration backfills a version-1 `ConsentRecord` (all four toggles true, `setByAccountHolderId` = the profile's account holder, capture method marked presumed rather than ticked) for every existing self-learner and tutor link that has no record. The five sites that skip the toggle today must read the record after the backfill: `assertEffectiveConsent`, both branches of `resolveModeAwareAudioRecordingConsent`, `createSessionConsentSnapshot`, `assertConsentRecordExists`, `assertConsentFromLiveRecord`. Stage 3 seeds a pre-migration self-learner with no record and asserts recording still works and the off switch is honored. An org self-learner uses this same agreement and these same four switches. The consent row is the organization's (§ 2.3).

Audio off for a self-learner works the same as for a child (Andrew 2026-10-11, replacing the 2026-10-10 wording that dropped the tutor's microphone online). Online, their voice is left out of the saved recording, and the tutor's microphone can still be saved and transcribed. In person, nothing is saved.

Child audio off stays as it is. Online, the child's voice is left out and the tutor's microphone can still be saved and transcribed. In person, nothing is saved. Do not offer to change it.

This is a fragile surface (consent check and the recording path). Step back before editing it. A Sonnet review (`claude-sonnet-5-5-high`, read-only) is required. Playwright must show a self-learner with audio off: online, their voice is not in the saved recording; in person, nothing is saved. Jest does not prove that.

---

## 5. Booking

Owner, admin, or scheduler creates, changes, and cancels an appointment for an org learner and one current approved instructor.

- The appointment's `studentId` is the org `Student`.
- The appointment's `adminUserId` is that instructor.
- No personal `Student` is created for that instructor.
- The instructor is an active approved member, checked again when the room opens and when the session starts (§ 4).
- The Google event is written for the instructor, using the existing writer in `src/lib/calendar/google-calendar-write.ts`, or skipped if they have no calendar connected. Do not copy that writer.
- Nit, not a product decision: calendar titles that show a first name use `OrganizationLearner.givenName` for org rows, not a split of `Student.name`.
- Overlap warning uses the appointment `startAt` and `endAt`. It warns. The plan does not make overlap a hard block.
- The org week is `Organization.timezone`.
- Personal appointments keep today's owner and consent checks.
- The session-length rule in § 9 is the one guard for org and personal appointments. An end time at or before the start is rejected.

An in-app schedule shows when, instructor, and learner name. The org-sales finish plan (Andrew-approved, section "From the earlier sequencing plan") says: "Owner and admin can open the learner record they created. They do not open the board, the audio, or the note." "The record they created" is the org role, not a per-creator lock. The instructor does, for sessions they taught (§ 3).

---

## 6. Removal and suspension

### 6.1 Deadline

One pure function, `orgForceEndDeadline(storedAt, timeZone, now)`, next to `resolveOrgSessionAccess`. The `now` argument only tests whether the fixed deadline has passed. Jest tests the math. The oracle is the clock, not a constant copied from the function.

The clock hour is the one containing `storedAt`, not `now`. This is the § 0 rule: the hour at suspension, fixed. The deadline is the later of:

- the end of that clock hour in `Organization.timezone`
- `storedAt` plus 10 minutes

Five minutes left in the hour that contains `storedAt` still means 10 minutes. The stored time is never ignored in favor of a sooner hour boundary.

The deadline is fixed once and does not move. `now` only tests whether it has passed. `now` is not an input to the hour or the deadline. The server computes the deadline as an absolute instant and sends it to both clients. Neither client recomputes it from its own clock or time zone. Jest covers a half-hour-offset zone and a DST-change day.

| Situation | `storedAt` |
|---|---|
| Org suspended, or not yet approved, and a session is already live | `Organization.statusChangedAt` |
| Removal, Let it finish | `OrganizationMember.removedAt` |

The same timer covers a session already live while the org is not yet approved (§ 0).

The client shows the pill. The deadline and removal state reach both clients on an existing per-session poll route, additively (`active-ping` or `join-timer`). They do not use the sync wire. `WhiteboardWorkspaceClient` stays additive. Neither client recomputes the deadline. The stage names which existing route it extends. It does not add a route.

The server refuses new activity after the deadline. A session already in flight keeps accepting the uploads that finish it, whether removal or suspension.

Today `wb-asset`, checkpoint, and `active-ping` reject once `endedAt` is set, so a naive End it now would drop the instructor's own final uploads. For org-forced ends, `wb-asset` and checkpoint keep accepting that session's uploads for a stated window after `endedAt`. `active-ping` still refuses new activity once `endedAt` is set; the poll only carries the deadline and the removal state. A Playwright test proves the instructor's pending outbox lands after End it now. Andrew did not set the window length. It stays an implementation cap named in one place. Do not copy the number.

**A room with no browser (Andrew 2026-10-11).** No new background job. A room with no browser is a stored session that was not marked ended. Nothing records without a browser. After the deadline the server refuses to start, join, or reopen that room. The first server touch after the deadline marks it ended through the single end-session core. That touch is the tutor opening the student page or the schedule, or someone trying to rejoin. Pending uploads that finish the session are still accepted. A room nobody touches again never gets its notes drafted. That is the same consequence as a personal session nobody touches again today. Do not add a sweeper. Do not add a cron.

The force-end must not wait for `SESSION_SAFETY_MAX_SECONDS` (8 hours).

### 6.2 Pill copy

The two removal pills are accepted. Use those sentences and no others for removal.

Removal, Let it finish, tutor pill (Andrew 2026-10-11):

"This session will end soon because you are no longer part of the organization that set up this tutoring."

Removal, Let it finish, student pill (Andrew 2026-10-11):

"This session will end soon. The organization that set up this tutoring has changed who teaches it."

The suspension pill text in § 0 is a description, not a quoted UI sentence. Keep those words: a pill that the session will force end because the organization that set up the tutoring has had its account suspended.

The displayed sentence stays proposed for Andrew's review. It is not an accepted quote: "This session will end soon because the organization that set up this tutoring has had its account suspended."

**Why Mynk suspends the whole organization (Andrew 2026-10-11).** Nonpayment, the contract ended, a terms violation, or safety or security. These are organization-level. They are not something the individual tutor did. In a violation or safety case the tutor could be part of it. Suspension uses the same three choices as removing a live tutor. The operator's default when suspending is Let it finish.

§ 0 says taking a tutor off a live session is a deliberate cancel, not something that falls out of unassigning. Andrew 2026-10-11 is that cancel: the remover is warned and chooses one of three. Do not implement removal as "the session always runs to the hour" and do not implement it as an assignment row.

In every case, uploads already on their way still land.

The same three choices apply to removing a live tutor and to Mynk suspending the organization. "No notes" is only a sub-option of ending the session immediately. If the session is allowed to finish on the timer, the tutor can always finalize notes for those 7 days. The 7 days start at session end, when `endedAt` is set, not at removal and not at the force-end deadline.

- **Let it finish.** The timer runs. It is the end of the clock hour, with the 10-minute floor. The tutor may finalize notes. The 7 days start at session end, when `endedAt` is set. After that, the notes are read-only. On removal, the two accepted removal pills apply. On suspension, the proposed suspension pill applies.
- **End it now, and the tutor may finalize notes.** The session ends immediately, the same way as cancelling a session in the middle. The tutor may finalize notes. The 7 days start at session end, when `endedAt` is set. After that, the notes are read-only.
- **End it now, and no notes.** The session is read-only for the tutor immediately. There is no finalize window. The warning tells the remover that no notes will come from this session and that, once billing starts, the time still counts against the organization's billed time. This warning text is proposed for Andrew's review. It is not accepted copy: "No notes will come from this session. Once billing starts, this session's time still counts toward your organization's billed time."

A tutor who may finalize (the first two choices) has 7 days to finalize the notes for that session. The 7 days start at session end, when `endedAt` is set, not at removal and not at the force-end deadline. After that, the session is read-only. Stage 5 tests that the window is `endedAt` plus 7 days.

Future feature, not this finish: auto-finalize at that deadline, as if the tutor accepted the draft and saved it unchanged. Tracked in `docs/BACKLOG.md`. Ask organizations what they want to happen to notes when a session is ended early. The questions are in `docs/interviews/ORG-INTERVIEW-GUIDE.md`.

The choice applies to each live org session that instructor is teaching in that organization, and to each live session when Mynk suspends the organization. Both End it now choices end those sessions in the same action as the removal or the suspension. A session that is still open is Let it finish. Removal times that session from `removedAt`. Suspension times it from `statusChangedAt`.

### 6.3 After the session

Future appointments for that instructor are cancelled, including the Google event. While the org is suspended, upcoming rows say unavailable.

After removal, read-only applies to ended sessions (§ 0, § 3, § 6.2). A removed instructor on Let it finish, with `endedAt` null, stays writable for upload and `endWhiteboardSession` until the § 6 deadline. Notes finalizing follows § 6.2. An operator `revokeOrgGrantedApprovals` does not cut a session already live. Personal students are untouched.

§ 0 leaves a later org setting that may retain less, including nothing. That full-cutoff setting is not in this finish (§ 12). This finish builds read-only.

### 6.4 Chrome

The pill is additive whiteboard chrome. Do not rewrite page switch, scene flow, recording, or sync apply in `WhiteboardWorkspaceClient`. New state, a handler, and JSX that mounts the pill are in scope. Engine behavior is not.

The pill component owns its CSS. Check `docs/V1-COMPONENT-LIBRARY.md` before adding one. Compose an existing pill if one fits. Variation is props. No page-local colors.

---

## 7. Staff UI (stage 2)

Slice 1 is operator functions in `src/lib/org-scope.ts` and the accept page at `src/app/org-invite/[token]/page.tsx`. Call those functions. Do not replace them.

On this branch, slice 1 already has:

| Piece | Where |
|---|---|
| Models | `Organization`, `OrganizationMember`, `OrganizationInvite` |
| Status | `OrganizationStatus`: `pending`, `active`, `suspended` |
| Roles | `OrgRole`: `owner`, `admin`, `scheduler`, `instructor` |
| Create org | `createOrganization` — operator, takes `ownerAdminUserId`, not an email |
| Status and caps | `setOrganizationStatus`, `setOrganizationCaps` |
| Invites | `createOrgInvite` (owner or admin; returns `rawToken`; does not send email), `revokeOrgInvite` |
| Accept | `acceptOrgInvite`. The page form calls `acceptOrgInviteAction` in `src/app/org-invite/[token]/actions.ts`, which redirects every failure to `/org-invite/unavailable`. |
| Roles and removal | `setOrgMemberRoles`, `removeOrgMember` |
| Role gate | `assertOrgRole`. Scheduler and instructor are not in the allow-list for invite or role changes. `canGrantRole`: owner may grant any role; admin may grant scheduler or instructor. |
| Caps | `Organization.dailyInviteCap` null means no cap. `Organization.maxMembers` null means no member cap. Counted with `startOfZonedDay` in `Organization.timezone`. |
| Log | `orgLog` writes `[org] org=<id> action=<action> …`. Invite id is the first 8 characters. The raw token is not logged. |

`createOrganization` does not look up an email and does not check `emailVerifiedAt`. It rejects a missing admin id (`not_a_member`) and a test account (`test_account`). The new screen does the email lookup, then calls `createOrganization`.

### 7.1 Operator creates the org

The operator creates an org by the owner's email. The screen resolves that email to an `AdminUser` with `emailVerifiedAt` set. A clear error when that person has no verified account. Then `createOrganization({ ownerAdminUserId })`.

Creating an organization sets a daily invite cap. Starting limit (Andrew 2026-10-11): a new organization may send 25 staff invites a day. The learner cap and the claim-email cap are § 9. Mynk can raise any of the three, or set any of them unlimited, through `setOrganizationCaps`. Unlimited is an explicit operator choice, not the default.

Today `createOrganization` uses `input.dailyInviteCap ?? null`, so an omitted cap is stored as unlimited. Stage 2 separates "omitted" from "unlimited" for the staff-invite cap. Omitted stores 25. Null is stored only when the operator explicitly chooses unlimited. Stage 3 uses that same omitted-versus-unlimited rule for the learner cap and the claim-email cap.

### 7.2 Invites

Owner and admin invite and set roles. Scheduler and instructor cannot. `assertOrgRole` already enforces that. Tests must fail if a scheduler or instructor invite succeeds.

Invites are emailed with the org name and role. `createOrgInvite` already returns the raw token. The screen sends the email. The log line still has no token and no email.

The invite page shows the org, the role, and the invited email. Today `src/app/org-invite/[token]/page.tsx` shows a generic title and an Accept button. It does not show the org, the role, or the email.

Sign in and Create account go only to the teaching-account flow, with that email prefilled and a return path that survives email confirmation. Both doors are shown when nobody is signed in. The page does not look up whether the email has an account and then hide one door.

The wrong signed-in email gets an explicit switch-account message.

A person holding the invite sees a specific reason, not the generic unavailable page (`/org-invite/unavailable`, "This invitation can't be accepted."). Expired, revoked, and already used are facts about the invite row. Say which. That specific reason must not reveal whether some email has an account (§ 9).

Activating the org (`setOrganizationStatus` to `active`) lists waitlisted members so the operator can approve them. `acceptOrgInvite` calls `approveTutor` only when the org is already `active`, and `approveTutor` updates only a `WAITLISTED` row. Members who joined while the org was pending stay waitlisted. The operator approves them with the existing `approveTutor`. Do not auto-approve the list on activation.

### 7.3 Accept guards stay load-bearing

`acceptOrgInvite` guards stay. Tests must prove they are load-bearing: each test goes red when that guard is removed.

What the function does today:

- No session, unknown token, already accepted, revoked, expired, email mismatch, missing admin, unverified (`emailVerifiedAt` null), or test account: the same `{ ok: false, error: "invite_unavailable" }`.
- The inviter must still be an active member (`removedAt` null) who can grant every invited role. Otherwise the accept fails inside the transaction.
- An already-active member (`removedAt` null): the token is consumed and roles are left unchanged.
- Reactivating a removed member whose current roles include owner, when the invite would strip owner and no other active owner exists: the row comes back with its current roles (`keepCurrentRoles`).
- `approvedViaOrg` is set only when `approveTutor` changes a `WAITLISTED` row (`waitlistSkip`). An already-active approved tutor is not marked approved-via-org, because `approveTutor` updates only `WAITLISTED`.

The tests pin those behaviors: do not demote an owner (active member roles stay; last owner is not stripped on reactivation), do not trust a removed inviter, do not mark an already-active approved tutor as approved-via-org, and do not reveal whether an email has an account (same `invite_unavailable` for hit and miss).

Playwright covers the brand-new teacher path, revoke, and a removed inviter.

---

## 8. Login doors

Keep three account types. Do not add an Organization login, an Operator login, or one form that guesses PIN versus password.

The homepage Sign in menu stays three items. Tutor and organization staff share one account. Self learner / Parent is the second door. Child learner is username and PIN. Children reach it from the family dashboard or the session join.

After sign-in:

- A private tutor with no organization opens the student list.
- An owner, admin, or scheduler opens the organization home first (staff, learners, schedule). They do not land on the private-tutor student list and do not get tutor session chrome.
- An instructor opens the sessions they teach. Personal students stay on the student list. Organization sessions stay on the organization schedule.
- A person who both runs the org and teaches can reach both homes. Organization home first when they have owner, admin, or scheduler.

Tutor login and signup pages say this account is for private tutors and organization staff. Each adult login page links to the other adult door.

Operator access remains the email allowlist. The Operator link appears in the signed-in app for those emails. There is no operator item on the public menu.

A later merge of the two adult doors waits. Parents and tutors are different account systems today, and a public form that reacts to `name@family` would widen the roster-handle oracle (§ 9).

Org staff use the same account and two-factor gate as a tutor. An org owner is not the platform operator.

---

## 9. Security in this same branch

These holes are fixed on `feat/org-qol` before the branch is called ready. Each one gets a red-before / green-after test.

- **Tutor add cap (Andrew 2026-10-11).** A tutor may add 20 new students and send 30 claim emails a day. The current `pendingBeforeMint` check only counts pending invites on a student that already exists, so brand-new students bypass it. One counter, one place. The user-visible refusal is Playwright. The count rule is Jest.
- **Daily caps (Andrew 2026-10-11).** Counted per organization, all staff combined: 20 new learners, 30 claim emails, and 25 staff invites a day. Mynk can raise any of them, or set any of them unlimited, for that organization. Tutors keep their own caps: 20 new students and 30 claim emails a day. Review the numbers later. Org rows have `adminUserId` null, so the tutor counters do not cover them. The organization counters are separate. `dailyInviteCap` remains the staff-invite cap. Stage 3 adds the learner cap and the claim-email cap on `Organization`, beside `dailyInviteCap`, counted with `startOfZonedDay` in `Organization.timezone`. Null means unlimited, and only when the operator explicitly chooses it. Omitted on create stores the starting number. The user-visible refusal is Playwright. The count rule is Jest. An alert when an account or an organization reaches half a cap, or when bounces spike, is later instrumentation (`docs/BACKLOG.md`, CAP-BOUNCE-ALERTS). Detection is a later layer. The caps stay.
- **Roster handle oracle.** Creating a child by `username@familyid` must not tell the caller whether that handle exists in another family. Same response for hit and miss, plus a rate limit.
- **Session length.** An end time at or before the start is rejected. Today that input becomes about a 23-hour session. Org and personal booking use this one guard (§ 5).
- **Signup errors.** A failed confirmation email returns a generic sentence and must not include SMTP setting names. The leak is `mailed.error` in `src/app/signup/actions.ts` (the action returns `mailed.error` when it is set).
- **Live-session button.** When live sessions are off, Start is hidden and a LIVE start is refused on the server. In-person start stays allowed (§ 4.3).
- **Org invite cap.** Creating an organization sets a daily invite cap of 25. Unlimited is an explicit operator choice (§ 7.1).
- **Org invite accept.** Must not demote an owner, trust a removed inviter, mark an already-active tutor as approved-via-org, or reveal whether an email has an account (§ 7.3). The invite page's specific reasons (§ 7.2) must not add that oracle. Showing the invited email to the person who holds the link is required. A lookup that says "this email has no account" is not.
- **Env-admin.** `adminUserId` null must not mean the env-only admin owns the learner (§ 2.6).
- **Scheduler.** Short blocked reason only. Never parent email, consent toggles, or notes (§ 3).
- **Pending or suspended.** Cannot start a new session (§ 4.2). Org consent is required before the bridge opens the room.

Left out on purpose, and not this gate: the Playwright test routes already 404 in production. Retention automation stays unbuilt, and privacy copy keeps saying so. Operator impersonation across preview domains is not a tutor or org hole. The July recording backlog is not this gate.

---

## 10. Student detail page

Design accepted 2026-10-10, not built. The page is for doing sessions with that student. Stage 6 builds this. Do not paraphrase the accepted sentences below.

- The main page is one column. A critical-step card appears only when something blocks the next session, and Start is not offered while it is up.
- A session card shows one main button: Resume, Open room, or Start session, in that order. Upcoming sessions stay on the page.
- Two buttons leave the page: Notes, and Account & sharing. The section switcher is removed. Rename, Delete, and Outbox go in a header menu.
- Notes holds paste-a-note. Send update email becomes **Email a reminder**, a dialog on the Notes page. The dialog says the notes and replay are already in the family's account, and the email only reminds them.
- Record and Upload audio on the student page stay hidden and show as under construction / coming soon until they use the whiteboard chunking. Do not present them as a working recorder in this finish.
- Parent linking and the share link go to a new Account & sharing page. Share-link copy says the family signs in. It does not say the link works without an account.
- **Unset-up self learner card.** Shows when the tutor already has the student and that person has not finished their own account: "{name} needs to set up their account before you can start a session. Send the invite below. Once they accept and finish privacy preferences, Start session turns on." A child still gets the parent sentence. Today the page always shows the parent sentence, because it reads self-learner from a profile that does not exist yet. The invite's `inviteTargetKind` is where the page can learn it. That is the personal student page. Org staff choose "the student" or "their parent" (§ 2.3), and that choice is stored the same way. Before any invite has been sent, the card says (accepted 2026-10-11): "{name} needs an account before you can start a session. Send an invite below to {name}, or to their parent if {name} is a minor."
- **Coming-soon label** where Record and Upload were (accepted 2026-10-11): "Recording and uploading audio here is coming soon. For now, record during a whiteboard session."
- **Deletion card.** A tutor cannot start a data deletion and cannot stop one. The card only says the account is being deleted, sessions are off, and the date. No line asks the tutor to do anything, and it does not say "contact your operator." A parent or self-learner asks Mynk, and Mynk presses the button on the operator page.
- Disconnecting the family puts the setup card back. Delete student removes the row immediately and shows no card.

The setup cards are one card with different text. The parent and self-learner consent switches stay the one component from § 4.

Playwright covers: the main button order (Resume, Open room, Start session), Start hidden while a critical-step card is up, the self-learner and parent setup cards, the deletion card with no tutor action, Record and Upload shown as coming soon, and the Email a reminder dialog.

---

## 11. Logging

Prefix stays `[org]`, through the existing `orgLog` in `src/lib/org-scope.ts`: `[org] org=<id> action=<action>` plus ids. Never log a token or an email. A log-capture test fails if an `[org]` line contains a raw token or an `@`.

`actorLabel` logs a fixed operator marker, never an email. Slice 1 today can put an email in the line when the operator has no `AdminUser` row (`orgLog` actor: `operator.adminId ?? operator.email`). That stops.

New lines: `[org] action=force_end_deadline_set|pill_shown|end_it_now|activity_refused_after_deadline` with `wbsid`. `[cns]` org consent writes carry `org=<id>`. `[slc] wbsid=<id> action=session_ended path=org_force` for forced ends.

Write an `[org]` line for:

- membership changes (slice 1 already logs create, status, caps, invite create/revoke, member add/reactivate/remove, roles)
- scheduling for someone else (owner, admin, or scheduler creates, changes, or cancels an appointment for an instructor)
- metadata views (owner, admin, or scheduler opens the learner record)

The metadata-view line carries ids only. It cannot include parent email, because the scheduler loader does not select it (§ 3).

---

## 12. Explicitly not in this finish

- Guest or anonymous join links.
- An assignment table as the way a tutor owns a learner. Booking a different tutor next week is just another appointment.
- Per-tutor parent approval on top of signup consent.
- Org billing, org note prompts, a full-cutoff setting for removed tutors, and department hierarchy. When billing is built later, billing rows reference ids only, never names or emails (§ 2.7).
- Production Neon migration. Production waits for an explicit go. Andrew approved (2026-10-11) migrating the preview database once the local gates pass.
- A parent or self-learner button to request a data deletion or to stop one. They ask Mynk, and Mynk uses the operator page. In-app automation waits until that process is safe.

Also left out: Playwright test routes already 404 in production, retention automation, operator impersonation across preview domains, the July recording backlog, WB-RENAME-PERSIST, Actual vs Billable labels, Apple Calendar hardware, Stripe.

Org note prompts, a manual "what the org owes" ledger, a tutor-must-accept setting, billable-minute columns, and org staff opening boards stay out. Board-title persistence (`WB-RENAME-PERSIST`) stays a separate product call. Actual vs Billable labels stay parked until the Sarah conversation.

---

## 13. Stage map

Stages 2–7. Stage 1 is this document. Each stage is red-before / green-after, at the layer named here, then a Sonnet review (`claude-sonnet-5-5-high`, read-only) against the standards at the top of this file. A rejection blocks the stage. Jest for scope, consent, cap, and deadline decisions. Playwright for UI, session, and recording. Green Jest never proves UI or session behavior. New Playwright tests that touch whiteboard, sync, or session flows are tagged from `tests/test-tags.ts` and enrolled in `wb-regression`. There is no `@org` tag in that registry. Do not invent one in product code during a stage unless that stage also adds it to `tests/test-tags.ts` and the selector. Staff-only screens that never open a board still need Playwright. They are enrolled in `wb-regression` only when they touch whiteboard, sync, or session flows.

No duplicated services. The consent resolver, the session-access check, the env-admin helper, the name writer, and the deadline function each exist once. Components own their CSS. New screens are compositions of existing components and get an entry in `docs/V1-COMPONENT-LIBRARY.md`.

Stage 2 build starts only when Andrew says go. Stages 3, 5, and 7 are not waiting on an answer. Stage 4 still depends on stage 3. It needs the org Student, org ConsentRecord, and consent resolver that stage 3 builds.

Each stage handoff lists tested versus assumed per platform (desktop Chrome, iOS Safari, Android Chrome). The org claim page, invite page, and student pill are marked assumed on iOS Safari until real hardware.

### Stage 2 — Staff can use slice 1

Not started. Stage 2 build starts only when Andrew says go.

Prove: operator creates an org by owner email and gets a clear error when that person has no verified account; a new org stores daily invite cap 25; unlimited is stored only when the operator explicitly chooses it; invite email contains the org name and role; the invite page shows the org, the role, and the invited email; Sign in and Create account go to the teaching-account flow with that email prefilled and a return path that survives email confirmation; the wrong signed-in email gets a switch-account message; a holder sees a specific reason, not the generic unavailable page; activating the org lists waitlisted members for operator approval; scheduler and instructor cannot invite or set roles; the § 7.3 accept guards go red when removed.

Layer: Playwright for the brand-new teacher path, revoke, removed inviter, and the invite page. Jest for the cap (25 vs explicit unlimited) and the guard decisions. The invite page is marked assumed on iOS Safari until real hardware.

### Stage 3 — Learners, claim, consent, self-learner

Not waiting on an answer (Andrew 2026-10-11). Staff choose "the student" or "their parent" (§ 2.3). The reinvite goes through `mintStudentClaimInvite`. Do not add a second invite implementation. Do not refuse a self-learner.

Prove: one org `Student` (`organizationId` set, `adminUserId` null); the CHECK rejects both owners; `Student.organizationId` and `OrganizationLearner.organizationId` are `onDelete: Restrict`; one row per organization and learner profile, and the old tutor unique does not cover org rows; `writeOrgLearnerName` keeps `Student.name` in sync; the invite email is required, the same existing rule as `createStudent` (§ 2.3); claim is owner or admin, the page shows the organization name, and consent is stored on `ConsentRecord` for the org, not the minter; the second claim of a duplicate uses the proposed sentence in § 2.3; the parent editor lists the org by name and can edit and withdraw; a self-learner org learner accepts the general agreement and the four switches, and that consent is written to the org; a parent's consent on the child page is written to the org; the scheduler loader selects full name, brief, and a short blocked reason, and does not select parent email, toggles, or notes; the instructor sees notes, replay, audio, and transcript for sessions they taught and never receives parent email; env-admin listing requires both ids null, the caller's select includes `organizationId`, and the grep guard fails on a new inline Student-scope copy; the calendar callback route stays exempt; self-learner agreement checkbox and the four settings switches; the version-1 backfill in § 4.4; stage 3 seeds a pre-migration self-learner with no record and asserts recording still works and the off switch is honored; existing self-learners are not prompted; the self-learner skip in the audio check is gone; audio off matches § 4.4; the organization caps in § 9 refuse the 21st new learner, the 31st claim email, and count all staff together.

Layer: Jest for scope, the resolver, uniqueness, the caps, and the env-admin where. Playwright for the branded claim, the duplicate-claim message, and self-learner audio off (online voice excluded; in person nothing saved), enrolled in `wb-regression`, tagged from `tests/test-tags.ts` (`@wb-recording` at minimum). The org claim page is marked assumed on iOS Safari until real hardware.

Fragile: step back, then Sonnet review, before changing `resolveModeAwareAudioRecordingConsent` and the recording path.

### Stage 4 — Booking calls the bridge

Depends on stage 3. It needs the org Student, org ConsentRecord, and consent resolver that stage 3 builds. The stage 4 handoff lists every direct `assertOwnsStudent` caller and states fail-closed or org-aware for each. `openScheduledWhiteboardSession`'s `assertOwnsStudent(owned.studentId)` is replaced for org rows, not supplemented.

Prove: owner, admin, or scheduler can create, change, and cancel an appointment for an org learner and one current approved instructor; no personal `Student` is created for that instructor; Google event is the instructor's or skipped; calendar titles that show a first name use `OrganizationLearner.givenName` for org rows; overlap warns from `startAt` and `endAt`; the org week is `Organization.timezone`; `resolveOrgSessionAccess` lets that instructor open the workspace, start, end, upload, and write notes while they are an active member; for org rows the student layout admits only the workspace and notes routes the instructor needs; `getOrCreateWhiteboardForSchedule`, `createWhiteboardSessionCore`, and `startWhiteboardSession` use `resolveRecordedConsent` and re-check that the org is `active` and the instructor is still an approved member, in one transaction under the existing `lockOrg` row lock with the PENDING→ACTIVE `updateMany`; personal appointments keep today's owner and consent checks; a LIVE start is refused when live sessions are off and the button is hidden; in-person start stays allowed; an end time at or before the start is rejected (§ 9).

Layer: Jest for the bridge decision and the consent re-check. Playwright for booking and for both sides joining, enrolled in `wb-regression`.

### Stage 5 — Removal and suspension

Not waiting on an answer (Andrew 2026-10-11). No new background job (§ 6.1). The remover's warning and the operator suspending the organization offer the same three choices (§ 6.2). The operator's default when suspending is Let it finish.

Prove: removing a member cancels their future org appointments, including the Google event; read-only after removal applies to ended sessions, with the notes window in § 6.2; Let it finish keeps a session with `endedAt` null writable for upload and `endWhiteboardSession` until its § 6 deadline; End it now and no notes is read-only for the tutor immediately, and uploads already on their way still land; the proposed choice-3 warning is the sentence in § 6.2; a tutor who may finalize has 7 days, and this stage tests that the window is `endedAt` plus 7 days; `revokeOrgGrantedApprovals` does not cut a session already live; personal students are unchanged; for org-forced ends, `wb-asset` and checkpoint keep accepting that session's uploads for the stated window after `endedAt`, and a Playwright test proves the instructor's pending outbox lands after End it now; the two removal pill sentences in § 6.2 are used as written; the suspension display string stays the proposed sentence in § 6.2 until Andrew accepts it; suspension uses the same three choices as removal, the operator's default when suspending is Let it finish, and End it now and no notes has no finalize window; suspension and not-yet-approved use `statusChangedAt` and the same deadline; the clock hour is the one containing `storedAt`; five minutes left in that hour yields 10 minutes; the deadline is a fixed absolute instant; Jest covers a half-hour-offset zone and a DST-change day; the server refuses new activity after the deadline; the first server touch after the deadline marks the room ended through the single end-session core; a room nobody touches is not ended by a job; the deadline and removal state reach both clients on an existing per-session poll route, not the sync wire; Start racing suspension is tested, and a double-submitted removal is idempotent; while the org is suspended, upcoming rows say unavailable; the pill is additive chrome and does not rewrite `WhiteboardWorkspaceClient` engine behavior.

Layer: Jest for `orgForceEndDeadline`. Playwright for the suspension pill, the removal pills, the three-choice warning, read-only after an ended session, the outbox landing after End it now, and End it now with no notes, enrolled in `wb-regression` (`@wb-chrome` for the pill, plus a session tag for the force-end). The student pill is marked assumed on iOS Safari until real hardware.

### Stage 6 — Student detail page

Prove the accepted redesign in § 10, including the exact card sentences.

Layer: Playwright for the main button order, Start hidden while a critical-step card is up, the self-learner and parent setup cards, the deletion card with no tutor action, Record and Upload shown as coming soon, and the Email a reminder dialog.

### Stage 7 — Honesty, erasure, and the gate

Not waiting on an answer (Andrew 2026-10-11). Consent rows are kept. The side-table row is deleted. The fingerprint and the three guards are § 2.7. Privacy and terms must be accurate for both children and self-learners. The consent sentence is proposed, not accepted. Andrew reviews it before it is applied to the pages. The sentence is in § 14 and in the stage 1 handoff.

Prove: the accepted copy in the plan is applied as written (§ 14); the proposed privacy sentence in § 2.7 is listed for Andrew and is not treated as accepted; privacy and terms say an organization owner, admin, and scheduler can see learners they did not personally teach, and that the organization enters the learner; the consent sentence is proposed and Andrew reviews it before it is applied to the pages: "Consent is recorded in a Mynk account before any session. A parent records it for a child. A self-learner records it for themselves."; they do not claim a self-serve org signup, guest rooms, a cutoff switch, or retention automation; `docs/LEGAL-SYNC.md` is followed; erasure at `/admin/erasure` deletes the org learner side table, keeps the consent row, clears free text by ownership, and stores the fingerprint (§ 2.7); guards 1, 2, and 3 are green; the outside-database inventory is written, today's outbox emails and Google events are checked, and unresolved items are added to the counsel list; the new environment variable is added to `docs/PLATFORM-ASSUMPTIONS.md` in this stage's commit; the § 9 holes that are not already proved in stages 2–4 are green (tutor 20/30 caps, organization caps, roster-handle oracle, signup SMTP leak).

Layer: integration test for org-learner erasure, including guards 2 and 3. Jest for the column registry (guard 1). Playwright for the first-session walk below. Sonnet verification of tests-to-spec, soundness, and no duplication before the branch is called ready. Merge to master still waits for the full gate (`test:wb-sync`, `test:regression`, `npx next build`) and Andrew's smoke. Preview database migration is a separate go from production.

**One Playwright walk** of the first real session, one test, enrolled in `wb-regression`, tagged from `tests/test-tags.ts`. Authored once stages 2–5 exist. It is part of the stage 7 gate:

create org, new teacher accepts, learner added, parent consents, scheduler books, both sides join, board and audio record, session ends, instructor sees the note, scheduler does not, removal is read-only, suspension shows the pill.

---

## 14. Copy applied later

Stage 7 applies the accepted sentence list in the org-sales finish plan (homepage, features, signup, child sign-in, privacy, terms, and the "kept as is" notes). This design points at that plan for those sentences and does not reword them. Nothing is applied until that stage. Nothing is removed without Andrew's explicit yes on that sentence. Follow `docs/LEGAL-SYNC.md`. Bump "Last updated" and the classification tables the way the plan describes.

New UI strings that are not already decided get written plainly at build time and listed in the handoff so Andrew can review them before his smoke. That includes organization home, staff invites, the invite page, booking, the remover's warning, the scheduler's blocked reasons beyond the two examples in § 3, and the login-page line for private tutors and organization staff.

Exact sentences already in this design and the plan are used as written. That includes the two accepted removal pills (§ 6.2), the student-page cards (§ 10), the self-learner agreement and audio help text (§ 4.4), and the plan's marketing and legal sentences.

These sentences are proposed for Andrew's review. They are not accepted quotes.

- Suspension pill: "This session will end soon because the organization that set up this tutoring has had its account suspended."
- End it now, no notes: "No notes will come from this session. Once billing starts, this session's time still counts toward your organization's billed time."
- Duplicate claim: "This student is already set up with this organization. Ask the organization to remove the extra entry."
- Privacy, after deletion: "After an account is deleted, we keep a record of the consent choices that were made and a one-way fingerprint of the account email, so we can answer questions about consent later. The fingerprint cannot be turned back into the email."
- Consent, proposed. Andrew reviews it before it is applied to the privacy and terms pages: "Consent is recorded in a Mynk account before any session. A parent records it for a child. A self-learner records it for themselves."

When the organization screens exist, the legal wave also revisits: independent-tutor positioning, "a tutor only sees their own students" in the privacy security list, and "helps private tutors" in "What Mynk is." Those follow the same one-sentence-at-a-time approval before master.

---

## Appendix — do not build

The previous body of this file, and the Q1–Q8 default table that § 0 superseded, are not build instructions. They were removed in this rewrite. Do not build:

- assignments (`OrganizationLearnerAssignment`, assignment end, reassign, flagged-because-unassigned)
- guest passes, guest codes, guest admit, guest upgrade
- per-tutor parent approval
- `OrganizationConsentRecord` as a separate table
- a tutor-must-accept flag

The plan's "Explicitly not in this finish" is § 12. Where this appendix and § 12 overlap, § 12 is the list.
