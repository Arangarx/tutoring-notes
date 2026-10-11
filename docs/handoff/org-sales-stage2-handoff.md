# Org sales stage 2 — handoff

Branch: `feat/org-qol`. Uncommitted. Not pushed. Stage 2 is not called done. A separate Sonnet review comes after this.

Local databases only. `prisma db push --force-reset` ran against `tutoring_notes_org_test` and, for the nav and email-confirm Jest files, against `tutoring_notes_test`. The identity Playwright server ran its existing `prisma db push --skip-generate --accept-data-loss` against the local harness database. No production Neon. No learner-table migration. No Sarah or Tyson emails.

## New UI strings — Andrew's review

These are the new sentences and labels. They are written plainly. The design did not pick the wording except the starting cap of 25 and the role names.

### Operator create

- Organizations
- Create an organization for a teacher who already has a verified account.
- New organization
- Organization name
- Owner email
- Create organization
- Existing organizations
- No organizations yet.
- The list under each name is the stored status word: pending, active, or suspended.

### Errors

- That person does not have a verified teaching account.
- Test accounts cannot own an organization.
- Enter an organization name.
- You cannot assign that role.
- Choose at least one role.
- This organization needs an owner.
- That person is already in this organization.
- This organization has reached its invite limit for today.
- This organization is full.
- That person is not in this organization.
- The invitation email could not be sent. Try again.
- Enter a daily invite limit, or choose no daily limit.
- That did not work. Try again.

### Status, cap, and activation

- Operator controls for this organization.
- Status
- Activation and the daily invite limit.
- This organization is pending. An operator activates it before new teachers are approved.
- This organization is active.
- This organization is suspended.
- Staff can send 25 invitations a day.
- Staff invitations are not limited per day.
- No daily limit
- Daily invite limit
- Save invite limit
- Activate organization
- Waiting for approval
- These people joined while the organization was pending. Activating the organization does not approve them.
- No one is waiting for approval.
- Approve and Reject are the existing tutor-approval buttons.

### Staff home

- Organization
- Members, invitations, and activation for organizations you run.
- Your organizations
- `{status}. Your roles: {Owner, Admin, Scheduler, or Instructor}.`
- Members and invitations. Learners and the schedule are not on this page.
- Members
- Invitations
- Owner and admin can invite. Scheduler and instructor cannot.
- No invitations are waiting.
- Email
- Roles
- Send invitation
- Revoke invitation
- Save roles
- Remove from organization
- Nav labels: Organization (staff home), Organizations (operator list).

### Invite page

- Organization invitation
- You are invited to join {organization name}.
- Organization
- Role
- Invited email
- Sign in
- Create account
- Sign out
- Accept invitation
- You are signed in as {signed-in email}. This invitation is for {invited email}. Sign out, then sign in with the invited email.
- This invitation has expired.
- This invitation was revoked.
- This invitation has already been used.

The generic unavailable page was already there and was not rewritten: "Invitation unavailable" and "This invitation can't be accepted."

### Invite email

- Subject: Invitation to {organization name}
- Body: You are invited to {organization name} as {Owner, Admin, Scheduler, or Instructor}. Open this link to respond: {url} If you were not expecting this invitation, you can ignore this email.

Role words, in stored order, comma-separated: Owner, Admin, Scheduler, Instructor.

### Login and signup

- This account is for private tutors and organization staff.

### Log marker

`[org]` lines use `actor=operator` when the operator has no admin id. The line does not contain an email. `createdByOperatorId` still stores that email when there is no admin row.

## Tests

### Jest — `src/__tests__/org/org-slice1.integration.test.ts`

Red before the cap change (previous turn, same branch, before `dailyInviteCap` defaulted to 25): "stores the operator admin id, defaults status to pending, and does not grant ADMIN" expected `dailyInviteCap` 25 and received null. "stores the operator email when that email has no admin row" expected the `[org]` line not to match `@` and received `actor=env-operator@example.com`.

Red when the removed-inviter guard was taken out (`inviter.removedAt == null` deleted, then restored): "does not trust a removed inviter" received `{ ok: true, refreshSession: true }` instead of `{ ok: false, error: "invite_unavailable" }`. Restored. Passed.

Red when the mail-failure revoke was taken out, then restored: "revokes the invitation when the email is not sent and does not show the mail error" received `revokedAt` null. The redirect was already `error=mail_failed` and did not include `smtp-host-down`. Restored. Passed.

Other new titles, green with the guards in place:

- stores unlimited only when the operator passes null, and leaves an existing null row unchanged
- refuses a scheduler or instructor who invites or sets roles
- does not mark an already-approved tutor as approved via the organization
- uses the same unavailable result whether or not the invited email has an account
- does not approve members who joined while the organization was pending
- resolves a verified owner and rejects a missing or unverified email the same way
- sends the organization name and role and does not log the token or the address

