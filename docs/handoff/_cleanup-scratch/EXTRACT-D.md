# BATCH D extraction — consent / COPPA / privacy / erasure handoff docs

> **Worktree:** `tutoring-notes-merge-audio` · branch `chore/doc-cleanup-master`  
> **Generated:** 2026-07-09  
> **Sources (16):** `consent-gates-capture-design-2026-05-31.md`, `session-lifecycle-consent-design-2026-05-31.md`, `b2-consent-design-2026-06-11.md`, `b2-consent-smokebook-2026-06-11.md`, `cc1-cc2-consent-gate-plan.md`, `cc1-cc2-consent-gate-smokebook.md`, `consent-blocker-5axis-review-2026-06-30.md`, `consent-honesty-safe-erasure-plan.md`, `consent-honesty-premerge-smoke-index.md`, `consent-honesty-smoke-findings-2026-07-01.md`, `coppa-compliance-research-2026-05-31.md`, `coppa-p2-data-encryption-spike-2026-06-11.md`, `wb-block-b-consent-gate-plan.md`, `wb-block-b-consent-gate-smokebook-2026-06-30.md`, `erasure-smokebook.md`, `learner-erasure-plan.md`

---

## CARRY table (OPEN → carry forward)

| Item | Area | Priority | Evidence | Source doc |
|------|------|----------|----------|------------|
| **Phase 3 mid-session learner swap** | Consent / session lifecycle | **P2** | No `activeSwapId` on `WhiteboardSession`; no swap server action in `src/`. Design only in `session-lifecycle-consent-design-2026-05-31.md` §3. | `session-lifecycle-consent-design-2026-05-31.md` |
| **`allowEducationalUse` toggle + enforcement** | Consent schema / legal | **P2** | Not in `prisma/schema.prisma`; BACKLOG **BL-B**. Spine-locked in lifecycle design §4.2. | `session-lifecycle-consent-design-2026-05-31.md`, `coppa-compliance-research-2026-05-31.md` Q6 |
| **`allowWhiteboardRecording` real enforcement** | Consent honesty | **P1** | Toggle hidden (`ParentConsentEditor.tsx`, `ConsentSetupForm.tsx`); field frozen `false` on snapshots. BACKLOG **WB-CONSENT-UNCONDITIONAL** + **L-3** schema debt. D-1: gates parent replay access only — not wired. | `b2-consent-design-2026-06-11.md` D-1, `wb-block-b-consent-gate-plan.md` §6 |
| **INTERIM MASTER GATE (`captureAttestationAt`)** | Consent bridge | **P3** | Design §6 specifies column + modal; **no** `captureAttestationAt` / `recordCaptureAttestation` in repo (`grep` zero prod hits). Superseded by CC-1/CC-2 + Block B for Sarah path. | `consent-gates-capture-design-2026-05-31.md` §6 |
| **Orphaned IDB audio admin re-register path** | Consent edge case | **P3** | Q-CGC-4: post-consent admin path for browser-preserved audio — explicitly post-Phase-3 defer. | `consent-gates-capture-design-2026-05-31.md` §9 Q-CGC-4 |
| **Mid-session consent-change soft poll / banner** | Consent UX | **P3** | Q-CGC-5: defer unless Sarah asks. | `consent-gates-capture-design-2026-05-31.md`, `session-lifecycle-consent-design-2026-05-31.md` §5 Q-CGC-5 |
| **Sarah test-student audit + TEST purge** | COPPA migration | **P1** | §4.3: REAL vs TEST categorization before V1; no product workflow — operator action. | `consent-gates-capture-design-2026-05-31.md` §4.3 |
| **90-day unclaimed-real-student sunset** | COPPA migration | **P2** | Proposed §4.4 / Q-CGC-3 — not implemented (no cron/notifications). | `consent-gates-capture-design-2026-05-31.md`, `session-lifecycle-consent-design-2026-05-31.md` §5 |
| **Essentials-vs-optional tier ratification** | Legal / product | **P1** | §4.1 marked **PROPOSED — awaiting Andrew ratification**; not encoded beyond current four toggles. | `session-lifecycle-consent-design-2026-05-31.md` §4.1 |
| **H-1 canvas carry-forward on swap; H-2 solo swap** | Product decision | **P3** | Open questions §9 — blocks swap UX if built. | `session-lifecycle-consent-design-2026-05-31.md` §9 |
| **Parent self-service erasure (non-admin)** | Erasure / COPPA §312.6 | **P1** | Plan §3.1 `requestLearnerErasureAction` / `requestFamilyErasureAction` — **not** in `src/` (only `requestErasureByAdminAction` + `/admin/erasure`). Privacy copy: contact email for deletion (`privacy/page.tsx` ~248). | `learner-erasure-plan.md` §3.1, `coppa-compliance-research-2026-05-31.md` Q1/Q5 |
| **Erasure: parent/account-holder self-serve UI + CRITICAL_ACTION** | Erasure | **P1** | Learner-erasure plan §3.1 UX; admin-only shipped (`ErasureAdminClient.tsx`). Open item §8.1. | `learner-erasure-plan.md` |
| **Erasure operator lookup UX (family display name / UUID)** | Erasure admin | **P2** | MB-2 smoke: wrong identifiers; BACKLOG **CH-SMOKE-DQ-ERASURE-ACCOUNT-LOOKUP**. | `consent-honesty-smoke-findings-2026-07-01.md` MB-2, `erasure-smokebook.md` #5 |
| **Erasure 2FA step-up on Request erasure** | Erasure security | **P2** | BACKLOG **CH-SMOKE-DQ-ERASURE-2FA**; design Q only. | `consent-honesty-smoke-findings-2026-07-01.md` DQ-2 |
| **Non-technical tombstone/grace copy (parent + operator)** | Legal honesty | **P1** | ER-6 drafted in safe-erasure plan; BACKLOG **CH-SMOKE-DQ-ERASURE-COPY-JARGON**. Admin UI still uses technical terms in places. | `consent-honesty-safe-erasure-plan.md` ER-6 |
| **Tutor notification when learner erased** | Erasure product | **P3** | Open item `learner-erasure-plan.md` §8.3. | `learner-erasure-plan.md` |
| **`createChildLearnerAction` — no ConsentRecord at create** | Consent collection | **P1** | `src/app/account/dashboard/actions.ts:29-36` creates `LearnerProfile` only; consent is separate visit to `/account/children/[id]/consent`. CC-1 blocks **tutor session** once linked, but parent-created learner can exist with zero `ConsentRecord` until parent saves. | `wb-block-b-consent-gate-plan.md` §7a hole (2) |
| **`assertEffectiveConsent` legacy `no_snapshot → pass`** | Consent defense | **P2** | `consent-scope.ts:95-99` still returns void when no snapshot (pre-CC-1 sessions). M-6: end-path fail-closed for claimed learners — verify all segment paths. | `consent-blocker-5axis-review-2026-06-30.md` M-6 |
| **`allowMessaging` / `allowVideoRecording` consent when features ship** | Consent surface | **P3** | `NOT_SHIPPING_PERMISSIONS` in `consent-scope.ts:52-55`; B2 design §2 "Not built". | `b2-consent-design-2026-06-11.md` |
| **Child-facing `ConsentRestriction` UI** | Consent | **P3** | D-2: schema built, all defaults false, no child UI. | `b2-consent-design-2026-06-11.md` D-2 |
| **BL-A — tutor-visible per-student consent projection** | Consent UX | **P2** | BACKLOG `## Identity/access` **BL-A**; tutor sees callout on missing record (`StartWhiteboardSession.tsx`) but not full consent state chip. | `b2-consent-design-2026-06-11.md` Step 6 deferred tutor display |
| **CONSENT-UX-REDESIGN / save-on-toggle** | Consent UX | **P3** | BACKLOG **CONSENT-UX-REDESIGN**, **CH-SMOKE-SETTINGS-SAVE-ON-TOGGLE** (findings C-3). | `consent-honesty-smoke-findings-2026-07-01.md` |
| **Multi-student live consent stacking** | Consent design | **P3** | BACKLOG **CH-SMOKE-DQ-MULTI-STUDENT-LIVE**; no product model. | `consent-honesty-smoke-findings-2026-07-01.md` DQ-5 |
| **Live tutor consent-satisfied ajax callout** | Consent UX | **P3** | BACKLOG **CH-SMOKE-DQ-CONSENT-CALLOUT-LIVE**. | `consent-honesty-smoke-findings-2026-07-01.md` DQ-6 |
| **COPPA counsel: VPC method, OpenAI processor vs third party, retention timeframe** | Legal | **P1** | Research Part 5 questions 1–3, 6; BACKLOG **CONSENT-LEGAL-CONSULT**. `/privacy` interim honest ("schedules may be introduced") @ `privacy/page.tsx:262-268` — no fixed months. | `coppa-compliance-research-2026-05-31.md` |
| **Umbrella + product privacy retention policy (§312.10)** | Legal honesty | **P1** | COPPA brief Part 4 checklist — partial SEC-POLICY-TRUTH in product `/privacy`; mortensenapps sync per **LEGAL-SYNC**. | `coppa-compliance-research-2026-05-31.md` Part 4 |
| **At-rest envelope encryption (app-managed, not ZK)** | Security / trust | **P3** | Spike verdict: not COPPA-mandated; BACKLOG `### At-rest envelope encryption` deferred pre-extended-pilot. | `coppa-p2-data-encryption-spike-2026-06-11.md` §5 |
| **Erasure inventory gaps (orphan audio, client IDB, in-flight checkpoint)** | Erasure reliability | **P2** | BACKLOG **ERASURE-ORPHAN-AUDIO-BLOBS**, **ERASURE-CLIENT-STORE-UNREACHABLE**, **ERASURE-INFLIGHT-CHECKPOINT**; 5axis H-2, H-3, M-5. | `consent-blocker-5axis-review-2026-06-30.md`, `learner-erasure-plan.md` |
| **`WhiteboardAsset` table / enumeration checkpoint at scale** | Erasure perf | **P3** | H-3: events.json parse timeout risk for large families. | `consent-blocker-5axis-review-2026-06-30.md` H-3 |
| **PLAYWRIGHT-GAP — CC-1 tutor session-create gates (e2e)** | Test debt | **P1** | Jest: `createWhiteboardSession.test.ts` T1/T2; **no** Playwright for tutor Start blocked without record. BACKLOG **CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE**. | `consent-honesty-smoke-findings-2026-07-01.md` §E |
| **PLAYWRIGHT-GAP — remote-surgical mixdown hardware oracle** | Test / consent | **P1** | Block B smokebook item 3: jsdom cannot prove student absent from mixdown while heard live. | `wb-block-b-consent-gate-smokebook-2026-06-30.md` item 3 |
| **MB-5 verify — tutor_only notes path on clean session** | Notes / consent | **P2** | Smoke PARTIAL 2026-07-01; may be impersonation race (CF-4). Jest: `triggerNotesGeneration-consent.test.ts` — notes not gated on `allowNoteSending`. Re-verify hardware without impersonation. | `consent-honesty-smoke-findings-2026-07-01.md` MB-5, `consent-honesty-safe-erasure-plan.md` CF-4 |
| **CH-SMOKE UX bugs (mic persist, interstitial, no-notes copy, light contrast, etc.)** | UX | **P2–P3** | BACKLOG `## Consent-honesty pre-merge smoke follow-ups` rows **CH-SMOKE-***. | `consent-honesty-smoke-findings-2026-07-01.md` §B/C |
| **PARENT-INITIATED-TUTOR-REQUEST** | Consent / onboarding | **P3** | BACKLOG post-Sarah. | `b2-consent-design-2026-06-11.md` Step 6 |
| **Q-CGC-1/2 naming decisions (self-learner audit column, `allowNoteSending` rename)** | Consent design debt | **P3** | Partially resolved: self-learner via `isSelfLearner` pass (`consent-scope.ts:115-118`); `selfLearnerConsent` column from lifecycle design **not** in schema. | `consent-gates-capture-design-2026-05-31.md` §9, `session-lifecycle-consent-design-2026-05-31.md` §5 |

