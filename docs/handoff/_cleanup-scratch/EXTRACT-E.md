# BATCH E extraction — auth / identity / session / security

> **Worktree:** `tutoring-notes-merge-audio` · branch `chore/doc-cleanup-master`  
> **Generated:** 2026-07-09  
> **Sources:** 14 docs — `SEC-1-STATUS.md`, `AUTH-IDENTITY-REDESIGN.md`, and 12 handoff docs listed in MANIFEST batch E.

---

## CARRY table

| Item | Area | Priority | Evidence | Source doc |
|------|------|----------|----------|------------|
| **Gate B2 — real consent lattice + parent consent management UI** | Consent / COPPA | **P0** | `CONSENT-COLLECTION-COMPLETENESS` ratified Sarah-merge blocker; B2 Step 6 deferred — no parent UI to view/change per-tutor consent after claim (`/account/children/[id]` editor + update route). Claim still has "Coming soon — Phase 3" lineage; `assertOwnsConsentRecord` exists but full `ConsentRecord` enforcement not flipped. B2-AC-1/2: per-tutor re-consent at claim/reconnect, no silent carry-over. | `authed-session-access-design-2026-06-10.md` §9, `session-identity-access-design-2026-05-31.md`, BACKLOG Gate B2 |
| **CONSENT-COLLECTION-COMPLETENESS CC-1/CC-2** | Consent / session start | **P0** | CC-1: cannot start session without claimed student; CC-2: claim requires explicit consent choice (Save prefs OR explicit decline → ALL-OFF `ConsentRecord`). BACKLOG ratified 2026-06-30 as Sarah-merge blocker. | BACKLOG, `authed-session-access-design-2026-06-10.md` |
| **Security Tier B — `npm audit` dependency pass (SHOULD-FIX-4)** | Security / deps | **P1** | Tier B findings doc: SHOULD-FIX-1/2/3 shipped; **SHOULD-FIX-4 deferred** — 22 vulns (8 high), `npm audit fix` no-op due to peer conflicts. BACKLOG § npm audit baseline → Phase 9f Tier B. | `security-tier-b-findings-2026-06-11.md`, BACKLOG |
| **Join denial UX — authenticated wrong principal still gets bare `404`** | Join / UX | **P1** | Notes path **shipped** neutral denial: `share-access-scope.ts` redirects wrong owner/learner → `/account/not-my-notes`. Join path **still** `notFound()` for `not_self_learner`, `not_owner`, child cross-learner `not_participant` (`join/[sessionId]/page.tsx` L141–200). Asymmetry: logged-in wrong account on join sees generic 404, not a navigable denial page. Playwright intentionally expects 404 for security on wrong-learner child path — product may want `/account/not-my-session` (or similar) for authenticated mismatches only. | `authed-session-access-design-2026-06-10.md` (P2-AC-2 404 security), `share-access-scope.ts`, `join/[sessionId]/page.tsx` |
| **WB-PARENT-JOIN-AS-CHILD — `parent_session_select` learner picker** | Join / identity | **P1** | Fast-follow never built. AH session only joins when `isSelfLearner`; parent + `account_holder_session` child → `not_self_learner` denial. Interim: `ParentJoinGapCallout` shipped. | `identity-phase2-auth-session-design-2026-06-01.md`, `session-identity-access-design-2026-05-31.md` IAC-6, BACKLOG |
| **WB-ADULT-JOIN-ENABLEMENT B2-signup / B3 / B4** | Join / onboarding | **P1** | B1 won't-fix (Sarah 2026-06-30). **Open:** B2-signup `ClaimSignupForm` never passes `isSelfLearner`; B3 gate claim `/setup` PIN to child only; B4 parent→self-learner toggle post-create. Stale-cookie fallthrough improved but wrong-PIN-then-self-learner 404s still reported in smoke. | `plan1-lifecycle-authed-join-smokebook.md`, BACKLOG `WB-ADULT-JOIN-ENABLEMENT` |
| **SMOKE-PRIV-1 — learner sign-out leaves AH session on shared device** | Session / privacy | **P1** | Learner logout clears only `mynk_learner_session`; AH cookie persists → parent account visible on shared device. Andrew 2026-07-04: must NOT leave someone else's session going. | BACKLOG (identity-phase2 §5.1 lineage), `identity-phase2-auth-session-design-2026-06-01.md` |
| **VERIFY-ACCT-1 — duplicate-account creation block** | Signup / auth | **P1** | Andrew has both parent + tutor under same email; verify whether signup blocks duplicate realm creation. | BACKLOG |
| **BL-RESET-DOMAIN — reset email link should respect originating host** | Auth / preview SSO | **P1** | Reset from `preview.usemynk.com` links to `*.vercel.app` → preview SSO cookies don't apply. `getPublicBaseUrl` vs request Host. Found during 2FA smoke. | `2fa-remember-device-smokebook-2026-06-13.md`, BACKLOG |
| **SEC-1 R3 — cross-preview impersonation SSO (usemynk cutover)** | Impersonation / deploy | **P1** | SEC-1-STATUS open: impersonation cookie + preview domain alignment deferred until usemynk production cutover; cross-preview SSO continuity not proven. | `SEC-1-STATUS.md`, `sec-1-impersonation-design-2026-05-30.md` |
| **Session wrong-identity Q4 — AH cookie `SameSite=Lax` follow-on** | Session / cookies | **P2** | Design deferred Lax for AH until after verify-host fix. **RC-A shipped** (`getRequestBaseUrlSafe`, handoff verify-done). AH cookie still `SameSite=Strict` (`account-holder-session.ts` L229); trusted-device cookie uses Lax (`admin-trusted-device.ts`). Open if cross-site AH flows still break. | `session-wrong-identity-fix-design-2026-06-05.md` Q4 |
| **2FA remember-device — open product decisions (Andrew confirm)** | 2FA | **P2** | Plan § open decisions: (1) `__Secure-` cookie prefix on trusted-device token? (2) max trusted devices per admin? (3) backup codes + remember-device interaction policy? Rev 3 **intentionally removed** impersonation from step-up scope. | `2fa-remember-device-plan-2026-06-13.md`, `2fa-remember-device-5axis-2026-06-13.md` |
| **BL-RESET-GENERATE — Chrome suggest-password on `/reset-password`** | Auth UX | **P2** | 2FA smokebook item B **FAIL**; Credential Management save works but generate dropdown missing. `ba2012a` username-field attempt reverted. | `2fa-remember-device-smokebook-2026-06-13.md`, BACKLOG |
| **BL-ADMIN-UUID-PICKER — admin 2FA reset target picker** | Admin / 2FA | **P2** | Smokebook test 10 note: pasting UUID tedious; wants typeahead/list. | `2fa-remember-device-smokebook-2026-06-13.md`, BACKLOG |
| **BL-VERIFY-SUCCESS-COPY — post-verify affirmation** | Auth UX | **P2** | Silent landing after `/auth/verify-done`; wants "successfully verified" style copy. | `session-wrong-identity-fix-design-2026-06-05.md` (verify flow), BACKLOG |
| **Notes first-class authenticated chrome (P2-AC-12/13)** | Notes / identity | **P2** | Phase 2: notes inside parent/child authenticated site chrome with normal nav — not standalone share dead-end. `NOTES_AUTH_WALL` + `not-my-notes` shipped for `/s/*`; full chrome integration deferred. | `authed-session-access-design-2026-06-10.md` §4.10, BACKLOG |
| **WB-JOIN-LEARNER-SESSION-PERSISTENCE — student re-login on tab switch** | Learner session | **P2** | Learner session may not persist across tabs; dual-device takeover interaction. | BACKLOG |
| **Signup waitlist — REJECTED status + revocation UI** | Tutor onboarding | **P2** | Smokebook deferred TODOs: no `REJECTED` enum path, no operator revocation UI, no approval email to tutor, no approval status on tutor settings page. B1 approval gating **shipped** (`TutorApprovalStatus`, `/admin/pending-approval`). | `signup-waitlist-smokebook-2026-06-11.md` |
| **Signup waitlist — pagination + Google OAuth auto-provision** | Tutor onboarding | **P3** | Deferred in smokebook: waitlist table pagination; auto-provision tutor on Google OAuth (auth today credentials-only). | `signup-waitlist-smokebook-2026-06-11.md`, BACKLOG Google OAuth wave |
| **AUTH-IDENTITY-REDESIGN — unified login/signup post-Sarah** | Identity UX | **P3** | Entire redesign deferred: single non-tutor entry, dot-in-segment routing (`username@familyid` vs email), role picker at signup, parent→account-holder copy. Ratified design doc; not built. | `AUTH-IDENTITY-REDESIGN.md`, BACKLOG `AUTH-FAMILYID-*`, `IAC-PARENT-TERMINOLOGY` |
| **AUTH-AGE-NO-HARD-CUTOFF + counsel on COPPA copy** | Legal / signup | **P3** | No hard age gate; self-attested capacity; legal framing needs counsel before absolute age claims in copy. | `AUTH-IDENTITY-REDESIGN.md`, BACKLOG |
| **AUTH-FAMILYID-NO-DOT-INVARIANT — guard tests** | Auth routing | **P3** | Dot-free `familyId` invariant for login routing; slugify satisfies today but no explicit guard test suite. | `AUTH-IDENTITY-REDESIGN.md` §5.4, BACKLOG |
| **Identity Phase 3–6 — ConsentRecord models, messaging, ShareLink sunset, AH 2FA enrollment** | Identity roadmap | **P3** | Phase 3 consent lattice + messaging (Phase 5), ShareLink deprecation, AccountHolder opt-in 2FA UI (Phase 6), child email upgrade (P2c). P2a/P2b largely shipped. | `identity-phase2-auth-session-design-2026-06-01.md`, `session-identity-access-design-2026-05-31.md` |
| **Cross-realm email uniqueness + Google OAuth signup (one email = one account)** | Auth / OAuth | **P3** | IAC-14: same email cannot exist in AdminUser and AccountHolder; ships with OAuth wave. Option B multi-role rejected. | `session-identity-access-design-2026-05-31.md` IAC-14, BACKLOG |
| **Operator / true-admin login for orgs** | Identity / product | **P3** | Distinct operator entry from tutor login for university pitch; `/operator/*` scaffolding. Not SEC-1 `AdminRole` routing. | `session-identity-access-design-2026-05-31.md`, BACKLOG |
| **BL-IMP-REAL — impersonate real (non-test) accounts** | Impersonation | **P3** | `startImpersonation` hard-blocks `isTestAccount=false` targets; needs step-up, audit, legal. | `sec-1-impersonation-design-2026-05-30.md`, BACKLOG |
| **SEC-1 nice-to-haves — impersonation test-account UI, active-session list, env-only admin startup warning** | Admin / impersonation | **P3** | Design § future: UI to create impersonation test accounts; list active impersonations; warn when `ADMIN_EMAIL` env-only admin detected at startup. | `sec-1-impersonation-design-2026-05-30.md`, `SEC-1-STATUS.md` |
| **BL-A / BL-B — tutor-visible consent + educational-use toggle** | Consent UX | **P3** | Gate B2 follow-ons: tutor sees parent consent state on student detail/scheduler; new educational-use consent toggle + migration. | BACKLOG, `session-identity-access-design-2026-05-31.md` |
| **PARENT-INITIATED-TUTOR-REQUEST** | Identity / consent | **P3** | Parent pre-selects tutor + per-tutor privacy before tutor creates student link. Post-Sarah. | BACKLOG |
| **Auth-form unification (8 credential forms)** | UX / composition | **P3** | Password primitive drift across reset, change-password, PIN forms; fold into component redesign. | BACKLOG (identity-phase2 lineage) |
| **WB-IMPERSONATION-SESSION — continue in-progress WB after impersonation switch** | Impersonation / whiteboard | **P3** | `assertOwnsWhiteboardSession` has no impersonation bypass; session 404s when adminUserId ≠ impersonated identity. Admin-QA only. | BACKLOG |
| **PLAYWRIGHT-GAP — middleware no-cookie `/join` does not preserve `#k=` fragment** | Join / test | **P2** | Plan1 smokebook + design: unauthenticated hit to `/join/<id>#k=KEY` may lose fragment before `JoinAuthGate` can stash key; BLOCKER path relies on client restore. Related flake: `WB-FLAKE-JOIN-STALECOOKIE`. | `plan1-lifecycle-authed-join-smokebook.md`, `authed-session-access-design-2026-06-10.md`, BACKLOG |
| **Plan1 authed-join smoke — dual-device takeover + waiting-room A/V hardware failures** | Join / A/V (cross-cut) | **P2** | Smokebook overall **FAIL**: dual-device takeover broken; waiting-room student tile/meter issues; top-bar spacing. Not pure auth but surfaced on authed-join validation pass. | `plan1-lifecycle-authed-join-smokebook.md` |
| **Session lifecycle redesign brief — auto-recording, P0 wall-clock timeline, LTX assembly** | Recorder / lifecycle | **P2** | Brief scopes recorder paradigm (always-on), timeline honesty, LTX fix — **separate thread** from auth batch; listed because source doc was in batch E. Not auth/identity work. | `session-lifecycle-redesign-brief-2026-06-02.md` |

