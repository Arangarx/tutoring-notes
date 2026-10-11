# Org learner slice — design (slice 2 of org)

- **Branch:** `feat/org` (worktree `tn-org`), designed against tip `d0de131a`.
- **Status:** design only. No code, tests, migrations or schema in this commit.
- **Contract this design is built from:** `docs/handoff/org-qol-opus-design.md` on `feat/org-qol`. Its sections "Learner model decisions (Andrew, 2026-10-06, second pass)" and "Learner model, third pass" are the contract. Where they conflict with earlier Wave C bullets, they win. Every overridden bullet is listed in § 10.
- **Slice 1 (shipped, Sonnet-approved at `d0de131a`):** operator-created org, members, invites, roles (`owner`, `admin`, `scheduler`, `instructor`). This design calls slice 1 and does not redesign it (§ 9).
- **Log prefix:** `[org]`. Never log a token, a guest code, or an email (not even hashed).

---

## 0. Andrew, 2026-10-07 — assignment, roster, and consent

This pass supersedes the Q1–Q8 defaults below, and it supersedes any later section that treats "assignment ended" as a normal lifecycle. The body of this doc is not rewritten yet. Where they conflict, this section wins.

**Scheduling is the relationship.** An org learner can have lessons with more than one tutor, for example two subjects. The org decides who teaches which lesson by scheduling it. Keeping the same tutor is a scheduling choice, not a hard lock that one tutor owns the learner.

**Taking a tutor off a live session is a deliberate cancel.** It is not something that falls out of "unassigning" a learner. Someone at the org would be ending that open session on purpose.

**The access cut is removal from the org roster.** A tutor who is still a member keeps access to the org sessions they teach, including replay of the board, audio, and transcript for their own sessions (Andrew: yes to replay). Booking a different tutor next week does not create an "after unassignment" state.

**After removal, org sessions are read-only (Andrew 2026-10-07).** Sessions the org initiated, that this tutor taught, stay readable and stop being writable. Personal students are a different record and are not part of this cut. Later, the org may choose what a removed tutor keeps, including cutting them off entirely (for example after a removal for behavioral issues). That choice waits on org feedback. The default until then is read-only.

**A live org session requires a Mynk account.** Anonymous guest links are out. "Do not record" does not cover consent to be in an online session at all (COPPA). Signing up for tutoring with the org includes creating a Mynk account. The signup can be branded for the organization. Consent to be online is collected there, before the first session. A later lightweight login, if any, still has to be a specific person who already consented, so we know it is the same person.

**Suspended or not-yet-approved org.** A session already live may finish. It must not be able to run out to the normal runaway guard (`SESSION_SAFETY_MAX_SECONDS`, 8 hours in `src/lib/recording/segment-policy.ts`). For a **suspended** org (Andrew 2026-10-07): show a pill that the session will force end because the organization that set up the tutoring has had its account suspended. Force-end is the end of the current clock hour, with a floor of 10 minutes from the moment of suspension. Five minutes left in the hour still means 10 minutes before force close. The same timing covers a session already live while the org is not yet approved. The pill copy above is the suspension copy.

**Scheduler.** The scheduler sees the learner's full name and the brief, and not parent contact, consent detail, or notes. Seeing more means holding another role as well (admin or owner), not widening scheduler.

**Erasure.** Today the in-app control is operator-only (`/admin/erasure`: "Operator-only. Use for verified parental erasure requests."). A person who only came in through an org can ask Mynk directly. The org may pass a request along. The org is not the only door. The operator still performs the erasure, same as a verified parent request today.

**Schedule bridge.** This is the scheduled-session join work on `feat/org-qol` (open the room from an appointment, 15-minute join window, server-held key, parent can join as the child). It is not org code. `feat/org` was cut from master before that work, so it does not have the bridge. No org features are on the branch Tyson is testing. Slice 2 should call that bridge after `feat/org-qol` is on master, and must not copy it.

**Closed 2026-10-07 (later the same day)**

- Removed tutor: org-initiated sessions they taught become read-only. A later org setting may retain less, including nothing. Default is read-only until orgs are asked.
- Suspended org: pill as above. Force-end at the end of the current clock hour, and never sooner than 10 minutes after suspension.

## 0b. Earlier open questions (superseded 2026-10-07)

The table is the questions as asked. The answers are in § 0. Do not build to the old defaults.

| # | Question | Default until answered |
|---|---|---|
| Q1 | When an assignment ends while a session is live or just finished, may the tutor still **finish and send** the draft note for that session? The decision says "read-only after the end", but a draft written after that point would never reach the family. | Strict read-only. The draft stays a draft and the family gets nothing for that session. The scheduler sees "note not finished" on the flagged list. |
| Q2 | While the assignment is **active**, may the tutor replay the board, play the audio, and read the transcript of **their own** org sessions? The decision lists notes, and is silent on replay. | Yes while active, for their own sessions only. After the end, notes only (that part is decided). |
| Q3 | For a learner with **no parent contact**, the per-tutor approval cannot be asked for. Is the approval skipped (live session, no recording), or is Join blocked? | Skipped. The session runs live with nothing recorded. The approval state is `not_required`, and it flips to `pending` once a parent contact is added. |
| Q4 | **Suspended org:** may new org sessions start? | No new org session is created while the org is `suspended` or `pending`. Live sessions finish. Instructors keep read access to their own notes. |
| Q5 | Does the org **scheduler** see the learner's full name? (Owner and admin do, since the org wrote the record.) | Yes, full name and brief. No parent contact, no consent detail beyond a status word, no notes. |
| Q6 | When an org learner is linked to an account **after** some guest sessions, do those earlier sessions show on the learner's dashboard? | Yes. They belong to the same org learner record. Guest upgrade (turning a guest in the room into an account) stays out of scope. |
| Q7 | Who may **request erasure** of an org learner? | Operator only, which is today's v1 rule. An org owner asks the operator. |
| Q8 | **Sequencing:** this slice builds on the schedule bridge (`src/lib/whiteboard/schedule-bridge.ts`), which exists only on `feat/org-qol`. `feat/org` does not have it. | `feat/org-qol` reaches `master` first, then `feat/org` merges `master` before slice 2 code starts. Slice 2 must not copy the bridge. |

---

## 1. Scope

### In this slice

1. An org-owned learner record (`OrganizationLearner`), created by the owner or admin, with a short brief (grade, subject, goals) and an optional parent email.
2. Linking that record to an existing `LearnerProfile` through a parent claim. The parent signs in and picks or creates the learner. This uses the existing claim machinery.
3. Instructor **assignments**: create, end, and reassign future appointments.
4. **Org consent**: one versioned record per (learner, org), collected in-app through an emailed link before the first session.
5. **Per-tutor parent approval** on every assignment, with "Waiting on your approval" and Join off until approved.
6. **Org placement** of appointments through the existing schedule bridge, without ever creating a personal `Student` for the instructor.
7. **Guest sessions**: a per-session guest link plus a short code. The learner types a first name, the tutor admits them from the waiting room, and the pass expires when the session ends.
8. Learner and parent surfaces: dashboard labels "with <tutor>" / "via <org>", plus an Organizations page with each org, what it can see, consent, and approvals.
9. The instructor's restricted view and the org staff's view, both through the **same** student components, parameterized by access scope.
10. Full note text to the org, gated by an operator-set per-org switch **and** the parent's consent.
11. Erasure of org learners through `process-erasure-job.ts`, plus scrubbing `ScheduledSession` free text for every erased learner (personal included).
12. Privacy copy plus an "arranged via <org>" label for families.
13. Flagged-appointment list for the scheduler: future appointments whose assignment is no longer active.