---

## Already-in-backlog list

Items from these docs that are **tracked** in `docs/BACKLOG.md` (do not re-file):

| BACKLOG ID / section | What it covers | Source doc overlap |
|---------------------|----------------|-------------------|
| **CLIENT-AUDIO-CONSENT-GATE** | Block B client + server audio gates, 7a fail-closed | `wb-block-b-consent-gate-plan.md` — **largely shipped**; backlog row may need status refresh |
| **CONSENT-COLLECTION-COMPLETENESS** | CC-1 + CC-2 Sarah blocker | `cc1-cc2-consent-gate-plan.md` — **largely shipped** |
| **CONSENT-HONESTY-SARAH-MERGE-BLOCKER** | Hide dead toggles + honest copy | `wb-block-b-consent-gate-plan.md` §6 — **largely shipped** (`consent-toggle-copy.ts`) |
| **LIVE-SESSION-CONSENT-COPY** | Honest `allowLiveSession` copy | Block B commit 5b / `consent-toggle-copy.ts` |
| **WB-CONSENT-UNCONDITIONAL** | WB recording not separately gated | `b2-consent-design-2026-06-11.md` D-1 |
| **WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME** | `allowNoteSending` not a privacy gate for email | `b2-consent-design-2026-06-11.md` D-7 vs reframe |
| **CONSENT-LEGAL-CONSULT** | Counsel on VPC, WB capture, transcription | `coppa-compliance-research-2026-05-31.md` Part 5 |
| **CONSENT-UX-REDESIGN**, **CONSENT-PRESENTATION-NO-TRICKS** | Guided setup / affordances | `consent-gates-capture-design` open UX |
| **BL-A**, **BL-B** | Tutor-visible consent; educational-use toggle | `session-lifecycle-consent-design-2026-05-31.md` §4.2 |
| **B2 parent consent management UI (Step 6)** | Parent per-tutor editor | `b2-consent-design-2026-06-11.md` — **partially obsolete**: `saveParentConsentAction` shipped (`account/children/[id]/consent/actions.ts`); backlog row may mean tutor-linked per-tutor cards |
| **PARENT-INITIATED-TUTOR-REQUEST** | Pre-find tutor + consent | `b2-consent-design` defer |
| **## Consent-honesty pre-merge smoke follow-ups** | All **CH-SMOKE-*** rows | `consent-honesty-smoke-findings-2026-07-01.md` §B/C/D |
| **CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE** | E2e for CC-1/CC-2 + erasure admin | `consent-honesty-smoke-findings-2026-07-01.md` §E |
| **ERASURE-ORPHAN-AUDIO-BLOBS**, **ERASURE-CLIENT-STORE-UNREACHABLE**, **ERASURE-INFLIGHT-CHECKPOINT**, **ERASURE-ADMIN-METADATA** | Erasure coverage gaps | `learner-erasure-plan.md`, 5axis review |
| **At-rest envelope encryption** (`## … hybrid, app-managed`) | Optional hardening | `coppa-p2-data-encryption-spike-2026-06-11.md` |
| **WB-INPERSON-AUDIO-SUBTOGGLE** | Future in-person sub-toggle | `wb-block-b-consent-gate-plan.md` §7b |