---

## Already-in-backlog list

Cross-check `docs/BACKLOG.md` — these OPEN items from BATCH E sources are **already tracked** (do not duplicate as new backlog rows):

| BACKLOG ID / section | Overlaps BATCH E item |
|---------------------|----------------------|
| **WB-PARENT-JOIN-AS-CHILD** | `parent_session_select` learner picker |
| **WB-JOIN-ADULT-LEARNER** | Adult routing done; E2E blocked on enablement gaps (stale cookie improved) |
| **WB-ADULT-JOIN-ENABLEMENT** | B2-signup, B3, B4 open; B1 won't-fix |
| **WB-JOIN-LEARNER-SESSION-PERSISTENCE** | Tab-switch re-login |
| **WB-FLAKE-JOIN-STALECOOKIE** | Join route cold-compile flake (related to plan1 fragment path) |
| **CONSENT-COLLECTION-COMPLETENESS** | CC-1/CC-2 Sarah-merge blocker |
| **Gate B2 — parent privacy consent** | Full consent lattice + B2-AC-1/2 |
| **B2 parent consent management UI (Step 6)** | Post-claim consent editor |
| **BL-A / BL-B / F1** | Tutor-visible consent, educational-use toggle, allowLiveSession framing |
| **AUTH-IDENTITY-REDESIGN** (+ **AUTH-FAMILYID-***, **AUTH-AGE-***, **IAC-PARENT-TERMINOLOGY**) | Post-Sarah unified auth UX |
| **BL-IMP-REAL** | Real-account impersonation |
| **BL-RESET-DOMAIN / BL-ADMIN-UUID-PICKER / BL-RESET-GENERATE / BL-VERIFY-SUCCESS-COPY** | 2FA smoke follow-ups |
| **SMOKE-PRIV-1** | Shared-device dual-cookie privacy |
| **VERIFY-ACCT-1** | Duplicate email across realms at signup |
| **Operator / true-admin login** | Org operator entry |
| **Google OAuth sign-in + cross-realm uniqueness** | Post-V1 OAuth wave |
| **npm audit / Tier B (SHOULD-FIX-4)** | Dependency upgrade pass |
| **Notes first-class authenticated integration** | P2-AC-12/13 |
| **WB-IMPERSONATION-SESSION** | Impersonation whiteboard continue |
| **Auth-form unification** | 8-form password primitive drift |
| **PARENT-INITIATED-TUTOR-REQUEST** | Parent-initiated tutor connect |

