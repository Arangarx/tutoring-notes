# Consent-honesty safe-erasure redesign + smoke-fix mini-phase

> **Status:** Executor-facing implementation plan (design doc only — no code in this commit)  
> **Branch:** `wb-wave5-polish`  
> **Authored:** 2026-07-01  
> **Tip at plan authorship:** [`e47f41a`](https://github.com/Arangarx/tutoring-notes/commit/e47f41a)  
> **Merge target:** `v1-redesign` @ [`7397abc`](https://github.com/Arangarx/tutoring-notes/commit/7397abc) — **BLOCKED** until this mini-phase completes + clean re-smoke  
> **Evidence / triage:** [`consent-honesty-smoke-findings-2026-07-01.md`](consent-honesty-smoke-findings-2026-07-01.md) (Andrew's annotated smokebooks; merge verdict **NOT PASS**)  
> **Prior erasure plan (superseded semantics):** [`learner-erasure-plan.md`](learner-erasure-plan.md) — grace read-access + immediate hard tombstone; **REVERSED** by Andrew 2026-07-01 ratification below  
> **Companion smokebooks:** [`consent-honesty-premerge-smoke-index.md`](consent-honesty-premerge-smoke-index.md), [`wb-block-b-consent-gate-smokebook-2026-06-30.md`](wb-block-b-consent-gate-smokebook-2026-06-30.md), [`cc1-cc2-consent-gate-smokebook.md`](cc1-cc2-consent-gate-smokebook.md), [`erasure-smokebook.md`](erasure-smokebook.md)

---

## 1. Why this mini-phase exists

Andrew ran pre-merge smoke on 2026-07-01 against tip `8e38935` (through session fixes @ `e66c177`). Smoke annotations captured in [`f85af03`](https://github.com/Arangarx/tutoring-notes/commit/f85af03)..[`e47f41a`](https://github.com/Arangarx/tutoring-notes/commit/e47f41a); triage in [`consent-honesty-smoke-findings-2026-07-01.md`](consent-honesty-smoke-findings-2026-07-01.md).

**Merge verdict: NOT PASS.** Six merge-blocking items (MB-1..MB-6) span consent Start failures, erasure false-success / incoherent grace semantics, IN_PERSON replay gap, tutor_only notes gap, and a student→parent routing security issue. Andrew also skipped CC-1/CC-2 and much of erasure manual smoke, arguing deterministic gates belong in Playwright — not repeated manual hardware smoke.

**Andrew ratified (2026-07-01):**

1. **Safe-then-merge** — fix all merge-blockers + redesign erasure before `merge --no-ff wb-wave5-polish → v1-redesign`.
2. **Reversible tombstone** — grace period must allow full account recovery, not just "data lingers while account is dead."

This plan is the executor contract for that work.

---

## 2. Legal rationale — grace period semantics (ratified)

Research summary (GDPR Art. 17 / COPPA right-to-erasure practice):

| Requirement | Compliant pattern | Current design violation |
|---|---|---|
| Grace / undo window | Permitted — data retained **only for recovery**, not actively processed | Tutor retains **read access** and can start new sessions during grace |
| During grace | **Access SUSPENDED** — account deactivated, content not served | Tombstone is immediate hard-delete of credentials + PII redaction; tutor still reads |
| Within grace | Account **RECOVERABLE** — cancel restores identity + access | Cancel halts purge but account already destroyed ("incoherent cancel") |

**Design pivot:** During grace, **disable** (soft tombstone) rather than **destroy**; suspend **all** access (tutor + learner + parent where scoped); cancel = true restore. Hard destroy remains at grace expiry in `process-erasure-job.ts` `db_scrubbing` phase.

If parent-facing deletion-right copy changes, follow [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md).

---

## 3. Merge-blocker map → workstreams

| Finding | ID | Workstream item |
|---|---|---|
| Start Session silent failure (impersonation-exit race suspected) | MB-1 | CF-1 |
| Full-family erasure ineffective; DELETE bypasses validation | MB-2 | ER-1, ER-2, ER-5 |
| Per-learner tombstone not reflected; new sessions not blocked | MB-3 | ER-3, ER-4 |
| IN_PERSON: no replay despite strokes | MB-4 | CF-2 |
| tutor_only: no notes at all | MB-5 | CF-4 |
| Student landed on parent's page post-session | MB-6 | CF-3 |

Non-blocking bugs (B-1..B-3) and UX backlog (C-1..C-10) are captured in [`consent-honesty-smoke-findings-2026-07-01.md`](consent-honesty-smoke-findings-2026-07-01.md) §B/C — **out of scope** for this mini-phase unless a fix is trivially bundled. Two items tagged **POST SARAH PRE RELEASE**: C-1 (replay Play/Pause overlaps Board tab), C-2 (student mic-boost parity).

Design questions DQ-1..DQ-6 in findings — **DQ-1 resolved** by reversible tombstone ratification; DQ-2 (2FA step-up) and DQ-4 (account lookup UX) remain backlog; DQ-3 addressed in ER-6.

---

## Workstream A — Consent-side fixes (independent, moderate risk)

### CF-1 — Start error surfacing

**Maps:** MB-1

**Problem:** Workspace `activateSessionLive` surfaces only `ConsentError`; other failures (e.g. `assertOwnsWhiteboardSession` → `notFound()` after impersonation-exit in another tab) are swallowed silently. Waiting-room Start was fixed in [`ba8d606`](https://github.com/Arangarx/tutoring-notes/commit/ba8d606); workspace path still gaps.

**Fix:**

- Mirror `StartWhiteboardSession.tsx` generic-error + digest handling in `WhiteboardWorkspaceClient.tsx` `activateSessionLive`.
- Surface **all** Start failures to the tutor — not just consent denials.
- Add operator warning on impersonation banner: exiting impersonation in one tab affects **all tabs** in this browser (session identity invalidated).

**Note:** A normally-logged-in tutor (Sarah) does **not** hit the impersonation case. This fix is about **universal visibility** of any Start failure — the Start button must never fail silently.

**Files:** `WhiteboardWorkspaceClient.tsx`, impersonation banner component.

**Risk:** Low–moderate. No whiteboard sync surface.

---

### CF-2 — Decouple replay from audio consent

**Maps:** MB-4

**Problem:** Whiteboard event-logging currently requires `audioCapturePolicy !== 'none'`. IN_PERSON + audio-denied logs **no** whiteboard events → no replay despite visible strokes (Block B #2).

**Fix:**

- Gate whiteboard event recording on `phaseActive` (+ live/whiteboard consent as appropriate), **NOT** the audio capture policy.
- Update `recordingActive` gate in `WhiteboardWorkspaceClient.tsx` accordingly.

**Files:** `useWhiteboardRecorder.ts`, `WhiteboardWorkspaceClient.tsx`.

**Risk:** **FRAGILE — wb-sync surface.** **MUST** pass `npm run test:wb-sync` before merge.

---

### CF-3 — Learner routing

**Maps:** MB-6 (security)

**Problem:** After session end, student navigated to `/` and landed on **parent's** dashboard instead of learner join flow.

**Fix:** `/` must route a valid `mynk_learner_session` cookie to `/join` **before** the account-holder check.

**File:** `src/app/page.tsx`

**Risk:** Low. Auth routing only.

---

### CF-4 — tutor_only no-notes (confirm + fix)

**Maps:** MB-5

**Problem:** LIVE + `tutor_only` (student audio denied) produced **no notes at all** — contrast with full-consent path where notes did generate. Likely causes:

1. Impersonation race on end-session notes trigger (`triggerNotesGenerationAction` → `assertOwnsWhiteboardSession` ownership denial), **or**
2. Chunk-enqueue gap for tutor_only audio policy.

**Fix:**

- Make end-session / notes-trigger ownership-safe; surface errors instead of silent drop.
- Add integration test: tutor_only chunk enqueue + notes trigger on clean (non-impersonation) path.
- Confirm on clean re-smoke (no impersonation tabs open).

**Risk:** Moderate. May touch recorder lifecycle — read [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) first.

---

## Workstream B — Erasure legally-safe reversible redesign

**Risk:** **FRAGILE, high blast radius** — auth/credentials, irreversible-adjacent, legal. **REQUIRES 5-axis reliability review of ER plan BEFORE execution** (dispatch Sonnet).

Supersedes grace read-access semantics from [`learner-erasure-plan.md`](learner-erasure-plan.md) §2 and erasure smokebook item #10.

### ER-1 — No false-success

**Maps:** MB-2 (DELETE bypass, job without effective tombstone)

**Problem:** `requestErasureByAdminAction` resolves+validates target for display-name confirm but `DELETE` path may skip existence checks. Tombstone helpers may not throw — job can exist without effective tombstone. Full-family erasure showed in jobs table but parent could still operate.

**Fix:**

- `requestErasureByAdminAction` must resolve+validate target for **both** display-name confirm **and** `DELETE` path (`DELETE` must NOT skip existence checks).
- Tombstone helpers must **THROW** and roll back the job (same transaction) if target isn't found.
- Invariant: **a job can never exist without an effective tombstone.**

**Files:** `request-erasure-by-admin.ts`, `tombstone.ts`

---

### ER-2 — Reversible tombstone

**Maps:** MB-2, MB-3, DQ-1 (resolved)

**Problem:** Current design hard-deletes `LearnerCredential`, nulls PII immediately — cancel cannot restore account.

**Fix — during grace, DISABLE rather than destroy:**

- Soft-disable login/credentials + mark tombstoned (`disabled` flag / `tombstonedAt` gate) instead of hard-deleting `LearnerCredential` and nulling PII.
- Preserve enough state to fully restore: name, email, credentials.
- Session revocation stays **immediate** (security).
- **HARD destroy** still happens at grace expiry in `process-erasure-job.ts` `db_scrubbing` phase (existing purge path).

**Schema:** May need **additive** column (e.g. `disabled` flag on `LearnerCredential` or equivalent) — additive migrations only per repo convention.

**Files:** `tombstone.ts`, `process-erasure-job.ts`, schema migration if needed, login routes.

---

### ER-3 — Suspend ALL access during grace

**Maps:** MB-3, MB-10 (erasure smokebook grace-window read-access FAIL)

**Problem:** Previously ratified "tutor retains read access during grace" — **REVERSED**. Tutor could see student name, start new whiteboard sessions for tombstoned learner.

**Fix:**

- Extend `assert-student-not-erased.ts` to block when an **ACTIVE** `ErasureJob` or tombstone covers the student — not just `Student.erasedAt` (purge-time).
- Apply to tutor content routes: replay, events, snapshot, audio, tutor-asset.
- Apply to `createWhiteboardSession` / `startWhiteboardSession` — block new sessions for tombstoned/pending-erasure learners.

**This REVERSES** the previously-ratified "tutor retains read access during grace."

---

### ER-4 — Immediate tutor-visible redaction

**Maps:** MB-3 (display name not redacted)

**Fix:**

- Tutor roster/detail show clear **"pending erasure / login disabled"** state immediately on tombstone.
- Redacted name shown immediately — not deferred to purge-time `Student.erasedAt`.

---

### ER-5 — Cancel = true restore

**Maps:** MB-2, erasure #7 PARTIAL, DQ-1

**Problem:** Cancel halts purge but account already dead — incoherent state.

**Fix:** `cancelErasureByAdminAction` within grace:

- Un-tombstone — re-enable credentials, restore name/email.
- Clear the `ErasureJob`.
- Restore tutor access (depends on ER-2 reversible state).

Removes "cancel halts purge but account already dead."

---

### ER-6 — Copy

**Maps:** DQ-3, erasure smokebook #3, operator confusion (MB-2 family display name)

**(a) Requestor/parent-facing deletion copy** — unmissably clear:

> Account deactivated immediately; permanently deleted in 7 days; contact us to cancel within that window.

NON-technical — no "blob" jargon.

**(b) Operator copy** — accurate:

| Scope | Identifier to enter | Confirm phrase |
|---|---|---|
| Per-learner | `learnerProfileId` | Learner display name |
| Full-family | `AccountHolder.id` (NOT self-learner profile id) | Account holder display name |

**REMOVE** the false claim "tutor sees [Deleted learner] immediately" — during grace tutor sees **pending erasure / login disabled** (ER-4), full placeholder only after purge.

**(c)** If parent-facing deletion-right copy changes → [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md).

---

### ER-7 — Tests + docs

**Rewrite** erasure integration tests asserting **OLD** grace semantics:

| Old assertion | New assertion |
|---|---|
| Tutor retains read access during grace | Access **suspended** during grace |
| `shouldShortCircuitEndSessionForErasure` grace behavior | Cancel **restores** full access |

**Update:**

- [`erasure-smokebook.md`](erasure-smokebook.md) — grace semantics, automated vs manual items
- [`consent-honesty-premerge-smoke-index.md`](consent-honesty-premerge-smoke-index.md) — **REVERSED** "grace read-access nuance"
- [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) / erasure sections if applicable
- [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) if schema/credential semantics change

---

## Workstream C — Playwright e2e (replace manual smoke of deterministic gates)

**Maps:** Findings §E (Andrew's core process complaint)

Andrew skipped CC-1/CC-2 entirely (10 items N/A+SKIP) and several erasure items — arguing these are **totally Playwright-testable**.

### Auth fixtures required

- Admin (erasure operator)
- Tutor
- Account-holder (parent)
- Learner-PIN session

### Specs to implement

**CC-1 / CC-2:**

1. No `ConsentRecord` blocks session create
2. Unclaimed learner blocks session create
3. `ConsentRecord` exists → session create proceeds (positive path)
4. `startWhiteboardSession` backstop (legacy PENDING, no record)
5. Mandatory consent choice at claim setup
6. Decline path writes all-off `ConsentRecord`
7. Self-learner exempt from mandatory consent
8. Re-submit already-saved consent → 409
9. All-off record satisfies CC-1; join gate blocks live entry
10. Theme parity — claim setup + parent consent editor (optional CI matrix; manual for subjective contrast)

**Erasure-admin:**

1. Non-admin → 404 on `/admin/erasure`
2. Confirmation phrase enforced
3. Cancel during `requested` — halts purge; reversible restore (ER-5)
4. `[Deleted learner]` / pending-erasure placeholder in student lists (post-purge vs grace states)

### Goal

Andrew's re-smoke reduces to **genuinely hardware/perception items only:**

- Real audio-mixdown isolation (student absent from recording, heard live)
- Multi-device live A/V sync (WebRTC, ICE)
- Transcription / notes quality judgment
- Theme parity on physical devices when subjective contrast matters

This is the direct answer to Andrew's "you should have playwrighted this."

---

## Workstream D — Re-smoke + merge

### Pre-merge gates (all must pass)

| Gate | When |
|---|---|
| `npx next build` | Final tip |
| `npm run test:wb-jest` | Final tip |
| `npm run test:wb-sync` | If CF-2 or any whiteboard touch (mandatory for this mini-phase) |
| Full `npx jest` | Final tip |
| Playwright e2e (new specs) | Green in CI / local before Andrew manual re-smoke |
| Comprehensive pre-master smoke | **Both light and dark themes** per [`SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md) |

### Re-smoke prep

1. Regenerate smokebooks — mark now-automated items; leave hardware-only for Andrew.
2. Refresh tip commit + preview URL via Vercel MCP `branchAlias` (fetch — never guess).
3. Cancel/clean orphan mis-scoped `ErasureJob` on preview DB from smoke session.

### Merge

On clean re-smoke PASS:

```text
git merge --no-ff wb-wave5-polish → v1-redesign
```

Then Part 3 reliability spine (`p3-clock` → per-speaker capture → transcription) in a **fresh chat**.

---

## Reliability gate

| Surface | Requirement |
|---|---|
| Workstream B (all ER items) | **5-axis reliability review BEFORE execution** — dispatch Sonnet; auth/credential + irreversible-adjacent + legal |
| CF-2 + any whiteboard change | `npm run test:wb-sync` merge gate |
| ER-2 schema change | Additive migration only; update `PLATFORM-ASSUMPTIONS.md` if load-bearing |

---

## Sequencing recommendation

Workstreams A and B are largely file-disjoint but both contain fragile pieces — **serialize the fragile work.**

```text
1. 5-axis review of Workstream B (Sonnet dispatch) — BEFORE any ER code
2. ER-1 (quick correctness — no false-success)
3. ER-2 + ER-5 (reversible tombstone + restore — the core)
4. ER-3 + ER-4 (access suspension + immediate redaction)
5. ER-6 + ER-7 (copy + tests/docs)

Parallel-safe windows:
  - CF-1 + CF-3 (low risk) — anytime alongside ER-1/2
  - CF-2 + CF-4 (recorder) — serialize vs other whiteboard work; CF-2 needs wb-sync gate

6. Workstream C (Playwright e2e) — after CF + ER stabilize
7. Workstream D (re-smoke + merge)
```

**Housekeeping:** Cancel/clean the orphan mis-scoped `ErasureJob` on the preview DB from Andrew's smoke session.

---

## Acceptance criteria (mini-phase complete)

- [ ] All MB-1..MB-6 findings resolved or explicitly accepted with documented rationale
- [ ] Erasure grace = suspended access + reversible tombstone + true cancel restore
- [ ] No erasure job without effective tombstone; DELETE path validates existence
- [ ] Playwright covers CC-1/CC-2 + erasure-admin deterministic gates
- [ ] `test:wb-sync` green (CF-2)
- [ ] `npx next build` + full jest green
- [ ] Andrew re-smoke PASS (hardware-only items + both themes)
- [ ] `merge --no-ff wb-wave5-polish → v1-redesign`

---

## Executor prerequisite reads

1. [`consent-honesty-smoke-findings-2026-07-01.md`](consent-honesty-smoke-findings-2026-07-01.md) — raw evidence
2. [`learner-erasure-plan.md`](learner-erasure-plan.md) — prior semantics being reversed
3. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — before CF-2/CF-4
4. [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) — before ER-6 parent-facing copy
5. [`consent-blocker-5axis-review-2026-06-30.md`](consent-blocker-5axis-review-2026-06-30.md) — pattern for ER 5-axis review