---

## Shipped / obsolete list

| Item | Evidence (src / tests) | Source doc |
|------|------------------------|------------|
| **B2 schema: `ConsentRecord`, `ConsentRestriction`, `SessionConsentSnapshot`** | `prisma/schema.prisma` ~1069–1128; migration `20260611010000_b2_consent_schema` | `b2-consent-design-2026-06-11.md` |
| **`CONSENT_ENFORCEMENT` flag removed — enforcement unconditional for gates that shipped** | `consent-scope.ts:4-6` header; tests `consent-b2.test.ts` "flag removed" | `b2-consent-smokebook-2026-06-11.md` (obsolete flag-OFF smoke) |
| **CC-1 `assertConsentRecordExists` on create / start / issueJoinToken** | `consent-scope.ts:377+`; `whiteboard/actions.ts:156,326,506` | `cc1-cc2-consent-gate-plan.md` |
| **CC-2 mandatory consent + `consent_decline` all-off record** | `api/claim/.../setup/route.ts:144+`; `ConsentSetupForm.tsx`; tests `claim-setup-consent-decline.test.ts`, `ConsentSetupForm.dom.test.tsx` | `cc1-cc2-consent-gate-plan.md` |
| **Block B `audio-capture-policy` + client gates + banners** | `src/lib/recording/audio-capture-policy.ts`; `WhiteboardWorkspaceClient.tsx` policy wiring; `wb-audio-consent-banner` | `wb-block-b-consent-gate-plan.md` |
| **Mode-aware server audio (`LIVE` tutor_only vs `IN_PERSON` none)** | `consent-scope.ts` mode-aware helpers; `consent-mode-aware-server.test.ts` | 5axis **B-5, B-6, H-6** |
| **Join gate: claimed minor + no snapshot denied** | `join-session-consent-gate.test.tsx`; wb-session-lifecycle consent-denied seed | 5axis **H-5** |
| **Honest consent toggle copy + hidden `allowWhiteboardRecording`** | `consent-toggle-copy.ts`; `ParentConsentEditor.tsx`; `ConsentSetupForm.tsx` | `wb-block-b-consent-gate-plan.md` §6 |
| **Parent consent editor save (B2 Step 6)** | `saveParentConsentAction` in `account/children/[id]/consent/actions.ts`; Playwright `consent-save.spec.ts` | `b2-consent-design-2026-06-11.md` §9 defer |
| **CF-2 / MB-4: replay strokes decoupled from audio policy** | `WhiteboardWorkspaceClient.tsx:2568-2574` `wbEventsActive` / `wbCaptureActive` | `consent-honesty-safe-erasure-plan.md` CF-2 |
| **CF-3 / MB-6: learner `/` routes to `/join`** | `src/app/page.tsx:29` `redirect("/join")` | safe-erasure CF-3 |
| **Erasure admin UI + `ErasureJob` FSM** | `src/lib/erasure/*`, `/admin/erasure`; tests `request-erasure-by-admin.test.ts`, `process-erasure-job.test.ts` | `learner-erasure-plan.md` |
| **Reversible tombstone Option A (`LearnerCredential.disabled`, cancel-restore)** | `tombstone.ts:211,284`; `process-erasure-job.ts:345+` `cancelErasureJob`; `erasure.spec.ts` cancel test | `consent-honesty-safe-erasure-plan.md` ER-2/ER-5 (supersedes grace **read-access**) |
| **Erasure guards: suspend tutor access during grace** | `assertStudentNotErased`; `erasure-tutor-gate.spec.ts`; `StartWhiteboardSession.tsx` pending-erasure copy | ER-3 / MB-3 / MB-10 — **reverses** old grace read-access |
| **`Student.erasedAt` + post-purge content 404** | `schema.prisma:134`; `erasure-post-grace-purge.spec.ts` | 5axis **M-4** |
| **5axis blockers B-1–B-4, B-7, B-8 (consent + erasure ordering)** | Jest/integration suites named in plans | `consent-blocker-5axis-review-2026-06-30.md` |
| **Playwright (partial): claim CC-1/CC-2 persistence** | `tests/integration/identity/consent-save.spec.ts` | `cc1-cc2-consent-gate-smokebook.md` |
| **Playwright: erasure admin request + cancel-restore** | `tests/integration/identity/erasure.spec.ts` | `erasure-smokebook.md` #7 |
| **Playwright: tutor gate during erasure grace** | `tests/integration/erasure-tutor-gate.spec.ts` | `erasure-smokebook.md` #10 (semantics **inverted** from doc) |
| **COPPA spike conclusion: operator-blind storage NOT required** | Research doc §2.7, §5 — captured in BACKLOG encryption deferral | `coppa-p2-data-encryption-spike-2026-06-11.md` |