### Explicitly out

- Guest upgrade from inside the room (turning a guest into an account).
- Org-issued learner logins.
- The non-compete audit. The design must not block it (§ 7, privacy axis), and nothing here builds it.
- Bringing a personal student into an org.
- Extra org retention agreements beyond what a tutor keeps.
- Org note prompts and `SessionNoteOrgAnswer`, plus org billing entries. These are the next slice. This doc fixes their access rows (§ 3) and erasure duty (§ 4.9) so that slice cannot drift.
- Guest links for **personal** students. In this slice, guest passes exist only for org learner sessions.
- Ad hoc (unscheduled) org sessions. Org sessions start only from an org appointment, because the bridge is the one place the org gates live. *Rejected alternative:* allowing the instructor's "Start session" button on an org learner. That would need every org gate duplicated in the ad hoc path.
- Manual (no-session) notes on an org learner. Org notes are born from sessions, so their author is unambiguous. *Rejected alternative:* manual org notes with an author picker.
- Archiving or deleting an org learner record (other than erasure).
- The tutor-accept flag (`requireTutorAccept` / `tutorAcceptedAt`) from the old Wave C list. See § 10.

---

## 2. Data model (one additive migration)

The migration runs on the local test DB only. Production needs Andrew's explicit go, per AGENTS.md. Nothing is dropped or renamed.

### 2.1 The central choice: the org learner is its own `Student` row, owned by the org

Every content table already hangs off `Student.id` with a required foreign key: `WhiteboardSession.studentId`, `SessionNote.studentId`, `SessionRecording.studentId`, `ShareLink.studentId` and `ScheduledSession.studentId`. Erasure, blob inventory, share pages, the notes bridge (`nsi`) and the learner dashboard all walk `Student`.

So an org learner is **a separate `Student` row** with:

- `organizationId` set, and
- `adminUserId` **null, permanently**.

A tutor who also teaches the learner personally has a different `Student` row (`adminUserId = tutor`, `organizationId = null`). That gives the "two records" the decision asks for. Both rows may point at the same `LearnerProfile`.

**Refused overloads:**

- `Student.adminUserId` is **never** set on an org row, and org access is **never** derived from it. Org access comes only from `OrganizationLearnerAssignment` (§ 2.4).
- `ConsentRecord` (keyed on learner + tutor) is never used for org sessions. Org consent is its own table (§ 2.5).
- `WhiteboardJoinToken` (plaintext token, retired anonymous path) is not revived for guests (§ 2.8).
- `StudentClaimInvite` is reused unchanged for the parent claim. Its `adminUserId` is the org staff member who minted it; the claim flow is extended by relationship (§ 4.2).

*Rejected alternative:* a standalone `OrgLearner` table with a nullable `orgLearnerId` added to every content table. That forks notes, sessions, recordings, share links, erasure and the dashboard into two parallel paths, which the no-duplication rule forbids and the "one student surface" decision forbids by name.

**The hazard this choice creates, and its fix (BLOCKER B1):** `canAccessStudentRow` and `studentsWhereForScope` in `src/lib/student-scope.ts` treat `adminUserId = null` as "belongs to the env-only admin login". `src/app/admin/outbox/page.tsx` and `src/app/api/audio/admin/[recordingId]/route.ts` filter on `adminUserId: null` the same way. As written today, every org learner would leak to the env login. The fix is a **narrowing**, not a bypass:

- the env branch also requires `organizationId: null` in all three places, and
- a DB CHECK constraint guarantees no row is both tutor-owned and org-owned.

### 2.2 `Student` (extend)

```prisma
model Student {
  // ... existing fields unchanged ...
  /// Org learner discriminator. Set = the org owns this record; adminUserId is then null forever.
  organizationId String?
  organization   Organization?        @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  orgLearner     OrganizationLearner?

  @@unique([organizationId, learnerProfileId]) // one org record per learner per org
  @@index([organizationId])
}
```

Raw SQL in the same migration:

- `ALTER TABLE "Student" ADD CONSTRAINT student_single_owner CHECK (NOT ("adminUserId" IS NOT NULL AND "organizationId" IS NOT NULL));`

Postgres treats nulls as distinct in a unique index. So the existing `@@unique([adminUserId, learnerProfileId])` does not cover org rows, and the new `@@unique([organizationId, learnerProfileId])` does.

### 2.3 `OrganizationLearner` (new, 1:1 with the org `Student` row)

```prisma
model OrganizationLearner {
  id                   String       @id @default(uuid())
  studentId            String       @unique
  student              Student      @relation(fields: [studentId], references: [id], onDelete: Restrict)
  organizationId       String
  organization         Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  /// Structured name. The single writer keeps Student.name = "<givenName> <familyName>".
  givenName            String
  familyName           String
  briefGrade           String       @default("")   // max 40
  briefSubject         String       @default("")   // max 80
  briefGoals           String       @default("")   // max 500
  createdByAdminUserId String
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt
  assignments          OrganizationLearnerAssignment[]
  consentRecords       OrganizationConsentRecord[]
  parentLinks          OrganizationParentLink[]
  @@index([organizationId])
}
```

- **Why structured names:** the instructor sees "first name + last initial". Splitting a free-text `Student.name` is unreliable.
- **Single writer:** one function, `writeOrgLearnerName(tx, orgLearnerId, given, family)`, is the only code that writes the name. It also writes `Student.name`, and a test asserts the two never drift.
- **Parent contact** stays in `Student.parentEmail`, which is already the single source and is already nulled by erasure. The instructor projection never selects it.
- **Why a side table** rather than columns on `Student`: org-only fields (brief, structured name) stay off the shared tutor model.

### 2.4 `OrganizationLearnerAssignment` (new)

```prisma
enum OrgAssignmentParentDecision { pending approved declined not_required }
enum OrgAssignmentEndReason { ended_by_staff reassigned member_removed instructor_role_removed parent_declined }

model OrganizationLearnerAssignment {
  id                    String                      @id @default(uuid())
  organizationId        String
  organization          Organization                @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  orgLearnerId          String
  orgLearner            OrganizationLearner         @relation(fields: [orgLearnerId], references: [id], onDelete: Restrict)
  instructorAdminUserId String
  instructor            AdminUser                   @relation("OrgAssignmentsAsInstructor", fields: [instructorAdminUserId], references: [id], onDelete: Restrict)
  memberId              String
  member                OrganizationMember          @relation(fields: [memberId], references: [id], onDelete: Restrict)
  createdByAdminUserId  String
  createdAt             DateTime                    @default(now())
  parentDecision        OrgAssignmentParentDecision @default(pending)
  parentDecidedAt       DateTime?
  /// "account_holder:<id>" | "parent_link:<id8>"
  parentDecidedVia      String?
  endedAt               DateTime?
  endReason             OrgAssignmentEndReason?
  /// "admin:<id>" | "operator:<id|email>" | "system:<reason>"
  endedByPrincipal      String?
  scheduledSessions     ScheduledSession[]
  @@index([organizationId, endedAt])
  @@index([instructorAdminUserId, endedAt])
  @@index([orgLearnerId])
}
```

Raw SQL: one active assignment per (learner, instructor).

```sql
CREATE UNIQUE INDEX org_assignment_one_active
  ON "OrganizationLearnerAssignment" ("orgLearnerId", "instructorAdminUserId")
  WHERE "endedAt" IS NULL;
```

