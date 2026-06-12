# B2 Parent Privacy Consent — Smoke Checklist
**Branch:** `feat/b2-consent`  
**Date:** 2026-06-11  
**Flag:** `CONSENT_ENFORCEMENT` (default OFF — Sarah unaffected until flipped)

---

## Design decisions built to (confirm these)

| ID | Decision | Where to verify |
|---|---|---|
| **D-1** | Whiteboard `events.json` upload is ALWAYS performed (tutor's own data, never blocked). `allowWhiteboardRecording` gates parent-facing replay access, NOT the upload. | Watch logs — `[createWhiteboardSession]` should succeed regardless of consent; `[endWhiteboardSession]` should always close the session. |
| **D-2** | `ConsentRestriction` (child-narrowing) schema built, all defaults false (no restrictions). No child-facing UI ships in V1. | Check DB: `SELECT * FROM "ConsentRestriction"` — will be empty. Effective consent = parent ceiling (all restrictions are false by default). |
| **D-5** | Self-learners (`LearnerProfile.isSelfLearner = true`) auto-pass all consent checks. They are adults, outside COPPA. | Set `CONSENT_ENFORCEMENT=true`, create a self-learner profile, start a session — should not be blocked even with no ConsentRecord. |

---

## Smoke 1: Flag OFF (default) — identical to today

**Precondition:** `CONSENT_ENFORCEMENT` not set (or empty string) in environment.

| # | Step | Expected result |
|---|---|---|
| 1 | Log in as Sarah/tutor. Open a student who has a linked LearnerProfile. | Dashboard loads normally. |
| 2 | Click "Start whiteboard session" (check consent box). | Session creates. No consent errors. |
| 3 | Record some audio during the session. | Audio segments register normally via `registerWhiteboardSessionAudioSegmentAction`. |
| 4 | Click "Stop" to end the session. | Session closes. Audio segments registered. Normal redirect. |
| 5 | Click "Generate notes" on a completed session. | Notes generation proceeds normally. |
| 6 | Send update email to parent. | Email sends. No consent error. |
| 7 | Open `/claim/[token]/setup` (post-claim setup page). | **Panel A "Privacy preferences"** is now visible with 4 real toggles (all OFF by default). |
| 8 | Toggle some options ON, click "Save preferences". | "Preferences saved ✓" confirmation shows. ConsentRecord row created in DB. |
| 9 | Start another whiteboard session for the same student. | Session creates normally — snapshot is created (log: `[cns] action=consent_frozen`). |
| 10 | Check server logs. | `[cns] wbsid=<id> action=consent_frozen consentRecordId=<id>` visible. No blocking errors. |

**Expected:** All steps pass. Behavior is identical to pre-B2. Sarah is completely unaffected.

---

## Smoke 2: Flag ON (`CONSENT_ENFORCEMENT=true`)

**Precondition:** Set `CONSENT_ENFORCEMENT=true` in Vercel environment variables (preview only — do NOT set on production `v1-redesign`).

### 2a: Claim flow (Panel A required when flag ON)

| # | Step | Expected result |
|---|---|---|
| 1 | Parent completes a new claim. Navigate to `/claim/[token]/setup`. | Panel A "Privacy preferences" visible, all toggles OFF. |
| 2 | Click "Save preferences" WITHOUT enabling any toggles. | ConsentRecord created with all-false. No error. |
| 3 | Start a whiteboard session for this student. | **BLOCKED** — `ConsentError: allowLiveSession not consented`. Error message shown. |
| 4 | Return to `/claim/[token]/setup`, enable "Allow live sessions", save. | ConsentRecord version 2 created with `allowLiveSession=true`. |
| 5 | Start a whiteboard session. | Session creates. Snapshot frozen with `allowLiveSession=true`. |

### 2b: Audio consent gate

| # | Step | Expected result |
|---|---|---|
| 1 | Create a ConsentRecord with `allowAudioRecording=false`. | Record in DB. |
| 2 | Start a whiteboard session for this student. | Session creates (live sessions allowed). Snapshot has `allowAudioRecording=false`. |
| 3 | Try to register an audio segment. | Segment registration rejected: `ConsentError: allowAudioRecording not consented`. |
| 4 | Stop the session (with audio segment in opts). | **Session closes successfully** (no lost session). Audio segments NOT registered (consent denied). Log: `audio_consent_denied — segments will NOT be registered; session close proceeds`. |

### 2c: Notes email consent gate

| # | Step | Expected result |
|---|---|---|
| 1 | Create a ConsentRecord with `allowNoteSending=false`. | Record in DB. |
| 2 | Try to send update email for this student. | **BLOCKED** — returns error: "Parental consent for notes updates has not been granted." |
| 3 | Generate notes from a whiteboard session. | **BLOCKED** — `ConsentError: allowNoteSending not consented`. |

### 2d: Self-learner auto-pass (D-5)

| # | Step | Expected result |
|---|---|---|
| 1 | Create an AccountHolder with `isSelfLearner=true`, LearnerProfile with `isSelfLearner=true`. | Profile in DB. |
| 2 | Link the LearnerProfile to a student. | Student linked. |
| 3 | Start a session — no ConsentRecord exists. | Session creates. Log: `[cns] action=consent_check result=self_learner_pass`. |
| 4 | All operations (audio, notes, email) proceed without consent barriers. | No ConsentError for any operation. |

---

## Step 6 deferred items (not in this branch)

The following items from the design spec were deferred due to scope:

1. **Parent per-tutor consent management page** — `/account/children/[id]` — one card per connected tutor, update creates new ConsentRecord version.
2. **`POST /api/account/children/[id]/consent`** — ownership-asserted update route.
3. **Tutor-side consent display in workspace** — disable recording toggle when `allowAudioRecording=false` AND flag ON.

These are tracked in `BACKLOG.md` and do not affect the core B2 safety contract.

---

## Log events to verify

When running with `CONSENT_ENFORCEMENT=true`:

| Log line | When triggered |
|---|---|
| `[cns] wbsid=<id> action=consent_frozen consentRecordId=<id>` | Session created with snapshot |
| `[cns] wbsid=<id> action=snapshot_skipped reason=unclaimed` | Unclaimed student session |
| `[cns] wbsid=<id> action=snapshot_skipped reason=no_record` | Claimed but no record yet |
| `[cns] wbsid=<id> action=consent_check permission=allowAudioRecording result=granted` | Audio consent granted |
| `[cns] wbsid=<id> action=consent_check permission=allowAudioRecording result=denied` | Audio consent denied |
| `[cns] wbsid=<id> action=consent_check permission=allowAudioRecording result=self_learner_pass` | Self-learner auto-pass |
| `[cns] wbsid=<id> action=consent_check permission=allowAudioRecording result=flag_off` | Flag disabled |
| `[cns] learnerProfileId=<id> adminUserId=<id> action=consent_set version=<v>` | ConsentRecord saved via claim flow |

---

## Atomic snapshot + no-lost-recording confirmation

- **Atomic snapshot**: `createWhiteboardSession` uses `db.$transaction` — session row + snapshot are created in a single transaction. No session without a snapshot attempt.
- **No lost recording**: `endWhiteboardSession` checks audio consent BEFORE the transaction; if denied, session close + join token revocation still proceed. Only the `SessionRecording` rows are skipped. Log: `audio_consent_denied — segments will NOT be registered; session close proceeds`.

---

## tsc / eslint / jest results

See the branch's final commit message and CI output.