---

## Legal-honesty flags (docs that over-claim or contradict shipped behavior)

| Doc / surface | False or stale claim | Actual behavior (evidence) | Action |
|---------------|---------------------|----------------------------|--------|
| **`consent-honesty-premerge-smoke-index.md` § "Design nuance"** | "During 7-day grace, tutor **retains read-access**" | **REVERSED** Andrew 2026-07-01; ER-3 suspends all access. `erasure-tutor-gate.spec.ts`; tutor sees "pending erasure" not content. | **FLAG — do not archive without strikethrough note** |
| **`erasure-smokebook.md` header + item #10** | "Tutors retain read-access during grace"; item #10 expects tutor **can** read during grace | Same reversal; item #10 marked FAIL in findings because tutor **should not** read/start sessions. | **FLAG — obsolete smoke semantics** |
| **`learner-erasure-plan.md` §2.4 / §4.1 fail-closed** | Implies tutor content readable during grace (`Student.erasedAt` null) | Superseded by `consent-honesty-safe-erasure-plan.md`; access suspended via tombstone + `assertStudentNotErased` | **FLAG — archive only with "superseded by Option A" banner** |
| **`erasure-smokebook.md` item #7** | "Tombstone **remains** (Option A — no un-tombstone)" on cancel | `cancelErasureJob` clears `tombstonedAt`, re-enables credential (`process-erasure-job.ts:404-420`); `erasure.spec.ts` cancel test | **FLAG — copy wrong post ER-5** |
| **`b2-consent-smokebook-2026-06-11.md`** | Entire smoke assumes `CONSENT_ENFORCEMENT` default OFF | Flag removed; enforcement always on for shipped gates (`consent-scope.ts:4-6`) | **FLAG — historical pilot only** |
| **`prisma/schema.prisma` comment ~1156** | "Enforcement dormant until CONSENT_ENFORCEMENT=true" | Contradicts `consent-scope.ts` unconditional enforcement | **FLAG — schema comment stale** |
| **`consent-gates-capture-design-2026-05-31.md` §6** | INTERIM MASTER GATE implementable now on master | Never built — no `captureAttestationAt` | **FLAG — design-only; not a shipped capability** |
| **`session-lifecycle-consent-design-2026-05-31.md` §4.1** | Essentials tier listed as ratified | Marked **PROPOSED — awaiting Andrew ratification** in same doc | **FLAG — do not cite as ratified product policy** |
| **`b2-consent-design-2026-06-11.md` D-7** | `sendUpdateEmail` hard-blocks without `allowNoteSending` | BACKLOG **WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME**: manual tutor email **ungated** (interim honest decision) | **FLAG — design doc contradicts BACKLOG/product** |
| **`src/app/privacy/page.tsx`** | "Automated retention schedules **may be introduced**" | Honest interim per SEC-POLICY-TRUTH (2026-07-09) — OK on preview; **must not** claim fixed retention clock on `master` until implemented | **Monitor for master cut** (AGENTS.md legal-honesty rule) |