**How an assignment relates to membership.** An assignment is tied to the instructor's `OrganizationMember` row (`memberId`). One predicate, `isAssignmentActive`, in `src/lib/org-learner-scope.ts`, is the **only** definition of "active". It is true only when all of these hold:

- `assignment.endedAt` is null;
- the member row has `removedAt = null` and its roles include `instructor`;
- the org `status` is `active` (Q4);
- the org learner's `Student.erasedAt` is null, and there is no active `ErasureJob` (the existing `assertStudentNotErased`).

Removal and role changes also **end** assignments for real (§ 9 hook). The predicate is the safety net, and the end-row is the durable record.

The end-row matters because slice 1 reactivates the **same** member row on re-invite. Without it, a removed-then-re-invited instructor would silently regain access to old learners. With it, an ended assignment never comes back to life.

The parent decision gates **Join** (§ 4.4). It does not gate `isAssignmentActive`. A `pending` assignment is active for reading the brief, so the instructor can prepare, but no session can start.

### 2.5 `OrganizationConsentRecord` (new, the per-(learner, org) consent)

```prisma
model OrganizationConsentRecord {
  id                       String              @id @default(uuid())
  orgLearnerId             String
  orgLearner               OrganizationLearner @relation(fields: [orgLearnerId], references: [id], onDelete: Restrict)
  organizationId           String
  organization             Organization        @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  version                  Int
  allowLiveSession         Boolean
  allowAudioRecording      Boolean
  allowWhiteboardRecording Boolean
  /// Parent names this org as allowed to read full note text. Only effective when
  /// Organization.shareFullNotesWithOrg is also on (operator-set).
  allowOrgFullNotes        Boolean
  /// "account_holder" (signed-in parent) | "emailed_link" (no account)
  captureMethod            String
  setByAccountHolderId     String?
  setViaParentLinkId       String?
  setAt                    DateTime            @default(now())
  @@unique([orgLearnerId, version])
  @@index([organizationId])
}
```

- **Keyed on the org learner record**, not on `LearnerProfile`. The org learner row is unique per (org, learner), so this is exactly "one consent per (learner, org)". It also works for learners with no account.
- **Append-only and versioned**, with `Restrict` foreign keys, mirroring `ConsentRecord`. It is a legal record and is never deleted, including by erasure (§ 4.9). The Privacy copy must say so (§ 7, privacy axis).
- **Who may write a version:** when the org learner is linked to a `LearnerProfile`, only a signed-in account holder who owns that profile may. The emailed link then lands on account login. Otherwise the writer is whoever holds an unexpired `OrganizationParentLink` sent to `Student.parentEmail`. *Rejected alternative:* the email link alone even when an account exists. It is weaker, and the stronger check already exists.

`SessionConsentSnapshot` (extend, additive):

```prisma
  orgConsentRecordId      String?
  orgConsentRecordVersion Int?
  /// Frozen at session start; full-notes access for the org needs this AND the current record.
  allowOrgFullNotes       Boolean @default(false)
```

### 2.6 `OrganizationParentLink` (new, emailed link for consent and approval)

```prisma
enum OrgParentLinkPurpose { consent approval }

model OrganizationParentLink {
  id             String               @id @default(uuid())
  orgLearnerId   String
  orgLearner     OrganizationLearner  @relation(fields: [orgLearnerId], references: [id], onDelete: Restrict)
  organizationId String
  purpose        OrgParentLinkPurpose
  assignmentId   String?              // set when purpose = approval
  tokenHash      String               @unique
  expiresAt      DateTime             // reuse CLAIM_INVITE_TTL_MS
  consumedAt     DateTime?
  revokedAt      DateTime?
  createdByAdminUserId String
  createdAt      DateTime             @default(now())
  @@index([orgLearnerId])
}
```

- Use the token helpers from `src/lib/crypto/session-tokens.ts` (`generateRawToken`, `hashToken`) that slice 1 already uses.
- Each link is single-use, consumed with a conditional `updateMany`.
- Every live link for a learner is revoked when `Student.parentEmail` changes.

### 2.7 `Organization`, `ScheduledSession`, `SessionNote` (extend)

```prisma
model Organization {
  // ... slice 1 fields unchanged ...
  /// Operator-only. Org owner/admin may read full note text only when this is on AND
  /// the parent's current consent AND the session snapshot both allow it.
  shareFullNotesWithOrg Boolean @default(false)
}

model ScheduledSession {
  // ... existing fields unchanged; adminUserId stays the assigned instructor ...
  organizationId      String?
  organization        Organization?                  @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  orgAssignmentId     String?
  orgAssignment       OrganizationLearnerAssignment? @relation(fields: [orgAssignmentId], references: [id], onDelete: Restrict)
  placedByAdminUserId String?
  @@index([organizationId, startAt])
  @@index([orgAssignmentId])
}

model SessionNote {
  // ... existing fields unchanged ...
  /// Author. Required by code for notes on org learner rows; null on personal rows (owner implied).
  authorAdminUserId String?
  author            AdminUser? @relation("SessionNoteAuthor", fields: [authorAdminUserId], references: [id], onDelete: Restrict)
  @@index([studentId, authorAdminUserId])
}
```

Raw SQL invariant for org placements, checked in code and by test. The two org columns on `ScheduledSession` are set together or not at all:

```sql
CHECK (("organizationId" IS NULL) = ("orgAssignmentId" IS NULL))
```

- **"Flagged for the scheduler"** is not a column. It is derived: future org appointments whose assignment fails `isAssignmentActive`. *Rejected alternative:* a `flaggedAt` column. It can drift from the truth, and a derived flag cannot.
- **`SessionNote.authorAdminUserId`** is needed because "own notes" cannot be derived reliably today. One note can collect several whiteboard sessions (`WhiteboardSession.noteId`). The notes bridge sets the author from `WhiteboardSession.adminUserId` when it creates the draft. An org note with a null author is readable by no instructor, so it fails closed.

### 2.8 Guest session tables (new; a guest is never a `LearnerProfile`)

```prisma
model SessionGuestPass {
  id                   String            @id @default(uuid())
  whiteboardSessionId  String            @unique   // one live pass per session; reissue = rotate
  whiteboardSession    WhiteboardSession @relation(fields: [whiteboardSessionId], references: [id], onDelete: Cascade)
  organizationId       String
  tokenHash            String            @unique
  codeHash             String            // 6 chars, unambiguous alphabet, hashed
  failedCodeAttempts   Int               @default(0)
  lockedAt             DateTime?         // at 5 failures; tutor reissues
  expiresAt            DateTime          // min(schedule endAt + 15 min grace, hard cap); also dead once session.endedAt set
  revokedAt            DateTime?
  createdByAdminUserId String
  createdAt            DateTime          @default(now())
  participants         SessionGuestParticipant[]
}

model SessionGuestParticipant {
  id                   String            @id @default(uuid())
  guestPassId          String
  guestPass            SessionGuestPass  @relation(fields: [guestPassId], references: [id], onDelete: Cascade)
  whiteboardSessionId  String
  displayName          String            // typed first name, trimmed, max 30
  /// HMAC of the guest's HttpOnly cookie token (same pattern as AccountHolderSession).
  guestTokenHash       String            @unique
  /// Guest's ephemeral ECDH P-256 public key (JWK) — see § 4.8 key delivery.
  guestPublicKeyJwk    String
  wrappedRoomKey       String?           // set by the tutor client on Admit; server cannot read it
  tutorPublicKeyJwk    String?
  admittedAt           DateTime?
  admittedByAdminUserId String?
  deniedAt             DateTime?
  leftAt               DateTime?
  createdAt            DateTime          @default(now())
  @@index([whiteboardSessionId])
}
```

