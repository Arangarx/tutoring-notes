# Session Identity & Access Control — Architecture Design Doc

> **Design date:** 2026-05-31
> **Authored by:** Sonnet 4.6 subagent, commissioned by Opus orchestrator
> **Deliverable type:** Design document only — no production code, no migrations applied
> **Prerequisite reads:** [`prisma/schema.prisma`](../../prisma/schema.prisma), [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md), [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md), [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md), [`docs/UX-AND-A11Y-SPEC.md`](../UX-AND-A11Y-SPEC.md), [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md)
> **Architecture locked by:** Opus orchestrator + Andrew. This doc DETAILS the locked thesis — it does not re-derive or contradict it.

---

## §1. Executive Summary

This document specifies the identity, authentication, consent, and access-control layer for **Mynk v1**. It is the identity/data/auth half of the V1 epic; the component/visual half lives in [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md).

### What changes from today

| Current state | V1 target |
|---|---|
| `Student` is a tutor-only stub with no login, no parent account | `Student` becomes a claimable stub; claimed → `LearnerProfile` tied to `AccountHolder` |
| Session access: anyone with a `ShareLink` token (notes) or `WhiteboardJoinToken` (live join) | Session access: participant-set only (`{tutor, LearnerProfile, AccountHolder}`) |
| No parent/student accounts at all | `AccountHolder` (email-verified, billing/consent owner) + `LearnerProfile` (the learner; own optional login) |
| Consent: a single per-`Student` `recordingDefaultEnabled` boolean; tutor-side only | Consent: versioned parent-ceiling lattice + child-narrowing, frozen-effective at session start, server-enforced |
| No 2FA anywhere | 2FA: TOTP mandatory for tutors/admins; opt-in (encouraged) for parents/students |
| Email flows: password reset only (`PasswordResetToken`) | Email flows: AccountHolder signup/verify, password reset, critical-change confirmation, claim invites |
| Messaging: none | Messaging: DB-routed parent↔tutor (+ optional student↔tutor), email as notification channel |

### V1 epic fit

The V1 epic has three concurrent threads:
1. **Component/visual redesign** — `v1-component-redesign-design-2026-05-31.md`
2. **Session identity + access** — **this document** (Phases 1–6 below feed into `v1-redesign` branch)
3. **Reliability floor** — Wave 1/2.5 already underway on master

The identity layer feeds Phase B (per-surface component redesign) and Phase C (IA/URL restructure) in the component doc — the student-join surface, parent portal, and consent UI all depend on this foundation.

---

## §2. Data Model

### 2.1 Three principals — schema summary

```
AdminUser (exists)          → Tutor/Admin (SEC-1 done; role ADMIN|TUTOR)
AccountHolder (NEW)         → Parent or self-managing adult learner
LearnerProfile (NEW)        → The learner. Belongs to AccountHolder. Optional own login.
Student (exists, altered)   → Tutor's stub. Gains learnerProfileId? foreign key (nullable).
```

### 2.2 Adult self-managed degeneration

When an adult manages their own tutoring (no separate parent), the `AccountHolder` IS the learner. The collapse is clean and requires no separate code path:

- `AccountHolder.isSelfLearner = true`
- One `LearnerProfile` exists pointing to that `AccountHolder`
- All "parent" consent surfaces become "account" surfaces for that person
- Billing, consent toggles, child login setup: all on the same `AccountHolder` account
- No "child login" provisioned — the AccountHolder logs in directly and IS the participant

### 2.3 Prisma schema sketch (additive migrations only)

> **Migration rules:** every new model is additive. The `Student` alteration adds a nullable foreign key column — no drop, no rename. The `WhiteboardSession` alteration adds a nullable relation to `SessionConsentSnapshot`. All `onDelete` choices are designed to never silently cascade away billing/legal records.

