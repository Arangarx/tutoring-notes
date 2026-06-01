# Road to General Availability — Mynk (tutoring-notes)

**Last updated:** 2026-06-01

> **Living doc.** Refresh item **Status** columns as identity phases, Wave 1 reliability, and legal/ops work land. Ground truth for engineering state: [`docs/handoff/v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md) + [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md). This doc is a **launch-readiness hub** — it does not replace phase specs or the wave map.

---

## Bottom line

The visible product spine — **V1 redesign** (component + identity phases 1–6), **live video transport** (essential tier today; camera-video recording post-V1), **full-session reliability hardening** (Wave 1), **payments**, **org accounts**, and **brand/social presence** — is mostly **engineering time** on a path already sequenced in [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md). The GA tail beyond that spine is the same shape: **time + cheap SaaS tooling**. Only **two items are real cash** — **legal counsel** (COPPA/privacy consult) and a **formal third-party pen-test** — and both are **scope-able and deferrable**.

**You can charge a small known cohort with cheap items only.** Gate 1 (payments) has **no expensive blockers**. The expensive stuff is **scale-gated and minor-data-gated**, not money-gated: counsel matters when you collect minor data from people you don't personally vet; a paid pen-test matters when you become a juicy public target — not when Sarah and two trusted tutors pay you.

---

## How to read this doc

### Three gates (different triggers)

| Gate | Trigger | Question it answers |
|---|---|---|
| **Gate 1 — Take payments at all** | You want to charge even a few known tutors | Can we legally/process-wise accept money? |
| **Gate 2 — Collect minor data from people you don't personally vet** | *Whose kids* — not how much money | Can we onboard unknown parents/children with COPPA-grade consent + disclosure? |
| **Gate 3 — Open to the world at scale** | *Scale / public-unsupervised* — not payments | Are we ready for strangers, load, and adversarial attention? |

Gates are **not** the same event. You may hit Gate 1 before Gate 2 (charge trusted tutors who only use adult learners). You may hit Gate 2 before Gate 3 (invite-only beta with real parents). See **Recommended sequencing** at the end.

### Column legend

| Column | Values |
|---|---|
| **Cost type** | `CASH-$` · `eng-time` · `cheap-tooling` · `one-time-fee` |
| **Status** | `done` · `in-progress` · `planned` · `not-started` (grounded in spine as of 2026-06-01) |
| **Owner** | `Andrew-business` · `eng` |

### Related docs (read these for depth)

| Doc | Role |
|---|---|
| [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) | Canonical wave sequencing — **do not contradict** |
| [`docs/handoff/v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md) | V1 epic spine — identity phases, consent model, current branch reality |
| [`docs/handoff/identity-phase2-auth-session-design-2026-06-01.md`](handoff/identity-phase2-auth-session-design-2026-06-01.md) | AccountHolder/child session infra (P2a–P2c) |
| [`docs/handoff/session-lifecycle-consent-design-2026-05-31.md`](handoff/session-lifecycle-consent-design-2026-05-31.md) | Waiting room, swap, tiered consent, VPC spec |
| [`docs/handoff/coppa-compliance-research-2026-05-31.md`](handoff/coppa-compliance-research-2026-05-31.md) | COPPA §312.5–§312.10 research brief (not legal advice) |
| [`docs/BACKLOG.md`](BACKLOG.md) | Pilot feedback + reliability gaps |
| [`docs/PLATFORM-ASSUMPTIONS.md`](PLATFORM-ASSUMPTIONS.md) | Infra stack, env vars, migration checklist |
| [`AGENTS.md`](../AGENTS.md) | North star + reliability bar |
| [`docs/INDEX.md`](INDEX.md) | Full doc map |
| [`docs/COMMERCIAL-LAUNCH-CHECKLIST.md`](COMMERCIAL-LAUNCH-CHECKLIST.md) | Older scale checklist — complementary, less gate-framed |

---

## Gate 1 — Take payments at all

**Verdict: nothing here is expensive.** Form an entity, wire Stripe, publish refund/terms copy. Sales tax waits until real revenue + nexus.

