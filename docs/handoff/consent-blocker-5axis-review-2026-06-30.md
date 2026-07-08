# 5-Axis Adversarial Reliability Review — Consent-Honesty Blocker

**Branch:** `wb-wave5-polish` | **Reviewed:** 2026-06-30 | **Reviewer tier:** Sonnet (adversarial)
**Scope:** Block B (audio capture gate), CC-1/CC-2 (session + claim consent gates), Learner Erasure
**Plans reviewed:** `docs/handoff/wb-block-b-consent-gate-plan.md`, `docs/handoff/cc1-cc2-consent-gate-plan.md`, `docs/handoff/learner-erasure-plan.md`

**Verdict:** Architecture validated — no rework. Cross-plan synergies confirmed. Findings below fold into each plan's Phase-1 acceptance. Totals: 8 BLOCKER, 6 HIGH, 6 MEDIUM, 5 LOW.

---

## BLOCKERS (8)

### B-1 · `createWhiteboardSession` does NOT gate on missing ConsentRecord today — CC-1 core invariant absent `[CC-1 §3.2 / actions.ts:120-142]`
The existing guard only checks `allowLiveSession` when a record exists; when `latestRecord === null` (claimed minor, zero ConsentRecord) the inner `latestRecord && ...` short-circuits to `false` → session created with no consent record. A tutor who claims a student and starts a session before the parent visits setup gets through ungated.
**Remediation:** Add `assertConsentRecordExists` at L104 (after `assertTutorApproved`), before the B2 check. Helper throws for `learnerProfileId === null` (unclaimed) too — replace the implicit pass-through and add an explicit `ConsentError` + log for the unclaimed case.

### B-2 · `startWhiteboardSession` has zero consent check — CC-1 backstop unimplemented `[CC-1 §3.3 / actions.ts:263-298]`
Pure PENDING→ACTIVE flip guarded only by `assertOwnsWhiteboardSession`. Any PENDING row (grandfathered pre-CC-1, or direct DB write) activates with no consent check.
**Remediation:** Before the `updateMany` at L269, resolve `studentId → learnerProfileId` and call `assertConsentRecordExists(learnerProfileId, session.adminUserId)` (self-learner exempt inside helper). Log `[startWhiteboardSession] REJECTED: no_consent_record`.

### B-3 · `setup/page.tsx` has NO navigation exit gate — parents can leave without consent `[CC-2 §4.2 / setup/page.tsx:143-161]`
Two unconditional escape routes exist: (1) `CredentialSetupForm` "Set up later" link (`CredentialSetupForm.tsx:301-308`) — always rendered, no enforcement check; (2) post-credential "Go to dashboard →" (`setup/page.tsx:144-149`) — unconditional regardless of `consentAlreadySaved`. `enforcementEnabled` only hides a footnote, gates zero navigation.
**Remediation:** (1) query `isSelfLearner` in page SSR (absent today); (2) pass `enforcementEnabled` + `isSelfLearner` to `CredentialSetupForm`; hide "Set up later" when `enforcementEnabled && !isSelfLearner && !consentAlreadySaved`; (3) guard "Go to dashboard →" by `consentAlreadySaved || isSelfLearner`; (4) no post-claim redirect to dashboard until `consentAlreadySaved || isSelfLearner`.

### B-4 · `CredentialSetupForm` receives no `enforcementEnabled` prop — plan's CC-2 fix cannot land as written `[CC-2 §4.2 / setup/page.tsx:152]`
The component has no such prop today and the page doesn't query `isSelfLearner`. An executor following the plan literally would hide the ConsentSetupForm footnote but leave the credential "Set up later" link fully live — primary escape stays open. Silent prose↔code gap.
**Remediation:** Spec must add: (1) `isSelfLearner` to page SSR query; (2) `enforcementEnabled` to `CredentialSetupForm` interface; (3) conditional render of "Set up later"; (4) page wires `enforcementEnabled={!isSelfLearner}` into both forms.

### B-5 · `enqueueChunkTranscriptionAction` has zero consent check — server-side transcription defense unimplemented `[Block B §2 Hook L / actions.ts:1465-1516]`
Ownership → approval → phase → blob-host → enqueue, with no consent check. Any still-open pre-Block-B tab or hand-crafted server-action call can transcribe audio from a consent-denied session, bypassing client gates.
**Remediation:** After phase check (L1487) load `SessionConsentSnapshot`; `allowAudioRecording === false` AND `IN_PERSON` → early return + log (`[txc] action=enqueue_rejected reason=consent_denied_inperson`); `false` AND `LIVE` → allow (tutor-only mixdown consented); no snapshot → fail-closed early return. Phase-1 acceptance.

