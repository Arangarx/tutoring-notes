# Org sales stage 3 handoff

Branch: `feat/org-qol` at `0dfcdec1` plus uncommitted stage 3 work. Not committed. Not pushed.

## Ad-hoc session list

**New for Andrew.** A tutor start with no appointment ahead of time, for a personal student (the student's `adminUserId` is that tutor), writes one `ScheduledSession` and points the whiteboard row at it. The parent list and the child list already read those rows, so the session shows immediately. There is no Google Calendar write, no invite email, and no second list.

The subject stored on that row is exactly: "Tutoring session."

Organization-owned students (`organizationId` set, `adminUserId` null) are unchanged. This does not add an organization booking path. A start that is already linked to a `ScheduledSession` does not create another one. If creating the whiteboard throws because there is no consent record, the ad-hoc `ScheduledSession` is deleted.

Reds (`src/__tests__/whiteboard/adhoc-scheduled-session.integration.test.ts`):

- Personal student, before the insert: expected length 1, received 0.
- Organization-owned student. Removing only `organizationId != null` stayed green: a null `adminUserId` still returned no row (expected length 0, received 0). Removing the rest of that early return, so a null owner was no longer skipped, inserted a row and linked the whiteboard to it. Expected length 0, received 1. That row's id was `17a7d3ea-d3e1-4e9c-bc44-b5dc3e52b76f`. The guard is restored.
- Wall-clock `startTime` and `endTime` stored as empty strings: expected startTime not `""`, received `""`.
- Missing consent, with the rollback delete removed: the `ScheduledSession` remained. Expected length 0, received 1. The delete is restored.

## What was built

- One organization-owned `Student`: `organizationId` set, `adminUserId` null. `student_single_owner` forbids both owners and allows both null (env-admin).
- `OrganizationLearner`: given name, family name, one brief. Parent email stays on `Student.parentEmail`. Unique `(organizationId, learnerProfileId)`. `onDelete: Restrict` on both organization foreign keys. No assignment table, no guest tokens, no `OrganizationConsentRecord`.
- `writeOrgLearnerName` keeps `Student.name` equal to the trimmed given name, a space, and the trimmed family name. Claim display-name setup and tutor rename do not write that name when the student belongs to an organization.
- `ConsentRecord.organizationId`. Exactly one of tutor `adminUserId` or `organizationId`. Both null is rejected. Partial unique indexes for tutor versions and organization versions. `createVersionedConsentRecord` accepts an organization key. Claim setup and the parent and self-learner settings write the organization, not the minting admin.
- Caps beside `dailyInviteCap`: learner cap 20 and claim-email cap 30 per organization, all staff combined. Omitted on create stores 20 and 30. Explicit null is unlimited. Existing null `dailyInviteCap` rows are not backfilled.
- `statusChangedAt` is set by `createOrganization` and moved by `setOrganizationStatus` only. `setOrganizationCaps` does not write it.
- Claim reuses `ClaimInterstitial`. The page shows the organization name and the child's name. Owner or admin mint through `createOrgLearner`, and reinvite goes through `mintStudentClaimInvite`. Same child already tied to the organization: one link, the spare unclaimed row is closed, no error, and `already_linked_to_tutor` is not shown. A different child, even with the same parent email, stays, and the first learner stays.
- Parent editor lists the organization by name and can edit and withdraw (all four switches off, then save). Parent and self-learner switches are `ConsentSwitches`.
- Every self-learner, org or not, sees the agreement checkbox on claim setup until a ConsentRecord exists. A presumed version-1 row is only the migration backfill for people who already exist. Settings show the agreement only when no tutor or organization version exists. Existing self-learners who already have a backfilled record are not prompted. The five recording readers still skip a self-learner with no record.
- Scheduler loader returns full name, brief, and a short blocked reason (`Waiting on the family` or `Live sessions are off`). It does not return parent email, toggles, or notes. Instructor loader returns sessions they taught (notes, replay, audio, transcript availability) and never parent email.
- Env-admin listing requires both owner ids null (`envOnlyNullOwnerWhere`). `EmailMessage` uses `envOnlyEmailMessageWhere` and does not reuse the student helper. The calendar callback route stays exempt. A grep guard fails on a new inline student-scope `adminUserId: null` that is not paired with `organizationId`.
- `resolveRecordedConsent` is appended for stage 4. The five recording readers do not call it.

## What was held

These five readers are not changed yet. The self-learner skip in the audio check is still there. No recording-path file was edited (lifecycle, outbox, mic, peer mesh). This pass does not prove that recording still works.

- `resolveModeAwareAudioRecordingConsent`
- `assertEffectiveConsent`
- `createSessionConsentSnapshot`
- `assertConsentRecordExists`
- `assertConsentFromLiveRecord`

## What stage 4 still has to open

The scheduler and instructor loaders exist, and an instructor who is not a member is denied. Stage 4 still has to open the workspace, notes, replay, audio, and transcript pages for sessions they taught, wire `resolveRecordedConsent` into those readers, and wire organization admission into booking and `openScheduledWhiteboardSession`. This pass did not start that.

## How the local databases were updated

`prisma db push` on `postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes_test` and `tutoring_notes_org_test`, then `node scripts/apply-org-learner-guards.cjs`. The script reads the two CHECK constraints and the two partial unique indexes from `prisma/migrations/20261011130000_org_learner/migration.sql` and applies those statements. It does not execute the rest of the file. Jest's global setup does that reset. It was not run against Neon. The Playwright harness database `tutoring_notes` on `127.0.0.1` is pushed by the existing webServer command, which also runs the guards script.

The full migration file was run once against a scratch database that was at the pre-stage-3 schema. Database: `tutoring_notes_stage3_scratch` on local Docker Postgres `127.0.0.1:5432` (container `tutoring-notes-postgres-1`). `prisma migrate deploy` applied the 56 migrations through `20261007180000_org_membership_invites` while `20261011130000_org_learner` was held aside, then that folder was put back and the file was executed with `psql`. Datasource host was `127.0.0.1`. `INSERT 0 0` (the scratch database had no self-learners). `student_single_owner` and `consent_record_single_owner` are installed. `ConsentRecord_learnerProfileId_adminUserId_version_key` is still there, plus `ConsentRecord_tutor_version_key` and `ConsentRecord_org_version_key`.

The same INSERT was also executed twice by the Jest backfill test on `tutoring_notes_org_test`, against a seeded self-learner with no consent row. Tombstoned and org rows were skipped. The second run inserted nothing.

## Migration SQL

```sql
-- Stage 3 org learners. Additive. Do not run against Neon.
-- Student may have a tutor owner, an organization owner, or neither (env-admin).
-- Not both. ConsentRecord must have exactly one owner. Both-null is rejected there.
-- dailyInviteCap nulls are left alone. They stay unlimited.

ALTER TABLE "Student" ADD COLUMN "organizationId" TEXT;

ALTER TABLE "Student"
  ADD CONSTRAINT "Student_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Student_organizationId_learnerProfileId_key"
  ON "Student"("organizationId", "learnerProfileId");

CREATE INDEX "Student_organizationId_idx" ON "Student"("organizationId");

ALTER TABLE "Student" ADD CONSTRAINT student_single_owner
  CHECK (NOT ("adminUserId" IS NOT NULL AND "organizationId" IS NOT NULL));

CREATE TABLE "OrganizationLearner" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "givenName" TEXT NOT NULL,
  "familyName" TEXT NOT NULL,
  "brief" TEXT NOT NULL DEFAULT '',
  "createdByAdminUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationLearner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationLearner_studentId_key" ON "OrganizationLearner"("studentId");
CREATE INDEX "OrganizationLearner_organizationId_idx" ON "OrganizationLearner"("organizationId");

ALTER TABLE "OrganizationLearner"
  ADD CONSTRAINT "OrganizationLearner_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationLearner"
  ADD CONSTRAINT "OrganizationLearner_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrganizationLearner"
  ADD CONSTRAINT "OrganizationLearner_createdByAdminUserId_fkey"
  FOREIGN KEY ("createdByAdminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Organization" ADD COLUMN "dailyLearnerCap" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "dailyClaimEmailCap" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "statusChangedAt" TIMESTAMP(3);

UPDATE "Organization" SET "dailyLearnerCap" = 20 WHERE "dailyLearnerCap" IS NULL;
UPDATE "Organization" SET "dailyClaimEmailCap" = 30 WHERE "dailyClaimEmailCap" IS NULL;
UPDATE "Organization" SET "statusChangedAt" = "createdAt" WHERE "statusChangedAt" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "statusChangedAt" SET NOT NULL;
ALTER TABLE "Organization" ALTER COLUMN "statusChangedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ConsentRecord" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ConsentRecord" ALTER COLUMN "adminUserId" DROP NOT NULL;

ALTER TABLE "ConsentRecord"
  ADD CONSTRAINT "ConsentRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsentRecord" ADD CONSTRAINT consent_record_single_owner
  CHECK (
    ("adminUserId" IS NOT NULL AND "organizationId" IS NULL)
    OR
    ("adminUserId" IS NULL AND "organizationId" IS NOT NULL)
  );

-- The tutor unique index from 20260611010000 stays. It is an index, not a
-- table constraint, and null adminUserId does not collide in Postgres.
-- The partial indexes below are the org-or-tutor rule Prisma cannot express.

CREATE UNIQUE INDEX "ConsentRecord_tutor_version_key"
  ON "ConsentRecord" ("learnerProfileId", "adminUserId", "version")
  WHERE "adminUserId" IS NOT NULL;

CREATE UNIQUE INDEX "ConsentRecord_org_version_key"
  ON "ConsentRecord" ("learnerProfileId", "organizationId", "version")
  WHERE "organizationId" IS NOT NULL;

CREATE INDEX "ConsentRecord_learnerProfileId_organizationId_idx"
  ON "ConsentRecord"("learnerProfileId", "organizationId");

-- Version-1 consent for existing self-learner tutor links that have no record.
-- All four toggles true. setByAccountHolderId is the profile's account holder.
-- captureMethod presumed: not a ticked form. Org links do not exist yet.
INSERT INTO "ConsentRecord" (
  "id",
  "learnerProfileId",
  "adminUserId",
  "organizationId",
  "version",
  "allowLiveSession",
  "allowAudioRecording",
  "allowWhiteboardRecording",
  "allowNoteSending",
  "setByAccountHolderId",
  "captureMethod",
  "setAt"
)
SELECT
  gen_random_uuid()::text,
  lp."id",
  s."adminUserId",
  NULL,
  1,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  lp."accountHolderId",
  'presumed',
  CURRENT_TIMESTAMP
FROM "LearnerProfile" lp
JOIN "Student" s ON s."learnerProfileId" = lp."id"
WHERE lp."isSelfLearner" = TRUE
  AND lp."tombstonedAt" IS NULL
  AND s."adminUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ConsentRecord" cr
    WHERE cr."learnerProfileId" = lp."id"
      AND cr."adminUserId" = s."adminUserId"
  );
```

## Review fixes

- `SelfLearnerConsentSettings` accepts the tutor and organization field names the settings page already passes. `npx tsc --noEmit` is clean for the files this pass touched. Remaining tsc errors are in unrelated files (design-system page, ical namespace, whiteboard fixtures, email OTP, mic acquire).
- `@@unique([learnerProfileId, adminUserId, version])` is back, so Prisma still exposes `learnerProfileId_adminUserId_version`. The four callers were not edited. Partial unique indexes stay. The migration, `scripts/apply-org-learner-guards.cjs`, and the SQL in this file no longer `DROP CONSTRAINT` that name. `20260611010000` created a unique index, not a constraint, and this pass keeps the index.
- One consent writer (`saveConsentForActor`). One four-flag map. One switch list (`CONSENT_SWITCHES`). One agreement checkbox (`SelfLearnerAgreement`). Claim setup uses `consentOwnerForInvite` (`invite.adminUserId` when there is no organization). Org invite audience uses `ui/radio-group.tsx`.
- Every self-learner is prompted until a `ConsentRecord` exists. `consent_decline` writes an all-off electronic row for them. The five held readers in `src/lib/consent-scope.ts` were not edited.
- `docs/handoff/org-learner-design.md` stage 3 Layer line no longer says "the duplicate-claim message". No replacement error sentence was added.

## Tests run and results

Jest and Playwright were not run at the same time. Playwright used `--workers=1` and only `tests/integration/identity/org-learner-claim.spec.ts`. `test:wb-sync` and the full regression suite were not run. Nothing was committed or pushed. Neon was not used.

- `npx jest --runInBand` on `src/__tests__/identity/claim-setup-page.test.tsx`, `claim-setup-consent-decline.test.ts`, `claim-setup-consent-save.test.ts`, and `src/__tests__/account/ParentConsentEditor.dom.test.tsx`: 28 passed, then the withdraw test passed after clearing the mock (it had counted a call from an earlier test). Database: `tutoring_notes_test`.
- `npx jest --runInBand src/__tests__/org/org-learner.integration.test.ts` with `TEST_DATABASE_URL` pointed at `postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes_org_test` and `ADMIN_EMAIL=org-operator@example.com`: 18 passed. That includes the backfill INSERT, `createOrgLearner`, role refusals, caps, reinvite, scheduler and instructor loaders, the org consent write, and the env-admin where.
- `npx tsc --noEmit`: no errors in the files this pass touched. Exit code 2 from the unrelated files listed above.
- `npx next build`: exit 0.
- `npx playwright test tests/integration/identity/org-learner-claim.spec.ts --project=wb-regression --workers=1`: 4 passed (auth setup plus the three claim tests, including picking a different existing child). Local database `tutoring_notes` on `127.0.0.1`.

The claim spec is enrolled in the `wb-regression` `testMatch` list. Tag is `@wb-presence` from `tests/test-tags.ts`. There is no organization tag in that registry, and none was added. `@wb-recording` would name the held audio proof, which this pass does not run.

## Reds that were proved

Each break was restored before the green run. A timing failure is not listed.

- Claim spec, before spare close deleted the row. Removed `tx.student.delete` in the already-linked branch of `src/app/api/claim/[token]/complete/route.ts` and left the success return. Expected `spare` to be null. Received `{"id":"5c1ace27-dad3-4364-baa0-21d802fca782"}` at `org-learner-claim.spec.ts:53`, after the page had reached `/account/children/{profile}`. Retry received a different id, same assertion.
- Self-learner agreement, before the setup page treated a missing record as incomplete. Expected `self-learner-agreement`. Received the panel "As an adult managing your own learning, parental privacy preferences do not apply." and a dashboard link. With a record already saved, expected `consent-saved-indicator`. Received that same panel and no saved indicator. `consent_decline` for a non-org self-learner expected `skipped` undefined and version 1. Received `skipped: true`.
- Student CHECK. Removed `ALTER TABLE "Student" ADD CONSTRAINT student_single_owner ...` from `scripts/apply-org-learner-guards.cjs` and left the `DROP`. Expected `pg_constraint` length 1 for `student_single_owner`. Received length 0, `[]`. After the ADD was restored, the both-owners insert failed with `23514` / `student_single_owner`.
- Env-admin guard. `envOnlyNullOwnerWhere` temporarily returned only `adminUserId: null`. Expected the env-named row only. Received both `"env-scope-1791750581934-shb4sq env"` and `"env-scope-1791750581934-shb4sq org"`.
- Scheduler loader. Temporarily returned `Student.name`. Expected `"Cara Lane"`. Received `"Should not be the card name"`.
- Instructor loader. Temporarily put `parentEmail` on the result. Expected the JSON not to contain the parent-email marker. Received `"{\"fullName\":\"Drew Cole\",\"parentEmail\":\"instructor-secret-1791750610529-jcgw6n@test.local\",\"sessions\":[]}"`.
- Name writer. Temporarily stored `"Old Name"` instead of the composed name. Expected `"Bea West"`. Received `"Old Name"`.
- Consent write. Temporarily stored the opposite of `allowAudioRecording`. Expected `false`. Received `true`. The owner equality (`adminUserId` null, `organizationId` set) had already passed on that run.

## Existing tests changed and why

- `src/__tests__/account/ParentConsentEditor.dom.test.tsx`: the two "does not render" cases now require the notes and whiteboard switches. Stage 3 shows all four. Save expectations include `organizations: []` because the editor always sends that list.
- `src/__tests__/account/ConsentSetupForm.dom.test.tsx`: the two "does not render" cases now require the same four switches. A `useRouter` mock was added so jsdom can render the form. The save and decline assertions are unchanged.
- `docs/handoff/org-learner-design.md`: the stage 3 Layer line no longer says "the duplicate-claim message". No replacement sentence was added.

## New UI strings

The first review pass added no new UI strings. The second review pass added the self-learner decline sentences below.

Restored, not new. They were already accepted on the parent editor and are inputs on `CONSENT_SWITCHES`. The recommended sentence still shows on claim setup and self-learner settings. The scheduling sentence shows on those surfaces only when live sessions are off:

- Without live sessions, Mynk is effectively just a scheduling calendar — your child cannot join tutoring on the whiteboard. You can decline, but there is little reason to use the app if this stays off.
- You can turn this off, but most families keep it on so sessions are useful after class ends.

Original stage 3 strings, unchanged by this review pass:

Accepted, used as written:

- I agree that my tutoring sessions may be recorded — the shared whiteboard and the audio — and that Mynk drafts session notes from them. I can turn any of this off later in Settings.
- Off means your voice is left out of the saved recording. Online, your tutor's microphone can still be saved. In person, nothing is saved.
- The student
- Their parent
- A valid email address is required.

New, for Andrew to review:

- Consent has not been given yet. You cannot join a session until you give consent. Open Manage, then Privacy.
- Consent has not been given yet. You cannot join a session until you give consent, including the live tutoring session you have already been invited to. Open Manage, then Privacy.
- {organization} invited you to connect {child}'s tutoring account.
- Choose who to connect as a learner for {organization}.
- What each organization may do
- These choices are for the organization, not for an individual tutor.
- Withdraw consent
- Check the agreement before saving.
- Allow whiteboard recording
- The shared whiteboard can be saved and replayed.
- Allow session notes
- Mynk can draft session notes from the session.
- This organization has reached its learner limit for today.
- This organization has reached its claim email limit for today.
- The brief is too long.
- This learner is already connected.
- That learner is not in this organization.
- Members, invitations, and learners.
- Add a learner and send the claim email.
- Name, brief, and whether a session can be booked.
- Send the claim email to
- Add learner
- Send the claim email again
- Given name
- Family name
- Brief
- Email
- Waiting on the family
- Live sessions are off
- Session recording
- Save preferences

## Second review fixes

- `tests/integration/identity/org-learner-panel.spec.ts` is an identity-e2e spec (not a session, so not wb-regression). An owner adds a learner and sees that parent email on the record. A scheduler sees the card and the waiting sentence, and the parent email is absent. A second add shows "This organization has reached its learner limit for today." No `@org` tag.
- `CONSENT_DECLINE_WARNING.selfLearner` is the plain decline sentence above. `selfLearnerPending` is the already-invited sentence, parallel to the parent pending warning, and it does not say "your child". Claim setup uses them when `showAgreement` is set. The `!enforcementEnabled` hint still reads "You can also save these preferences later from your account dashboard." It does not say child, so it was left as written.
- The live-session scheduling sentence renders only when that switch is the critical one and live sessions are off. The recommended sentence still renders. Both still appear when live sessions are off.
- `scripts/apply-org-learner-guards.cjs` no longer contains its own copy of the CHECK and partial-index SQL. It reads those four statements from the migration file. Running the whole migration on every Jest and Playwright startup is unsafe: `prisma db push` has already created the columns, tables, and ordinary indexes, and the file's `ADD COLUMN`, `CREATE TABLE`, and `CREATE INDEX` statements are not written to be repeated. The self-learner backfill INSERT stays in the migration file and is not run by the script. The script still drops each constraint first and adds `IF NOT EXISTS` on the partial indexes so a second local run does not fail.
- The unused `OrgLearnerError` binding in the `try` of `createOrgLearnerAction` and `reinviteOrgLearnerAction` is gone. The `catch` still uses it.

## Second review tests

Jest and Playwright were not run at the same time. Playwright used `--workers=1` and only `tests/integration/identity/org-learner-panel.spec.ts` on the `identity-e2e` project. `test:wb-sync` and the full regression suite were not run. Nothing was committed or pushed. Neon was not used.

Reds, then the fix, then green:

- Live-session sentence while live was on. Before `ConsentSwitches` gated the banner, `ParentConsentEditor` "hides the live-session sentence while live sessions are on" and `SelfLearnerConsentSettings` "renders the tutor and saves the four flags" both found the scheduling sentence. After the gate, those two files plus `ConsentSetupForm.dom.test.tsx`: 24 passed. The off state still shows the scheduling sentence and the recommended sentence.
- Learner cap sentence. The panel spec expected "This organization has reached its learner limit for today." while `learner_cap` returned "CAP SENTENCE HIDDEN". The alert showed "CAP SENTENCE HIDDEN". After the sentence was restored, the spec passed: auth setup plus the panel test, 2 passed. Local database `tutoring_notes` on `127.0.0.1`.
