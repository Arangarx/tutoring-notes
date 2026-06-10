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
| **Phase 1** | Notes-login: `/s/[token]` and `/s/[token]/all` require AccountHolder or learner authentication before showing notes. Lower risk, satisfies Sarah's hard ask. Ships first. |
| **Phase 2** | Session-login: `/join/[sessionId]` replaces anonymous `/w/[joinToken]` as the primary live-session entry point for authenticated learners. The harder piece — the E2E key (see §4). |
| **Sequencing** | Phase 1 before Phase 2. Phase 1 does not depend on `SessionParticipant`; Phase 2 does. |
| **Low-friction credential path** | Magic-link / first-click "claim your account" onboarding CTA. Framed as good onboarding, not a privacy compromise. |
| **Anonymous fallback** | Anonymous tokens (`ShareLink`, `WhiteboardJoinToken`) remain as fallback **only for unclaimed students** until the 90-day post-V1 sunset (Q-CGC-3 recommendation). This is a transition period, not a permanent path. |

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

---

## §3. Phase 1 — Notes-Login

### 3.1 The problem

`/s/[token]/page.tsx` renders all non-DRAFT notes for a student with zero auth. A parent who receives the share link email can bookmark it and revisit indefinitely. The token never expires. Any person who intercepts the email link also gets access. For claimed students with real `LearnerProfile` rows, this violates Sarah's explicit requirement.

### 3.2 Auth gate design

Two principals are authorized to view notes for a student:
1. **AccountHolder (parent/guardian):** must own the `LearnerProfile` linked to the `Student`
2. **LearnerProfile (learner):** must be the learner linked to the `Student`

Gate logic for `/s/[token]`:

```
ShareLink.token → ShareLink.studentId
  → Student { learnerProfileId, adminUserId }

if Student.learnerProfileId IS NULL:
  → unclaimed student → allow anonymous access (fallback; show "claim your account" CTA)

if Student.learnerProfileId IS NOT NULL:
  → claimed student → require auth:
    if mynk_ah_session present:
      → getAccountHolderSession(req) → ahSession
      → assertOwnsLearnerProfile(ahSession.accountHolderId, student.learnerProfileId) → grants access
    else if mynk_learner_session present:
      → getLearnerSession(req) → learnerSession
      → assert learnerSession.learnerProfileId === student.learnerProfileId → grants access
    else:
      → redirect to /account/login?returnTo=/s/<token>&source=notes
        (parent path; the email goes to the parent, so parent auth is the primary case)
```

### 3.3 New helper: `assertCanAccessShareLink`

New file: `src/lib/share-access-scope.ts`

```typescript
/**
 * Asserts that the requesting principal has read access to the share page
 * for the given student. Returns the access verdict + student data on success;
 * calls redirect() on unauthenticated; returns { anonymous: true } for
 * unclaimed students (fallback path).
 *
 * Log prefix: sal= (share access log — see AGENTS.md)
 */
export async function assertCanAccessShareLink(
  req: NextRequest | Request,
  token: string,
): Promise<{
  anonymous: boolean;
  studentId: string;
  learnerProfileId: string | null;
}>;
```

**Log prefix:** `sal` (share access log). Key events:
- `[sal] sal=<token:8> action=access_granted principal=account_holder|learner studentId=<id>`
- `[sal] sal=<token:8> action=access_denied_redirect studentId=<id> reason=no_session`
- `[sal] sal=<token:8> action=anonymous_fallback studentId=<id> reason=unclaimed`
- `[sal] sal=<token:8> action=ownership_denied principal=account_holder accountHolderId=<id>`

Register `sal` prefix in `AGENTS.md` § Conventions.

### 3.4 What happens to ShareLink + sendUpdateEmail

- `ShareLink` table is **unchanged** — still issued by the tutor, still revocable, still no expiry
- `sendUpdateEmail` continues to send `/s/<token>` URLs in notification emails — **the URL itself doesn't change**
- The `/s/<token>` page changes: adds the auth gate above; the URL is now a "notes access link" that requires login, not a standalone anonymous view
- **Email UX change:** the email body copy should update to: *"[Student] has a new session note from [Tutor]. Log in to view it: [notes link]"* rather than the current "here are the notes" framing. This is a copy change, not a functional change — the auth gate is the functional change.
- Existing `ShareLink` rows continue to work after Phase 1 ships; claimed students will simply be prompted to log in on first click.