```prisma
// ─── NEW: Email/verification enum ──────────────────────────────────────────

enum AccountHolderEmailTokenPurpose {
  SIGNUP_VERIFY
  PASSWORD_RESET
  EMAIL_CHANGE
  CRITICAL_ACTION  // e.g. changing consent, revoking access
}

// ─── NEW: Consent toggle names ───────────────────────────────────────────────

// Stored as individual Boolean columns (not JSON) so queries + server-side
// enforcement can filter on individual toggles without JSON unpacking.
// Proposed starter toggle list (§4.4 — PENDING Sarah + legal confirmation):
//   allowLiveSession       Boolean  -- can join live whiteboard sessions
//   allowAudioRecording    Boolean  -- tutor may record audio of sessions
//   allowVideoRecording    Boolean  -- tutor may record video (future; off by default)
//   allowNoteSending       Boolean  -- tutor may send session-recap emails to parent
//   allowMessaging         Boolean  -- tutor may send direct messages to parent/student

// ─── NEW: AccountHolder ──────────────────────────────────────────────────────

/// The billing/consent/comms identity. For K-12: the parent/guardian.
/// For adult self-managing learner: the student themselves (isSelfLearner=true).
/// Email is verified before the account is active (emailVerifiedAt non-null).
model AccountHolder {
  id               String    @id @default(uuid())
  email            String    @unique
  emailVerifiedAt  DateTime?
  passwordHash     String    // bcrypt; required (no OAuth-only path for v1)
  displayName      String?
  phone            String?   // optional; SMS fallback for critical account alerts

  /// True when this AccountHolder IS the learner (adult self-managed).
  /// Collapses the two-layer model: no separate parent consent flow.
  isSelfLearner    Boolean   @default(false)

  learnerProfiles  LearnerProfile[]
  conversations    Conversation[]   @relation("AccountHolderConversations")
  twoFactor        AccountHolder2FA?

  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([email])
}

/// Email verification + password-reset tokens for AccountHolder accounts.
/// Kept separate from PasswordResetToken (admin-only, exists today) to avoid
/// schema coupling. Purpose field allows one table to serve all email-token flows.
model AccountHolderEmailToken {
  id          String                            @id @default(uuid())
  email       String
  purpose     AccountHolderEmailTokenPurpose
  tokenHash   String                            @unique
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime                          @default(now())

  @@index([email])
  @@index([tokenHash])
}

// ─── NEW: LearnerProfile ─────────────────────────────────────────────────────

/// The learning persona for a student. Owned by an AccountHolder.
/// Linked to a tutor's Student stub once the claim flow completes.
/// Can have its own login (username + PIN/password) for child sessions.
model LearnerProfile {
  id               String    @id @default(uuid())

  accountHolderId  String
  accountHolder    AccountHolder @relation(fields: [accountHolderId], references: [id], onDelete: Restrict)
  // Restrict: do not cascade-delete a LearnerProfile when AccountHolder is deleted
  // without explicit decision on their data — flag for legal review (§10).

  displayName      String

  /// Optional email for older students who upgrade to full email auth.
  /// Null = username+PIN login only (the default for children).
  email            String?   @unique
  emailVerifiedAt  DateTime?

  credential       LearnerCredential?
  deviceSessions   LearnerDeviceSession[]
  consentRecords   ConsentRecord[]
  consentRestrictions ConsentRestriction[]
  sessionParticipants SessionParticipant[]

  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([accountHolderId])
}

// ─── NEW: Student alteration (additive column) ───────────────────────────────

/// ADD to existing Student model:
///   learnerProfileId String?  @unique
///   learnerProfile   LearnerProfile? @relation(fields: [learnerProfileId], references: [id], onDelete: SetNull)
///
/// Null = unclaimed stub (tutor-only access, current behavior preserved).
/// Non-null = claimed; access opens to AccountHolder + LearnerProfile.
/// The @unique ensures one Student maps to at most one LearnerProfile.
///
/// Migration SQL (additive):
///   ALTER TABLE "Student" ADD COLUMN "learnerProfileId" TEXT UNIQUE;

// ─── NEW: Child login credentials ────────────────────────────────────────────

/// Username + hashed PIN/password for child login.
/// One-to-one with LearnerProfile. Set by parent during claim flow.
model LearnerCredential {
  id               String    @id @default(uuid())
  learnerProfileId String    @unique
  learnerProfile   LearnerProfile @relation(fields: [learnerProfileId], references: [id], onDelete: Cascade)

  username         String    @unique  // chosen by parent; not secret
  passwordHash     String    // bcrypt of PIN or password

  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

// ─── NEW: Long-lived device sessions for child ───────────────────────────────

/// Device-bound session tokens for LearnerProfile logins.
/// Long-lived (re-auth only on new device). Revocable by parent.
/// The tokenHash is stored; the raw token is sent as an HttpOnly cookie.
model LearnerDeviceSession {
  id               String    @id @default(uuid())
  learnerProfileId String
  learnerProfile   LearnerProfile @relation(fields: [learnerProfileId], references: [id], onDelete: Cascade)

  tokenHash        String    @unique
  deviceInfo       String?   // user-agent snippet or parent-assigned label
  lastUsedAt       DateTime  @default(now())
  revokedAt        DateTime?

  createdAt        DateTime  @default(now())

  @@index([learnerProfileId])
  @@index([tokenHash])
}

// ─── NEW: Claim/invite token ─────────────────────────────────────────────────

/// One-use invite the tutor mints and sends to the parent/student.
/// The parent follows the link, signs up as AccountHolder, and
/// CLAIMS the Student stub → creating a LearnerProfile + tying it to Student.
model StudentClaimInvite {
  id          String    @id @default(uuid())
  studentId   String
  student     Student   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  tutorId     String
  tutor       AdminUser @relation("TutorClaimInvites", fields: [tutorId], references: [id], onDelete: Cascade)

  token       String    @unique
  expiresAt   DateTime
  usedAt      DateTime?
  revokedAt   DateTime?

  /// Set once the claim is completed.
  claimedByAccountHolderId String?

  createdAt   DateTime  @default(now())

  @@index([studentId])
  @@index([token])
}

// ─── NEW: Consent records (parent ceiling, versioned) ────────────────────────

/// One row per consent version per (LearnerProfile, tutor) pair.
/// Old versions are NEVER deleted (audit trail + legal hold).
/// The highest version for a given (learnerProfileId, tutorId) is current.
/// Frozen into SessionConsentSnapshot at each session start.
model ConsentRecord {
  id               String    @id @default(uuid())
  learnerProfileId String
  learnerProfile   LearnerProfile @relation(fields: [learnerProfileId], references: [id], onDelete: Restrict)
  tutorId          String
  tutor            AdminUser @relation("TutorConsentRecords", fields: [tutorId], references: [id], onDelete: Restrict)
  // Restrict on both: consent records are legal documents; never silently cascade-delete.

  /// Monotonically increasing per (learnerProfileId, tutorId) pair.
  version          Int

  // Starter consent toggles (PENDING Sarah + legal — see §11 Q-2):
  allowLiveSession       Boolean
  allowAudioRecording    Boolean
  allowVideoRecording    Boolean  // future; require false until video ships
  allowNoteSending       Boolean
  allowMessaging         Boolean

  setByAccountHolderId String    // must match LearnerProfile.accountHolderId
  captureMethod        String    @default("electronic") // "electronic" | "verbal_in_person"
  setAt                DateTime  @default(now())

  @@unique([learnerProfileId, tutorId, version])
  @@index([learnerProfileId, tutorId])
}

// ─── NEW: Child consent restrictions (narrowing only) ────────────────────────

/// Child's own restrictions on top of the parent ceiling.
/// Can only NARROW consent, never widen. Effective = parent_grant ∩ child_restrict.
/// Single active row per LearnerProfile (no versioning needed; parent ceiling is versioned).
model ConsentRestriction {
  id                     String    @id @default(uuid())
  learnerProfileId       String    @unique
  learnerProfile         LearnerProfile @relation(fields: [learnerProfileId], references: [id], onDelete: Cascade)

  // A "true" flag means the child has RESTRICTED that permission further.
  restrictAudioRecording Boolean   @default(false)
  restrictVideoRecording Boolean   @default(false)
  restrictNoteSending    Boolean   @default(false)
  restrictMessaging      Boolean   @default(false)
  // allowLiveSession cannot be restricted by child (that would lock them out of sessions)

  updatedAt              DateTime  @updatedAt
}

// ─── NEW: Session consent snapshot (frozen at session start) ─────────────────

/// Immutable record of the effective consent at the exact moment a session started.
/// Created by the server action that starts a WhiteboardSession, BEFORE any capture begins.
/// A later consent change never retroactively reinterprets an already-recorded session.
/// (Mirrors Surface 7 "frozen-at-close, immutable, versioned-rule-alongside-result" discipline.)
model SessionConsentSnapshot {
  id                    String    @id @default(uuid())
  whiteboardSessionId   String    @unique
  whiteboardSession     WhiteboardSession @relation(fields: [whiteboardSessionId], references: [id], onDelete: Restrict)
  // Restrict: never silently delete consent snapshot when session is deleted.

  // Effective consent (parent_grant ∩ child_restrict) frozen at start:
  allowLiveSession      Boolean
  allowAudioRecording   Boolean
  allowVideoRecording   Boolean
  allowNoteSending      Boolean
  allowMessaging        Boolean

  // Audit trail: which records contributed
  consentRecordId       String?   // ConsentRecord.id (null = unclaimed student, tutor-only session)
  consentRecordVersion  Int?

  frozenAt              DateTime  @default(now())

  @@index([whiteboardSessionId])
}

// ─── NEW: WhiteboardSession alteration (additive) ────────────────────────────
/// ADD to existing WhiteboardSession:
///   consentSnapshot SessionConsentSnapshot?
///
/// The existing consentAcknowledged Boolean is KEPT for backward compat
/// and as the tutor's UI gate (they must still check the box). The
/// SessionConsentSnapshot is the server-side authoritative record.

// ─── NEW: SessionParticipant ─────────────────────────────────────────────────

/// The participant set for a WhiteboardSession.
/// Currently size 1 (1:1 tutoring). Schema supports N participants.
/// Access control for notes/recordings is derived from this set.
model SessionParticipant {
  id                   String    @id @default(uuid())
  whiteboardSessionId  String
  whiteboardSession    WhiteboardSession @relation(fields: [whiteboardSessionId], references: [id], onDelete: Cascade)
  learnerProfileId     String
  learnerProfile       LearnerProfile    @relation(fields: [learnerProfileId], references: [id], onDelete: Restrict)
  // Restrict: do not silently erase participation record when learner is deleted.

  joinedAt             DateTime?
  leftAt               DateTime?

  @@unique([whiteboardSessionId, learnerProfileId])
  @@index([whiteboardSessionId])
  @@index([learnerProfileId])
}

// ─── NEW: 2FA for AdminUser (tutors/admins — MANDATORY) ──────────────────────

/// TOTP enrollment for AdminUser. Mandatory for all TUTOR + ADMIN roles before
/// production access (enforced at login, see §3.4).
model AdminUser2FA {
  id             String    @id @default(uuid())
  adminUserId    String    @unique
  adminUser      AdminUser @relation(fields: [adminUserId], references: [id], onDelete: Cascade)

  /// TOTP secret — MUST be encrypted at rest (use field-level encryption or
  /// vault; storing plaintext is a BLOCKER, see §8).
  totpSecret     String
  enrolledAt     DateTime  @default(now())
  lastVerifiedAt DateTime?

  backupCodes    AdminUser2FABackupCode[]
}

model AdminUser2FABackupCode {
  id       String       @id @default(uuid())
  twoFaId  String
  twoFa    AdminUser2FA @relation(fields: [twoFaId], references: [id], onDelete: Cascade)

  codeHash String       // bcrypt hashed; single-use
  usedAt   DateTime?
  createdAt DateTime    @default(now())

  @@index([twoFaId])
}

// ─── NEW: 2FA for AccountHolder (opt-in, encouraged) ─────────────────────────

model AccountHolder2FA {
  id               String        @id @default(uuid())
  accountHolderId  String        @unique
  accountHolder    AccountHolder @relation(fields: [accountHolderId], references: [id], onDelete: Cascade)

  totpSecret       String        // encrypted at rest (same requirement as AdminUser2FA)
  enrolledAt       DateTime      @default(now())
  lastVerifiedAt   DateTime?

  backupCodes      AccountHolder2FABackupCode[]
}

model AccountHolder2FABackupCode {
  id               String           @id @default(uuid())
  twoFaId          String
  twoFa            AccountHolder2FA @relation(fields: [twoFaId], references: [id], onDelete: Cascade)

  codeHash         String           // bcrypt hashed; single-use
  usedAt           DateTime?
  createdAt        DateTime         @default(now())

  @@index([twoFaId])
}

// ─── NEW: Messaging ──────────────────────────────────────────────────────────

/// One conversation per (tutor, accountHolder) pair.
/// learnerProfileId identifies WHICH student the thread concerns.
/// Null learnerProfileId = a general tutor↔parent thread (no student scoping).
model Conversation {
  id               String    @id @default(uuid())
  tutorId          String
  tutor            AdminUser     @relation("TutorConversations", fields: [tutorId], references: [id], onDelete: Cascade)
  accountHolderId  String
  accountHolder    AccountHolder @relation("AccountHolderConversations", fields: [accountHolderId], references: [id], onDelete: Cascade)

  /// The student this thread is about. Null = general thread.
  learnerProfileId String?

  archivedAt       DateTime?
  createdAt        DateTime  @default(now())

  messages         Message[]

  @@unique([tutorId, accountHolderId])
  @@index([tutorId])
  @@index([accountHolderId])
}

/// A message within a conversation. Sender is exactly one of the three FKs.
model Message {
  id                      String    @id @default(uuid())
  conversationId          String
  conversation            Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  /// Exactly one of these three is non-null (the sender).
  senderTutorId           String?
  senderTutor             AdminUser?     @relation("TutorSentMessages", fields: [senderTutorId], references: [id])
  senderAccountHolderId   String?
  senderAccountHolder     AccountHolder? @relation("AccountHolderSentMessages", fields: [senderAccountHolderId], references: [id])
  senderLearnerProfileId  String?
  senderLearnerProfile    LearnerProfile? @relation("LearnerSentMessages", fields: [senderLearnerProfileId], references: [id])

  body                    String
  sentAt                  DateTime  @default(now())
  emailNotifiedAt         DateTime? // null = notification pending or suppressed

  @@index([conversationId, sentAt])
}
```