- A guest has **no** `SessionParticipant` row, because that table requires a `learnerProfileId`. A guest therefore never appears on any learner dashboard.
- The org learner record the session belongs to is still `WhiteboardSession.studentId`. That is how the session counts as "this org learner's session".

### 2.9 `ErasureScopeKind` (extend)

Add the value `org_learner` (`scopeId = OrganizationLearner.id`) for org learners with no linked `LearnerProfile`. Linked org learners are already reached by the existing `learner_profile` and `account_holder` scopes, which walk `Student.learnerProfileId`. The executor must confirm that `blob-inventory.ts` picks up org rows that way, and test it.

---

## 3. Access matrix

**Terms used in the table:**

- **OL** = an org learner record.
- **Own session / own note** = `WhiteboardSession.adminUserId` = me, or `SessionNote.authorAdminUserId` = me.
- **Active assignment** = an assignment for which `isAssignmentActive` is true.

Anything not listed is denied, and every denial is a 404 (`notFound()`), so a probe cannot tell "exists" from "forbidden".

| Actor | Can read | Can write | Never |
|---|---|---|---|
| **Operator** (`requireOperator`) | Org metadata, `shareFullNotesWithOrg`, the flagged list (support). Learner content only through existing audited impersonation. | Org status/caps (slice 1); `shareFullNotesWithOrg`; erasure requests (`org_learner` scope or existing scopes); revoke parent links. | — |
| **Owner** | Their org's learners: full name, brief, parent email, link status (linked yes/no; never *which* profile or anything else about it). Assignments and approval states. Consent: current version's booleans and date. Org sessions list (date, duration, instructor, learner name). Flagged list. Full note text only when all three hold: `shareFullNotesWithOrg` is on, the current consent has `allowOrgFullNotes`, and the session snapshot has `allowOrgFullNotes`. Prompt answers (next slice). | Create/edit learner and brief; set parent email (revokes live parent links); send consent link; send claim invite; create/end assignment; place, reschedule, reassign future appointments. | Board, audio, transcripts. Anything about the learner's personal-tutor relationships. Any data of another org. |
| **Admin** | Same as owner. | Same as owner. | Same as owner. |
| **Scheduler** | Learner full name and brief (Q5); assignment list with approval *status word*; org sessions list without durations or billing; flagged list. | Place, reschedule, reassign future appointments; create/end assignments. | Parent email, consent details, notes, prompt answers, content. |
| **Instructor, active assignment** | First name + last initial; brief; **own** notes on this OL; own sessions' replay, audio and transcript (Q2 default); their org appointments for this OL, also in their own calendar views and feeds, labelled "via <org>". | Run sessions from their org appointments (bridge); edit and send their own notes on this OL; issue the guest pass for their own org session; admit or deny guests. | Full name, parent email, other tutors' notes or sessions, consent records, any org list beyond their assigned learners. |
| **Instructor, assignment pending parent approval** | Same reads as active. | Nothing session-related. Join is off ("Waiting on family approval"). | Same as active. |
| **Instructor, ended assignment** (any reason) | **Own notes on this OL, read-only.** The learner's label in that list is first name + last initial. | Nothing. A session that was **live** at end time may still heartbeat, upload, and end (slice 1 removal rule). | Brief, replay, audio, transcripts, appointments, guest passes, sending notes (Q1). |
| **Instructor, removed from org** | Same as ended assignment: all their assignments in that org are ended `member_removed`. | Same as ended. | Same as ended. |
| **Any tutor via a personal `Student` for the same learner** | Their personal record, exactly as today. | As today. | Any org session, note, appointment or consent through the personal record (§ 5). |
| **Parent, signed-in account holder owning the linked profile** | Dashboard sessions labelled "via <org>"; Organizations page (orgs, what each can see, current consent, assignments with tutor display name and approval state); org share link notes. | Org consent versions; approve or decline assignments; erasure request through the existing operator path (Q7). | Org staff list, other learners, prompt answers (unless `includeInShare`, next slice). |
| **Parent, emailed link only (no account)** | The one consent or approval page the link names, with org name and tutor display name. | One consent version, or one approval decision, per link. | Everything else. A spent or expired link is a neutral "This link is no longer valid". |
| **Learner (own `LearnerProfile` session)** | Dashboard with every session labelled; Organizations page read-only. | Join their own org appointments when `isScheduleJoinable` says so. | Consent edits (account holder only, unless self-learner). |
| **Guest** (pass + code, not yet admitted) | A waiting screen showing their typed name. | Nothing. | Room key, board, A/V, assets. |
| **Guest, admitted** | That one session's live room until it ends. | Draw/talk in that session; whiteboard asset upload for that session only. | Any other route, session, dashboard, note or share page. |
| **Member of a different org** (any role) | Nothing. | Nothing. | Every org lookup is `where: { id, organizationId }` after `assertOrgRole` → 404. |
| **Env-only admin login** | Nothing org (B1 fix). | Nothing org. | — |

**Never in any org-facing projection:** whether an OL's `LearnerProfile` is linked to any personal `Student`, which tutors teach the learner personally, or any field read through `LearnerProfile.students`. This is "the org never learns".

---

## 4. Flows

Each flow names its `[org]` log action and writes a `ProductEvent` row for org mutations, per the slice 1 convention.

### 4.1 Create org learner

1. `assertOrgRole(orgId, ["owner","admin"])` (slice 1).
2. Validate the names (non-empty, lengths), the brief lengths, and the email (`normalizeEmail`) if one is given.
3. In one transaction: create the `Student` (`organizationId = orgId`, `adminUserId = null`, `name` via `writeOrgLearnerName`, `parentEmail`), then the `OrganizationLearner`.
4. Log `[org] org=<id> action=learner_created actor=<adminId> ol=<id8>`.
5. No consent link is sent automatically. Sending is an explicit action (4.3) so staff can check the email first.

### 4.2 Link to an account (parent claim)

1. Owner or admin clicks "Invite family to connect". This mints a `StudentClaimInvite` for the org `Student` row (`adminUserId` = the minting staff member) and emails it to `Student.parentEmail`.
2. The existing claim flow runs. The parent signs in or up, then picks or creates the `LearnerProfile`.
3. The claim completion route is extended by **relationship**, not forked:
   - For an org row it sets `Student.learnerProfileId`.
   - The `@@unique([organizationId, learnerProfileId])` constraint enforces one record per learner per org.
   - On a unique-constraint violation, the claim refuses with neutral copy ("This learner is already connected to this organization").
   - It **never** checks, or reveals, personal tutor links.
4. Linking is by `LearnerProfile` only. No name or email matching anywhere, so a guest is never linked to a personal student.
5. After linking, all earlier sessions of this OL appear on the learner dashboard (Q6).
6. Log `action=learner_linked ol=<id8>`. Never log the profile id alongside personal-tutor context.

### 4.3 Parent consent