### 3.5 Parent low-friction credential path ("claim your account")

The email-to-notes flow for a parent who has never logged in:

1. Parent receives note notification email → clicks link → `/s/<token>`
2. Middleware detects no `mynk_ah_session` → redirect to `/account/login?returnTo=/s/<token>&source=notes_email`
3. `/account/login` shows: **"See [Student]'s session notes — log in or create an account"** (the `source=notes_email` param triggers this welcome copy)
4. Parent has no account → clicks "Create account" → `/account/signup?returnTo=/s/<token>`
5. After signup + email verification → redirected to `/s/<token>` → notes shown
6. If parent already has account: step 3 → login → step 5

If the student is unclaimed (no `LearnerProfile`): notes show anonymously with a prominent **"Want to receive notifications and access notes anytime? Ask [Tutor] to set up your account."** CTA that links to a help article or a contact-tutor flow.

### 3.6 Files touched

| File | Change |
|---|---|
| `src/app/s/[token]/page.tsx` | Add `assertCanAccessShareLink(req, token)` call at top; handle unclaimed fallback |
| `src/app/s/[token]/all/page.tsx` | Same gate |
| `src/app/s/[token]/whiteboard/[whiteboardSessionId]/page.tsx` | Same gate (replay access) |
| `src/middleware.ts` | Add cookie-presence check for `/s/` paths: if no `mynk_ah_session` AND no `mynk_learner_session`, redirect to login (UX optimization; handler is the real gate) |
| `src/lib/share-access-scope.ts` | **New:** `assertCanAccessShareLink` helper |
| `src/app/account/login/page.tsx` | Handle `source=notes_email` for welcome copy |
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
| **P1-AC-1** | Claimed student notes at `/s/[token]` without auth → redirect to login, not 200 | **BLOCKER** |
| **P1-AC-2** | Claimed student notes accessible with valid `mynk_ah_session` (parent owns learner) | REQUIRED |
| **P1-AC-3** | Claimed student notes accessible with valid `mynk_learner_session` (correct learner) | REQUIRED |
| **P1-AC-4** | Unclaimed student notes still accessible anonymously (fallback, no regression) | **BLOCKER** (regression guard) |
| **P1-AC-5** | AccountHolder B's session cannot access Student owned by AccountHolder A's child | **BLOCKER** (security) |
| **P1-AC-6** | Learner session for learner A cannot access learner B's share page | **BLOCKER** (security) |
| **P1-AC-7** | Email link flow: click → login → notes (returnTo preserved) | REQUIRED |
| **P1-AC-8** | `sal=` log events emitted on access and denial | **BLOCKER** (observability) |
| **P1-AC-9** | Revoked `ShareLink` returns 404 for all principals (unchanged behavior) | REQUIRED |
| **P1-AC-10** | `/account/children/[learnerId]/notes` serves parent with valid AH session + owned learner | REQUIRED |

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

**What happens to `/w/[joinToken]`:**
- **Retained as fallback for unclaimed students** — the token IS the auth for anonymous learners (no `LearnerProfile`)
- For claimed students: the tutor's "Copy student link" button in `WhiteboardWorkspaceClient.tsx` changes behavior:
  - If `student.learnerProfileId IS NOT NULL`: generate `/join/<sessionId>#k=<key>` (authenticated path)
  - If `student.learnerProfileId IS NULL`: generate `/w/<joinToken>#k=<key>` (anonymous fallback, same as today)
- The anonymous path continues to work until the 90-day post-V1 sunset for unclaimed students

### 4.5 The E2E key — threat model analysis and recommendation

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

**Option A — Fragment URL delivery with required login (recommended for V1)**

The new authenticated join URL is `/join/<sessionId>#k=<encryptionKey>`. The key continues to travel in the URL fragment (never sent to any server). The page requires a valid `mynk_learner_session` + `SessionParticipant` row.

