# B2 Parent Privacy Consent — Architecture Design
**Date:** 2026-06-11  
**Branch:** `feat/b2-consent` off `v1-redesign` @ `5cb137e`  
**Gate:** B2 — Privacy toggles / consent  
**Author:** Executor subagent (Composer 2.5); scope blob from Opus orchestrator

---

## 1. Overview

Gate B2 ships parent-privacy consent infrastructure behind a dormant `CONSENT_ENFORCEMENT` flag (default OFF). When OFF, behavior is **identical to today** — no sessions blocked, no recording blocked, no email blocked. The flag can be flipped to `true` to activate full enforcement when the pilot is ready.

The design collects consent records immediately (schema, UI, ConsentRecord writes all ship) but the **blocking/throwing** code is flag-gated. This mirrors the `NOTES_AUTH_WALL` dormant-then-flip pattern.

---

## 2. Resolved Design Decisions

| ID | Decision | Rationale |
|---|---|---|
| **D-1** | Gate **parent access** only — whiteboard `events.json` is ALWAYS uploaded for the tutor's own use. `allowWhiteboardRecording` gates parent-facing **replay access**, not the upload. | Tutor owns their session data; consent gates what parents can see, not what tutors can record for themselves. |
| **D-2** | `ConsentRestriction` (child-narrowing) schema + enforcement built, but **no child-facing UI** — all defaults to false (no restrictions). Child-driven UI is a future phase. | Builds the AND-logic now; avoids surface creep on consent. |
| **D-3** | Claim Panel A is **required / blocking when flag ON**; non-blocking (but still saves ConsentRecord) when flag OFF. | Collects consent data now for the pilot family; enforcement activates at flag flip. |
| **D-4** | On reconnect, toggles default **ALL-OFF** — no carryover, no pre-fill from prior version. | Explicit intent required on each connection; avoids implicit consent inheritance. |
| **D-5** | Self-learners (`AccountHolder.isSelfLearner = true` or `LearnerProfile.isSelfLearner = true`) **auto-pass** consent — they are adults, outside COPPA. | No consent barrier for adult self-learners. |
| **D-7** | `sendUpdateEmail` **hard-blocks (throws)** on no `allowNoteSending` consent when flag ON. | Notes email is a direct data-sharing action; explicit parental consent required. |

**Not built:**
- `allowMessaging` / `allowVideoRecording` toggles — features not shipping; consent surface tracks feature surface
- Child-facing consent UI (D-2 defaults all restrictions to false)
- Parent per-tutor consent management UI (Step 6 — deferred if time runs out)

---

## 3. Schema

Three additive models, zero dropped/renamed columns.

### 3.1 `ConsentRecord`

Versioned consent record per (learnerProfile, tutor). Each `Save` creates a new version (MAX+1 or 1). Legal record — `onDelete: Restrict` on both FKs.

```
ConsentRecord {
  id                    String  @id @default(uuid())
  learnerProfileId      String
  adminUserId           String                          // tutor who receives consent
  version               Int
  allowLiveSession      Boolean
  allowAudioRecording   Boolean
  allowWhiteboardRecording Boolean
  allowNoteSending      Boolean
  setByAccountHolderId  String                          // AccountHolder who set this
  captureMethod         String  @default("electronic")
  setAt                 DateTime @default(now())
  @@unique([learnerProfileId, adminUserId, version])
  @@index([learnerProfileId, adminUserId])
  onDelete: Restrict (both FKs — legal record)
  relation name "TutorConsentRecords" on AdminUser
}
```

**Per-tutor model:** A parent who has children linked to two different tutors has two separate ConsentRecord chains — one per (learnerProfileId, adminUserId) pair. Consent for tutor A does not propagate to tutor B.

### 3.2 `ConsentRestriction`

Child-narrowing: parent can set per-child restrictions (floor). In V1 all default to false; no child-facing UI ships.

```
ConsentRestriction {
  id                        String  @id @default(uuid())
  learnerProfileId          String  @unique
  restrictAudioRecording    Boolean @default(false)
  restrictWhiteboardRecording Boolean @default(false)
  restrictNoteSending       Boolean @default(false)
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  onDelete: Cascade (deleting a LearnerProfile removes restrictions)
}
```