1. Owner or admin sends the consent link. This mints an `OrganizationParentLink(purpose=consent)` and emails it via the existing email sender. Log `action=parent_link_sent purpose=consent ol=<id8>`.
2. The parent opens `/org-consent/[token]`, a route exempt from the tutor waitlist redirect, like `/org-invite/[token]`. If the OL is linked to a profile, the page requires an account-holder session owning that profile (`decideAhJoin` style); otherwise the token alone is enough.
3. The page shows the org name, what the org can see (from § 3), recording choices, and the full-notes choice. The full-notes choice is shown only when `shareFullNotesWithOrg` is on; otherwise it is written as `false` with copy saying the org cannot see notes.
4. Submit: one transaction consumes the link (conditional `updateMany`, count must be 1) and writes version `MAX+1`. Log `action=consent_recorded ol=<id8> v=<n> method=<m>`.
5. Signed-in parents can later edit from the Organizations page, which writes a new version.
6. Without a consent record, the bridge refuses to record anything. Live is allowed only in the Q3 no-contact case.

### 4.4 Assign an instructor, then the per-tutor approval

1. Owner, admin or scheduler picks the instructor from the org's active members holding `instructor` who are approved and not test accounts. The **learner picker** lists only this org's `OrganizationLearner` rows (§ 10, item 8).
2. In one transaction: lock the member row and the OL row (`FOR UPDATE`), re-check the member, then insert the assignment.
   - The partial unique index makes a duplicate active assignment fail; this returns "already assigned".
   - `parentDecision` is `pending` when a parent contact exists, and `not_required` when it does not (Q3).
3. If `pending`: mint `OrganizationParentLink(purpose=approval, assignmentId)` and email it. The Organizations page also shows "Waiting on your approval".
4. Parent approves or declines with one conditional `updateMany`:

   ```
   where { id, parentDecision: "pending", endedAt: null }
   ```

   A decision on an ended or already-decided assignment is a no-op that shows "This request is no longer open". **Decline** sets `declined` and ends the assignment (`parent_declined`).
5. Until `approved` (or `not_required`):
   - `isScheduleJoinable` is false for **both** sides;
   - the tutor sees "Waiting on family approval";
   - the learner/parent sees "Waiting on your approval".
6. Logs: `action=assignment_created a=<id8> instructor=<adminId>`, `action=approval_decided a=<id8> decision=<d>`.

### 4.5 Placement through the schedule bridge (no personal `Student` for the instructor)

1. Owner, admin or scheduler creates a `ScheduledSession` with:
   - `adminUserId` = the assignment's instructor;
   - `studentId` = the **org** `Student` row;
   - `organizationId` and `orgAssignmentId` set, plus `placedByAdminUserId`;
   - `subject` defaulting from the brief.
2. Input is interpreted in `Organization.timezone` (IANA-validated), and `sessionTimezone` is set explicitly. The overlap warning is a warning, not a block: half-open instants against the instructor's other appointments, revealing only "overlaps" and the window.
3. Google Calendar insert for the instructor uses the existing writer, with title "via <org> — <First L.>".
4. **Bridge change** (on top of `getOrCreateWhiteboardForSchedule`). The line

   ```
   if (sched.student.adminUserId !== sched.adminUserId) deny
   ```

   becomes a single relationship resolver, `resolveScheduleRelationship(sched)`:
   - **personal** when `organizationId` is null: today's check, unchanged.
   - **org** when it is set: no `Student.adminUserId` check at all.
5. For **org** rows, `isScheduleJoinable` (one predicate, used by both the Join button and the bridge) requires:
   - `isAssignmentActive`;
   - the assignment's instructor equals `sched.adminUserId`;
   - `parentDecision ∈ {approved, not_required}`;
   - the join window;
   - for the learner principal: `Student.learnerProfileId` equals the caller's profile.

   Inside the core's create transaction, the bridge locks the schedule row and the assignment row (`FOR UPDATE`), re-runs `isAssignmentActive` and the decision check, then freezes the consent snapshot from the latest `OrganizationConsentRecord`. There is **no tutor-acknowledged fallback for org rows** (B15).
6. Learner-side refusals stay a single neutral `not_available`. Tutor-side refusals get plain copy: "Waiting on family approval" / "This appointment needs a new tutor".

### 4.6 Reassign future appointments only

1. The scheduler picks the target instructor. If there is no active assignment for (OL, target), one is created (4.4), with its own parent approval.
2. For each chosen appointment, one transaction:
   - Lock the schedule row (`SELECT … FOR UPDATE`).
   - Run `updateMany where { id, orgAssignmentId: old, startAt > now, whiteboardSession: { is: null } }`, setting `adminUserId` and `orgAssignmentId` to the new values. Count must be 1, or refuse "already started".
   - The old assignment is **not** ended unless the scheduler also ends it.
3. After commit: move the Google event (delete on old, insert on new, clear `googleEventId` between).
4. Past `WhiteboardSession`, audio, notes and note authorship never move. Consent does not move, because org consent is per (learner, org) and already covers the new tutor. Approval is fresh per assignment.
5. Log `action=reassigned from=<adminId> to=<adminId> sched=<id8>`.

### 4.7 End an assignment

1. Owner, admin or scheduler acts; or the hook from slice 1's `removeOrgMember` / `setOrgMemberRoles` fires (§ 9); or a parent declines.
2. One transaction: lock the assignment, then `updateMany where { id, endedAt: null }` setting `endedAt`, `endReason`, `endedByPrincipal`.
3. Effects, all derived (no cascades):
   - The instructor's reads shrink to own notes, read-only.
   - Future appointments on this assignment appear on the flagged list, and Join is off.
   - A live session in progress finishes normally.
   - The instructor's Google events for those future appointments are deleted after commit (best effort, logged on failure).
4. **Personal records are untouched.** No code path in this flow reads or writes any `Student` with `adminUserId` set. The required test is B2.
5. Log `action=assignment_ended a=<id8> reason=<r>`.

### 4.8 Guest link, short code, and waiting-room admit

1. Inside a live org session, the instructor with an active assignment clicks "Guest link". The server creates or rotates the `SessionGuestPass`. It returns the link `/g/<token>` and the 6-character code **once**; only their hashes are stored. Log `action=guest_pass_issued wbsid=<id>` with no token and no code.
2. The learner opens `/g/<token>`. The page checks the pass is unexpired, not revoked, not locked, and the session not ended. It asks for the code and a first name.
   - Wrong code: increment `failedCodeAttempts`. At 5, lock the pass (the tutor rotates it). A per-IP `AuthThrottle` row of kind `guest-code` also applies. Log `action=guest_code_failed wbsid=<id> n=<k>`.
3. Correct code:
   - The browser generates an ephemeral ECDH P-256 key pair; the private key never leaves the page.
   - The server creates a `SessionGuestParticipant` (name, hashed cookie token, guest public key) and sets an HttpOnly cookie scoped to `/join/<sessionId>`.
   - The guest sees a waiting screen.
4. The tutor's waiting room lists "<name> (guest)" with **Admit** and **Deny**. **Admit** runs in the tutor's browser, which holds the room key:
   - Derive a shared key with the guest's public key (ECDH, then HKDF).
   - Wrap the room key with AES-GCM.
   - Post `wrappedRoomKey` and the tutor's public key, then `updateMany where { id, admittedAt: null, deniedAt: null }` plus "session not ended", setting `admittedAt`.
   - The guest page polls, unwraps, and only then joins the relay room.
   - The server never sees the room key, which keeps the existing threat model in `src/lib/whiteboard/encryption-key.ts`.