**Not yet in BACKLOG (CARRY-only from BATCH E):**

- Signup waitlist **REJECTED** status, **revocation UI**, **approval email**, **approval status in tutor settings**, **waitlist pagination** (`signup-waitlist-smokebook-2026-06-11.md` deferred TODOs)
- Join **authenticated wrong-principal → friendly denial page** (notes has `/account/not-my-notes`; join still bare `404`)
- SEC-1 **cross-preview impersonation SSO** (R3 usemynk cutover) — operational, may belong in DEPLOY/BACKLOG ops
- 2FA remember-device **open decisions** (`__Secure-` prefix, max devices, backup+remember policy)
- SEC-1 **nice-to-haves** (impersonation test-account UI, active-session list, env-only admin warning)
- Session wrong-identity **Q4 SameSite Lax** for AH cookies (post-RC-A follow-on)

---

## Shipped / obsolete list

| Item | Evidence (src / tests) | Source doc |
|------|------------------------|------------|
| **SEC-1 impersonation (Dispatches A/B/C + role follow-up)** | `src/lib/impersonation.ts`, `src/app/admin/actions/impersonate.ts`, `ImpersonationBanner`, `AdminRole` enum, `assertIsRealAdmin`, impersonation tests | `SEC-1-STATUS.md`, `sec-1-impersonation-design-2026-05-30.md` |
| **Identity P2a — AccountHolder session, learner PIN, claim APIs, middleware gates** | `account-holder-session.ts`, `learner-session.ts`, `/api/claim/*`, `/api/auth/account-holder/*`, identity test suites | `identity-phase2-auth-session-design-2026-06-01.md` |
| **`SessionParticipant` + `/join/[sessionId]` authed join** | `prisma` `SessionParticipant`; `join/[sessionId]/page.tsx`; `session-participant-scope.ts`; `wb-session-lifecycle.spec.ts` | `authed-session-access-design-2026-06-10.md`, `plan1-lifecycle-authed-join-smokebook.md` |
| **Notes auth wall + neutral wrong-owner denial** | `NOTES_AUTH_WALL` middleware; `share-access-scope.ts` → `/account/not-my-notes`; share-access tests | `authed-session-access-design-2026-06-10.md` §4 |
| **IAC-13 — tutor sees connected parent + disconnect** | `ConnectedParentSection.tsx`, `disconnectLearnerProfile` in `actions.ts`, `iac-13-tutor-disconnect.test.ts` | `session-identity-access-design-2026-05-31.md` (was OPEN in design; now shipped) |
| **IAC-6 `attach_existing` claim + connect interstitial** | `ClaimInterstitial.tsx`, `api/claim/[token]/complete` `attach_existing` action | `identity-phase2-auth-session-design-2026-06-01.md` |
| **IAC-10 hard PIN lockout (LearnerLoginThrottle)** | `learner-pin-rate-limit.ts`, Neon `LearnerLoginThrottle` table | `identity-phase2-auth-session-design-2026-06-01.md` |
| **Session wrong-identity RC-A — verify host alignment + handoff verify-done** | `getRequestBaseUrlSafe` (`public-url.ts`); `verify-email/route.ts` handoff token; `auth/verify-done/route.ts`; `session-wrong-identity-fix.test.ts` | `session-wrong-identity-fix-design-2026-06-05.md` |
| **2FA remember device (trusted device cookie)** | `AdminTrustedDevice` model; `admin-trusted-device.ts`; trusted-device-check route; smokebook **overall PASS** | `2fa-remember-device-plan-2026-06-13.md`, `2fa-remember-device-smokebook-2026-06-13.md` |
| **2FA step-up (password re-verify; NOT impersonation per Rev 3)** | `two-factor-step-up.ts`; profile/2fa actions; tests | `2fa-remember-device-5axis-2026-06-13.md` B1 resolved |
| **Tutor approval / waitlist gating (Gate B1)** | `TutorApprovalStatus` enum; `tutor-approval-scope.ts`; `/admin/pending-approval`; middleware WAITLISTED redirect | `signup-waitlist-smokebook-2026-06-11.md`, BACKLOG Gate B1 |
| **Security Tier B SHOULD-FIX-1/2/3** | chunk-transcribe Bearer guard; forgot-password token revocation; upload error sanitization (`chunk-transcribe-enqueue.ts` passes `CRON_SECRET`) | `security-tier-b-findings-2026-06-11.md` |
| **WB-ADULT-JOIN B2-login — claim login converged on shared AH form** | `ClaimAuthGate` → `AccountHolderLoginForm`; `email_not_verified` mapping | BACKLOG `WB-ADULT-JOIN-ENABLEMENT` |
| **Stale learner cookie fallthrough on self-learner join (Path B)** | `join/[sessionId]/page.tsx` L104–130, L185–209: non-participant learner cookie falls through to AH path or JoinAuthGate | `join/[sessionId]/page.tsx`, BACKLOG enablement notes |
| **Parent join gap interim honesty** | `ParentJoinGapCallout.tsx` on dashboard/child detail | BACKLOG `WB-PARENT-JOIN-AS-CHILD` |
| **SEC-1 impersonation step-up removed from 2FA scope** | Rev 3 plan + 5axis B1: intentional; impersonation not in trusted-device step-up list | `2fa-remember-device-plan-2026-06-13.md` |
| **Signup waitlist smoke core path** | Signup → WAITLISTED → pending-approval → operator approve → tutor access; smokebook exercises B1 | `signup-waitlist-smokebook-2026-06-11.md` |
| **Design-only / superseded** | `session-lifecycle-redesign-brief` auto-recording + timeline = recorder thread, not identity; `AUTH-IDENTITY-REDESIGN` supersedes piecemeal parent-login renames | respective source docs |

