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
- **CONSENT-GATES-CAPTURE (LOCKED 2026-05-31, Andrew — foundational premise catch):** capturing a learner's content — **uploading text, uploading audio, OR recording live audio** — MUST be gated on an **effective consent record** permitting that capture type. No upload/record of a minor's content without consent. The prior design's "anyone-with-link + grandfather existing" left a **dangerous bypass**: a tutor could capture minor audio with zero consent on record (a COPPA collection-without-VPC risk). **Existing data is NOT exempt** — bring it into the consent structure; preserve-don't-delete pending Sarah's keep-list. **Sequencing reality:** the gate can only be ENFORCED once the consent system ships (Phase 3); until then, current pilot capture rides Sarah's tutor-obtained relationship + the disclosure floor, and existing students get claim+consent to continue. **Needs a focused design pass** (Sonnet-tier: consent + recorder/capture flow + existing-data migration + pilot transition) — PENDING Andrew go. This supersedes design-doc §7.2/§7.6 "zero forced migration / indefinite unclaimed links." **Refinements (Andrew 2026-05-31):** hard bar for K-12; applies to everyone but ADULTS self-manage their own capture consent (`isSelfLearner`). Migration path delivered **when V1 lands** (Sarah carries forward test sessions she wants past pilot). **INTERIM MASTER GATE APPROVED:** lightweight tutor attestation before text-upload / audio-upload / live-record (~"capture must be COPPA-gated; parent-side enforcement comes with V1; for now confirm you have consent for this session or it's your own test data") — recorded as a flag+log; MUST be a precondition that does NOT wedge the recorder start path (reliability bar). Design pass DISPATCHED 2026-05-31 (Sonnet) → `docs/handoff/consent-gates-capture-design-2026-05-31.md`; interim-gate impl on master follows from its spec.
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
- **Provisioning:** untied Student stub (tutor-only) -> claim link -> parent email-verified signup -> claim -> authorize child + consent + child login -> only tied profiles can be live-session participants; no links into the wild.
- **Access control:** note/recording/transcript = {tutor, child, parent} only; replaces anyone-with-link sharing. Session has a participant SET (1 now, N later — design for, don't build N's multi-consent now).
- **Billing:** `billedDurationMin` frozen-at-close + immutable (RELIABILITY-REDESIGN Surface 7); rate/amount deferred.
- **Q-1..Q-10** all ratified 2026-05-31 (see component doc [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) §8).
- **Identity/access schema (LOCKED, design landed 2026-05-31):** `AccountHolder` (with `isSelfLearner` for adult collapse), `LearnerProfile`, `LearnerCredential` + `LearnerDeviceSession` (username+PIN + device-bound sticky sessions), `ConsentRecord` (parent ceiling, versioned) ∩ `ConsentRestriction` (child narrowing) → `SessionConsentSnapshot` frozen at session start (`onDelete: Restrict`, no UPDATE endpoint), `StudentClaimInvite`, `SessionParticipant`.
- **Identity/access assertions (LOCKED):** `assertOwnsLearnerProfile`, `assertIsSessionParticipant`, `assertEffectiveConsent`.
- **Identity/access log prefixes (LOCKED):** `ahx`, `lpr`, `clm`, `cns`, `tfa`, `msg`.
- **Identity/access execution plan (LOCKED, 6 phases):** 1 tutor-2FA → 2 identity → 3 consent → 4 access-swap → 5 messaging → 6 hardening; phases 3+4 Sonnet-tier.

---

## Sub-pass tracker