What this achieves:
- URL alone is insufficient (learner auth required) — stronger than today's anyone-with-link
- The relay remains blind to session content (key never reaches server or relay)
- The relay-blind E2E property is preserved
- Implementation is minimal (same key delivery mechanism as today; add auth check)

What this doesn't solve:
- If the learner shares the URL (with fragment) with another person who also has a valid learner session for the same `whiteboardSessionId`, that person could join. Mitigated by `SessionParticipant` check: only explicitly authorized learners can use the URL at all.
- The URL fragment remains a bearer token for the key. In V1 the threat model (stranger intercepts URL) is substantially mitigated by requiring auth.

**Option B — Server-mediated key delivery**

The tutor generates the key client-side AND registers it with the server via a server action (stored encrypted with a server secret at rest). An authenticated participant hits `/api/sessions/[sessionId]/key` and receives the decrypted key over TLS.

What this achieves:
- Learner only needs their PIN — no special URL with fragment required
- Simpler UX for learner onboarding (PIN login → session list → tap session → in)

What this costs:
- The server now sees (and stores) the whiteboard session key
- The relay-blind E2E property is lost — not because the relay sees the key, but because our server now knows it
- Given that our server already processes everything else (audio, events, notes), this is not a meaningful regression in actual content access. But it does remove a principled architectural property.

**Recommendation: Option A for V1** — Keep `#k=` fragment delivery. Require auth for the page. This preserves the relay-blind property without additional server-side key management, and is simpler to implement. The key is still tied to the session URL, but possession of the URL alone is now insufficient to join.

**Option B trade-off for Andrew to sign off:** If simpler learner UX (learner just needs PIN, no special URL) outweighs the architectural cleanliness of relay-blind E2E, Option B is acceptable. The server already has comprehensive content access; withholding the relay key is a principled distinction but not a practical privacy improvement given Whisper/notes. See §8 Open Questions (OQ-2).

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

The `SessionLiveClient` (or updated `StudentWhiteboardClient`) extracts the key from `window.location.hash` exactly as today.

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

Session card shows: date, duration, tutor name, link to notes if `allowNoteSending=true` in the snapshot. Live sessions (no `endedAt`) show "Join session" CTA → `/join/<sessionId>#k=<key>` (but key delivery here is the open question — see §8 OQ-2).

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
| `src/app/join/[sessionId]/page.tsx` | **New:** login-gated session page; `getLearnerSession` + `assertIsSessionParticipant`; renders live canvas |
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
| Session notes (read) | **Parent** (claimed learner) | `getAccountHolderSession` → `assertOwnsLearnerProfile` + check `allowNoteSending` | Phase 1 |
| Session notes (read) | **Learner** (own notes) | `getLearnerSession` → `learnerSession.learnerProfileId === student.learnerProfileId` | Phase 1 |
| Live session join | **Learner** | `getLearnerSession` → `assertIsSessionParticipant` | Phase 2; never via `assertOwnsWhiteboardSession` |
| `SessionParticipant` row creation | **Tutor** only | Inside `startWhiteboardSession` (tutor-authed server action) | Learner cannot create their own participant row |
| Session content post-session (replay, recordings) | **Parent** (consent-gated) | `getAccountHolderSession` → `assertOwnsLearnerProfile` → check `SessionConsentSnapshot` | Phase 2+ |
| Learner dashboard (session list) | **Learner** | `getLearnerSession` → query `SessionParticipant` by `learnerProfileId` | Phase 2 |
| Admin impersonation | **Admin** only (operator realm) | Existing SEC-1 mechanism, NextAuth only | Never crosses into AccountHolder or LearnerProfile realm |

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

**Design principle: `/join/[sessionId]` is ONE route with multiple states:**

