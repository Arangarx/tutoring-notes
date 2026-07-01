# CC-1 / CC-2 — Consent-record gate + mandatory claim consent

> **Status:** Implementation plan (design doc only — no code in this commit)  
> **Branch:** `wb-wave5-polish`  
> **Authored:** 2026-06-30  
> **Sarah-merge blocker:** `CONSENT-HONESTY-SARAH-MERGE-BLOCKER` — parts **(b)** and **(c)** of the three-part consent-honesty blocker  
> **Companion plan:** [Block B — client audio-consent gate](wb-block-b-consent-gate-plan.md) (part **(a)**)

---

## 1. Context — three-part consent-honesty blocker

Andrew ratified the expanded **consent-honesty blocker** (2026-06-30). Sarah merge is blocked until all three parts ship:

| Part | ID | What | Plan doc |
|---|---|---|---|
| **(a)** | Block B | Client + server audio capture gate (`allowAudioRecording` off = no capture/upload/transcribe) | [`wb-block-b-consent-gate-plan.md`](wb-block-b-consent-gate-plan.md) |
| **(b)** | **CC-1** | Tutor cannot **create** or **start** a whiteboard session unless a `ConsentRecord` exists for `(learnerProfileId, adminUserId)` | **This doc** |
| **(c)** | **CC-2** | Parent cannot exit claim setup without an explicit consent choice; both paths write a `ConsentRecord` | **This doc** |

**Synergy with existing B2 join gate:** Once CC-1 + CC-2 guarantee a record always exists for claimed minors, `createSessionConsentSnapshot` always runs at session create ([`consent-scope.ts:153-233`](../../src/lib/consent-scope.ts)). An all-off record freezes `allowLiveSession: false` on the snapshot; the join gate at [`join/[sessionId]/page.tsx:219-246`](../../src/app/join/[sessionId]/page.tsx) denies live entry — **no new mechanism required**.

**Schema:** No migration expected. `ConsentRecord` ([`prisma/schema.prisma:1069-1092`](../../prisma/schema.prisma)), `SessionConsentSnapshot` ([`1114-1128`](../../prisma/schema.prisma)), and `Student.learnerProfileId` ([`117-123`](../../prisma/schema.prisma)) already exist.

---

## 2. Ratified decisions (Andrew 2026-06-30 — do not re-open)

- **CC-1:** A tutor cannot **CREATE** or **START** a whiteboard session unless **a `ConsentRecord` exists for this `(learnerProfileId, adminUserId)`**. This deliberately gates on **record-existence** (NOT merely "claimed" / `learnerProfileId` set) — it subsumes the claimed check AND closes the window where a claim is finalized before the consent step. An all-off `ConsentRecord` satisfies the gate (the join gate then blocks live via `allowLiveSession`).

- **CC-2:** The parent cannot finish claim setup without an explicit choice — either **"Save preferences"** OR **"No consent now, I'll review later."** BOTH write a `ConsentRecord`; the decline path writes an **ALL-OFF** record. Enforcement is a mandatory choice to **EXIT** the setup step (no restructure of the claim-completion transaction). Remove "save later" / skip affordances when enforcement is on.

- **Self-learners EXEMPT:** Adult self-learners (`connect_self` / self-manage declaration, D-5 auto-pass) skip the mandatory parental-consent gate.

- **Warning copy at claim time** varies by whether an active session invite is pending (see §5).

---

## 3. CC-1 design — session create/start requires consent record

### 3.1 Shared helper — `assertConsentRecordExists`

**Add to** [`src/lib/consent-scope.ts`](../../src/lib/consent-scope.ts) (alongside `assertConsentFromLiveRecord` at L254-325, which already implements record-exists + permission for `allowNoteSending`).

```typescript
/**
 * Assert that a ConsentRecord exists for (learnerProfileId, adminUserId).
 * CC-1 gate — record existence, not permission value.
 *
 * Fast-path (return void):
 *   - learnerProfileId is null → throw (unclaimed; no record possible)
 *   - isSelfLearner → return (D-5 exempt)
 *
 * Throw:
 *   - Claimed minor + no ConsentRecord → ConsentError
 */
export async function assertConsentRecordExists(
  learnerProfileId: string | null,
  adminUserId: string,
  opts?: { studentId?: string } // for log correlation
): Promise<void>
```