`src/__tests__/admin-email-verify.test.ts`: "tutor confirm link keeps a same-site return path". The mailed URL's `returnTo` is `/org-invite/abc123`.

Full org file after the cap and actor change: 38 passed. After the mail-failure test was added: that test passed on its own. The nav and email-confirm files together: 62 passed.

### Playwright — `tests/integration/identity/org-staff-invite.spec.ts`

Project `identity-e2e`, workers 1. Not in `wb-regression`. No `@org` tag. Desktop Chrome.

- operator sees one sentence when the owner has no verified account
- a brand-new teacher confirms email and accepts the invitation
- an existing teacher sees both doors, the wrong-account message, then the staff home without an invite form
- revoking an invitation shows the revoked reason to the holder
- a removed inviter cannot complete the invitation
- activating lists people who joined while pending and does not approve them
- expired and already-used invitations read the same with or without an account

First full run: 5 passed, 3 failed. Those three failures were the test, not a missing screen: the Scheduler checkbox matched two controls, the unavailable title is not a heading, Approve refreshes the page so the row leaves the list, and two-factor verification returns to `/admin/students` instead of the organization URL. After those assertions were corrected, the file passed: 8 passed (setup plus the 7 tests).

iOS Safari for the invite page is assumed until hardware. Desktop Chrome is what Playwright ran.

## Existing tests changed, and why

- "stores the operator admin id, defaults status to pending, and does not grant ADMIN" — `dailyInviteCap` expectation changed from null to 25. Omitted now stores 25. The assertion uses the number 25, not an imported constant.
- "stores the operator email when that email has no admin row" — `createdByOperatorId` is still the operator email. The `[org]` log must not contain `@` and must contain `actor=operator`.
- `src/__tests__/lib/admin-nav-links.test.ts` operator link lists now include `{ href: "/admin/orgs", label: "Organizations" }`. New test: "adds Organization for staff home and leaves it off otherwise".

No existing test was deleted or loosened.

## Commands

- `npx jest src/__tests__/org/org-slice1.integration.test.ts --no-coverage` with `TEST_DATABASE_URL` on local `tutoring_notes_org_test`: 38 passed.
- Same file, `-t "does not trust a removed inviter"`, guard removed: failed (`ok: true`). Guard restored: 1 passed.
- `npx jest src/__tests__/lib/admin-nav-links.test.ts src/__tests__/admin-email-verify.test.ts --no-coverage` on local `tutoring_notes_test`: 62 passed.
- `npx playwright test tests/integration/identity/org-staff-invite.spec.ts --project=identity-e2e --workers=1`: first run 5 passed, 3 failed; final run 8 passed.
- Mail-failure test with the revoke removed: failed (`revokedAt` null). Restored: 1 passed.
- `npx next build`: exit 0. Pre-existing lint warnings only.

Did not run `test:wb-sync` or the full regression suite. Jest and Playwright did not run at the same time.

## Not built

- Learners, the schedule, and the student detail page.
- Stage 3: no org Student, no `ConsentRecord.organizationId`, no learner create.
- There is no visible member-cap field. Saving the daily invite limit keeps the current `maxMembers` value.

## Review fixes

These were rejected, then fixed, then accepted by the re-review. They are in the stage 2 commit. No migration. The token row still does not store `returnTo`.

### New sentence

This account is for private tutors and organization staff.

It is on the login form and the signup form.

### Sign-in landing

An owner, admin, or scheduler opens the organization staff home after sign-in, including after two-factor. One organization opens `/admin/organization/{id}` (members and invitations). More than one opens `/admin/organization`. A private tutor with no organization opens `/admin/students`. An instructor who is not also owner, admin, or scheduler opens `/admin/students`. The `/admin` page chooses that path. Middleware no longer sends every tutor to the student list, because it cannot see organization roles.

`expectTutorAuthedLanding` waits for `/admin/students`. The sign-in landing test starts at `/login` with no callback query, so the form's default callback is `/admin`. After the two-factor code it asserts the exact path `/admin/organization/{id}` for a scheduler with an active membership, and `/admin/students` for an instructor-only member. After a scheduler invitation is sent, that invites-list row shows Scheduler and does not show Instructor. After acceptance, that member row shows Scheduler.

Red when `staffHomeLandingPath` returned null for everyone: "opens the staff home for owner, admin, or scheduler, and the student list otherwise" expected `/admin/organization/{id}` and received null. Restored. Passed.

### Confirmation resend