### B-6 · `endWhiteboardSession` blanket-denies ALL audio when any consent denied — drops tutor's own audio on LIVE+student-denied `[Block B §2 Hook M / actions.ts:665-682]`
`assertEffectiveConsent(..., "allowAudioRecording")` has no mode awareness; a LIVE session where the student denied audio but the tutor mixdown was recorded silently discards the tutor's recording. Same at `registerWhiteboardSessionAudioSegmentAction` (L1386).
**Remediation:** Replace with mode-aware inline check in both: IN_PERSON+false → deny; LIVE+false → allow (tutor-only legitimate); no snapshot → fail-closed. Prerequisite for the `tutor_only` remote-surgical path to produce any auditable recording.

### B-7 · Erasure: `PasswordResetToken` sweep ordering loses original email after redaction `[Erasure §3.2]`
`PasswordResetToken` has only `email` + `tokenHash` (no `accountHolderId` FK). Plan redacts `AccountHolder.email` in the same transaction then sweeps tokens by the redacted email → finds nothing → original-PII-email token rows survive as orphans.
**Remediation:** In the tombstone transaction, order: (1) revoke sessions, (2) `deleteMany` PasswordResetToken by CURRENT email, (3) sweep AuthThrottle/LearnerLoginThrottle by current PII keys, (4) then redact email + set `tombstonedAt`. Or add `accountHolderId` FK (additive migration) for FK-scoped sweep.

### B-8 · Erasure: `ErasureJob` uniqueness unspecified — concurrent request creates double jobs `[Erasure §4.1 / E1]`
Double-submit could create two jobs that both tombstone (double `tombstonedAt` write / double session-revoke) and independently track blob deletion (unreliable `completedAt`).
**Remediation:** E1 migration includes a partial unique index: `CREATE UNIQUE INDEX erasure_job_active_scope ON "ErasureJob"("scopeKind","scopeId") WHERE status NOT IN ('completed','failed')`. Define Prisma `@@index` + raw SQL together. Or make `requestLearnerErasureAction` an upsert returning the existing jobId when an in-progress job exists.

---

## HIGH (6)

### H-1 · `ConsentRecord` version increment not atomic — concurrent writes cause P2002 `[CC-2 §4.1 / setup/route.ts:102-106]`
`@@unique([learnerProfileId, adminUserId, version])`; version = `MAX+1`. Two concurrent POSTs (double-click/retry) both read MAX=0, both insert version=1 → P2002 → 500 with no guidance. Same race on the new `consent_decline` action.
**Remediation:** Serialize MAX+create (`SELECT ... FOR UPDATE` / serializable), or a per-pair sequence, or at minimum catch P2002 → `409 { error: "consent_already_saved" }` for UI retry.

### H-2 · Erasure: in-flight blob upload after tombstone → orphan outside inventory `[Erasure §3.1, §4.1]`
A `PUT /api/upload/audio` in flight when the tombstone commits completes AFTER inventory capture → blob not in `blobInventoryJson`, never deleted → PII audio persists after job reports `completed`. Upload route checks only an earlier-issued token.
**Remediation:** Re-enumerate blobs after a short quiescence (e.g. 60s post-`requested`), OR have `db_scrubbing` do a second enumeration pass before `completed`, OR reject uploads for sessions whose join tokens were revoked.

### H-3 · Erasure: events.json embedded-asset enumeration has no chunking — Vercel timeout for large families `[Erasure §3.6]`
Fetching + parsing each `eventsBlobUrl` server-side for a 100+ session family exceeds the 30s budget; a timeout mid-enumeration restarts from session one.
**Remediation:** (a) store embedded asset URLs in a `WhiteboardAsset` table at upload time (additive; also helps blob-cleanup), or (b) checkpoint enumeration progress per session in `blobInventoryJson` to resume. Option (a) cleaner. If deferred, document a scale threshold flag.

### H-4 · Block B: pre-Block-B IDB drafts re-upload after deploy `[Block B §2 Hook K]`
On next mount with `policy === "none"`, draft recovery (`WhiteboardWorkspaceClient.tsx:1772-1808`) finds an old draft and re-uploads it, bypassing the consent gate at upload time unless `draftStore.clear(sessionId)` runs before the scan.
**Remediation:** Phase-1 test: `(policy===none) AND existing IDB draft` → draft cleared on mount, NOT re-uploaded (`data-testid` on the clear call) in the regression suite.

