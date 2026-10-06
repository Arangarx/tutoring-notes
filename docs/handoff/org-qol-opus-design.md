# Org + QoL — Opus design for the remaining stop points

**Branch:** `feat/org-qol`. **Plan:** `../../../../.cursor/plans/org_and_qol_slots_66b6a7a8.plan.md` (do not edit).
**Written:** 2026-10-06, Opus. Executors build against this. Anything this doc does not settle is a STOP back to the orchestrator.

## Already built by Opus (commit `edfdefd1`)

| Piece | Where |
|---|---|
| Additive migration `20261006120000_claim_target_schedule_bridge_live_key` (local test DB only; **prod Neon needs Andrew's go**) | `prisma/migrations/…` |
| Shared create core — the only path that mints a `WhiteboardSession` | `src/lib/whiteboard/create-session-core.ts` |
| Schedule bridge `getOrCreateWhiteboardForSchedule(scheduledSessionId, principal, rid, now?)` | `src/lib/whiteboard/schedule-bridge.ts` |
| Tutor action `openScheduledWhiteboardSession(scheduledSessionId)` → workspace (PENDING) | `src/app/admin/students/[id]/whiteboard/actions.ts` |
| Learner action `joinScheduledSession(scheduledSessionId)` → `/join/<wbsid>` or `{ error: "not_signed_in" \| "not_yet" \| "not_available" }` | `src/app/join/scheduled-actions.ts` |
| Join window rule (opens 15 min before start, closes at end) | `src/lib/scheduling/join-window.ts` |
| Server-held live key (encrypted at rest), seeded into `#k=` by `ServerLiveKeySeeder` on the tutor workspace and `/join` | `src/lib/whiteboard/live-key.ts`, `src/components/whiteboard/ServerLiveKeySeeder.tsx` |
| Parent joins as child: one rule `decideAhJoin` for `/join` and every API join route | `src/lib/join-scope.ts` |
| Strict claim invite: `intendedEmail` + `inviteTargetKind` stored at mint; completion refuses another email (`invite_email_mismatch`) and a kind mismatch (`invite_target_mismatch`) | `src/lib/claim-invite-service.ts`, `src/lib/roster-invite-target.ts`, `src/app/api/claim/[token]/complete/route.ts` |
| Midnight crossing: end clock before start clock ends on the next day | `src/lib/calendar/scheduled-session-datetime.ts` |
| Active graph embed stays interactive when its element object is replaced | `src/lib/whiteboard/active-embeddable-rebind.ts` (+ one additive hook call in `WhiteboardWorkspaceClient.tsx`) |

Rules for using them: never mint a whiteboard session any other way; never compute "near session time" any other way than `isWithinJoinWindow`; never authorize an account holder on a live session any other way than `decideAhJoin`.

## Wave B — bridge UI (Composer)

1. **Student detail — upcoming sessions.** On `/admin/students/[id]`, list this student's future `ScheduledSession` rows (by `startAt`), each with an "Open room" control that submits `openScheduledWhiteboardSession`. Declutter per the plan: this list replaces nothing else yet; keep it a library composition (`Card` + list row primitive already in `docs/V1-COMPONENT-LIBRARY.md`). If a row already has a whiteboard session, the control still calls the same action (it reuses).
2. **Calendar titles — first name + last initial.** Reuse the existing `firstNameLastInitial` in `src/lib/display-name-prefill.ts` (do not add a second) for ICS SUMMARY and Google event titles. Remove the per-student `icsShowFullName` checkbox from the UI. The column stays (additive rule); the read path ignores it.
3. **Family upcoming list.** On the account-holder dashboard (parent / self learner) and the learner dashboard (child login), list upcoming sessions for profiles that account can act for. Join is enabled only when `isWithinJoinWindow` is true for that row, and is prominent when enabled. Join submits `joinScheduledSession`. Show `not_yet` / `not_available` as plain copy, no detail on why.
4. **JoinAuthGate:** a child session visited while signed out offers both "Child sign in" and "Parent sign in" (parent goes to `/account/login` with return to the same `/join/<id>` path).
5. **Log with wbsid:** done in the bridge (`[slc] wbsid=… action=schedule_bridge scheduledSessionId=…`). Do not add other formats.

### Playwright (one named test each, `tests/integration/`, enrolled in `wb-regression`, tagged)

| Test | Oracle | Tags |
|---|---|---|
| Server-key join with no link | Tutor creates a session in the UI; student opens `/join/<id>` with **no** `#k=`; both reach connected and a stroke drawn by the tutor appears for the student | `@wb-sync @wb-presence` |
| Parent joins as child | Parent (AH session) opens the child's `/join/<id>`; shell renders; tutor sees the peer | `@wb-presence` |
| Another family's parent is refused | Lands on `/account/not-my-session` | `@wb-presence` |
| Dashboard Join opens the room | Seed a `ScheduledSession` starting in 5 min; parent clicks Join on the dashboard; lands in waiting room; tutor clicks Open room on student detail; same `wbsid` (assert URL ids equal); tutor Start → both ACTIVE; one stroke syncs | `@wb-sync @wb-presence` |
| Join disabled outside window | Session 2 h out: Join disabled | `@wb-chrome` |
| Graph stays interactive after an edit | Tutor clicks graph center (activates); peer edits the graph expression; tutor can still drag the board inside the graph (assert embed container still has the active state / pointer events on the iframe container, then a second interaction changes `graphStateJson` without a re-click) | `@wb-graph @wb-sync` |
| Midnight schedule | Create 23:30 + 90 min in the schedule form; saved row's `endAt − startAt` = 90 min (DB oracle) | `@wb-chrome` (or the scheduler's existing tag) |