| Item | Gate | Cost type | Status | Owner | Notes / links |
|---|---|---|---|---|---|
| Form **LLC** (or equivalent entity) | 1 | `one-time-fee` | not-started | Andrew-business | ~$50–800/state depending on jurisdiction. Liability shield before money + minor data. Sole-prop is legal but **not advised** once handling minor PII. Tracked in [`v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md) § Legal/business threads. |
| **Stripe** integration (Checkout / Customer Portal) | 1 | `cheap-tooling` | planned | eng | Per-transaction fee; PCI handled by Stripe; **no card storage**. Sequenced Wave 5 / Phase 10b–10e in [`RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md). Free to integrate. |
| **Terms of Service** + **refund/cancellation policy** copy | 1 | `eng-time` | in-progress | Andrew-business + eng | Product facades on `v1-redesign` (`/terms`, `/privacy`); umbrella canonical at mortensenapps.com per [`LEGAL-SYNC.md`](LEGAL-SYNC.md). Refund language may need a product-specific addendum before charging. |
| **Sales tax** (Stripe Tax or equivalent) | 1 | `cheap-tooling` | not-started | Andrew-business | **Deferred** until meaningful revenue + nexus. Usage-based when needed. |
| Separate **business bank account** | 1 | `one-time-fee` | not-started | Andrew-business | Bookkeeping hygiene once money flows. See also [`COMMERCIAL-LAUNCH-CHECKLIST.md`](COMMERCIAL-LAUNCH-CHECKLIST.md). |
| **Pricing page** (public) | 1 | `eng-time` | planned | eng | Wave 5 item; needed before self-serve billing, not before invoicing a known cohort manually. |

---

## Gate 2 — Collect minor data from people you don't personally vet

**Trigger:** onboarding children whose parents **you don't personally know and vet** — not "first dollar." Most of this is **engineering time already planned** in Identity Phases 2–4. The **one cash item** here is **legal counsel** (scope-able fixed-fee consult, deferrable for a tight invite-only beta on the disclosure floor + well-architected consent).