| Pass | Status | Artifact |
|------|--------|----------|
| Component redesign (visual/component layer) | DONE | [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) |
| Session identity + access + consent + auth foundation | **DONE** | [`docs/handoff/session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) (1122 lines) |
| Session-lifecycle flow (waiting room + start/invite) | QUEUED (depends on identity model) | TBD |
| Component Phase A (dark tokens + fonts) | IMPLEMENTED on `v1-redesign` @ `5aa3c7d` (pushed); **pending Andrew real-hardware smoke** | dark tokens migrated off legacy purple `#7c5cff` → Mynka Blue; Fraunces/Inter/JetBrains Mono via `next/font`; CSP unchanged; 25/25 token tests pass |

---

## Open items

### Sarah-pending

- ~~Account-ownership default (parent vs adult-self)~~ **RESOLVED 2026-05-31 (Sarah):** parent-held profile the student uses (parent-primary). Confirms locked "parent for minors." Sarah flags **multiple kids per parent** as common → multiple LearnerProfiles under one AccountHolder is a near-term case (model already supports; not the N-in-one-session case).
- Consent toggle list + `allowAudioRecording` default. **Must include** the new educational-use toggle (LOCKED to add, see ledger). **← still open; good thing to ask Sarah now.**
- **Test-students audit (NEW 2026-05-31):** which students Sarah entered are REAL vs test? Real → prompt claim+consent (no exemption from consent-gates-capture). Test → purge. **What stored data does she need to keep?** (preserve until she answers).

### Andrew-decision (7)

- **Q-3 — Recording retention on revocation** — interim posture LOCKED (see ledger); end-state (proactive-offer vs on-request) GATED on COPPA legal review. Admin deletion-capability build approved. Educational-use consent toggle approved.
- ~~**Q-3b — Retention timeframe**~~ RESOLVED 2026-05-31: active + 24mo post-closure.
- **Q-3c — OpenAI/Whisper classification** — research landed (`73790d4`, `docs/handoff/openai-data-retention-2026-05-31.md`): `/v1/audio/transcriptions` shows abuse-monitoring=None + app-state=None + no-train-by-default + DPA names OpenAI as processor ⇒ **favors service-provider reading; NO consent-gate needed.** Operational guardrails (not counsel-gated): (a) use **only `/v1/audio/transcriptions`** for session audio (avoid Realtime/Files routes — different retention); (b) confirm Mynk's OpenAI **DPA is executed**; (c) **disclose OpenAI as a subprocessor** in privacy notice (part of disclosure floor). Counsel-later only if a retention surprise appears.
- **Q-3d — Business-record retention vs PII deletion** (counsel-later): confirm session-occurred + billed-duration + amount + audit logs may persist after a child-PII deletion + required scrubbing standard. **Largely mooted** by the separation principle (records hold no PII by design).
- ~~**Q-4 — Child device session lifetime**~~ RESOLVED 2026-05-31: Option B, 90-day sliding, parent-revocable, join + child-narrowing scope.
- **Q-5 — Tutor 2FA lockout recovery path** — **LOCKED 2026-05-31 (Option 1):** backup codes → admin reset only; **NO email self-serve on first pass** (documented Phase-6+ candidate; if ever added, must be step-up, never email-alone). Compromised-email liability noted for counsel. (Lower-privilege parent/student email-recovery-after-identity-verification already in design.) ⇒ Phase 1 policy gate cleared; only the **TOTP-encrypt-at-rest BLOCKER** remains before Phase 1.
- **Q-6 — ShareLink sunset / existing-data migration — DIRECTION SHIFTED 2026-05-31 (Andrew, premise catch):** REJECT the design doc's "indefinite grandfather / zero forced migration." Existing students+data are NOT exempt from the new consent structure. Instead: bring existing into the structure (claim+consent to continue), **preserve (don't delete) stored data** until Andrew asks Sarah what she needs to keep, then migrate/quarantine. Sunset/grandfather window becomes a transition-to-consent window, not a permanent bypass. **Mechanics need a design pass** (see capture-gate principle in ledger). Sarah test-students must be audited (real → prompt claim+consent; test → purge).
- ~~**Q-7 — Student-in-messaging scope**~~ LOCKED 2026-05-31: parent-only send for v1; student read-only (where in conversation + consent); student-send designed-but-gated (email-verified LearnerProfile + parent "include student" toggle) as fast-follow, not launch.
- ~~**Q-8 — Adult self-managed age threshold**~~ LOCKED 2026-05-31: **18+ self-consents** (`isSelfLearner`); under-18 requires parent AccountHolder. Age is **parent-reported + child-immutable**; **child cannot self-promote to self-managed until parent-reported age reaches 18**. Parent misreporting age = accepted residual risk (nothing we can do).
- ~~**Q-9 — Messaging email provider**~~ LOCKED 2026-05-31: **app-signed transactional** (Resend/Postmark) for messaging notifications (platform message, deliverability, keeps tutor Gmail scope limited). Cost: new provider + CSP origin + PLATFORM-ASSUMPTIONS update (Phase 5).