### H-5 · join page allows claimed-minor entry when no snapshot exists — grandfathered sessions unclosed `[Block B §7a / join/page.tsx:219-228]`
L228 only denies when `consentSnap && allowLiveSession === false`; no snapshot → entry allowed. Grandfathered pre-CC-1 PENDING/ACTIVE sessions (claimed minor, no snapshot) let a student in via an old link with zero consent on file.
**Remediation:** Add: claimed `learnerProfileId` AND no `SessionConsentSnapshot` → same "session not available" denial. Safe/additive; self-learners always have a snapshot; post-CC-1 claimed minors always have one. Phase-1 gate.

### H-6 · `registerWhiteboardSessionAudioSegmentAction` shares the mode-blind blanket deny `[Block B §2 Hook N / actions.ts:1385-1386]`
Same no-mode `assertEffectiveConsent` deny on the per-segment live upload path; LIVE+student-denied silently drops the tutor's mid-session chunk uploads, breaking the session before end. Fix in the same commit as B-6.

---

## MEDIUM (6)

### M-1 · CC-2 `hasPendingSessionInvite` conflates session existence with join-token issuance `[CC-2 §4.3]`
`count({ studentId, endedAt: null })` is true for PENDING sessions with no join token issued → Variant (a) warning ("already been invited to") is misleading.
**Remediation:** `count({ studentId, endedAt: null, joinTokens: { some: { revokedAt: null, expiresAt: { gt: now() } } } })`.

### M-2 · `issueJoinToken` has no CC-1 gate — grandfathered ACTIVE sessions emit tokens post-deploy `[CC-1 §3.3 / actions.ts ~L392]`
Only `assertOwnsWhiteboardSession`. A pre-CC-1 ACTIVE session can issue join tokens; join page passes (H-5). Compound transition gap.
**Remediation:** Add consent-record existence check to `issueJoinToken` for the transition, or a tutor-facing error ("session predates consent requirements; end it and create a new one after setup"). Log `[wjg] action=join_token_blocked reason=no_consent_record`.

### M-3 · `AudioCapturePolicy` derives `sessionMode` from SSR before activation — wrong mode in waiting room `[Block B §2 / page.tsx]`
PENDING `sessionMode` defaults LIVE; tutor selecting IN_PERSON pre-Start yields `tutor_only` policy instead of `none` until reload.
**Remediation:** Re-derive policy client-side from locally-selected mode during waiting-room phase (state at `WhiteboardWorkspaceClient.tsx:1387-1388`); pass `initialSessionMode` + allow local override for policy derivation.

### M-4 · Erasure content-route guards rely on heuristic rather than a durable flag `[Erasure §4.1]`
`learnerProfileId IS NULL` also matches never-claimed students; name placeholder can collide; `ErasureJob.completed` join doesn't exist in routes.
**Remediation:** Add `Student.erasedAt DateTime?` (additive), set in `db_scrubbing` after PII scrub; routes check `student.erasedAt !== null`. Unambiguous.

### M-5 · Erasure `blobInventoryJson`/`blobsDeletedJson` growth for large families `[Erasure §4.1]`
2,000–5,000 URLs as a JSON array → write-per-blob updates get expensive.
**Remediation:** `ErasureJobBlob` child table (`jobId`, `url_hash`, `deleted_at`); parent stores phase only. Additive. Or batch deletes of 100 + a `blobsDeletedCount` integer.

### M-6 · `assertEffectiveConsent` `no_snapshot → PASS` creates a split state for pre-CC-1 sessions `[Block B §7a / consent-scope.ts:93-97]`
Post-Block-B, a pre-CC-1 session with a claimed minor: client policy=none (fail-closed) but server `assertEffectiveConsent`=PASS (no snapshot). Ending such a session with pre-Block-B IDB segments registers them because the server passes.
**Remediation:** Add server fail-closed rule to `endWhiteboardSession`: no snapshot for a claimed learner → deny segment registration (aligned with §7a). Keep generic `no_snapshot → PASS` for backward compat at the assertion level; add the explicit check on the end path.

---

## LOW (5)