Current **pilot posture:** Sarah + trusted tutors; **interim capture-attestation gate** on branch `interim-capture-attestation` (not merged); disclosure floor in flight. See [`v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md).

| Item | Gate | Cost type | Status | Owner | Notes / links |
|---|---|---|---|---|---|
| **Identity Phase 2a** — AccountHolder/child session infra + claim back-end | 2 | `eng-time` | planned | eng | **NEXT** on spine. Design ratified: [`identity-phase2-auth-session-design-2026-06-01.md`](handoff/identity-phase2-auth-session-design-2026-06-01.md). Prerequisites merged: p2 schema + `assertOwnsLearnerProfile`. |
| **Identity Phase 2b/2c** — parent/child UI + claim flows | 2 | `eng-time` | planned | eng | Downstream of P2a. Parent-first linking; connect-by-existing-account w/ identity interstitial. |
| **Identity Phase 3** — consent enforcement (`ConsentRecord`, `SessionConsentSnapshot`, `assertEffectiveConsent`) | 2 | `eng-time` | planned | eng | **Real COPPA mechanism** — replaces interim attestation. Design: [`session-lifecycle-consent-design-2026-05-31.md`](handoff/session-lifecycle-consent-design-2026-05-31.md) §4–§6. Sonnet-tier per spine. |
| **Identity Phase 4** — access-control swap; **ShareLink sunset** | 2 | `eng-time` | planned | eng | Participant-set auth; no anyone-with-link for student content. Pairs with Phase 3. |
| **VPC method implemented** (COPPA §312.5) | 2 | `eng-time` | planned | eng | Claim flow + email verification = VPC for minors per session-lifecycle design §4.1. **Disclose method in privacy notice once UI ships** (not yet disclosed — intentional). Research: [`coppa-compliance-research-2026-05-31.md`](handoff/coppa-compliance-research-2026-05-31.md) § Q3. |
| **Disclosed deletion-request path** live + tested (§312.6) | 2 | `eng-time` | in-progress | Andrew-business + eng | Contact email + documented honor-within-~30-days workflow. Admin deletion capability planned; no self-serve button v1. Spine: Q-3 resolved on-request. |
| **Retention timeframe published** in online notice (§312.10) | 2 | `eng-time` | in-progress | Andrew-business + eng | Locked policy: **active relationship + 24 months post-closure**; deletion-on-request sooner. Umbrella branch `coppa-312-10-disclosure` ready for Andrew review/deploy; product facades on `v1-redesign`. **Compliance deadline 2026-04-22 already passed** — deploy is urgent disclosure work, not counsel-gated. |
| **OpenAI DPA executed** + subprocessor disclosed | 2 | `one-time-fee` | not-started | Andrew-business | Dashboard action — copy already discloses subprocessor. Research: [`handoff/openai-data-retention-2026-05-31.md`](handoff/openai-data-retention-2026-05-31.md). Whisper `/v1/audio/transcriptions` only; no Files API for session audio. |
| **Interim capture-attestation gate** (pilot bridge) | 2 | `eng-time` | in-progress | eng | Implemented @ `3807e44` on `interim-capture-attestation`; **not merged**. Bridges until Phase 3 enforcement. [`consent-gates-capture-design-2026-05-31.md`](handoff/consent-gates-capture-design-2026-05-31.md). |
| **Identity Phase 1** — mandatory tutor/admin TOTP 2FA | 2 | `eng-time` | done | eng | Merged to `v1-redesign` @ `b5ef4fe`; smoked 2026-06-01. |
| **Umbrella privacy/terms COPPA additions** (additive-only) | 2 | `eng-time` | in-progress | Andrew-business | Separate mortensen-apps-site repo; branch pushed, **not deployed**. Google-OAuth-approved docs — **expand, never truncate**. [`LEGAL-SYNC.md`](LEGAL-SYNC.md). |
| **Legal counsel pass** — COPPA + privacy fixed-fee consult | 2 | **`CASH-$`** | not-started | Andrew-business | **First real cash item.** Low-four-figures scoped consult — **not** a standing retainer. Deferrable for tight invite-only beta if disclosure floor + architecture are solid. Edge tags: Q-3c OpenAI classification, Q-3d business-record separation. **Not legal advice — see mitigation box.** |

---

## Gate 3 — Open to the world at scale

**Trigger:** public self-serve signup, unsupervised growth, adversarial attention — **not** "first payment." The **second cash item** is a **formal third-party pen-test** (scope-scaled; defer until pre-scale). Security Tier A audit already shipped; adversarial 5-axis reviews are routine per [`AGENTS.md`](../AGENTS.md).

| Item | Gate | Cost type | Status | Owner | Notes / links |
|---|---|---|---|---|---|
| **Formal third-party pen-test** | 3 | **`CASH-$`** | not-started | Andrew-business | ~$2–5k scoped engagement per [`RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) backlog (Phase 10-pre). **Not needed** to charge a few known tutors. "Before you're a juicy public target" formalization. |
| **Load / concurrency testing** | 3 | `eng-time` | not-started | eng | Realistic multi-session + transcribe concurrency; Vercel Pro 300s ceiling in [`PLATFORM-ASSUMPTIONS.md`](PLATFORM-ASSUMPTIONS.md) §1. |
| **Self-serve tutor onboarding** + **support docs / inbox** | 3 | `eng-time` | planned | eng + Andrew-business | Wave 4 user mgmt + Phase 12 org MVP partially cover this. Public landing + `/about` = V1 component Phase D gap. |
| **Mobile / cross-browser matrix** — join + live-session path (iOS Safari, Android Chrome) | 3 | `eng-time` | in-progress | eng | Wave 1 iOS matrix + Phase 8 mobile audit. **Needed sooner than "scale"** — students join on phones. [`BACKLOG.md`](BACKLOG.md) #10. |
| **Wave 1 reliability floor** ("no backup recorder") | 3 | `eng-time` | in-progress | eng | BLOCKER-PROD rows in [`BACKLOG.md`](BACKLOG.md); North star in [`AGENTS.md`](../AGENTS.md). Gate for solo-tutor confidence before broad launch. |
| **Google OAuth verification** (out of Testing mode) | 3 | `eng-time` | not-started | Andrew-business | Required when Gmail connect scales beyond test users. [`GOOGLE-OAUTH-VERIFICATION.md`](GOOGLE-OAUTH-VERIFICATION.md). |
| **Phase 12 org MVP** (department onboarding) | 3 | `eng-time` | planned | eng | Aug 2026 pitch target in [`RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) Wave 5. |
| **PostHog / Phase 11 analytics** | 3 | `cheap-tooling` | planned | eng | Blocked on umbrella legal publish per roadmap backlog. |

---

## Cheap-but-do-early ops (all gates)

High-leverage, low-cost items — **do early regardless of gate**. Mostly `cheap-tooling` + a few hours of `eng-time` to write runbooks.

| Item | Gate | Cost type | Status | Owner | Notes / links |
|---|---|---|---|---|---|
| **Monitoring / alerting** | 1–3 | `cheap-tooling` | not-started | eng | Sentry free tier; Vercel + Neon built-in alerts; OpenAI/Blob/Vercel **cost alerts** (~$25/$50) — operator task in Wave 2 [`RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md). |
| **Backups / DR runbook** | 1–3 | `eng-time` | in-progress | eng | Neon **PITR** on Launch tier (~$19/mo) per [`PLATFORM-ASSUMPTIONS.md`](PLATFORM-ASSUMPTIONS.md). Blob managed by Vercel. **Gap:** written runbook + restore drill. |
| **Email deliverability** (transactional) | 1–3 | `cheap-tooling` | planned | eng | Resend/Postmark class locked Q-9; ~$0–20/mo at low volume. SPF/DKIM/DMARC for `@usemynk.com`. Wave 1 Resend wiring for account-takeover surfaces in backlog. |
| **Operational cost observability** | 1–3 | `eng-time` | in-progress | eng | `CostEvent` table shipped; dashboard Wave 4. [`COST-OBSERVABILITY.md`](COST-OBSERVABILITY.md). |
| **Security hygiene** (automated + process) | 1–3 | `cheap-tooling` | in-progress | eng | Security **Tier A** shipped (`4118f3e`). Dependabot/npm audit; 5-axis adversarial reviews on auth/consent changes. Tier B audit Wave 4. |