---

## Per-doc archive-note table

| Doc | Safe to archive? | Unique info that must survive + where |
|-----|------------------|--------------------------------------|
| `consent-gates-capture-design-2026-05-31.md` | **Yes** (with honesty flags) | Three-layer enforcement model; Pillar-3 split session-close vs audio-register; preserve-don't-delete migration posture → `docs/RECORDER-LIFECYCLE.md` + BACKLOG COPPA migration items | 
| `session-lifecycle-consent-design-2026-05-31.md` | **Yes** (partial) | Mid-session swap design + tiered consent **PROPOSED** table → keep open decisions in BACKLOG **BL-B** / swap epic; Q-CGC resolutions → shipped code paths | 
| `b2-consent-design-2026-06-11.md` | **Yes** | D-1/D-5 semantics (WB replay vs upload; self-learner pass) → `consent-scope.ts` comments + BACKLOG WB-CONSENT-UNCONDITIONAL | 
| `b2-consent-smokebook-2026-06-11.md` | **Yes** | Flag-OFF smoke obsolete; D-1/D-5 verification table → superseded by Block B/CC tests | 
| `cc1-cc2-consent-gate-plan.md` | **Yes** | CC-1/CC-2 acceptance tests map → `consent-cc1.test.ts`, `createWhiteboardSession.test.ts`, `claim-setup-consent-decline.test.ts` | 
| `cc1-cc2-consent-gate-smokebook.md` | **Yes** | Andrew skip rationale → BACKLOG **CH-SMOKE-PLAYWRIGHT-GAP**; no unique product spec | 
| `consent-blocker-5axis-review-2026-06-30.md` | **Yes** | Blocker IDs B/H/M/L → verify against test files; residual M/H erasure items → BACKLOG ERASURE-* | 
| `consent-honesty-safe-erasure-plan.md` | **No** (active until merge verified) | Option A tombstone + 9 BLOCKERs A–I + workstream sequencing — still executor contract for erasure fixes | 
| `consent-honesty-premerge-smoke-index.md` | **Yes** (fix grace note first) | Run order only; **delete/reverse grace read-access nuance** before archive | 
| `consent-honesty-smoke-findings-2026-07-01.md` | **Yes** | MB/MB-* triage → BACKLOG CH-SMOKE-* + safe-erasure workstreams; keep as audit trail | 
| `coppa-compliance-research-2026-05-31.md` | **Yes** (counsel pack) | Part 4 checklist + Part 5 lawyer questions → `docs/LEGAL-SYNC.md` + **CONSENT-LEGAL-CONSULT** | 
| `coppa-p2-data-encryption-spike-2026-06-11.md` | **Yes** | "No ZK mandate" verdict → BACKLOG at-rest encryption section | 
| `wb-block-b-consent-gate-plan.md` | **Yes** | Hook-point matrix + `audio-capture-policy` derivation → `audio-capture-policy.ts` + tests | 
| `wb-block-b-consent-gate-smokebook-2026-06-30.md` | **Yes** | Hardware oracle notes (item 3 mixdown) → PLAYWRIGHT-GAP below; Andrew notes → CH-SMOKE-* | 
| `erasure-smokebook.md` | **Yes** (rewrite grace items) | Admin erasure smoke steps → Playwright `erasure*.spec.ts`; **item #7/#10 semantics stale** | 
| `learner-erasure-plan.md` | **Yes** (superseded semantics) | DELETE/SCRUB vs PRESERVE tables still valid; grace read-access **wrong** — pointer to safe-erasure plan | 