### 2.4 Model inventory: new vs altered

| Model | Status | Notes |
|---|---|---|
| `AccountHolder` | **NEW** | Parent/guardian or self-managing adult learner |
| `AccountHolderEmailToken` | **NEW** | Signup verify, password reset, critical-action, email-change |
| `LearnerProfile` | **NEW** | The learning persona; owned by AccountHolder |
| `LearnerCredential` | **NEW** | Child username + PIN/password |
| `LearnerDeviceSession` | **NEW** | Long-lived device-bound session tokens |
| `StudentClaimInvite` | **NEW** | One-use claim invite token (tutor → parent) |
| `ConsentRecord` | **NEW** | Versioned parent ceiling consent per (learner, tutor) |
| `ConsentRestriction` | **NEW** | Child's own narrowing of parent ceiling |
| `SessionConsentSnapshot` | **NEW** | Frozen effective consent per session; immutable |
| `SessionParticipant` | **NEW** | Participant set per `WhiteboardSession` |
| `AdminUser2FA` + `AdminUser2FABackupCode` | **NEW** | Tutor/admin mandatory TOTP |
| `AccountHolder2FA` + `AccountHolder2FABackupCode` | **NEW** | Parent/student opt-in TOTP |
| `Conversation` + `Message` | **NEW** | DB-routed messaging |
| `Student` | **ALTERED** (additive) | Gains `learnerProfileId String? @unique` |
| `WhiteboardSession` | **ALTERED** (additive) | Gains `consentSnapshot SessionConsentSnapshot?` |
| `AdminUser` | **ALTERED** (additive) | Gains relations to new models |
| `PasswordResetToken` | **UNCHANGED** | Admin-only password reset, kept as-is |
| `ShareLink` | **UNCHANGED (transition)** | Grandfathered during migration; sunset in Phase 4 |
| `WhiteboardJoinToken` | **UNCHANGED (transition)** | Kept until authenticated join ships in Phase 4 |

---

## §3. Auth Foundation Spec

### 3.1 What already exists

| Primitive | Where | Status |
|---|---|---|
| Admin email + password login | `src/auth-options.ts` CredentialsProvider | ✅ Done (SEC-1) |
| Admin Google OAuth | `src/auth-options.ts` GoogleProvider | ✅ Done (SEC-1) |
| Admin password reset | `PasswordResetToken` model | ✅ Exists |
| ADMIN/TUTOR role split | `AdminRole` enum, `AdminUser.role` | ✅ Done (SEC-1 role follow-up) |
| Impersonation + audit log | `ImpersonationLog`, `src/lib/impersonation.ts` | ✅ Done (SEC-1 B/C) |
| 2FA for admins/tutors | — | ❌ **Missing — BLOCKER (Phase 1)** |
| AccountHolder signup/verify/login | — | ❌ **Missing — Phase 2** |
| LearnerProfile child login | — | ❌ **Missing — Phase 2** |
| Consent lattice | Single `recordingDefaultEnabled` bool on Student | ❌ Replaced by new model — Phase 3 |
| Participant-set access control | Anyone-with-link model | ❌ Replaced in Phase 4 |

### 3.2 AccountHolder auth flows (Phase 2)

**Signup + email verification:**
1. POST `/api/auth/account-holder/signup` — create `AccountHolder` row with `emailVerifiedAt = null`; create `AccountHolderEmailToken` with `purpose = SIGNUP_VERIFY`; send verification email.
2. GET `/verify-email?token=<raw>` — server action verifies hash, sets `emailVerifiedAt`, marks token `usedAt`. Account is now active.
3. Email verification is required before the account can complete a claim or access any student data.

**Login:**
- POST `/api/auth/account-holder/login` — email + password; returns session cookie. Session is **separate** from the `AdminUser` NextAuth session (two principals, two session spaces).
- Session token: HttpOnly cookie, secure, SameSite=Strict. JWT or opaque session token (recommend opaque + DB-backed session row for revocability).

**Password reset:**
1. POST `/api/auth/account-holder/forgot-password` — creates `AccountHolderEmailToken` with `purpose = PASSWORD_RESET`; sends reset email. No enumeration: same response whether email exists or not.
2. POST `/api/auth/account-holder/reset-password` — verifies token, sets new `passwordHash`, marks token `usedAt`.

**Critical account changes (email, consent revocation):**
- Any action flagged as `CRITICAL_ACTION` in `AccountHolderEmailToken.purpose` requires a fresh email verification step before proceeding. This prevents account takeover from a hijacked session.

### 3.3 LearnerProfile child login (Phase 2)

**Device-bound sticky sessions (log in once per device):**
- Child presents username + PIN/password at `/join/[device-first-visit]` or `/students/login`.
- Server verifies `LearnerCredential.passwordHash` + creates `LearnerDeviceSession` row with `tokenHash` + long expiry (180 days default — **OPEN: Andrew confirm, see §11 Q-4**).
- Raw session token stored as HttpOnly cookie. On subsequent visits, cookie is matched against `LearnerDeviceSession.tokenHash`.
- Re-auth required only: token expired, token `revokedAt` non-null, new device (no cookie), or parent revoked from their account settings.

**Child login routes:**
- `/students/login` — username + PIN form (mobile-first, large touch targets per UX-AND-A11Y-SPEC.md)
- Child session is **entirely separate** from AdminUser and AccountHolder sessions.

**Optional email upgrade (older students):**
- Parent sets `LearnerProfile.email` in profile settings.
- Triggers email verification flow identical to AccountHolder but using the same `AccountHolderEmailToken` model with `purpose = SIGNUP_VERIFY` scoped to `LearnerProfile`.
- After email verified, older student can log in via email + password instead of username+PIN.

### 3.4 Tutor/Admin 2FA — MANDATORY (Phase 1)

**Requirement:** Every `AdminUser` with `role = TUTOR` or `role = ADMIN` and `isTestAccount = false` MUST complete TOTP enrollment before accessing the app in production. This is enforced at login time, not deferred.

**Enrollment flow:**
1. First post-login redirect (if `AdminUser2FA` row missing): `/settings/2fa/setup`
2. Show QR code (TOTP secret from `speakeasy` or `otpauth` library). User scans in authenticator app.
3. Confirm with one-time code. On success: write `AdminUser2FA` row + 10 backup codes (bcrypt-hashed, stored in `AdminUser2FABackupCode`).
4. Show backup codes once (download/print prompt). This step is **mandatory** — do not allow skip.
5. Redirect to intended destination. All subsequent logins require TOTP code after password.