5. **Why key wrapping:** the relay admits anyone who holds the room id and the key; it has no server-side admission. So "admit" means nothing unless the key is withheld until admit. *Rejected alternatives:*
   - the server holds the key for guest sessions (breaks "server never sees the key");
   - the link carries `#k=` as the retired `/w/` link did (then admit is cosmetic).

   **This is a live-sync/A/V-adjacent change, and the executor stops for a Sonnet review before building it** (orchestrator tripwire 2). First, the executor must find out how dashboard learners receive the key through the schedule bridge today (§ 8, unknown E1). If an existing delivery mechanism gates on a server-side participant row, guests reuse it rather than adding a second one.
6. **Expiry:** the pass and every guest cookie die at the first of `session.endedAt`, `expiresAt`, or `revokedAt`, checked on every guest request. A guest never gets a `LearnerProfile`, a dashboard, a share link, or a route outside `/g/<token>` and `/join/<sessionId>`.
7. Recording with a guest present follows the org consent snapshot. With no parent contact there is no recording (decided).

### 4.9 Erasure

Erasure runs the same `process-erasure-job.ts` path for personal and org learners. The scopes are `learner_profile` / `account_holder` (linked org learners are picked up through `Student.learnerProfileId`), or the new `org_learner` scope (operator-requested, Q7).

**Kept**, exactly as a tutor keeps:

- `WhiteboardSession` rows (dates, durations, the tutor);
- `SessionNote` rows emptied (status and dates remain), with `authorAdminUserId` kept so the empty row still belongs to its author;
- `ScheduledSession` rows (instants, durations, `adminUserId`, org columns);
- assignments;
- `OrganizationConsentRecord` and `SessionConsentSnapshot` (legal records, `Restrict`);
- the learner renamed: `Student.name = "[Deleted learner]"` (existing constant), `OrganizationLearner.givenName = "Deleted"`, `familyName = "learner"`;
- org billing entries (next slice).

**Deleted or scrubbed**, added to `scrubDbContent` in the same transaction:

- Everything erasure deletes today: boards, audio, transcripts, note text, share links, note views.
- `OrganizationLearner.brief*` set to `""`.
- `OrganizationParentLink`: revoke all.
- `SessionGuestPass` and `SessionGuestParticipant` for the affected sessions: delete. Typed names are content.
- **`ScheduledSession.subject`, `.notes`, `.location`** set to `""` for **all** erased `studentIds`, personal included.
  - Answer to "does `subject` need scrubbing": **yes**. Today's job never touches `ScheduledSession`, so tutor- or scheduler-typed text (often the learner's name) survives erasure. This is a pre-existing gap on personal learners too, closed by the same single path.
  - Future appointments' Google events: delete after commit (best effort, logged).
- `SessionNoteOrgAnswer` (next slice): that slice must add its delete here. Recorded so it cannot be forgotten.

---

## 5. Ownership assertions

1. **`assertOwnsStudent` / `assertOwnsMutableStudent` gain no org bypass.** For a tutor login they stay `student.adminUserId === me`, which is always false for an org row, so every personal action fails closed on org learners. The only change is the env-scope **narrowing** in `canAccessStudentRow`, `studentsWhereForScope`, the outbox page and the admin audio route (`organizationId: null`). Grep guard: `student-scope.ts` imports nothing from `org-scope` or `org-learner-scope`.

2. **New module `src/lib/org-learner-scope.ts`** is the single canonical home for org learner access. It exports:
   - `isAssignmentActive(tx, assignmentId)` — the only definition of "active".
   - `assertOrgLearnerStaff(orgId, orgLearnerId, roles)` — calls slice 1's `assertOrgRole`, then loads with `where: { id: orgLearnerId, organizationId: orgId }`.
   - `assertActiveAssignmentFor(studentId)` — for instructor reads and writes on an OL. It resolves the caller with the same checks as `assertOrgRole`: admin kind, not impersonating, approved per the DB, not a test account. Returns the assignment plus the restricted projection.
   - `assertOwnOrgNoteRead(noteId)` — passes when the note is on an org row, `authorAdminUserId === me`, and some assignment (active **or ended**) exists for me on that OL. Read only.
   - `resolveStudentAccess(studentId)` — returns `personal_owner` | `org_staff{roles}` | `org_instructor{assignment, active}` | 404. This is the **only** input the shared student components take (§ 5.4).

   Every caller of this module is a new org surface, or one of the named delegations below. It is never imported by `student-scope.ts`, `join-scope.ts`, `share-access-scope.ts`, or the create core.

3. **`assertOwnsWhiteboardSession` delegates for org rows.** When `session.student.organizationId` is set, it calls `assertOrgWhiteboardSessionRunner(session, scope)` from the new module. That passes only when:
   - the scope is admin kind, and `session.adminUserId === me`; and
   - **either** `session.endedAt` is null (the live session finishes — slice 1 removal rule), **or** the assignment is active and the action is a read of the tutor's own session (Q2).

   This narrows ownership, and never grants a non-runner anything. The 17 callers stay unchanged. *Rejected alternative:* switching all 17 callers to a new function, which is churn plus a chance of missing one.

4. **One student surface.** The student detail page becomes a composition that takes `access = resolveStudentAccess(id)`, and each section renders by scope:
   - **brief**: org only;
   - **contact and claim**: owner/admin only;
   - **notes list**: filtered by author for instructors;
   - **share link and session start**: personal only, with org sessions via appointments;
   - **consent panel**: personal record vs org record.

   The org staff route `/admin/org/[orgId]/learners/[olId]` and the instructor's `/admin/students/[id]` (for an org row) render that **same** composition. Forbidden: any new `Org*Student*` component that re-renders notes, sessions or headers. A grep guard plus a Playwright check that both routes render the same section `data-testid`s.