### BLOCKERs (3)

- TOTP secrets encrypted at rest **before Phase 1**.
- `assertOwnsLearnerProfile` exists + negative-tested **before Phase 2** data routes.
- Umbrella mortensenapps.com privacy/terms updated: COPPA consent mechanism + minor data inventory **before Phase 2**; messaging as data surface **before Phase 5**. **⚠ NOW URGENT (not just Phase-2 gated):** §312.10 specific-retention-timeframe deadline (2026-04-22) already passed → umbrella likely currently non-compliant. **Andrew GREENLIT pull-forward 2026-05-31** as a DISCLOSURE-floor task (NOT counsel-gated). Must publish: (1) retention timeframe = **active + 24mo post-closure**, (2) disclosed parent deletion-request path, (3) data inventory incl. minor audio + OpenAI processing, (4) revocation + educational-use mechanics. Spans umbrella (canonical, **separate repo** — static HTML `privacy/index.html`+`terms/index.html`) + product `/privacy` + `/terms` facades per LEGAL-SYNC. **HARD RULE (Andrew 2026-05-31):** umbrella privacy/terms are the **Google-OAuth-APPROVED** docs — child/product sites may **EXPAND but NEVER TRUNCATE**; all umbrella edits must be **PURELY ADDITIVE** (no deletion/reword-to-shorten/restructure of existing approved disclosures). Capture this in LEGAL-SYNC.md. **DONE (additive-only verified):** umbrella on branch `coppa-312-10-disclosure` (`f77ed4b`, pushed, NOT merged/deployed — Andrew reviews+deploys); product facades on `v1-redesign` (`29f5e88`). Diff 66+/2− (the 2 deletions = "Last updated" strings only); before/after inventory confirms no approved clause lost. (COPPA brief `210e4f4` informs it.)
  - **RESOLVED 2026-05-31 (Andrew):** the product app serves only Sarah until v1 is live → **full disclosures land WITH the `v1-redesign` branch; NO separate master facade patch.** Umbrella branch (`coppa-312-10-disclosure`) remains for Andrew review+deploy (public canonical + OAuth-registered; additive+safe — recommend deploying soon, but not gating).
  - **ACTION (Andrew, has teeth):** (a) **verify/execute the OpenAI DPA** in dashboard — we DISCLOSED "subprocessor under a DPA"; must be made true or the copy is inaccurate. (b) **Monitor `arangarx+tutoringnotes@gmail.com`** + be able to honor deletion requests manually from day one (disclosed path must function). (c) Review+deploy umbrella branch.
  - **VPC method** (§312.5) intentionally NOT yet disclosed — add once consent flow built (Phase 2/3), before that ships.

### Legal / business threads (Andrew + counsel)

- **COPPA legal review** — run the dispatched research brief (`docs/handoff/coppa-compliance-research-2026-05-31.md`) past actual counsel before Phase 3; resolves Q-3 end-state (proactive-offer vs on-request deletion).
- **LLC formation** — Andrew raised twice; prudent liability shield before scaling minor-data handling. Business/legal call for Andrew + counsel; tracked so it doesn't evaporate.

### Approved-to-build (from Q-3 ratification)

- **Admin-only recording-deletion capability** — manual now, auto-able later; behind the scenes, not customer-facing; honors legal/COPPA deletion requests. Not wired to any auto/proactive revocation trigger until legal answers Q-3 end-state.

---

## Next actions

1. Andrew addresses the **7 identity decisions** + acknowledges **BLOCKERs**.
2. Fold Sarah answers when they arrive.
3. Component Phase A (dark+fonts) can start in parallel anytime.
4. Identity Phase 1 (tutor 2FA) gated on TOTP-encrypt BLOCKER + Q-5 recovery decision.
5. Lifecycle-flow design pass runs after identity ratification.
6. Keep this spine + the chat todo list in sync at every handoff.
