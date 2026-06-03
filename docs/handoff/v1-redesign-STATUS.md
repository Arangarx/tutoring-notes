# V1 Redesign — Epic Status & Decisions Spine

**Date:** 2026-05-31  
**Branch:** `v1-redesign` (long-running integration branch)  
**Purpose:** Single source of truth for the multi-day V1 redesign; re-read at the top of any fresh chat so the thread survives.

### Lightweight head (orchestrator — 2026-06-02)

| Field | Value |
|---|---|
| **Last action completed** | **IAC-12** appended (Andrew's wife, 2026-06-02) — Parent/Guardian copy + conditional guardian framing (V1, round-4/IAC copy); co-guardian **FUTURE** → [`docs/BACKLOG.md`](../BACKLOG.md). Ledger IAC-1..12 in [`identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) § IAC refinements — 2026-06-02. |
| **Next action(s)** | **P2 multi-tutor + accessMode/family-id schema change + round-4 UX** build (IAC-2..IAC-12, incl. **IAC-12** copy) on `identity-p2b-ui` after Andrew finishes current P2b smoke / round-3 fixes; then Phase-3 consent models. |
| **Open Andrew-confirms** | P2b real-hardware smoke on preview (`NEXT_PUBLIC_CLAIM_INVITES_ENABLED`); ratify round-4 UX copy when implemented; test-students audit (Sarah-pending). |
| **Uncommitted / unmerged** | `identity-p2b-ui` — IAC-12 docs commit pending this pass; branch **NOT** merged to `v1-redesign`. |

---

## Decisions ledger (LOCKED)

- **Brand:** Mynka Blue palette (light done in tokens.css; dark = legacy purple, to migrate) + Fraunces V4/V2 + Inter 400 + JetBrains Mono fonts (never implemented). Light `--accent-on`=#15203A (Option A).
- **IA/URL:** session-centric; `/sessions/[wsid]`; parent share `/s/`→`/share/`; student join `/w/`→`/join/`; operator tools `/superadmin`; `/admin/` removed from tutor surface; 301 redirects; no scheduling in v1 (next-actions landing).
- **Identity model (LOCKED, Opus-designed):** 3 principals — AccountHolder (parent for minors / student for adults; email-verified; holds billing/consent/comms/2FA), LearnerProfile (child; first-class but low-privilege access principal; optional own email+login), tutor Student record links on claim. Child login = parent-provisioned username+PIN + sticky device sessions + optional child-email upgrade.
- **Consent = permission lattice:** parent sets ceiling at claim time; child narrows-only; effective = parent ∩ child; server-side enforced; versioned + frozen-effective-at-session-start; revocation stops future capture.
- **Consent model = tiered, two distinct mechanisms (LOCKED 2026-05-31, Andrew):** **(1) Essentials are NOT consent toggles — they are the *contract to use the live services*** (the minimal processing needed to deliver live tutoring; agreeing to use the service = agreeing to these; can't decline and still use it). For **minors** these still need explicit **VPC**, never a buried ToS clause. **(2) Optional/enhancement = explicit, UNCHECKED opt-in toggles** (audio recording, video recording, whiteboard-replay recording, transcripts/notes, educational-use, messaging) — decline-able without losing core service; **NO pre-checked / forced-on "you can technically opt out" patterns** (Andrew: not newsletter-style). Consent set **ONCE up-front** (claim/account setup), **lives student/account-side**, must **NOT interrupt sessions** (Sarah standout). Keep essentials TRULY minimal (data-minimization). **Exact essentials-vs-optional split → RATIFIED (Andrew 2026-05-31) AS-IS** per session-lifecycle design §4.1 and spine table below; **future note:** revisit de-bundling live-VIDEO transport from the Essential tier later (keep live-AUDIO transport essential); for V1 the live A/V bundle stays essential — Andrew.
- **CONSENT-GATES-CAPTURE (LOCKED 2026-05-31, Andrew — foundational premise catch):** capturing a learner's content — **uploading text, uploading audio, OR recording live audio** — MUST be gated on an **effective consent record** permitting that capture type. No upload/record of a minor's content without consent. The prior design's "anyone-with-link + grandfather existing" left a **dangerous bypass**: a tutor could capture minor audio with zero consent on record (a COPPA collection-without-VPC risk). **Existing data is NOT exempt** — bring it into the consent structure; preserve-don't-delete pending Sarah's keep-list. **Sequencing reality:** the gate can only be ENFORCED once the consent system ships (Phase 3); until then, current pilot capture rides Sarah's tutor-obtained relationship + the disclosure floor, and existing students get claim+consent to continue. This supersedes design-doc §7.2/§7.6 "zero forced migration / indefinite unclaimed links." **Refinements (Andrew 2026-05-31):** hard bar for K-12; applies to everyone but ADULTS self-manage their own capture consent (`isSelfLearner`). Migration path delivered **when V1 lands** (Sarah carries forward test sessions she wants past pilot). **INTERIM MASTER GATE APPROVED:** lightweight tutor attestation before text-upload / audio-upload / live-record (~"capture must be COPPA-gated; parent-side enforcement comes with V1; for now confirm you have consent for this session or it's your own test data") — recorded as a flag+log; MUST be a precondition that does NOT wedge the recorder start path (reliability bar). Design LANDED 2026-05-31 (`29c184e`) → [`docs/handoff/consent-gates-capture-design-2026-05-31.md`](consent-gates-capture-design-2026-05-31.md) (9 sections; 5-axis review w/ 3 Phase-3 BLOCKERs; `endWhiteboardSession` split so a consent failure never wedges session-close). **Interim master gate IMPLEMENTED** on branch `interim-capture-attestation` (`3807e44`, pushed, NOT merged) — `captureAttestationAt` column + migration `20260531120000_whiteboard_capture_attestation` + attestation modal + `att` prefix; gate placed before `setUserWantsRecording(true)` (FSM never arms pre-confirm); server belt on generate-notes + audio-segment-register; tsc/eslint/jest + `test:wb-sync` (511 jest + 11 Playwright) all green. **Andrew: apply migration on preview/prod DB (`prisma migrate deploy`) BEFORE smoke; then smoke → merge --no-ff to master.** **§9 design open-Qs → RESOLVED 2026-05-31** (recommend-and-proceed; **ACCEPTED by Opus** — Andrew may revisit, not blocking). Locked-pending-ratification decisions: **Q-CGC-1** self-learner = `null` `consentRecord` + `isSelfLearner` bypass; add `selfLearnerConsent Boolean` on session consent snapshot for auditability. **Q-CGC-2** `allowNoteSending`: keep DB column name; parent-facing label "Generate and share session notes and transcripts." **Q-CGC-3** unclaimed-student sunset: **90 days post-V1** (interim attestation gate stays meanwhile). **Q-CGC-4** orphaned-audio admin path: minimal admin-only endpoint, **deferred to post-Phase-3 backlog**. **Q-CGC-5** mid-session soft-poll: **deferred indefinitely** unless Sarah requests. **Q-CGC-6** `captureAttestationAt` retention: **retain permanently** as audit history. Detail: [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §5.
- **Recording retention on revocation (Q-3) — INTERIM posture LOCKED 2026-05-31, REFINED by COPPA brief (`210e4f4`):** retain existing recordings by default; **no self-serve delete button first pass**; **no "never-delete" claims**. Build an **admin-only deletion *capability*** to execute requests. COPPA brief (`docs/handoff/coppa-compliance-research-2026-05-31.md`) findings:
  - **Q-3 end-state RESOLVED to on-request** (not proactive): §312.6(a)(2) — parent directs, operator complies. No proactive deletion prompt required. Retain-by-default validated.
  - **NEW REQUIREMENT (corrects "admin-only behind the scenes"):** a parent-facing deletion-**request** path MUST be DISCLOSED (a stated contact email suffices) and described in the privacy notice. No self-serve button still OK; a totally hidden path is NOT (§312.6 "means at any time").
  - **URGENT — §312.10 amended:** the privacy notice MUST publish a **specific retention timeframe** ("retain indefinitely" PROHIBITED). Compliance deadline **2026-04-22 already passed** → umbrella privacy/terms likely **currently non-compliant**. Jumps the queue per Andrew's "compliant AT ALL TIMES."
  - **OpenAI/Whisper classification (Q-3c):** assume **service-provider (no disclosure) FOR NOW**; tagged counsel-later. Action: review OpenAI API data-retention policy (research dispatched) — if they don't retain audio → likely clear; if they retain → may become a consent-gate. School-auth + audio exceptions do NOT apply to Mynk.
- **Retention timeframe (Q-3b) LOCKED 2026-05-31:** child PII retained for **active tutor-student relationship + 24 months post-closure**; deletion-on-request honored sooner.
- **PII / business-record SEPARATION principle (LOCKED 2026-05-31, Andrew):** deletions must NOT be surgical. Permanent business/accounting/audit records (session-occurred, `billedDurationMin`, amount, audit logs) **MUST NOT directly store PII** — they reference the learner via an opaque stable key only. On honored deletion the LearnerProfile PII bucket is purged/tombstoned (records resolve to "student deleted"/"student unknown") while business records persist intact. Dovetails with billing-immutable. **PARTIALLY REALIZED in schema (2026-05-31, `identity-p2-schema` @ `e305d0b`):** tombstone columns on `AccountHolder` + `LearnerProfile` (`tombstonedAt`); `Restrict` on AccountHolder→LearnerProfile delete so PII must be tombstoned first; deletion-on-request mechanism (tombstone + redact `displayName`) is schema-supported — **enforcement logic is later.** Business/audit tables (`WhiteboardSession`, `SessionRecording`, `CostEvent`, `SessionNote`) deliberately **UNTOUCHED** — continue referencing `Student` by opaque id.
- **No phase gated on legal counsel (Andrew 2026-05-31):** do NOT block Phase 2/3 on counsel. The separation design makes BOTH legal-interpretation levels cheap to satisfy. **Disclosure floor is REQUIRED regardless** — privacy + terms must disclose exactly what we do (retention period, deletion-request path, data inventory incl. audio, OpenAI processing, educational-use) so we've notified, counsel-or-not. Counsel deferred (expensive — Andrew); open Qs Q-3c/Q-3d stay tagged for it.
- **New consent toggle (LOCKED to add):** "Parent consents to the child's sessions being used for educational purposes by the tutor" — revoke-going-forward (tutor NOTIFIED the learner is now off-limits for that use), disclosure that prior-consent releases cannot be clawed back. Folds into the consent toggle list (Sarah-pending / §10.3).
- **Auth-via-mortensenapps.com notice (LOCKED — COMMITMENT TO GOOGLE REVIEWERS, 2026-05-31):** Andrew told Google's review team the app will display **notices that Google OAuth happens through mortensenapps.com at the point where the user clicks** the Google OAuth control. Binding representation from the (passed) `usemynk.com` security review — **honored only on Google-OAuth initiation surfaces** (Connect Gmail now; Sign-in-with-Google when exposed). **Credentials auth is usemynk.com** — do NOT show this notice on login/signup/forgot-password/reset-password/setup. B1 mis-placed it on credentials pages; corrected post-`86cff23`. Do NOT ship Google OAuth UI without the notice at the click-point.
- **Child device session (Q-4 LOCKED 2026-05-31, Option B):** **90-day sliding** (renews on activity; idle devices expire), **parent-revocable** device list. Child session grants **join sessions + adjust the privacy/consent options exposed to them** (child-side *narrowing only*, within the parent ceiling) — low-privilege: narrowing only restricts further, cannot expand beyond parent ceiling, touch billing, or change account. Fail-safe on a lost/shared device.
- **2FA:** opt-in/encouraged for parents+students; MANDATORY for tutors+admins/superadmins (TOTP+backup codes+recovery; never locked out pre-session). **Recovery (Q-5 LOCKED, Option 1):** backup codes → admin reset; no email self-serve first pass (Phase-6+ candidate, step-up only if ever added).
- **Sarah pilot inputs (2026-05-31, validated):**
  - **Mid-session student switching (NEW REQUIREMENT) — DESIGNED 2026-05-31:** back-to-back students on one computer/account is common; per-kid sub-profiles welcome IF switching is frictionless **even while connected to a live session**, re-attributing subsequently-saved content to the newly-selected learner. **Consent implication:** switching learner = new consent context / new `SessionConsentSnapshot` for the new learner; the prior learner's captured segment stays attributed to them. **Design LANDED** → [`docs/handoff/session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §3 (atomic silent session handoff; recorder-Pillar invariants; swap sequence). Students-facing = simple "switch learner"; under-the-hood = FULL seamless consent-context swap. Must (a) enforce the NEW learner's consent (their parent didn't consent to recording → recording stops/doesn't start) and (b) cleanly finalize the prior learner's recorder segment before starting the next. **Implementation downstream** (Identity Phase 3+4). **H-1 RESOLVED (Andrew 2026-05-31):** Session B **starts blank** — no carry-forward of Session A whiteboard canvas (privacy + clean attribution; tutor-preferred). **H-2 RESOLVED (Andrew 2026-05-31):** mid-session learner swap **IS allowed in solo / no-learner-joined mode** (effectively selecting/assigning the learner for a session that hadn't bound one yet).
  - **Solo-mode in-person recording — V1 PRODUCTION GOAL (Andrew 2026-05-31):** tutor sometimes records with the student physically present (no remote join). **GREENLIGHTS `soloEnabled` in production** — still consent-gated (recording a minor in person requires consent on record, same as remote). Before production enable: component-redesign **B-5 acceptance** (solo consent copy + `soloEnabled` review) — [`v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) §10 / B-5; session-lifecycle + consent design for capture gating.
  - **Capture types now distinct, each its own consent toggle (Andrew 2026-05-31) — DESIGNED:** **audio recording** (`allowAudioRecording`), **whiteboard-activity recording** (`allowWhiteboardRecording` — stroke replay, distinct from live rendering), and **video recording** (`allowVideoRecording` — actual camera/webcam, SEPARATE toggle) — Sarah's "video" = real video, not just whiteboard replay. All consent-gated like audio; plus notes/transcripts (`allowNoteSending`), educational-use (`allowEducationalUse`), messaging (`allowMessaging`). **Camera-video recording = POST-V1 FAST-FOLLOW:** forward-compatible toggle only in V1. Full tiered model + enforcement placement: session-lifecycle design §4–§6.
  - **Messaging (refines Phase 5 scope):** highest value for **live-session setup** + **AV-failure fallback**; "needs to be part of the whiteboard." Outside that Sarah just texts. Prioritize in-session/whiteboard-integrated messaging over general async.
  - **Mandatory tutor 2FA — pilot-tutor buy-in CONFIRMED:** Sarah fine with required 2FA given video storage; the friction-nope-out concern is addressed.
  - **Adult mix ~40% college / 50% HS / 10% middle-elementary:** `isSelfLearner` path heavily used (~40%); college students have own accounts, parent rarely involved even when funding. Validates Q-8 (18+ self-manage).
  - **Existing data: NOTHING to keep** (the one real student's class is finished). Pilot migration is near-trivial — no carry-forward. **Recommend purging that finished-class minor data for COPPA hygiene** (Andrew confirm). Simplifies consent-gates-capture design §4 for the pilot. **PURGE APPROVED (Andrew 2026-05-31)** — delete the finished-class real-minor data (Opus will scope exact records → confirm → delete carefully on prod).
  - **Whiteboard viewport-dominant layout, minimal chrome (Sarah-implied, Andrew 2026-06-01):** canvas should occupy **most of the available viewport** with minimal surrounding chrome — **not** a literal browser-fullscreen (F11) or Fullscreen-API toggle. First-class V1 layout principle — informs component/layout phase (component doc §5.0), not necessarily immediate build.
- **Provisioning (base):** untied Student stub (tutor-only) -> claim link -> parent email-verified signup -> claim -> authorize child + consent + child login -> only tied profiles can be live-session participants; no links into the wild. **Amended 2026-06-01 (parent-first):** claim invite is **one** path, not the only path — `AccountHolder` + `LearnerProfile` can exist with **zero tutor linkage**; linking is **bidirectional** (new account OR existing parent); V1 **builds** tutor-initiated claim + connect-by-existing-account (identity interstitial required); standalone parent signup UI = fast-follow. Per-child access mode: parent picks **`parent_session_select`** vs **`child_pin_required`** per `LearnerProfile` (defaults: &lt;13 / 13+ — see design doc).
- **IAC refinements (LOCKED 2026-06-02, Andrew co-design):** Full ledger → [`identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) § IAC refinements — 2026-06-02. Summary: **(IAC-1)** tutor content isolation verified — artifacts NEVER anchor on `LearnerProfile`/`AccountHolder`; **(IAC-2)** `@@unique([adminUserId, learnerProfileId])` replaces global `Student.learnerProfileId @unique` (one child → N tutors); **(IAC-3)** claim = attach-to-existing-first interstitial; **(IAC-4)** parent-first "add a child" (UI may fast-follow); **(IAC-5)** AccountHolder = auth/billing/consent owner, LearnerProfile = session/content principal (adult self = `isSelfLearner` profile, no Student→AccountHolder shortcut); **(IAC-6)** enforce `accessMode` (`child_pin_required` + family-id = V1 floor; `parent_session_select` fast-follow); **(IAC-7)** `AccountHolder.familyId` + per-family username + required `username@familyid` (supersedes round-3 `@`-strip); **(IAC-8)** signup "I am a learner" + claim self-connect; **(IAC-9)** consent template seeds new tutor records, never auto-grants; **(IAC-10)** layered PIN lockout + IP-independent per-credential counter + parent unlock (**supersedes AH-4 never-hard-lock**); **(IAC-11)** round-4 UX E/G/I → [`p2b-smoke-fixes.md`](p2b-smoke-fixes.md) § Round 4; **(IAC-12)** "Parent/Guardian" where guardian-context applies + **conditional** guardian framing (neutral copy until account has/adds a child learner; V1 copy in round-4/IAC build).
- **Co-guardian / delegated child access (FUTURE, not V1):** second guardian with own credentials, scoped to one child, owner-initiated — [`docs/BACKLOG.md`](../BACKLOG.md) § Identity / access — V1 redesign.
- **Identity Phase-2 auth/session (RATIFIED 2026-06-01, Andrew):** **Two realms + child mechanism** *(AH-4 PIN policy superseded by IAC-10 — 2026-06-02)* — **(1) Operator** = tutor + admin + superadmin on **existing NextAuth** (admin = role, not third realm); **(2) AccountHolder** = parents/adult-self on **`mynk_ah_session` + `AccountHolderSession`**, outside NextAuth; **child** = PIN device sessions under AccountHolder. **Hard constraint:** shared auth **primitives** (hash, TOTP, backup codes, rate-limit, DB-session pattern) in common modules; **thin per-realm adapters only** — P2a acceptance. **AH-1..AH-7 ratified** (separate realm, DB-backed AH session, `AH_TOTP_ENCRYPTION_KEY`, PIN soft-lockout never hard-lock, in-place device renewal, 30-day rolling AH session, serial merge `identity-p2-schema` → `identity-p2-ownership-guard` → P2a). **Impersonation:** SEC-1 admin→tutor **unchanged** (Operator realm only); **cross-realm admin→parent/child DEFERRED**. **Provisioning guardrail clarified:** no self-serve into tutor/admin; **parent self-signup permitted**. Detail: [`identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) §0 + [RATIFIED + AMENDED](identity-phase2-auth-session-design-2026-06-01.md#ratified--amended-andrew-2026-06-01).
- **Access control:** note/recording/transcript = {tutor, child, parent} only; replaces anyone-with-link sharing. Session has a participant SET (1 now, N later — design for, don't build N's multi-consent now).
- **Billing:** `billedDurationMin` frozen-at-close + immutable (RELIABILITY-REDESIGN Surface 7); rate/amount deferred.
- **Q-1..Q-10** all ratified 2026-05-31 (see component doc [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) §8).
- **Identity/access schema (LOCKED, design landed 2026-05-31):** `AccountHolder` (with `isSelfLearner` for adult collapse), `LearnerProfile`, `LearnerCredential` + `LearnerDeviceSession` (username+PIN + device-bound sticky sessions), `ConsentRecord` (parent ceiling, versioned) ∩ `ConsentRestriction` (child narrowing) → `SessionConsentSnapshot` frozen at session start (`onDelete: Restrict`, no UPDATE endpoint), `StudentClaimInvite`, `SessionParticipant`.
- **Identity/access assertions (LOCKED):** `assertOwnsLearnerProfile`, `assertIsSessionParticipant`, `assertEffectiveConsent`.
- **Identity/access log prefixes (LOCKED):** `ahx`, `lpr`, `clm`, `cns`, `tfa`, `msg`.
- **Session-lifecycle log prefixes (registered in design, implement with Phase 3/4):** `slc` (session lifecycle — create/start/end/swap), `wtr` (waiting room — learner arrived/admitted). Spec + event catalog: [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §7; add to `AGENTS.md` per-session-ID registry when implementation starts.
- **Identity/access execution plan (LOCKED, 6 phases):** 1 tutor-2FA → 2 identity → 3 consent → 4 access-swap → 5 messaging → 6 hardening; phases 3+4 Sonnet-tier.

### Phase-1 implementation defaults — F1–F4 RATIFIED-BY-SMOKE (Andrew 2026-06-01)

Andrew real-hardware smoke **PASSED** on `identity-p1-2fa` @ `d782430` before merge to `v1-redesign` @ `b5ef4fe` (2026-06-01). Locked micro-defaults:

- **F1:** single `TOTP_ENCRYPTION_KEY`; rotating/losing it = re-enroll all tutors (documented in `.env.example` + [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §10.4); dual-key decrypt = future hardening, not built. **Rotate authenticator = no-lockout rotate** (new secret in `pendingTotpSecretEnc` while current remains valid until confirm — evolved from early "rotate = full re-enroll" sketch).
- **F2:** gate enforced in middleware after ANY successful auth (credentials AND Google) so neither is a bypass; JWT-only `twoFactorVerified` state in edge, DB lookup on the setup page.
- **F3:** `isTestAccount=true` (plus impersonation + env-only `sub=admin`) exempt from the gate.
- **F4:** routes under `/admin/settings/2fa/*` (app's existing settings tree), not the design doc's `/settings/2fa`.

---

## BRANCH & COMMIT REALITY (as of 2026-06-01)

| Branch | Commit | Notes |
|--------|--------|-------|
| **`master`** | `a621a5b` | Production integration line; **does not** contain the V1 doc corpus, Component Phase A, or product legal facades. |
| **`v1-redesign`** | **`6c4a268`** | Long-running V1 epic integration branch. **`identity-p1-2fa` MERGED `--no-ff` 2026-06-01** @ `b5ef4fe`. **`component-b2-dashboard-students` MERGED `--no-ff` 2026-06-01** @ `0424206`. **`identity-p2-schema` MERGED `--no-ff` 2026-06-01** @ `242c6b2` (AH-7). **`identity-p2-ownership-guard` MERGED `--no-ff` 2026-06-01** @ `1a06a65` (AH-7). **`identity-p2a-session-infra` MERGED `--no-ff` 2026-06-01** @ **`6c4a268`** (P2a build; gates green post-merge). **`docs/road-to-ga` MERGED `--no-ff` 2026-06-01** @ `eca63b5` (docs only — [`docs/ROAD-TO-GA.md`](../ROAD-TO-GA.md) launch-readiness hub, 3 gates). **P2b next:** AccountHolder UI + child login UI. **Epic corpus + Phase A + B1 + B2 + p2 schema/guard + P2a live ONLY here** until epic merges to `master`. **PRODUCTION / preview:** apply p1 + p2 + **P2a** migrations at/after next deploy (`20260531180000`, `20260601120000`, `20260531190000`, **`20260602000000_identity_p2a_session_infra`**). |
| **`identity-p2a-session-infra`** | `a37fb90` | **MERGED `--no-ff` into `v1-redesign` @ `6c4a268` (2026-06-01).** AccountHolder realm + learner PIN sessions + claim/connect back-end; migration `20260602000000_identity_p2a_session_infra`. Branch preserved for stale-sweep. |
| **`docs/road-to-ga`** | `adcb60e` | **MERGED `--no-ff` into `v1-redesign` @ `eca63b5` (2026-06-01, docs only).** [`docs/ROAD-TO-GA.md`](../ROAD-TO-GA.md). |
| **`component-b2-dashboard-students`** | `20de6fa` | **MERGED `--no-ff` into `v1-redesign` @ `0424206` (2026-06-01).** Andrew visual smoke **PASSED as-scoped** (reskin only). Branch preserved for stale-sweep. |
| **`identity-p1-2fa`** | `d782430` | **MERGED `--no-ff` into `v1-redesign` @ `b5ef4fe` (2026-06-01).** Andrew real-hardware smoke **PASSED** (QR gen, land-on-dashboard-after-signup, land-on-dashboard-after-login, exit-impersonation-keeps-2FA, sign-out-impersonation-exits, backup-code-hold + autofocus, **backup-code works once + rejected on reuse**). Branch preserved for stale-sweep. |
| **`identity-p2-schema`** | `e305d0b` | **MERGED `--no-ff` into `v1-redesign` @ `242c6b2` (2026-06-01, AH-7).** Migration `20260531190000_identity_p2_principals` merged **unchanged** (non-monotonic vs `20260601120000` is benign; `190000` already on preview-dev `_prisma_migrations`). |
| **`identity-p2-ownership-guard`** | `f74f164` | **MERGED `--no-ff` into `v1-redesign` @ `1a06a65` (2026-06-01, AH-7).** `assertOwnsLearnerProfile` + 14 tests. |
| **`interim-capture-attestation`** | `3807e44` | Pushed, **NOT merged.** Interim capture-attestation gate implemented. **Andrew:** `prisma migrate deploy` on preview/prod → real-hardware smoke → `merge --no-ff` to `master`. |

> **ORCHESTRATOR — next identity step:** **P2b AccountHolder UI + child login UI** — design §10.2 ([`identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md)). **Andrew first:** set `AH_SESSION_HMAC_SECRET`, `LEARNER_SESSION_HMAC_SECRET`, `AH_TOTP_ENCRYPTION_KEY` on Vercel preview/prod; verify preview-dev migration for P2a (`token`→`tokenHash` on empty column). Real-hardware smoke gate; Sonnet tier.

> **ORCHESTRATOR — migrations on `v1-redesign`:** **p1** (`20260531180000`, `20260601120000`) + **p2 principals** (`20260531190000`) + **P2a** (`20260602000000_identity_p2a_session_infra`). **`190000` merged as-is** (already on preview-dev). **PROD / preview:** apply all four (+ any prior not yet applied) on next `v1-redesign` deploy.

> **Overnight autonomous mode (2026-06-01):** **`identity-p1-2fa` + `component-b2` + AH-7 p2 schema/guard + P2a session-infra merged.** **NO merge to master/prod** for the epic yet.

## OVERNIGHT SESSION SUMMARY (2026-06-01)

**Policy:** BUILD-DON'T-MERGE overnight; **exception:** `identity-p1-2fa` **merged `--no-ff` to `v1-redesign` @ `b5ef4fe`** after Andrew real-hardware smoke PASS (2026-06-01).

| Branch | SHA | Status |
|--------|-----|--------|
| **`identity-p1-2fa`** | `d782430` | **MERGED** to `v1-redesign` @ `b5ef4fe`. Mandatory tutor/admin TOTP 2FA (encrypt-at-rest, enroll, backup-code terminal step, login→verify→dashboard, autofocus, no-lockout rotate, regenerate, admin reset, `/admin/settings/2fa` management, impersonation 2FA-preservation + sign-out-exits-impersonation). |
| **`identity-p2-ownership-guard`** | `f74f164` | **MERGED** to `v1-redesign` @ `1a06a65` (2026-06-01, AH-7). |
| **`identity-p2-schema`** | `e305d0b` | **MERGED** to `v1-redesign` @ `242c6b2` (2026-06-01, AH-7). |
| **`component-b2-dashboard-students`** | `20de6fa` | **MERGED** to `v1-redesign` @ `0424206` (2026-06-01). |

**Smoke-found fixes (closed during Andrew smoke, all on `identity-p1-2fa` before merge):** `2e8e641` (local QR `data:` URI, no third-party QR egress) · `9c17a16` (session-mint verify bug) · `3ea6b72` (email QR label) · `b4c439d` (post-success redirect + `safeReturnTo` open-redirect guard) · `f56c4ae` (impersonation 2FA-preservation + sign-out-while-impersonating) · `45c01fa` (management page + reenroll-trap close) · `548b70f` (backup-code page no longer auto-skips to Settings — post-enroll cookie suppresses setup redirect during post-enroll render) · `d782430` (post-login verify lands on `/admin` not enroll form — hard-nav + post-enroll cookie cleared on Continue; autofocus).

Fresh orchestrator: `git checkout v1-redesign` → read this spine → [`v1-redesign-bootstrapper.md`](v1-redesign-bootstrapper.md).

---

## FLY-PLAN

**Headline Sonnet pass — LANDED 2026-05-31** (`23c65c0`) → [`docs/handoff/session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md). **Implementation is downstream** (Identity Phases 2–4 per design §8); **decision-unblocked 2026-05-31** (essentials-vs-optional split RATIFIED; H-1/H-2 RESOLVED; §9 accepted). Remaining gates: legal/umbrella disclosure floor; session-lifecycle Phase-3 BLOCKERs; **P2b UI** (P2a session-infra **MERGED** @ `6c4a268`, 2026-06-01). **`assertOwnsLearnerProfile` SATISFIED+MERGED** (`identity-p2-ownership-guard` → `v1-redesign` @ `1a06a65`, 2026-06-01). **TOTP encrypt-at-rest SATISFIED+MERGED** (`identity-p1-2fa` → `v1-redesign` @ `b5ef4fe`, smoke 2026-06-01).

Delivered as design (was the fly-pass scope):

1. **Waiting room** → session start / invite UX (session-centric IA) — §2.
2. **Frictionless mid-session learner swap** — §3.
3. **Tiered consent model** — §4.1 split **RATIFIED** (Andrew 2026-05-31).
4. **Capture types** — incl. `allowWhiteboardRecording`; video forward-compat only in V1.
5. **Consent-gates §9 resolutions** — §5 (Opus-accepted; Andrew may revisit).

**Parallel Andrew-owned actions (do NOT block implementation dispatch):**

- Interim branch: `prisma migrate deploy` → smoke → `merge --no-ff` `interim-capture-attestation` to `master`.
- Umbrella repo: review + deploy `coppa-312-10-disclosure` @ `f77ed4b` (separate mortensen-apps-site repo).
- Verify/execute **OpenAI DPA**; monitor disclosed deletion-request inbox.
- **Pilot purge:** scope finished-class real-minor records → confirm → delete on prod (PURGE APPROVED).
- Component Phase A @ `5aa3c7d`: Andrew real-hardware smoke when ready.
- Component Phase B1 @ `b798494`: Andrew real-hardware smoke of redesigned auth pages on v1-redesign preview; confirm Connect Gmail mortensenapps.com notice copy if desired.

### Pre-merge verification (build-surface)

Branches that touch **fonts, CSS, or build configuration** must pass a real **`npx next build`** locally (exit 0) before `git merge --no-ff` — jest/regression alone is not enough. Canonical file list + rationale: [AGENTS.md § Merging convention](../../AGENTS.md). **Incident (2026-05-31):** Phase A `@5aa3c7d` stacked `next/font` + ESLint-glob breaks invisible to jest; broke every `v1-redesign` deploy until `754dbe5` + `e51d23f`.

### Local verification — shared-working-tree Prisma client drift

Because all subagents share **one working tree**, the generated Prisma client (`node_modules/.prisma`) and the local test DB reflect whichever branch last ran `prisma generate` / `migrate`. Local **full** `npx jest` is therefore unreliable across branches (e.g. B2's full-jest showed `note-and-share.test.ts` failing on a `learnerProfileId` column from the `identity-p2-schema` branch's generated client — **NOT** a defect in B2's committed code). Vercel builds are unaffected (clean generate per deploy). **Reliable local gates** = `npx next build` + `npm run test:regression`; run `npx prisma generate` to match the checked-out branch before trusting full jest.

---

## Sub-pass tracker

| Pass | Status | Artifact |
|------|--------|----------|
| Component redesign (visual/component layer) | DONE | [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) |
| Session identity + access + consent + auth foundation | **DONE** | [`docs/handoff/session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) (1122 lines) |
| Session-lifecycle + tiered consent (waiting room, swap, consent split, §9) | **DONE (design)** @ `23c65c0` | [`docs/handoff/session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) — implementation slots Identity Phases 2–4 |
| Component Phase A (dark tokens + fonts) | IMPLEMENTED on `v1-redesign` @ `5aa3c7d` (pushed); **pending Andrew real-hardware smoke** | dark tokens migrated off legacy purple `#7c5cff` → Mynka Blue; Fraunces/Inter/JetBrains Mono via `next/font`; CSP unchanged; 25/25 token tests pass |
| Component Phase B1 (Tailwind 4 + shadcn + auth surfaces) | **IMPLEMENTED** @ `b798494` (pushed); notice placement **corrected** post-B1; **Vercel deploy VERIFIED READY** (`dpl_2LK8drfHx8tuVhVMsxhVSjFvrbjH`); **awaiting Andrew** real-hardware smoke | Tailwind 4.3 + shadcn/ui install; auth surfaces redesigned (login/signup/forgot-password/reset-password/setup) on existing routes; shared `AuthShell`/`MynkWordmark`; mortensenapps.com notice **only** on Google-OAuth click-points (`OAuthEmailSection` Connect Gmail; sign-in variant ready for future Sign-in-with-Google). Local: `npx next build` + jest 92/92 + tsc green. **B1 follow-ups:** Playwright visual snapshots need `--update-snapshots` after redesign; `color-contrast` axe moved to Playwright fixtures (jsx-a11y v6 removed ESLint rule) — may surface issues on non-auth admin pages when visual tests run. |
| Identity Phase 1 (tutor/admin TOTP 2FA) | **DONE + MERGED** to `v1-redesign` @ `b5ef4fe` (smoked 2026-06-01 @ `d782430`) | **Delivered:** AES-256-GCM encrypt-at-rest; enroll + backup-code terminal step (hold page, no auto-skip); login→verify→dashboard; autofocus on code fields; **no-lockout rotate** (`pendingTotpSecretEnc`); regenerate backup codes; admin reset; management page `/admin/settings/2fa`; middleware gate (F2–F4); `tfa=` logs; QR `data:` URI (no third-party egress). **Impersonation:** exit restores `twoFactorVerified`; sign-out-while-impersonating exits impersonation. Migrations `20260531180000` + `20260601120000`. **Gates @ merge:** `tsc` + `next build` exit 0; **124** tests (2FA + impersonation); `test:regression` 92/92. **F1–F4 ratified by smoke.** **Backup-code single-use verified in smoke** (works once, rejected on reuse). **PROD:** apply both p1 migrations on next deploy. |
| Identity Phase 2 (additive schema foundation) | **DONE + MERGED** to `v1-redesign` @ `242c6b2` (2026-06-01, AH-7) | Scope: 6 new Prisma models (`AccountHolder`, `AccountHolderEmailToken`, `LearnerProfile`, `LearnerCredential`, `LearnerDeviceSession`, `StudentClaimInvite`) + `AccountHolderEmailTokenPurpose` enum; `Student.learnerProfileId String? @unique` (nullable, `onDelete: SetNull`) + `claimInvites` back-relation; COPPA tombstone columns; migration `20260531190000_identity_p2_principals` **unchanged** (already on preview-dev). **Merge resolution:** `prisma/schema.prisma` union — kept v1-redesign `AdminUser2FA` / `AdminUser2FABackupCode` + p2 `claimInvites` on `AdminUser`. **Purely additive, ZERO route wiring.** Gates post-merge: `tsc` + `next build` exit 0; `test:regression` 92/92; identity-2fa 115/115; impersonation 24/24. |
| Identity Phase 2 ownership guard (`assertOwnsLearnerProfile`) | **DONE + MERGED** to `v1-redesign` @ `1a06a65` (2026-06-01, AH-7) | `assertOwnsLearnerProfile` in `src/lib/learner-profile-scope.ts` + **14/14** tests. **`lpr=`** logs on denial. Gates post-merge: ownership 14/14 + regression 92/92 + identity-2fa + impersonation green. |
| **Identity Phase-2 AUTH + SESSION INFRASTRUCTURE design** | **DONE + RATIFIED** (2026-06-01) @ `f41a445` | Design-only: separate Operator vs AccountHolder realms + child PIN mechanism; AH-1..AH-7 + amendments (parent-first linking, per-child access mode, no-dup-code primitives, impersonation unchanged / cross-realm deferred, connect-link identity interstitial). 7 P2a BLOCKERs: S1, S2, S3, R1, C1, A1, O1. [`identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) |
| **Identity P2 — multi-tutor + accessMode/family-id + round-4 UX** | **PENDING** (design **LOCKED** 2026-06-02) | **Scope:** IAC-2 schema (`@@unique([adminUserId, learnerProfileId])`, `AccountHolder.familyId`, per-family `LearnerCredential` uniqueness); IAC-3 claim attach-first interstitial; IAC-6 `accessMode` enforcement on learner login; IAC-7 `username@familyid` UX; IAC-8 signup self-learner; **IAC-12** Parent/Guardian + conditional guardian copy; round-4 smoke E/G/I ([`p2b-smoke-fixes.md`](p2b-smoke-fixes.md) § Round 4). **Branch:** continue on `identity-p2b-ui` after current smoke/fix pass. **Tier:** Sonnet. **Prereq:** Andrew P2b smoke on current UI; IAC doc § IAC refinements — 2026-06-02. |
| **Identity Phase 2a (build — session infra + claim back-end)** | **DONE + MERGED** to `v1-redesign` @ **`6c4a268`** (2026-06-01) | **Delivered:** separate AccountHolder realm (`mynk_ah_session` + `AccountHolderSession` table, `getAccountHolderSession`); learner PIN device sessions (`getLearnerSession`, soft-lockout never-hard-lock per AH-4); claim/connect back-end (`/api/students/[id]/claim-invites`, `/api/claim/[token]/complete|setup`); AccountHolder auth routes (signup/login/logout/forgot/reset + `/verify-email`); shared auth primitives in common modules (no-dup-auth: `src/lib/crypto/session-tokens.ts`, `src/lib/account-holder-auth.ts`); middleware cookie-presence gates for `/account/*` + `/join/*` (Operator `/admin/*` gate untouched — I-1/I-2/A1). Migration `20260602000000_identity_p2a_session_infra`: `AccountHolderSession`; `LearnerDeviceSession.expiresAt`+`deviceInfo`; `AccountHolderEmailToken.payload`+`targetLearnerProfileId`; `AccountHolder.passwordHash`+`displayName`+`emailVerifiedAt`; `LearnerAccessMode` enum + `LearnerProfile.accessMode` default `parent_session_select`; **`StudentClaimInvite.token`→`tokenHash`** (empty column) + `revokedAt`+`claimedByAccountHolderId`. **Acceptance MET:** 7 BLOCKERs (S1/S2/S3/R1/C1/A1/O1) + I-1..I-6 + soft-lockout tiers green (225 identity-suite tests @ post-merge gates). **P2a stubs (Phase-3 wiring):** `assertEffectiveConsent` (void, tutor-acknowledged fallback), `assertIsSessionParticipant` (`notFound()` stub), `assertOwnsConsentRecord` (`notFound()` stub) — await `SessionConsentSnapshot`, `SessionParticipant`, `ConsentRecord`, `ConsentRestriction` (not on branch yet). No UI (P2b). |
| Component Phase B2 (dashboard / student list / detail) | **DONE + MERGED** to `v1-redesign` @ `0424206` (smoked as-scoped **2026-06-01**) | **Reskin floor only** — admin nav + layout, dashboard, student-list + detail restyled to B1 shadcn + Mynka Blue; new primitives `AdminPageShell`, `AdminSectionCard`, `StudentAvatar`, `StudentsRoster`. Behavior/routes/ownership unchanged. **Merge resolution:** `AdminNav.tsx` kept B2 shadcn `Button` styling **and** 2FA impersonation sign-out (`exitImpersonation` form when `isImpersonating`; `layout.tsx` passes `isImpersonating` + B2 max-width container). **Deferred by design** (land in Phase C + B3–B6, not B2): full next-actions dashboard, two-column layout, shadcn form controls on note forms, nav redesign. **Andrew decisions (2026-06-01):** (1) B2 merged as reskin floor; (2) nav redesign waits for real surface redesign — **not** pulled forward; (3) landing/hero + `/about` are **V1-required** gap-close → component plan **Phase D** ([`v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md)). **B2 smoke → backlog:** pre-existing UX/a11y items logged in [`docs/BACKLOG.md`](../BACKLOG.md) § "Component redesign — B2 smoke (2026-06-01)". Gates @ merge: `tsc`, `next build`, `test:regression` 92/92, identity+impersonation 139/139. |

### Phase-3 consent stubs (P2a — executor note)

P2a shipped **stub** implementations that must be replaced when Phase-3 consent models land (`SessionConsentSnapshot`, `SessionParticipant`, `ConsentRecord`, `ConsentRestriction` — **not on `v1-redesign` yet**):

| Stub | Location | P2a behavior | Phase-3 wiring |
|------|----------|--------------|------------------|
| `assertEffectiveConsent` | `src/lib/consent-scope.ts` | Returns void; logs `[cns] … fallback=tutor_acknowledged` | Enforce effective consent from frozen snapshot |
| `assertIsSessionParticipant` | `src/lib/session-participant-scope.ts` | Always `notFound()` | Check `SessionParticipant` set |
| `assertOwnsConsentRecord` | consent-scope (stub) | Always `notFound()` | Parent/child consent-record ownership |

---

## Session-lifecycle design — Phase-3 acceptance BLOCKERs

Folded from 5-axis review in [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §6 (detail there; do not duplicate fully here):

| ID | Summary |
|---|---|
| **BLOCKER-D1** | Swap timeout must NOT finalize Session A IDB rows; must NOT create Session B |
| **BLOCKER-D2** | `allowWhiteboardRecording` gates events.json replay blob upload |
| **BLOCKER-R1** | Swap Phase-2 failure leaves workspace recoverable, not hung |
| **BLOCKER-C1** | `activeSwapId` optimistic lock prevents concurrent swaps (409 on second) |
| **BLOCKER-C2** | Unique partial index on `(studentId, endedAt IS NULL)` — one active session per student |
| **BLOCKER-A1** | Negative auth: cross-tutor swap → 403 |
| **BLOCKER-A2** | `allowLiveSession=false` → swap rejected 400/403 before Phase 1 |
| **BLOCKER-O1** | All `slc=` / `wtr=` log events emit before production |

*(Plus consent-gates-capture design Phase-3 BLOCKERs from the earlier pass — still in force.)*

---

## Essentials-vs-optional consent split — RATIFIED (Andrew 2026-05-31)

> **RATIFIED AS-IS** — table below is locked for V1 implementation. Full rationale: [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §4.1. **Future note:** revisit de-bundling live-VIDEO transport from the Essential tier later (keep live-AUDIO transport essential); for V1 the live A/V bundle stays essential — Andrew.

| Toggle | Tier | Default |
|---|---|---|
| Live whiteboard / Live A/V transport / Session metadata / Account identity | ESSENTIAL — not toggles | N/A |
| allowAudioRecording | Optional — HIGHLY RECOMMENDED | false unchecked |
| allowWhiteboardRecording (new, distinct from live rendering) | Optional — Recommended | false unchecked |
| allowNoteSending | Optional — Recommended | false unchecked |
| allowEducationalUse | Optional — Neutral | false unchecked |
| allowMessaging | Optional — Recommended | false unchecked |
| allowVideoRecording | Optional — POST-V1 only | false forward-compat |
| allowLiveSession | Session-access kill-switch (not a capture toggle) | true |

---

## ACTION (Andrew) — Identity Phase 1 smoke gate

> ✅ **COMPLETE 2026-06-01.** Consolidated smoke **PASSED** on `identity-p1-2fa` @ `d782430`; **F1–F4 ratified**; merged `--no-ff` to `v1-redesign` @ `b5ef4fe`. **`TOTP_ENCRYPTION_KEY`** must remain set on Vercel all envs. **PROD:** `prisma migrate deploy` both p1 migrations on next `v1-redesign` production deploy.

## ACTION (Andrew) — before P2b smoke

> **P2a build MERGED 2026-06-01** @ `6c4a268`. Before P2b UI + real-hardware smoke, set on **Vercel preview + prod:**
>
> 1. **`AH_SESSION_HMAC_SECRET`** — 32+ byte base64 (live now).
> 2. **`LEARNER_SESSION_HMAC_SECRET`** — 32+ byte base64 (live now).
> 3. **`AH_TOTP_ENCRYPTION_KEY`** — reserved for Phase 6; set now for env parity.
>
> P2a **fails closed (401)** if session secrets absent but does **not** crash build. **Preview-dev migration:** applies on next `v1-redesign` deploy (`20260602000000` — `token`→`tokenHash` rename on an empty column). If fussy, Andrew's "reset preview-dev to master" valve is the fallback.

---

## Open items

### Andrew-decisions (ratification / product)

- ~~**Ratify essentials-vs-optional split**~~ **RESOLVED 2026-05-31:** RATIFIED AS-IS (table above; session-lifecycle design §4.1).
- ~~**H-1 — Canvas on swap**~~ **RESOLVED 2026-05-31:** Session B **starts blank** — no carry-forward of Session A whiteboard canvas (privacy + clean attribution; tutor-preferred).
- ~~**H-2 — Swap in solo mode**~~ **RESOLVED 2026-05-31:** mid-session learner swap **IS allowed** when no learner has joined Session A yet (solo / no-learner-joined — effectively selecting/assigning the learner).
- ~~**`p1-reenroll-trap` (Identity Phase 1)**~~ **CLOSED @ `45c01fa`:** unconfirmed / zero-backup-code rows get setup form on `/admin/settings/2fa`; confirmed enrollment requires `backupCodes > 0`; admin Reset UI shipped on management page.

### Sarah-pending

- ~~Account-ownership default (parent vs adult-self)~~ **RESOLVED 2026-05-31 (Sarah):** parent-held profile the student uses (parent-primary). Confirms locked "parent for minors." Sarah flags **multiple kids per parent** as common → multiple LearnerProfiles under one AccountHolder is a near-term case (model already supports; not the N-in-one-session case).
- ~~Consent toggle list + `allowAudioRecording` default~~ **SARAH-ANSWERED 2026-05-31.** Toggle list (parent-set ceiling, child-narrows-only): **audio recording, whiteboard-activity recording, notes/transcripts, educational-use, messaging** — Sarah confirmed "covers it." **`allowAudioRecording` default → Sarah prefers ON** (so students can review). **⚠ NEW Andrew-decision (Q-S1, audio default):** default-ON collides with COPPA for MINORS — audio of a minor needs **verifiable parental consent (VPC), NOT a buried ToS/user-agreement clause** (Sarah's "part of the user agreement" works for ADULTS only). **Refined (Andrew):** consent set ONCE up-front, student-side, no per-session friction; frame audio as HIGH-PRIORITY recommended w/ clear "declining reduces your child's ability to review recordings." **RESOLVED 2026-05-31:** **explicit RECOMMENDED but UNCHECKED opt-in** (no pre-check, no forced-on); consent up-front + student-side; frame audio high-priority with clear "declining reduces your student's ability to review recordings" messaging.
- **Test-students audit (NEW 2026-05-31):** which students Sarah entered are REAL vs test? Real → prompt claim+consent (no exemption from consent-gates-capture). Test → purge. **What stored data does she need to keep?** (preserve until she answers).

### Identity / policy decisions (Q-3..Q-9, Q-S1 — RESOLVED 2026-05-31)

- **Q-3 — Recording retention on revocation — RESOLVED (on-request):** end-state = **ON-REQUEST deletion** (COPPA §312.6(a)(2) — parent directs, operator complies). **Retain-by-default**; no never-delete claims; **no self-serve delete button** first pass. Build **admin-executed deletion capability** + a **DISCLOSED parent request path** (contact email suffices). **NOT blocked on legal counsel** — disclosure floor required regardless; counsel deferred for edge interpretation only (Q-3c/Q-3d tagged). Educational-use consent toggle approved.
- ~~**Q-3b — Retention timeframe**~~ RESOLVED: active relationship + **24 months post-closure**; deletion-on-request honored sooner.
- **Q-3c — OpenAI/Whisper** — research landed (`73790d4`): favors **service-provider** (no consent-gate) with operational guardrails: `/v1/audio/transcriptions` only; **execute OpenAI DPA**; disclose subprocessor. Counsel-later only on retention surprise.
- **Q-3d — Business-record vs PII deletion** — largely mooted by PII/business-record **separation principle** (ledger); counsel-later tag only.
- ~~**Q-4 — Child device session lifetime**~~ **LOCKED:** **90-day sliding** (renews on activity; idle devices expire), parent-revocable device list. *(Supersedes identity design doc "180 days proposed.")*
- ~~**Q-5 — Tutor 2FA recovery**~~ **LOCKED Option 1:** backup codes → **admin reset**; **NO email self-serve** first pass. Phase 1 policy gate cleared. **TOTP-encrypt-at-rest BLOCKER SATISFIED+MERGED** (`v1-redesign` @ `b5ef4fe`, smoke 2026-06-01).
- ~~**Q-6 — ShareLink / existing-data migration**~~ **LOCKED:** **NO indefinite grandfather**; existing data **NOT exempt** from consent-gates-capture; migration when V1 lands; interim attestation gate bridges. *(Supersedes identity design doc "90-day ShareLink grandfather.")*
- ~~**Q-7 — Messaging**~~ **LOCKED:** parent send v1; student **read-only** v1; student-send fast-follow.
- ~~**Q-8 — Adult self threshold**~~ **LOCKED:** **18+** = `isSelfLearner` self-manage; parent-reported age; child cannot self-promote until reported age 18.
- ~~**Q-9 — Email provider**~~ **LOCKED:** app-signed transactional (Resend/Postmark class).
- ~~**Q-S1 — Audio default**~~ **RESOLVED:** explicit **RECOMMENDED but UNCHECKED** opt-in (no pre-check, no forced-on); consent up-front + student-side.

### BLOCKERs (1 active + 1 satisfied-merged + 1 satisfied-on-branch-not-merged)

- ~~TOTP secrets encrypted at rest **before Phase 1**.~~ **SATISFIED+MERGED** (`v1-redesign` @ `b5ef4fe`, Andrew smoke 2026-06-01).
- ~~`assertOwnsLearnerProfile` exists + negative-tested **before Phase 2 data routes**.~~ **SATISFIED+MERGED** (`identity-p2-ownership-guard` → `v1-redesign` @ `1a06a65`, 2026-06-01, AH-7 — 14 tests).
- Umbrella mortensenapps.com privacy/terms updated: COPPA consent mechanism + minor data inventory **before Phase 2**; messaging as data surface **before Phase 5**. **⚠ NOW URGENT (not just Phase-2 gated):** §312.10 specific-retention-timeframe deadline (2026-04-22) already passed → umbrella likely currently non-compliant. **Andrew GREENLIT pull-forward 2026-05-31** as a DISCLOSURE-floor task (NOT counsel-gated). Must publish: (1) retention timeframe = **active + 24mo post-closure**, (2) disclosed parent deletion-request path, (3) data inventory incl. minor audio + OpenAI processing, (4) revocation + educational-use mechanics. Spans umbrella (canonical, **separate repo** — static HTML `privacy/index.html`+`terms/index.html`) + product `/privacy` + `/terms` facades per LEGAL-SYNC. **HARD RULE (Andrew 2026-05-31):** umbrella privacy/terms are the **Google-OAuth-APPROVED** docs — child/product sites may **EXPAND but NEVER TRUNCATE**; all umbrella edits must be **PURELY ADDITIVE** (no deletion/reword-to-shorten/restructure of existing approved disclosures). Capture this in LEGAL-SYNC.md. **DONE (additive-only verified):** umbrella on branch `coppa-312-10-disclosure` (`f77ed4b`, pushed, NOT merged/deployed — Andrew reviews+deploys); product facades on `v1-redesign` (`29f5e88`). Diff 66+/2− (the 2 deletions = "Last updated" strings only); before/after inventory confirms no approved clause lost. (COPPA brief `210e4f4` informs it.)
  - **RESOLVED 2026-05-31 (Andrew):** the product app serves only Sarah until v1 is live → **full disclosures land WITH the `v1-redesign` branch; NO separate master facade patch.** Umbrella branch (`coppa-312-10-disclosure`) remains for Andrew review+deploy (public canonical + OAuth-registered; additive+safe — recommend deploying soon, but not gating).
  - **ACTION (Andrew, has teeth):** (a) **verify/execute the OpenAI DPA** in dashboard — we DISCLOSED "subprocessor under a DPA"; must be made true or the copy is inaccurate. (b) **Monitor `arangarx+tutoringnotes@gmail.com`** + be able to honor deletion requests manually from day one (disclosed path must function). (c) Review+deploy umbrella branch.
  - **VPC method** (§312.5) intentionally NOT yet disclosed — add once consent flow built (Phase 2/3), before that ships.

### Legal / business threads (Andrew + counsel)

- **COPPA counsel (deferred, non-blocking):** research brief (`docs/handoff/coppa-compliance-research-2026-05-31.md`) for edge interpretation (Q-3c/Q-3d, compromised-email recovery liability). **Q-3 end-state already RESOLVED (on-request)** — implement disclosure floor + admin deletion capability regardless of counsel timing.
- **LLC formation** — Andrew raised twice; prudent liability shield before scaling minor-data handling. Business/legal call for Andrew + counsel; tracked so it doesn't evaporate.

### Approved-to-build (from Q-3 ratification)

- **Admin-only recording-deletion capability** — manual now, auto-able later; honors on-request deletion (disclosed contact path); retain-by-default on revocation.

---

## Next actions

> **2026-06-02:** **IAC co-design RATIFIED** — ledger in [`identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) § IAC refinements — 2026-06-02. **2026-06-01:** Identity Phase 1 **MERGED** @ `b5ef4fe`; Component Phase B2 **MERGED** @ `0424206`; **AH-7** p2 schema @ `242c6b2` + ownership guard @ `1a06a65`; **P2a session-infra MERGED** @ **`6c4a268`**; **Road-to-GA doc** @ `eca63b5` ([`docs/ROAD-TO-GA.md`](../ROAD-TO-GA.md) — launch-readiness hub, 3 gates).

**Orchestrator / executor queue:**

1. **P2b smoke (in flight):** Andrew real-hardware smoke on `identity-p2b-ui` preview; round-3 fixes per [`p2b-smoke-fixes.md`](p2b-smoke-fixes.md). After PASS → `merge --no-ff` to `v1-redesign` **or** stack next build on same branch per Andrew.
2. **P2 multi-tutor + accessMode/family-id + round-4 UX (NEXT BUILD):** IAC-2..IAC-12 — schema migration + claim attach-first + `accessMode` enforcement + family-id + **IAC-12** copy + round-4 E/G/I; **Sonnet tier**. Design: IAC § 2026-06-02. **Not** Phase-3 consent models (separate queue item).
3. **P2b UI (baseline shipped):** AccountHolder UI + child login UI on `identity-p2b-ui` @ `cd7555b`; consent panel = Phase-3 placeholder.
4. **Phase 3 consent models:** `SessionConsentSnapshot`, `SessionParticipant`, `ConsentRecord`, `ConsentRestriction` + IAC-9 template seeding — replace P2a stubs (see § Phase-3 consent stubs above).
5. **PROD / preview deploy hygiene:** **`prisma migrate deploy`** p1 + p2 + P2a (`20260531180000`, `20260601120000`, `20260531190000`, `20260602000000_identity_p2a_session_infra`) if not applied. Confirm `TOTP_ENCRYPTION_KEY` + set P2a session secrets (Andrew ACTION above).

**Andrew's queue:**

4. **Env vars + preview-dev migration** before P2b smoke (see ACTION above).
5. **Component next:** Phase **B3** (session list / billing log UI) or **Phase D** gap-close (landing/hero + `/about`). Nav redesign stays with B3–B6.
6. **Session-lifecycle + consent (Phases 3–4):** dispatch after P2b UI + Phase-3 models.
7. **BLOCKERs (active):** umbrella deploy + OpenAI DPA + deletion-request inbox; session-lifecycle Phase-3 BLOCKERs.
8. **Andrew parallel:** interim `interim-capture-attestation` migrate → smoke → merge; umbrella `coppa-312-10-disclosure` review+deploy; Phase A + B1 smoke; B2 BACKLOG; optional visual snapshot update.
9. **Sarah-pending:** test-students audit.
10. **Solo in-person recording:** B-5 acceptance before `soloEnabled` in production.
11. Keep this spine + bootstrapper in sync at every handoff.