Every test must be shown red on the pre-change commit (`9182f3f8` for bridge items) and green after.

### Legal (before master, `docs/LEGAL-SYNC.md`)

- `/privacy`: our server holds the live-session key for sessions created after this release, encrypted at rest; it is given only to the signed-in tutor and the signed-in learner or parent for that session. Product-specific section.
- Parent claim + consent copy: a parent can join a live session as their child.
- Org visibility copy lands with Wave C.

## Wave C — org first slice

### Data model (one additive migration, local test DB only; prod needs Andrew's go)

```prisma
enum OrganizationStatus { pending active suspended }
enum OrgRole { owner admin scheduler tutor }
enum OrgPlanKind { monthly quarterly yearly on_demand }

model Organization {
  id                 String             @id @default(uuid())
  name               String
  timezone           String             @default("America/Denver")
  status             OrganizationStatus @default(pending)   // operator-only writes
  requireTutorAccept Boolean            @default(false)
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt
  members            OrganizationMember[]
  invites            OrganizationInvite[]
  notePrompts        OrganizationNotePrompt[]
  billingEntries     OrganizationBillingEntry[]
  scheduledSessions  ScheduledSession[]
}

model OrganizationMember {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  adminUserId    String
  adminUser      AdminUser    @relation(fields: [adminUserId], references: [id], onDelete: Cascade)
  roles          OrgRole[]
  createdAt      DateTime     @default(now())
  removedAt      DateTime?
  @@unique([organizationId, adminUserId])
  @@index([adminUserId])
}

model OrganizationInvite {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  email          String       // normalized; only this AdminUser email may accept
  roles          OrgRole[]
  tokenHash      String       @unique
  expiresAt      DateTime
  acceptedAt     DateTime?
  revokedAt      DateTime?
  invitedByAdminUserId String
  createdAt      DateTime     @default(now())
}

model OrganizationNotePrompt {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  label          String
  required       Boolean      @default(false)
  sortOrder      Int          @default(0)
  archivedAt     DateTime?
  answers        SessionNoteOrgAnswer[]
}

model SessionNoteOrgAnswer {
  id             String                 @id @default(uuid())
  sessionNoteId  String
  sessionNote    SessionNote            @relation(fields: [sessionNoteId], references: [id], onDelete: Cascade)
  promptId       String
  prompt         OrganizationNotePrompt @relation(fields: [promptId], references: [id], onDelete: Restrict)
  answer         String
  includeInShare Boolean                @default(false)
  @@unique([sessionNoteId, promptId])
}

model OrganizationBillingEntry {
  id                  String       @id @default(uuid())
  organizationId      String
  organization        Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  plan                OrgPlanKind
  periodStart         DateTime     @db.Date
  periodEnd           DateTime     @db.Date
  amountOwedCents     Int
  note                String       @default("")
  createdByOperatorId String
  createdAt           DateTime     @default(now())
}

// ScheduledSession additions (all nullable):
//   organizationId String?  (+ relation, onDelete SetNull, @@index)
//   placedByAdminUserId String?
//   tutorAcceptedAt DateTime?
```

### Server checks — `src/lib/org-scope.ts` (single canonical module)

