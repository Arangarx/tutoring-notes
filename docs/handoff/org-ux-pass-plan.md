# Org UX pass — executor plan

- **Branch:** `feat/org-qol`. Written against tip `50a0e08a` (2026-10-28).
- **Authority:** `docs/handoff/tyson-feedback-2026-10-28.md` § Andrew's decisions (2026-10-28 evening). Where this plan and `docs/handoff/org-learner-design.md` disagree, the 2026-10-28 decisions win; the superseded lines are listed in § 1.
- **Standards:** every wave obeys `.cursor/rules/composition-no-duplication.mdc`, `.cursor/rules/exhaustive-testing-mandate.mdc` (red-before / green-after, to spec), `.cursor/rules/visual-layout-oracles.mdc` (relational asserts), `.cursor/rules/agentic-verification-pipeline.mdc` (separate Sonnet reviewer, `claude-sonnet-5-5-high`, read-only, per wave).
- **Out of scope here:** the transcript hallucination hotfix (ships off `master`, decision 1); calculus graphs; the graph red-X delete bug. A separate read-only investigation of **58**, **60** and the graph delete bug is in flight. Waves W4 and W9 below wait for its report before code.
- **New UI strings** in this plan are proposed copy. Executors list every new string in the wave handoff for Andrew's smoke review (same rule as org-learner-design § 14).

---

## 1. Decisions recap (what we are designing for)