---

## PLAYWRIGHT-GAP matrix

From `consent-honesty-smoke-findings-2026-07-01.md` §E + Block B smokebook. Status as of `chore/doc-cleanup-master` tip.

| # | Surface | Andrew smoke / plan item | Automated coverage | Gap status |
|---|---------|--------------------------|-------------------|------------|
| **CC-1** | Tutor: no `ConsentRecord` blocks session create | CC smokebook #1 | Jest `createWhiteboardSession.test.ts` T1/T-new-A | **GAP — needs Playwright tutor Start callout** |
| **CC-1** | Unclaimed learner blocks create | CC smokebook #2 | Jest T2 | **GAP — Playwright** |
| **CC-1** | Record exists → create proceeds | CC smokebook #3 | Jest positive; smoke wb paths | **Partial — Playwright happy path thin** |
| **CC-1** | `startWhiteboardSession` backstop (legacy PENDING) | CC smokebook #4 | Jest `startWhiteboardSession` tests | **GAP — Playwright** |
| **CC-2** | Mandatory consent choice (no skip) | CC smokebook #5 | `claim-setup-skip-credential.spec.ts`, `ConsentSetupForm.dom.test.tsx` | **Partial Playwright** |
| **CC-2** | Decline → all-off record | CC smokebook #6 | `consent-save.spec.ts` CC-2; API test T5 | **Shipped Playwright** |
| **CC-2** | Self-learner exempt | CC smokebook #7 | Jest `consent-cc1.test.ts` T9; claim tests | **GAP — Playwright e2e** |
| **CC-2** | Re-submit → 409 `consent_already_saved` | CC smokebook #8 | Jest H-1; `ConsentSetupForm.dom.test.tsx` | **Partial** |
| **CC-2** | All-off record + join denied | CC smokebook #9 | Jest `consent-b2.test.ts`; wb-session-lifecycle seed | **GAP — Playwright join e2e** |
| **CC-2** | Theme parity claim + parent editor | CC smokebook #10 | DOM tests partial | **GAP — human/subjective; optional CI matrix** |
| **Block B** | Consented LIVE baseline (recording + notes) | Block B #1 | Jest policy suites; smoke partial | **Human hardware for playback/notes quality** |
| **Block B** | IN_PERSON denied — no audio, strokes replay | Block B #2 | Jest IN_PERSON paths; CF-2 shipped | **Partial — replay path needs Playwright regression** |
| **Block B** | LIVE `tutor_only` mixdown isolation | Block B #3 | Jest remote helpers | **GAP — Web Audio / hardware (documented in smokebook)** |
| **Block B** | No snapshot — policy none + join denied | Block B #4 | Jest join gate; tutor UI callout | **GAP — Playwright (Andrew skipped as DB-heavy)** |
| **Block B** | Consent UI copy + hidden WB toggle | Block B #5 | DOM tests | **Mostly covered** |
| **Erasure** | Non-admin 404 `/admin/erasure` | Erasure #1 | Jest admin gate test | **GAP — Playwright** |
| **Erasure** | Confirmation phrase enforced | Erasure #2 | Jest `request-erasure-by-admin.test.ts` | **GAP — Playwright wrong-phrase UX** |
| **Erasure** | Immediate tombstone / login blocked | Erasure #4 | Jest integration; Playwright `erasure.spec.ts` | **Partial Playwright** |
| **Erasure** | Full-family erasure | Erasure #5 | Jest full-family test | **GAP — Playwright + lookup UX (MB-2)** |
| **Erasure** | Cancel during `requested` → restore | Erasure #7 | Playwright `erasure.spec.ts` + jest | **Shipped Playwright** |
| **Erasure** | Worker/cron past grace | Erasure #8 | Jest `process-erasure-job.test.ts` | **GAP — Playwright (operator CLI smoke)** |
| **Erasure** | Post-purge content 404 | Erasure #9 | `erasure-post-grace-purge.spec.ts` | **Shipped Playwright** |
| **Erasure** | Grace window tutor access | Erasure #10 | **Semantics reversed** — `erasure-tutor-gate.spec.ts` expects **no** access | **Doc GAP — smokebook wrong; test ships correct oracle** |
| **Erasure** | `[Deleted learner]` placeholder post-purge | Erasure #11 | Jest `process-erasure-job.test.ts` | **GAP — Playwright roster** |
| **Erasure** | `blob-cleanup.mjs` chunkBlobUrl | Erasure #12 | Jest inventory tests | **GAP — code-confirm only; low priority** |

**Backlog anchor:** `CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE` (`docs/BACKLOG.md` § Consent-honesty pre-merge smoke follow-ups).

---

## Merge-blocker status snapshot (from smoke findings — for archive context)

| ID | Topic | Disposition in codebase |
|----|-------|-------------------------|
| **MB-1** | Start Session silent failure | CF-1 in safe-erasure plan; impersonation warning — verify on clean smoke |
| **MB-2** | Full-family erasure ineffective | ER-1 BLOCKER I (`tombstone.ts` throws); operator UX still weak |
| **MB-3** | Tombstone not reflected; new sessions | ER-3 guards + `erasure-tutor-gate.spec.ts` — **shipped** |
| **MB-4** | IN_PERSON no replay | CF-2 **shipped** (`WhiteboardWorkspaceClient.tsx:2568+`) |
| **MB-5** | tutor_only no notes | **Open verify** — may be impersonation; notes path not consent-gated |
| **MB-6** | Student → parent page | CF-3 **shipped** (`page.tsx:29`) |

---

*End of BATCH D extraction.*