The resend form, the resend route, and `resendTutorSignupVerifyEmail` pass `returnTo` through `safeRelativeReturnPath`. A failed confirm link keeps that path on the retry page. Signup puts the same path on the confirm page.

Red before the pass-through: "resend of the tutor confirmation keeps a sanitized return path" expected `/org-invite/abc123` and received null. Restored. Passed.

### Return-path guard

`src/__tests__/lib/safe-return-path.test.ts` rejects `//host`, `/\host`, `https://…`, and the same shapes. Red when the function returned the trimmed string: expected null and received `//host`. Restored. Passed.

### Daily invite limit form

`saveOrganizationCapsAction`: "No daily limit" stores null. `12` stores 12. Blank, `0`, `nope`, `-3`, and `1.5` redirect with `error=invalid_cap` and leave 12 in place.

Red when the `invalid_cap` check was removed: expected `error=invalid_cap` and received `error=daily_invite_cap`. Restored. Passed.

### Guards removed, then restored

- Already-approved tutor. `approveTutor` matched any status, not only `WAITLISTED`. "does not mark an already-approved tutor as approved via the organization" expected `{ ok: true, refreshSession: false }` and received `{ ok: true, refreshSession: true }`. Restored. Passed.
- Pending members. Accept called `approveTutor` while the organization was still pending. "does not approve members who joined while the organization was pending" expected `WAITLISTED` and received `APPROVED`. Restored. Passed.
- Scheduler and instructor. The invite and role allow-lists included them, and `canGrantRole` returned true for them. "refuses a scheduler or instructor who invites or sets roles" resolved an invite (`invite_created`) instead of throwing `NEXT_NOT_FOUND`. Restored. Passed.
- Owner. An already-active member's roles were replaced by the invite. "does not demote an active sole owner who accepts an instructor invite" expected `["owner"]` and received `["instructor"]`. Restored. Passed.

### Commands for this pass

Local databases only. `prisma db push --force-reset` from Jest global setup ran against `tutoring_notes_test` and `tutoring_notes_org_test`. No production Neon.

- `npx jest src/__tests__/lib/safe-return-path.test.ts src/__tests__/admin-email-verify.test.ts --no-coverage -t "rejects protocol-relative|keeps a same-site path|resend of the tutor confirmation"` on local `tutoring_notes_test`: 3 passed after the guards were restored. The reject test failed with `//host` while the guard was out. The resend test failed with `returnTo` null while the pass-through was out.
- `npx jest src/__tests__/org/org-slice1.integration.test.ts --no-coverage` on local `tutoring_notes_org_test`, after the guards were restored: 41 passed.
- `npx playwright test tests/integration/identity/org-staff-invite.spec.ts tests/integration/identity/tutor-2fa-login.spec.ts tests/integration/identity/tutor-email-2fa-login.spec.ts tests/integration/identity/tutor-sms-2fa-login.spec.ts tests/integration/identity/tutor-sms-a2p-consent.spec.ts --project=identity-e2e --workers=1`: 27 passed, 1 failed. The scheduler invite test landed on the members page, and the private-tutor two-factor tests landed on `/admin/students`. The failure is `enroll default: unenrolled tutor sees first-class chooser with email default`. It looked for a disabled button named "SMS not available". The page showed "Set up with text message", because the Playwright server sets dummy Twilio credentials. That assertion was not changed.

Did not run `test:wb-sync` or the full regression suite. Jest and Playwright did not run at the same time.

### Commands for the landing and role pass

The earlier "8 passed" and "27 passed, 1 failed" runs happened before the login-start landing test existed. They are still accurate for what they ran. They are not the landing check.

After the landing test, the confirm redirect, and the invites-list and members-list role assertions:

- `npx playwright test tests/integration/identity/org-staff-invite.spec.ts tests/integration/identity/tutor-email-confirm.spec.ts --project=identity-e2e --workers=1`: 5 passed. That run includes the scheduler invite test, the login-start landing test, and the two confirm-link tests. The landing test asserted exact pathname equality with `/admin/organization/{id}` for the scheduler and `/admin/students` for the instructor-only member.
- Confirm redirect, before `teachingSignInHref`: expected `http://127.0.0.1:3000/login?callbackUrl=%2Forg-invite%2Fabc123&email=tutor-evf-signin-href%40test.com&verified=1` and received `http://localhost:3000/login?verified=1&callbackUrl=%2Forg-invite%2Fabc123&email=tutor-evf-signin-href%40test.com`. After the route used the helper and the test origin was `http://localhost:3000`, that test passed.

The full identity suite was not re-run after the landing test was added. The SMS chooser failure above is unchanged and is a backlog item. Did not run `test:wb-sync` or the full regression suite. Jest and Playwright did not run at the same time.