5. **Tutor-facing list queries (B12).** About 33 non-test files query `whiteboardSession` directly. Calendar, ICS, Google, dashboard "recent sessions", the outbox and `sessionRecording` lookups key on `adminUserId`. Each must either:
   - add `student: { organizationId: null }`, or
   - include org rows **only** through `isAssignmentActive` (calendar feeds and the instructor's schedule while assigned).

   The executor produces the inventory as a table in the slice STATUS doc. A grep guard fails on any new `adminUserId`-keyed query on those models that lacks one of the two forms.

---

## 6. Races (old 5-axis items 9 and 10, restated, plus the new ones)

| Race | Rule | Test (integration, real Postgres, two calls in parallel) |
|---|---|---|
| **Reassign vs create** (old 9) | Both the reassign transaction and the bridge core's create transaction take `SELECT … FOR UPDATE` on the `ScheduledSession` row. Reassign is the conditional `updateMany` in 4.6 (count 1). The create re-reads `adminUserId`/`orgAssignmentId` after the lock. | `org-races.integration.test.ts › reassign racing create leaves exactly one owner`. Oracle: either the session exists **and** the appointment is unmoved, or the appointment moved **and** no session row exists. Never a session whose `adminUserId` differs from the appointment's. |
| **End assignment / member removal vs create** (old 10) | The create transaction locks the assignment row and re-runs `isAssignmentActive` inside the transaction. End-assignment locks the same row. The removal hook runs inside slice 1's removal transaction. | `› ending the assignment during create returns not_available and leaves no session row`. Oracle: `whiteboardSession.count({ scheduledSessionId })` = 0 and the result reason is `not_available`. |
| **Parent decision vs reassign** | The decision `updateMany` requires `endedAt: null` and `parentDecision: pending`. Approval of an ended assignment is a no-op. | `› approving after reassignment does not approve the new tutor`. Oracle: the new assignment stays `pending`. |
| **Consent revoke vs create** | The latest consent version is read inside the create transaction, and the snapshot is frozen there. | `› a consent version written after the create lock does not change that session's snapshot`. Oracle: the snapshot's version equals the version visible at lock time. |
| **Double assign** | Partial unique index `org_assignment_one_active`. | `› two parallel assigns of the same tutor yield one active row`. Oracle: count of active rows = 1. |
| **Double claim of one profile into one org** | `@@unique([organizationId, learnerProfileId])`. | `› two org learner records cannot both link the same profile`. |
| **Guest admit vs session end** | Admit `updateMany` is conditional on `admittedAt: null`, and the session `endedAt` is checked in the same transaction. Every guest request re-checks `endedAt`. | `› admit after end is refused and the guest never receives a wrapped key`. Oracle: `wrappedRoomKey` is null. |
| **Erasure vs create** | Existing `assertStudentNotErased` plus the erasure advisory lock already guard personal rows; `isAssignmentActive` includes them. | `› create during an active erasure job for an org learner is refused`. |

---

## 7. 5-axis reliability review of this design

Every **BLOCKER** is a phase-1 acceptance test. Unit and integration tests run against real Postgres. Playwright specs live in `tests/integration/org-learner*.spec.ts`, enrolled in `wb-regression`, tagged **`@org`** (new tag: add it to `tests/test-tags.ts` and map `src/lib/org-*` in `scripts/wb-test-select.cjs`) plus a domain tag. Each test must be shown red before and green after.

### Axis 1 — Correctness

| # | Finding | Severity | Test → independent oracle |
|---|---|---|---|
| B1 | Org rows have a null `adminUserId`, which the env scope treats as its own. | **BLOCKER** | `org-learner-scope.integration.test.ts › env-only admin cannot list or open an org learner` → `studentsWhereForScope(env)` result ids exclude the seeded OL id; `assertOwnsStudent(olStudentId)` under env scope throws not-found; the admin audio route 404s for an org recording. Red today. |
| B2 | Ending an assignment must not touch the personal relationship (required test). | **BLOCKER** | Playwright `org-learner.spec.ts › ending an org assignment leaves every personal session and note visible` `@org @wb-chrome`. A tutor has personal student P (same profile) with N sessions and M notes, plus org learner O. End O's assignment. The P page still lists N sessions and M notes. Also a DB check: P's `Student`, `SessionNote`, `ConsentRecord` rows compare equal before and after. The oracle is the pre-end row snapshot, not the code. |
| B3 | "Active" must have one definition. | **BLOCKER** | `› Join button and bridge agree for every assignment state` → table-driven over {active, pending, declined, ended, member removed, instructor role dropped, org suspended, erased}. For each: `isScheduleJoinable` equals whether the bridge returns `ok`. Playwright `› pending approval disables Join for learner and tutor` `@org @wb-presence` → button disabled, and a direct bridge POST returns `not_available`. |
| B4 | Org notes need an author. | **BLOCKER** | `› notes bridge sets authorAdminUserId on org drafts` → the draft created by `nsi` for an org session has author = `WhiteboardSession.adminUserId`. `› an org note with null author is readable by no instructor`. |
| S1 | `Student.name` drifts from the structured name. | SHOULD | `› writeOrgLearnerName keeps Student.name equal to given + family`. Grep guard: no other writer of `name` for org rows. |
| S2 | Timezone (kept from old list). | **BLOCKER** | `› scheduler input is interpreted in Organization.timezone across a DST change` → oracle: `Intl.DateTimeFormat` round-trip of the stored `startAt` in the org zone equals the typed wall time on both sides of the transition. |

### Axis 2 — Data loss

| # | Finding | Severity | Test → oracle |
|---|---|---|---|
| B5 | An assignment ended mid-session must not lose the session. | **BLOCKER** | Playwright `› ending the assignment mid-session still ends cleanly and uploads` `@org @wb-presence @wb-recording` → the tutor ends the session after staff end the assignment. Oracle: `WhiteboardSession.endedAt` is set, the `SessionRecording` count > 0, and the relay peer state shows a clean leave. |
| B6 | Reassign moves nothing in the past. | **BLOCKER** | `› reassign moves only future unstarted appointments` → past sessions' `adminUserId`, `studentId`, note authors and recordings all equal the pre-reassign snapshot. |
| B7 | Erasure keeps and deletes exactly the spec list (§ 4.9). | **BLOCKER** | `erasure-org-learner.integration.test.ts › org learner erasure keeps exactly what a tutor keeps` → assertions are written from the § 4.9 list, field by field, run once for an `org_learner` scope and once for a linked profile scope. Includes `ScheduledSession.subject` = `""` **for a personal learner too** (red today). |
| R1 | Q1 draft after end (until answered). | SHOULD | `› a draft born after the assignment ended stays readable by its author and is not editable`. |

### Axis 3 — Auth and IDOR

| # | Finding | Severity | Test → oracle |
|---|---|---|---|
| B8 | Cross-org lookups. | **BLOCKER** | One test per new resource: OL, assignment, parent link, guest pass, org `ScheduledSession`, consent record. Each is fetched with an org B owner's session using org A's ids, and every one returns not-found. |
| B9 | Personal student actions never reach an org row. | **BLOCKER** | For each action category in `src/app/admin/students/[id]/actions.ts` (note create/update/delete, share link, claim invite, audio upload, session create), call it with an assigned instructor and an org row id → not-found. Red-proof by temporarily granting the row (documented in the test). |
| B10 | An ended assignment reads own notes only. | **BLOCKER** | Playwright `› after the assignment ends the tutor sees own notes read-only and nothing else` `@org @wb-chrome` → the notes are visible with no edit controls. Direct GETs of replay, audio, transcript, brief and guest pass return 404. |
| B11 | An instructor never sees another tutor's notes. | **BLOCKER** | Seed notes by tutor A and tutor B on the same OL. B's view lists only B's note ids. Oracle: the seeded author map. |
| B12 | Tutor-facing lists leak org rows. | **BLOCKER** | Grep guard (§ 5.5), plus Playwright `› tutor home and schedule drop org rows when the assignment ends` → before: the org appointment is visible with "via <org>"; after: absent. |
| B13 | Guest pass. | **BLOCKER** | `org-guest.spec.ts` `@org @wb-presence`, each as its own test: (a) link without code cannot reach the waiting screen; (b) the 5th wrong code locks the pass; (c) a pass for session S cannot open session T; (d) the pass is dead after the session ends; (e) **before admit, the relay peer list has no guest peer and the guest page holds no room key**; after admit, the guest's peer appears and strokes sync; (f) the guest cookie cannot load `/account/*`, `/s/*` or `/admin/*`. |
| B14 | Module boundaries. | **BLOCKER** | Grep guard: `student-scope.ts`, `join-scope.ts`, `share-access-scope.ts` and the create core import neither `org-scope` nor `org-learner-scope`. |
| S3 | Org staff role checks are covered by slice 1. | — | Do not re-test slice 1. Test only the new change points. |

### Axis 4 — Privacy and consent

| # | Finding | Severity | Test → oracle |
|---|---|---|---|
| B15 | Org rows take no tutor-acknowledged fallback. | **BLOCKER** | `› org session without org consent records nothing` → Playwright `@org @wb-recording`: there is no recording intent. Oracle: `SessionRecording` count = 0, and the snapshot has `allowAudioRecording = false` with `orgConsentRecordId` null. |
| B16 | Neither consent satisfies the other. | **BLOCKER** | Two tests. (a) A personal `ConsentRecord` (profile, tutor) with all true, and no org consent → the org session records nothing. (b) Org consent all true, and no personal record → the personal session is still refused by CC-1. |
| B17 | The org never learns about the personal relationship. | **BLOCKER** | Two fixtures that differ **only** in whether the instructor also has a personal `Student` for the same profile. Every org-staff loader output, every org action result, and every org error message must be **deep-equal** across the fixtures (ids normalized). The oracle is the twin fixture, not the code. |
| B18 | Full notes reach the org only when all three gates hold. | **BLOCKER** | Table test over the 2×2×2 of {`shareFullNotesWithOrg`, current consent `allowOrgFullNotes`, snapshot `allowOrgFullNotes`}. Note text is visible to the owner in exactly one cell. The scheduler sees it in none. |
| B19 | Parent links. | **BLOCKER** | Tokens are hashed and single-use. Changing `parentEmail` revokes them. A link for OL X cannot write consent for OL Y. When the OL is linked, an account holder who does not own that profile gets the neutral invalid page. |
| B20 | Logs. | **BLOCKER** | Log-capture test over every new flow. No raw token, no code, no `@` character in any `[org]` line. |
| P1 | Legal honesty. | **BLOCKER** (before master) | The `/privacy` product section (LEGAL-SYNC protocol) states exactly what § 4.9 implements: what the org keeps, that consent records are kept as a legal record, that full notes go to the org only with the parent's choice and the operator setting, no redaction promise, and the "arranged via <org>" label. Reviewer check: every retention claim maps to a line in § 4.9. |
| P2 | Non-compete audit not blocked. | Note | Nothing deletes or hides the `Student.learnerProfileId` link. The future operator report can join org and personal rows by profile. Nothing builds it. |

### Axis 5 — Operability

| # | Finding | Severity | Test / mechanism |
|---|---|---|---|
| O1 | Every transition logged `[org]` with ids only, plus a `ProductEvent`. | **BLOCKER** | Covered by B20, plus one assertion per flow that the action line was emitted. |
| O2 | Flagged list is the scheduler's single place to find appointments needing a tutor. | **BLOCKER** | Playwright `› a removed instructor's future appointment appears on the flagged list and its Join is off` `@org @wb-chrome`. Oracle: slice 1's `removeOrgMember` drives the state; the test does not write the assignment row directly. |
| O3 | Google event cleanup is best effort. | SHOULD | Failure logged `[gcw] … delete_error`, and the flagged list still shows the appointment. |
| O4 | One student surface. | **BLOCKER** | Playwright `› org staff route and instructor route render the same student sections for their scope` + grep guard (§ 5.4). |
| O5 | Existing personal paths must not regress. | **BLOCKER** | `npm run test:wb-affected:run` on the slice, and full `test:wb-sync` + `test:regression` + `npx next build` before `master`. |

---

## 8. Unknowns the executor must resolve before building (not product questions)

- **E1 — Room key delivery today.** Find how a learner entering from the dashboard through the schedule bridge receives the `#k=` room key. If an existing mechanism gates key delivery on a server-side participant row, guests reuse it and the ECDH wrap in 4.8 is dropped. Report before writing guest code. Either way, the guest key path gets a Sonnet review before merge.
- **E2 — Learner dashboard query.** Confirm the dashboard lists sessions through `Student.learnerProfileId`, so linked org rows appear without a forked query. Add the "via <org>" label from `Student.organizationId`.
- **E3 — Blob inventory.** Confirm `blob-inventory.ts` collects org rows under profile scopes, and add the `org_learner` scope.
- **E4 — Inventory table** for § 5.5, committed to the slice STATUS doc before code.

---

## 9. Slice 1 contract

**May call, unchanged:**

- `assertOrgRole`, `getActiveOrgRoles`, `startOfZonedDay`, `requireOperator`.
- Token helpers from `src/lib/crypto/session-tokens.ts`.
- `orgLog`, `lockOrg`, `lockMembers` — exporting these unchanged is allowed, so there is one logger and one lock helper rather than copies.
- `OrgMutationError` — new codes may be **added** to its union (`not_assigned`, `already_assigned`, `assignment_ended`, `learner_linked_elsewhere_in_org`). No second error class.

**May add, minimal:**

- In `removeOrgMember` and `setOrgMemberRoles` (when the next roles drop `instructor`): one call, `await endAssignmentsForMember(tx, organizationId, adminUserId, reason)`, inside the existing transaction, after the existing checks. The function lives in `org-learner-scope.ts`.
- New operator setter `setOrganizationShareFullNotes(orgId, on)` using `requireOperator`, logging `action=share_full_notes_set`.

**Must not change:**

- The role matrix (`canGrantRole`, `assertNextRoles`, owner floor);
- invite create, revoke and accept (including reactivation and the inviter re-check);
- caps;
- `approveTutor` / `revokeOrgGrantedApprovals`;
- `createOrganization`, `setOrganizationStatus`.

Suspension still never revokes approvals automatically (Andrew). `maxMembers` stays nullable and operator-set.

---

## 10. Overrides of the old Wave C bullets

| Old bullet (`org-qol-opus-design.md`) | Replaced by |
|---|---|
| "Place a session on a tutor … the tutor's own `Student` row for that learner … refuse if none" | The appointment's `studentId` is the **org** `Student` row, plus `orgAssignmentId`. The instructor never needs a personal `Student` (§ 4.5). |
| Item 7 placement clause "`Student.adminUserId === tutor`, student not erased" | "Assignment active (`isAssignmentActive`), instructor = appointment tutor, org learner belongs to this org, not erased". The rest of item 7 (`where: { id, organizationId }`, one test per resource) is kept as B8. |
| Item 8 learner picker "the chosen tutor's `Student` rows linked to a `learnerProfileId`, first name + last initial" | The picker lists **this org's own `OrganizationLearner` rows** (full name for staff), filtered to not-erased. It never lists any tutor's `Student` rows. Refusal copy stays neutral. |
| Reassignment "target tutor … already has a `Student` row linked to the same `learnerProfileId`; moving changes `adminUserId` and `studentId`; consent does not move (the bridge's consent gate covers the new tutor)" | The target needs an active assignment with parent approval. Only `adminUserId` and `orgAssignmentId` move; `studentId` stays the org row. Org consent is per (learner, org) and already covers the new tutor; approval is fresh per assignment (§ 4.6). |
| Bridge refuses create when the appointment's tutor is no longer an active member | Generalized to `isAssignmentActive`, checked inside the create transaction (§ 6). |
| "Tutor role alone sees no org list (they keep their own students)" | The instructor sees their assigned org learners in the restricted view. |
| `listOrgSessions` learner name "first + last initial" for every org viewer | Staff see the full name (the org wrote the record). The first-name + last-initial rule applies to the **instructor**. |
| `requireTutorAccept` / `tutorAcceptedAt` (tutor accepts placements) | Not in this slice. The learner-model decisions replaced it with the **parent's** per-tutor approval. It can be re-added later if Andrew asks. |
| "Families get Privacy copy … No separate consent" (first-pass answer) | Already superseded by the second pass: a separate org consent record exists. The Privacy copy and the "arranged via <org>" label are kept. |
| Item 12 "erasure deletes `SessionNoteOrgAnswer`" | Carried to the prompts slice as a recorded duty (§ 4.9). This slice adds the `ScheduledSession` free-text scrub, the org learner name and brief, parent links, and guest rows. |