**Reuse the existing query pattern** from `createWhiteboardSession` B2 block ([`actions.ts:110-129`](../../src/app/admin/students/[id]/whiteboard/actions.ts)): `consentRecord.findFirst({ where: { learnerProfileId, adminUserId }, orderBy: { version: 'desc' }, include: { learnerProfile: { select: { isSelfLearner: true } } } })`.

**`ConsentError` shape:** New permission literal or reuse a dedicated message — recommend `permission: "consentRecord"` (or extend `ConsentPermission` union) with tutor-facing copy: *"Parent privacy preferences must be set before starting a session. Ask the parent to complete claim setup or update consent from their account."*

**Log line:** `[cns] learnerProfileId=… adminUserId=… action=record_exists_check result=denied|granted|self_learner|unclaimed`

Refactor `createWhiteboardSession` B2 block to call this helper **first**, then retain the existing `allowLiveSession=false` rejection as a **second** check (orthogonal — CC-1 passes all-off records; B2 still blocks session create when live is denied).

### 3.2 Server gate — `createWhiteboardSession` (primary)

**File:** [`src/app/admin/students/[id]/whiteboard/actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts)

| Anchor | Verified line (2026-06-30, `wb-wave5-polish`) |
|---|---|
| `assertTutorApproved` | **L104** |
| B2 pre-check (load `learnerProfileId` + `ConsentRecord`) | **L106–142** |
| Blob `put` (expensive IO — gate must run before) | **L152–169** (prior mapping ~L144 drifted +8) |
| Transaction + `createSessionConsentSnapshot` | **L186–221** |

**Change (additive):**

1. After `assertTutorApproved` (L104), keep student load (L110–118).
2. **CC-1:** If `learnerProfileId` is null → `ConsentError` (unclaimed — subsumes separate "must be claimed" check).
3. **CC-1:** Call `assertConsentRecordExists(learnerProfileId, scope.adminId)` — self-learner exempt inside helper.
4. **B2 (retain):** If record exists and `!allowLiveSession` and not self-learner → existing `ConsentError` at L132–139.
5. Proceed to Blob put (L152+).

**Order invariant (unchanged):** ownership → tutor approval → consent gates → Blob → row insert.

### 3.3 Server gate — `startWhiteboardSession` (backstop)

**File:** same [`actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts)

| Anchor | Verified line |
|---|---|
| `startWhiteboardSession` body | **L263–298** |
| Current behavior | Idempotent PENDING→ACTIVE flip only; **no consent check** |

**Change (additive):** Before `updateMany` (L269), load session's `studentId` + `adminUserId` (from `assertOwnsWhiteboardSession` return or a narrow `select`), resolve `learnerProfileId`, run `assertConsentRecordExists`. Throw `ConsentError` on failure.

**Why:** Grandfathered / legacy PENDING rows created before CC-1 (or via direct DB) must not activate via Continue links or workspace Start. Backstop closes the activation path without retroactive row deletion.

### 3.4 UI affordance — disable/replace Start when no record

**Hook-point correction:** There is **no** `src/app/admin/students/[id]/whiteboard/page.tsx`. `StartWhiteboardSession` renders from:

| Surface | File | Verified line |
|---|---|---|
| Student detail sticky CTA | [`src/app/admin/students/[id]/page.tsx`](../../src/app/admin/students/[id]/page.tsx) | **L130–133** (`stickyCta`) |
| `learnerProfile` SSR load | same file | **L83–91** |
| Ended-session preview CTA | [`WorkspacePreviousSessionPreview.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WorkspacePreviousSessionPreview.tsx) | **L424** |
| Component | [`StartWhiteboardSession.tsx`](../../src/app/admin/students/[id]/whiteboard/StartWhiteboardSession.tsx) | **L20–97** |

**SSR props (student detail page):**

```typescript
// Extend existing student query (L71-102) or add parallel query:
const consentRecordExists = learnerProfileId
  ? !!(await db.consentRecord.findFirst({
      where: { learnerProfileId, adminUserId: scopedAdminUserId },
      orderBy: { version: 'desc' },
      select: { id: true },
    }))
  : false;
const isSelfLearner = student.learnerProfile?.isSelfLearner ?? false;
```

Pass to `StartWhiteboardSession`: `consentRecordExists`, `isSelfLearner`, `studentClaimed={!!student.learnerProfileId}`.

**Component behavior (server gate stays authoritative):**

| Condition | UI |
|---|---|
| Self-learner | Normal Start button |
| Claimed + record exists | Normal Start button (B2 live-denied surfaces server error on click) |
| Unclaimed OR claimed + no record | Replace Start with inline callout: parent must claim + set consent. Reuse [`ClaimInviteSection`](../../src/app/admin/students/[id]/ClaimInviteSection.tsx) pattern / cross-link Parent tab (`#parent` anchor if present). No disabled ghost button without explanation. |

Mirror props on `WorkspacePreviousSessionPreview` (needs same SSR data threaded from workspace `page.tsx` or a shared loader).

### 3.5 Error UX — `ConsentError` friendly handling

**File:** [`StartWhiteboardSession.tsx`](../../src/app/admin/students/[id]/whiteboard/StartWhiteboardSession.tsx) **L28–74**

Today: generic catch — `ConsentError` from server actions surfaces as redacted 500 in production.

**Change:** Import `ConsentError` (or detect by `name` / serialized error payload if Next strips class). Map:

| Error | User-facing copy |
|---|---|
| CC-1 no record / unclaimed | "This student's parent must claim the account and set privacy preferences before you can start a session." + link hint to Parent section |
| B2 `allowLiveSession=false` | Existing server message (L136–139) — surface verbatim |

Do **not** show digest/Error ID for expected consent denials.

---

## 4. CC-2 design — mandatory consent choice at claim setup

### 4.1 Decline action — all-off `ConsentRecord` write

**File:** [`src/app/api/claim/[token]/setup/route.ts`](../../src/app/api/claim/[token]/setup/route.ts)

| Anchor | Verified line |
|---|---|
| `action === "consent"` handler | **L83–127** |
| Versioning + `create` path | **L101–120** |

**Add:** `action === "consent_decline"` (or `action: "consent", decline: true` — prefer **separate action string** for audit clarity).

Behavior:

1. Same auth gates as `consent` (L48–62, L89–99).
2. **Self-learner:** if `learnerProfile.isSelfLearner` → `200 { ok: true, skipped: true }` (D-5 — no record required).
3. Else: `create` with all booleans `false` (`allowLiveSession`, `allowAudioRecording`, `allowWhiteboardRecording`, `allowNoteSending`).
4. Same versioning (`MAX+1`), `setByAccountHolderId`, `captureMethod: "electronic"`.
5. Log: `[cns] … action=consent_declined version=N`.

**Do not** restructure [`complete/route.ts`](../../src/app/api/claim/[token]/complete/route.ts) L85–191 — claim finalization stays atomic; consent is a **post-claim setup** obligation.

**`connect_self` path** (complete route L104–134): self-learner profiles skip mandatory consent UI and API enforcement.

### 4.2 UI — decline button + mandatory-choice gate

**ConsentSetupForm** — [`ConsentSetupForm.tsx`](../../src/app/claim/[token]/setup/ConsentSetupForm.tsx) **L32–148**

| Anchor | Verified line |
|---|---|
| Component + `enforcementEnabled` prop | **L32–40** |
| `handleSave` → `action: "consent"` | **L57–77** |
| "Save later" copy (only when `!enforcementEnabled`) | **L141–145** |

**Add:**

- Secondary button: **"No consent now, I'll review later"** — calls `consent_decline` API.
- On decline success: same `saved` success state (record written).
- **Confirmation dialog** before decline — copy from §5 (variant-aware via new prop).
- Remove L141–145 when `enforcementEnabled` (already conditional — ensure enforcement stays `true` in production).

**setup/page.tsx** — [`setup/page.tsx`](../../src/app/claim/[token]/setup/page.tsx)

| Anchor | Verified line |
|---|---|
| `existingConsent` query | **L65–74** |
| `consentAlreadySaved` gate | **L74, L105–120** |
| `enforcementEnabled={true}` | **L118** |
| Dashboard escape (credential-complete path) | **L144–149** |

**Mandatory-choice gate:**

1. `consentComplete = consentAlreadySaved` (existing).
2. When `!consentComplete` and not self-learner: **block** dashboard navigation — remove/guard all exit links until consent panel shows saved state.
3. Pass `hasPendingSessionInvite` (§4.3) into `ConsentSetupForm`.

**Skip affordance removal (enforcement on):**

| Location | Verified line | Action |
|---|---|---|
| [`CredentialSetupForm.tsx`](../../src/app/claim/[token]/setup/CredentialSetupForm.tsx) "Set up later" link | **L301–308** | Hide when `enforcementEnabled` (add prop from page) |
| [`ConsentSetupForm.tsx`](../../src/app/claim/[token]/setup/ConsentSetupForm.tsx) "save later" footnote | **L141–145** | Already gated — verify stays off |
| `setup/page.tsx` dashboard link after credentials | **L144–149** | Only render when `consentComplete` OR self-learner |

**GET `/api/claim/[token]/setup`** (L212–255): extend response with `consentSaved: boolean`, `isSelfLearner: boolean` for client consistency (optional — page SSR already queries).

### 4.3 Pending-invite detection (greenfield SSR)

**File:** [`setup/page.tsx`](../../src/app/claim/[token]/setup/page.tsx) — add query after invite load (L33–47):

```typescript
const openSessionCount = await db.whiteboardSession.count({
  where: {
    studentId: invite.studentId,
    endedAt: null,
  },
});
// Optional tighten: also require non-revoked join token exists
const hasPendingSessionInvite = openSessionCount > 0;
```

Pass `hasPendingSessionInvite` → `ConsentSetupForm` → controls §5 warning variant.

**Note:** Tutor may create a PENDING session before parent finishes setup (blocked after CC-1 ships). For parents mid-claim with a pre-CC-1 session, variant (a) still applies honestly.

### 4.4 Self-learner exemption (end-to-end)

| Surface | Behavior |
|---|---|
| `complete` `connect_self` | L104–134 — no consent setup required |
| `assertConsentRecordExists` | D-5 return early |
| `setup/page.tsx` | Skip consent panel OR show informational-only; `consentComplete` auto-true |
| Decline/save API | No-op success for self-learner |

---

## 5. Warning copy — DRAFT variants (Andrew approval required)

Honest, no dark patterns. Shown in **confirmation dialog** on "No consent now, I'll review later" click, before API call.

### Variant (a) — active session invite pending (`hasPendingSessionInvite === true`)

> **Are you sure?** If you continue without enabling any options, your child **will not be able to join** the live tutoring session they've already been invited to. You can change these preferences later from your account dashboard.

**Renders:** `ConsentSetupForm` decline confirmation when `hasPendingSessionInvite` prop is true ([`setup/page.tsx`](../../src/app/claim/[token]/setup/page.tsx) SSR).

### Variant (b) — plain claim (no open session)

> **Are you sure?** Until you set preferences, your child **cannot participate in live tutoring sessions** with this tutor. You can update preferences any time from your account dashboard.

**Renders:** `ConsentSetupForm` decline confirmation when `hasPendingSessionInvite` is false.

### Copy principles

- State consequence plainly; offer dashboard update path (true — parent consent editor exists).
- No pre-checked toggles, no hidden default-on, no disabling the decline button.
- Primary "Save preferences" remains neutral — no guilt copy on the save path.

---

## 6. Commit sequencing (small, reviewable)

Schema-free — no Prisma migration.

| # | Scope | Files (indicative) |
|---|---|---|
| 1 | `assertConsentRecordExists` + unit tests | `consent-scope.ts`, `consent-cc1.test.ts` (new) |
| 2 | CC-1 server: `createWhiteboardSession` gate | `whiteboard/actions.ts`, extend `createWhiteboardSession.test.ts` |
| 3 | CC-1 server: `startWhiteboardSession` backstop | `whiteboard/actions.ts`, `startWhiteboardSession.test.ts` |
| 4 | CC-1 UI: SSR props + `StartWhiteboardSession` affordance + `ConsentError` UX | `students/[id]/page.tsx`, `StartWhiteboardSession.tsx`, `WorkspacePreviousSessionPreview.tsx` |
| 5 | CC-2 API: `consent_decline` action | `api/claim/[token]/setup/route.ts`, API test |
| 6 | CC-2 UI: decline button, dialog, mandatory gate, skip removal | `ConsentSetupForm.tsx`, `setup/page.tsx`, `CredentialSetupForm.tsx` |
| 7 | Integration tests + doc touch | `identity/consent-b2.test.ts` or new `consent-cc2.test.ts` |

Each commit should pass `npx jest` for touched suites. **No `npm run test:wb-sync`** — this work does not touch `src/lib/whiteboard/` apply-path or sync components (see §7).

---

## 7. Test plan

### Negative paths (Phase-1 acceptance)

| # | Scenario | Expected | Suite |
|---|---|---|---|
| T1 | `createWhiteboardSession` — claimed minor, **no** `ConsentRecord` | `ConsentError`; no Blob put; no row | `createWhiteboardSession.test.ts` |
| T2 | `createWhiteboardSession` — **unclaimed** (`learnerProfileId` null) | `ConsentError` (CC-1 subsumes) | same |
| T3 | `createWhiteboardSession` — all-off record exists | **Creates** session; snapshot `allowLiveSession=false` | `consent-b2.test.ts` / create test |
| T4 | `startWhiteboardSession` — legacy PENDING row, claimed, no record | `ConsentError`; phase stays PENDING | `startWhiteboardSession.test.ts` |
| T5 | `consent_decline` API | Writes all-off `ConsentRecord` v1 | new API test |
| T6 | All-off record → student join attempt | Join gate denies ([`join/.../page.tsx:228`](../../src/app/join/[sessionId]/page.tsx)) | `identity/consent-b2.test.ts` or join route test |
| T7 | `connect_self` claim → setup | Consent panel skipped / auto-complete | `identity-p2a.test.ts` extend |
| T8 | Enforcement on — credential "Set up later" + dashboard links | Not rendered until consent saved | `ConsentSetupForm.dom.test.tsx` extend |
| T9 | Self-learner `createWhiteboardSession` | Passes without record | create test |
| T10 | `StartWhiteboardSession` UI — no record | Start replaced with claim callout (dom) | new/extend dom test |

### wb-sync relevance

**None.** CC-1/CC-2 touch consent gates, claim setup, and tutor student-detail UI — not whiteboard sync apply-path. **Jest-only** merge gate for this work. Run `npm run test:wb-sync` only at the broader Part 1+2 checkpoint per orchestrator state, not per CC commit.

### Build gate

Touched app routes + client components → **`npx next build`** before branch merge to master (build-surface convention).

---

## 8. 5-axis adversarial reliability review (Phase-1 acceptance)

Per [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §6. Every **BLOCKER** below is Phase-1 acceptance — not a follow-up.

### Axis 1 — Data durability

| Risk | Severity | CC-1/CC-2 mitigation | Acceptance test |
|---|---|---|---|
| Session row created without consent record (legal gap) | **BLOCKER** | CC-1 gate before Blob + row insert | T1, T3 |
| Snapshot skipped when record missing | **BLOCKER** | CC-1 makes record mandatory for claimed minors → snapshot always created | T3 asserts `consentRecordId` non-null |
| Decline path fails mid-write | HIGH | Single `create` — no multi-step; use existing DB retry | API test with mocked DB failure |

### Axis 2 — Recovery / fail-safe

| Risk | Severity | Mitigation | Acceptance test |
|---|---|---|---|
| Consent denial wedges tutor (can't end stale session) | MEDIUM | CC-1 blocks **create/start**, not `endWhiteboardSession` / `endStaleWhiteboardSession` | Manual: end-open-session still works |
| Parent stuck on setup page (network fail on decline) | MEDIUM | Error surface + retry; no navigation on failure | DOM test |
| Grandfathered PENDING sessions | MEDIUM | `startWhiteboardSession` backstop (T4); cleanup via test-account reset + claim-before-cutover | T4 + pilot playbook |

### Axis 3 — Concurrency

| Race | Severity | Mitigation | Acceptance test |
|---|---|---|---|
| Claim completes → tutor creates session before parent saves consent | **BLOCKER** | CC-1 record-exists gate closes window (claim can finish without consent, but create blocked) | Integration: complete without setup → create fails |
| Double-click decline creates two versions | LOW | Acceptable (v1 + v2 both all-off); monotonic version | API idempotency optional — not required V1 |
| Concurrent `consent` + `consent_decline` | LOW | Both append version; last wins for "latest" | Document; no merge logic needed |

### Axis 4 — Auth / ownership boundaries

| Boundary | Risk if broken | Mitigation | Acceptance test |
|---|---|---|---|
| Tutor A creates session for student with consent record for tutor B only | Cross-tenant consent bypass | Gate keys `(learnerProfileId, scope.adminId)` from session owner | T1 with wrong adminUserId mock |
| Decline API without AH session | Unauthorized write | Existing L28–31, L48–54 gates | 401/403 test |
| `setByAccountHolderId` ≠ profile owner | Forged consent | Existing L97–99 check | Retain |
| Self-learner exempt only when `isSelfLearner=true` | COPPA bypass | DB flag from `connect_self` only | T7, T9 |

### Axis 5 — Observability

| Requirement | Implementation |
|---|---|
| CC-1 denial grepable | `[cns] … action=record_exists_check result=denied` + `[createWhiteboardSession] … REJECTED: no_consent_record` |
| CC-1 start backstop | `[startWhiteboardSession] … REJECTED: no_consent_record` |
| CC-2 decline | `[cns] … action=consent_declined version=N` |
| No silent fallback | Remove/implement: `createSessionConsentSnapshot` `reason=no_record` should become unreachable for claimed minors post-CC-2 |

---

## 9. Open items for Andrew

| # | Item | Notes |
|---|---|---|
| O1 | **Warning copy approval** | §5 variants (a) and (b) — wording, tone, confirm dialog vs inline |
| O2 | **Grandfathered-row cleanup policy** | Covered by: (1) `startWhiteboardSession` backstop, (2) planned test-account Neon reset, (3) claim-before-cutover pilot playbook. **No mass DB migration required** — confirm acceptable |
| O3 | **Unclaimed students** | CC-1 blocks session create entirely when `learnerProfileId` null. Confirm tutors see claim CTA only (no "start then invite" flow for unclaimed) |
| O4 | **Pre-CC-1 open PENDING sessions** | After deploy, Continue works but Start/active transition blocked until parent completes consent — tutor must end stale room or parent completes setup |
| O5 | **`ConsentPermission` union** | Approve `"consentRecord"` literal vs reusing `"allowLiveSession"` for existence errors |

---

## 10. Fragile-surface note

**Load-bearing paths — additive changes only:**

| Surface | Risk | Discipline |
|---|---|---|
| [`complete/route.ts`](../../src/app/api/claim/[token]/complete/route.ts) L85–191 | Claim race / atomicity | **Do not** add consent writes to transaction; CC-2 is post-claim setup only |
| [`createWhiteboardSession`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | Recorder lifecycle entry | Gate only before Blob; do not reorder transaction snapshot logic |
| [`startWhiteboardSession`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | Session phase FSM | Add pre-check only; preserve idempotent `updateMany` |
| [`consent-scope.ts`](../../src/lib/consent-scope.ts) `createSessionConsentSnapshot` | Legal freeze | No behavior change — CC-2 ensures inputs exist |
| Join gate [`join/[sessionId]/page.tsx`](../../src/app/join/[sessionId]/page.tsx) L219–246 | Student admission | **No change** — relies on CC-1/CC-2 synergy |

**Existing logic that must change (minimal):**

- `createWhiteboardSession` B2 block: currently **allows** create when `learnerProfileId` set but **no record** (only checks `allowLiveSession` when record exists). CC-1 adds the missing existence check.
- `assertEffectiveConsent` fast-path "no snapshot → pass" (L93–97) remains for **pre-CC-1 historical sessions**; new sessions always have snapshots after CC-1+CC-2.

**Escalation tripwire:** If implementation discovers claim-completion must move consent into the transaction, **STOP** — escalate to Sonnet/Opus; Andrew explicitly rejected transaction restructure.

---

## Hook-point line drift log (verified 2026-06-30)

| Prior mapping | Actual (`wb-wave5-polish`) |
|---|---|
| `whiteboard/page.tsx` ~L130–133 | **`students/[id]/page.tsx` L130–133** — no `whiteboard/page.tsx` |
| Blob put ~L144 | **L152** |
| `setup/page.tsx` skip L145–148 | **CredentialSetupForm L301–308** ("Set up later"); dashboard link `setup/page.tsx` L144–149 (post-credential, not consent skip) |
| `StartWhiteboardSession` ~L36–64 | **L28–74** (expanded catch block) |
| All other cited anchors | **Match** (actions B2 L106–142, start L263–298, setup consent API L83–127, schema, join gate L219–246, complete L85–191 / connect_self L104–134) |