**Never-locked-out recovery path (HARD requirement):**
- Backup codes (10 generated at enrollment, each single-use) are the primary recovery mechanism.
- If all backup codes are exhausted: admin recovery path — only another verified `ADMIN` user (Andrew) can reset 2FA for the account via the admin dashboard.
- **Tutor-before-session scenario:** if a tutor is locked out right before a session, recovery requires Andrew (or an ADMIN) to reset 2FA in the admin dashboard and regenerate backup codes. Estimated recovery time with this path: ~2 minutes. This is acceptable but must be documented in the tutor onboarding flow ("save backup codes — you will need them if you get a new phone before a session").
- Future: passkey/WebAuthn as a second factor option reduces lockout risk. Phase-6+ enhancement.
- **TOTP secret encryption:** `totpSecret` on both `AdminUser2FA` and `AccountHolder2FA` MUST be encrypted at rest. Use field-level encryption (e.g. `prisma-field-encryption` or server-side AES-256-GCM with key from env var). **This is a BLOCKER — do not store plaintext TOTP secrets.** See §8.

**AccountHolder 2FA (opt-in):**
- Offered during signup and again from account settings.
- Same TOTP + backup-code flow as admin.
- Recovery: if a parent loses access to 2FA + backup codes, a support email flow resets 2FA after identity verification (manual, reasonable at pilot scale).

---

## §4. Claim / Provisioning + Consent Flow

### 4.1 Step-by-step sequence

```
Step 1  — Tutor creates Student stub (works TODAY — no change)
          POST /api/students { name, parentEmail? }
          → creates Student row with adminUserId = tutor.id, learnerProfileId = null

Step 2  — Tutor sends claim invite
          POST /api/students/[id]/send-claim-invite
          → asserts assertOwnsStudent(tutor.id, studentId)
          → creates StudentClaimInvite { token, expiresAt: +7 days }
          → sends email to Student.parentEmail (or a copied link if no email on file)
          → log: clm=<inviteId> action=sent studentId=<id> tutorId=<id>

Step 3  — Parent follows link /claim/[token]
          → server validates token: not expired, not used, not revoked
          → if parent already has AccountHolder account: offer "log in to claim"
          → if new: show signup form (email + password + displayName)
          → after signup: email verification required before proceeding

Step 4  — Parent claims the stub
          POST /api/claim/[token]/complete
          → validates token + AccountHolder.emailVerifiedAt non-null
          → transaction:
              a. Create LearnerProfile { accountHolderId, displayName from stub.name }
              b. Set Student.learnerProfileId = newLearnerProfile.id
              c. Mark StudentClaimInvite.usedAt = now()
              d. Mark StudentClaimInvite.claimedByAccountHolderId = accountHolder.id
          → log: clm=<inviteId> action=claimed learnerProfileId=<id> accountHolderId=<id>

Step 5  — Parent authorizes: consent capture + child login setup
          GET /claim/[token]/setup (post-claim onboarding, same session)
          Two steps shown on same page (wizard):
            a. Consent toggles (parent sets ceiling — §4.3)
               POST /api/consent { learnerProfileId, tutorId, toggles... }
               → creates ConsentRecord version=1
               → log: cns=<recordId> action=created version=1
            b. Child login setup (optional but encouraged)
               POST /api/learner-profiles/[id]/credentials { username, password }
               → creates LearnerCredential
               → log: lpr=<profileId> action=credential_created

Step 6  — Only a claimed + consented profile can join live sessions
          Server-side gate in startWhiteboardSession + whiteboardJoin:
            assertParticipantEligible(sessionId, learnerProfileId):
              - learner.studentId matches session.studentId
              - ConsentRecord exists for (learnerProfileId, tutorId) with allowLiveSession=true
              - No more recent ConsentRecord with allowLiveSession=false
```

### 4.2 Session start — consent freeze

When the tutor starts a `WhiteboardSession`:

```
assertOwnsStudent(tutor.id, session.studentId)
if (session.studentId → learnerProfileId non-null):
  currentConsent = latestConsentRecord(learnerProfileId, tutor.id)
  currentRestrictions = consentRestriction(learnerProfileId)
  effectiveConsent = {
    allowLiveSession: currentConsent.allowLiveSession,
    allowAudioRecording: currentConsent.allowAudioRecording && !currentRestrictions.restrictAudioRecording,
    allowVideoRecording: currentConsent.allowVideoRecording && !currentRestrictions.restrictVideoRecording,
    allowNoteSending: currentConsent.allowNoteSending && !currentRestrictions.restrictNoteSending,
    allowMessaging: currentConsent.allowMessaging && !currentRestrictions.restrictMessaging,
  }
  createSessionConsentSnapshot(whiteboardSessionId, effectiveConsent, consentRecordId, version)
  log: cns=<snapshotId> action=frozen sessionId=<id> version=<n>
  
  // Gate audio recording before session FSM armed
  if (!effectiveConsent.allowAudioRecording):
    // disable recording start; tutor UI shows "recording not consented for this student"
```

### 4.3 Consent lattice UI surfaces

| Surface | Who | Where | What |
|---|---|---|---|
| **Parent ceiling** (initial) | Parent/AccountHolder | `/claim/[token]/setup` wizard (Step 5) | All toggles, all permissions, default states shown |
| **Parent ceiling** (change) | Parent/AccountHolder | `/account/students/[id]/consent` | Same toggles; change creates new ConsentRecord version; triggers `CRITICAL_ACTION` email confirmation |
| **Child narrowing** | LearnerProfile (older student) | `/profile/preferences` | Only "restrict" toggles (cannot widen parent ceiling); no billing/consent-ceiling surfaces visible |
| **Tutor view** | Tutor | Session workspace header / session start flow | Read-only effective consent indicator before arming the session; shows "Audio: ✓ / ✗", etc. |

### 4.4 Proposed starter consent-toggle list

> **🚩 PENDING Sarah + legal confirmation — see §11 Q-2 and §10**

| Toggle | Default | Description |
|---|---|---|
| `allowLiveSession` | `true` | Child may join live whiteboard sessions with this tutor |
| `allowAudioRecording` | `false` | Tutor may record audio during sessions (explicit opt-in required — COPPA) |
| `allowVideoRecording` | `false` | Tutor may record video (future; off by default; not wired until video ships) |
| `allowNoteSending` | `true` | Tutor may send session-recap emails to parent's email address |
| `allowMessaging` | `true` | Tutor may send direct messages via the in-app messaging thread |

Note: `allowLiveSession = false` effectively means the parent has suspended access to this tutor. The tutor should see a clear indicator ("This student's account holder has suspended session access.") — not a confusing error.

---

## §5. Access Control Rules

### 5.1 Principal definitions for this table

| Principal | Auth method | Session context |
|---|---|---|
| **Tutor** | AdminUser login (password + 2FA) | `session.user.id` = AdminUser.id, role=TUTOR |
| **Admin** | AdminUser login (password + 2FA + Google) | `session.user.id` = AdminUser.id, role=ADMIN |
| **Parent** (AccountHolder) | AccountHolder login (password) | Separate AccountHolder session cookie |
| **Child** (LearnerProfile) | LearnerDeviceSession cookie | Separate learner session cookie |
| **Other** | Not authenticated or wrong account | Unauthenticated / wrong session |

### 5.2 Resource × principal access matrix

| Resource | Tutor | Admin | Parent (AccountHolder) | Child (LearnerProfile) | Other |
|---|---|---|---|---|---|
| **Create student stub** | ✅ Own students only | ✅ (impersonation) | ✗ | ✗ | ✗ |
| **Send claim invite** | ✅ Own students only | ✅ (impersonation) | ✗ | ✗ | ✗ |
| **Complete claim** | ✗ | ✗ | ✅ Valid invite token + email verified | ✗ | ✗ |
| **Live session join** | ✅ Session creator | ✗ | ✗ | ✅ if in SessionParticipant + consentSnapshot.allowLiveSession=true | ✗ |
| **Session note (read)** | ✅ Own sessions | ✅ (impersonation) | ✅ if Student.learnerProfileId.accountHolderId = self + consentSnapshot.allowNoteSending=true | ✅ if in SessionParticipant | ✗ |
| **Session recording (read)** | ✅ Own sessions | ✅ (impersonation) | ✅ if accountHolder owns learner + consentSnapshot.allowAudioRecording=true | ✅ if in SessionParticipant + consentSnapshot.allowAudioRecording=true | ✗ |
| **Session transcript (read)** | ✅ Own sessions | ✅ (impersonation) | ✅ same as recording | ✅ same as recording | ✗ |
| **Consent settings (read)** | ✅ Read-only effective consent for own students | ✗ | ✅ Own children only | ✅ Own restrictions only (not parent ceiling) | ✗ |
| **Consent settings (write)** | ✗ | ✗ | ✅ Own children only + CRITICAL_ACTION email confirm | ✅ Narrow only, own restrictions | ✗ |
| **Billing / invoices** | ✗ | ✅ | ✅ Own account | ✗ | ✗ |
| **Child credentials (write)** | ✗ | ✗ | ✅ Own children only | ✅ Own (change own password) | ✗ |
| **Child device sessions (revoke)** | ✗ | ✗ | ✅ Own children only | ✅ Own devices | ✗ |
| **Messaging (read/write)** | ✅ Own student threads + consentSnapshot.allowMessaging=true | ✗ | ✅ Own threads + same consent gate | ✅ If learnerProfileId in conversation + consent gate | ✗ |
| **ShareLink (legacy — transition)** | ✅ Create for own students | ✗ | ✅ Valid token (sunset Phase 4) | ✅ Valid token (sunset Phase 4) | ✅ Valid token (sunset Phase 4) |

