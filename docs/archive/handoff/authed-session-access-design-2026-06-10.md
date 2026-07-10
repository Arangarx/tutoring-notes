# Authenticated Family-Facing Access — Architecture Design Doc

> **Design date:** 2026-06-10  
> **Branch:** `v1-redesign`  
> **Authored by:** Sonnet 4.6 subagent (design pass), commissioned by Opus orchestrator  
> **Deliverable type:** Design document only — no production code, no migrations, no schema changes applied  
> **Thread:** Gate-B prerequisite (B2 parent privacy consent surface), V1 Phase 2  
>
> **Prerequisite reads (in order):**
> 1. [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — SPINE; all LOCKED decisions; authoritative
> 2. [`docs/handoff/session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) — 3-principal model, schema, `assertOwnsLearnerProfile`
> 3. [`docs/handoff/identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) — P2 auth mechanics, IAC-1..IAC-14 decisions
> 4. [`docs/handoff/session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) — session lifecycle, waiting room, mid-session swap
> 5. [`docs/handoff/consent-gates-capture-design-2026-05-31.md`](consent-gates-capture-design-2026-05-31.md) — consent enforcement principle
> 6. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — FSM/outbox/atomic end-session pillars
> 7. [`docs/LIVE-AV.md`](../LIVE-AV.md) — live A/V + sync architecture, E2E key model

### Decisions resolved 2026-06-10 (Andrew)

| # | Decision | Outcome |
|---|---|---|
| **OQ-1** | Phase 1 cut-point for unclaimed students | **Hard auth-wall** — `/s/[token]` requires AccountHolder or learner session for **all** students; no anonymous fallback. Phase 1 **must** ship a one-time family onboarding/claim flow + cutover plan before the wall goes up. |
| **OQ-2** | E2E key delivery for Phase 2 | **Option A chosen** — fragment URL (`/join/<sessionId>#k=<key>`) + required learner auth; relay-blind E2E preserved; no server-side key storage. Option B considered and rejected for V1 (server-mediated key delivery would break relay-blind E2E for no practical privacy gain). |
| **OQ-3** | Key re-entry after login redirect | **Accept + keep-link-valid + fragment-preservation** — join link stays valid for the whole live session; close the login-redirect fragment-strip failure with client-side `sessionStorage` capture/restore of `location.hash`. |

See §8 for full resolution notes. Phase sections below reflect these calls.

**Build kickoff (Andrew 2026-06-10):** Phase 1 ships the full auth-wall mechanism with `NOTES_AUTH_WALL` **default `false`** (dormant on `v1-redesign`). The flag flips to `true` **only** at the `v1-redesign`→`master` cutover, and **only after** Sarah's pilot families are claimed/credentialed — Sarah has only ever used `master` (prod); flipping earlier would lock her out. Phase 1 gates **viewing** of notes on **ownership alone**; consent enforcement (Gate B2) is a **separate parallel thread**, intentionally decoupled. Sequencing confirmed: Phase 1 first, then Phase 2 (session-login + Gate A2 waiting room) as **one combined scope**. Full addendum: [Kickoff decisions 2026-06-10](#kickoff-decisions-2026-06-10-build).

---

## §1. Provenance + Decision

### 1.1 Why this thread exists

Two hard requirements (different origins, equally non-negotiable):

**Sarah's EXPLICIT external requirement (privacy origin):**  
Session notes must NOT be accessible without login. This is Sarah's hard ask — the privacy origin of the entire redesign. The previous `/s/[token]` system (anyone with the emailed link can read notes) is a direct violation of her expectation once real families are in the system. This is non-negotiable.

**Andrew's extension — mandatory given the product's privacy toggles:**  
Live session join must also require authentication. Given that (a) `allowAudioRecording`, `allowNoteSending`, `allowWhiteboardRecording` are per-learner consent toggles, (b) the waiting-room (Gate-A2) requires knowing which learner is entering, and (c) `SessionParticipant` rows are the load-bearing join-authorization mechanism in the consent/lifecycle design — authenticated session join is the only coherent implementation of the consent model. Not a choice; a requirement that flows from everything already ratified.

### 1.2 Decisions (locked)

| Decision | Value |
|---|---|
| **Primary path** | Everyone logs in. Anonymous no-login access is deprecated as the primary path. |
| **Phase 1** | Notes-login: `/s/[token]` and `/s/[token]/all` require AccountHolder or learner authentication before showing notes — **for all students, including unclaimed**. Lower risk entry point, satisfies Sarah's hard ask. Ships first. **Includes** a one-time family onboarding/claim flow so existing pilot families are credentialed before the wall goes up. |
| **Phase 2** | Session-login: `/join/[sessionId]` replaces anonymous `/w/[joinToken]` as the primary live-session entry point for authenticated learners. Consolidated with Gate A2 waiting room (one route). E2E key via Option A (fragment URL). |
| **Sequencing** | Phase 1 before Phase 2. Phase 1 does not depend on `SessionParticipant`; Phase 2 does. |
| **Low-friction credential path** | Magic-link / first-click "claim your account" onboarding — **not** "invent a password from nothing." Framed as good onboarding, not a privacy compromise. |
| **Anonymous fallback (notes)** | **None.** Hard auth-wall for all students at `/s/[token]`. The draft's anonymous fallback for unclaimed students was rejected (OQ-1) because it would not meet Sarah's requirement. Cutover mitigated by tutor-initiated claim invites + claim-before-flip cutover (§3.5.3; no grace window at pilot scale). |
| **Anonymous fallback (live join)** | `/w/[joinToken]` retained **only** for unclaimed students in Phase 2 live sessions until families are claimed; claimed students use `/join/[sessionId]`. Distinct from notes — notes wall is universal in Phase 1. |

---

## §2. Current-State Recap (verified against code 2026-06-10)

### 2.1 Two separate anonymous-token systems

**Live join:** `/w/[joinToken]` — page `src/app/w/[joinToken]/page.tsx` explicitly: *"We do NOT run `requireStudentScope` here — the student is not a logged-in user. The token IS the auth."* `WhiteboardJoinToken` has 24h expiry, is revocable at `endWhiteboardSession` (Pillar 3 step 5). The server exposes only room id + tutor display name to the page (no adminUserId, no studentId). The page renders `StudentWhiteboardClient` which connects to the relay using the key from `window.location.hash#k=...`.

**Notes/replay:** `/s/[token]` — page `src/app/s/[token]/page.tsx`. Loads `ShareLink` by opaque token; exposes all non-DRAFT `SessionNote`s for the student, including replay links. `ShareLink` has **no expiry** and is revocable only by the tutor. `sendUpdateEmail` sends the `/s/<token>` URL in every update email. No auth check of any kind.

### 2.2 Learner login exists but is unwired to sessions

`/students/login` → PIN (`username@familyid`, IAC-7 round-4 format) → `LearnerDeviceSession` + `mynk_learner_session` cookie (`src/lib/learner-session.ts` — fully implemented). Post-login, the route currently redirects to `/join` (a placeholder page: "Waiting for your tutor…"). **No learner dashboard; no session list; no learner↔session link in the UI.**

### 2.3 Parent login exists but notes are token-only

`/account/login` → `AccountHolder` session + `mynk_ah_session` cookie. `/account/dashboard` manages `LearnerProfile`s and consent. **No `/account/*` route serves notes or session history for the parent.** `assertOwnsLearnerProfile` is fully implemented (`src/lib/learner-profile-scope.ts`) but no notes route calls it.

### 2.4 Ownership model gaps

- `WhiteboardSession.studentId` → tutor-scoped `Student` stub (FK: `adminUserId` + `studentId`)
- **No `learnerProfileId` on `WhiteboardSession`** — bridge is nullable `Student.learnerProfileId`
- `assertIsSessionParticipant` in `src/lib/session-participant-scope.ts` is a **stub that always `notFound()`** — comment: "P2a STUB: SessionParticipant model is not yet implemented (Phase 3)"
- `assertOwnsWhiteboardSession` in `src/lib/whiteboard-scope.ts` is **tutor-only** (calls `requireStudentScope`)
- `SessionParticipant` model does not exist in the schema yet

### 2.5 The E2E key — how it works today

The AES-GCM-256 whiteboard encryption key is **generated entirely client-side** by the tutor's browser on first workspace mount (via `useEncryptionKeyInHash` in `WhiteboardWorkspaceClient.tsx`). It is stored in `window.location.hash` as `#k=<base64url>`. The tutor's "Copy student link" builds `/w/<joinToken>#k=<key>` — the fragment is the key delivery mechanism.

**The server never sees this key.** HTTP fragments are never transmitted in requests (HTTP spec). The relay (`excalidraw-room` socket.io server at `WHITEBOARD_SYNC_URL`) receives only AES-GCM encrypted bytes + IV — it cannot read whiteboard content.

**What our server DOES already see in plaintext:** audio segments are uploaded to Vercel Blob → transcribed by OpenAI Whisper via `src/lib/ai.ts` → session notes are AI-generated from the transcript — all server-side. Whiteboard events JSON (the full stroke replay) is uploaded to Vercel Blob via `uploadWhiteboardEvents` in `handleEndSession`. **The server's access to session content is comprehensive for everything except the live relay byte-stream.**

The relay-blind E2E property means: **relay compromise cannot read session content.** It does not mean our server is blind to session content — our server processes everything for AI notes generation.

### 2.6 Existing claim/onboarding infrastructure (tie-in for Phase 1)

Phase 1 onboarding reuses infrastructure already in the identity stack:

| Piece | Location | Role in onboarding |
|---|---|---|
| **Claim invite mint** | `POST /api/students/[studentId]/claim-invites` + `ClaimInviteSection` on tutor student-detail | Tutor sends parent a magic link to `/claim/<token>` |
| **Claim flow** | `/claim/[token]` → `ClaimAuthGate` → `/claim/[token]/setup` (`CredentialSetupForm`) | Parent creates AccountHolder (or logs in) and links `LearnerProfile` to `Student` |
| **Connected parent visibility** | `ConnectedParentSection` on tutor student-detail | Tutor sees which account claimed; can disconnect (IAC-13) |
| **AccountHolder realm** | `/account/login`, `/account/dashboard` | Parent session for notes access post-claim |
| **Learner PIN** | `/students/login` | Learner session for notes access (child principal) |

---

## §3. Phase 1 — Notes-Login

### 3.1 The problem

`/s/[token]/page.tsx` renders all non-DRAFT notes for a student with zero auth. A parent who receives the share link email can bookmark it and revisit indefinitely. The token never expires. Any person who intercepts the email link also gets access. This violates Sarah's explicit requirement regardless of whether the student has been claimed.

**Cutover consequence (OQ-1):** At wall activation, any of Sarah's current families **without** an `AccountHolder` account lose note access until they complete claim onboarding. Phase 1 scope **must** include getting those families credentialed first.

### 3.2 Auth gate design

Two principals are authorized to view notes for a student:
1. **AccountHolder (parent/guardian):** must own the `LearnerProfile` linked to the `Student`
2. **LearnerProfile (learner):** must be the learner linked to the `Student`

Gate logic for `/s/[token]` — **hard wall, no anonymous path:**

```
ShareLink.token → ShareLink.studentId
  → Student { learnerProfileId, adminUserId }

→ require auth (ALL students — claimed and unclaimed):
  if mynk_ah_session present:
    → getAccountHolderSession(req) → ahSession
    → if student.learnerProfileId IS NOT NULL:
        → assertOwnsLearnerProfile(ahSession.accountHolderId, student.learnerProfileId) → grants access
    → else (unclaimed — parent has no LearnerProfile link yet):
        → 403 / "claim required" screen with CTA to complete claim flow
  else if mynk_learner_session present:
    → getLearnerSession(req) → learnerSession
    → if student.learnerProfileId IS NOT NULL:
        → assert learnerSession.learnerProfileId === student.learnerProfileId → grants access
    → else:
        → 403 / "claim required"
  else:
    → redirect to /account/login?returnTo=/s/<token>&source=notes
      (parent path; the email goes to the parent, so parent auth is the primary case)
```

**Unclaimed students:** notes are **not** served anonymously. The parent must complete the claim flow (§3.5) so `Student.learnerProfileId` is set and `assertOwnsLearnerProfile` can succeed.

### 3.3 New helper: `assertCanAccessShareLink`

New file: `src/lib/share-access-scope.ts`

```typescript
/**
 * Asserts that the requesting principal has read access to the share page
 * for the given student. Returns the access verdict + student data on success;
 * calls redirect() on unauthenticated; calls notFound() or shows claim-required
 * when student is unclaimed and principal cannot be authorized.
 *
 * Log prefix: sal= (share access log — see AGENTS.md)
 */
export async function assertCanAccessShareLink(
  req: NextRequest | Request,
  token: string,
): Promise<{
  studentId: string;
  learnerProfileId: string;
}>;
```

**Log prefix:** `sal` (share access log). Key events:
- `[sal] sal=<token:8> action=access_granted principal=account_holder|learner studentId=<id>`
- `[sal] sal=<token:8> action=access_denied_redirect studentId=<id> reason=no_session`
- `[sal] sal=<token:8> action=claim_required studentId=<id> reason=unclaimed`
- `[sal] sal=<token:8> action=ownership_denied principal=account_holder accountHolderId=<id>`

Register `sal` prefix in `AGENTS.md` § Conventions.

### 3.4 What happens to ShareLink + sendUpdateEmail

- `ShareLink` table is **unchanged** — still issued by the tutor, still revocable, still no expiry
- `sendUpdateEmail` continues to send `/s/<token>` URLs in notification emails — **the URL itself doesn't change**
- The `/s/<token>` page changes: adds the auth gate above; the URL is now a "notes access link" that requires login, not a standalone anonymous view
- **Email UX change:** the email body copy should update to: *"[Student] has a new session note from [Tutor]. Log in to view it: [notes link]"* rather than the current "here are the notes" framing. This is a copy change, not a functional change — the auth gate is the functional change.
- Existing `ShareLink` rows continue to work after Phase 1 ships; **all** clickers are prompted to log in (or claim) on first click.

### 3.5 Family onboarding + cutover plan (Phase 1 prerequisite)

**Pilot scale:** Sarah + a handful of families. Manual tutor-driven onboarding is feasible and preferred over building self-serve discovery.

#### 3.5.1 Who triggers onboarding

**Primary path — tutor-initiated claim invite (existing flow):**

1. Sarah (or any tutor) opens the student detail page (`/admin/students/[id]`).
2. For each unclaimed student (`Student.learnerProfileId IS NULL`), tutor uses **ClaimInviteSection** → `POST /api/students/[studentId]/claim-invites`.
3. Parent receives email (or tutor copies link) → `/claim/<token>`.
4. Parent lands on `ClaimAuthGate`: create account or log in → `/claim/<token>/setup` sets credentials via magic-link-style first-click flow (not blank-slate password invention).
5. On completion: `Student.learnerProfileId` is set; `ConnectedParentSection` shows the linked account.
6. Tutor optionally sets learner PIN via existing learner-credential path so the child can also access notes.

**Secondary path — parent self-claim from notes email (post-wall):**

After the wall is up, a parent clicking `/s/<token>` without an account hits login → sees claim-required or signup with `returnTo` preserved. If a pending claim invite exists for that student, surface it: *"Your tutor sent you an invite — finish setting up your account."* Reuse `/claim/<token>` rather than inventing a parallel flow.

#### 3.5.2 Low-friction credential rules

- **Parents:** claim link (`/claim/<token>`) is the onboarding front door — account creation + child link in one guided flow. Password setup happens in `CredentialSetupForm` at `/claim/[token]/setup`, not as a cold signup from nothing.
- **Learners:** after parent claim, tutor distributes PIN (`username@familyid`) for `/students/login` — existing IAC-7 path.
- **No anonymous notes preview** as a teaser — the wall is the product posture Sarah asked for.

#### 3.5.3 Cutover sequence (claim → flip — no grace window at pilot scale)

**Supersedes (Andrew 2026-06-10):** the prior "invite → 7-day grace (`NOTES_AUTH_WALL=false`) → wall" plan. Andrew: *"I really don't think at our scale we need a grace period."* The grace window only protected a **multi-family** migration — a stretch where some families have claimed and others haven't, so old anonymous links must keep working. At one pilot family (N=1) there is no such stretch. Re-introduce a grace window only if the pilot grows to multiple un-migrated families before the flip.

| Step | Action | Trigger |
|---|---|---|
| **1. Claim** | Sarah's pilot parent **claims** the student (creates account + links to learner via `/claim/<token>`). | **Before** master cut |
| **2. Wall flip** | Set `NOTES_AUTH_WALL=true` at the `v1-redesign`→`master` cutover. All `/s/[token]` routes enforce §3.2 gate. | Master cut |
| **3. Parent access** | Parent logs in → sees notes (dashboard + `/s/<token>` deep links). No anonymous-links-still-work grace window. | Ongoing |
| **4. Straggler support** | If a family is unclaimed at flip: tutor re-sends claim invite; parent completes claim → immediate notes access. No data loss — notes exist server-side, only the read gate changed. | Ongoing |

**Caveat:** Any `/s/<token>` link Sarah already emailed becomes login-required the instant the wall flips. The parent **must** have claimed before step 2, or the existing link redirects to login with the "sign in to view these notes" message (`source=notes_email` — commit [`a7f0935`](https://github.com/Arangarx/tutoring-notes/commit/a7f0935), not a silent failure). Ordering steps 1→2 gives zero downtime.

`NOTES_AUTH_WALL` still ships **default-false (dormant)** in code — unchanged. What changes is the **operational** cutover plan: no deliberate grace-window phase; flip on at master cut after the single family is claimed.

**Why the flag remains:** the auth gate code ships in Phase 1; the flag controls the explicit "wall goes up" moment at master cut (not a timed grace period).

#### 3.5.4 Parent email-to-notes flow (post-wall, claimed student)

1. Parent receives note notification email → clicks link → `/s/<token>`
2. Middleware detects no `mynk_ah_session` → redirect to `/account/login?returnTo=/s/<token>&source=notes_email`
3. `/account/login` shows: **"See [Student]'s session notes — log in or create an account"** (the `source=notes_email` param triggers this welcome copy)
4. Parent has account → login → redirected to `/s/<token>` → notes shown
5. Parent has no account but claim invite pending → redirect/surface to `/claim/<token>`

### 3.6 Files touched

| File | Change |
|---|---|
| `src/app/s/[token]/page.tsx` | Add `assertCanAccessShareLink(req, token)` call at top; claim-required for unclaimed |
| `src/app/s/[token]/all/page.tsx` | Same gate |
| `src/app/s/[token]/whiteboard/[whiteboardSessionId]/page.tsx` | Same gate (replay access) |
| `src/middleware.ts` | Add cookie-presence check for `/s/` paths: if no `mynk_ah_session` AND no `mynk_learner_session`, redirect to login (UX optimization; handler is the real gate) |
| `src/lib/share-access-scope.ts` | **New:** `assertCanAccessShareLink` helper |
| `src/app/account/login/page.tsx` | Handle `source=notes_email` for welcome copy |
| Tutor student-detail | Claim status badge for unclaimed students; prompt to send invite before wall date |
| Env / feature flag | `NOTES_AUTH_WALL` (default `false`; flip `true` at master cut after claim) |
| `AGENTS.md` | Register `sal` log prefix |

### 3.7 Account-level notes view for parents

Once the parent is logged in and their `LearnerProfile` is linked, they should also see notes from `/account/children/[learnerId]/notes` (the "push" model — notes appear in the parent's dashboard, not just via email links). This is a **Phase 1 companion** that removes the dependency on the tutor remembering to send emails. Specification:

**New route:** `src/app/account/children/[learnerId]/notes/page.tsx`

```
GET /account/children/[learnerId]/notes
Auth: getAccountHolderSession(req) → assertOwnsLearnerProfile(ah.id, learnerId)
Query:
  Student = db.student.findFirst({ where: { learnerProfileId: learnerId } })
  Notes = db.sessionNote.findMany({
    where: { studentId: Student.id, status: { not: 'DRAFT' } },
    orderBy: [{ date: 'desc' }]
  })
```

This is effectively the same data as `/s/[token]` but via the parent's authenticated session. The `/s/[token]` URL continues as the shareable link format; the account route is the "always accessible" authenticated equivalent.

### 3.8 Phase 1 acceptance criteria

| # | Criterion | Blocker? |
|---|---|---|
| **P1-AC-1** | Notes at `/s/[token]` without auth → redirect to login, not 200 (**all** students) | **BLOCKER** |
| **P1-AC-2** | Claimed student notes accessible with valid `mynk_ah_session` (parent owns learner) | REQUIRED |
| **P1-AC-3** | Claimed student notes accessible with valid `mynk_learner_session` (correct learner) | REQUIRED |
| **P1-AC-4** | Unclaimed student notes **without** auth → redirect or claim-required, **not** anonymous 200 | **BLOCKER** |
| **P1-AC-5** | AccountHolder B's session cannot access Student owned by AccountHolder A's child | **BLOCKER** (security) |
| **P1-AC-6** | Learner session for learner A cannot access learner B's share page | **BLOCKER** (security) |
| **P1-AC-7** | Email link flow: click → login → notes (`returnTo` preserved) | REQUIRED |
| **P1-AC-8** | `sal=` log events emitted on access and denial | **BLOCKER** (observability) |
| **P1-AC-9** | Revoked `ShareLink` returns 404 for all principals (unchanged behavior) | REQUIRED |
| **P1-AC-10** | `/account/children/[learnerId]/notes` serves parent with valid AH session + owned learner | REQUIRED |
| **P1-AC-11** | Tutor can mint claim invite from student detail; parent completes `/claim/<token>` flow; `Student.learnerProfileId` set | **BLOCKER** (onboarding) |
| **P1-AC-12** | Dormant wall flag: when off, anonymous notes still served; when on, wall enforced | **BLOCKER** (cutover) |
| **P1-AC-13** | After wall on: unclaimed student `/s/[token]` shows claim-required CTA (not blank 404) | REQUIRED |
| **P1-AC-14** | No anonymous note access remains anywhere in `/s/*` after wall activation | **BLOCKER** (Sarah requirement) |

---

## §4. Phase 2 — Session-Login

### 4.1 SessionParticipant model

**New Prisma model** (Phase 3 in the identity design — this is the Phase 3 component that Phase 2 needs):

```prisma
/// Authorization record for a learner joining a specific session.
/// Created by the TUTOR (server action) when starting/creating a session
/// for a claimed student. The learner cannot create their own participant row.
/// Created as part of startWhiteboardSession; created for Session B in mid-session swap.
model SessionParticipant {
  id                   String           @id @default(uuid())
  whiteboardSessionId  String
  whiteboardSession    WhiteboardSession @relation(fields: [whiteboardSessionId], references: [id], onDelete: Cascade)
  learnerProfileId     String
  learnerProfile       LearnerProfile   @relation(fields: [learnerProfileId], references: [id], onDelete: Cascade)

  joinedAt             DateTime         @default(now())
  leftAt               DateTime?        // set on session end or mid-session swap

  @@unique([whiteboardSessionId, learnerProfileId])
}
```

Migration: additive column only. No changes to existing tables.

### 4.2 Where SessionParticipant rows are created

| Trigger | Who creates | When |
|---|---|---|
| `startWhiteboardSession` (new/updated action) | Tutor server action | If `student.learnerProfileId IS NOT NULL`, create `SessionParticipant` row in the same DB transaction as session creation |
| Mid-session swap (Session B) | `/api/sessions/swap` server action | Phase 2 of swap; `SessionParticipant` for Session B created with `joinedAt = now()` (per session-lifecycle-consent design §3.4) |
| Session end | `endWhiteboardSession` | Set `leftAt = now()` for all open participant rows (no delete; audit trail) |

### 4.3 Real `assertIsSessionParticipant`

Replace the stub in `src/lib/session-participant-scope.ts`:

```typescript
export async function assertIsSessionParticipant(
  learnerProfileId: string,
  whiteboardSessionId: string
): Promise<SessionParticipant> {
  const participant = await db.sessionParticipant.findUnique({
    where: {
      whiteboardSessionId_learnerProfileId: { whiteboardSessionId, learnerProfileId },
    },
  });
  if (!participant) {
    console.error(
      `[lpr] lpr=${learnerProfileId} action=join_denied sessionId=${whiteboardSessionId} reason=not_participant`
    );
    notFound();
  }
  return participant;
}
```

### 4.4 New login-gated live route vs. demoting `/w/[joinToken]`

**New route:** `src/app/join/[sessionId]/page.tsx`

```
URL: /join/<whiteboardSessionId>#k=<encryptionKey>
Auth: getLearnerSession(req) → assertIsSessionParticipant(learnerSession.learnerProfileId, sessionId)
Renders: SessionLiveClient (new component wrapping the existing StudentWhiteboardClient logic)
```

**Fragment preservation (OQ-3 — concrete sub-requirement):**

Before any redirect to `/students/login` (middleware or page-level), client code MUST:
1. If `window.location.hash` is non-empty, write it to `sessionStorage` under a namespaced key (e.g. `mynk_join_hash_<sessionId>`).
2. After successful learner login, read and restore the hash onto `window.location` before the join page initializes the encryption key hook.

This closes the login-redirect fragment-strip failure. The `returnTo` query param carries only the path (`/join/<sessionId>`); the fragment is recovered from `sessionStorage`, not the redirect URL.

**Join link validity (OQ-3):** The join URL stays **valid for the entire live session** — session TTL good AND `endedAt == null`. No mid-session key invalidation. The auth wall (`SessionParticipant` + learner session), not key possession alone, is the gate; keeping the link live does not weaken Option A.

**What happens to `/w/[joinToken]`:**
- **Retained as fallback for unclaimed students** — the token IS the auth for anonymous learners (no `LearnerProfile`)
- For claimed students: the tutor's "Copy student link" button in `WhiteboardWorkspaceClient.tsx` changes behavior:
  - If `student.learnerProfileId IS NOT NULL`: generate `/join/<sessionId>#k=<key>` (authenticated path)
  - If `student.learnerProfileId IS NULL`: generate `/w/<joinToken>#k=<key>` (anonymous fallback, same as today)

### 4.5 The E2E key — threat model analysis and decision

#### What `#k=` actually protects and against whom

The AES-GCM-256 key in the URL fragment protects **the relay from reading whiteboard content**. Specifically:
- The relay (`excalidraw-room` server at `WHITEBOARD_SYNC_URL`) only receives encrypted bytes + IV — it cannot decrypt scene content
- A relay compromise (takeover of the sync server) cannot read whiteboard drawing content or forge updates (GCM authentication tag detects tampering)
- This is the same trust model as Excalidraw's excalidraw.com E2E: relay-blind

**What `#k=` does NOT protect against our own server:** Our server already processes:
- Audio segments (uploaded to Vercel Blob, transcribed by OpenAI Whisper server-side)
- Whiteboard events JSON (uploaded to Vercel Blob at `endWhiteboardSession`)
- AI-generated session notes (generated server-side from the Whisper transcript)
- `SessionNote`, `SessionRecording`, `NoteView` rows — all server-side

The whiteboard AES key is the ONE piece of session content our server does not see. This is not a "server can't read our sessions" guarantee — it's a "the relay server can't read our sessions" guarantee.

#### Options analysis

**Option A — Fragment URL delivery with required login (CHOSEN for V1, OQ-2)**

The authenticated join URL is `/join/<sessionId>#k=<encryptionKey>`. The key continues to travel in the URL fragment (never sent to any server). The page requires a valid `mynk_learner_session` + `SessionParticipant` row.

What this achieves:
- URL alone is insufficient (learner auth required) — stronger than today's anyone-with-link
- The relay remains blind to session content (key never reaches server or relay)
- The relay-blind E2E property is preserved
- Implementation is minimal (same key delivery mechanism as today; add auth check)

What this doesn't solve:
- If the learner shares the URL (with fragment) with another person who also has a valid learner session for the same `whiteboardSessionId`, that person could join. Mitigated by `SessionParticipant` check: only explicitly authorized learners can use the URL at all.
- The URL fragment remains a bearer token for the key. In V1 the threat model (stranger intercepts URL) is substantially mitigated by requiring auth.

**Option B — Server-mediated key delivery (considered and rejected for V1)**

The tutor generates the key client-side AND registers it with the server via a server action (stored encrypted with a server secret at rest). An authenticated participant hits `/api/sessions/[sessionId]/key` and receives the decrypted key over TLS.

Rejected because: server-side key storage breaks the relay-blind E2E architectural property for no practical privacy gain (our server already processes audio, events, and notes). Option A preserves relay-blind E2E at lower implementation cost.

#### Implementation detail for Option A

The tutor's "Copy student link" button changes from:
```
/w/<joinToken>#k=<encryptionKey>  (today)
```
to:
```
/join/<sessionId>#k=<encryptionKey>  (Phase 2, claimed students)
```

The key generation and storage in `window.location.hash` is **unchanged**. Only the destination route changes.

The `SessionLiveClient` (or updated `StudentWhiteboardClient`) extracts the key from `window.location.hash` exactly as today, with fragment restoration from `sessionStorage` after login redirect (§4.4).

### 4.6 Learner dashboard (session discovery)

**New routes:**
- `src/app/students/dashboard/page.tsx` (or `/account/learner/[learnerId]/sessions`)
- `src/app/students/sessions/[sessionId]/page.tsx` (session detail)

The learner dashboard lists sessions the learner participated in, across all tutors (IAC-2: one `LearnerProfile` can be linked to multiple tutors' `Student` rows):

```typescript
// Core query
const participants = await db.sessionParticipant.findMany({
  where: { learnerProfileId: learnerSession.learnerProfileId },
  include: {
    whiteboardSession: {
      include: {
        student: {
          include: {
            adminUser: { select: { displayName: true, email: true } }
          }
        },
        sessionConsentSnapshot: { select: { allowNoteSending: true, allowAudioRecording: true } }
      }
    }
  },
  orderBy: { whiteboardSession: { startedAt: 'desc' } }
});
```

Session card shows: date, duration, tutor name, link to notes if `allowNoteSending=true` in the snapshot. Live sessions (no `endedAt`) show "Join session" CTA → `/join/<sessionId>#k=<key>` (tutor re-shares link or learner uses browser history — join link valid for whole session per OQ-3).

### 4.7 API auth seams requiring learner-session variants

The following API routes authenticate via `WhiteboardJoinToken` today and need learner-session variants for Phase 2:

| Route | Current auth | Phase 2 variant |
|---|---|---|
| `GET /api/whiteboard/[sessionId]/join-timer?token=<joinToken>` | `WhiteboardJoinToken` in query string | Add branch: if `mynk_learner_session` present + `assertIsSessionParticipant` → serve timer without join token |
| `GET /api/w/[joinToken]/wb-asset?u=<url>` | `WhiteboardJoinToken` path param | **New route:** `GET /api/sessions/[sessionId]/wb-asset?u=<url>` with `getLearnerSession` + `assertIsSessionParticipant` auth |
| `POST /api/upload/blob` (joinToken branch) | `assertJoinTokenAllowsWhiteboardAssetUpload` | Add learner-session branch: `assertIsSessionParticipant(learner.learnerProfileId, sessionId)` + same path namespace check |

All existing `joinToken`-authed paths continue to work for unclaimed students.

### 4.8 Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `SessionParticipant` model |
| Migration | New additive migration: `SessionParticipant` table |
| `src/lib/session-participant-scope.ts` | Replace stub with real DB query |
| `src/app/admin/students/[id]/whiteboard/actions.ts` | `startWhiteboardSession` creates `SessionParticipant` row when `learnerProfileId` is set |
| `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx` | "Copy student link" branches on `student.learnerProfileId`: claimed → `/join/<sessionId>#k=<key>`, unclaimed → `/w/<joinToken>#k=<key>` |
| `src/app/join/[sessionId]/page.tsx` | **New:** login-gated session page; `getLearnerSession` + `assertIsSessionParticipant`; fragment preservation; renders live canvas |
| `src/app/students/login/page.tsx` (or shared auth util) | Restore `sessionStorage` hash after login when `returnTo` is `/join/*` |
| `src/app/students/dashboard/page.tsx` | **New:** learner dashboard; lists sessions via `SessionParticipant` query |
| `src/app/api/whiteboard/[sessionId]/join-timer/route.ts` | Add learner-session auth branch |
| `src/app/api/sessions/[sessionId]/wb-asset/route.ts` | **New:** authenticated asset proxy for claimed learners |
| `src/app/api/upload/blob/route.ts` | Add learner-session auth branch alongside joinToken branch |
| `AGENTS.md` | Register any new log prefixes (see §8) |

### 4.9 Phase 2 acceptance criteria

| # | Criterion | Blocker? |
|---|---|---|
| **P2-AC-1** | Claimed learner can load `/join/<sessionId>#k=<key>` with valid learner session + `SessionParticipant` row | **BLOCKER** |
| **P2-AC-2** | Claimed learner without `SessionParticipant` row → 404 at `/join/<sessionId>` | **BLOCKER** (security) |
| **P2-AC-3** | Anonymous `/w/[joinToken]` still works for unclaimed students (no regression) | **BLOCKER** |
| **P2-AC-4** | Learner A's session cannot reach learner B's `/join/<sessionId>` | **BLOCKER** (security) |
| **P2-AC-5** | Learner dashboard shows sessions for the correct `learnerProfileId` | REQUIRED |
| **P2-AC-6** | `assertIsSessionParticipant` returns the DB row (no longer always 404) | **BLOCKER** |
| **P2-AC-7** | `SessionParticipant` rows created at session start when `learnerProfileId` is set | REQUIRED |
| **P2-AC-8** | `join-timer` accessible via learner session (no token required for claimed learners) | REQUIRED |
| **P2-AC-9** | `wb-asset` route accessible via learner session | REQUIRED |
| **P2-AC-10** | Login redirect preserves `#k=` fragment via `sessionStorage` capture/restore | **BLOCKER** |
| **P2-AC-11** | Join link remains valid while session live (`endedAt == null`); no mid-session invalidation | REQUIRED |

### 4.10 Notes page — first-class authenticated site integration (forward requirement)

**Captured 2026-06-10 (Andrew, pilot/design conversation).** Not Phase 1 scope — belongs to the notes-page redesign alongside Phase 2 dashboard work.

Andrew: *"When we get to the redesign of the notes page lets make sure they can navigate away. There's no reason to not just have the notes page as part of the parent/child's site."*

**Requirement:** The notes view MUST be redesigned as a **first-class page within the authenticated parent/child site** — normal app nav/chrome, ability to navigate away to dashboard and other account routes — **not** a standalone dead-end share page. Anonymous `/s/[token]` routes are being deprecated in favor of authenticated parent/learner dashboards (`/account/children/[learnerId]/notes`, learner dashboard session cards); the notes UX should follow that model even when reached via email deep-link (`returnTo`).

| # | Criterion | Blocker? |
|---|---|---|
| **P2-AC-12** | Notes view renders inside authenticated parent/child chrome with working nav to dashboard and sibling routes (not a nav-less dead end) | REQUIRED |
| **P2-AC-13** | Parent or learner can leave the notes view without signing out or closing the tab (standard site navigation) | REQUIRED |

Cross-ref: §3.7 account-level notes route; §4.6 learner dashboard; [`docs/BACKLOG.md`](../BACKLOG.md) § Identity / access.

---

## §5. Auth-Boundary Map

The authoritative source for which principal authorizes which resource.

### 5.1 Principal summary

| Principal | Auth mechanism | Cookie | Session table | Helper |
|---|---|---|---|---|
| **Tutor / Admin** (`AdminUser`) | NextAuth Google OAuth + JWT | `next-auth.session-token` | Stateless JWT | `getServerSession(authOptions)` |
| **Parent / Self-learner** (`AccountHolder`) | Custom email+password (separate realm) | `mynk_ah_session` | `AccountHolderSession` | `getAccountHolderSession(req)` |
| **Learner** (`LearnerProfile`) | PIN (`username@familyid`) | `mynk_learner_session` | `LearnerDeviceSession` | `getLearnerSession(req)` |

**Three completely separate session realms.** No fallback between them. `getToken()` (NextAuth) only reads `next-auth.session-token`. A valid `mynk_ah_session` cookie never produces a NextAuth token and never satisfies `/admin/*` routes.

### 5.2 Resource authorization map

| Resource | Principal(s) | Guard | Notes |
|---|---|---|---|
| `Student`, `WhiteboardSession`, `SessionNote`, `SessionRecording`, `CostEvent` | **Tutor only** | `requireStudentScope` → `assertOwnsStudent` / `assertOwnsWhiteboardSession` | **Never** give learner or parent principal access through these guards. IAC-1. |
| `LearnerProfile`, `ConsentRecord`, `AccountHolderSession`, device list | **Parent / AccountHolder** | `getAccountHolderSession` → `assertOwnsLearnerProfile` | Also: `assertOwnsConsentRecord` for consent mutation |
| Session notes (read) | **Parent** (claimed learner) | `getAccountHolderSession` → `assertOwnsLearnerProfile` + check `allowNoteSending` | Phase 1 — **all** students require claim + auth |
| Session notes (read) | **Learner** (own notes) | `getLearnerSession` → `learnerSession.learnerProfileId === student.learnerProfileId` | Phase 1 |
| Live session join | **Learner** | `getLearnerSession` → `assertIsSessionParticipant` | Phase 2; never via `assertOwnsWhiteboardSession` |
| `SessionParticipant` row creation | **Tutor** only | Inside `startWhiteboardSession` (tutor-authed server action) | Learner cannot create their own participant row |
| Session content post-session (replay, recordings) | **Parent** (consent-gated) | `getAccountHolderSession` → `assertOwnsLearnerProfile` → check `SessionConsentSnapshot` | Phase 2+ |
| Learner dashboard (session list) | **Learner** | `getLearnerSession` → query `SessionParticipant` by `learnerProfileId` | Phase 2 |
| Admin impersonation | **Admin** only (operator realm) | Existing SEC-1 mechanism, NextAuth only | Never crosses into AccountHolder or LearnerRealm |

### 5.3 Multi-tenant safety invariants

1. **Tutor scope is always `(adminUserId, studentId)` — never `learnerProfileId` alone.** Session artifacts anchor on the tutor's `adminUserId`. IAC-1.
2. **`assertOwnsWhiteboardSession` is tutor-only.** No learner or parent principal uses it.
3. **`assertIsSessionParticipant` is learner-only.** It checks `SessionParticipant.learnerProfileId` against the authenticated learner's ID from the session cookie.
4. **`assertOwnsLearnerProfile` is parent-only.** The learner accessing their own profile checks `learnerSession.learnerProfileId === requestedProfileId` directly — they are the subject, not the owner in the AccountHolder sense.
5. **`adminUserId` FK on every session artifact.** The multi-tutor IAC-2 schema change (`@@unique([adminUserId, learnerProfileId])` on `Student`) ensures no cross-tutor content leakage.
6. **Tombstone check in every auth helper.** `getLearnerSession` rejects tombstoned profiles. `assertOwnsLearnerProfile` rejects tombstoned profiles. Both fail closed.

---

## §6. Sequencing with the Waiting Room (Gate A2)

The waiting-room (Gate-A2) and Phase 2 (session-login) share the same technical foundation:

| Component | A2 (waiting room) | Phase 2 (session-login) |
|---|---|---|
| `startedAt DateTime?` on `WhiteboardSession` | Required: distinguishes `pending` from `active` state | Required: learner dashboard shows only `active`/`ended` sessions |
| `SessionParticipant` | Needed for "who is in the room" | Auth gate for `/join/[sessionId]` |
| `/join/[sessionId]` route | The waiting room IS this route in `pending` state | Live session IS this route in `active` state |
| `SessionConsentSnapshot` | Created at `startWhiteboardSession` | Gates recording + replay per learner |

**Design principle: `/join/[sessionId]` is ONE route with multiple states** (Phase 2 session-login == Gate A2 waiting room — not two routes):

```
Learner loads /join/<sessionId>#k=<key>
  ↓
[capture hash to sessionStorage if redirect to login needed]
  ↓
getLearnerSession + assertIsSessionParticipant
  ↓
[restore hash from sessionStorage after login if needed]
  ↓
Fetch WhiteboardSession state
  ↓
if startedAt IS NULL (pending):
  → Render waiting room: "Waiting for your tutor to start…"
  → Poll /api/whiteboard/[sessionId]/status for startedAt to be set
  → On transition: render live canvas

if startedAt IS NOT NULL AND endedAt IS NULL (active):
  → Render live canvas (existing StudentWhiteboardClient logic)

if endedAt IS NOT NULL (ended):
  → Render "Session ended" screen + link to notes (if allowNoteSending=true)
```

**Touchpoints with A2 build:**
- The A2 build (waiting room UX) should build the `/join/[sessionId]` route from the start, even if the "live canvas" part is stubbed at first
- Do NOT build A2 as a separate route that then redirects to a live route — that introduces a redirect mid-session when `startedAt` is set, which is more disruptive than a single-route state transition
- The auth layer (Phase 2) and the waiting room UX (A2) should be dispatched as one combined executor scope, not two separate branches that need to be merged

---

## §7. 5-Axis Adversarial Reliability Review

### Axis 1 — Data Durability

| Risk | Severity | Mitigation | Phase gate |
|---|---|---|---|
| Claimed student notes become inaccessible to existing parents who don't have accounts yet | **BLOCKER** | **Hard wall requires onboarding first.** Phase 1 ships tutor-initiated claim invites (`ClaimInviteSection` → `/claim/<token>`) + **claim-before-flip** cutover (no grace window at N=1; `NOTES_AUTH_WALL` flips at master cut only after pilot family claims). Tutor inventory of unclaimed students; straggler re-invite path. Pilot scale (one family) makes manual onboarding feasible. | P1-AC-11, P1-AC-12, P1-AC-14 |
| `SessionParticipant` row missing for a claimed student → learner cannot join | **BLOCKER** | Row created inside `startWhiteboardSession` transaction (same transaction as session creation). If `learnerProfileId` is null, no row is created and no attempt to join is possible. | P2 acceptance: test participant row exists after session creation for claimed student |
| `endWhiteboardSession` sets `leftAt` on `SessionParticipant` — if this fails, orphan open participant rows | MEDIUM | Use `updateMany` (not `update`) inside the atomic transaction — `updateMany` with `where: { whiteboardSessionId, leftAt: null }` is safe even if 0 rows match (no error). | P2 acceptance |
| `assertCanAccessShareLink` rejects valid parent on tombstoned `LearnerProfile` | MEDIUM | If `learnerProfile.tombstonedAt IS NOT NULL`, `assertOwnsLearnerProfile` returns 404. Notes access denied; tutor must re-invite / reconnect. No anonymous fallback. | P1 acceptance |

### Axis 2 — Recovery / Durability

| Risk | Severity | Mitigation | Phase gate |
|---|---|---|---|
| Learner `mynk_learner_session` cookie expires during a live session | **HIGH** | The `/join/[sessionId]` page is a client component. When the learner's session expires mid-session, the server component re-validates on navigation but NOT on the client-side WebRTC stream (which runs independently). The live session continues as long as the tab is open; only a page reload would trigger re-auth. The sync client is independent of the session cookie. This is acceptable behavior and does NOT drop the session. | Architectural invariant: sync is client-state, not request-per-frame |
| Learner reloads the page after cookie expiry | HIGH | Reload triggers auth check → redirect to login. **Mitigation (OQ-3 resolved):** client captures `location.hash` to `sessionStorage` before redirect; restores after login. Join link stays valid for whole live session. Mid-session reload with re-auth recovers the encryption key without tutor re-share. | P2-AC-10 |
| Parent email link clicked on a different device than where they created their account | LOW | Standard cookie-based auth; parent logs in on new device normally. No session persistence concern beyond normal browser cross-device behavior. | Standard |
| `sal=` log events emitted for all denied notes accesses | MEDIUM | Required for production debugging; without it, a parent reporting "can't see notes" cannot be diagnosed. | P1 BLOCKER-O1 |
| Parent locked out at wall with no claim invite | **BLOCKER** | Claim-before-flip ordering + tutor invite + claim-required screen with "contact your tutor" / re-send invite path. Tutor dashboard shows unclaimed status. | P1-AC-11, P1-AC-13 |

### Axis 3 — Concurrency

| Race condition | Severity | Mitigation | Phase gate |
|---|---|---|---|
| Two `SessionParticipant` creation attempts for the same (sessionId, learnerProfileId) | MEDIUM | `@@unique([whiteboardSessionId, learnerProfileId])` prevents duplicate rows. `createMany({ skipDuplicates: true })` or `upsert` handles the race. The tutor's `startWhiteboardSession` is the only code that creates rows; two concurrent session starts for the same session are already prevented by existing idempotency. | Schema constraint |
| Learner joins via `/join/<sessionId>` while tutor is mid-session-end sequence | LOW | Session end: `endWhiteboardSession` sets `endedAt` atomically. When `endedAt` is set, the `/join/[sessionId]` page transitions to "Session ended" state (detected via `/api/whiteboard/[sessionId]/join-timer`-equivalent status check). The sync client disconnects on `session_ended` response. | Existing behavior (same as today's `join-timer` `{ live: false, reason: "session_ended" }` response) |
| Multiple learners with the same `learnerProfileId` join simultaneously (two tabs) | LOW | `assertIsSessionParticipant` is read-only; both tabs succeed. The WebRTC mesh handles multiple peers with the same identity via the stable `localPeerId` mechanism (LIVE-AV.md invariant #9). | No new concern |

### Axis 4 — Auth / Ownership Boundaries

| Boundary | Severity | Test required |
|---|---|---|
| Anonymous `mynk_ah_session` satisfies `/join/*` route (wrong realm) | **BLOCKER** | `/join/<sessionId>` must check `mynk_learner_session`, NOT `mynk_ah_session`. The parent is an observer, not a live session participant. Test: parent AH session + learner's session join URL → 401/redirect to learner login |
| Learner session for learner A satisfies `/join/<sessionId>` where participant row is for learner B | **BLOCKER** | `assertIsSessionParticipant(learnerA.id, sessionId)` → 404 if row is `(sessionId, learnerB.id)`. Test: learner A cookie + session intended for learner B → 404 |
| Parent notes access for `StudentId` not owned by their child | **BLOCKER** | `assertOwnsLearnerProfile(ah.id, student.learnerProfileId)` → 404 if mismatch. Test: parent A session + student whose `learnerProfileId` belongs to parent B's AccountHolder → 404 |
| `ShareLink` revocation is honored even for authenticated principals | HIGH | If `shareLink.revokedAt IS NOT NULL`, return 404 regardless of session validity. The auth gate is layered ON TOP of the revocation check, not replacing it. |
| Tutor cannot access `/join/<sessionId>` routes (wrong realm) | MEDIUM | Tutor NextAuth token → `/join/*` handler calls `getLearnerSession()` → null → redirect to learner login. The handler must NOT fall back to `getServerSession()`. |
| No `learnerProfileId` on `WhiteboardSession` means learner lookup goes through `Student` | HIGH | Multi-tutor: `Student.learnerProfileId` is the bridge. `assertIsSessionParticipant` uses the `SessionParticipant` table (direct `learnerProfileId`), NOT the `Student` bridge. This is correct and avoids the bridge entirely for live-session auth. |
| Anonymous notes access after wall activation | **BLOCKER** | Any `/s/[token]` without valid principal → redirect, not 200. Negative test for unclaimed student too. | P1-AC-14 |

**BLOCKERs for Phase 1 acceptance (auth):**
- `BLOCKER-P1-A1`: Negative test for notes without auth → redirect (not 200) — all students
- `BLOCKER-P1-A2`: Negative test for parent accessing notes for a student whose `learnerProfileId` belongs to a different AccountHolder → 404
- `BLOCKER-P1-A3`: Negative test for learner A accessing share page for learner B's student → 404
- `BLOCKER-P1-A4`: Negative test for unclaimed student notes without auth → not anonymous 200

**BLOCKERs for Phase 2 acceptance (auth):**
- `BLOCKER-P2-A1`: Negative test for learner A joining a session whose `SessionParticipant` row is for learner B → 404
- `BLOCKER-P2-A2`: Negative test for AccountHolder (parent) session satisfying `/join/*` → 401/redirect to learner login
- `BLOCKER-P2-A3`: Positive test for tutor's `StudentWhiteboardClient`-equivalent (no regression) — anonymous join still works via `/w/[joinToken]` for unclaimed students
- `BLOCKER-P2-A4`: Fragment preserved across login redirect (`sessionStorage` round-trip)

### Axis 5 — Observability

| Event | Log line | Prefix | Phase |
|---|---|---|---|
| Notes access granted | `[sal] sal=<tok:8> action=access_granted principal=account_holder studentId=<id>` | `sal` | P1 |
| Notes access denied (no session) | `[sal] sal=<tok:8> action=access_denied_redirect studentId=<id> reason=no_session` | `sal` | P1 |
| Notes claim required (unclaimed) | `[sal] sal=<tok:8> action=claim_required studentId=<id> reason=unclaimed` | `sal` | P1 |
| Notes ownership denied | `[sal] sal=<tok:8> action=ownership_denied principal=<type> reason=wrong_owner` | `sal` | P1 |
| Session join granted | `[lpr] lpr=<id> action=session_join_granted sessionId=<id>` | `lpr` | P2 |
| Session join denied (no participant row) | `[lpr] lpr=<id> action=join_denied sessionId=<id> reason=not_participant` | `lpr` | P2 (already in stub) |

Register `sal` in `AGENTS.md` § Conventions.

**BLOCKER for Phase 1 (observability):**
- `BLOCKER-P1-O1`: All `sal=` events must emit before Phase 1 ships to production. Without them, debugging "parent can't see notes" in production is impossible.

**BLOCKER for Phase 2 (observability):**
- `BLOCKER-P2-O1`: `lpr=` join_denied events must fire for unauthenticated and participant-mismatch cases (the stub already has one; make sure the real implementation preserves it).

---

## §8. Open Questions for Andrew

All questions resolved 2026-06-10. Kept for audit trail.

| # | Question | Status | Resolution |
|---|---|---|---|
| **OQ-1** | **Phase 1 cut-point for unclaimed students:** when Phase 1 ships, should unclaimed student notes immediately show a "sign up to access" wall (no anonymous view), or continue to serve anonymously with a "claim your account" CTA? | **RESOLVED** | **Hard auth-wall (Option B).** All students require AccountHolder or learner session for `/s/[token]`. No anonymous fallback. Phase 1 MUST include one-time family onboarding (tutor-initiated claim invites via existing `/claim/<token>` flow) before wall activation. **Operational cutover updated 2026-06-10:** claim-then-flip at master cut — no grace window at pilot scale (supersedes prior 7-day grace plan; see §3.5.3). Sarah's requirement is the driver; Andrew ratified. |
| **OQ-2** | **E2E key delivery for Phase 2 (relay-blind vs. server-mediated):** should V1 preserve relay-blind E2E (keep `#k=` in URL, require auth — Option A), or use server-mediated key delivery (server stores the key, serves it to authenticated participants — Option B)? | **RESOLVED** | **Option A chosen.** Fragment URL (`/join/<sessionId>#k=<key>`) + required learner auth; relay-blind E2E preserved; no server-side key storage. Option B considered and rejected for V1 — breaks relay-blind E2E for no practical privacy gain. See §4.5. |
| **OQ-3** | **Key re-entry after cookie expiry mid-session:** if a learner's `mynk_learner_session` cookie expires and they reload `/join/<sessionId>`, they are redirected to login. The browser's `returnTo` parameter cannot carry the URL fragment (HTTP spec). After login, the learner lands at `/join/<sessionId>` with no key — they need to get the key URL again from the tutor. Is this acceptable for V1, or should we implement a key re-delivery mechanism? | **RESOLVED** | **Accept + keep-link-valid + fragment-preservation.** (a) Join link stays valid for the whole live session (`endedAt == null`); auth wall is the gate, not key invalidation. (b) Close login-redirect fragment-strip with client-side `sessionStorage` capture/restore of `location.hash` before/after auth. See §4.4. Mid-session reload edge case is a non-event. |

---

## Appendix A — Schema Additions Summary

All additions are additive. No drops or renames.

| Model | Addition | Purpose |
|---|---|---|
| `SessionParticipant` | **New model** (see §4.1) | Live session join authorization |

The `startedAt DateTime?` column on `WhiteboardSession` (from session-lifecycle-consent design §2.5) is a prerequisite for the waiting room state machine. Include in the same migration as `SessionParticipant` if not already present.

---

## Appendix B — New Log Prefixes

| Prefix | Scope | Register in |
|---|---|---|
| `sal` | Share-link access: granted, denied, claim-required, ownership denied | `AGENTS.md` § Conventions + `RECORDER-LIFECYCLE.md` cheat sheet |

Collision check against existing registry (`rid`, `wbsid`, `wba`, `obx`, `dft`, `snp`, `pvw`, `pvs`, `avx`, `cev`, `blb`, `brs`, `imp`, `tfa`, `lpr`, `nsi`, `rol`, `ahx`, `clm`, `cns`, `slc`, `wtr`, `alr`, `tfr`):
**No collision.**

---

## Appendix C — Sequencing Summary

| Phase | Prerequisites | What ships | Gate |
|---|---|---|---|
| **Phase 1 — Notes-login** | `AccountHolderSession` + `LearnerDeviceSession` auth (P2a already merged or ready); existing claim-invite flow | Hard auth-wall on `/s/[token]` (all students); `assertCanAccessShareLink`; family onboarding + claim-then-flip cutover (no grace at N=1); `/account/children/[learnerId]/notes`; `sal=` logging; email copy update | Sarah's notes-must-require-login requirement |
| **Phase 2 — Session-login** | Phase 1 complete; `SessionParticipant` model in schema | Real `assertIsSessionParticipant`; `/join/[sessionId]` route (waiting room + live; == Gate A2); fragment preservation; learner dashboard; learner-session variants for `join-timer` + `wb-asset` + `upload/blob`; "Copy student link" branch; Option A E2E key | Gate A2 (waiting room) + consent model correctness |

Phase 2 IS Gate A2. Dispatch them as one executor scope.

---

## Kickoff decisions 2026-06-10 (build)

Andrew locked the following at Phase 1 build kickoff. These refine §3.5.3 for **implementation and cutover timing**; the hard-wall design (OQ-1) is unchanged.

| Decision | Outcome |
|---|---|
| **Wall ships dormant** | Phase 1 (notes-login) builds the **full** auth-wall mechanism (`assertCanAccessShareLink`, middleware, anon API hardening, `/account/children/[learnerId]/notes`, tests, `sal=` logging) but ships with **`NOTES_AUTH_WALL` default `false`**. On `v1-redesign`, anonymous `/s/[token]` access continues until the flag is explicitly enabled. |
| **When the flag flips** | `NOTES_AUTH_WALL=true` **only** at the **`v1-redesign`→`master` cutover**, and **only after** Sarah's pilot family is claimed/credentialed. Rationale: Sarah has only ever used `master` (production); enabling the wall on `master` before v1 lands there, or before the family is credentialed, would lock her out of notes. |
| **No grace window (pilot scale)** | **Supersedes** the prior grace-window cutover plan (§3.5.3). Andrew 2026-06-10: *"I really don't think at our scale we need a grace period."* At N=1: parent **claims before** flip → `NOTES_AUTH_WALL=true` at master cut → parent logs in and sees notes. No period where anonymous emailed links still work post-claim. Emailed `/s/<token>` links become login-required instantly at flip (`source=notes_email`). Re-evaluate (reintroduce grace window) only if the pilot grows to multiple un-migrated families before the flip. |
| **View vs consent** | Phase 1 gates **viewing** session notes on **ownership** (`assertOwnsLearnerProfile` / learner self-match) **alone**. Parent privacy **consent** enforcement (Gate B2 — `SessionConsentSnapshot`, capture gating) is a **separate parallel thread**, intentionally decoupled from the notes-login wall. |
| **Sequencing** | **Phase 1 first** (notes-login on `feat/notes-login`). **Then** Phase 2 + Gate A2 (session-login + waiting room) as **one combined executor scope** — not two branches to merge later (see §6). |

---

## §9. Gate B2 — Parent Privacy Consent (forward requirements)

Gate B2 (`ConsentRecord`, `SessionConsentSnapshot`, server-enforced capture gating) is a **separate parallel thread** from Phase 1 notes-login (see [Kickoff decisions 2026-06-10](#kickoff-decisions-2026-06-10-build)). Phase 1 gates **viewing** on ownership alone; B2 gates **capture and sharing** per consent toggles. Items below are **B2 acceptance requirements**, not Phase 1.

### 9.1 Per-tutor privacy re-consent at claim / reconnect

**Captured 2026-06-10 (Andrew, pilot/design conversation).** Observed during claim flow: parent claimed via link without being prompted to set privacy options again — acceptable for Phase 1, but **must not carry into Gate B2**.

Andrew: *"I had to have the parent claim the account first, I notice it didn't ask to set creds again, which is possibly fine for now but with the privacy toggles, a parent should probably have to at least set that again when reconnecting to a tutor. Let's make sure that when we do the privacy toggles a parent who uses a claim link has to set the privacy options for that tutor again."*

**Requirement:** When Gate B2 privacy/consent toggles ship, a parent who uses a **claim link** to connect (or **reconnect**) to a tutor MUST be required to **(re)set privacy/consent options for that tutor at claim time**. Consent is **per-tutor** (scoped to the `Student` / tutor relationship), not global to the `AccountHolder`. Prior consent for another tutor, or stale consent from a prior connection to the same tutor, MUST **not** silently carry over or default-on across claim/reconnect — the parent explicitly confirms toggles for **this** tutor before the connection is complete.

| # | Criterion | Blocker? |
|---|---|---|
| **B2-AC-1** | Claim (or reconnect) flow blocks completion until parent sets privacy toggles for **this** tutor | **BLOCKER** (B2) |
| **B2-AC-2** | No silent inherit of another tutor's consent or prior-session defaults on claim/reconnect | **BLOCKER** (B2) |

Cross-ref: [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §4; [`identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) §7; [`docs/BACKLOG.md`](../BACKLOG.md) § Gate B2.

---

*End of design document.*
