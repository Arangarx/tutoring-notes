# Org W3 design: instructor Schedule + ICS feed

**Source:** [Sonnet design check](013b56d6-ab4d-4280-b205-897061eb528f), 2026-10-29, read-only, checked against `feat/org-qol` @ `f71673be`. Line numbers are approximate (±2). This amends `docs/handoff/org-ux-pass-plan.md` §W3; where they conflict, this document wins.

**Open questions (defaults applied, PENDING ANDREW):**

- **A. Notes and location on org appointments.** Keep scheduler-authored notes and location in the Schedule and the ICS feed. The ICS feed and the Google write already include them.
- **B. Time zone.** Org appointments show in the instructor's own time zone, matching ICS.
- **C. Suspended org.** Its appointments stay visible; W4 blocks entry.

## 0. Findings that change the plan

1. **The ICS feed leaks org appointments to removed members.** `load-ics-feed-sessions.ts:8` filters only `where: { adminUserId }`. A removed or waitlisted instructor who still holds a feed token keeps receiving org learner names, subjects and times. W3 is a privacy fix, not only a consistency fix.
2. **An existing test asserts the opposite of the spec.** `src/__tests__/org/org-booking-bridge.integration.test.ts:460-461` expects the org appointment NOT to appear in `listScheduledSessionsForTutor`. Invert it. This is decision 3's spec reversal, not a regression.
3. **The membership filter already exists three times:** `orgInstructorAdmitted` (`org-scope.ts:181-202`), `listOrganizationBookingChoices` (`schedule/actions.ts:504-510`), and `activeStaffHomeWhere` (`org-scope.ts:482-488`). Do not add a fourth.

## 1. One canonical predicate

The predicate goes in lib files. `actions.ts` is `"use server"`.

**In `src/lib/org-appointment-scope.ts`, add:**

```ts
export function activeOrgInstructorMemberWhere(adminUserId?: string): Prisma.OrganizationMemberWhereInput {
  return {
    ...(adminUserId ? { adminUserId } : {}),
    removedAt: null,
    roles: { has: "instructor" },
    adminUser: { approvalStatus: "APPROVED", isTestAccount: false },
  };
}
```

**Create `src/lib/scheduling/tutor-appointments.ts`:**

```ts
export function tutorAppointmentsWhere(adminUserId: string): Prisma.ScheduledSessionWhereInput {
  return {
    adminUserId,
    OR: [
      { student: { adminUserId } },
      { student: { adminUserId: null, organizationId: { not: null },
        organization: { members: { some: activeOrgInstructorMemberWhere(adminUserId) } } } },
    ],
  };
}
```

Also export `isOrgOwnedStudent(student)` from that file. It replaces the local `isOrgStudent` at `actions.ts:157-162`. The same check also appears in `schedule-bridge.ts:77-79` and `whiteboard/actions.ts:172-173`; those files are fragile, so leave them and add a BACKLOG line.

**Remove the existing copies:**

- **`listOrganizationBookingChoices`:** spread `{ organizationId, ...activeOrgInstructorMemberWhere() }`.
- **`orgInstructorAdmitted`:** org `status === "active"` AND `organizationMember.count({ where: { organizationId, ...activeOrgInstructorMemberWhere(adminUserId) } }) > 0`.
  - This is an **auth boundary**: the parity test J6 is required, and it needs a separate review.
  - If the review rejects the refactor, ship J6 alone and add a BACKLOG entry for the refactor.

**Consumers:**

- **`listScheduledSessionsForTutor`:** replace the `where` at `actions.ts:173-176`.
- **`loadIcsFeedSessionsForAdmin`:** replace the `where` at `load-ics-feed-sessions.ts:8`. The `select` is unchanged.
- **W5 (later):** `{ AND: [tutorAppointmentsWhere(me), { student: { learnerProfileId } }] }`.
- **Org tab:** do NOT route it through this predicate. `actions.ts:433-441` is org-first and guarded by `assertOrgRole`. J7 pins that the two return the same appointments.

