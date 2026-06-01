# V1 Redesign — Epic Status & Decisions Spine

**Date:** 2026-05-31  
**Branch:** `v1-redesign` (long-running integration branch)  
**Purpose:** Single source of truth for the multi-day V1 redesign; re-read at the top of any fresh chat so the thread survives.

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
- **PII / business-record SEPARATION principle (LOCKED 2026-05-31, Andrew):** deletions must NOT be surgical. Permanent business/accounting/audit records (session-occurred, `billedDurationMin`, amount, audit logs) **MUST NOT directly store PII** — they reference the learner via an opaque stable key only. On honored deletion the LearnerProfile PII bucket is purged/tombstoned (records resolve to "student deleted"/"student unknown") while business records persist intact. Dovetails with billing-immutable. → Phase-2 data-model constraint; fold into identity/access design doc.
- **No phase gated on legal counsel (Andrew 2026-05-31):** do NOT block Phase 2/3 on counsel. The separation design makes BOTH legal-interpretation levels cheap to satisfy. **Disclosure floor is REQUIRED regardless** — privacy + terms must disclose exactly what we do (retention period, deletion-request path, data inventory incl. audio, OpenAI processing, educational-use) so we've notified, counsel-or-not. Counsel deferred (expensive — Andrew); open Qs Q-3c/Q-3d stay tagged for it.
- **New consent toggle (LOCKED to add):** "Parent consents to the child's sessions being used for educational purposes by the tutor" — revoke-going-forward (tutor NOTIFIED the learner is now off-limits for that use), disclosure that prior-consent releases cannot be clawed back. Folds into the consent toggle list (Sarah-pending / §10.3).
- **Auth-via-mortensenapps.com notice (LOCKED — COMMITMENT TO GOOGLE REVIEWERS, 2026-05-31):** Andrew told Google's review team the app will display **notices that authentication happens through mortensenapps.com at the point where the user clicks** (the sign-in / OAuth / auth-initiation control). This is a binding representation made during the (passed) `usemynk.com` security review — **must be honored** on every auth-initiation surface (login, signup, "Sign in with Google", claim-flow auth). Implement when building/redesigning auth surfaces (Identity Phase 1 + component login pages). Do NOT ship auth UI without it.
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
- **Provisioning:** untied Student stub (tutor-only) -> claim link -> parent email-verified signup -> claim -> authorize child + consent + child login -> only tied profiles can be live-session participants; no links into the wild.
- **Access control:** note/recording/transcript = {tutor, child, parent} only; replaces anyone-with-link sharing. Session has a participant SET (1 now, N later — design for, don't build N's multi-consent now).
- **Billing:** `billedDurationMin` frozen-at-close + immutable (RELIABILITY-REDESIGN Surface 7); rate/amount deferred.
- **Q-1..Q-10** all ratified 2026-05-31 (see component doc [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) §8).
- **Identity/access schema (LOCKED, design landed 2026-05-31):** `AccountHolder` (with `isSelfLearner` for adult collapse), `LearnerProfile`, `LearnerCredential` + `LearnerDeviceSession` (username+PIN + device-bound sticky sessions), `ConsentRecord` (parent ceiling, versioned) ∩ `ConsentRestriction` (child narrowing) → `SessionConsentSnapshot` frozen at session start (`onDelete: Restrict`, no UPDATE endpoint), `StudentClaimInvite`, `SessionParticipant`.
- **Identity/access assertions (LOCKED):** `assertOwnsLearnerProfile`, `assertIsSessionParticipant`, `assertEffectiveConsent`.
- **Identity/access log prefixes (LOCKED):** `ahx`, `lpr`, `clm`, `cns`, `tfa`, `msg`.
- **Session-lifecycle log prefixes (registered in design, implement with Phase 3/4):** `slc` (session lifecycle — create/start/end/swap), `wtr` (waiting room — learner arrived/admitted). Spec + event catalog: [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §7; add to `AGENTS.md` per-session-ID registry when implementation starts.
- **Identity/access execution plan (LOCKED, 6 phases):** 1 tutor-2FA → 2 identity → 3 consent → 4 access-swap → 5 messaging → 6 hardening; phases 3+4 Sonnet-tier.

---

## BRANCH & COMMIT REALITY (as of 2026-05-31)

| Branch | Commit | Notes |
|--------|--------|-------|
| **`master`** | `a621a5b` | Production integration line; **does not** contain the V1 doc corpus, Component Phase A, or product legal facades. |
| **`v1-redesign`** | `b798494` (HEAD — moves with commits) | Long-running V1 epic integration branch. Advanced through design-integration commits + **Component Phase B1** (`b798494`, pushed). **This spine + bootstrapper + consent/identity/component/session-lifecycle design docs + Phase A (dark tokens + fonts) + Phase B1 (Tailwind 4.3 + shadcn + auth surfaces) + product `/privacy` + `/terms` facades live ONLY here** until the epic merges. **B1 Vercel deploy VERIFIED READY** (`dpl_2LK8drfHx8tuVhVMsxhVSjFvrbjH`) — Tailwind/shadcn build green on Vercel; local `npx next build` + jest 92/92 + tsc passed. |
| **`interim-capture-attestation`** | `3807e44` | Pushed, **NOT merged.** Interim capture-attestation gate implemented. **Andrew:** `prisma migrate deploy` on preview/prod → real-hardware smoke → `merge --no-ff` to `master`. |

Fresh orchestrator on `master`: `git checkout v1-redesign` → read this spine first, then [`v1-redesign-bootstrapper.md`](v1-redesign-bootstrapper.md).

---

## FLY-PLAN

**Headline Sonnet pass — LANDED 2026-05-31** (`23c65c0`) → [`docs/handoff/session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md). **Implementation is downstream** (Identity Phases 2–4 per design §8); **decision-unblocked 2026-05-31** (essentials-vs-optional split RATIFIED; H-1/H-2 RESOLVED; §9 accepted). Remaining gates: existing BLOCKERs (TOTP encrypt-at-rest; `assertOwnsLearnerProfile`; session-lifecycle Phase-3 BLOCKERs).

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
- Component Phase B1 @ `b798494`: Andrew real-hardware smoke of redesigned auth pages on v1-redesign preview; confirm/reword mortensenapps.com notice copy.

### Pre-merge verification (build-surface)

Branches that touch **fonts, CSS, or build configuration** must pass a real **`npx next build`** locally (exit 0) before `git merge --no-ff` — jest/regression alone is not enough. Canonical file list + rationale: [AGENTS.md § Merging convention](../../AGENTS.md). **Incident (2026-05-31):** Phase A `@5aa3c7d` stacked `next/font` + ESLint-glob breaks invisible to jest; broke every `v1-redesign` deploy until `754dbe5` + `e51d23f`.

---

## Sub-pass tracker

| Pass | Status | Artifact |
|------|--------|----------|
| Component redesign (visual/component layer) | DONE | [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) |
| Session identity + access + consent + auth foundation | **DONE** | [`docs/handoff/session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) (1122 lines) |
| Session-lifecycle + tiered consent (waiting room, swap, consent split, §9) | **DONE (design)** @ `23c65c0` | [`docs/handoff/session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) — implementation slots Identity Phases 2–4 |
| Component Phase A (dark tokens + fonts) | IMPLEMENTED on `v1-redesign` @ `5aa3c7d` (pushed); **pending Andrew real-hardware smoke** | dark tokens migrated off legacy purple `#7c5cff` → Mynka Blue; Fraunces/Inter/JetBrains Mono via `next/font`; CSP unchanged; 25/25 token tests pass |
| Component Phase B1 (Tailwind 4 + shadcn + auth surfaces) | **IMPLEMENTED** @ `b798494` (pushed); **Vercel deploy VERIFIED READY** (`dpl_2LK8drfHx8tuVhVMsxhVSjFvrbjH`); **awaiting Andrew** real-hardware smoke | Tailwind 4.3 + shadcn/ui install; auth surfaces redesigned (login/signup/forgot-password/reset-password/setup) on existing routes; shared `AuthShell`/`MynkWordmark`; mortensenapps.com auth notice on all five surfaces; existing server-action wiring unchanged. Local: `npx next build` + jest 92/92 + tsc green. **B1 follow-ups:** Playwright visual snapshots need `--update-snapshots` after redesign; `color-contrast` axe moved to Playwright fixtures (jsx-a11y v6 removed ESLint rule) — may surface issues on non-auth admin pages when visual tests run. **Andrew:** confirm/reword proposed notice ("Sign-in is securely handled by Mortensen Apps (mortensenapps.com)."). |
| Component Phase B2 (dashboard / student list / detail) | **NEXT visible-UI candidate** (after B1 smoke) | Per component-redesign design — dispatch after B1 Andrew sign-off |

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

## Open items

### Andrew-decisions (ratification / product)

- ~~**Ratify essentials-vs-optional split**~~ **RESOLVED 2026-05-31:** RATIFIED AS-IS (table above; session-lifecycle design §4.1).
- ~~**H-1 — Canvas on swap**~~ **RESOLVED 2026-05-31:** Session B **starts blank** — no carry-forward of Session A whiteboard canvas (privacy + clean attribution; tutor-preferred).
- ~~**H-2 — Swap in solo mode**~~ **RESOLVED 2026-05-31:** mid-session learner swap **IS allowed** when no learner has joined Session A yet (solo / no-learner-joined — effectively selecting/assigning the learner).

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
- ~~**Q-5 — Tutor 2FA recovery**~~ **LOCKED Option 1:** backup codes → **admin reset**; **NO email self-serve** first pass. Phase 1 policy gate cleared; **TOTP-encrypt-at-rest BLOCKER** remains.
- ~~**Q-6 — ShareLink / existing-data migration**~~ **LOCKED:** **NO indefinite grandfather**; existing data **NOT exempt** from consent-gates-capture; migration when V1 lands; interim attestation gate bridges. *(Supersedes identity design doc "90-day ShareLink grandfather.")*
- ~~**Q-7 — Messaging**~~ **LOCKED:** parent send v1; student **read-only** v1; student-send fast-follow.
- ~~**Q-8 — Adult self threshold**~~ **LOCKED:** **18+** = `isSelfLearner` self-manage; parent-reported age; child cannot self-promote until reported age 18.
- ~~**Q-9 — Email provider**~~ **LOCKED:** app-signed transactional (Resend/Postmark class).
- ~~**Q-S1 — Audio default**~~ **RESOLVED:** explicit **RECOMMENDED but UNCHECKED** opt-in (no pre-check, no forced-on); consent up-front + student-side.

### BLOCKERs (3)

- TOTP secrets encrypted at rest **before Phase 1**.
- `assertOwnsLearnerProfile` exists + negative-tested **before Phase 2** data routes.
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

1. **Session-lifecycle + consent implementation — DECISION-UNBLOCKED (2026-05-31):** essentials-vs-optional split RATIFIED; H-1/H-2 RESOLVED; consent-gates §9 accepted. Dispatch Identity Phases 2–4 per design §8 when BLOCKERs clear. **Remaining gates (unchanged):** TOTP encrypt-at-rest **before** Identity Phase 1; `assertOwnsLearnerProfile` **before** Phase 2 data routes; **plus** session-lifecycle Phase-3 acceptance BLOCKERs (table above).
2. **BLOCKERs remain:** TOTP encrypt-at-rest (Phase 1); `assertOwnsLearnerProfile` (Phase 2); umbrella deploy + OpenAI DPA + functioning deletion-request inbox (disclosure floor); session-lifecycle Phase-3 BLOCKERs.
3. **Component UI:** **Phase B2** (dashboard / student list / detail) = next visible-UI candidate **after** B1 Andrew smoke. **B1 awaiting Andrew:** real-hardware smoke redesigned auth on v1-redesign preview; confirm/reword mortensenapps.com notice; Playwright `--update-snapshots` + possible `color-contrast` findings on non-auth admin pages.
4. **Andrew parallel:** interim `interim-capture-attestation` migrate → smoke → merge; umbrella `coppa-312-10-disclosure` review+deploy; Phase A real-hardware smoke; pilot purge confirm+execute.
5. **Sarah-pending:** test-students audit (real vs test; what to keep) — pilot real-minor data purge already approved.
6. **Solo in-person recording (V1 prod goal):** implement with consent gating + component design **B-5** acceptance before enabling `soloEnabled` in production.
7. Keep this spine + bootstrapper + chat todo list in sync at every handoff.