---

## Cost mitigation — the two cash items

> **Not legal or security advice.** These are **cost-reducers**, not eliminators. Engage qualified counsel and security professionals before relying on any of this for compliance or threat-model decisions.

### 1. Legal counsel (Gate 2 · `CASH-$`)

| Cost-reducer | What it buys |
|---|---|
| **Fixed-fee / flat-rate COPPA + privacy consult** | One scoped engagement (~low four figures) instead of an open-ended retainer. Bring [`coppa-compliance-research-2026-05-31.md`](handoff/coppa-compliance-research-2026-05-31.md) + architecture docs so billable hours go to review, not education. |
| **Sequence counsel right before broad public minor-data** | Tight invite-only beta on disclosure floor + well-architected consent (Phases 3–4) can precede counsel; don't pay for counsel months before you need the sign-off. |
| **Startup legal programs** | Stripe Atlas perks, Clerky, etc. — often bundle entity formation + template policies at a discount. |
| **Law-school IP/tech clinics** | Some universities offer low-cost founder consults (availability varies). |
| **IAPP / industry policy templates** | Starting draft for privacy/consent copy reduces billable drafting hours — counsel reviews rather than writes from zero. |

### 2. Formal pen-test (Gate 3 · `CASH-$`)

| Cost-reducer | What it buys |
|---|---|
| **Free/cheap automated tooling first** | `npm audit`, Snyk free tier, OWASP ZAP, GitHub code scanning / Dependabot — continuous, not one-shot. |
| **Existing adversarial-review discipline** | 5-axis reliability reviews on auth/consent/recorder changes per [`AGENTS.md`](../AGENTS.md) + [`reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc). |
| **Defer paid third-party pen-test until pre-scale** | Not required to charge a few known tutors. Security Tier A already merged. |
| **Scoped / time-boxed engagement later** | Smaller scope (auth + API boundary + consent flows) vs full enterprise audit; bug-bounty-lite as a follow-on option. |

---

## Recommended sequencing

Aligns with [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) — this table is the GA lens, not a re-sequence.

```text
NOW (pilot / Sarah)
├── Wave 1 reliability floor ───────────────────────────── Gate 3 prep (eng)
├── V1 redesign + Identity P2a → P2c ─────────────────── Gate 2 infra (eng)
├── Cheap-but-do-early ops (monitoring, email, runbook) ─ all gates
└── Disclosure floor deploy (umbrella + DPA + deletion inbox) ─ Gate 2 (Andrew)

TRUSTED-COHORT PAYMENTS (can overlap Wave 1)
├── Gate 1: LLC + Stripe + refund copy ────────────────── no cash blockers
└── Still Gate-2-safe if cohort is adults-only or personally vetted

INVITE-ONLY BETA (unknown parents / minors)
├── Gate 2: Identity Phases 3–4 + VPC + deletion path tested
├── Optional: scoped counsel consult before widening
└── Interim attestation → merge or retire when Phase 3 ships

PUBLIC SCALE
├── Gate 3: pen-test + load test + self-serve + mobile matrix
├── Wave 5: Stripe at scale + org MVP + pricing page
└── Google OAuth verification if Gmail connect goes wide
```

**Pilot stages** (from [`RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md)): (1) private attested pilot ← **current**; (2) paid + scaled; (3) self-serve. Stage-3 requirements are **not** blockers for stage 1.

---

## Product spine vs GA gates (quick map)

| Visible milestone | Primary gate | Roadmap home |
|---|---|---|
| V1 redesign (components + identity 1–6) | 2–3 | [`v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md) |
| Live video transport (A/V essential) | 2 (consent) | [`LIVE-AV.md`](LIVE-AV.md) |
| Camera-video **recording** toggle | 2 | Post-V1 fast-follow per spine |
| Full-session reliability ("no backup recorder") | 3 | Wave 1 [`RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) |
| Payments / billing | 1 | Wave 5 Phase 10 |
| Org / department accounts | 3 | Wave 5 Phase 12 |
| Brand + socials | 1–3 | Wave 3 + [`MYNK-BRAND-PHASE-2-DECISIONS.md`](MYNK-BRAND-PHASE-2-DECISIONS.md) |

---

## Maintenance

- **When to update:** after any identity phase merge, umbrella legal deploy, Stripe ship, or counsel/pen-test engagement — refresh Status columns and add dated notes inline.
- **Who owns the doc:** orchestrator keeps Status honest against [`v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md); Andrew owns business/legal rows.
- **Do not duplicate:** phase acceptance criteria, BLOCKER tables, and migration details stay in design docs and STATUS — link here, don't fork.