### 3.3 `SessionConsentSnapshot`

Frozen consent state at session start. Legal record — `onDelete: Restrict` on whiteboardSession.

```
SessionConsentSnapshot {
  id                     String   @id @default(uuid())
  whiteboardSessionId    String   @unique
  allowLiveSession       Boolean
  allowAudioRecording    Boolean
  allowWhiteboardRecording Boolean
  allowNoteSending       Boolean
  consentRecordId        String?  // null when no record existed (unclaimed / pre-consent)
  consentRecordVersion   Int?
  frozenAt               DateTime @default(now())
  onDelete: Restrict (legal record; session may not be deleted while snapshot exists)
}
```

### 3.4 LearnerProfile + AdminUser relations (additive)

```
LearnerProfile.consentRecords    ConsentRecord[]
LearnerProfile.consentRestriction ConsentRestriction?
AdminUser.consentRecords         ConsentRecord[] @relation("TutorConsentRecords")
WhiteboardSession.consentSnapshot SessionConsentSnapshot?
```

---

## 4. Enforcement Contract

### 4.1 Flag helper

```typescript
export function isConsentEnforcementEnabled(): boolean {
  const val = process.env.CONSENT_ENFORCEMENT;
  return val === "true" || val === "1";
}
```

Default: OFF. Sarah unaffected until the flag is set.

### 4.2 Effective consent computation

`effective = parent_ceiling AND NOT child_restriction`

- Parent ceiling = latest-version ConsentRecord for (learnerProfileId, adminUserId)
- Child restriction = ConsentRestriction for learnerProfileId (defaults all false = no restrictions)
- Result: `parentValue AND NOT restrictionValue`

### 4.3 assertEffectiveConsent (session-scoped)

1. If `!isConsentEnforcementEnabled()` → return void (flag-gated)
2. Permission is `allowMessaging` or `allowVideoRecording` → return void (not shipping)
3. Load `SessionConsentSnapshot` for the session
4. No snapshot (unclaimed / pre-consent session) → return void (fallback)
5. `LearnerProfile.isSelfLearner` → checked via snapshot's `consentRecordId` (D-5)
6. Check the relevant Boolean on the snapshot
7. If false → throw `ConsentError`

Log: `[cns] wbsid=<id> action=consent_check permission=<perm> result=granted|denied`

### 4.4 createSessionConsentSnapshot

Called inside `createWhiteboardSession` (same `db.$transaction` as the session row).

1. Look up the Student to find `learnerProfileId`
2. If no `learnerProfileId` (unclaimed) → skip snapshot (log `action=snapshot_skipped reason=unclaimed`)
3. Find latest ConsentRecord for (learnerProfileId, adminUserId)
4. If no record → skip snapshot (log `action=snapshot_skipped reason=no_record`)
5. Check `LearnerProfile.isSelfLearner` → if true, all effective = true (D-5)
6. Look up ConsentRestriction for learnerProfileId
7. Compute effective values: `parentBool AND NOT restrictionBool`
8. Insert SessionConsentSnapshot
9. Log `[cns] wbsid=<id> action=consent_frozen consentRecordId=<id> version=<v>`

**Key:** the snapshot freeze is NOT flag-gated — we always record what consent was authorized at session start. Only the `allowLiveSession` BLOCK in `createWhiteboardSession` is flag-gated.

### 4.5 assertConsentFromLiveRecord (session-less, for sendUpdateEmail)

1. If `!isConsentEnforcementEnabled()` → return void
2. Look up Student to get `learnerProfileId` and `adminUserId`
3. No `learnerProfileId` → return void (unclaimed)
4. Load LearnerProfile; `isSelfLearner` → return void (D-5)
5. Find latest-version ConsentRecord for (learnerProfileId, adminUserId)
6. No record → throw ConsentError (flag is ON, no consent = blocked)
7. Check `allowNoteSending AND NOT ConsentRestriction.restrictNoteSending`
8. If false → throw ConsentError

---

## 5. Capture-Path Gates