**Included:** a row with `row.adminUserId = me` AND either (my own private student) OR (an org-owned student where I am that org's instructor: `removedAt` null, role `instructor`, APPROVED, not a test account).

- **Org status:** not checked here. W4 and `orgInstructorAdmitted` handle it.
- **Time:** not filtered. Past appointments show, as personal ones do today.

**Excluded:**

- another instructor's org appointment;
- an appointment from an org I was removed from, past or future, including live-protected ones;
- an appointment after I lost the `instructor` role;
- anything while I am waitlisted or a test account;
- an env-only student whose owner fields are both null.

**Fields:**

- **Schedule:** learner full name (`Student.name`), subject, time, location, notes.
- **Never sent:** `parentEmail`, `brief`, consent fields, claim fields.

**What happens later:**

- **Member removed:** `removeOrgMember` deletes future appointments that have no open live session (`org-scope.ts:~1090-1103`). Past appointments, and live-protected future ones, stay in the DB but disappear from that member's Schedule and feed.
- **Appointment reassigned:** `updateScheduledSession` rewrites `adminUserId`. The ICS UID (`id@usemynk.com`) is stable, so the event moves between calendars.
- **Instructor role dropped:** `setOrgMemberRoles` cancels nothing, so the appointment is orphaned. Add BACKLOG `ORG-ROLE-DROP-ORPHAN-APPOINTMENTS`.
- **Google calendar on reassign:** the update uses the new instructor's token with the old `googleEventId`. Verify this, or add a BACKLOG entry.

## 2. Schedule view and UI

**View shape:**

- `ScheduledSessionView.source` is required: `{ kind: "personal" } | { kind: "org"; organizationId; organizationName }`. Derive it in `toScheduledSessionView` (`scheduled-session-mapper.ts`), which needs `student: { name, adminUserId, organizationId, organization: { id, name } | null }`.
- Add `organization: { select: { id, name } }` to the org-page select (`actions.ts:443-451`) so that page does not fork the mapper.

**`liveEntryAllowed`:**

- Do not copy the cache loop in `withLiveEntry` (`upcoming-sessions.ts:107-130`).
- Extract one batched helper, used by `withLiveEntry`, the tutor list, and `actions.ts:476`.

**`SchedulePageClient.tsx`:**

- **Edit:** hide it on every org row, including for staff who are also the instructor. Delete lives inside the Edit dialog, so this hides Delete too. The personal dialog cannot handle org rows.
- **Start session:** the link (`/admin/students/${studentId}`) is dead for org rows. Render `OpenScheduledRoomButton` instead.
- **Shared parts:** extract one title cell (name + `OrgBadge` + sync badge) and one `ScheduleSessionActions` into `src/components/admin/schedule/`. Both `DayDetailSessionItem` and `SessionRow` use them. That removes the duplication between those two rows.
- **New `OrgBadge`:** `src/components/org/OrgBadge.tsx`, composing `ui/badge`, testid `org-badge`. Its text is `via {organizationName}`. No user-visible string says "org" (glossary).
- **Row ids:** add `data-session-id` to both row types.
- **Library doc:** add the new components to `docs/V1-COMPONENT-LIBRARY.md`.

**Writes:** org writes stay staff-only on the server (`assertOrgRole(..., STAFF_HOME_ROLES)` at `actions.ts:225/300/377`), so no new write code. The personal "New session" picker stays personal-only.

## 3. ICS feed

- **Scoping:** by the token owner only (`route.ts:34`, revoked tokens rejected). Removed and waitlisted members lose org appointments on the next fetch.
- **Learner name:** given name plus family initial (`orgLearnerCalendarName`, `ics-feed.ts:66-86`), unchanged.
- **Never in the feed:** parent email, brief, surname.
- **Description:** do not add an "Organization:" line. The ICS and Google description builders are already duplicated; add a BACKLOG entry for that.

## 4. Tests

**Playwright:** tags `TAG.ORG` + `TAG.WB_PRESENCE`, in `tests/integration/wb-org-booking.spec.ts`, reusing its seed helpers. **Jest:** real DB, under `src/__tests__/schedule/` and `src/__tests__/org/`. **Oracles:** seeded ids and strings only.

**Jest:**

- **J1 `tutorAppointmentsWhere` matrix.**
  - Included: own private; assigned org appointment; owner+instructor; suspended org; reactivated member.
  - Excluded: another instructor's; removed member (past, and live-protected future); scheduler-only role; WAITLISTED; test account; corrupt seed with no membership; null/null student; a private row for another tutor's student.
- **J2 org rows in my list.** `listScheduledSessionsForTutor` returns org rows with `source.kind = "org"`, the org name and the full name. The serialized output contains none of: parent email, brief, another instructor's learner, or another instructor's name. Includes the inversion of `org-booking-bridge.integration.test.ts:460-461`.
- **J3 ICS parity.** ICS loader ids equal Schedule ids across the J1 matrix. Removed-member appointments are absent from both.
- **J4 ICS body.** Has `SUMMARY:Tutoring — Mary Ann L.`, with no parent email, brief, or surname word.
- **J5 instructor write block.** An instructor-only assigned instructor gets `NEXT_NOT_FOUND` on update and delete, and the row is unchanged. Do a one-time mutation check.
- **J6 membership parity.** `activeOrgInstructorMemberWhere` = `orgInstructorAdmitted` (active org) = booking-choices presence, against a hand-written truth table.
- **J7 org tab parity.** An instructor-only member's org-tab ids for org X equal the Schedule's org-row ids for org X.
- **J8 reassign.** Reassigning A→B moves the appointment from A's list and feed to B's.
- **J9 member removed.** `removeOrgMember` with a live-protected future appointment: the removed member's Schedule and feed show neither it nor past appointments, and the non-live future appointment is deleted.
- **J10 personal picker.** `listScheduleStudentOptions` never returns an org learner. Do a mutation check.

**Playwright:**

- **P1** "a scheduler-booked appointment appears on the instructor's Schedule with the organization badge" (Agenda and Month day detail).
- **P2** "the instructor cannot edit or delete an org appointment from Schedule".
  - Org row: no Edit, no `schedule-start-session`, and `open-scheduled-room-<id>` present.
  - A personal row on the same page still has Edit.
  - Repeat as an owner+instructor.
- **P3** "another instructor's Schedule does not show it" (HTML grep). Pair it with P1.
- **P4** "a removed instructor's Schedule and feed lose org rows".
- **P5** "the ICS feed and the Schedule list the same appointments". Compare UIDs to `data-session-id` values and the seeded ids.
- **P6** "the feed never carries the learner's parent email, brief, or surname".
- **P7** "the personal booking picker never lists an org learner".
- **P8** "reassigning an appointment moves it between instructors' Schedules".
- **P9** "the org badge shares a line with the learner name": relational midline check, within 4 px.

**Gates:** `test:wb-affected:run`, `npx next build`, and a Sonnet review (predicate, J1, `orgInstructorAdmitted` refactor).

## 5. Corrections to the plan's §W3

1. **No new name helper.** `orgLearnerFullName()` already exists (`org-learner.ts:42-51`). Use `Student.name`.
2. **Membership conditions.** The predicate must include APPROVED and not-a-test-account, and must reuse the shared fragment.
3. **Spec 4 overstates cancellation.** Only future appointments without a live session are deleted, and dropping the instructor role leaves orphans.
4. **Spec 2.** Drop "when in the window": tutors can open the room at any time. Also remove the Start session link for org rows.
5. **Org tab.** It is not a consumer of this predicate; J7 pins parity instead.
6. **`SchedulePageClient`.** It needs shared components, not branching in two places.
7. **Existing test.** Invert `org-booking-bridge.integration.test.ts:460-461`.
8. **Delete.** It lives inside the Edit dialog, so hiding Edit hides Delete.
9. **ICS.** The removed-member change is a privacy fix.
10. **Copy.** Badge text is `via {Organization name}`.