### 5.3 Server-side assertion pattern

Every server action and API route asserting on student/session data MUST call one of:

```typescript
// Tutor asserting ownership of a student (already implemented)
assertOwnsStudent(adminUserId: string, studentId: string): Promise<Student>

// NEW: assert AccountHolder owns the LearnerProfile
assertOwnsLearnerProfile(accountHolderId: string, learnerProfileId: string): Promise<LearnerProfile>

// NEW: assert a LearnerProfile is a participant in a session
assertIsSessionParticipant(learnerProfileId: string, whiteboardSessionId: string): Promise<SessionParticipant>

// NEW: assert effective consent for a specific permission
assertEffectiveConsent(
  whiteboardSessionId: string,
  permission: keyof SessionConsentSnapshot
): Promise<void>  // throws if not consented; logs cns= violation
```

All four assertions throw `UnauthorizedError` (which maps to HTTP 403) before any mutation or data read. The pattern already exists for `assertOwnsStudent` — the three new ones follow the same shape.

### 5.4 ShareLink + WhiteboardJoinToken replacement

**Current model:** `ShareLink` (notes to parents, anyone-with-link) and `WhiteboardJoinToken` (live-join, per-session, time-limited).

**Replacement timeline (see §7 for migration details):**

| Token type | Current role | Phase 4 replacement | Sunset |
|---|---|---|---|
| `ShareLink` | Parent note access (unauthenticated) | AccountHolder authenticated access (`assertOwnsLearnerProfile`) | 90-day grandfather after AccountHolder claim (Andrew decides — §11 Q-6) |
| `WhiteboardJoinToken` | Live session join (unauthenticated) | Authenticated `SessionParticipant` join (LearnerProfile session cookie) | After authenticated join ships (Phase 4); no anonymous join in v1 final state |

During the transition: both paths coexist. Existing ShareLinks are valid but show a "Claim this student's profile for permanent access" prompt. New sessions on claimed profiles do not generate `ShareLink` or `WhiteboardJoinToken` rows for authenticated participants.

---

## §6. Messaging (Q-5)

### 6.1 Architecture

DB-routed asynchronous messaging (not real-time chat). Email is a **notification channel**, not the primary medium.

**Data model:** `Conversation` (1:1 per tutor+accountHolder pair) + `Message` rows (see §2.3). Sender is discriminated by which FK is non-null (exactly one of `senderTutorId`, `senderAccountHolderId`, `senderLearnerProfileId`).

**Access gate:** messaging requires `Conversation` row to exist (created by tutor or parent on first message) + `consentSnapshot.allowMessaging = true` (or the parent holds consent and is the sender for their own messages — parent is always allowed to send to the tutor).