| Path | Permission | Reliability contract |
|---|---|---|
| `createWhiteboardSession` | `allowLiveSession` | Block (throw) **only** when flag ON + claimed + record has `allowLiveSession=false`. Always create snapshot in same transaction (not flag-gated). |
| `registerWhiteboardSessionAudioSegmentAction` | `allowAudioRecording` | `assertEffectiveConsent(wbsid, 'allowAudioRecording')` (flag-gated throw). Session is not blocked — only audio registration. |
| `endWhiteboardSession` audio registration | `allowAudioRecording` | Check consent before registering segments; if denied, skip registration but **session close always succeeds** — no lost sessions. |
| `generateNotesFromWhiteboardSessionAction` | `allowNoteSending` | `assertEffectiveConsent(wbsid, 'allowNoteSending')` (flag-gated throw). |
| `sendUpdateEmail` | `allowNoteSending` | `assertConsentFromLiveRecord(studentId, 'allowNoteSending')` — hard-blocks when flag ON + no consent. |

**Reliability invariant:** Session close ALWAYS succeeds regardless of consent state. Consent gates capture/distribution, never session finalization.

---

## 6. Claim Panel A — Consent UI

Replaces the "Coming soon — Phase 3" placeholder in `src/app/claim/[token]/setup/page.tsx`.

- 4 toggle switches: Allow live sessions / Allow audio recording / Allow whiteboard recording / Allow notes email
- Defaults ALL-OFF (D-4)
- On reconnect: always reset to ALL-OFF (no carryover)
- "Save preferences" → `POST /api/claim/[token]/setup` with `action: "consent"` body
- Creates `ConsentRecord` version = MAX+1 or 1
- Blocking only when flag ON (D-3); when flag OFF, still saves but does not block setup completion

---

## 7. Log Events (`[cns]` prefix)

| Log line | When |
|---|---|
| `[cns] wbsid=<id> action=consent_frozen consentRecordId=<id> version=<v> learnerProfileId=<id>` | Snapshot created |
| `[cns] wbsid=<id> action=snapshot_skipped reason=unclaimed\|no_record` | Snapshot not created |
| `[cns] wbsid=<id> action=consent_check permission=<perm> result=granted` | assertEffectiveConsent passed |
| `[cns] wbsid=<id> action=consent_check permission=<perm> result=denied` | assertEffectiveConsent denied (throws ConsentError) |
| `[cns] wbsid=<id> action=consent_check permission=<perm> result=self_learner_pass` | D-5 auto-pass |
| `[cns] wbsid=<id> action=consent_check permission=<perm> result=flag_off` | Flag disabled — void |
| `[cns] wbsid=<id> action=consent_check permission=<perm> result=not_shipping` | allowMessaging/allowVideoRecording — void |
| `[cns] wbsid=<id> action=consent_check permission=<perm> result=no_snapshot` | No snapshot (unclaimed) — void |
| `[cns] learnerProfileId=<id> adminUserId=<id> action=consent_set version=<v>` | ConsentRecord created |
| `[cns] studentId=<id> action=live_record_check permission=<perm> result=granted\|denied\|unclaimed\|self_learner` | assertConsentFromLiveRecord |

---

## 8. Security Invariants

- **Snapshot created atomically** with the session (same `db.$transaction`)
- **ConsentRecord / SessionConsentSnapshot never silently deleted** (`onDelete: Restrict` on both)
- **Cross-tenant impossible**: consent keyed on the tutor's own session; `assertOwnsLearnerProfile` on parent writes
- **Parent cannot set consent for another parent's learner**: `setByAccountHolderId` must equal `LearnerProfile.accountHolderId`
- **No recording lost when consent denied**: session close always succeeds; gates only block the disallowed capture
- **When flag OFF**: behavior is identical to today — zero risk to Sarah's sessions

---

## 9. Deferred (Step 6)

- Parent per-tutor consent management on `/account/children/[id]`
- `POST /api/account/children/[id]/consent` ownership-asserted update route
- Tutor-side consent display in workspace (disable recording toggle when `allowAudioRecording=false` AND flag ON)