| # | Decision (Andrew 2026-10-28) | Plan section |
|---|---|---|
| 2 | Review-screen transcript stays, collapsed behind **Show transcript**, tutor-only. | W8 |
| 3 | Instructors see org-booked appointments on their own **Schedule** with an org badge, plus an **Organization** tab scoped to only their appointments. | W1, W3, W6 |
| 4 | Same person (org learner + tutor's private student, same `learnerProfileId`): **display-only merge** in the tutor's student list, org appointments badged; records stay separate (single-owner CHECK unchanged). | W5 |
| 5 | Disabled **Start / Open room / Join** always show a one-line reason. Reverses packet item 5 ("no line"). | W4 |
| 6 | Multi-org: remember the last org per account. Single-org users never see switcher chrome. | W6 |
| 7 | Glossary: **instructor / learner** on org screens; **tutor / student** on personal screens. | W7 |

**Superseded lines** (record in the wave handoffs; do not edit org-learner-design.md beyond a one-line pointer):

- org-learner-design § 8: "Organization sessions stay on the organization schedule" → org appointments also appear on the instructor's personal Schedule (badged).
- org-learner-design § 2.1 / earlier third pass "two separate records for the tutor" → still true underneath; only the **display** merges.
- Packet item 5 / 50 expectations: "no line under the row" and "An instructor does not get Organization in the menu" → both reversed. Update `docs/handoff/ORG-QOL-TYSON-TEST-PACKET.md` items 5, 50, 54, 58 in the wave that changes the behavior.

**Answers to Andrew's open questions 1–3** (verified in code, each gets a test in W3/W5):

1. *Can a tutor schedule learners owned only by the org?* No. `createScheduledSession` routes an org `Student` through `assertOrgRole(org, [owner, admin, scheduler])`; an instructor-only member is refused. The personal picker (`listScheduleStudentOptions`) uses `studentsWhereForScope`, which never returns org rows. W5 must keep it that way after the merge (test).
2. *Is a private appointment hidden from the org?* Yes, structurally. Org lists filter `student.organizationId = <org> AND student.adminUserId IS NULL`; a private `Student` has `organizationId` null by the CHECK. One residual signal: the org booking overlap warning ("This overlaps another appointment.") can fire because of the instructor's private appointment. It reveals only that the instructor is busy, never who or what. Accepted spec (org-learner-design § 5); no change.
3. *Does "same learner, org appointment flagged" contradict prior decisions?* Yes, § 8 of org-learner-design (above). It does not contradict the data model, consent separation, or access rules — those are unchanged.

---

## 2. Verified findings (code, tip `50a0e08a`)

| ID | Finding | Where |
|---|---|---|
| **LEAK-1** | An instructor-only member who opens `/admin/organization/<id>` by URL gets **every** org appointment (all instructors, all learners). `listScheduledSessionsForOrganization` admits `instructor` and does not filter by `adminUserId`. `listOrganizationBookingChoices` likewise returns every org learner, and the page loops all of them for "Sessions you taught". | `src/app/admin/schedule/actions.ts` (`listScheduledSessionsForOrganization`, `listOrganizationBookingChoices`), `src/app/admin/organization/[id]/page.tsx` |
| B1 / 54 | Tutor Schedule filters `student: { adminUserId: me }`, which drops every org appointment. The ICS feed (`loadIcsFeedSessionsForAdmin`) filters only `adminUserId`, so it **already includes** them — the two disagree. Instructors have no Organization nav link (`STAFF_HOME_ROLES` excludes instructor). | `schedule/actions.ts` `listScheduledSessionsForTutor`; `src/lib/calendar/load-ics-feed-sessions.ts`; `src/lib/org-scope.ts` `hasStaffHomeMembership`; `src/app/admin/layout.tsx` |
| B2 / 52 | Students page uses `studentsWhereForScope` → personal rows only. | `src/app/admin/students/page.tsx` |
| A1 | Nav "Organization" → `/admin/organization`, always the list. `staffHomeLandingPath` sends single-org users to the detail page only at sign-in. | `src/lib/admin-nav-links.ts`, `org-scope.ts` |
| A2 | Org list rows are bare text links (underline on hover only), in both staff and operator lists. `StudentsRoster` already has an obvious card-row link inline (not extracted). | `src/app/admin/organization/page.tsx`, `src/app/admin/orgs/page.tsx`, `src/components/admin/StudentsRoster.tsx` |
| B3 | Org appointment row: unlabeled stacked lines; `whenLabel` = `YYYY-MM-DD HH:MM–HH:MM`; no past/upcoming split. | `OrgSchedulePanel.tsx`, `listScheduledSessionsForOrganization` |
| B4 | `CreateSessionDialog` preselects the first instructor and first learner; with zero options the trigger is disabled with no reason; field label "Student" on org screens; no "times are in <org zone>" note. | `src/components/admin/schedule/CreateSessionDialog.tsx` |
| B5 | "Sessions you taught": one link per session, label = learner full name only, so rows are identical. | `OrgSchedulePanel.tsx` |
| C1 / 58 | `appointmentLiveEntryAllowed` returns a bare boolean. `OpenScheduledRoomButton` and `JoinScheduledSessionButton` render a disabled button with no reason. On the student page, when an appointment exists the main control is **Open room** (not Start), so the privacy callout never renders; the same appointment's Open room also appears again in the Upcoming card. | `src/lib/scheduling/upcoming-sessions.ts`, `src/components/scheduling/*`, `src/app/admin/students/[id]/page.tsx` |
| C2 | `SessionStartBlockedCallout` links to `#student-section-parent`, which no longer exists (stage 6 moved it to `/admin/students/<id>/account`). | `SessionStartBlockedCallout.tsx` |
| C3 / 60 | `ParentShareNoteCard` hides **View whiteboard** silently when `replaySessionIds` is empty. Root cause pending the in-flight investigation. | `src/components/notes/ParentShareNoteCard.tsx`, `src/lib/share/*` |
| Review | Transcript renders unconditionally in the review aside. | `SessionReviewMode.tsx` (`wb-review-transcript`) |
| Gap | `assertOrgRole` denies removed members, so a removed instructor has no entry point to the read-only sessions § 0 says they keep. Pre-existing; not fixed here (backlog `ORG-REMOVED-READONLY-ENTRY`). | `org-scope.ts` |

---

## 3. Shared pieces (extract once, everyone composes)

| Piece | Kind | Home | Replaces / consumers |
|---|---|---|---|
| `LinkRow` | Component (owns its CSS) | `src/components/LinkRow.tsx` | Extracted from the `StudentsRoster` card link (leading slot, title, meta line, trailing badges, chevron, focus ring). Consumers: `StudentsRoster`, staff org list, operator org list, org learner records, "Sessions you taught", `OrgSwitcher` list fallback. Library doc entry required. |
| `OrgBadge` | Thin composition of `Badge` (1A.6 "done" style) | `src/components/org/OrgBadge.tsx` | Text `via {orgName}`. Used on Schedule rows, roster rows, upcoming rows, student-page org disclosure. One component; no per-surface styling. |
| `tutorAppointmentsWhere(adminUserId)` | Prisma where-builder | `src/lib/scheduling/tutor-appointments.ts` | The one definition of "appointments this tutor sees as theirs": `adminUserId = me AND (student.adminUserId = me OR (student.organizationId IS NOT NULL AND student.adminUserId IS NULL AND <me is an active instructor of that org>))`. Consumers: Schedule list, ICS feed, student-page upcoming, roster merge, org tab instructor filter. |
| `sessionEntryState(...)` | Pure decision + one batched loader | `src/lib/scheduling/session-entry.ts` | Replaces `appointmentLiveEntryAllowed` (boolean) and `canStartSession` (boolean). Returns `{ online: EntryDecision; inPerson: EntryDecision }` (decision D3, 2026-10-29). It is the one entry rule: the UI reads it to explain, and every server enforcement site calls it in place to refuse. See W4 § Shape. |
| `SessionEntryBlocked` | Component, `size: "line" \| "card"` | rename/refactor of `SessionStartBlockedCallout.tsx` → `src/components/scheduling/SessionEntryBlocked.tsx` | One component renders every disabled-reason: one line under a button (`line`) or the existing callout (`card`). Copy comes from one table keyed by `(reason, audience)`. |
| `ENTRY_BLOCK_COPY` | Copy table | in `session-entry.ts` | Also feeds the scheduler card's short reason (`listSchedulerLearners`) — consolidate that existing string source into this table. |
| `OrgSwitcher` | Composition of `DropdownMenu` | `src/components/org/OrgSwitcher.tsx` | Rendered **only** when the viewer has ≥ 2 active memberships. |
| Org vocabulary | Constants | extend `src/lib/site-role-labels.ts` | `ORG_ROLE_INSTRUCTOR = "Instructor"`, `ORG_LEARNER = "Learner"`, personal `PERSONAL_STUDENT = "Student"`. No hardcoded role nouns in org components. |

Disclosure UI (transcript toggle, "Sessions via {Org}", past appointments) composes the canonical `Accordion` (via `StudentSessionDisclosures` where the shape fits). No new collapsible.

`EntryBlockReason` (closed union; exhaustive switch, `default` renders the generic line — never blank):

| Code | Tutor / instructor line (proposed) | Family line (proposed) |
|---|---|---|
| `unclaimed` | "{name} hasn't connected their Mynk account yet." | — (family is signed in, cannot occur) |
| `consent_missing_self` | "{name} hasn't finished privacy preferences yet." | "Finish privacy preferences (Manage → Privacy) to join." |
| `consent_missing_parent` | "The parent hasn't finished privacy preferences yet." | "Finish privacy preferences for {name} to join." |
| `live_off` | "Live sessions are off in {name}'s privacy settings." | "Live sessions are off in privacy settings." |
| `not_yet` | — (tutor Open room is not window-gated today; do not add) | "Join opens 15 minutes before the start." |
| `org_inactive` | "This organization isn't active right now." | "This session isn't available right now." |
| `instructor_not_admitted` | "You're not an active instructor in this organization." | "This session isn't available right now." |
| `erasure_pending` | existing erasure callout sentence | "This session isn't available right now." |
| `unknown` | "This session can't be opened right now." | "This session isn't available right now." |

Family lines never reveal org-internal state (org status, instructor membership) — they collapse to the generic line.

---

## 4. Workstreams

Each workstream: **Spec** (user-observable acceptance) → **Design** → **Migration** → **Access / leak** → **Playwright** → **Risk**. Tag registry change is in W0.

### W0 — `@org` tag (mechanical)

There is no org tag. Add `ORG: "@org"` to `tests/test-tags.ts` with adjacency `[@wb-presence]` (booking → join), and map `src/components/org/**`, `src/lib/org-*.ts`, `src/app/admin/organization/**`, `src/app/admin/orgs/**`, `src/lib/scheduling/**`, `src/app/admin/schedule/**`, `src/app/admin/students/page.tsx`, `src/components/admin/StudentsRoster.tsx` → `@org` in `scripts/wb-test-select.cjs`. Re-tag existing org specs (`tests/integration/identity/org-staff-invite.spec.ts`, `identity/org-learner-panel.spec.ts`, `wb-org-booking.spec.ts`, `wb-org-removal.spec.ts`). Jest: `wb-test-select` maps an org path to `@org` (red before the map entry).

### W1 — Instructor scoping on the org page (LEAK-1 BLOCKER)

**Spec**
1. An instructor-only member sees on the org page only appointments where they are the instructor. Other instructors' appointments, learners they are not booked with, and booking choices are absent from the HTML (not merely hidden).
2. Owner / admin / scheduler views unchanged.
3. "Sessions you taught" lists only that instructor's sessions, computed directly (no loop over all org learners).

**Design**
- `listScheduledSessionsForOrganization(orgId)`: after `assertOrgRole`, if the actor holds none of owner/admin/scheduler, add `adminUserId: actor.adminId` to the where. One function, role-parameterized; no second list function.
- `listOrganizationBookingChoices`: call only when `canBook`; the page stops calling it for instructor-only viewers.
- "Sessions you taught": one query `whiteboardSession.findMany({ where: { adminUserId: me, student: { organizationId: org, adminUserId: null } } })` grouped by student; reuse `loadInstructorTaughtSessions`' shape (extend it to accept "all students" rather than duplicating it).

**Migration:** none.

**Access / leak:** this is the leak fix. Selection for instructor rows must not include `parentEmail`, brief, or consent fields (they do not today; Jest asserts the `select`).

**Playwright** (`tests/integration/wb-org-booking.spec.ts`, `@org @wb-presence`)
- `an instructor sees only their own org appointments` — seed two instructors, two learners, one appointment each; instructor A's page contains A's learner name and does **not** contain B's learner name or B's display name (DOM text oracle + response HTML grep).
- `an instructor gets no booking dialog or learner choices` — `schedule-new-session` absent; page source has no `<option>`/item for unbooked learners.

Jest: role matrix for `listScheduledSessionsForOrganization` (owner, admin, scheduler, instructor, instructor+scheduler, other-org member, removed member → notFound).

**Risk:** low; read path only. Red-before is trivial (current code returns B's row).

### W2 — `LinkRow` extraction + obvious org list rows (A2)

**Spec**
1. Every org name in the staff org list and the operator org list renders as a full-width card row with a chevron, same as student rows.
2. The whole row is the click target.
3. `StudentsRoster` looks and behaves identically before/after.

**Design:** extract `LinkRow` from `StudentsRoster` (props: `href`, `leading?`, `title`, `meta?`, `badges?`, `testId`). Replace the inline JSX in `StudentsRoster`, `src/app/admin/organization/page.tsx`, `src/app/admin/orgs/page.tsx`. Org rows: leading = none, meta = `Active · Owner, Admin` (status capitalized via one formatter, not raw enum).

**Migration:** none.

**Playwright** (`tests/integration/identity/org-staff-invite.spec.ts`, `@org @wb-chrome`)
- `org list rows are full-width click targets` — relational: row box width ≈ list container width (±4px); clicking the row's right edge (inside the box, away from the text) navigates to the org page; the row exposes `role=link`.
- `student roster rows keep their click target` — same relational assert on `/admin/students` (guards the extraction).

**Risk:** shared-component change → grep all consumers, green `npx next build`. Mechanical.

### W3 — Instructor Schedule shows org appointments (54)

**Spec**
1. An appointment booked by a scheduler for instructor I appears on I's **Schedule** (list and calendar views), with an `OrgBadge` "via {Org}" and the learner's full name.
2. The org row on Schedule is read-only for I: no Edit/Delete (the scheduler owns it). It shows **Open room** + reason line (W4) when in the window.
3. The ICS feed and the in-app Schedule list the same set of appointments for I.
4. A removed instructor's Schedule no longer shows future org appointments (they are cancelled by stage 5) and does not show other org rows.
5. Personal Schedule picker still lists only personal students.

**Design**
- Add `tutorAppointmentsWhere(adminUserId)` (§ 3). Active-instructor test = `student.organization.members.some({ adminUserId: me, removedAt: null, roles: { has: instructor } })`.
- `listScheduledSessionsForTutor` and `loadIcsFeedSessionsForAdmin` both use it. ICS behavior change: removed-member org rows drop out of the feed (correct per spec 4).
- `ScheduledSessionView` gains `source: { kind: "personal" } | { kind: "org"; organizationId; organizationName }`. `toScheduledSessionView` sets it; org learner name from `OrganizationLearner` (one helper — reuse the given+family join already in `listScheduledSessionsForOrganization`; extract it as `orgLearnerFullName()` in `src/lib/org-learner.ts`, not a third copy).
- `SchedulePageClient` row: when `source.kind === "org"` render `OrgBadge`, suppress edit/delete triggers. No other branching.

**Migration:** none.

**Access / leak:** predicate requires `appointment.adminUserId = me`; another instructor's appointments never match. Org rows expose name + subject + time only (no brief, email, consent).

**Playwright** (`tests/integration/wb-org-booking.spec.ts`, `@org @wb-presence`)
- `a scheduler-booked appointment appears on the instructor's Schedule with the org badge` — scheduler books via UI; instructor opens `/admin/schedule`; row with learner name and `via {Org}` visible (packet 54 oracle).
- `the instructor cannot edit or delete an org appointment from Schedule` — edit/delete controls absent on that row; present on a personal row on the same page.
- `another instructor's Schedule does not show it`.
- `the ICS feed and the Schedule list the same appointments` — fetch the feed URL, parse `UID`s; equals the set of row ids on the page (independent oracle: the feed parser, not the view mapper).
- `the personal booking picker never lists an org learner` (Andrew Q1).

**Risk:** medium — the predicate becomes the single definition of "mine". Sonnet reviews the predicate + its Jest matrix (personal, org-active, org-removed, other instructor, other org, env scope).

### W4 — Always show why Start / Open room / Join is disabled (58, C1, C2)

**Waits for** the in-flight 58 report (confirm the root cause is "main control is Open room, so the privacy callout never renders" and not a consent-read bug).

**Spec**
1. Any disabled **Start session**, **Open room**, or **Join** has a visible one-line reason directly under it, from the § 3 table.
2. On the student page, the main control shows the full `card` form when blocked by consent/claim; the same appointment never shows two Open room controls on one page.
3. The callout's link goes to **Account & sharing** (`/admin/students/<id>/account`), not a dead anchor.
4. The reason shown and the server's decision agree: whenever the UI shows a reason, the server refuses; whenever it shows no reason, the server admits.
5. Scheduler learner cards keep their short reason, now from the same copy table.

**Design**
- `session-entry.ts`: `loadSessionEntryInputs(rows)` (batched, keeps today's per `(studentId, adminUserId)` cache) + pure `sessionEntryState(inputs)`. Replace `appointmentLiveEntryAllowed` and `canStartSession`. `UpcomingScheduledSessionRow.liveEntryAllowed: boolean` → `entry: SessionEntryState`.
- **Shape (decision D3, 2026-10-29, from the consent wave plan).** `sessionEntryState` is the one pure rule, and it has a **mode dimension**: it returns `{ online: EntryDecision; inPerson: EntryDecision }`, where `EntryDecision = { allowed: true } | { allowed: false; reason: EntryBlockReason }`. Online-off blocks `online` and leaves `inPerson` allowed. Build the mode dimension in W4, not later. The rule is also an **enforcement** function, not only an explainer: every server site that refuses entry calls the same pure function in place (it loads its own inputs, calls `sessionEntryState`, and refuses on `!state[mode].allowed`). Control flow stays where it is; nothing is routed through a UI component. The UI reads the same function. In W4 the callers wired are the UI components above, `startWhiteboardSession` and the schedule bridge. The consent wave's C5 wires the remaining callers (`/join` for every principal, `issueJoinToken`, the waiting room, resume, the org-learner list). See `docs/handoff/consent-wave-plan.md` § 2.4. This supersedes the § 3 table wording "adds no new gate".
- `OpenScheduledRoomButton`, `JoinScheduledSessionButton`, `StartWhiteboardSession` take `entry` and render `SessionEntryBlocked size="line"` when blocked. Join's client-side window tick maps to `not_yet`.
- Student page: when the main control is Open room, pass that appointment's id to `UpcomingSessionsCard` as `promotedId`; the card renders that row without an action (one control per appointment). When the main control is blocked by `unclaimed`/`consent_*`, render `SessionEntryBlocked size="card"` (the existing callout content) in the Session card.
- Bridge: `getOrCreateWhiteboardForSchedule` and `createWhiteboardSessionCore` refusals log the same `EntryBlockReason` code (`[slc] … action=schedule_bridge_refused reason=<code>`). The bridge's refusal check calls the pure `sessionEntryState` in place (D3). The earlier "do not reroute" concern was about moving control flow through a UI component; calling a pure function from the existing check does not do that, and the bridge's order of operations is unchanged. The W4 parity test (UI reason vs server refusal) stays and is table-driven over both modes.

**Migration:** none.

**Access / leak:** family copy collapses org-internal reasons (table). Tutor copy never names the parent or shows email. Instructor sees `consent_*` / `live_off` for an org learner — already permitted (scheduler sees the same short reason, § 3 of org-learner-design).

**Playwright** (`tests/integration/wb-org-booking.spec.ts` + `tests/integration/wb-child-home.spec.ts`, `@wb-presence @wb-chrome`)
- `a self-learner with no privacy record shows the reason under Open room` — appointment in window, no consent record; reason line text equals the table line; button disabled. (Packet 58 regression.)
- `the student page shows one Open room per appointment` — count of `open-scheduled-room-<id>` = 1.
- `the blocked callout links to Account & sharing` — click → URL `/admin/students/<id>/account`.
- `Join shows "Join opens 15 minutes before the start" outside the window, then enables at the window` — clock-controlled (`page.clock`).
- `live sessions off shows the reason on both Join and Open room`.
- `reason and server agree` — table-driven over the reason fixtures: for each, assert UI reason present AND a direct POST of the open/join action returns refusal; for the admitted fixture, UI has no reason AND the action redirects into the room.
- Relational: reason line's left edge ≈ button's left edge (±4px) and its top is below the button's bottom (`visual-layout-oracles`).

**Risk:** touches consent reads (`resolveEffectiveConsentForStudent`) and the bridge log line → Sonnet design check before code, Sonnet review after. Red-before for spec 1 is the current blank disabled button.

### W5 — Display-only merge in the tutor's student list (52)

**Spec**
1. **Merged row.** Instructor I has a private `Student` P and is booked (or has taught) org learner O in org G, and `P.learnerProfileId = O.learnerProfileId` (non-null). The roster shows **one** row: P's name, P's avatar, link to `/admin/students/P`, plus `OrgBadge "via G"` (one badge per org).
2. **Org-only row (recommended — confirm Q1).** I has no private row for O. The roster shows a row with O's full name and `via G`, linking to `/admin/organization/G?learner=O` — the org page filtered to I's appointments with O and the sessions I taught O.
3. **Inclusion.** An org learner appears only when I is an active instructor of G **and** has ≥ 1 appointment or ≥ 1 taught session with O. Learners booked only with other instructors never appear. A removed instructor's org rows disappear.
4. **Merged student page (P).** Upcoming sessions lists P's personal appointments **and** O's appointments with I, org ones badged, each with its own Open room and its own reason (org consent for org rows, personal consent for personal rows). A collapsed disclosure **Sessions via G** lists ended org sessions I taught, linking to the existing review/replay routes. **Start session** stays personal-only.
5. **Walls stay.** Org sessions/notes never appear in P's Notes page, P's share link, **Email a reminder**, Account & sharing, or P's consent card. Private appointments and notes never appear on any org surface.
6. Unclaimed org learner (no `learnerProfileId`) never merges; it is an org-only row.
7. The roster load writes nothing (no `Student` created or updated).

**Design**
- `src/lib/roster/tutor-roster.ts`: `loadTutorRoster(scope)` = personal rows (`studentsWhereForScope`, unchanged) + org rows from `scheduledSession`/`whiteboardSession` where `adminUserId = me` and student is an org row in an org where I am an active instructor (reuse the W3 membership predicate). Select only `studentId, organizationId, organization.name, organizationLearner.givenName/familyName, learnerProfileId`. Merge in memory by non-null `learnerProfileId`. Output `StudentRosterItem` + `orgs: { id, name }[]` + `href`.
- `StudentsRoster` renders via `LinkRow` with `badges={orgs.map(OrgBadge)}`; search matches name or org name.
- Student page: `listUpcomingForStudent` gains the org rows for the same profile via `tutorAppointmentsWhere` + `student.learnerProfileId = P.learnerProfileId` (only when non-null). "Sessions via G" reuses the W1 taught-sessions loader.
- Org page `?learner=` filter: applied inside `listScheduledSessionsForOrganization` for instructor-only viewers (W1 path); ignored for staff roles (they see all). Invalid / unbooked learner id → filter yields nothing (no existence oracle).
- `listScheduleStudentOptions` is untouched; Jest asserts it never returns org rows.

**Migration:** none. Single-owner CHECK unchanged.

**Access / leak (BLOCKERs folded into spec):**
- One roster function, Jest matrix: other instructor's learner, scheduler-only role, owner-not-instructor, removed member, other org, unclaimed, two orgs same profile, profile linked to a different tutor's private row (must not merge into mine — merge key is my P only).
- Never selected on org rows: `parentEmail`, brief, consent fields. Asserted on the Prisma `select`.
- The org side gains no new query; the org cannot learn P exists. Grep guard: no file under `src/lib/org-*` or `src/components/org/*` imports `tutor-roster.ts`.
- Org notes on P's page are links to sessions I taught — already permitted (org-learner-design § 3); they are not copied into P's records.

**Playwright** (new `tests/integration/org-roster-merge.spec.ts`, `@org @wb-presence`)
- `a learner who is both my student and an org learner shows once with the org badge` — count of rows with that name = 1; badge text `via {Org}`; click → `/admin/students/<P>`.
- `an org-only learner shows with the org badge and opens the org view` — click → `/admin/organization/<G>?learner=<O>`; page lists only I's appointments with O.
- `a learner booked only with another instructor does not appear`.
- `org appointments on the merged student page are badged and open the org room` — Open room on the org row lands in a workspace whose `WhiteboardSession.studentId = O` (DB oracle), personal Start creates one with `studentId = P`.
- `org sessions never appear in the private notes page or share link` — after an org session ends with a saved note, P's Notes list and P's `/s/<token>` page do not contain it.
- `an org owner never sees the instructor's private appointment` (Andrew Q2).

**Risk:** highest of the plan — access boundary + roster query. Sonnet design review of `tutor-roster.ts` before code; Sonnet code review after. Performance: one extra query on the Students page; no per-row consent calls on the roster.

### W6 — Org navigation, last org, context (A1, A3, decision 6)

**Spec**
1. Any active member (including instructor-only) sees **Organization** in the nav.
2. Single-org member: Organization opens that org directly, always. No list, no switcher anywhere.
3. Multi-org member: Organization opens the last org they opened (across devices). If that membership is gone, they get the list. Org pages show a **Switch organization** menu in the page header; nowhere else.
4. Instructor-only member lands on the org page scoped to their appointments (W1), titled with the org name, subtitle "Your appointments and sessions."
5. The org name is always the page title on org pages; personal pages show org affiliation only as `via {Org}` badges on rows. No global "acting as" chrome.

**Design**
- `hasStaffHomeMembership` → `hasOrgMembership(adminUserId)` (any role, active). Nav option `showOrgStaffHome` → `showOrgHome`. Sign-in landing for instructor-only stays **Students** (unchanged).
- `/admin/organization/page.tsx` becomes a resolver: 1 membership → `redirect` to it; ≥ 2 → redirect to `lastActiveOrganizationId` when still an active membership, else render the list (`LinkRow`). `?all=1` forces the list (the switcher's "All organizations" item).
- `/admin/organization/[id]` writes `lastActiveOrganizationId` after `assertOrgRole` succeeds, only when it differs (one `updateMany where { id, NOT: { lastActiveOrganizationId: id } }`). Failure is non-fatal and logged `[org] org=<id> action=last_org_write_failed`.
- `staffHomeLandingPath` uses the same resolver logic (one function `resolveOrgHomePath(adminUserId)` shared by sign-in and the route).
- `OrgSwitcher` rendered in `PageShell` `actions` only when memberships ≥ 2.

**Migration (additive, justified):** `AdminUser.lastActiveOrganizationId String?` with FK to `Organization` `onDelete: SetNull`. Why a column: Andrew asked for **per account**; a cookie is per device/browser and breaks on a second device. No existing prefs table (tutor prefs already live as nullable `AdminUser` columns: `tutorTimezone`, `defaultRounding*`). Local test DB only; preview migration needs Andrew's go; production a separate go. Add to `docs/PLATFORM-ASSUMPTIONS.md` only if a reviewer judges it load-bearing (it is not an infra dependency — expected: no edit).

**Access / leak:** the stored id is a hint, never authority — every read re-checks active membership. Erasure: the column holds an org id only (no personal data); add it to the erasure column registry as not-personal.

**Playwright** (`tests/integration/identity/org-staff-invite.spec.ts`, `@org @wb-chrome`)
- `a single-org member returns to their org after leaving` — open org, go to Schedule, click Organization → URL is the org page; `org-switcher` absent; `org-staff-index` absent.
- `a multi-org member returns to the last org they opened` — open org B, leave, click Organization → org B; sign in on a fresh browser context → still org B (proves per-account, not cookie).
- `a multi-org member can switch` — switcher lists both; choosing A navigates to A; title = A's name.
- `an instructor-only member sees Organization and only their appointments` (pairs with W1).
- `a member removed from the last org lands on the list`.

Jest: `resolveOrgHomePath` matrix (0, 1, 2 with valid last, 2 with stale last, removed).

**Risk:** low-medium (migration). Mechanical after the resolver is specified.

### W7 — Org screen polish + glossary (B3, B4, B5, D1, D2, D3/D5/D6 re-verify)

**Spec**
1. **Appointment rows (B3):** labeled fields — date as `Wed, Oct 28 · 4:00–5:00 PM` in the org time zone, `Instructor: …`, `Learner: …`, subject. Upcoming first; past appointments behind a collapsed **Past** disclosure. No date-filter control (clutter); the week label stays.
2. **Booking dialog (B4):** org mode has no preselected instructor or learner ("Choose an instructor" / "Choose a learner"; Save disabled with the one-line reason "Choose an instructor and a learner." until both chosen). A note "Times are in {org time zone}." With zero learners, the disabled **New session** shows "Add a learner first." (or "Invite an instructor first.").
3. **Sessions you taught (B5):** one `LinkRow` per session: learner name + date + state (`Notes saved` / `Needs review`).
4. **Invite accepted (D1):** the accepted page offers one button to the org (or Students for instructor-only).
5. **Confirms (D2):** Remove member (no live session) and Revoke invite each ask once via `AlertDialog`.
6. **Glossary (decision 7):** org screens say instructor/learner; personal screens say tutor/student. The personal roster's "Add learner" / "Add a learner" becomes "Add student" (**confirm Q2** — reverses packet items 9/61 copy).
7. D3 (member list), D5 (operator org detail), D6 (org-learner notes breadcrumb): executor re-verifies each against the code and fixes only copy/composition (no new behavior). Anything bigger → backlog with a line in the handoff.

**Design:** date formatting through the existing scheduled-session datetime helpers (no new formatter). `CreateSessionDialog` gains `vocabulary` derived from `instructorOptions` presence (parameter, not a fork). Confirm dialogs: extract one `ConfirmActionDialog` (composes `AlertDialog`) from the patterns in `RevokeTutorAccessButton` / `TutorWaitlistActions` and adopt it there too (dedupe while touching). Labels from `site-role-labels.ts`.

**Migration:** none.

**Playwright** (`tests/integration/identity/org-learner-panel.spec.ts` + `wb-org-booking.spec.ts`, `@org @wb-chrome`)
- `org appointment rows label instructor and learner and show a readable date` — text contains `Instructor:` / `Learner:`; date text does not match `/\d{4}-\d{2}-\d{2}/`.
- `the booking dialog has no default instructor and explains the disabled Save`.
- `the booking dialog says times are in the org time zone`.
- `New session explains why it is disabled with no learners`.
- `taught session rows are distinguishable` — two sessions with one learner → two different row texts.
- `remove and revoke ask for confirmation` — cancel leaves the member/invite; confirm removes.
- `org screens use instructor and learner; the personal roster uses student` — visible text checks on both pages.

**Risk:** low; mechanical (Grok). Shared-component edits (`CreateSessionDialog`, `ConfirmActionDialog`) → consumer grep + `npx next build`.

### W8 — Review transcript behind a toggle (decision 2)

**Spec:** on the tutor review screen the transcript is collapsed on load behind **Show transcript**; expanding reveals the full text; the family replay never shows it (unchanged). Collapsed state is not persisted.

**Design:** wrap the existing `wb-review-transcript` block in the canonical `Accordion` (single item, collapsed). Additive JSX in `SessionReviewMode.tsx` only; no engine/recording code touched.

**Playwright** (`tests/integration/wb-session-review*.spec.ts` or the existing review spec, `@wb-recording @wb-chrome`)
- `review transcript is collapsed until Show transcript` — `wb-review-transcript` not visible; click toggle → visible with the seeded transcript text.
- `the notes surface stays above the fold with the transcript collapsed` — relational: notes surface top < viewport height.

**Risk:** low. Parallel-safe (file-disjoint from every other wave).

### W9 — Replay link reason (60)

**Waits for** the in-flight 60 report. Two outcomes:
- **Real bug** (note saved but replay ids not resolved): fix in the loader; Playwright `after the tutor saves, the child home shows View whiteboard and it opens the replay` (existing `wb-child-home.spec.ts` test must go red first on the reproduced condition — if it is currently green, the test was not reproducing Tyson's path; fix the test first).
- **Legitimately unavailable** (no board recording / still processing): render a one-line reason under the note using the same presentational `SessionEntryBlocked size="line"` with a replay reason table (`replay_processing`, `no_board_recording`, `note_not_saved`). Never a silently missing button.

Tier decided after the report (Grok if the loader fix is local; Sonnet if it touches note-visibility rules).

---

## 5. Five-axis adversarial review of this plan

BLOCKERs are already folded into the wave specs above; this table records them.

| Axis | Finding | Severity | Folded into |
|---|---|---|---|
| **Privacy / access** | LEAK-1: instructor sees all org appointments + learners by URL. | **BLOCKER** | W1 spec 1–3 (ships first) |
| Privacy / access | Roster merge could widen what an instructor sees (other instructors' learners, removed members, unclaimed merges). | **BLOCKER** | W5 spec 3, 6; Jest matrix; grep guard |
| Privacy / access | Org rows on personal surfaces could carry email/brief/consent fields. | **BLOCKER** | W3/W5 `select` assertions |
| Privacy / access | Reason copy could leak org-internal state to families. | **BLOCKER** | § 3 family column collapses to generic; W4 tests |
| Privacy / access | Private sessions/notes bleeding into org surfaces, or org sessions into the private share link. | **BLOCKER** | W5 spec 5 + two Playwright tests |
| Privacy / access | `lastActiveOrganizationId` used as authority. | SHOULD | W6: hint only, re-checked every read |
| **Silent failure** | A new reason code renders a blank line (today's 58 class). | **BLOCKER** | Exhaustive switch + `unknown` copy; W4 spec 1 |
| Silent failure | UI says "can open" while the server refuses (or the reverse). | **BLOCKER** | W4 spec 4 parity test |
| Silent failure | Replay button missing with no explanation (60). | **BLOCKER** | W9 |
| Silent failure | ICS feed and Schedule disagree. | SHOULD | W3 spec 3 (single predicate) |
| **Data integrity** | Merge accidentally writes/links records. | **BLOCKER** | W5 spec 7 (roster load writes nothing; DB row counts before/after) |
| Data integrity | Migration non-additive or cascade. | SHOULD | W6 nullable + `SetNull` |
| **Concurrency / timing** | Window opens or consent saves while the page is open; reason stale. | SHOULD | Join already ticks; Open room click returns the server refusal with the same reason code (W4 parity); no new polling |
| Concurrency / timing | Two tabs write last org. | NIT | last-write-wins, harmless |
| Concurrency / timing | Org suspended between render and click. | SHOULD | server refusal surfaces `org_inactive` line, not a silent redirect (W4 test fixture) |
| **Observability** | Bridge refusals not attributable. | SHOULD | `[slc] … action=schedule_bridge_refused reason=<code>` (W4) |
| Observability | Last-org write failure invisible. | NIT | `[org] action=last_org_write_failed` (W6) |

Platform: all new UI is admin/desktop-first; the family Join reason line is checked in Playwright WebKit (`iPhone 13`) in W4 per the 2026-10-11 WebKit lesson; real iOS stays a hardware row.

---

## 6. Sequencing

One branch (`feat/org-qol`), small commits, serial by default (shared working tree; another agent is active). "Disjoint" marks waves that touch no common files and may run in an isolated worktree if the conductor wants parallelism.

| Order | Wave | Files (primary) | Tier | Depends on |
|---|---|---|---|---|
| 1 | **W0** `@org` tag | `tests/test-tags.ts`, `scripts/wb-test-select.cjs`, spec tags | Grok (mechanical) | — |
| 2 | **W1** LEAK-1 | `schedule/actions.ts` (org list fns), `organization/[id]/page.tsx`, `org-learner.ts` | Grok exec → **Sonnet review** (access boundary) | W0 |
| 3 | **W8** transcript toggle | `SessionReviewMode.tsx` | Grok (mechanical) — **disjoint**, can run any time | — |
| 4 | **W2** `LinkRow` | `LinkRow.tsx`, `StudentsRoster.tsx`, `organization/page.tsx`, `orgs/page.tsx`, library doc | Grok (mechanical) | — (disjoint from W1) |
| 5 | **W3** Schedule + predicate | `tutor-appointments.ts`, `schedule/actions.ts` (tutor list), `schedule/types.ts` + mapper, `SchedulePageClient`, `load-ics-feed-sessions.ts`, `OrgBadge.tsx` | **Sonnet** design check of predicate → Grok exec → Sonnet review | W1 (same actions file) |
| 6 | **W4** entry reasons | `session-entry.ts`, `upcoming-sessions.ts`, `components/scheduling/*`, `SessionEntryBlocked.tsx`, `StartWhiteboardSession.tsx`, `students/[id]/page.tsx`, bridge log line | **Sonnet** (consent read + bridge parity) → Grok exec → Sonnet review | 58 report; W3 |
| 7 | **W6** nav + last org | migration, `admin-nav-links.ts`, `admin/layout.tsx`, `org-scope.ts`, `organization/page.tsx`, `OrgSwitcher.tsx` | Grok exec → Sonnet review | W2 |
| 8 | **W5** roster merge | `tutor-roster.ts`, `students/page.tsx`, `StudentsRoster.tsx`, `students/[id]/page.tsx`, org page `?learner=` | **Sonnet** design review → Grok exec → **Sonnet** review | W2, W3, W4, W6 |
| 9 | **W7** polish + glossary | `OrgSchedulePanel.tsx`, `CreateSessionDialog.tsx`, `OrgStaffHome.tsx`, `ConfirmActionDialog.tsx`, invite accepted page, `site-role-labels.ts` | Grok (mechanical) → Sonnet review | W5; Q2 answer for the roster label |
| 10 | **W9** replay reason | per 60 report | Grok or Sonnet per report | 60 report |

No Opus work is needed for most waves: no new architectural pillar, no fragile-surface engine change (W8 is additive JSX). **W4 is an exception (D3, 2026-10-29):** `sessionEntryState` becomes the enforcement rule at `startWhiteboardSession` and the schedule bridge, an auth-boundary change, so W4 is executed by Sonnet and reviewed by a separate Sonnet.

**Gates**

- Per commit: the wave's new tests red-before / green-after; `npm run test:wb-affected:run -- --base <commit before the wave>` (expands `@org` → `@wb-presence`).
- W3, W4, W5 touch `src/app/admin/students/[id]/page.tsx` and scheduling shared by the bridge: run `@wb-presence @wb-sync` tags in addition.
- Shared components (`LinkRow`, `CreateSessionDialog`, `SessionEntryBlocked`, `ConfirmActionDialog`): consumer grep + `npx next build`.
- End of pass: full `npm run test:wb-sync` on the integrated tip (long-running branch rule). `master` merge later still needs `test:wb-sync` + `test:regression` + `npx next build`.
- Packet: update items 5, 50, 52, 54, 58, 60 (and add rows for merge, switcher, transcript toggle) in `ORG-QOL-TYSON-TEST-PACKET.md` per `SMOKEBOOK-TEMPLATE.md`, `Coverage:` citing the tests above. Tyson/Andrew smoke only after all waves are DONE (`smoke-when-done.mdc`).

**Backlog entries to add** (`docs/BACKLOG.md`): `ORG-REMOVED-READONLY-ENTRY` (removed instructor has no route to the read-only sessions § 0 grants); `ORG-BOOKING-OVERLAP-SIGNAL` (overlap warning reveals instructor busy time to schedulers — accepted, note for org interviews).

---

## 7. Open questions for Andrew

Only two; everything else above is decided by your 2026-10-28 answers or by existing design.

1. **Org-only learner in the instructor's student list.** When an instructor has **no** private student for an org learner they're booked with, should that learner still appear in their Students list (badged `via {Org}`, opening the org view of just their appointments and sessions with that learner)? **Recommendation: yes** — it's what Tyson expected in item 52 and it gives the instructor one place to find everyone they teach. The alternative is that org-only learners live only under the Organization tab.
2. **Personal roster wording.** Your glossary rule (decision 7) means the personal Students page changes "Add learner" / "Add a learner" back to "Add student". That reverses copy Tyson already passed in items 9 and 61. OK to change?

## Andrew answers (2026-10-28 evening)

1. Org-only learner in an instructor's Students list: **yes**, badged "via {Org}", opening just that instructor's appointments and sessions with that learner.
2. **Glossary — APPROVED (Andrew 2026-10-29 15:35)** as in the table below, with "student" on the tutor's own screens (the menu stays "Students", and "Add learner" becomes "Add student"; this supersedes "do not flip passed wording" for that button). Apply it consistently on every signed-in screen. Public marketing pages are out of scope for this pass. One word per idea within each audience, chosen for that reader:

| Idea | Tutor's own screens | Organization staff screens | Family screens (parent, self-learner, child) | Site admin |
|---|---|---|---|---|
| Person teaching | tutor | instructor | your tutor (from an org: "your tutor at {Org}") | tutor (account); instructor (org role) |
| Person learning | student (open: "Add learner" already passed) | learner | your child (to a parent); you (to a self-learner or child) | learner |
| Adult account | parent / self-learner | parent / self-learner | label "Self learner / Parent" | account holder |
| Booked time | appointment | appointment | session | appointment |
| The lesson itself | session | session | session | session |
| Session type | Online / In person | Online / In person | Online / In person | Online / In person |
| The org | organization (never "org") | organization | organization | organization |

Resolved: tutor screens use "student" everywhere, including the add button and the roster label. Update Tyson packet items 9 and 61 in the same wave.

2a. Wording: Andrew did not mean to set a new blanket rule. Goal: language **consistent** AND **sensible to whoever is reading it** (audience-appropriate). Do NOT flip already-passed wording (e.g. "Add learner" in items 9/61) as part of these waves. Prepare a short audience-by-audience glossary proposal (tutor personal screens, org staff screens, parent/learner screens, site admin) for Andrew to approve; apply wording changes only after he approves it.