- `getActiveOrgRoles(adminUserId, organizationId): OrgRole[]` — empty when not a member or `removedAt` set.
- `assertOrgRole(organizationId, allowed: OrgRole[])` — resolves the caller via `requireStudentScope` (admin kind only), `notFound()` when the caller holds none of `allowed`. Cross-org = not found. **Never** consulted by `assertOwnsStudent`; `assertOwnsStudent` is unchanged.
- Org roles never grant `AdminRole.ADMIN` powers: org routes live under `/admin/org/[orgId]/…`, never under operator routes; add a test that an org owner gets 404/redirect on an operator route and impersonation start.
- Visibility projection `listOrgSessions(orgId, viewerRoles, range)` returns rows of `{ startAt, tutorDisplayName, learnerDisplayName (first + last initial), billableMinutes?, notesDone? }`. `billableMinutes` and `notesDone` are present only for owner/admin. Scheduler gets schedule + names only. Tutor role alone sees no org list (they keep their own students). No note text, no board, no audio, no share links in any org projection. Log every view: `[org] org=<id> action=metadata_view actor=<adminUserId> roles=<…>`.
- **Waitlist skip:** accepting an org invite approves a WAITLISTED tutor only when the org status is `active`; a `pending`/`suspended` org's accept creates the membership but leaves approval unchanged. Log `[org] … action=member_added waitlist_skip=yes|no`. Use the existing `approveTutor` in `src/lib/tutor-approval-scope.ts` (no second approval path) and also log its `[tap]` line.
- **Removal:** sets `removedAt`. Live sessions are untouched (no check on heartbeat, join, end, or upload). The schedule bridge refuses to **create** a session for an org-placed appointment (`ScheduledSession.organizationId` set) when the appointment's tutor is no longer an active member: add that check inside `getOrCreateWhiteboardForSchedule` before calling the core, and keep returning an existing session (a session already created stays reachable). Test both.
- **Place a session on a tutor:** owner/admin/scheduler create a `ScheduledSession` with `organizationId`, `placedByAdminUserId`, the tutor's own `Student` row for that learner (the org never creates Student rows on a tutor's behalf in this slice — if the tutor has no Student for that learner, refuse with plain copy). When `requireTutorAccept`, the bridge treats an unaccepted org appointment as `not_available` for the learner side and the tutor sees an Accept control. Overlap warning (not a block) using `startAt`/`endAt` against the tutor's other appointments, including midnight-crossing ones. "This week" uses `Organization.timezone`.
- **Reassignment:** future appointments only (`startAt > now`). Target tutor must be an active org member **and** already have a `Student` row linked to the same `learnerProfileId`. Moving changes `adminUserId` and `studentId` on the appointment; no past `WhiteboardSession`, audio, or note moves; consent does not move (the bridge's consent gate covers the new tutor). If the appointment already has a whiteboard session, refuse (it belongs to the old tutor). Log `[org] … action=reassigned from=<id> to=<id> scheduledSessionId=<id>`.
- **Note prompts:** answers stored in `SessionNoteOrgAnswer`; save of a note for an org tutor's org-placed session refuses when a required prompt is empty; ending the live session and the billable clock never consult prompts. Parent share render excludes answers unless `includeInShare`.
- **Manual org bill:** operator-only writes (`AdminRole.ADMIN`); org owner reads history. Not family billable time, not tutor pay.
- **2FA:** org owner/admin screens require the existing tutor 2FA step-up (`verifyTotpStepUp` in `src/lib/two-factor-step-up.ts`); no new factor.

### 5-axis review — required before Wave C code

Dispatch a Sonnet review of this section (auth boundary). BLOCKERs fold into Wave C acceptance. The executor does not start Wave C until the orchestrator records the review outcome.

### Org Playwright (minimum)

Owner sees tutor rows with billable minutes; scheduler sees the same rows without minutes; a second org's owner sees nothing; removed tutor's in-progress session still ends cleanly; removed tutor cannot open a new org appointment's room; reassigned appointment opens for the new tutor only after they have consent; solo tutor sees no org chrome anywhere. Tags: `@wb-presence` for the session ones, `@wb-chrome` for screens (add an `@org` tag in `tests/test-tags.ts` and the selector map if missing).

## Wave D — graph point and free draw (Opus-reviewed design, Composer builds)

- Extend `GraphState` (in the graph-state module that `persistGraphElementState` serializes) with `points: { id, x, y }[]` and `strokes: { id, pts: [x, y][] }[]` in **graph user coordinates**, so they survive pan/zoom of the graph and resize of the embed.
- Mode control inside the graph chrome: Pan (default) / Point / Draw. Point: click adds a point (JSXGraph point, fixed, non-draggable in this slice). Draw: pointer down → move collects user coords (throttled to ~30 Hz) → pointer up persists **once** (one `persistGraphElementState` per stroke, never per move). Eraser and undo are out of scope.
- Decoding is tolerant: missing `points`/`strokes` = empty, so old boards and old peers render unchanged; an old peer receiving new state ignores unknown fields (verify against the actual parser).
- The click-to-interact rebind above is a prerequisite (each persist replaces the element).
- Playwright `@wb-graph @wb-sync`: tutor adds two points and one stroke; student sees both points and the stroke at the same graph coordinates (oracle: board-to-user transform from JSXGraph on each peer, not pixels); reload restores them; the graph stays interactive across the persist.

## Not in scope (plan do-not-build)

Phone shape control, triangle tool, text size and box bounds, Actual vs Billable labels, restricting parent join for children with their own login, org staff opening boards/audio/notes, personal calendar push, tutor pay, note form builder.
