# Consent-Gates-Capture — Architecture Design Doc

> **Design date:** 2026-05-31
> **Authored by:** Sonnet 4.6 subagent, commissioned by Opus orchestrator
> **Deliverable type:** Design document only — no production code, no migrations applied
> **Prerequisite reads:**
> - [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — spine + CONSENT-GATES-CAPTURE ledger entry
> - [`docs/handoff/session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) — identity/consent schema; §7.2/§7.6 SUPERSEDED by this doc
> - [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — FSM/outbox/atomic end-session (must read before touching this gate)
> - [`docs/handoff/coppa-compliance-research-2026-05-31.md`](coppa-compliance-research-2026-05-31.md) — COPPA basis
>
> **Locked principle:** Capturing a learner's content — uploading text, uploading audio, OR recording live audio — MUST be gated on an effective consent record permitting that capture type. No upload/record of a minor's content without consent. Hard bar for K-12. Adults (`isSelfLearner`) self-manage.
>
> **Supersedes:** `session-identity-access-design-2026-05-31.md` §7.2 ("zero forced migration") and §7.6 ("indefinite unclaimed links / no forced migration") — those sections described a grandfather posture that the CONSENT-GATES-CAPTURE premise (2026-05-31) explicitly rejects. The correct posture is claim-or-quarantine with preserve-don't-delete.

---

## §1. The Principle (locked — referenced throughout)

Andrew ratified this principle on 2026-05-31 upon identifying a dangerous bypass in the prior design: a tutor could capture minor audio with zero consent on record, since any session against an unclaimed `Student` stub had no consent mechanism at all.

**The bypass that was caught:** the prior design's "indefinite unclaimed links / no forced migration" posture meant a tutor could indefinitely create unclaimed sessions for children, record audio, and upload notes — all without any parent consent on file. This is a COPPA collection-without-VPC risk (audio of minors = personal information under 16 CFR § 312.2(8)).

**The principle:** Every act of capture — defined as any of the three actions below — requires an **effective consent record** authorizing that capture type for that learner, at the time of capture.

| Capture type | Trigger action | Consent toggle required |
|---|---|---|
| **Live audio recording** | Tutor arms the recorder FSM (`tutorWantsRecording = true`) | `allowAudioRecording = true` in `SessionConsentSnapshot` |
| **Audio upload** | Audio segments registered via `endWhiteboardSession` | `allowAudioRecording = true` in `SessionConsentSnapshot` |
| **Text/note upload** | Session notes or transcript saved/shared | `allowNoteSending = true` in `SessionConsentSnapshot` |

**Scope note — what is NOT a capture action:**
- **Live whiteboard stroke rendering** during a session (essential to conducting the session — session participation, gated on `allowLiveSession`; NOT a capture).
- **Whiteboard-activity recording** (stroke replay for later review) **IS** a consent-gated capture type — distinct toggle, same bar as audio (`allowWhiteboardRecording` or equivalent in `SessionConsentSnapshot`).
- Reading/viewing existing session data (gated by access control, not consent-gates-capture).

**Adults:** `isSelfLearner = true` — the AccountHolder IS the learner. They self-manage capture consent. See §7.

---

## §2. Enforcement Design — Phase-3 Full Version

> **Phase 3** is the "consent lattice" execution phase per `session-identity-access-design-2026-05-31.md` §9. This section describes the full enforcement model that Phase 3 must implement. Phase 2 (identity layer) is a prerequisite. The interim bridge is in §6.

### 2.1 The enforcement stack (three layers)

Effective enforcement requires **all three layers**. UI-only gating is insufficient for COPPA compliance — a determined caller who hits API routes directly would bypass it.

```
Layer 1 — UI precondition gate
  ↓  (never arms if consent absent)
Layer 2 — Server-side assertion (assertEffectiveConsent)
  ↓  (throws 403 if no valid snapshot)
Layer 3 — SessionConsentSnapshot (frozen, immutable, per-session)
  ↓  (authoritative court of record)
```

### 2.2 Where each gate sits — per capture type

#### Live audio recording (most complex — see §3 for FSM interaction)

**Gate location:** BEFORE `tutorWantsRecording` is set to `true` in the workspace client.

The FSM (`evaluateLifecycle`) never receives `tutorWantsRecording = true` unless consent is confirmed. This means the FSM never enters `armed` state and `shouldCapture(streamId)` is never `true` for any stream. MediaRecorder is never started. No audio segment is ever produced for the outbox.

Implementation touch points:
1. `startWhiteboardSession` server action: fetches effective consent, creates `SessionConsentSnapshot`, aborts session creation if `learnerProfileId` is set AND `allowAudioRecording = false` (for claimed profiles with denied consent). The session DOES start (tutor can still teach); only the recording capability is blocked.
2. Workspace client loads `SessionConsentSnapshot` at mount (via existing session data or a dedicated read). Passes `consentSnapshot.allowAudioRecording` as a prop.
3. The recording toggle UI is disabled/hidden when `allowAudioRecording = false` in the snapshot. The tutor sees: *"Audio recording is not enabled for this student. The student's parent can enable it in their account settings."*
4. If somehow the recording start is attempted server-side (direct API call): `assertEffectiveConsent(whiteboardSessionId, 'allowAudioRecording')` throws before any action proceeds.

#### Audio upload (outbox → endWhiteboardSession)

**Gate location:** `endWhiteboardSession` server action (Pillar 3), BEFORE `SessionRecording.createMany`.

Logic:
```typescript
// In endWhiteboardSession, after validating segments:
if (segments && segments.length > 0) {
  await assertEffectiveConsent(whiteboardSessionId, 'allowAudioRecording');
  // throws ConsentViolationError (→ HTTP 403) if snapshot missing or false
}
// proceed with createMany
```

**Critical invariant:** if `allowAudioRecording = false` in the snapshot AND segments are somehow present (e.g., a bug in the UI gate allowed recording to start), the server action rejects the upload, and the segments are NOT registered against the session. The IDB outbox rows remain (not finalized), so the audio data is preserved locally — not silently dropped — and the error is surfaced to the tutor so they can report it. An admin can investigate and, if the data is later legitimized (parent grants consent + new session), assist in cleanup.

#### Text / note upload

**Gate location:** any server action that stores or shares session notes/transcripts.

Logic:
```typescript
// Before writing notes:
await assertEffectiveConsent(whiteboardSessionId, 'allowNoteSending');
// throws if not consented
```

This applies to:
- `generateSessionNotes` (or equivalent AI-notes action)
- Any `ShareLink`-style note-sharing server action (during transition phase)
- Any future export/email-notes action

**Note on `allowNoteSending` semantics:** "note sending" consent covers all text content export from a session — not just actively emailing a parent. The name reflects the original consent-lattice design; for enforcement purposes, any action that writes text content derived from a session beyond the tutor's own in-app view is gated on this toggle.

### 2.3 What happens when consent is absent or insufficient

| Situation | Server behavior | UI behavior |
|---|---|---|
| Session has no `SessionConsentSnapshot` (unclaimed student — Phase-3 forward) | `startWhiteboardSession` creates session; recording + note features are disabled | Workspace shows: *"This student's profile hasn't been claimed by a parent yet. Audio recording and note sharing require parental consent. Invite the parent to claim this profile."* |
| Snapshot exists, `allowAudioRecording = false` | `assertEffectiveConsent` throws on any audio registration attempt | Recording toggle disabled; tooltip: *"Audio recording is not enabled for this student."* |
| Snapshot exists, `allowNoteSending = false` | `assertEffectiveConsent` throws on note-write attempt | Notes generate (tutor's private use) but "send to parent" / share actions are disabled; tooltip: *"Note sharing is not enabled for this student."* |
| No snapshot AND audio upload attempted (server-side bypass) | `endWhiteboardSession` rejects the `segments` payload; returns 403 with `code: "CONSENT_REQUIRED"` | Workspace shows error banner; IDB rows preserved; session End still succeeds (events/snapshot may still be written — audio is the only blocked component) |
| Consent revoked mid-enrollment (parent changes during an active session) | No effect on the in-progress session — the `SessionConsentSnapshot` is frozen at session start | N/A — mid-session revocation takes effect on the NEXT session start |

### 2.4 Mid-session consent changes — the lattice freeze invariant

**The SessionConsentSnapshot is frozen at session start and immutable.** A parent revoking `allowAudioRecording` mid-session does NOT interrupt live recording. The snapshot for the in-progress session remains valid. The revocation takes effect at the next `startWhiteboardSession` call, which reads the latest `ConsentRecord` to produce a new snapshot.

This is intentional and defensible:
- COPPA §312.6 requires future collection to stop on revocation — "future" is keyed to the next collection event, not an in-flight session.
- The `SessionConsentSnapshot` IS the evidence that collection was authorized at the time it began. Its immutability is the legal record.
- Interrupting a mid-session recording would cause a poor tutor experience and could result in lost partial audio (a reliability failure) for no legal benefit.

**Tutor workspace behavior:** The workspace MAY optionally poll the effective consent (every ~5 minutes) and display a soft banner: *"Note: this student's parent has updated consent settings. These changes take effect at the start of your next session."* This is informational only — it does NOT interrupt recording or modify the snapshot. Implementation of this soft poll is OPTIONAL and should not be in Phase-3 scope unless Andrew specifically approves it.

### 2.5 assertEffectiveConsent — revised signature

The `assertEffectiveConsent` function defined in the identity/access design is the right abstraction. Refining the signature for the capture-gate use case:

```typescript
/**
 * Asserts that the given WhiteboardSession has a frozen SessionConsentSnapshot
 * with the specified permission set to true.
 *
 * Throws ConsentViolationError (HTTP 403) if:
 *   - No SessionConsentSnapshot exists for the session
 *   - The snapshot has the specified permission set to false
 *
 * For unclaimed students (no learnerProfileId on Student), the snapshot
 * will not exist (null consentSnapshot) — this is treated as "consent absent"
 * and the assertion fails.
 *
 * Logs: [cns] cns=<snapshotId> action=consent_check permission=<key>
 *       result=granted|denied sessionId=<id>
 */
async function assertEffectiveConsent(
  whiteboardSessionId: string,
  permission: 'allowAudioRecording' | 'allowNoteSending' | 'allowLiveSession' | 'allowVideoRecording' | 'allowMessaging'
): Promise<void>
```

**Self-learner shortcut:** if `SessionConsentSnapshot.consentRecordId === null` AND the session's `LearnerProfile.accountHolder.isSelfLearner === true`, the assertion passes (self-learner implicitly consents for themselves — see §7).

---

## §3. Reliability Integration — Precondition Without New Failure Modes

> **Critical requirement:** the consent gate must integrate as a PRECONDITION evaluated BEFORE entering the recording lifecycle — never a step that can wedge MediaRecorder, block the outbox, or introduce a new hang mode in the end-session flow.

### 3.1 The recorder lifecycle — what must not be touched

From `docs/RECORDER-LIFECYCLE.md`, the three pillars are:

1. **Pillar 1 — Lifecycle FSM** (`evaluateLifecycle`) — pure function; must remain pure; no consent logic inside
2. **Pillar 2 — IndexedDB outbox** — durable queue; consent violation rejection by the server does NOT corrupt the outbox
3. **Pillar 3 — `endWhiteboardSession`** — atomic server action; consent check added BEFORE `SessionRecording.createMany`

### 3.2 The gate placement — exactly here

```
[Workspace mounts]
  → Loads SessionConsentSnapshot (with session data)
  → If allowAudioRecording = false: disables recording toggle entirely
  → tutorWantsRecording initialized to false (and cannot be set to true)

[Tutor clicks recording toggle]
  → If consentSnapshot.allowAudioRecording = false: noop + tooltip (UI gate, Layer 1)
  → If allowAudioRecording = true: sets tutorWantsRecording = true
  → FSM evaluateLifecycle() runs with tutorWantsRecording=true → transitions to "armed"
  → shouldCapture("tutor:mic") = true → MediaRecorder.start() fires

[Session End]
  → Step 1: setUserWantsRecording(false)  ← FSM stops capture
  → Step 2: drainOutboxOrTimeout(wbsid, 15s)
  → Step 3: assembleEndSessionSegments(wbsid)
  → Step 4: uploadWhiteboardEvents(...)
  → Step 5/5b: snapshot (best-effort)
  → Step 6: endWhiteboardSession(wbsid, eventsBlobUrl, { segments, snapshotBlobUrl? })
              ↑ NEW: assertEffectiveConsent(wbsid, 'allowAudioRecording') before createMany
              ↑ Throws if no consent → segments NOT registered
              ↑ But session DOES close (endedAt, eventsBlobUrl are written first)
  → Step 7: finalizeOutboxAfterEnd(wbsid)  ← ONLY if step 6 succeeds
  → Step 8: router.replace(reviewHref)
```

### 3.3 What happens if step 6 throws on consent (edge case analysis)

**Scenario:** `assertEffectiveConsent` throws inside `endWhiteboardSession` because (a) the snapshot is missing or (b) `allowAudioRecording = false`.

**Current atomic transaction design (Pillar 3, Step 6):** The server action runs one Prisma transaction. If the consent check is placed BEFORE the transaction begins (i.e., read the snapshot, check it, THEN open the transaction), the transaction never opens on a consent failure. This is the correct placement.

**Revised Pillar-3 execution order:**
```
endWhiteboardSession(wbsid, ..., { segments }) {
  // 1. Assert consent for audio if segments present (outside transaction)
  if (segments?.length > 0) {
    await assertEffectiveConsent(wbsid, 'allowAudioRecording');
    // throws here → no DB changes at all
  }
  
  // 2. Validate segments (throws before txn if invalid)
  validateEndSessionSegments(segments);
  
  // 3. Open transaction
  return await db.$transaction([
    // update WhiteboardSession endedAt + eventsBlobUrl + ...
    // SessionRecording.createMany (only reached if consent OK)
    // revoke join tokens
  ]);
}
```

**If consent throws:** `endWhiteboardSession` returns a `ConsentViolationError`. The workspace client catches this and:
- Shows an error banner: *"This session's audio could not be saved — audio recording consent is not on file for this student. Your session notes have been saved. Contact us if you need help recovering this audio."*
- Does NOT proceed to `finalizeOutboxAfterEnd` (IDB rows preserved — tutor's audio is not lost, just not registered server-side).
- The `WhiteboardSession` remains open (no `endedAt`). The tutor can retry End (which will again fail on audio consent, but the non-audio parts can succeed).

**BLOCKER-HANDLING:** This edge case (recording started despite consent=false, then End fails on consent) should be unreachable in normal operation if the UI gate (Layer 1) is correctly implemented. The server-side gate is a safety net. If it triggers, something went wrong upstream (a bug in the UI gate). This is not a new hang mode — it is a clean failure with preserved local data.

**Revised Pillar-3 transaction structure** to allow non-audio end-session success even if audio consent is denied:

Split `endWhiteboardSession` into two operations if needed:
- The session close (endedAt, eventsBlobUrl, snapshotBlobUrl, join-token revoke) — always runs.
- The segment registration (`SessionRecording.createMany`) — only runs if consent OK.

This way, a tutor can End a session cleanly even if audio consent is absent. The audio segments stay in IDB but are not registered. The tutor's session is not stuck in an open state.

**Revised Pillar-3 pseudocode:**
```typescript
async function endWhiteboardSession(wbsid, eventsBlobUrl, { segments, snapshotBlobUrl }) {
  let consentOkForAudio = false;
  if (segments?.length > 0) {
    try {
      await assertEffectiveConsent(wbsid, 'allowAudioRecording');
      consentOkForAudio = true;
    } catch (e) {
      if (e instanceof ConsentViolationError) {
        log(`[cns] cns=- action=audio_upload_blocked wbsid=${wbsid} reason=no_consent`);
        // Continue — close the session without audio segments
      } else {
        throw e; // unexpected error — bubble up
      }
    }
  }

  validateEndSessionSegments(consentOkForAudio ? segments : []);

  return await db.$transaction(async (tx) => {
    // Always: close session
    await tx.whiteboardSession.update({ where: { id: wbsid }, data: { endedAt: ..., eventsBlobUrl, ... } });
    // Conditional: register audio
    if (consentOkForAudio && segments?.length > 0) {
      await tx.sessionRecording.createMany({ data: sortedSegments, skipDuplicates: true });
    }
    // Always: revoke join tokens
    await tx.whiteboardJoinToken.updateMany(...);
  });
}
```

**After this change:** `finalizeOutboxAfterEnd` in the workspace client MUST only be called when the session close succeeds AND consent was OK for audio. If consent was absent, the IDB rows must NOT be finalized (they represent audio data that was NOT registered). The workspace client receives the server response and checks a `registeredSegments` count — if 0 when segments were present, it shows the error banner and leaves IDB intact.

### 3.4 5-Axis Adversarial Reliability Review

#### Axis 1 — Data durability

| Risk | Severity | Mitigation |
|---|---|---|
| Audio IDB rows finalized after a consent-denied End | **BLOCKER** | `finalizeOutboxAfterEnd` MUST NOT run if server returns `ConsentViolationError` or `registeredSegments === 0` when segments were sent. This is a new invariant: finalize only on confirmed server-side registration. |
| SessionConsentSnapshot accidentally deleted | **BLOCKER** | `onDelete: Restrict` on `SessionConsentSnapshot` (locked in identity design). No new risk here. |
| ConsentRecord accidentally deleted | **BLOCKER** | `onDelete: Restrict` on `ConsentRecord` (locked in identity design). No new risk here. |
| Session note written without consent | **HIGH** | `assertEffectiveConsent(wbsid, 'allowNoteSending')` in all note-write server actions. Negative test required. |

**BLOCKER for Phase 3 acceptance:** the `finalizeOutboxAfterEnd` call in the workspace client must be conditioned on `registeredSegments > 0 || noSegmentsSent`. This is a one-line change in the client but must not be missed.

#### Axis 2 — Recovery

| Risk | Severity | Mitigation |
|---|---|---|
| Session stuck open because audio consent fails at End | **HIGH** | Resolved by splitting session-close from segment-registration in Pillar 3 (§3.3). Session always closes; audio consent failure is non-blocking for session close. |
| Tutor can't End session if consent check throws unexpectedly | **MEDIUM** | Non-ConsentViolationError from `assertEffectiveConsent` bubbles up normally (same as any server error today). No new hang mode introduced. |
| Audio data lost when consent fails | **MEDIUM** | IDB rows preserved (not finalized) on consent failure. Tutor's audio is recoverable via admin action if consent is later granted. |
| Parent grants consent after session — can historical audio be registered? | **LOW** | Not in scope for Phase 3. Admin-only path needed; flag in §8. |

#### Axis 3 — Concurrency

| Race | Severity | Mitigation |
|---|---|---|
| Parent revokes consent while tutor is at the End-button click | **LOW** | Consent check in `endWhiteboardSession` reads the snapshot (frozen at session start) — NOT the live ConsentRecord. Mid-session changes don't affect the check. Immutable snapshot eliminates this race. |
| Two simultaneous `endWhiteboardSession` calls (double-click) | **LOW** | Same race as today; `@unique` on `whiteboardSessionId` in `SessionConsentSnapshot` prevents double-snapshot creation. |
| Consent check reads stale snapshot | **NONE** | Snapshot is write-once (no UPDATE endpoint). Any snapshot read is authoritative. |

#### Axis 4 — Auth / ownership boundaries

| Boundary | Test required | Risk if broken |
|---|---|---|
| Tutor cannot record audio when `allowAudioRecording = false` even via direct API | `assertEffectiveConsent` tested with `allowAudioRecording=false` snapshot → must throw 403 | COPPA collection without consent |
| Note server actions assert `allowNoteSending` before writing | Negative test: write notes without snapshot → 403 | Minor data stored without consent |
| Workspace client cannot be tricked into setting `tutorWantsRecording = true` when consent absent | UI test: render workspace with `allowAudioRecording=false` → recording toggle disabled | Client-side bypass (caught by server-side gate) |
| `endWhiteboardSession` cannot register segments without a valid snapshot | Server-side test: call action without snapshot row → consent check fails | The most important test — covers API bypass |

#### Axis 5 — Observability

All consent-gate enforcement events must emit structured log lines. Without this, a COPPA audit or a consent dispute cannot be investigated.

Required log events (using `cns=` prefix from the identity design):

| Event | Log line |
|---|---|
| Consent check passed (audio allowed) | `[cns] cns=<snapshotId> action=consent_check permission=allowAudioRecording result=granted wbsid=<id>` |
| Consent check failed (audio denied) | `[cns] cns=<snapshotId or -> action=consent_check permission=allowAudioRecording result=denied wbsid=<id> reason=<no_snapshot|toggle_false>` |
| Audio upload blocked at endWhiteboardSession | `[cns] cns=- action=audio_upload_blocked wbsid=<id> segments_dropped=<n>` |
| Note write blocked | `[cns] cns=<snapshotId or -> action=note_write_blocked wbsid=<id>` |
| Session snapshot frozen (normal path) | `[cns] cns=<snapshotId> action=frozen wbsid=<id> allowAudio=<true|false> allowNotes=<true|false>` |

**BLOCKERs folded into Phase-3 acceptance:**

1. `BLOCKER-RELIABILITY:` `finalizeOutboxAfterEnd` must not run when server reports audio-consent failure. Implement before Phase 3 ships.
2. `BLOCKER-CORRECTNESS:` `assertEffectiveConsent` must be present and tested (positive + negative) in every note-write and audio-register server action before Phase 3 ships.
3. `BLOCKER-OBSERVABILITY:` all `cns=` log events above must be emitted before Phase 3 ships to production (required for any COPPA audit response).

---

## §4. Existing-Data Migration

> §7.2 and §7.6 of `session-identity-access-design-2026-05-31.md` are SUPERSEDED. "Zero forced migration / indefinite unclaimed links / grandfather existing" is rejected. The correct posture is claim-or-quarantine with preserve-don't-delete.

### 4.1 The problem with the prior posture

The prior design allowed existing unclaimed `Student` rows + their sessions/recordings to persist indefinitely in a state where no parent consent existed. This means:
- Existing `SessionRecording` rows for real students were collected without VPC.
- Ongoing sessions against unclaimed real students would continue to be captured without VPC.
- COPPA does not grandfather past collection done without consent.

The premise catch (2026-05-31) corrects this: existing data is NOT exempt. Bring it into the consent structure.

### 4.2 Preserve-don't-delete (interim) — Andrew confirmed

Until Sarah completes the test-student audit (see Open Items in v1-redesign-STATUS.md), ALL existing data is preserved as-is:
- No `SessionRecording` rows are deleted.
- No `Student` rows are deleted.
- No `WhiteboardSession` rows are deleted.
- No `ShareLink` or `WhiteboardJoinToken` rows are changed.

This is the correct interim posture: COPPA requires parent-directed deletion, not operator-initiated purge. Preserving data while the situation is clarified is not a violation; capturing more data without consent is.

### 4.3 Sarah's test-student audit (required before V1 lands)

**The audit question:** which of Sarah's existing students are REAL (a real child or adult learner) vs. TEST (data Sarah created herself for testing purposes)?

**Required action from Sarah** (Andrew to ask at next Sarah call or via email):
1. Review her student list and categorize each as REAL or TEST.
2. For TEST students: Sarah confirms they can be purged (all sessions + recordings deleted).
3. For REAL students: Sarah identifies which ones she wants to carry forward into V1 (these get claim invites).

**System behavior after audit:**
- TEST students: purge (admin action, not self-serve — admin delete the Student row + cascade sessions/recordings).
- REAL students Sarah wants to keep: send claim invite → parent claims → consent recorded → student enters the new model.
- REAL students Sarah does NOT want to keep (e.g., former students): preserve as unclaimed stubs (read-only to tutor) or Sarah explicitly chooses to close them.

### 4.4 Migration path delivered WHEN V1 LANDS

When the Phase-3 consent system ships, the migration for existing real students is:

**For claimed students (parent has completed the claim flow):**
- `SessionConsentSnapshot` is created at the next session start (Phase 3 gate).
- Previous sessions without a snapshot: treated as "pilot pre-consent sessions" — not erased, but clearly labeled in the UI. Tutor can view them; sharing to parent is gated on whether the parent's current `ConsentRecord.allowNoteSending = true` (retroactive sharing under new consent is allowed if parent consents now, since parent is now the owner of the data relationship).
- **Audio of past sessions (no snapshot):** existing `SessionRecording` rows remain stored. They were captured under the "tutor-obtained consent" + disclosure floor. Parent can direct deletion on request. These are NOT retroactively illegal if Mynk's disclosure floor was in place when captured. However, they MUST NOT be replayed or shared to the parent without the parent's affirmative consent under the new system. A `SessionRecording` for a session with no `SessionConsentSnapshot` should require `ConsentRecord.allowAudioRecording = true` (current) before making the audio accessible to anyone other than the tutor.

**For unclaimed students (parent has NOT completed claim flow) — the hard question:**
- Sessions continue to be blocked from new capture (recording disabled for unclaimed students in Phase 3).
- Existing sessions remain in the database as tutor-only records.
- If Sarah wants to continue working with an unclaimed student, she MUST send a claim invite. The family claims + consents BEFORE the next session's capture features are enabled.
- **Sunset window:** propose a **60-day** window after V1 launch. After 60 days, any unclaimed real student whose tutor still has active sessions is placed in "no-capture" mode for future sessions. The tutor is prompted to either (a) send a claim invite or (b) acknowledge the student is leaving the system.
- **Tutor notification:** when V1 launches, Sarah receives an in-app + email notification: "As part of Mynk's parent consent system, recording and note-sharing for your students now require parental consent. Students without a parent account will not have these features. Invite parents to claim their child's profile."

### 4.5 Existing WhiteboardSession rows without SessionConsentSnapshot

Existing sessions (Sarah's 126 sessions) have `consentSnapshot = null`. This is permanent — you cannot retroactively create accurate consent records for past sessions.

**Treatment in the access model:**
- Tutor access: unchanged (tutor can view all their own sessions).
- Parent access to notes: allowed if the claimed parent's `ConsentRecord.allowNoteSending = true` (they're consenting to notes access now).
- Parent access to audio: allowed if `ConsentRecord.allowAudioRecording = true` (same logic — parent affirmatively consenting to audio access retroactively is their right).
- **No snapshot = no automatic sharing.** The absence of a snapshot is not a green light. All sharing of past-session data to newly-claimed parents requires a current, valid `ConsentRecord` with the relevant toggle enabled. The server checks `ConsentRecord` (live, not a snapshot) for access to historical sessions.

### 4.6 PII/business-record separation (locked 2026-05-31)

Per the locked principle: `SessionRecording` rows for deleted `LearnerProfile`s resolve to "student deleted" for display but the business record (session-occurred, `billedDurationMin`, amount) persists. The audio blob URL in a deleted-student context becomes inaccessible (the LearnerProfile FK is nulled/tombstoned). The business record remains. This is consistent with both COPPA §312.6(c) (operator may retain business records) and the separation principle.

---

## §5. Pilot Transition

### 5.1 Current state (now, before any Phase-3 work)

Sarah is the only tutor. All students are unclaimed stubs. No parent accounts exist. No `ConsentRecord`, `SessionConsentSnapshot`, `LearnerProfile`, or `AccountHolder` rows exist.

Capture currently happens under:
- Sarah's tutor-obtained consent relationship (she knows her families)
- The `consentAcknowledged` boolean on `WhiteboardSession` (Sarah clicks a checkbox)
- The disclosure floor (privacy/terms disclose audio recording + transcription)

This is the pre-V1 pilot posture. COPPA exposure exists (no VPC), but the "tutor-only access, one pilot tutor, founder oversight" context makes the risk low and manageable during the transition.

### 5.2 The transition sequence

| Phase | State | Capture behavior |
|---|---|---|
| **Now** (pilot, no consent system) | No parent accounts, no consent records | Capture allowed; `consentAcknowledged` checkbox only; INTERIM MASTER GATE (§6) added to master branch now |
| **Phase 1** (tutor 2FA) | No change to capture | Same as now + INTERIM GATE |
| **Phase 2** (identity layer ships) | Parent accounts exist; claim flow works | Unclaimed students: INTERIM GATE still applies. Claimed students: consent records can be created (but Phase 3 hasn't enforced them yet) |
| **Phase 3** (consent lattice ships) | Full enforcement live | Claimed students: server-side consent enforcement. Unclaimed students: recording + note-sharing disabled until claimed. INTERIM GATE retired. |
| **Post-Phase 3** | V1 live | Full enforcement. Sarah uses the parent portal to onboard families. New sessions require claim + consent before capture. |

### 5.3 Cutover: INTERIM GATE → Phase-3 enforcement

When Phase 3 ships:
1. The INTERIM MASTER GATE UI modal (`att=` attestation) is removed or disabled.
2. The `WhiteboardSession.captureAttestationAt` column is retained (it's a historical record of pre-V1 pilot attestations — preserve, don't drop).
3. The Phase-3 server-side enforcement takes over as the primary gate.
4. Claimed students with a `ConsentRecord` proceed normally through the consent-freeze flow.
5. Unclaimed students: workspace loads without recording/note-sharing controls active.

### 5.4 What Sarah experiences during the transition

- **Before Phase 3:** she sees the INTERIM GATE attestation modal once per session (§6). She clicks "Confirm" and captures as normal.
- **Phase 2 → 3 window:** if she has sent claim invites and some families have claimed, she may see different UI for different students (claimed = consent-controlled; unclaimed = attestation modal still).
- **At Phase 3 launch:** she receives notification that the parent portal is live. She's asked to send claim invites to any remaining families. Until families claim, recording is disabled for unclaimed students.
- **Sarah's own test sessions:** after the test-student audit (§4.3), test students are purged. Going forward, Sarah uses a clearly-labeled test student for her own testing.

---

## §6. INTERIM MASTER GATE (implementable now, on master, independently)

> **Self-contained specification.** This section is designed to hand directly to a Composer 2.5 executor for implementation on `master` branch, separately from V1 redesign work.

### 6.1 What this is

A lightweight **tutor attestation modal** shown ONCE PER SESSION before any capture action. The tutor confirms they have consent to capture (or that the session is test data). The attestation is logged with a per-session ID prefix and stored as a nullable timestamp on the `WhiteboardSession` row.

This is a **bridge mechanism** — not the final consent gate. It:
- Closes the current bypass gap (no gating at all)
- Creates an auditable record of tutor acknowledgment
- Does NOT introduce any new failure mode in the recorder lifecycle
- IS retired when Phase 3 (server-side consent enforcement) ships

### 6.2 Trigger conditions

The modal fires when the tutor first attempts ANY of these actions in a session:
1. Enabling the audio recorder (clicking the recording toggle from off to on)
2. Uploading session notes or generating AI notes (clicking "Generate notes" or equivalent)
3. Uploading audio manually (any manual audio upload action if one exists)

**"First attempt" means:** the modal fires once per `WhiteboardSession`, not once per action. After the tutor confirms once, all capture actions proceed without re-prompting. The confirmation is stored on the session.

**Non-trigger:** The modal does NOT fire on:
- Starting the session itself (session start is not a capture action)
- Viewing the whiteboard or writing strokes
- Viewing existing session data

### 6.3 Modal placement — PRECONDITION BEFORE RECORDER FSM

This is the critical reliability constraint. The modal MUST fire BEFORE `tutorWantsRecording` is set to `true`. It must NOT be fired inside `evaluateLifecycle`, inside `handleAudioRecorded`, or anywhere inside the outbox flow.

**Implementation pattern for the recording toggle:**
```typescript
// In WhiteboardWorkspaceClient (or the recording toggle handler):

const handleRecordingToggle = useCallback(async (wantsRecording: boolean) => {
  if (wantsRecording && !captureAttested) {
    // Show attestation modal — DO NOT set tutorWantsRecording yet
    setShowAttestationModal(true);
    setPendingRecordingIntent(true);
    return;  // tutorWantsRecording stays false; FSM stays idle
  }
  setTutorWantsRecording(wantsRecording);
}, [captureAttested]);

// Modal "Confirm" handler:
const handleAttestationConfirm = useCallback(async () => {
  await recordCaptureAttestation(whiteboardSessionId);  // server action
  setCaptureAttested(true);
  setShowAttestationModal(false);
  if (pendingRecordingIntent) {
    setTutorWantsRecording(true);  // NOW arm the FSM
    setPendingRecordingIntent(false);
  }
}, [whiteboardSessionId, pendingRecordingIntent]);
```

`captureAttested` is initialized from the session data at mount: `WhiteboardSession.captureAttestationAt !== null` → `captureAttested = true` (allows tutor to refresh the page without re-attesting for the same session).

### 6.4 Exact copy (final)

**Modal title:**
> Confirm session capture permission

**Modal body:**
> Before recording or uploading content from this session, confirm one of the following:
>
> - I have obtained consent from this student's parent or guardian to record and upload content from this session.
> - This session contains only test data I created (no real learner is involved).
>
> Mynk will enforce parent-provided consent automatically when the parent portal launches. Until then, this confirmation is your acknowledgment that appropriate consent exists.

**Primary button:** "Confirm — I have consent"
**Secondary / escape:** No cancel button. The modal is dismissable only by confirming. The tutor can close the modal by clicking outside (which leaves the recording toggle off and the session in its non-capturing state). The modal re-appears the next time they attempt a capture action.

**Small print beneath the button (optional, unobtrusive):**
> Questions? [Contact us](mailto:privacy@usemynk.com)

### 6.5 Attestation storage

**Schema change (additive, one column):**
```prisma
// ADD to existing WhiteboardSession model:
/// Timestamp when the tutor confirmed capture attestation for this session.
/// Null = no attestation given yet (pre-Phase-3 gate, or session hasn't had capture attempted).
/// Set once per session; never updated (immutable after first set).
captureAttestationAt DateTime?
```

Migration SQL (safe, additive):
```sql
ALTER TABLE "WhiteboardSession" ADD COLUMN "captureAttestationAt" TIMESTAMP(3);
```

**Server action:**
```typescript
// src/app/admin/students/[id]/whiteboard/actions.ts (or adjacent file)

/**
 * Records the tutor's attestation that they have consent to capture
 * content for this session. Called ONCE per session, before any capture.
 * Idempotent: if already set, returns the existing value.
 */
async function recordCaptureAttestation(
  whiteboardSessionId: string
): Promise<{ captureAttestationAt: Date }>
```

The action:
1. Asserts `assertOwnsSession(tutor.id, whiteboardSessionId)` (tutor owns the session).
2. If `captureAttestationAt` is already set: returns it (idempotent — no error, no overwrite).
3. If null: sets `captureAttestationAt = new Date()`.
4. Emits log: `[att] att=<shortId> wbsid=<sessionId> action=attested tutorId=<id>`

### 6.6 Log prefix: `att` (attestation)

Register `att` in `AGENTS.md` § Conventions "Per-session ID logging is mandatory" table and in `docs/RECORDER-LIFECYCLE.md` cheat sheet.

| Prefix | Scope | Example log line |
|---|---|---|
| `att` | Tutor capture attestation lifecycle: modal shown, confirmed, skipped | `[att] att=<shortId> wbsid=<sessionId> action=attested tutorId=<id>` |

Additional log events:
- `action=modal_shown` — when the modal fires (client-side log only, no server action)
- `action=attested` — when tutor confirms (server action log)
- `action=skipped` — if tutor dismisses the modal without confirming (client-side log; capture is NOT enabled)

### 6.7 UX behavior summary

| Scenario | Behavior |
|---|---|
| First capture attempt in a session (no attestation on file) | Modal fires; FSM not armed; tutor must confirm before capture proceeds |
| Tutor confirms | `captureAttestationAt` set; `captureAttested=true` in client state; capture proceeds immediately |
| Tutor dismisses modal (clicks outside) | Modal closes; capture toggle stays off; modal re-fires next capture attempt |
| Page refresh mid-session (after attestation) | `captureAttested` rehydrated from `WhiteboardSession.captureAttestationAt` → no re-modal needed |
| Second capture type in same session (e.g., attested for recording, now tries notes upload) | No re-modal — `captureAttested=true` in client state |
| New session (next day) | `captureAttestationAt = null` → modal fires fresh for the new session |
| Phase 3 ships (enforcement live) | `captureAttestationAt` column retained; modal UI code removed/disabled; column becomes legacy audit data |

### 6.8 What a Composer executor needs to implement

Files to touch (master branch — no v1-redesign branch changes needed):

1. **Schema:** add `captureAttestationAt DateTime?` to `WhiteboardSession` in `prisma/schema.prisma`. Run migration.
2. **Server action:** `recordCaptureAttestation(whiteboardSessionId)` in the whiteboard actions file. Assert ownership. Idempotent set. Log `att=`.
3. **Client state:** `captureAttested: boolean` initialized from session data (`WhiteboardSession.captureAttestationAt !== null`). `pendingRecordingIntent: boolean`.
4. **Recording toggle handler:** wrap with attestation check (see §6.3 pseudocode). Also wrap any notes-upload / AI-notes action.
5. **Modal component:** new `<CaptureAttestationModal>` with exact copy from §6.4. Dismissable by clicking outside. "Confirm" calls `recordCaptureAttestation` then proceeds.
6. **AGENTS.md update:** register `att` prefix.
7. **RECORDER-LIFECYCLE.md update:** add `att` to cheat sheet.

**Acceptance criteria:**
- Recording toggle does NOT arm the FSM until modal is confirmed.
- Refresh after confirmation: no re-modal for the same session.
- New session: modal appears on first capture attempt.
- `[att] att=<shortId> wbsid=<id> action=attested tutorId=<id>` appears in server logs when confirmed.
- `WhiteboardSession.captureAttestationAt` is set in the DB after confirmation.
- `captureAttestationAt` is null for sessions where no capture was attempted.

**DO NOT:**
- Add the modal inside `evaluateLifecycle` or `useAudioRecorder`.
- Call `setTutorWantsRecording(true)` before the server action returns successfully.
- Make the modal cancellable in a way that leaves `tutorWantsRecording = true`.
- Show the modal on session start (only on first capture attempt).

---

## §7. Adults — Self-Managed Consent Path

Adults (`AccountHolder.isSelfLearner = true`) collapse the parent/child distinction. The `AccountHolder` IS the learner. There is no separate parent consent authority.

### 7.1 Consent flow for self-learners

At claim time:
- No separate `ConsentRecord` is created in the "parent ceiling" sense.
- Instead: a `ConsentRecord` is created with `setByAccountHolderId = accountHolder.id` where `accountHolder.isSelfLearner = true` — the learner is simultaneously the consent-giver.
- All toggles are available to the adult directly. They set their own ceiling.
- There is no `ConsentRestriction` row (the child-narrowing layer doesn't apply when there's no parent/child split).

**Alternatively (simpler):** for self-learners, skip the `ConsentRecord` entirely and use a flag on `SessionConsentSnapshot.consentRecordId = null` + a check against `isSelfLearner`. If `isSelfLearner = true` AND `consentRecordId = null`, treat all consent toggles as `true` (self-learner implicitly consents for all capture types — they can restrict specific types via their account settings if they wish).

**Recommendation:** use the simpler path (null consentRecordId + isSelfLearner check in `assertEffectiveConsent`). Avoids the awkwardness of a self-referential ConsentRecord. The `assertEffectiveConsent` function checks this case explicitly (see §2.5).

### 7.2 What self-learners can control

- They may opt out of any capture type from their account settings (equivalent to narrowing their own consent).
- There is no "parent ceiling" to constrain them.
- Revocation: self-learner can revoke any toggle. Future sessions respect the revocation; existing sessions' snapshots remain as-is.

### 7.3 UI differences for self-learner sessions

- No "parental consent required" messaging.
- Consent toggles appear as the learner's own account settings (not a "parent portal").
- The tutor workspace shows consent status as "self-managed — [toggle states]" rather than "parent-consented."

### 7.4 COPPA applicability

COPPA covers children under 13. An adult self-learner (18+ per the locked Q-8 decision) is outside COPPA scope. The consent-gate-capture principle STILL applies (it is a product principle, not just a COPPA obligation), but the mechanism is simpler — the adult's own account settings are the gate.

---

## §8. Schema / Assertion Implications

### 8.1 What's already locked (no additions needed)

The identity/access design (locked 2026-05-31) already includes everything the consent gate needs:
- `ConsentRecord`, `ConsentRestriction`, `SessionConsentSnapshot` models
- `assertEffectiveConsent` function signature
- `allowAudioRecording`, `allowNoteSending`, `allowLiveSession` toggles
- `onDelete: Restrict` on both `ConsentRecord` and `SessionConsentSnapshot`
- `cns=` log prefix

### 8.2 Additions needed by this design (flag — don't build now)

| Addition | Why needed | Phase |
|---|---|---|
| `WhiteboardSession.captureAttestationAt DateTime?` | INTERIM MASTER GATE (§6) — additive column | **Now, master branch** |
| Split `endWhiteboardSession` into session-close + segment-register | Allows session to close cleanly even when audio consent is denied (§3.3) | Phase 3 (before enforcement ships) |
| `assertEffectiveConsent` isSelfLearner shortcut | Self-learner bypass in consent check (§7.1) | Phase 3 |
| Admin-side "register orphaned audio segments" action | For edge case where audio was captured before consent, parent later grants consent, tutor needs IDB audio registered to a session | Post-Phase-3, admin-only |
| `ConsentRecord` query: "latest record for (learnerProfileId, tutorId)" helper | Needed by `startWhiteboardSession` to freeze the snapshot | Phase 3 |

### 8.3 `allowNoteSending` rename consideration

The current toggle is named `allowNoteSending` (from the identity design). This design uses it to gate ALL text content export from sessions, not just "sending notes by email." Consider renaming to `allowTextExport` or `allowNotesAndTranscripts` for clarity. This is a naming decision for Andrew + Sarah to confirm before Phase 3 builds the consent UI — it affects what parents read in the consent form.

**Recommendation:** keep `allowNoteSending` for now (it's consistent with the locked schema). Add a display label in the UI: "Allow session notes and transcripts to be shared" — the toggle name in the DB is implementation-internal.

### 8.4 `allowVideoRecording` — no change needed

`allowVideoRecording` is already in the schema, defaulting to `false`. When video recording ships (post-V1), the consent gate will enforce it via `assertEffectiveConsent(wbsid, 'allowVideoRecording')` using the same pattern as audio. No schema addition required.

### 8.5 No new models needed for this design

The consent-gates-capture design does not require any new Prisma models beyond what the identity/access design already locked. The additions in §8.2 are column additions and server-side logic changes only.

---

## §9. Open Questions for Andrew

| # | Question | Gates | Context |
|---|---|---|---|
| Q-CGC-1 | **Self-learner consent model:** use simplified null-consentRecord + isSelfLearner bypass (§7.1 recommendation), or require a formal ConsentRecord even for self-learners? | Phase 3 implementation | Simplified is lighter code; formal record is more auditable. Both are legally equivalent for non-COPPA adults. |
| Q-CGC-2 | **allowNoteSending rename:** keep current name or rename to `allowTextExport` / `allowNotesAndTranscripts` before Phase 3 builds the consent UI? Parent-visible label must be clear. | Phase 3 consent UI | Affects what parents read + consent to. Needs decision before Phase 3 executor runs. |
| Q-CGC-3 | **Sunset window for unclaimed real students post-V1:** proposed 60 days (§4.4). Shorter (30 days) is more aggressive on compliance; longer (90 days) is more pilot-friendly. Andrew decides. | V1 launch + migration plan | Sarah's family relationships affect this — if she knows families will be slow to sign up, 90 days is kinder. |
| Q-CGC-4 | **Orphaned audio admin path:** if audio is captured before consent (e.g., INTERIM GATE was the only gate, and a session later gets claimed + consented), should there be an admin path to retroactively register IDB-preserved audio to a session? | Post-Phase-3 | Low-urgency but worth flagging. The IDB rows expire on browser clear; this path is only practical within the same browser session. |
| Q-CGC-5 | **Soft poll for mid-session consent change:** should the workspace optionally poll effective consent and show a soft banner when the parent revokes mid-session (§2.4)? | Phase 3 | Optional enhancement. Adds complexity; may confuse Sarah. Defer unless Sarah asks for it. |
| Q-CGC-6 | **`captureAttestationAt` legacy column:** after Phase 3 ships and the INTERIM GATE is retired, should the `captureAttestationAt` column be retained as audit history or eventually dropped? | Post-Phase-3 | Retain is conservative (audit trail). Drop is schema hygiene. Counsel's call on retention obligation. |

---

*End of design document.*