### L-1 · `blob-cleanup.mjs` missing `TranscriptChunk.chunkBlobUrl` `[Erasure §3.6, E7]`
`loadReferenceSet` (`blob-cleanup.mjs:199-224`) omits `chunkBlobUrl` → chunk blobs are uncleaned orphans until E7 ships.

### L-2 · `setup/page.tsx` shows full `ConsentSetupForm` to self-learners — wrong UX `[CC-2 §4.4]`
Page never queries `isSelfLearner`; a `connect_self` self-learner sees the full parental consent form. Skip/informational-only + auto-true `consentComplete` not in the SSR spec.

### L-3 · `allowWhiteboardRecording` hidden but frozen false — schema debt `[Block B §6]`
Every CC-2-era ConsentRecord will have `allowWhiteboardRecording: false`; future enforcement would retroactively deny WB recording for all such families, needing a migration or re-collection. Document in BACKLOG.

### L-4 · `isSelfLearner` has no audit trail / server-enforced invariant `[CC-1 §4.4 / complete/route.ts]`
Set only via `connect_self` (L120-132); a direct DB mutation to `true` on a minor bypasses all consent gates. No `[lpr]` audit on change. Low-probability in single-operator setup; add schema comment + admin-tooling invariant.

### L-5 · CC-2 warning copy variants not yet approved — do not ship without Andrew sign-off `[CC-2 §5]`
Both Variant (a) and (b) + the confirmation dialog copy require explicit approval before the CC-2 UI commit (Commit 6) merges.

---

## Migration Risk Assessment

| Surface | Risk | Finding |
|---|---|---|
| `ConsentRecord` unique `(learnerProfileId, adminUserId, version)` | Version collision under concurrent save | H-1 |
| `ErasureJob` table + partial unique index (E1, additive) | Must define index SQL explicitly | B-8 |
| `Student.erasedAt` (optional nullable, recommended) | Additive, safe | M-4 |
| `PasswordResetToken` (no `accountHolderId` FK) | Sweep must use original email before redact | B-7 |
| `WhiteboardAsset` / `ErasureJobBlob` (optional) | Additive, scale/robustness | H-3, M-5 |
| CC-1/CC-2 | Schema-free (server logic only) — plan's "no migration" holds | ✅ |

---

## Cross-Plan Interaction Gaps

- **CC-1 → Block B:** CC-1 guarantees a ConsentRecord → `createSessionConsentSnapshot` always yields a snapshot for forward-created sessions; Block B's `initialHasConsentSnapshot === false` branch becomes unreachable forward but must remain for grandfathered sessions.
- **CC-2 decline → CC-1 gate:** decline writes all-off record → CC-1 existence check passes → all-off snapshot freezes `allowLiveSession: false` → join page (L228) denies. Synergy confirmed. ✅
- **Erasure → headless WhiteboardSession:** `SessionConsentSnapshot` Restrict references `WhiteboardSession.id` (kept) — satisfied; `ConsentRecord` Restrict references `LearnerProfile` (tombstoned, not deleted) — satisfied. ✅
- **Erasure → active Block B session:** erasure revokes join tokens but does NOT set `endedAt`; tutor can still end the session and register segments (snapshot still exists) whose blobs may post-date the inventory. Remediation: `endWhiteboardSession` short-circuits segment registration when an ErasureJob is in-progress for the student, OR `db_scrubbing` cleans up segments registered after inventory capture.

---

## Required Phase-1 Acceptance Test Additions

1. **T-new-A** — `createWhiteboardSession`, claimed minor + no record → `ConsentError` (B-1)
2. **T-new-B** — `startWhiteboardSession`, PENDING legacy row + no record → `ConsentError` (B-2)
3. **T-new-C** — claim setup with `credentialAlreadySet=true` → dashboard link not rendered until consent saved (B-3)
4. **T-new-D** — `enqueueChunkTranscriptionAction`, IN_PERSON + `allowAudioRecording=false` → early return, no enqueue (B-5)
5. **T-new-E** — `endWhiteboardSession`, LIVE + `allowAudioRecording=false` → segments **registered** not skipped (B-6)
6. **T-new-F** — join page, claimed minor + no snapshot → `allowLiveSession` denied (H-5)
7. **T-new-G** — Block B mount, existing IDB draft + policy=none → draft cleared, not re-uploaded (H-4)
8. **T-new-H** — erasure: `PasswordResetToken` by original email deleted in tombstone txn before email redaction (B-7)
9. **T-new-I** — erasure: concurrent request → zero duplicate ErasureJob rows (B-8)
