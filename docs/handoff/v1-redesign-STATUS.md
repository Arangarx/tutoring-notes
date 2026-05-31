# V1 Redesign — Epic Status & Decisions Spine

**Date:** 2026-05-31  
**Branch:** `v1-redesign` (long-running integration branch)  
**Purpose:** Single source of truth for the multi-day V1 redesign; re-read at the top of any fresh chat so the thread survives.

---

## Decisions ledger (LOCKED)

- **Brand:** Mynka Blue palette (light done in tokens.css; dark = legacy purple, to migrate) + Fraunces V4/V2 + Inter 400 + JetBrains Mono fonts (never implemented). Light `--accent-on`=#15203A (Option A).
- **IA/URL:** session-centric; `/sessions/[wsid]`; parent share `/s/`→`/share/`; student join `/w/`→`/join/`; operator tools `/superadmin`; `/admin/` removed from tutor surface; 301 redirects; no scheduling in v1 (next-actions landing).
- **Identity model (LOCKED, Opus-designed):** 3 principals — AccountHolder (parent for minors / student for adults; email-verified; holds billing/consent/comms/2FA), LearnerProfile (child; first-class but low-privilege access principal; optional own email+login), tutor Student record links on claim. Child login = parent-provisioned username+PIN + sticky device sessions + optional child-email upgrade.
- **Consent = permission lattice:** parent sets ceiling at claim time; child narrows-only; effective = parent ∩ child; server-side enforced; versioned + frozen-effective-at-session-start; revocation stops future capture (existing-recording retention = OPEN legal decision).
- **2FA:** opt-in/encouraged for parents+students; MANDATORY for tutors+admins/superadmins (TOTP+backup codes+recovery; never locked out pre-session).
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
| Component Phase A (dark tokens + fonts) | AVAILABLE, no deps | implementation, not design |

---

## Open items

### Sarah-pending

- Account-ownership default (parent vs adult-self).
- Consent toggle list + `allowAudioRecording` default.

### Andrew-decision (7)

- **Q-3 — Recording retention on revocation** (**LEGAL — do not implement either direction without explicit guidance**).
- **Q-4 — Child device session lifetime** (180d proposed).
- **Q-5 — Tutor 2FA lockout recovery path**.
- **Q-6 — ShareLink sunset timeline** (90d proposed).
- **Q-7 — Student-in-messaging scope**.
- **Q-8 — Adult self-managed age threshold**.
- **Q-9 — Messaging email provider** (tutor-signed Gmail vs app-signed transactional).

### BLOCKERs (3)

- TOTP secrets encrypted at rest **before Phase 1**.
- `assertOwnsLearnerProfile` exists + negative-tested **before Phase 2** data routes.
- Umbrella mortensenapps.com privacy/terms updated: COPPA consent mechanism + minor data inventory **before Phase 2**; messaging as data surface **before Phase 5**.

---

## Next actions

1. Andrew addresses the **7 identity decisions** + acknowledges **BLOCKERs**.
2. Fold Sarah answers when they arrive.
3. Component Phase A (dark+fonts) can start in parallel anytime.
4. Identity Phase 1 (tutor 2FA) gated on TOTP-encrypt BLOCKER + Q-5 recovery decision.
5. Lifecycle-flow design pass runs after identity ratification.
6. Keep this spine + the chat todo list in sync at every handoff.