---

## Per-doc archive note table

| Source doc | Disposition | Notes |
|------------|-------------|-------|
| `docs/SEC-1-STATUS.md` | **Archive after extract** | Implementation record; SEC-1 shipped. Retain cross-ref to impersonation code + open R3/nice-to-haves in BACKLOG/CARRY. |
| `docs/AUTH-IDENTITY-REDESIGN.md` | **Keep as ratified spec (living until post-Sarah build)** | Canonical post-Sarah auth UX; not obsolete — entire scope deferred. Link from BACKLOG identity section. |
| `docs/handoff/sec-1-impersonation-design-2026-05-30.md` | **Archive** | Design artifact for shipped SEC-1; historical value for BL-IMP-REAL requirements. |
| `docs/handoff/identity-phase2-auth-session-design-2026-06-01.md` | **Archive (partial-shipped)** | P2a/P2b/P2c-split: core session infra shipped; Phase 3–6 + P2c items → BACKLOG/CARRY. |
| `docs/handoff/authed-session-access-design-2026-06-10.md` | **Archive (partial-shipped)** | Phase 1 join + notes wall shipped; §9 Gate B2 + §4.10 Phase 2 notes chrome open. |
| `docs/handoff/session-identity-access-design-2026-05-31.md` | **Archive (partial-shipped)** | Large identity roadmap; IAC-13 shipped; IAC-6/10/14 and Phases 3–6 deferred. |
| `docs/handoff/session-wrong-identity-fix-design-2026-06-05.md` | **Archive (mostly shipped)** | RC-A + verify-done landed; Q4 SameSite Lax may remain as minor follow-on. |
| `docs/handoff/session-lifecycle-redesign-brief-2026-06-02.md` | **Archive (out-of-band)** | Recorder/lifecycle thread — **not** auth batch substance; do not merge into identity backlog except cross-links. |
| `docs/handoff/plan1-lifecycle-authed-join-smokebook.md` | **Archive (smoke artifact)** | Authed-join validation smoke; extract hardware FAILs + PLAYWRIGHT-GAP; not a spec. |
| `docs/handoff/2fa-remember-device-plan-2026-06-13.md` | **Archive (shipped)** | Feature built; open decisions → CARRY/backlog nits. |
| `docs/handoff/2fa-remember-device-5axis-2026-06-13.md` | **Archive** | Adversarial review record; B1 impersonation scope resolved. |
| `docs/handoff/2fa-remember-device-smokebook-2026-06-13.md` | **Archive (smoke artifact)** | Overall PASS; item B FAIL → BL-RESET-GENERATE; test 10 → BL-ADMIN-UUID-PICKER. |
| `docs/handoff/security-tier-b-findings-2026-06-11.md` | **Archive (mostly shipped)** | SHOULD-FIX-4 deps remain; incident/secret runbooks referenced elsewhere. |
| `docs/handoff/signup-waitlist-smokebook-2026-06-11.md` | **Archive (smoke artifact)** | B1 gating validated; deferred operator UX (reject/revoke/email) → CARRY for BACKLOG ingest. |