**Email notification path:**
1. On `Message` create, if recipient has a registered email (tutor's `AdminUser.email`, parent's `AccountHolder.email`, or child's `LearnerProfile.email`), schedule an email notification.
2. Email contains "You have a new message from [sender display name] — click to view." Link is to the in-app conversation, not a reply-by-email path in v1.
3. Set `Message.emailNotifiedAt` after successful send.
4. Email sending uses the existing `EmailMessage` + EmailConfig/OAuthEmailConnection infrastructure.

### 6.2 Student ↔ tutor scope

Default: `Conversation` is tutor ↔ AccountHolder (parent). The `learnerProfileId` on `Conversation` identifies which student it concerns.

For older students with email-verified logins: the `senderLearnerProfileId` field on `Message` supports student-as-sender. A student can participate in the thread if:
- `LearnerProfile.email` is set + verified, OR
- Parent explicitly enables it (gated on `allowMessaging` + an explicit "include student in messages" toggle — **OPEN: Andrew confirm, §11 Q-7**)

### 6.3 Legal flag

> **🚩 LEGAL GATE — see §10.4**
> Messaging about minors is a new data-processing surface. The `mortensenapps.com` umbrella privacy policy and the Tutoring Notes local `/privacy` and `/terms` pages MUST be updated before messaging goes live. The addition of a "messaging" toggle in the consent record is a consent-for-data-processing action that also needs policy coverage. This is a HARD gate — do not enable the messaging feature in production without the umbrella policy update.

---

## §7. Migration Plan

### 7.1 Existing Student rows → unclaimed stubs

**No action required to existing data.** All current `Student` rows remain fully functional as unclaimed stubs:
- `Student.learnerProfileId` is added as a nullable column (migration: `ALTER TABLE "Student" ADD COLUMN "learnerProfileId" TEXT UNIQUE`).
- All existing rows get `learnerProfileId = null` (tutor-only access, existing behavior preserved exactly).
- Sarah's 126 `WhiteboardSession` rows + 116 `SessionRecording` rows are unaffected.

**Tutor workflow continuity:** Sarah can continue creating sessions, notes, and share links against unclaimed students with zero disruption. The claim invite is an optional action she takes at her own pace.

### 7.2 ShareLink rows → grandfathered

**Existing `ShareLink` tokens remain valid** through the transition. Plan:

1. **Phase 2 (immediate):** No change to ShareLink behavior.
2. **Phase 4 (authenticated access ships):** Claimed-profile sessions no longer generate `ShareLink` rows. The `assertOwnsLearnerProfile` check becomes the access path for claimed profiles.
3. **Phase 4+ (sunset):** Add a sunset timestamp to `ShareLink` rows (new additive column `sunsetAt DateTime?`). Andrew decides the timeline (§11 Q-6). The parent-facing share page shows a "Claim your child's profile for permanent access" prompt.
4. **Post-sunset:** `sunsetAt` rows are expired server-side. Old rows with no `sunsetAt` from unclaimed students continue indefinitely (tutor still controls these).

**Key invariant:** Sarah's existing parents who receive share link emails keep working until they claim or the link is explicitly revoked. Zero forced migration.

### 7.3 WhiteboardJoinToken → authenticated join

**Existing tokens remain valid** until the authenticated join ships in Phase 4:
- `WhiteboardJoinToken` model is not altered.
- After Phase 4: new `WhiteboardSession` rows for claimed students no longer generate `WhiteboardJoinToken` rows. The child joins via `LearnerDeviceSession` + server-side `assertIsSessionParticipant`.
- Unclaimed students continue to use `WhiteboardJoinToken` (tutor-only controlled, same behavior as today).

### 7.4 `consentAcknowledged` on WhiteboardSession

The existing `WhiteboardSession.consentAcknowledged` Boolean is **kept unchanged**. It is the tutor's UI-level gate (they must check the box) and serves as a backward-compatible audit flag. The new `SessionConsentSnapshot` is the authoritative machine-readable consent record. They coexist — no migration to existing session rows.

### 7.5 `recordingDefaultEnabled` on Student

The existing `Student.recordingDefaultEnabled` Boolean is **kept** as a tutor-side UX preference for the workspace toggle default state. It is **not** the same as consent — it controls the initial state of the "Start recording" UI toggle, not the server-side gate. The server-side gate uses `SessionConsentSnapshot.allowAudioRecording`. These are orthogonal and both can coexist.

### 7.6 Sarah's pilot — graceful handoff path

Sarah's current students have no accounts. The intended path:

1. Andrew and Sarah decide on a timeline for claim rollout (pilot checkpoint — see §11 Q-1).
2. Sarah sends claim invites to each family she wants to bring into the new model, one at a time.
3. Families who claim get the new authenticated experience (portal, recap access, consent control).
4. Families who don't claim continue on the existing share-link model indefinitely (tutor-only, unchanged).
5. No forced cutover. Sarah controls the pace.

---

## §8. 5-Axis Reliability Adversarial Review

### Axis 1 — Data durability

| Risk | Severity | Mitigation |
|---|---|---|
| `ConsentRecord` accidentally deleted via CASCADE | **BLOCKER** | `onDelete: Restrict` on `ConsentRecord` — deletion fails if consent record exists. Explicit admin action required to delete. |
| `SessionConsentSnapshot` deleted when session deleted | **BLOCKER** | `onDelete: Restrict` on `SessionConsentSnapshot` — session cannot be deleted while consent snapshot exists (legal record). |
| TOTP secret stored in plaintext | **BLOCKER** | `AdminUser2FA.totpSecret` and `AccountHolder2FA.totpSecret` MUST use field-level encryption. Executor must implement before any 2FA code ships. |
| `LearnerProfile` orphaned on AccountHolder deletion | **HIGH** | `onDelete: Restrict` on `LearnerProfile.accountHolder` — AccountHolder cannot be deleted while profiles exist. Requires explicit data-retention decision (§11 Q-3). |
| AccountHolder email verification token brute-forced | **MEDIUM** | Tokens are UUID-based + bcrypt-hashed in DB. Additionally rate-limit `/verify-email` to 10 attempts per email per hour. |
| LearnerDeviceSession token leaked from DB | **MEDIUM** | Store `tokenHash` only (bcrypt or SHA-256 HMAC with server secret); raw token in HttpOnly cookie only. |

**Carry-forward invariant preserved:** additive migrations only. No existing data touched. All `onDelete: Cascade` on new models follows the same pattern as existing: only cascade for low-stakes lookup rows (e.g., `LearnerDeviceSession`), not for legal/financial records.

### Axis 2 — Recovery / durability

| Risk | Severity | Mitigation |
|---|---|---|
| Tutor locked out of 2FA before session | **HIGH** | Admin recovery path (Andrew resets 2FA via admin dashboard) + backup codes. Documented in onboarding. |
| Parent loses access to AccountHolder account (no 2FA + forgotten password) | **MEDIUM** | Password reset via email (verified email is always on file). Recovery email is the only fallback. |
| Claim invite expires before parent acts | **LOW** | 7-day default expiry with resend capability from tutor's student panel. |
| Consent revocation during active session | **HIGH** | Consent change mid-session does NOT change `SessionConsentSnapshot` (frozen at start). The in-flight session continues under original consent. The revocation takes effect for the **next** session start. Tutor workspace may optionally poll effective consent and show a soft warning, but MUST NOT interrupt the in-progress capture. |

### Axis 3 — Concurrency

| Race condition | Severity | Mitigation |
|---|---|---|
| Two parents claim same Student stub simultaneously | **HIGH** | The `Student.learnerProfileId` column has `@unique` constraint. The second claim INSERT fails with unique violation → present "This student has already been claimed" error. Use DB transaction for the create + update in Step 4 (§4.1). |
| Consent change + session start simultaneously | **MEDIUM** | `SessionConsentSnapshot` is written inside the `startWhiteboardSession` server action. If a consent change arrives at the exact same time: last-write-wins on `ConsentRecord` (latest version), first-read-wins on snapshot (the session start reads the latest consent before starting). The session is always consistent against the consent record that existed at its start time. |
| Multiple claim invites for same student | **LOW** | Multiple `StudentClaimInvite` rows can exist for the same student (tutor resent). Only the first complete claim succeeds (unique constraint on `Student.learnerProfileId`). All outstanding invites for a claimed student should be revoked server-side after claim completes. |
| Concurrent `LearnerDeviceSession` creation on same device | **LOW** | Race is benign — two sessions may be created; the older one just becomes stale. `revokedAt` cleanup handles orphaned sessions. |

### Axis 4 — Auth / ownership boundaries (headline axis)

| Boundary | Test | Risk if broken |
|---|---|---|
| AccountHolder A cannot access LearnerProfile owned by AccountHolder B | `assertOwnsLearnerProfile` must check `LearnerProfile.accountHolderId = requester.id` | Data breach: parent sees another family's notes/recordings |
| Tutor T cannot access students belonging to Tutor U | `assertOwnsStudent` (already implemented) | Multi-tenant data breach |
| Child LearnerProfile cannot access sibling profiles | Child session must assert `learnerProfileId = session.learnerId` on every data fetch | Sibling data exposure |
| Parent cannot widen child's consent restrictions | `ConsentRestriction` only stores narrowing flags; server ignores any attempt to set parent ceiling below what child has already restricted | Logical inversion — consent lattice corrupted |
| Tutor cannot set consent (consent is parent's domain) | No API route allows `AdminUser` session to write `ConsentRecord` | Consent bypass |
| `SessionConsentSnapshot` immutability | No server action or API route allows UPDATE/DELETE on `SessionConsentSnapshot` | Retroactive consent rewrite |
| `CRITICAL_ACTION` email confirmation cannot be bypassed | The `AccountHolderEmailToken` with `purpose = CRITICAL_ACTION` MUST be validated before consent changes go through | Consent change without owner intent |

**The `assertOwnsLearnerProfile` check is the new highest-blast-radius ownership assertion.** The SEC-1 dispatch model (Sonnet for auth-boundary work) applies to any code touching this path.

### Axis 5 — Observability

New log prefixes (§12) MUST be emitted at every state transition. Without them, production debugging of consent violations, failed claims, or locked-out accounts is impossible.

| Surface | Required log events |
|---|---|
| Claim invite | `clm=<inviteId>` on send, attempt, success, expiry, revoke |
| Consent change | `cns=<recordId>` on create + version bump; `cns=<snapshotId>` on freeze |
| AccountHolder auth | `ahx=<accountHolderId>` on signup, email verify, login, logout, password reset, CRITICAL_ACTION |
| LearnerProfile events | `lpr=<profileId>` on credential create, login, device-session revoke, session join |
| 2FA events | `tfa=<adminUserId or accountHolderId>` on enroll, verify success, verify failure, backup-code use |

**BLOCKERs folded into phase acceptance (see §9):**
- `BLOCKER-SECURITY:` TOTP secrets must be encrypted at rest before Phase 1 ships.
- `BLOCKER-LEGAL:` Umbrella policy update required before Phase 5 (consent toggles) goes to production.
- `BLOCKER-SECURITY:` `assertOwnsLearnerProfile` must exist and be tested before Phase 2 data routes open.

---

## §9. Phased Composer Execution Plan

> **Branch:** all phases on `v1-redesign` feature branch, gated behind merge to `master` per wave.
> **Model assignments:** `generalPurpose model="composer-2.5"` for most; `model="claude-4.6-sonnet-medium-thinking"` for auth-boundary phases (3, 4) per escalation criteria in `AGENTS.md`.

### Phase 1 — Tutor 2FA (TOTP + backup codes) ⚡ Prerequisite

**Scope:**
- Add `AdminUser2FA` + `AdminUser2FABackupCode` models + migration
- `POST /api/settings/2fa/setup` — enroll (QR code + confirm code + generate backup codes)
- `POST /api/settings/2fa/verify` — login second factor
- Middleware gate: redirect unenrolled tutors/admins to `/settings/2fa/setup` before any dashboard access
- Admin recovery: admin dashboard "Reset 2FA" action (ADMIN role only)
- TOTP secret encryption (field-level, AES-256-GCM, key from env)
- Backup code display (one-time, download prompt)
- 10 backup codes, bcrypt-hashed, single-use
- `tfa=` log prefix on all events

**Dependencies:** None (AdminUser model already complete via SEC-1)
**Acceptance:** Tutor cannot access `/students` or `/sessions/*/workspace` without 2FA enrolled and verified; Andrew can reset another user's 2FA via admin dashboard; backup codes work.
**Reliability invariants:** TOTP secret never stored in plaintext; backup codes never stored in plaintext; 2FA reset requires ADMIN session (not just TOTP-less session).
**Model:** `generalPurpose model="composer-2.5"` — well-scoped, no new auth boundary.
**Andrew gate:** Confirm 2FA recovery path is acceptable before shipping to production (see §11 Q-5).

---

### Phase 2 — AccountHolder + LearnerProfile identity layer

**Scope:**
- New models + migrations: `AccountHolder`, `AccountHolderEmailToken`, `LearnerProfile`, `LearnerCredential`, `LearnerDeviceSession`
- `StudentClaimInvite` model + migration + additive `Student.learnerProfileId` column
- Signup/email-verify/login/password-reset flows for AccountHolder (`/claim/[token]/signup`, `/account/login`, `/account/forgot-password`, `/account/reset-password`)
- Child login (`/students/login`) + `LearnerDeviceSession` cookie management
- Claim flow: `/claim/[token]` → signup/login → `/claim/[token]/complete` → `/claim/[token]/setup`
- `assertOwnsLearnerProfile` + `assertIsSessionParticipant` server-side assertions
- `ahx=`, `lpr=`, `clm=` log prefixes
- **No consent enforcement yet** (just the identity layer)

**Dependencies:** Phase 1 complete (2FA required before tutor can send claim invites to real families).
**Acceptance:** Tutor can mint + send a claim invite; parent can sign up + claim a student; LearnerProfile exists and is linked to Student; child can log in on a device + stay logged in; unauthenticated access to the new routes is rejected.
**Reliability invariants:** Email verification required before claim completes; `assertOwnsLearnerProfile` tested with wrong-owner negative case; unique constraint on `Student.learnerProfileId` prevents double-claim.
**Model:** `model="claude-4.6-sonnet-medium-thinking"` — new auth boundary (`assertOwnsLearnerProfile` is high-blast-radius; cross-principal session management is concurrency-sensitive).
**Andrew gate:** Confirm default child session lifetime (§11 Q-4); confirm adult self-managed path is correct (§11 Q-8).

---

### Phase 3 — Consent lattice

**Scope:**
- New models + migrations: `ConsentRecord`, `ConsentRestriction`, `SessionConsentSnapshot`
- Additive `WhiteboardSession` relation to `SessionConsentSnapshot`
- Parent consent setup in claim flow (`/claim/[token]/setup` step a)
- Parent consent change flow (`/account/students/[id]/consent`) with `CRITICAL_ACTION` email gate
- Child consent narrowing (`/profile/preferences`)
- Server-side consent freeze in `startWhiteboardSession` action
- Tutor workspace consent indicator (read-only effective consent before arming session)
- `cns=` log prefix on all events
- Backfill: existing `WhiteboardSession` rows get no snapshot (null relation = pre-consent-system; treated as tutor-acknowledged consent per existing `consentAcknowledged` bool)

**Dependencies:** Phase 2 (LearnerProfile + AccountHolder must exist for consent to reference).
**Acceptance:** Parent can set consent toggles; tutor sees effective consent before starting; `SessionConsentSnapshot` is frozen at session start and cannot be changed post-start; consent change via parent UI triggers email confirmation.
**Reliability invariants:** `onDelete: Restrict` tested for ConsentRecord + SessionConsentSnapshot; retroactive snapshot mutation impossible (no UPDATE endpoint); `assertEffectiveConsent` tested.
**Model:** `model="claude-4.6-sonnet-medium-thinking"` — consent boundaries are auth-equivalent in blast radius; frozen-snapshot pattern is subtle.
**Legal gate:** Starter consent toggle list requires Sarah + legal confirmation before this phase ships to production (§11 Q-2 + §10).

---

### Phase 4 — Access control swap (replace anyone-with-link)

**Scope:**
- `SessionParticipant` model + migration
- Authenticated student join via `LearnerDeviceSession` cookie (replaces `WhiteboardJoinToken` for claimed profiles)
- AccountHolder authenticated note/recording access (`assertOwnsLearnerProfile` gated routes replacing `ShareLink` token access for claimed profiles)
- `ShareLink` sunset: add `sunsetAt DateTime?` column; show "claim your profile" prompt on legacy share pages
- `WhiteboardJoinToken` kept for unclaimed students (backward compat)
- Update all note/recording server actions to check `assertIsSessionParticipant` OR `assertOwnsLearnerProfile` OR `assertOwnsStudent` (tutor) before returning data
- Remove any existing "any authenticated admin" catch-all that would let Tutor A see Tutor B's students via API

**Dependencies:** Phases 2 + 3 complete.
**Acceptance:** Authenticated parent/child can access session data without a share token; unauthenticated access to claimed-profile resources returns 403 (not 404); unclaimed students' share links still work.
**Reliability invariants:** Thorough negative-case test: parent of student A cannot access data for student B; child cannot access sibling data.
**Model:** `model="claude-4.6-sonnet-medium-thinking"` — replacing an existing access model; high blast radius if any assertion is wrong.
**Andrew gate:** Confirm ShareLink sunset timeline (§11 Q-6).

---

### Phase 5 — Messaging

**Scope:**
- `Conversation` + `Message` models + migration
- `POST /api/conversations` — create conversation (tutor or parent)
- `GET /api/conversations/[id]/messages` — read messages (access-gated)
- `POST /api/conversations/[id]/messages` — send message
- Email notification trigger on new message
- Tutor-side: conversation thread in student detail page
- Parent-side: conversation thread in `/account/messages`
- `msg=<conversationId>` log prefix on all events

**Dependencies:** Phase 2 (AccountHolder + LearnerProfile must exist). Phase 3 (`allowMessaging` consent toggle in snapshot).
**Acceptance:** Tutor can send a message to a parent; parent sees email notification + can reply in-app; messaging is gated by `allowMessaging` consent.
**Legal gate:** Umbrella privacy policy update required before this feature ships (§10.4). HARD gate.
**Model:** `generalPurpose model="composer-2.5"` — well-scoped; no new auth boundary beyond Phase 4.

---

### Phase 6 — Tutor 2FA enforcement hardening + AccountHolder 2FA encouragement

**Scope:**
- Enforce 2FA requirement: any `AdminUser` who navigated around Phase 1 enforcement (e.g., via API access during dev) is hard-blocked.
- Rate-limit 2FA verify failures (5 attempts → 15-minute lockout).
- AccountHolder 2FA: prompt in account settings + "Highly recommended" banner on first login.
- Backup code rotation: allow parent/tutor to generate a new backup code set (invalidates old set).
- 2FA removal: ADMIN-only for AdminUser; CRITICAL_ACTION email confirmation for AccountHolder.

**Dependencies:** Phase 1 (AdminUser 2FA) + Phase 2 (AccountHolder 2FA base).
**Model:** `generalPurpose model="composer-2.5"` — hardening an already-built flow.
**Andrew gate:** Confirm AccountHolder 2FA encouragement wording (should not be alarming for parents).

---

### Inter-phase ordering summary

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
                                              ↓
                                         Phase 6 (can run after 1+2)
```

Phases 1–4 must be strictly sequential on the `v1-redesign` branch. Phases 5 and 6 can be parallelized on separate branches (they don't share working files beyond the migrations, which must be serialized).

---

## §10. Legal / COPPA Section

> **Read first:** [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) — umbrella hierarchy, sync protocol, and classification tables.

### 10.1 What this design introduces that requires policy updates

This design is the **first time Mynk systematically processes minor children's data under explicit parental consent**. The current app has a generic "Children" section in the privacy policy. This design introduces:

1. **Parent accounts (`AccountHolder`) with explicit consent flows** — parental consent for processing a specific child's data for a specific tutor.
2. **Child login credentials** — the app now stores authentication credentials FOR a minor (username + hashed PIN/password).
3. **Session recordings explicitly consented to by parents** — the `allowAudioRecording` toggle changes the legal basis from "tutor-held data" to "parent-consented minor data."
4. **Messaging** — a new communication channel that processes parent+tutor+optionally child messages about a minor.
5. **Consent records as a stored data category** — the `ConsentRecord` and `SessionConsentSnapshot` are themselves personal data (they describe what a specific family has agreed to).

### 10.2 COPPA requirements (US, K-12 minors under 13)

COPPA applies when the **operator** collects personal information from children under 13 **with knowledge** that the user is a child. Our model collects:
- Child's display name (`LearnerProfile.displayName`)
- Child's optional email
- Child's username + hashed PIN (credentials)
- Child's session recordings + transcripts
- Child's in-session activity (whiteboard strokes)

**Parental consent capture point = the claim flow (Step 4–5, §4.1).** This is the correct COPPA mechanism: verifiable parental consent before collecting data for the child. The `ConsentRecord` is the evidence of consent.

**Required umbrella policy additions (HARD gates — must be in place before Phase 2 ships to production):**
1. **Children section** — expand from current generic language to explicitly describe: (a) the claim flow as the parental consent mechanism; (b) what data is collected for children and under what consent scope; (c) parent's right to review, delete, or revoke consent for their child's data at any time.
2. **Parental consent description** — describe what "consent" means in Mynk: the AccountHolder claim flow + consent toggles = the verifiable parental consent mechanism under COPPA.
3. **Data collected for minors** — enumerate: display name, optional email, session recordings (if consented), whiteboard strokes, transcripts.

### 10.3 Consent toggle list as a legal artifact

The proposed starter consent-toggle list (§4.4) has legal weight — it defines what parents are agreeing to. The `allowAudioRecording` toggle in particular must be explicitly named in the policy ("parents may grant or deny recording of their child's audio during sessions"). **This toggle list must be reviewed by Andrew + legal before Phase 3 ships.**

### 10.4 Messaging as a new data-processing surface

In-app messaging creates a record of communications about a minor. The policy must describe:
- What messages are stored and for how long
- Who can read messages (tutor + AccountHolder; optionally LearnerProfile)
- Whether message content is used for AI / training (current answer: no — must be explicit)

This is the **legal gate for Phase 5** (messaging). Do not ship messaging to production without umbrella policy update.

### 10.5 Recording retention on consent revocation — open decision

When a parent revokes `allowAudioRecording`:
- Future capture stops immediately (enforced via `SessionConsentSnapshot` freeze on next session start — revocation takes effect for next session).
- **What about already-captured recordings?** This is a legally significant decision:
  - **Option A:** Preserve existing recordings (tutor still owns them as professional records; parent consented at capture time)
  - **Option B:** Delete recordings on revocation demand (stronger parent/child rights; creates operational complexity for tutor)
  - **Option C:** Preserve for a fixed retention period (e.g., 1 year post-session), then auto-delete

> **🚩 OPEN DECISION — §11 Q-3. This requires Andrew's decision + legal review. Do NOT implement either behavior without explicit guidance. The current implementation (no deletion logic) is safe to ship but must be accompanied by a policy statement that recordings captured under prior consent are retained per the standard retention policy.**

### 10.6 Umbrella sync checklist (execute before Phase 2 production deploy)

Per [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) sync protocol:

- [ ] Expand "Children" section in `mortensenapps.com/privacy` to cover COPPA consent mechanism, data collected for minors, and parent rights.
- [ ] Add "Parental consent" subsection describing the AccountHolder claim flow as the verifiable consent mechanism.
- [ ] Add session recordings (audio, video-future) to the data inventory with toggle-based consent reference.
- [ ] Add messaging as a new data category with retention statement.
- [ ] Update Tutoring Notes local `/privacy` (hybrid: umbrella Children + product-specific sections for consent, recordings, messaging).
- [ ] Update "Last updated" date in both TSX files.
- [ ] Verify Google Cloud Console OAuth consent screen URLs unchanged (umbrella URLs — per LEGAL-SYNC.md, no re-verification triggered by product page changes alone).
- [ ] Commit umbrella site repo first, then sync to product repo in same deploy window.

---

## §11. Open Questions for Andrew

### Sarah-pending (requires Sarah's input before shipping)

| # | Question | Gates | Context |
|---|---|---|---|
| Q-1 | **Account ownership default:** should K-12 student accounts default to parent/guardian as AccountHolder, or should we offer a choice (parent vs. student-self) during the claim flow? The working default here is parent=AccountHolder for all K-12, student-self for adults. | Phase 2 claim flow UI | Sarah knows her families; she may have adult students or families where the student manages their own account. |
| Q-2 | **Consent toggle list:** is the proposed starter list (§4.4) the right set of toggles for Sarah's families? Any toggles she'd add or remove? | Phase 3 consent UI + legal | Especially: is `allowAudioRecording=false` by default the right UX, or does Sarah want it default-on for new claims (matching the existing `recordingDefaultEnabled=true` default)? |

### Andrew-decision required

| # | Question | Gates | Context |
|---|---|---|---|
| Q-3 | **Recording retention on consent revocation:** when a parent revokes `allowAudioRecording`, what happens to already-captured recordings? Options: preserve, delete on demand, or retain for fixed period then auto-delete. (§10.5) | Phase 3 production + policy | Legal decision; needs legal review. Do not default-implement either direction. |
| Q-4 | **Child device session lifetime:** proposed default 180 days. Acceptable? Shorter (30 days) is more conservative; longer (365 days) is friendlier for families. | Phase 2 | Security vs. UX trade-off. |
| Q-5 | **Tutor 2FA recovery path:** the proposed path requires Andrew (as ADMIN) to manually reset a tutor's 2FA via the admin dashboard in a lockout scenario. Is there a self-service recovery path Andrew wants to provide (e.g., recovery via email in addition to backup codes)? | Phase 1 | A pure backup-code-only model is slightly more secure but slightly higher risk of permanent lockout if backup codes are also lost. |
| Q-6 | **ShareLink sunset timeline:** after authenticated access ships in Phase 4, how long should existing `ShareLink` tokens remain valid for parents who haven't claimed yet? Suggested: 90-day grandfather window with "claim your profile" prompts. | Phase 4 | Balance between pilot continuity and access model cleanup. |
| Q-7 | **Student-in-messaging scope:** should older students with email-verified `LearnerProfile` accounts be allowed to participate as senders in the tutor↔parent conversation thread? Or is messaging always parent-only (student can read but not send)? | Phase 5 | UX + legal implications; minor sending messages in a tutoring context may have its own COPPA nuance. |
| Q-8 | **Adult self-managed path:** is there a specific age threshold for "adult" (18+? college-age? anyone self-declaring no parent account needed)? The `isSelfLearner` flag on `AccountHolder` is the mechanism — we just need the enrollment criteria. | Phase 2 claim flow UI | The default (all K-12 = parent AccountHolder; adult = self) is proposed; confirm. |
| Q-9 | **Messaging email notifications:** should the email notification for a new message use the existing `EmailConfig`/`OAuthEmailConnection` infrastructure (tutor-side SMTP or Gmail OAuth) or a separate app-side transactional email service (Resend, Postmark)? | Phase 5 | The existing email infrastructure is tutor-signed (the tutor's Gmail sends the note recap). For messaging notifications, app-signed email (from Mynk) may be more appropriate — but that requires a new email provider integration. |

---

## §12. New Per-Session Log Prefixes

Register these in `AGENTS.md` § Conventions and `docs/RECORDER-LIFECYCLE.md` § Cheat Sheet at the start of each phase's executor dispatch.

| Prefix | Scope | Example log line |
|---|---|---|
| `ahx` | AccountHolder auth lifecycle: signup, email verify, login, logout, password reset, CRITICAL_ACTION | `[ahx] ahx=<accountHolderId> action=signup email=<email>` |
| `lpr` | LearnerProfile events: credential create, login, device session create/revoke, session join | `[lpr] lpr=<profileId> action=login device=<deviceInfo>` |
| `clm` | Claim invite lifecycle: minted, sent, attempted, claimed, expired, revoked | `[clm] clm=<inviteId> action=claimed studentId=<id> accountHolderId=<id>` |
| `cns` | Consent events: ConsentRecord created/versioned, ConsentRestriction changed, SessionConsentSnapshot frozen, violation attempted | `[cns] cns=<snapshotId> action=frozen sessionId=<id> allowAudio=true` |
| `tfa` | 2FA lifecycle: enrollment start, enrollment confirmed, verify success, verify failure, backup code used, 2FA reset | `[tfa] tfa=<userId> principalType=admin_user action=enrolled` |
| `msg` | Messaging: conversation created, message sent, email notification sent/failed | `[msg] msg=<conversationId> action=message_sent senderId=<id> senderType=tutor` |

---

## Appendix A — Invariants verified as preserved

Per `docs/UX-AND-A11Y-SPEC.md` carry-forward requirements:

| Invariant | Status |
|---|---|
| Server-side consent enforcement | ✅ `assertEffectiveConsent` + `SessionConsentSnapshot` freeze |
| Ownership assertions before any mutation/read | ✅ Three new assertions: `assertOwnsLearnerProfile`, `assertIsSessionParticipant`, existing `assertOwnsStudent` |
| Tokenized + revocable shares | ✅ `ShareLink` + `WhiteboardJoinToken` unchanged in transition; new claims use authenticated sessions |
| Tight CSP | ✅ No new external origins introduced by this design (messaging uses existing email infra; TOTP is server-side) |
| Additive migrations only | ✅ Every schema change adds columns/tables; no drops, no renames |
| Per-session ID logging | ✅ Six new 3-letter prefixes defined; all state transitions log `<prefix>=<id>` |
| Multi-tenant isolation (assertOwnsStudent) | ✅ Preserved and extended to `assertOwnsLearnerProfile` |
| `ImpersonationLog` audit trail | ✅ Unchanged; impersonation cannot access AccountHolder or LearnerProfile data (different session space) |

---

*End of design document.*