```
Learner loads /join/<sessionId>#k=<key>
  ↓
getLearnerSession + assertIsSessionParticipant
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
| Claimed student notes become inaccessible to existing parents who don't have accounts yet | **BLOCKER** | Unclaimed student fallback explicitly preserved (anonymous fallback until 90-day sunset). Phase 1 only gates claimed students. | P1 acceptance: test unclaimed path still serves notes |
| `SessionParticipant` row missing for a claimed student → learner cannot join | **BLOCKER** | Row created inside `startWhiteboardSession` transaction (same transaction as session creation). If `learnerProfileId` is null, no row is created and no attempt to join is possible. | P2 acceptance: test participant row exists after session creation for claimed student |
| `endWhiteboardSession` sets `leftAt` on `SessionParticipant` — if this fails, orphan open participant rows | MEDIUM | Use `updateMany` (not `update`) inside the atomic transaction — `updateMany` with `where: { whiteboardSessionId, leftAt: null }` is safe even if 0 rows match (no error). | P2 acceptance |
| `assertCanAccessShareLink` rejects valid parent on tombstoned `LearnerProfile` | MEDIUM | If `learnerProfile.tombstonedAt IS NOT NULL`, `assertOwnsLearnerProfile` returns 404. Notes should fall back to anonymous unclaimed view in this edge case (tombstone effectively = unclaimed for access purposes). Add tombstone-to-unclaimed fallback in `assertCanAccessShareLink`. | P1 acceptance |

### Axis 2 — Recovery / Durability

| Risk | Severity | Mitigation | Phase gate |
|---|---|---|---|
| Learner `mynk_learner_session` cookie expires during a live session | **HIGH** | The `/join/[sessionId]` page is a client component. When the learner's session expires mid-session, the server component re-validates on navigation but NOT on the client-side WebRTC stream (which runs independently). The live session continues as long as the tab is open; only a page reload would trigger re-auth. The sync client is independent of the session cookie. This is acceptable behavior and does NOT drop the session. | Architectural invariant: sync is client-state, not request-per-frame |
| Learner reloads the page after cookie expiry | HIGH | Reload triggers auth check → redirect to login with `returnTo=/join/<sessionId>` (no key — see below) → after login, redirect back. **Key loss on reload is a known limitation of fragment delivery**: the key is in the original URL but the `returnTo` does not carry the fragment (fragments are not preserved across redirects by HTTP spec). Login re-entry point needs to show "Return to your session: [link]" that the learner can tap to re-enter (must be the original URL, which their device likely still has in browser history). **OPEN QUESTION for Andrew:** see OQ-3. | P2 acceptance: test login recovery flow; document key-re-entry |
| Parent email link clicked on a different device than where they created their account | LOW | Standard cookie-based auth; parent logs in on new device normally. No session persistence concern beyond normal browser cross-device behavior. | Standard |
| `sal=` log events emitted for all denied notes accesses | MEDIUM | Required for production debugging; without it, a parent reporting "can't see notes" cannot be diagnosed. | P1 BLOCKER-O1 |

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

**BLOCKERs for Phase 1 acceptance (auth):**
- `BLOCKER-P1-A1`: Negative test for claimed student notes without auth → redirect (not 200)
- `BLOCKER-P1-A2`: Negative test for parent accessing notes for a student whose `learnerProfileId` belongs to a different AccountHolder → 404
- `BLOCKER-P1-A3`: Negative test for learner A accessing share page for learner B's student → 404

**BLOCKERs for Phase 2 acceptance (auth):**
- `BLOCKER-P2-A1`: Negative test for learner A joining a session whose `SessionParticipant` row is for learner B → 404
- `BLOCKER-P2-A2`: Negative test for AccountHolder (parent) session satisfying `/join/*` → 401/redirect to learner login
- `BLOCKER-P2-A3`: Positive test for tutor's `StudentWhiteboardClient`-equivalent (no regression) — anonymous join still works via `/w/[joinToken]` for unclaimed students

### Axis 5 — Observability

| Event | Log line | Prefix | Phase |
|---|---|---|---|
| Notes access granted | `[sal] sal=<tok:8> action=access_granted principal=account_holder studentId=<id>` | `sal` | P1 |
| Notes access denied (no session) | `[sal] sal=<tok:8> action=access_denied_redirect studentId=<id> reason=no_session` | `sal` | P1 |
| Notes anonymous fallback (unclaimed) | `[sal] sal=<tok:8> action=anonymous_fallback studentId=<id> reason=unclaimed` | `sal` | P1 |
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

These are the questions that cannot be resolved by recommendation alone.

| # | Question | Gates | Options | Context |
|---|---|---|---|---|
| **OQ-1** | **Phase 1 cut-point for unclaimed students:** when Phase 1 ships, should unclaimed student notes immediately show a "sign up to access" wall (no anonymous view), or continue to serve anonymously with a "claim your account" CTA? | P1 scope | (A) Anonymous view + CTA — softer transition, Sarah's families can still see notes before claiming. (B) Auth-wall immediately — harder but cleaner compliance posture. **Recommendation: A** (anonymous fallback for unclaimed, same as today; gate only claimed students) | The 90-day sunset gives families time to claim. Forcing auth on unclaimed students risks breaking Sarah's current workflow before families have accounts. |
| **OQ-2** | **E2E key delivery for Phase 2 (relay-blind vs. server-mediated):** should V1 preserve relay-blind E2E (keep `#k=` in URL, require auth — Option A), or use server-mediated key delivery (server stores the key, serves it to authenticated participants — Option B)? | P2 implementation | Option A: relay-blind preserved, simpler implementation, key in shareable URL. Option B: simpler learner UX (PIN only, no special URL), server sees key but already sees everything else. **Recommendation: Option A for V1** — preserves the principled relay-blind property; URL sharing is already more constrained by the auth requirement. | Our server already processes audio/transcript/notes/events, so Option B doesn't materially change real privacy. But the relay-blind guarantee is meaningful architecture and cheap to preserve. If Andrew prefers frictionless learner UX (just PIN, no URL to share), Option B is acceptable. |
| **OQ-3** | **Key re-entry after cookie expiry mid-session:** if a learner's `mynk_learner_session` cookie expires and they reload `/join/<sessionId>`, they are redirected to login. The browser's `returnTo` parameter cannot carry the URL fragment (HTTP spec). After login, the learner lands at `/join/<sessionId>` with no key — they need to get the key URL again from the tutor. Is this acceptable for V1, or should we implement a key re-delivery mechanism (e.g., the learner dashboard entry for an active session links to the full URL with fragment, so they can tap it again)? | P2 UX | (A) Accept: cookie expires during a live session only if the learner is idle for 90 days (sliding renewal), which doesn't happen during a session. The risk is effectively zero in practice. (B) Dashboard entry for active sessions includes the full key URL for recovery. **Recommendation: A** — 90-day session expiry makes mid-session expiry a non-event. | `LearnerDeviceSession` slides on each request. A learner actively in a session will never expire. Reload does re-validate the cookie (it's still valid during the session). The theoretical risk is only if the cookie was revoked by the parent mid-session (legitimate action; learner should be locked out). |

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
| `sal` | Share-link access: granted, denied, anonymous fallback, ownership denied | `AGENTS.md` § Conventions + `RECORDER-LIFECYCLE.md` cheat sheet |

Collision check against existing registry (`rid`, `wbsid`, `wba`, `obx`, `dft`, `snp`, `pvw`, `pvs`, `avx`, `cev`, `blb`, `brs`, `imp`, `tfa`, `lpr`, `nsi`, `rol`, `ahx`, `clm`, `cns`, `slc`, `wtr`, `alr`, `tfr`):
**No collision.**

---

## Appendix C — Sequencing Summary

| Phase | Prerequisites | What ships | Gate |
|---|---|---|---|
| **Phase 1 — Notes-login** | `AccountHolderSession` + `LearnerDeviceSession` auth (P2a already merged or ready) | `/s/[token]` auth gate; `assertCanAccessShareLink`; `/account/children/[learnerId]/notes`; `sal=` logging; email copy update | Sarah's notes-must-require-login requirement |
| **Phase 2 — Session-login** | Phase 1 complete; `SessionParticipant` model in schema | Real `assertIsSessionParticipant`; `/join/[sessionId]` route (waiting room + live); learner dashboard; learner-session variants for `join-timer` + `wb-asset` + `upload/blob`; "Copy student link" branch | Gate A2 (waiting room) + consent model correctness |

Phase 2 IS Gate A2. Dispatch them as one executor scope.

---

*End of design document.*
