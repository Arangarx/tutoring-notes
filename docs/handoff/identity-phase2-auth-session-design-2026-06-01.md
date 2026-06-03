# Identity Phase-2 AUTH + SESSION INFRASTRUCTURE Design

> **Design date:** 2026-06-01
> **Branch:** `v1-redesign` (HEAD `f41a445` at ratification; design authored @ `e466a26`)
> **Authored by:** Sonnet 4.6 subagent, commissioned by Opus orchestrator
> **Deliverable type:** Design document only — no production code, no migrations applied
> **Prerequisite reads (in order):**
> 1. [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — SPINE; all LOCKED decisions; read first
> 2. [`docs/handoff/session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) — 3-principal model + schema design (~1122 lines); PRIMARY UPSTREAM
> 3. [`docs/handoff/session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) — waiting room, swap, consent split; read §2–§4
> 4. `prisma/schema.prisma` — current schema on `v1-redesign` (Phase-1 2FA merged; Phase-2 models NOT yet merged)
> 5. `src/auth-options.ts`, `src/middleware.ts` — existing tutor/admin NextAuth stack
> 6. `src/lib/learner-profile-scope.ts` on branch `identity-p2-ownership-guard` @ `f74f164` — `assertOwnsLearnerProfile` pre-wired
>
> **What this doc does:** Fills in the auth/session mechanics layer that the upstream identity design left at the data-model level. Covers realm architecture, session storage, PIN login, claim state machine, participant/consent wiring, access guards, schema additions, phasing, and 5-axis adversarial review.
>
> **What this doc does NOT do:** Redesign anything in §1 (Locked Inputs). Does not write migrations, does not touch production code.

---

## §0. DECISIONS — RATIFIED (Andrew 2026-06-01)

> **Status:** **RATIFIED AS RECOMMENDED** (2026-06-01). Table below is the original recommend-and-proceed fork analysis (retained for blast-radius context). **Amendments and clarifications** that extend or refine the recommendations → [§ RATIFIED + AMENDED (Andrew 2026-06-01)](#ratified--amended-andrew-2026-06-01). P2a dispatch is unblocked.
>
> **Original style note:** blast radius describes the cost of choosing the wrong option — heavier blast radius = higher review priority.

| # | Topic | Fork | Recommendation | Blast radius if recommendation is wrong |
|---|---|---|---|---|
| **AH-1** | AccountHolder auth realm | **A: Separate custom realm** — new cookie, new `AccountHolderSession` table, new auth helpers entirely outside NextAuth. **B: Same NextAuth realm** — add AccountHolder as a second CredentialsProvider, role-discriminate in the JWT callback. | **A — Separate realm** | B chosen but wrong: the existing middleware 2FA gate (`token.twoFactorVerified` check on `/admin/*`) must gain an `accountHolder` principal exemption in the most security-critical code in the app. One mistake → a parent silently bypasses the admin 2FA gate or an admin silently bypasses the AccountHolder gate. These bugs are near-impossible to detect via tests alone because both principals share a valid JWT structure. **HIGH** — the wrong decision here is irreversible without a breaking auth migration. |
| **AH-2** | AccountHolder session storage | **A: Opaque DB-backed `AccountHolderSession` table** — server-controlled, immediately revocable. **B: JWT-in-HttpOnly-cookie** — stateless, can't revoke before expiry. | **A — DB-backed** | B chosen but wrong: after a password reset or account compromise, existing sessions remain valid until JWT expiry. A parent who detects unauthorized access cannot be protected server-side — must wait days for JWT to expire. **HIGH** security posture risk for a COPPA-regulated app holding minor data. |
| **AH-3** | AccountHolder opt-in 2FA encryption key | **A: Separate env var `AH_TOTP_ENCRYPTION_KEY`** — isolated from the tutor 2FA key. **B: Reuse `TOTP_ENCRYPTION_KEY`** — one key for both principals. | **A — Separate key** | B chosen: rotating `TOTP_ENCRYPTION_KEY` (e.g., to re-enroll tutors after a key exposure) simultaneously unenrolls ALL parent 2FA. Coupled blast radius on a key-rotation event that should be scoped to one principal. **MEDIUM** — mostly a blast-radius containment decision. |
| **AH-4** | Child PIN rate-limiting / lockout policy | **A: Soft-lockout per device+IP — exponential backoff, NEVER hard account lock.** Cooldown resets after each tier. **B: Hard account lockout after N failures, unlocked only by parent login.** | **A — Soft-lock only** | A chosen but wrong: attacker with the username and enough time gets unbounded PIN guesses (mitigated by 6-digit minimum and per-IP limits). **B chosen but wrong:** child locked out minutes before a session = Sarah's reliability invariant violated, equivalent to recorder failure. **A's risk profile is better for a tutoring app** where a missed session is the most expensive failure. |
| **AH-5** | `LearnerDeviceSession` sliding renewal | **A: Extend expiry in-place** — update `lastUsedAt` + `expiresAt`; same `tokenHash`; no cookie change. **B: Token rotation on renewal** — issue new token, revoke old, rewrite cookie on every renewal. | **A — Extend in-place** | B chosen but wrong: if a renewal fires mid-flight (two concurrent tab requests), the first renewal writes the new token while the second request carries the old cookie → the second request is rejected as revoked → spurious session death. Especially dangerous for a learner mid-session. **MEDIUM** — UX reliability risk. |
| **AH-6** | AccountHolder session lifetime | **A: 30-day rolling** (slides on activity, revoked on password change / explicit sign-out). **B: 14-day rolling.** **C: 7-day fixed.** | **A — 30-day rolling** | The session is DB-backed and immediately revocable (per AH-2), so the lifetime is a pure UX question. 30 days matches consumer app expectations for a parent portal without being indefinite. If wrong: increase or decrease; migration is a one-line env var change. **LOW** blast radius. |
| **AH-7** | Held branch merge order | **A: Merge `identity-p2-schema` AS-IS → merge `identity-p2-ownership-guard` AS-IS → P2a adds `AccountHolderSession` + new fields on top** (serial, preserves tested migrations). **B: Fold all three into one P2a mega-migration.** | **A — Serial merge** | B chosen: the `identity-p2-schema` migration is already tested (`tsc` + `next build` green per STATUS doc). Folding adds those verified changes into a larger unverified migration — harder to bisect a regression. **LOW** blast radius but higher migration debugging cost. |

---

## RATIFIED + AMENDED (Andrew 2026-06-01)

> **Authority:** Andrew ratified AH-1..AH-7 and the items below in one pass. This section is the durable record for P2a executors; it does not replace §0 (blast-radius rationale) or §1 (locked upstream inputs).

### Realm architecture (AH-1 = SEPARATE — ratified with clarification)

**Two realms + one child mechanism** (not three operator tiers):

| Realm / mechanism | Who | Stack |
|---|---|---|
| **(1) Operator realm** | Tutor + **admin** + superadmin | **Existing NextAuth** (`src/auth-options.ts`, `src/middleware.ts`). **Admin is a higher-privileged ROLE within this realm — NOT a separate third realm.** |
| **(2) AccountHolder realm** | Parents / adult self-learners | **Separate custom realm:** cookie `mynk_ah_session`, own `AccountHolderSession` DB table, own auth helpers — **entirely outside NextAuth.** |
| **Child mechanism** | LearnerProfile (minor) | **Device-bound PIN session** under an AccountHolder (`LearnerDeviceSession` + `mynk_learner_session` cookie) — not a third auth realm. |

**Architecture constraint (hard):** separate realms must **NOT** mean duplicated auth logic. Shared **primitives** (password hashing, TOTP encrypt/decrypt, backup-code logic, rate-limiting, the DB-session-table pattern) live in **common modules** consumed by both realms; only the **thin per-realm layer** differs (cookie name, session table, identity resolver, route guard). Standard multi-guard pattern (Laravel guards / Passport strategies).

**P2a acceptance (new):** **No duplicated auth logic** — shared primitives + thin per-realm adapters only; code review + grep/test guard that bcrypt/TOTP/session-token/HMAC logic is not copy-pasted into realm-specific route handlers.

### AH-2..AH-7 — ratified as recommended

| # | Decision (locked) |
|---|---|
| **AH-2** | DB-backed `AccountHolderSession` (opaque, immediately revocable) |
| **AH-3** | Separate env var `AH_TOTP_ENCRYPTION_KEY` (isolated from tutor `TOTP_ENCRYPTION_KEY`) |
| **AH-4** | Child PIN **soft-lockout with exponential backoff; NEVER hard account lock** (reliability bar — missed session > brute-force risk) |
| **AH-5** | `LearnerDeviceSession` sliding renewal **in-place** (update `lastUsedAt` + `expiresAt`; same `tokenHash`; no token rotation) |
| **AH-6** | AccountHolder session **30-day rolling** (DB-backed; revocable anytime; password reset bulk-revokes) |
| **AH-7** | Merge held branches **as-is, serial:** `identity-p2-schema` → `identity-p2-ownership-guard` → P2a session-infra on top |

### Impersonation (unchanged + deferred)

- **SEC-1 admin→tutor impersonation:** **UNCHANGED** — lives entirely within the **Operator realm** (NextAuth JWT). The separate AccountHolder realm does not affect it.
- **Cross-realm impersonation (admin → parent/child):** **DEFERRED** to a later scoped + audited feature. Separate realms make deliberate addition safer (no accidental privilege bleed). **V1 impersonation stays Operator-realm only.**

### Parent-first / linking (amendment — do not assume claim-first)

- Schema and auth must **NOT** assume an `AccountHolder` is created only via a tutor claim invite. An AccountHolder (and its `LearnerProfile` rows) can exist **standalone with zero tutor linkage**. Claim invite is **one** entry path, not **the** entry path.
- **Linking is bidirectional:** a tutor's `Student` stub can be claimed by a **brand-new** account **or** an **already-existing** `AccountHolder`; a pre-existing parent can be **connected to a tutor later**.
- **V1 build line (ratified):** model + realm are **parent-first-READY** in P2; **built flows for V1** = tutor-initiated claim **plus** "claim/connect by existing account" (parent signs in — or is already signed in — to complete the tie). **Standalone parent self-signup UI** = **fast-follow** (realm supports it; not in P2 build surface).
- **Connect-link / existing-account path — P2 acceptance (hard):** MUST show an **identity-confirmation interstitial** before binding:
  - Copy pattern: *"You're signed in as [email]. Tie [Learner name(s)] to [Tutor]?"*
  - **"Not you? Switch account"** escape (clears session or routes to login with `returnTo`).
  - **Rationale:** prevents a connect link from silently binding learners to whatever ambient `mynk_ah_session` is active (accidental / CSRF-ish mis-bind).

### Type-by-provisioning-path guardrail (clarified)

The guardrail's job is **only** that **self-signup can never reach the PRIVILEGED (tutor/admin) tier** — tutors and admins remain **operator-provisioned** (invite / internal setup). **AccountHolder (parent) self-signup IS permitted** — standard consumer onboarding. Summary: **no self-serve path into tutor/admin; parent self-signup fine.**

### Parent-selectable per-child access mode (new)

Per **`LearnerProfile`**, the parent chooses:

| Mode | Behavior | Typical use |
|---|---|---|
| **`parent_session_select`** (name TBD in schema) | Child accesses via the **parent's authenticated session**; parent **selects the learner** — no independent child login | Young kids, shared family device |
| **`child_pin_required`** (name TBD) | Child must use **own username + PIN** via the device-session mechanism | Older / independent kids |

- Stored as a **per-`LearnerProfile` parent setting** (enum or boolean pair on `LearnerProfile`; executor confirms field names in P2a migration).
- **Recommended defaults (executor may refine):** default **`parent_session_select`** when parent-reported age &lt; 13; default **`child_pin_required`** at 13+; parent can override anytime in account settings.
- Fits **multi-kid-on-one-device** + mid-session learner swap (parent picks active learner when in `parent_session_select` mode).

### P2a acceptance — seven BLOCKERs (unchanged IDs)

Fold into P2a smoke/merge gate per §12 summary: **BLOCKER-P2-S1**, **S2**, **S3**, **R1**, **C1**, **A1**, **O1** — plus the **no-duplicated-auth-logic** and **connect-link identity interstitial** items above.

### Migration-ordering hazard (record only — executor resolves at merge)

`identity-p2-schema` migration `20260531190000` has a timestamp **earlier** than the already-merged (and preview-dev-applied) Phase-1 2FA migration `20260601120000`. **P2a merge executor MUST** inspect `_prisma_migrations` on preview-dev and decide whether to **bump** the p2-schema migration timestamp for a monotonic timeline **before** merging. **Do not resolve in this doc pass** — see spine sub-pass tracker + Next actions.

---

## §1. Locked Inputs — Do Not Redesign

The following are locked by the SPINE and upstream designs. This doc details them; it does not re-derive or contradict them.

- **3-principal model:** `AccountHolder` (parent / adult self-learner), `LearnerProfile` (learner), tutor `AdminUser` ↔ `Student` link. `isSelfLearner=true` collapses the two-layer model for 18+ self-managing adults.
- **Q-4 device session lifetime:** 90-day sliding (renews on activity; idle devices expire; parent-revocable device list).
- **Q-5 tutor 2FA recovery:** backup codes → admin reset; no email self-serve first pass. (Tutor 2FA already merged.)
- **Q-8 adult threshold:** 18+ = `isSelfLearner`; parent-reported age; child cannot self-promote.
- **Consent model:** parent ceiling ∩ child narrowing-only; frozen at session start; prospective revocation only.
- **Tiered consent (ratified 2026-05-31):** essentials non-toggleable (contract); optional UNCHECKED toggles: `allowAudioRecording`, `allowWhiteboardRecording`, `allowNoteSending`, `allowEducationalUse`, `allowMessaging`, `allowVideoRecording`; `allowLiveSession` as kill-switch.
- **PII/business-record separation:** tombstone + redact PII columns; business records retain opaque key reference. `tombstonedAt` on `AccountHolder` + `LearnerProfile` already in `identity-p2-schema`.
- **Retention:** active + 24 months post-closure; deletion-on-request honored sooner.
- **Log prefix registry:** `ahx`, `lpr`, `clm`, `cns`, `tfa`, `msg` already registered in the spine and identity design.
- **Provisioning chain:** stub → invite → parent signup/verify → claim → consent ceiling + child login setup → live session participant.
- **`assertOwnsLearnerProfile` semantics:** `accountHolderId == profile.accountHolderId`, tombstone check, deny-by-default `notFound()`. Already pre-wired on `identity-p2-ownership-guard` @ `f74f164`.
- **Phase 1 2FA (mandatory tutor TOTP):** merged to `v1-redesign` @ `b5ef4fe`. F1–F4 ratified. Unchanged by this design.

---

## §2. Design Scope

This document covers:

1. Whether AccountHolder auth lives in the same NextAuth realm as tutors/admins, or a separate realm (AH-1: SEPARATE).
2. How AccountHolder sessions are created, stored, validated, slid, and revoked.
3. How child (LearnerProfile) login sessions work — PIN storage, rate-limiting, device binding, revocation.
4. How three principal sessions coexist without privilege confusion — cookie isolation, middleware split, impersonation coexistence.
5. The claim flow state machine — full states, transitions, idempotency, token handling, multi-child scenarios.
6. How a logged-in LearnerProfile becomes a `SessionParticipant` and how consent enforcement is wired at session start and learner swap.
7. The access guard catalog — signatures, tombstone handling, deny-by-default invariant, new guard `assertOwnsConsentRecord`.
8. New schema additions this design requires beyond `identity-p2-schema` — `AccountHolderSession`, `expiresAt` on `LearnerDeviceSession`, `payload` + `targetLearnerProfileId` on `AccountHolderEmailToken`.
9. Rollout phasing (P2a → P2b → P2c) and held branch merge order.
10. 5-axis adversarial reliability review with BLOCKERs folded into P2a acceptance criteria.

**Not in scope (downstream phases):** Phase 3 (consent UI + `ConsentRecord` implementation), Phase 4 (access-control swap, ShareLink sunset), Phase 5 (messaging), Phase 6 (2FA hardening + AccountHolder 2FA enrollment UI).

---

## §3. AccountHolder Authentication

### 3.1 Realm Design (AH-1 Recommendation: SEPARATE)

**AccountHolder authenticates in a separate custom realm, entirely outside NextAuth.**

The existing NextAuth stack (`src/auth-options.ts` + `src/middleware.ts`) is purpose-built for `AdminUser`:

- `jwt()` callback writes `isTestAccount`, `role`, `twoFactorVerified`, `isImpersonating`, `originalAdminId` — AdminUser-specific fields
- `session.user` is TypeScript-typed to AdminUser fields
- The middleware 2FA gate checks `token.twoFactorVerified` for **all** `/admin/*` paths
- The Google OAuth `signIn` callback gates access by querying `AdminUser` rows

Injecting AccountHolder into this stack requires all of the following, simultaneously, in the most security-critical code in the app:
1. Add `principalType: 'admin_user' | 'account_holder'` to every JWT claim and every TypeScript type that touches `session.user`
2. Gate the mandatory-2FA check on `principalType === 'admin_user'` — a carve-out in the security path
3. Ensure Google OAuth (tutor-only) never produces an AccountHolder session
4. Prevent any `/admin/*` route from accepting an AccountHolder's valid NextAuth token

Any error in steps 2–4 either silently drops the 2FA requirement for a principal, or silently grants admin-route access to a non-admin — bugs that are nearly invisible in test suites.

**Separate realm design:**

| Item | Detail |
|---|---|
| Auth endpoints | `/api/auth/account-holder/signup\|login\|logout\|forgot-password\|reset-password` — plain Next.js Route Handlers, NOT NextAuth providers |
| Session cookie | `mynk_ah_session` — HttpOnly, Secure (prod), SameSite=Strict, Path=/ |
| Session storage | `AccountHolderSession` DB table — opaque token, DB-backed (§3.3) |
| Session read | `getAccountHolderSession(req: NextRequest)` helper — Node.js runtime, not edge |
| `/admin/*` routes | Zero-touched. `getToken()` reads only the NextAuth cookie; `mynk_ah_session` produces `null` from `getToken()` → middleware gate stays unchanged |
| Account routes | `/account/*`, `/claim/*`, `/verify-email` — checked by `getAccountHolderSession()` |

### 3.2 Session Storage (AH-2 Recommendation: DB-backed)

**`AccountHolderSession` table — opaque, immediately revocable.** See §9.1 for full schema spec.

```
Login  → create AccountHolderSession row
         rawToken = crypto.randomBytes(32).hex()
         tokenHash = HMAC-SHA-256(rawToken, AH_SESSION_HMAC_SECRET)
         expiresAt = now() + 30d
         issue cookie: mynk_ah_session=rawToken

Request → getAccountHolderSession(req):
         hash = HMAC-SHA-256(cookie.value, AH_SESSION_HMAC_SECRET)
         row = db.accountHolderSession.findUnique({ where: { tokenHash: hash } })
         if (!row || row.revokedAt || row.expiresAt < now()) → return null → 401
         if (row.expiresAt < now() + 15d):
           UPDATE accountHolderSession SET lastUsedAt=now(), expiresAt=now()+30d  (sliding renewal)
         return { accountHolderId: row.accountHolderId, sessionId: row.id, twoFactorVerified: row.twoFactorVerified }

Logout → UPDATE accountHolderSession SET revokedAt=now(); unset cookie

Password reset → UPDATE accountHolderSession SET revokedAt=now()
                 WHERE accountHolderId=<id> AND revokedAt IS NULL   (bulk revoke all sessions)
                 then issue fresh session (user is re-authenticated after reset)
```

New env var: `AH_SESSION_HMAC_SECRET` — 32+ bytes random, base64. Add to `.env.example` + `docs/PLATFORM-ASSUMPTIONS.md §10` (new env var inventory entry). This secret signs session tokens; treat at same security tier as `NEXTAUTH_SECRET`.

### 3.3 Signup Flow

```
POST /api/auth/account-holder/signup
Body: { email, password, displayName? }
Rate-limit: AUTH_RATE_LIMIT (10 req/min per IP — same bucket as admin login)

→ normalize email: .trim().toLowerCase()
→ validate: email format, password ≥ 8 chars (min only; no complexity theater)
→ always respond HTTP 200 { message: "Check your email" } regardless of whether email exists
   (anti-enumeration: never reveal whether the email is registered)
→ if AccountHolder with this email does NOT exist:
   → hash password: bcrypt(password, 12)   ← 12 rounds for external users
   → create AccountHolder { email, passwordHash, emailVerifiedAt: null, isSelfLearner: false }
   → create AccountHolderEmailToken {
       email, purpose: SIGNUP_VERIFY,
       tokenHash: SHA-256(rawToken),
       expiresAt: now() + 24h,
     }
   → send verification email: subject "Confirm your Mynk account"
     body includes link: /verify-email?token=<rawToken>&type=ah
     (if claim flow: include &returnTo=/claim/[inviteToken] for post-verify redirect)
   → log: [ahx] ahx=<accountHolderId> action=signup email=<email>
→ if AccountHolder DOES exist (already registered):
   → send "your account already exists, did you mean to log in?" email instead
   → same 200 response; no new AccountHolder row

GET /verify-email?token=<rawToken>&type=ah(&returnTo=<path>)
→ hash = SHA-256(rawToken)
→ token = db.accountHolderEmailToken.findUnique WHERE tokenHash=hash AND purpose=SIGNUP_VERIFY AND usedAt IS NULL AND expiresAt > now()
→ if not found: render "Link expired or invalid — request a new one" page
→ UPDATE accountHolder SET emailVerifiedAt=now()
→ UPDATE accountHolderEmailToken SET usedAt=now()
→ create AccountHolderSession (log in automatically post-verify)
→ log: [ahx] ahx=<accountHolderId> action=email_verified
→ redirect to returnTo (sanitized — must be a relative path starting with /) or /account/dashboard
```

### 3.4 Login Flow

```
POST /api/auth/account-holder/login
Body: { email, password }
Rate-limit: AUTH_RATE_LIMIT (same bucket as admin login: 10 req/min per IP)

→ normalize email
→ row = db.accountHolder.findUnique({ where: { email } })
→ bcrypt.compare(password, row?.passwordHash ?? DUMMY_HASH)
   (always run bcrypt.compare to prevent timing side-channel — compare against a dummy hash if row not found)
→ if no match: respond 401 { error: "invalid_credentials" }
→ if match but emailVerifiedAt IS NULL: respond 403 { error: "email_not_verified" }
   (safe to reveal this only AFTER password matches — reveals account exists, but password was required)
→ if match and verified:
   → create AccountHolderSession { accountHolderId, tokenHash, expiresAt: now()+30d, twoFactorVerified: false }
   → if AccountHolder2FA row exists AND enrolledAt IS NOT NULL:
     → set session twoFactorVerified=false (already default)
     → respond 200 { next: "2fa_required" }  (client redirects to /account/2fa/verify)
   → else:
     → respond 200 { next: "dashboard" }
   → issue cookie in both cases
   → log: [ahx] ahx=<accountHolderId> action=login session=<sessionId> twoFactorRequired=<bool>
```

### 3.5 Password Reset

```
POST /api/auth/account-holder/forgot-password
Body: { email }
Rate-limit: AUTH_RATE_LIMIT

→ always respond 200 { message: "If that email is registered, you'll receive a reset link." }
→ row = db.accountHolder.findUnique({ where: { email: normalize(email) } })
→ if exists AND emailVerifiedAt IS NOT NULL:
   → create AccountHolderEmailToken { purpose: PASSWORD_RESET, expiresAt: now() + 1h, tokenHash: SHA-256(rawToken) }
   → send email with /account/reset-password?token=<rawToken>

POST /api/auth/account-holder/reset-password
Body: { token, newPassword }
→ hash = SHA-256(token)
→ row = db.accountHolderEmailToken WHERE tokenHash=hash AND purpose=PASSWORD_RESET AND usedAt IS NULL AND expiresAt > now()
→ if not found: 400 "link_expired"
→ validate newPassword (≥ 8 chars)
→ DB TRANSACTION {
    UPDATE AccountHolder SET passwordHash = bcrypt(newPassword, 12)
    UPDATE AccountHolderEmailToken SET usedAt = now()
    UPDATE AccountHolderSession SET revokedAt = now()
      WHERE accountHolderId=accountHolder.id AND revokedAt IS NULL
    CREATE AccountHolderSession (fresh session — re-authenticates user)
  }
→ issue new session cookie
→ log: [ahx] ahx=<accountHolderId> action=password_reset sessions_revoked=<n>
```

### 3.6 Critical Account Changes (Consent Revocation, Email Change)

Any `CRITICAL_ACTION` — changing a consent ceiling or changing account email — requires a fresh email confirmation before applying. This prevents session-hijack from silently altering consent records.

```
1. Parent triggers critical action from account settings
2. Server creates AccountHolderEmailToken {
     purpose: CRITICAL_ACTION,
     payload: JSON.stringify({ action: "change_consent", learnerProfileId: "..." }),   ← §9.3
     expiresAt: now() + 1h,
   }
3. Email: "Confirm this change — click within 1 hour"
4. Parent clicks link → server validates token AND verifies payload.action matches the pending action
5. Action proceeds; token marked usedAt
```

The `payload` field on `AccountHolderEmailToken` is a new additive nullable field (§9.3). It binds a CRITICAL_ACTION token to a specific action and prevents a single token from confirming multiple unrelated changes.

### 3.7 Opt-in 2FA for AccountHolder (Phase 6 surface — wired now)

Per the locked model, AccountHolder 2FA is opt-in / encouraged (not mandatory). The `AccountHolder2FA` + `AccountHolder2FABackupCode` models mirror `AdminUser2FA` in structure.

**Encryption key:** `AH_TOTP_ENCRYPTION_KEY` — separate env var from `TOTP_ENCRYPTION_KEY` (see AH-3). Same AES-256-GCM scheme as tutor TOTP. Reserve env var now; implement enrollment UI in Phase 6.

**`AccountHolderSession.twoFactorVerified`** is wired in Phase 2 (field defaults to `false`). In Phase 2 no AccountHolder 2FA is enrolled. Phase 6's verify endpoint sets it to `true` and persists it in the session row. No Phase 2 route checks this field yet — the check gates are added in Phase 6.

**Recovery for AccountHolder 2FA:** support email path (manual identity verification → admin resets). No dependency on the AdminUser recovery path (separate principal hierarchy). Reasonable at pilot scale.

### 3.8 Middleware Integration (zero-touch to existing 2FA gate)

The existing middleware's 2FA gate is:
```typescript
if (!isTestAccount && !isImpersonating && !isEnvAdmin && !twoFactorVerified) {
  // redirect to /admin/settings/2fa/setup
}
```

This gate runs only for `/admin/*` paths, using `token` from `getToken()` (NextAuth JWT). An `AccountHolder` request to `/account/*` never reaches this gate and never produces a NextAuth token. Zero code changes needed in `src/middleware.ts`.

**New middleware additions for AccountHolder + Learner routes:**

```typescript
// Cookie-presence-only check (edge-compatible — no DB):
if (pathname.startsWith('/account/') && !isPublicAccountPath(pathname)) {
  const ahCookie = req.cookies.get('mynk_ah_session');
  if (!ahCookie) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/account/login';
    loginUrl.searchParams.set('returnTo', pathname);
    return addSecurityHeaders(NextResponse.redirect(loginUrl), pathname);
  }
  // Full DB validation happens in the server component / route handler
}

if (pathname.startsWith('/join/') && !isPublicLearnerPath(pathname)) {
  const learnerCookie = req.cookies.get('mynk_learner_session');
  if (!learnerCookie) {
    return addSecurityHeaders(NextResponse.redirect(/* /students/login */), pathname);
  }
}
```

`isPublicAccountPath`: includes `/account/login`, `/account/signup`, `/account/forgot-password`, `/account/reset-password`, `/verify-email`, `/claim/*`.

**Security note:** the middleware cookie-presence check is a UX redirect (avoids loading a full server component to 401). The server component / route handler performs the authoritative DB-backed validation (§5.5). The middleware check can be bypassed but the handler cannot.

---

## §4. LearnerProfile (Child) Login

### 4.1 Credential Model

Child login: username (parent-chosen, not secret) + PIN/password (`LearnerCredential.passwordHash`).

**Username rules:**
- Alphanumeric + underscore; 3–20 chars; case-insensitive (store normalized lowercase)
- Unique across all `LearnerCredential` rows (`@unique` on `username`)
- Parent-chosen at claim setup; not changeable by the child (prevents inappropriate self-selection)

**PIN/password policy:**
- Minimum 6 numeric digits (PIN mode for young children)
- Minimum 8 characters if alphanumeric mode chosen (for older students / email-upgrade path)
- No maximum length; bcrypt hash stores the result
- No complexity requirements — children have limited keyboard fluency; reliability > entropy theater
- bcrypt rounds: 10 (adequate for a short PIN; the rate-limit design is the primary brute-force defense)

### 4.2 PIN Storage Spec

```
LearnerCredential.passwordHash = bcrypt(normalizedPin, rounds=10)
```

- Raw PIN is never stored or logged. All `console.error` / `console.warn` lines in learner auth paths MUST NOT include the raw PIN value.
- Salt is embedded in the bcrypt hash (standard).
- The `LearnerCredential.username` is stored normalized lowercase; comparisons use the normalized form.

### 4.3 Child Login Flow

```
POST /api/auth/learner/login
Body: { username, pin }
Rate-limit: LEARNER_AUTH_RATE_LIMIT bucket (see §4.4)

→ normalize username: .trim().toLowerCase()
→ cred = db.learnerCredential.findUnique({
    where: { username: normalized },
    include: { learnerProfile: { select: { id: true, tombstonedAt: true, accountHolderId: true } } }
  })
→ always run bcrypt.compare to avoid timing side-channel (compare against dummy hash if not found)
→ if not found OR learnerProfile.tombstonedAt IS NOT NULL OR !bcrypt.match:
   → failCount++ (rate-limit bucket)
   → respond 401 { error: "invalid_credentials" }  (no distinction between not-found and wrong-PIN)
→ on match:
   → existing = check for mynk_learner_session cookie; if valid non-revoked non-expired session for this learnerProfileId exists → re-use it (update lastUsedAt + expiresAt)
   → else → create LearnerDeviceSession {
       learnerProfileId: cred.learnerProfileId,
       tokenHash: HMAC-SHA-256(rawToken, LEARNER_SESSION_HMAC_SECRET),
       deviceInfo: req.headers.get('user-agent')?.substring(0, 128) ?? null,
       lastUsedAt: now(),
       expiresAt: now() + 90d,
       revokedAt: null,
     }
   → rawToken = crypto.randomBytes(32).hex()
   → issue cookie: mynk_learner_session=rawToken; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7776000
   → respond 200 { next: "session" }
   → log: [lpr] lpr=<profileId> action=login device=<sessionId>
```

New env var: `LEARNER_SESSION_HMAC_SECRET` — 32+ bytes base64. Add to `.env.example` + `PLATFORM-ASSUMPTIONS.md`.

### 4.4 Rate-Limiting + Soft-Lockout (AH-4: Soft-lock only — NEVER hard account lock)

**Foundational invariant:** a child MUST NEVER be permanently hard-locked out of their account. A missed tutoring session due to account lockout is a reliability failure equivalent to a recorder crash.

**Soft-lockout policy (per `username + IP` combination):**

| Failure count | Response |
|---|---|
| 0–2 | No delay — return 401 immediately |
| 3–4 | 30-second cooldown — return 429 with `Retry-After: 30` |
| 5–7 | 5-minute cooldown — return 429 with `Retry-After: 300` |
| 8–10 | 15-minute cooldown — return 429 with `Retry-After: 900` |
| 11+ | 1-hour cooldown; emit `[lpr] action=lockout_threshold_reached` log event |

- State: in-memory rate-limit buckets (same `rateLimit()` infrastructure as admin login). Key: `learner_pin:<normalizedUsername>:<ip>`.
- Lockout is **purely time-based** — no DB lockout flags, no permanent locks.
- Failure count resets to 0 on successful login.
- At threshold (11+), a background task queues a "Your child may be having trouble logging in" notification email to `AccountHolder.email`. This is informational, not a block.
- Per-IP bucket (independent of username) additionally limits mass attempts: key `learner_ip:<ip>`, max 30 req/min.

### 4.5 `LearnerDeviceSession` Sliding Renewal (AH-5: Extend in-place)

On each successful `getLearnerSession()` validation:
- If `expiresAt < now() + 30d` (within 30 days of expiry): `UPDATE LearnerDeviceSession SET lastUsedAt=now(), expiresAt=now()+90d`.
- The same `tokenHash` stays valid — no cookie change required.
- Include `Set-Cookie: mynk_learner_session=<rawToken>; Max-Age=<seconds_to_new_expiry>` on every successful response to refresh the browser's cookie expiry tracking.

**Why extend-in-place over rotation:** rotation issues a new token and immediately revokes the old one. If two concurrent tab requests both trigger a renewal, the second request carries the old (now-revoked) token → session death mid-session. Extend-in-place is idempotent: both requests succeed.

### 4.6 Revocation + Parent Device Management

**Parent revocation surfaces:**
- `/account/children/[id]/devices` — lists all `LearnerDeviceSession` rows (`deviceInfo`, `lastUsedAt`, `createdAt`)
- Revoke one: `POST /api/learner-profiles/[id]/device-sessions/[sessionId]/revoke` → `revokedAt = now()`
- Revoke all: `POST /api/learner-profiles/[id]/device-sessions/revoke-all` → bulk-revoke all non-revoked rows

**Immediacy:** because sessions are DB-backed, revocation takes effect on the next request (no JWT TTL to wait out). Child's next page load → `getLearnerSession()` reads `revokedAt IS NOT NULL` → null → cookie cleared → login page.

**PIN change (parent action):**
- `PATCH /api/learner-profiles/[id]/credentials { newPin }` — requires parent `AccountHolderSession` + `assertOwnsLearnerProfile`
- Hashes new PIN, updates `LearnerCredential.passwordHash`
- Revokes all `LearnerDeviceSession` rows for this `learnerProfileId` in same transaction
- Child must log in fresh on all devices with new PIN

### 4.7 Lost / Shared Device Handling

1. Parent revokes the specific device session from `/account/children/[id]/devices`
2. If parent can't identify which session: "Revoke all devices" clears all
3. Child logs in again on a clean device with username + PIN
4. If PIN was potentially compromised: parent changes PIN (§4.6) — immediately invalidates all device sessions

**Recovery time from a lost device:** ~2 minutes (parent clicks Revoke all → child logs in on new device). Documented in parent onboarding. This is the reliability analog of "backup codes save you 2 minutes" — acceptable.

### 4.8 Optional Child Email Upgrade Path (Phase 2c / defer)

Parent sets `LearnerProfile.email` from account settings → triggers `AccountHolderEmailToken { purpose: SIGNUP_VERIFY, targetLearnerProfileId: <id> }` sent to the new email. After verification, older student can log in via email + password at `/account/login`. `LearnerCredential` (username+PIN) remains active — two login paths exist concurrently. A `LearnerDeviceSession` is issued either way (same table, same 90-day mechanics).

This path requires the `targetLearnerProfileId` field on `AccountHolderEmailToken` (§9.3). Defer to Phase 2c — not required for P2a (core path is username+PIN).

---

## §5. Session/Token Mechanics Across Principals

### 5.1 Three Completely Separate Sessions

| Principal | Session mechanism | Cookie name | Storage | Lifetime |
|---|---|---|---|---|
| **Tutor / Admin** (`AdminUser`) | NextAuth JWT | `next-auth.session-token` (prod: `__Secure-next-auth.session-token`) | Stateless JWT | 30-day idle (NextAuth default) |
| **Parent / Self-learner** (`AccountHolder`) | Opaque DB-backed | `mynk_ah_session` | `AccountHolderSession` table | 30-day sliding (AH-6) |
| **Child / Student** (`LearnerProfile`) | Opaque DB-backed | `mynk_learner_session` | `LearnerDeviceSession` table | 90-day sliding (Q-4 locked) |

All three cookies: `HttpOnly`, `Secure` (prod only; omit in dev), `SameSite=Strict`, `Path=/`.

The three cookies can coexist in the same browser (e.g., developer running both an admin session and a test parent session). The server resolves the session by which helper function is called — there is no fallback or precedence between them.

### 5.2 Session Read Helpers

```typescript
// AdminUser (tutor/admin): existing NextAuth helper — zero changes
import { getServerSession } from "next-auth/next";
const session = await getServerSession(authOptions);  // reads next-auth.session-token only

// AccountHolder (parent/self-learner): new helper
// src/lib/account-holder-session.ts
async function getAccountHolderSession(req: NextRequest | Request): Promise<{
  accountHolderId: string;
  sessionId: string;
  twoFactorVerified: boolean;
} | null>
// reads mynk_ah_session cookie only; performs DB lookup + sliding renewal

// LearnerProfile (child): new helper
// src/lib/learner-session.ts
async function getLearnerSession(req: NextRequest | Request): Promise<{
  learnerProfileId: string;
  accountHolderId: string;  // joined from LearnerProfile; needed for assertOwnsLearnerProfile calls
  sessionId: string;
} | null>
// reads mynk_learner_session cookie only; performs DB lookup + sliding renewal
```

**No cross-principal fallback.** If `getAccountHolderSession()` returns `null`, the route returns 401. It does NOT call `getServerSession()`. The type signatures are different; TypeScript enforces the separation at compile time.

### 5.3 Impersonation Coexistence

Impersonation runs entirely within the NextAuth JWT realm — `ImpersonationLog.impersonatedUserId` is a FK to `AdminUser`. Impersonation cannot impersonate an `AccountHolder` or `LearnerProfile`.

A superadmin can VIEW AccountHolder + LearnerProfile data via a separate admin-authenticated path (read-only, uses the AdminUser session + a separate admin-authorized DB query path). This is distinct from the AccountHolder's own session — an admin reading a parent's account is a different code path from a parent reading their own account. The invariant: only `assertOwnsLearnerProfile` checks the `AccountHolder` session; admin read access uses its own admin-gated path (Phase 4 detail).

### 5.4 Privilege Confusion Prevention Invariants

All six invariants below MUST have corresponding negative-case integration tests before P2a ships to production.

| # | Invariant | Why it holds | Test |
|---|---|---|---|
| **I-1** | Valid `mynk_ah_session` cookie → `GET /admin/students` → 302 to `/login` | `middleware.ts` calls `getToken()` (NextAuth JWT only). `mynk_ah_session` produces `null` from `getToken()` → `!token` → redirect. | Unit test: middleware with only `mynk_ah_session` header → assert `Location: /login` |
| **I-2** | Valid `mynk_learner_session` cookie → `GET /admin/students` → 302 to `/login` | Same as I-1. | Same test, different cookie. |
| **I-3** | Valid NextAuth JWT → `GET /account/dashboard` → 401 | `/account/*` handler calls `getAccountHolderSession()` — no `mynk_ah_session` cookie → null → 401. | Integration test: tutor session + account route → 401 |
| **I-4** | Valid AccountHolder session → `GET /api/account/[id]` for a different AccountHolder → 404 | `assertOwnsLearnerProfile(session.accountHolderId, reqProfileId)` → mismatch → `notFound()` | Test: AccountHolder A's session + AccountHolder B's profileId → 404 |
| **I-5** | `isSelfLearner=true` AccountHolder → no admin capabilities | AccountHolder session NEVER produces a NextAuth token; zero admin routes accept it. | Same as I-1/I-2 (structural) |
| **I-6** | Tombstoned `LearnerProfile` → learner session rejected | `getLearnerSession()` joins `LearnerProfile`; if `tombstonedAt IS NOT NULL` → null → 401 | Test: tombstone a profile → existing device session → 401 |

### 5.5 Middleware-Level vs. Handler-Level Enforcement

| Layer | Checks | Why this split |
|---|---|---|
| Middleware (edge runtime) | Cookie PRESENCE only (`req.cookies.get('mynk_ah_session')`) → redirect to login if absent | Edge runtime cannot query Postgres; lightweight fast redirect avoids a full server component render just to 401 |
| Route handler / server component (Node.js) | Full DB validation: `AccountHolderSession` row exists, `revokedAt IS NULL`, `expiresAt > now()`, slide renewal | Authoritative gate; handles revocation and expiry — only possible with DB access |

**Critical:** the handler-level check is the security gate. The middleware check is a UX optimization only. Even if a request bypasses the middleware (possible in some Next.js edge cases), the handler must still reject an invalid session.

**Rate-limit placement:** the `LEARNER_AUTH_RATE_LIMIT` bucket is applied at the handler level (not middleware) for the `/api/auth/learner/login` endpoint, since it requires the normalized username from the request body.

---

## §6. Claim Flow State Machine

### 6.1 State Diagram

```
StudentClaimInvite states:

  [PENDING]
     │
     ├─── expiresAt < now() ────────────────────────► [EXPIRED]
     │    (computed on read; no DB write)
     │
     ├─── revokedAt IS NOT NULL ────────────────────► [REVOKED]
     │    (tutor action OR post-claim sibling cleanup)
     │
     └─── usedAt IS NOT NULL ───────────────────────► [COMPLETE]
          (parent completed claim; claimedByAccountHolderId set)

All terminal states (EXPIRED, REVOKED, COMPLETE) are irreversible.
Multiple invites for the same student are allowed (up to 3 pending) — useful for resend.
After a COMPLETE, all other PENDING invites for that student are immediately REVOKED.
```

### 6.2 Step-by-Step Transitions

**STEP 1 — Invite minted (tutor action)**

```
POST /api/students/[studentId]/claim-invites
Auth: AdminUser session (tutor)

→ assertOwnsStudent(tutor.adminUserId, studentId)
→ if student.learnerProfileId IS NOT NULL: respond 409 "student_already_claimed"
→ count = count pending (non-expired, non-revoked) invites for this studentId
   if count >= 3: respond 429 "too_many_pending_invites" (spam prevention)
→ rawToken = crypto.randomBytes(32).hex()
→ tokenHash = SHA-256(rawToken)   ← STORE HASH ONLY (§6.4)
→ create StudentClaimInvite {
    studentId,
    adminUserId: tutor.adminUserId,    ← NOTE: field is adminUserId, not tutorId (identity-p2-schema deviation, correct per AGENTS.md)
    tokenHash,
    expiresAt: now() + 7d,
    usedAt: null,
    revokedAt: null,
    claimedByAccountHolderId: null,
  }
→ if student.parentEmail: send email with /claim/<rawToken>
→ respond 200 { inviteLink: "/claim/<rawToken>" }   ← also show link in UI for copy/share
→ log: [clm] clm=<inviteId> action=invited studentId=<id> adminUserId=<id>
```

**STEP 2 — Parent follows link**

```
GET /claim/[rawToken]
→ tokenHash = SHA-256(rawToken)
→ invite = db.studentClaimInvite.findUnique({ where: { tokenHash } })
   if (!invite):                  render "Invalid link"
   if (invite.usedAt):            render "Student already claimed"
   if (invite.revokedAt):         render "Link no longer valid"
   if (invite.expiresAt < now()): render "Link expired — ask your tutor to resend"
                                  log: [clm] clm=<inviteId> action=expired_on_read
→ if valid: show signup / login options
→ log: [clm] clm=<inviteId> action=viewed
```

**STEP 3 — Parent authenticates**

```
Case A — New AccountHolder:
  → show signup form
  → POST /api/auth/account-holder/signup (§3.3)
  → email verification sends /verify-email?token=<raw>&type=ah&returnTo=/claim/<rawToken>
  → after verification: redirect to /claim/<rawToken> with AccountHolder session cookie set

Case B — Existing AccountHolder (logs in):
  → POST /api/auth/account-holder/login → session cookie
  → redirect to /claim/<rawToken>

Case C — Already logged in (mynk_ah_session cookie valid):
  → skip auth; proceed directly to STEP 4
```

**STEP 4 — Claim completed**

```
POST /api/claim/[rawToken]/complete
Auth: AccountHolder session (getAccountHolderSession)

→ getAccountHolderSession → accountHolder
→ if (!accountHolder): 401
→ if (!accountHolder.emailVerifiedAt): 403 { error: "email_not_verified" }
→ tokenHash = SHA-256(rawToken)
→ invite = query (same validations as STEP 2)
→ DB TRANSACTION {
    a. newProfile = CREATE LearnerProfile {
         accountHolderId: accountHolder.id,
         displayName: student.name,   ← seedable from student.name; parent can rename
         tombstonedAt: null,
       }
    b. affected = UPDATE Student SET learnerProfileId=newProfile.id
         WHERE id=invite.studentId AND learnerProfileId IS NULL
       if (affected === 0):
         → ROLLBACK; respond 409 "student_already_claimed"
         (the AND learnerProfileId IS NULL prevents race: concurrent claim → unique constraint already set)
    c. UPDATE StudentClaimInvite SET usedAt=now(), claimedByAccountHolderId=accountHolder.id
         WHERE id=invite.id AND usedAt IS NULL
       if (affected === 0):
         → ROLLBACK; respond 409 "claim_already_completed"
    d. UPDATE StudentClaimInvite SET revokedAt=now()
         WHERE studentId=invite.studentId AND id != invite.id AND revokedAt IS NULL AND usedAt IS NULL
       (post-claim cleanup: revoke all other pending invites for this student)
  }
→ log: [clm] clm=<inviteId> action=claimed learnerProfileId=<newProfile.id> accountHolderId=<id>
→ redirect to /claim/<rawToken>/setup
```

**STEP 5 — Post-claim onboarding**

```
GET /claim/[rawToken]/setup
Auth: AccountHolder session
→ verify invite COMPLETE (usedAt IS NOT NULL) AND claimedByAccountHolderId === session.accountHolderId
→ fetch LearnerProfile (assertOwnsLearnerProfile)

Two-panel wizard:

Panel A — Consent ceiling setup (shown first; Phase 3 implementation):
  POST /api/consent
  Body: { learnerProfileId, tutorAdminUserId, allowAudioRecording, allowWhiteboardRecording, allowNoteSending, allowEducationalUse, allowMessaging, allowLiveSession: true }
  → assertOwnsLearnerProfile(session.accountHolderId, learnerProfileId)
  → create ConsentRecord { learnerProfileId, tutorId: invite.adminUserId, version: 1, ...toggles, setByAccountHolderId: session.accountHolderId }
  → log: [cns] cns=<recordId> action=created version=1 learnerProfileId=<id>

Panel B — Child login setup (optional; "Set up later" link provided):
  POST /api/learner-profiles/[id]/credentials
  Body: { username, pin }
  → assertOwnsLearnerProfile(session.accountHolderId, id)
  → check username unique across LearnerCredential
  → create LearnerCredential { learnerProfileId: id, username: normalize(username), passwordHash: bcrypt(pin, 10) }
  → log: [lpr] lpr=<id> action=credential_created
```

### 6.3 Idempotency Guarantees

| Scenario | Behavior |
|---|---|
| Parent double-submits claim form | Step 4b: `UPDATE WHERE learnerProfileId IS NULL` → 0 rows → ROLLBACK → 409. No orphaned `LearnerProfile`. |
| Two parents race to claim same student | First transaction commits (unique constraint on `Student.learnerProfileId`). Second: step 4b returns 0 rows → 409. |
| Parent re-uses expired invite link | Step 2: `expiresAt < now()` → render "Link expired". |
| Parent uses an invite after the student was claimed by a different parent | Step 4b: `AND learnerProfileId IS NULL` → 0 rows → 409. |
| Tutor re-sends invite; parent uses old link | Old invite is still PENDING (not auto-revoked on resend). Both invites are valid. First claim succeeds; claim transaction revokes the other. |

### 6.4 Token Storage: Hash-Only

`StudentClaimInvite.token` (plaintext in `identity-p2-schema`) should be renamed `tokenHash` in the P2a migration to store `SHA-256(rawToken)`. Rationale: consistency with the `AccountHolderEmailToken` and `PasswordResetToken` patterns; defense-in-depth even for short-lived tokens.

> **EXECUTOR ACTION:** In the P2a migration, alter `StudentClaimInvite` to rename `token` → `tokenHash String @unique`. This column is empty in production (no claims have been completed yet), so it's a safe rename. All claim-flow code in P2a must hash the raw token on query and store only the hash.

### 6.5 Multiple Kids Under One AccountHolder

`AccountHolder` has a `learnerProfiles LearnerProfile[]` one-to-many relation. Each student claim creates a separate `LearnerProfile` under the same `AccountHolder.id`.

- `assertOwnsLearnerProfile(ah.id, profileA.id)` ✅ and `assertOwnsLearnerProfile(ah.id, profileB.id)` ✅ — both pass
- `assertOwnsLearnerProfile(ah.id, profileC.id)` where `profileC.accountHolderId !== ah.id` → `notFound()`
- Each (LearnerProfile, tutor) pair has its own `ConsentRecord` — parent sets consent independently per child
- Each `LearnerProfile` has its own `LearnerCredential` with a unique username — sibling usernames must be distinct (enforced by `@unique` on `LearnerCredential.username`)

The claim invite flow naturally handles this: parent with an existing AccountHolder session (Case C in STEP 3) can claim additional students without re-signing up.

---

## §7. Live-Session Participant Auth + Consent Enforcement

### 7.1 Participant Eligibility → `SessionParticipant` Row

A `SessionParticipant` row is created by the TUTOR when starting a session (not by the learner when joining). The row is the tutor's authorization for that learner to join.

```
POST /api/sessions (startWhiteboardSession)
Auth: AdminUser (tutor)

→ assertOwnsStudent(tutor.adminUserId, studentId)
→ student = db.student.findUnique({ include: { learnerProfile: { include: { consentRecords, consentRestriction } } } })
→ DB TRANSACTION {
    create WhiteboardSession { adminUserId, studentId, startedAt: null (pending), consentAcknowledged: true, ... }
    if (student.learnerProfileId IS NOT NULL):
      [compute effectiveConsent — see §7.4]
      create SessionConsentSnapshot { whiteboardSessionId, ...effective, selfLearnerConsent: student.learnerProfile.accountHolder.isSelfLearner }
      create SessionParticipant { whiteboardSessionId, learnerProfileId: student.learnerProfileId }
    // if unclaimed: no SessionParticipant, no SessionConsentSnapshot
  }
→ log: [slc] slc=<sessionId> action=session_created studentId=<id>
→ if (consentSnapshot): log: [cns] cns=<snapshotId> action=frozen sessionId=<id> version=<n> allowAudio=<bool>
```

### 7.2 `assertIsSessionParticipant`

```typescript
// src/lib/session-participant-scope.ts
async function assertIsSessionParticipant(
  learnerProfileId: string,
  whiteboardSessionId: string
): Promise<SessionParticipant> {
  const participant = await db.sessionParticipant.findUnique({
    where: {
      whiteboardSessionId_learnerProfileId: { whiteboardSessionId, learnerProfileId },
    },
  });
  if (!participant) {
    console.error(
      `[lpr] lpr=${learnerProfileId} action=join_denied sessionId=${whiteboardSessionId} reason=not_participant`
    );
    notFound();  // deny-by-default; anti-enumeration (404 not 403)
  }
  return participant;
}
```

Called from the live-session join handler, AFTER `getLearnerSession()` extracts `learnerProfileId`. The `SessionParticipant` row must exist before a learner can connect to the WebRTC room.

### 7.3 `assertEffectiveConsent`

```typescript
// src/lib/consent-scope.ts
type ConsentPermission = 'allowAudioRecording' | 'allowWhiteboardRecording' | 'allowNoteSending'
  | 'allowMessaging' | 'allowVideoRecording' | 'allowLiveSession';

async function assertEffectiveConsent(
  whiteboardSessionId: string,
  permission: ConsentPermission
): Promise<void> {
  const snapshot = await db.sessionConsentSnapshot.findUnique({
    where: { whiteboardSessionId },
  });
  if (!snapshot) {
    // No snapshot = unclaimed student; fall back to tutor-acknowledged consent (existing behavior)
    // Emit warning for observability; DO NOT block (would break existing tutor-only sessions)
    console.warn(`[cns] sessionId=${whiteboardSessionId} action=no_snapshot permission=${permission} fallback=tutor_acknowledged`);
    return;
  }
  if (!snapshot[permission]) {
    console.error(`[cns] cns=${snapshot.id} action=consent_denied sessionId=${whiteboardSessionId} permission=${permission}`);
    throw new ConsentError(`${permission} not consented for this session`);
  }
}
```

**`ConsentError`** maps to HTTP 403 in the route error handler. In the tutor workspace, a `ConsentError` when arming audio recording shows a UI indicator ("Recording not consented for [Student Name]") — it does NOT block session continuation, consistent with the reliability-bar principle that consent failures must never wedge session close (per locked `endWhiteboardSession` split in consent-gates-capture design).

**Enforcement placement:**
- `assertEffectiveConsent('allowAudioRecording')` → called before `setUserWantsRecording(true)` in the workspace server action (FSM never arms without consent)
- `assertEffectiveConsent('allowWhiteboardRecording')` → called before enabling the events.json replay blob upload
- `assertEffectiveConsent('allowNoteSending')` → called in `POST /api/notes/[id]/send`
- `assertEffectiveConsent('allowLiveSession')` → called in the learner join handler (defensive redundancy with `assertIsSessionParticipant`)

### 7.4 Consent Snapshot Creation

```
Effective consent calculation (called inside startWhiteboardSession transaction):

latestConsent = db.consentRecord.findFirst({
  where: { learnerProfileId, tutorId: tutor.adminUserId },
  orderBy: { version: 'desc' },
})
restriction = db.consentRestriction.findUnique({ where: { learnerProfileId } })

effective = {
  allowLiveSession:          latestConsent.allowLiveSession,
  allowAudioRecording:       latestConsent.allowAudioRecording    && !(restriction?.restrictAudioRecording),
  allowWhiteboardRecording:  latestConsent.allowWhiteboardRecording && !(restriction?.restrictWhiteboardRecording),
  allowNoteSending:          latestConsent.allowNoteSending       && !(restriction?.restrictNoteSending),
  allowMessaging:            latestConsent.allowMessaging         && !(restriction?.restrictMessaging),
  allowVideoRecording:       latestConsent.allowVideoRecording    && !(restriction?.restrictVideoRecording),
  allowEducationalUse:       latestConsent.allowEducationalUse,    ← child cannot restrict educational use
  selfLearnerConsent:        accountHolder.isSelfLearner,          ← Q-CGC-1 audit flag
  consentRecordId:           latestConsent.id,
  consentRecordVersion:      latestConsent.version,
}

create SessionConsentSnapshot { whiteboardSessionId, ...effective, frozenAt: now() }
```

**`SessionConsentSnapshot` is strictly immutable after creation.** There is NO server action or route that allows UPDATE or DELETE on a snapshot. The only write path is the `createSessionConsentSnapshot` call inside `startWhiteboardSession`. This is tested in Phase 3 acceptance.

**Self-learner path (`isSelfLearner=true`):** the AccountHolder IS the learner. The `ConsentRecord` is set by the AccountHolder for themselves (no "parent" vs "child" split). `selfLearnerConsent=true` on the snapshot marks this case for auditing. The effective consent computation is the same code path — the self-learner's own `ConsentRecord` acts as both ceiling and floor.

### 7.5 Mid-Session Learner Swap → New Snapshot Per Learner

Per the locked swap design (session-lifecycle-consent-design §3): the swap is an atomic end of Session A + atomic start of Session B. Each session has its own `SessionConsentSnapshot`.

**Consent enforcement on swap:**
1. Session A ends (recorder stops, outbox drains, `endWhiteboardSession` called)
2. Session B is created for the incoming learner
3. A NEW `SessionConsentSnapshot` is computed and frozen for Session B using the incoming learner's consent AT SWAP TIME
4. A NEW `SessionParticipant` row is created for the incoming learner on Session B
5. If the incoming learner has `allowAudioRecording=false`: recorder does NOT arm for Session B; tutor workspace updates consent indicator

Session A's snapshot is immutable. The swap does not alter it.

### 7.6 AccountHolder as Session Observer (Parent-Side Access)

Parents are NOT `SessionParticipant` rows (those are for live-session attendees). Post-session access for parents:

- Notes: `assertOwnsLearnerProfile(ah.id, learnerProfileId)` + `snapshot.allowNoteSending=true`
- Recordings: `assertOwnsLearnerProfile(ah.id, learnerProfileId)` + `snapshot.allowAudioRecording=true`
- Transcripts: same as recordings

Routes: `GET /account/children/[learnerId]/sessions/[sessionId]/notes|recordings|transcript`. These routes use the `AccountHolder` session — not the NextAuth token.

---

## §8. Access Guards

### 8.1 Guard Catalog

| Guard | Signature | Caller context | Fail behavior |
|---|---|---|---|
| `assertOwnsStudent` | `(adminUserId, studentId) → Student` | Tutor route handlers (existing) | `notFound()` |
| `assertOwnsLearnerProfile` | `(accountHolderId, learnerProfileId) → LearnerProfile` | AccountHolder route handlers | `notFound()` — already implemented on `identity-p2-ownership-guard` |
| `assertIsSessionParticipant` | `(learnerProfileId, whiteboardSessionId) → SessionParticipant` | Learner join handler + session data routes | `notFound()` |
| `assertEffectiveConsent` | `(whiteboardSessionId, permission) → void` | Capture routes, recorder arm, note-send | `ConsentError` (→ 403 via route error handler) |
| `assertOwnsConsentRecord` (**NEW**) | `(accountHolderId, consentRecordId) → ConsentRecord` | Parent consent-change routes | `notFound()` |

**`assertOwnsConsentRecord`** is a new guard not in the identity design. When a parent updates their consent ceiling, the route must verify the `ConsentRecord.learnerProfile.accountHolderId === accountHolderId`. Without this, AccountHolder A could modify AccountHolder B's consent record via a crafted request with a valid `consentRecordId` but the wrong session.

Implementation:
```typescript
async function assertOwnsConsentRecord(
  accountHolderId: string,
  consentRecordId: string
): Promise<ConsentRecord> {
  const record = await db.consentRecord.findUnique({
    where: { id: consentRecordId },
    include: { learnerProfile: { select: { accountHolderId: true, tombstonedAt: true } } },
  });
  if (!record || record.learnerProfile.accountHolderId !== accountHolderId || record.learnerProfile.tombstonedAt !== null) {
    console.error(`[cns] cns=${consentRecordId} action=assert_owns_denied accountHolderId=${accountHolderId}`);
    notFound();
  }
  return record;
}
```

### 8.2 Tombstone Handling (COPPA)

| State | Effect on auth |
|---|---|
| `LearnerProfile.tombstonedAt IS NOT NULL` | `assertOwnsLearnerProfile` → `notFound()` (profile is redacted; doesn't exist even to its owner). `getLearnerSession()` → joins LearnerProfile; if tombstoned → treat as invalid session → null → 401. Learner PIN login → username lookup → profile found but tombstoned → same 401 as wrong PIN (no enumeration). |
| `AccountHolder.tombstonedAt IS NOT NULL` | All `getAccountHolderSession()` calls → treat as revoked (check AccountHolder.tombstonedAt in the session helper). All existing `AccountHolderSession` rows must be bulk-revoked as part of the tombstone action. |
| Tombstone sequence | ALWAYS: tombstone all LearnerProfiles first → tombstone AccountHolder (`Restrict` on AccountHolder→LearnerProfile enforces this at the DB level). Then revoke all sessions. |

### 8.3 Deny-by-Default Invariant

All guards MUST:
- Return `notFound()` (404) on any unexpected input — wrong owner, tombstoned, missing, null/undefined. Never return 200 on a guard path.
- Use 404 over 403 to avoid leaking resource existence to principals of a different tenant (anti-enumeration).
- Log the denial with the appropriate prefix before returning.
- Never throw a type that maps to a less-restrictive HTTP status code.

`assertEffectiveConsent` is the single exception — it throws `ConsentError` (→ 403) because:
1. The caller already knows the session exists (they're authenticated and past the participant check)
2. 403 communicates "you can't use this feature" distinctly from 404 "this session doesn't exist"
3. The tutor workspace needs to distinguish between "wrong session" (404) and "recording not consented" (403) to show the correct UI state

---

## §9. Schema Additions (Additive Only)

> These are new models and fields this design requires. They do NOT alter any existing column. Do not write migrations — just confirm consistency with `schema.prisma` on `v1-redesign` and flag what goes in which phase.

### 9.1 New Model: `AccountHolderSession`

**Not in any existing branch.** Must be added in the P2a migration.

```prisma
/// Server-side opaque session for AccountHolder (parent / adult self-learner).
/// Immediately revocable: set revokedAt or bulk-revoke on password reset / compromise.
/// Raw token stored ONLY in the HttpOnly cookie `mynk_ah_session`.
/// Only HMAC-SHA-256(rawToken, AH_SESSION_HMAC_SECRET) is persisted here.
model AccountHolderSession {
  id               String        @id @default(uuid())
  accountHolderId  String
  accountHolder    AccountHolder @relation(fields: [accountHolderId], references: [id], onDelete: Cascade)

  /// HMAC-SHA-256(rawToken, AH_SESSION_HMAC_SECRET). Raw token is never stored or logged.
  tokenHash        String        @unique

  /// True once AccountHolder has passed TOTP verification (if enrolled in Phase 6).
  /// Always false in Phase 2 — wired now so Phase 6 doesn't need to ALTER TABLE.
  twoFactorVerified Boolean      @default(false)

  /// User-agent snippet or admin-assigned label for session management UI.
  deviceInfo       String?

  /// Absolute expiry timestamp; renewed via sliding window on each validated request.
  expiresAt        DateTime

  lastUsedAt       DateTime      @default(now())
  revokedAt        DateTime?

  createdAt        DateTime      @default(now())

  @@index([accountHolderId])
  @@index([tokenHash])
  @@index([expiresAt])  // for background sweep of expired rows
}
```

**New env vars (add to `.env.example` + `docs/PLATFORM-ASSUMPTIONS.md §10`):**
- `AH_SESSION_HMAC_SECRET` — 32+ bytes random base64; signs AccountHolder session tokens
- `LEARNER_SESSION_HMAC_SECRET` — 32+ bytes random base64; signs LearnerDeviceSession tokens
- `AH_TOTP_ENCRYPTION_KEY` — AES-256-GCM key; encrypts AccountHolder TOTP secrets (Phase 6; reserve name now so Phase 6 executor doesn't pick a conflicting name)

### 9.2 Gap: `LearnerDeviceSession.expiresAt` Missing

The `identity-p2-schema` implementation of `LearnerDeviceSession` does NOT include an `expiresAt` column. The 90-day sliding window (Q-4) is locked, but without this column:
- The server cannot efficiently sweep expired sessions (`WHERE expiresAt < now()`)
- Sliding renewal has no place to persist the new expiry (only `lastUsedAt` exists)

**Add in P2a migration (additive to a new-and-empty table):**
```prisma
/// ADD to LearnerDeviceSession:
expiresAt  DateTime  // set to createdAt + 90d; updated to now() + 90d on sliding renewal
```

This field is absent from the identity design doc §2.3 sketch. The P2a migration adds it alongside the `AccountHolderSession` table.

### 9.3 Gaps on `AccountHolderEmailToken`

Two nullable fields to add (either in P2a migration or a tiny separate additive migration):

```prisma
/// ADD to AccountHolderEmailToken:
/// For CRITICAL_ACTION tokens: JSON payload identifying the specific action being confirmed.
/// Prevents a single token from confirming multiple unrelated actions.
/// Example: '{"action":"change_consent","learnerProfileId":"<id>"}'
payload              String?

/// For SIGNUP_VERIFY tokens sent to a child's email (optional email upgrade path §4.8):
/// Identifies which LearnerProfile the verification applies to.
/// Null = AccountHolder email verification (the normal case).
targetLearnerProfileId String?
```

Both are nullable and additive. They can be added in the same P2a migration or a standalone additive migration (no functional dependency on ordering).

### 9.4 Phase 3 Gap: Consent Toggle Alignment

The session-lifecycle consent design (RATIFIED 2026-05-31) added `allowWhiteboardRecording` and `allowEducationalUse` as distinct toggles. The identity design doc's schema sketch for `ConsentRecord`, `ConsentRestriction`, and `SessionConsentSnapshot` (which `identity-p2-schema` does NOT include — those are Phase 3 models) uses the OLDER toggle list.

**Impact on P2a:** None — these consent models are Phase 3. **Flag for Phase 3 executor:** use the RATIFIED toggle list from the spine (§ Essentials-vs-optional consent split table), NOT the schema sketch in `session-identity-access-design-2026-05-31.md` §2.3. The ratified list adds `allowWhiteboardRecording` and `allowEducationalUse`; the restriction model needs `restrictWhiteboardRecording Boolean @default(false)` and (optionally) a note that `allowEducationalUse` is not child-restrictable.

### 9.5 Consistency Check vs. `identity-p2-schema` (`e305d0b`)

| Item | Design doc | `identity-p2-schema` | Verdict |
|---|---|---|---|
| `StudentClaimInvite.tutorId` | `tutorId` | `adminUserId` | **CORRECT DEVIATION** — `adminUserId` matches AGENTS.md convention. Executor: always use `adminUserId` in claim flow logic. |
| `StudentClaimInvite.token` | `token String @unique` (plaintext) | `token String @unique` (plaintext — same as design doc) | **GAP** — recommend hash-only storage. Executor: rename to `tokenHash` in P2a migration before column is first populated in production (see §6.4). |
| `LearnerProfile.tombstonedAt` | Not in design doc | Added in `identity-p2-schema` | **CORRECT ADDITIVE** — required by `assertOwnsLearnerProfile` (already uses it). |
| `AccountHolder.tombstonedAt` | Not in design doc | Added in `identity-p2-schema` | **CORRECT ADDITIVE** — required for PII/business-record separation. |
| `AccountHolder.isSelfLearner` | YES (in design doc) | Should be in `identity-p2-schema` | **VERIFY before P2a** — run `\d "AccountHolder"` on dev Neon branch to confirm the column exists. If missing, add in P2a migration. |
| `LearnerDeviceSession.expiresAt` | NOT in design doc | NOT in `identity-p2-schema` | **GAP — add in P2a** (§9.2) |
| `AccountHolderSession` | NOT in design doc | NOT in any branch | **NEW — add in P2a** (§9.1) |
| `AccountHolderEmailToken.payload`, `.targetLearnerProfileId` | NOT in design doc | NOT in any branch | **NEW — add in P2a** (§9.3) |
| `ConsentRecord.allowWhiteboardRecording`, `ConsentRecord.allowEducationalUse` | NOT in identity design | NOT in any branch | **Phase 3 gap** — not a P2a concern; flag for Phase 3 executor |
| `AccountHolder2FA`, `AccountHolder2FABackupCode` | In identity design doc | NOT in `identity-p2-schema` | **Phase 6** — defer models + enrollment UI to Phase 6. `AccountHolderSession.twoFactorVerified` is wired now (§9.1) so Phase 6 doesn't need schema change on the session table. |

### 9.6 Schema Items Deliberately Unchanged

- `Student.learnerProfileId String? @unique` — already on `identity-p2-schema`
- `Student.recordingDefaultEnabled` — kept as tutor UX preference (orthogonal to consent)
- `WhiteboardSession.consentAcknowledged` — kept as tutor UI gate (per identity design §7.4)
- `WhiteboardSession.startedAt DateTime @default(now())` — currently non-null. The session-lifecycle design §2.5 proposes making this nullable (`startedAt DateTime?`) for the waiting-room "pending" state. **This is a schema change** to an existing model; it's additive (making non-null nullable keeps all existing rows valid) but should be included in the Phase 3 migration or a standalone P2a additive migration. It's NOT a P2a blocker (the auth flow works with the current `startedAt` behavior). Flag for Phase 3 executor.
- All `WhiteboardSession`, `SessionNote`, `SessionRecording`, `CostEvent` models — untouched
- `AdminUser2FA`, `AdminUser2FABackupCode` — live on `v1-redesign`; unchanged

---

## §10. Rollout / Migration

### 10.1 Feature Flag Strategy

AccountHolder and LearnerProfile features introduce entirely new routes (`/account/*`, `/claim/*`, `/join/*`) with no modifications to existing tutor routes. The current production app (tutor-only) is functionally unaffected by the P2a DB migration (all new tables, all empty, no existing routes changed).

**Effective "feature flag":** the absence of the route pages. The DB models exist but UI is unreachable until P2b ships the pages. The one exception is the "Send claim invite" button on the student detail page — gate with `process.env.NEXT_PUBLIC_CLAIM_INVITES_ENABLED === 'true'` (unset in production until P2b is smoked).

**No runtime feature flags needed** for P2a's back-end auth code — the endpoints exist but only the tutor-facing "Send invite" button can trigger the flow, and that's gated.

### 10.2 Phase Sub-Batches

The identity design §9 defines 6 phases. Phase 2 is refined here into three shippable sub-batches:

**P2a: Core session infrastructure + claim flow back-end**
*Gate: **PASSED** — AH-1..AH-7 + amendments ratified 2026-06-01 ([RATIFIED + AMENDED](#ratified--amended-andrew-2026-06-01))*

- New models: `AccountHolderSession`, `expiresAt` on `LearnerDeviceSession`, `payload` + `targetLearnerProfileId` on `AccountHolderEmailToken`, rename `StudentClaimInvite.token` → `tokenHash`
- Auth helpers: `getAccountHolderSession()`, `getLearnerSession()`, `getAccountHolderFromSession()`
- Route handlers: `/api/auth/account-holder/signup|login|logout|forgot-password|reset-password`, `/verify-email`
- Claim flow back-end: `/api/students/[id]/claim-invites`, `/api/claim/[token]/complete`, `/api/claim/[token]/setup` (consent + credential sub-steps)
- Child login back-end: `/api/auth/learner/login|logout`, `getLearnerSession()`
- New access guards: `assertIsSessionParticipant`, `assertEffectiveConsent`, `assertOwnsConsentRecord`
- Middleware additions: cookie-presence checks for `/account/*` + `/join/*`
- **No UI pages yet** — back-end + guards only
- **Smoke gate:** integration tests against test DB: full claim flow (invite → signup → verify → claim → setup), privilege-confusion invariants I-1 through I-6, concurrent-claim race, soft-lockout behavior
- **Model tier:** `claude-4.6-sonnet-medium-thinking` (new auth boundaries, cross-principal session management, concurrency)

**P2b: AccountHolder UI + child login UI**
*Gate: P2a smoked*

- `/account/login`, `/account/signup`, `/account/forgot-password`, `/account/reset-password`
- `/account/dashboard`, `/account/children/[id]`, `/account/children/[id]/devices`
- `/claim/[token]` wizard (signup/login → complete → setup — consent toggles + child credential setup)
- `/students/login` child login page
- `NEXT_PUBLIC_CLAIM_INVITES_ENABLED=true` env toggle activated
- **Smoke gate:** real-hardware smoke — parent creates account, claims student, child logs in on device, device shows in parent's device list, parent revokes → child session rejected on next request
- **Model tier:** `claude-4.6-sonnet-medium-thinking` (new auth surfaces, access boundaries)

**P2c: Child email upgrade path + AccountHolder opt-in 2FA prompt**
*Gate: P2b smoked; defer until P2b is stable*

- `LearnerProfile.email` + verification flow (§4.8)
- AccountHolder 2FA enrollment prompt in account settings ("Highly recommended" — not required)
- **Phase 6** completes 2FA hardening; P2c just adds the encouragement surface
- **Model tier:** `generalPurpose model="composer-2.5"` — well-scoped, no new auth boundary beyond P2a

### 10.3 Held Branch Merge Order (AH-7 Recommendation: AS-IS)

**Recommended sequence:**
```
1. Andrew ratifies AH-1..AH-7 decisions in this doc
   ↓
2. git merge --no-ff identity-p2-schema        (onto v1-redesign; Migration 20260531190000)
   — already tested: tsc + next build green per STATUS doc
   ↓
3. git merge --no-ff identity-p2-ownership-guard  (onto v1-redesign; assertOwnsLearnerProfile + 14 tests)
   — already tested: tsc + next build + 14 ownership tests green per STATUS doc
   ↓
4. P2a branch:
   Migration: 2026060XXXXXX_identity_p2a_session_infra
   (AccountHolderSession + LearnerDeviceSession.expiresAt + AccountHolderEmailToken payload fields
    + StudentClaimInvite tokenHash rename + auth helpers + claim back-end)
   Smoke → merge --no-ff to v1-redesign
   ↓
5. P2b branch: UI pages
   Smoke → merge --no-ff to v1-redesign
   ↓
6. Phase 3: consent lattice implementation (ConsentRecord etc.)
```

**Migration timestamp ordering:**
- `20260531180000` + `20260601120000` (p1 2FA — already on v1-redesign)
- `20260531190000` (p2-schema; sorts before 0601 by timestamp; confirmed safe per STATUS doc F12 — all additive)
- `2026060XXXXXX` (p2a — new; must have a timestamp ≥ `20260602000000` to sort after the existing migrations)

---

## §11. Log Prefixes (Phase 2 Event Catalog)

Prefixes already registered: `ahx`, `lpr`, `clm`, `cns`, `tfa`, `msg`. All Phase 2 events use these registered prefixes — no new prefixes needed.

| Prefix | Event | Log line |
|---|---|---|
| `ahx` | Signup | `[ahx] ahx=<id> action=signup email=<email>` |
| `ahx` | Email verified | `[ahx] ahx=<id> action=email_verified` |
| `ahx` | Login | `[ahx] ahx=<id> action=login session=<sessionId> twoFactorRequired=<bool>` |
| `ahx` | Logout | `[ahx] ahx=<id> action=logout session=<sessionId>` |
| `ahx` | Password reset | `[ahx] ahx=<id> action=password_reset sessions_revoked=<n>` |
| `ahx` | Session validation failure | `[ahx] ahx=unknown action=session_invalid reason=<expired\|revoked\|notfound>` |
| `clm` | Invite minted | `[clm] clm=<inviteId> action=invited studentId=<id> adminUserId=<id>` |
| `clm` | Invite viewed | `[clm] clm=<inviteId> action=viewed` |
| `clm` | Claim completed | `[clm] clm=<inviteId> action=claimed learnerProfileId=<id> accountHolderId=<id>` |
| `clm` | Invite expired on read | `[clm] clm=<inviteId> action=expired_on_read` |
| `clm` | Invite revoked (tutor) | `[clm] clm=<inviteId> action=revoked reason=tutor_action` |
| `clm` | Invite revoked (post-claim cleanup) | `[clm] clm=<inviteId> action=revoked reason=post_claim_cleanup` |
| `lpr` | Credential created | `[lpr] lpr=<id> action=credential_created` |
| `lpr` | Learner login | `[lpr] lpr=<id> action=login device=<sessionId>` |
| `lpr` | Learner login failed | `[lpr] lpr=unknown action=login_failed username=<normalizedUsername> attempt=<n>` |
| `lpr` | Lockout threshold | `[lpr] lpr=unknown action=lockout_threshold_reached username=<normalizedUsername>` |
| `lpr` | Device session revoked | `[lpr] lpr=<id> action=device_revoked session=<sessionId> revokedBy=<parent\|self>` |
| `lpr` | Join denied | `[lpr] lpr=<id> action=join_denied sessionId=<id> reason=not_participant` |
| `cns` | Consent denied | `[cns] cns=<snapshotId> action=consent_denied sessionId=<id> permission=<name>` |
| `cns` | No snapshot (unclaimed fallback) | `[cns] sessionId=<id> action=no_snapshot permission=<name> fallback=tutor_acknowledged` |

---

## §12. 5-Axis Adversarial Reliability Review

### Axis 1 — Data Durability

| Risk | Severity | Mitigation |
|---|---|---|
| `AccountHolderSession` persists after password reset | **BLOCKER-P2-S2** | Password reset bulk-revokes ALL session rows in same transaction; fresh session issued. Existing sessions are immediately invalid. |
| Orphaned `LearnerProfile` on failed claim transaction | **BLOCKER-P2-R1** | All 4 claim steps (create profile → update student → mark invite used → revoke siblings) execute in ONE DB transaction. Any step failure rolls back all steps. |
| `StudentClaimInvite` token stored plaintext | MEDIUM | **Recommendation (§6.4):** rename to `tokenHash` in P2a and store SHA-256. Column is empty in production at rename time. Aligns with all other token-bearing models in the codebase. |
| `AccountHolderEmailToken` replayed (used twice) | HIGH | `usedAt IS NULL` check in query; UPDATE sets `usedAt` in same transaction. Second use: 0 rows affected → reject. |
| `AccountHolderSession` table grows unbounded | LOW | `@@index([expiresAt])` enables sweep. Background sweep (Phase 6): `DELETE WHERE expiresAt < now() - 7d AND revokedAt IS NOT NULL`. Not a P2a blocker. |
| `LearnerDeviceSession` without `expiresAt` | HIGH | Gap identified (§9.2). Add `expiresAt` column in P2a migration before any sessions are created. |

### Axis 2 — Recovery / Durability

| Risk | Severity | Mitigation |
|---|---|---|
| Parent locked out (forgotten password + 2FA) | MEDIUM | Password reset via verified email (always on file). If email also lost: support email path (manual; reasonable at pilot scale). Never permanently locked out. |
| Child locked out before session | **HIGH → Mitigated** | Soft-lockout only (AH-4: time-based cooldown, no hard lock). Parent can change PIN via account settings if all else fails (revokes all device sessions; child re-logins with new PIN). Recovery: ~2 minutes. Document in onboarding. |
| Tutor sends invite to wrong email address | LOW | Tutor can revoke invite via student panel and re-issue. No data consequences — student stub is unchanged. |
| Claim invite expires before parent acts | LOW | 7-day default. Tutor resends via student panel (up to 3 pending invites). No data loss. |
| Session renewal race (two concurrent requests with same session cookie) | LOW | Extend-in-place (AH-5): both requests extend the same session row. `lastUsedAt` is last-write-wins; `expiresAt` gets set to `now()+30d` by whichever lands last. Both requests succeed. No session death. |

### Axis 3 — Concurrency

| Race condition | Severity | Mitigation |
|---|---|---|
| Two parents claim same Student simultaneously | **BLOCKER-P2-C1** | Unique constraint on `Student.learnerProfileId`. Step 4b: `UPDATE WHERE learnerProfileId IS NULL` — second concurrent transaction returns 0 rows → ROLLBACK → 409. Both callers check the affected-rows count. |
| Two invites for same student both concurrently completed | HIGH | Same unique constraint. Only one UPDATE of `Student.learnerProfileId` can succeed. Post-claim cleanup revokes the other invite in the winning transaction. |
| Concurrent login + password reset | HIGH | Password reset bulk-revokes all sessions in the same transaction that writes the new password hash. If a login just succeeded (new session created before the reset), the bulk-revoke catches it too — no ordering dependency. |
| PIN fail-count races | LOW | In-memory rate-limit buckets (approximate counts); worst case is a slightly early or late soft-lockout trigger. Acceptable for soft-lockout policy. |

### Axis 4 — Auth / Ownership Boundaries

| Boundary | Severity | Mitigation |
|---|---|---|
| AccountHolder cookie satisfies admin route | **BLOCKER-P2-A1** | `getToken()` reads only the NextAuth cookie. `mynk_ah_session` produces `null`. Middleware gate unchanged. **TEST: middleware unit test with only `mynk_ah_session` → assert redirect to /login.** |
| Learner cookie satisfies admin route | **BLOCKER-P2-A1** | Same. **TEST: same test with `mynk_learner_session`.** |
| AccountHolder A accesses LearnerProfile owned by AccountHolder B | HIGH | `assertOwnsLearnerProfile` guard (14 tests on `identity-p2-ownership-guard`). **TEST: AccountHolder B session + AccountHolder A's profileId → 404.** |
| Learner accesses sibling's profile | HIGH | `getLearnerSession()` returns `{ learnerProfileId, accountHolderId }`. Data routes for sibling data call `assertOwnsLearnerProfile(session.accountHolderId, requestedProfileId)`. A sibling's profileId will fail because... wait — both siblings share the same `accountHolderId`. **CORRECTED:** for a learner's own data, the check is `session.learnerProfileId === requestedId` (not owner check). For resources scoped to `learnerProfileId`, the guard is `assertIsSessionParticipant` (the learner can only access sessions they participated in). **TEST: learner A session + learner B's sessionParticipant ID → 404.** |
| Post-claim: stale pending invites remain active | **BLOCKER-P2-S3** | Step 4d: all other pending invites for the same student are revoked in the same claim transaction. **TEST: create 2 invites → claim via invite 1 → assert invite 2 has revokedAt IS NOT NULL.** |
| Tombstoned profile grants session | HIGH | `getLearnerSession()` joins `LearnerProfile.tombstonedAt`; if non-null → null → 401. **TEST: tombstone profile → existing device session → 401.** |
| CRITICAL_ACTION token confirms wrong action | MEDIUM | `payload` field binds token to specific action (§3.6, §9.3). Executor must verify `JSON.parse(token.payload).action === requestedAction`. **TEST: CRITICAL_ACTION token for consent-change → attempt to use for email-change → reject.** |

### Axis 5 — Observability

**BLOCKER-P2-O1:** all `ahx=`, `clm=`, `lpr=` events in the §11 event catalog MUST emit before P2a ships to production. Without them, debugging a failed claim or a locked-out parent in production is impossible.

| Verification step | How |
|---|---|
| Pre-production log audit | Manually trigger each P2a flow on preview env; grep logs for each required event |
| Post-deploy monitor | After first real claim in production: grep `[clm] action=claimed` — must appear; alert if missing |

---

### BLOCKERs Summary — Fold into P2a Acceptance Criteria

| ID | Description | Required test |
|---|---|---|
| **BLOCKER-P2-S1** | Session fixation: login issues a FRESH session token; no pre-auth session cookie is elevated | Test: complete login flow; assert `sessionId` in new cookie is different from any prior value |
| **BLOCKER-P2-S2** | Password reset revokes all existing `AccountHolderSession` rows for that account | Test: login → get session A → reset password → present session A cookie → 401 |
| **BLOCKER-P2-S3** | Post-claim: all other pending invites for the same student are revoked in same transaction | Test: 2 invites for student → claim via invite 1 → invite 2 has `revokedAt IS NOT NULL` |
| **BLOCKER-P2-R1** | Claim transaction is fully atomic: failure at any step rolls back all steps | Test: inject mock DB failure at step 4b (Student update) → assert no `LearnerProfile` row was created |
| **BLOCKER-P2-C1** | Concurrent claim race: unique constraint + 0-rows-updated check prevents double-claim | Test: two concurrent `POST /api/claim/[token]/complete` → exactly one 200, one 409 |
| **BLOCKER-P2-A1** | AccountHolder and Learner cookies never satisfy the admin route gate | Unit test: middleware handler with each non-NextAuth cookie → 302 to `/login` |
| **BLOCKER-P2-O1** | All P2a log events emit before production | Manual audit of preview environment before P2a merge to v1-redesign |

---

## IAC refinements — 2026-06-02 (Andrew co-design)

> **Status:** **RATIFIED** (Andrew + Opus co-design, 2026-06-02). This section records identity/access/consent (IAC) decisions that **refine or supersede** items in [§ RATIFIED + AMENDED (Andrew 2026-06-01)](#ratified--amended-andrew-2026-06-01), [§0](#0-decisions--ratified-andrew-2026-06-01) (notably **AH-4**), and the upstream data model in [`session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md). **Does not** replace §1 (locked upstream inputs) wholesale — it amends where noted.
>
> **Build sequencing:** schema + claim/connect + `accessMode` enforcement + family-id + round-4 UX land in the **next identity build** ("P2 multi-tutor + accessMode/family-id schema change + round-4 UX") on top of `identity-p2b-ui`; Phase-3 consent models consume §9 below.

### Evidence / current-state anchors

| Topic | Current code/schema (pre-refinement) | Gap |
|---|---|---|
| Tutor content isolation | Session artifacts anchor on tutor-scoped `studentId` + `adminUserId`; `assertOwnsStudent` / `assertOwnsWhiteboardSession` | **Verified enforced** — no change required |
| One child, many tutors | `Student.learnerProfileId @unique` (global) | **Contradicts** Phase-3 `ConsentRecord @@unique([learnerProfileId, tutorId, version])` — only one tutor can link a given profile |
| Claim with existing AccountHolder | Claim flow **creates** a new `LearnerProfile` per claim | Fragments one real child across tutors |
| `LearnerProfile.accessMode` | Stored (`LearnerAccessMode` enum); **learner login route ignores it** | Stored-but-ignored gap |
| Child username | `LearnerCredential.username @unique` (global) | Cannot have `dragon` in two families |
| PIN lockout | AH-4: soft-lock only, **never hard lock**; rate-limit keyed username+IP | Insufficient vs distributed brute force; no parent unlock path |
| Child login handle | Round-3 smoke stripped decorative `@`; login strips leading `@` | **Superseded** — `@` becomes **required** separator for `username@familyid` (round-4) |

### Decision ledger (IAC-1..IAC-11)

| ID | Topic | Decision (LOCKED) | Rationale |
|---|---|---|---|
| **IAC-1** | Tutor↔tutor content isolation | **INVARIANT (verified, no schema change):** all session artifacts (`SessionNote`, `SessionRecording`, `WhiteboardSession`, `ShareLink`, `NoteView`, `CostEvent`, etc.) anchor on tutor-scoped `studentId` (+ `adminUserId`), gated by `assertOwnsStudent` / `assertOwnsWhiteboardSession`. **Content NEVER anchors on `LearnerProfile` or `AccountHolder`.** | Cross-tutor leakage is prevented by tutor ownership of `Student`, not by a global learner principal. Upstream: [`session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) ownership model. |
| **IAC-2** | One child, many tutors | **CHANGE:** replace `Student.learnerProfileId @unique` with `@@unique([adminUserId, learnerProfileId])`. One canonical `LearnerProfile` → **N** tutor-scoped `Student` rows. A tutor cannot double-claim the same child; multiple tutors may each link the same child. | Unblocks Phase-3 consent keyed `(learnerProfileId, tutorId)`; matches Sarah "multiple kids per parent" + multi-tutor reality. **Supersedes** global `@unique` in p2 schema + upstream design doc `Student` sketch. |
| **IAC-3** | Claim = attach-to-existing-first | **CHANGE:** signed-in `AccountHolder` on a tutor claim link sees an **interstitial** listing owned `LearnerProfile`s **not already connected to that tutor** (children + self-profile if `isSelfLearner`), plus **"add a new child"** and **"connect yourself as a learner."** Selection creates a tutor-scoped `Student` linked to the **existing** profile. **Supersedes** always-`create`-new-`LearnerProfile` on claim (identity fragmentation). | Implements ratified parent-first / bidirectional linking ([§ RATIFIED + AMENDED](#ratified--amended-andrew-2026-06-01) connect-link interstitial) with explicit attach-first UX. |
| **IAC-4** | Parent-first creation | Parent may create a child `LearnerProfile` **without** a prior tutor claim. Account dashboard gains **"add a child"** affordance. Model supports in this build; **standalone polish UI may fast-follow** if schedule-tight. | Realm already parent-first-ready; reduces claim-only dependency. |
| **IAC-5** | AccountHolder vs LearnerProfile reframe | **REFINES** locked "AccountHolder = student for adults" wording (Andrew **2026-06-02**): **`AccountHolder`** = auth / billing / consent-owner principal. **`LearnerProfile`** = session / content principal, **always** owned by an `AccountHolder`. Adult self-learner = `AccountHolder` owning exactly one `LearnerProfile` with `isSelfLearner`, authenticated via AccountHolder session, self-consenting (18+, no VPC). **Uniform rule:** tutor `Student` **always** links to a `LearnerProfile`; content isolation + consent identical for children and adults. **No** special-case `Student` → `AccountHolder` direct link. | One lattice for consent + participants; removes dual "adult collapse" code paths. Aligns with [`session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) three-principal model, clarifies roles. |
| **IAC-6** | `accessMode` enforcement | **CHANGE:** enforce `LearnerProfile.accessMode` + `isSelfLearner`. Values: `child_pin_required` → independent `username@familyid` + PIN login; `account_holder_session` → authenticate via owning AccountHolder session (parent-selects-child **or** adult-self). **V1 floor:** `child_pin_required` + family-id path. **`parent_session_select`** (parent picks child to act as under AccountHolder session) = **FAST-FOLLOW**, not V1. Learner login route **must** branch on `accessMode` (closes stored-but-ignored gap). | Matches per-child access mode ratified 2026-06-01; child PIN path is Sarah-critical for independent devices. |
| **IAC-7** | Family identifier | **NEW:** `AccountHolder.familyId` **globally unique**. Child independent login = `username@familyid` + PIN. `LearnerCredential` uniqueness: `@@unique([accountHolderId, username])` (per-family "dragon"). **Lazy creation:** first `child_pin_required` learner setup — suggest default, allow custom edit, validate global uniqueness; editable later via family-settings. **Adult self-learners** and `account_holder_session` families **do not** need a family id. **`@` is REQUIRED** as separator (`pooky@mortensen1847`) — **supersedes** round-3 `@`-strip / cosmetic de-emphasis; round-4 reworks child-login + credential-setup username UX around the full handle. | Human-memorable scoped login without global username squatting; `@` disambiguates username vs family id. |
| **IAC-8** | "I am a learner" at signup | Account signup offers option (copy TBD, e.g. "I'll be taking lessons myself") → sets `isSelfLearner` + creates self-`LearnerProfile`. Claim interstitial includes self-profile in pick-list; **"connect yourself as a learner"** on-demand creates self-profile if signup option skipped. | Supports ~40% adult-self mix (Sarah); avoids orphan AccountHolders without learner principal. |
| **IAC-9** | Consent model + defaults | Consent per `(LearnerProfile, tutor)` (`ConsentRecord`); effective = parent ceiling ∩ child restriction (unchanged). **NEW:** per-child **consent default/template** on parent privacy-defaults screen. New tutor `ConsentRecord`s **seeded from template if set**, else nothing pre-selected (respects **optional = explicit unchecked opt-in**). **GUARDRAIL:** template pre-fills but **NEVER auto-grants** — every new tutor relationship requires **explicit parent confirm**. **TRANSPARENCY:** seeded toggles show **"from your saved defaults"** until parent edits/confirms that field. Claim-time **"Save as my default for future tutors?"** updates template. | Reduces repetitive claim friction without newsletter-style pre-check; VPC/opt-in bar preserved. |
| **IAC-10** | PIN lockout | **CHANGE — supersedes AH-4 "never hard lock":** layered policy — gentle early tiers (honest fat-finger) → nudge "ask a parent" → escalate → **HARD lockout** requiring **parent-side unlock**, well before brute-force viable. **SECURITY:** persistent per-credential, **IP-independent** failure counter (distributed / multi-IP attack on one handle still locks); **retain** per-IP global limit (one IP cannot sweep many accounts). Verify exact keying at build time against `src/lib/learner-pin-rate-limit.ts`. **BACKLOG (fast-follow):** "Ask parent to log in" + "Request parent approval to join this session" (temporary parent-approved join without kid PIN). | Reliability bar still favors kid-not-locked-out-*before session*; hard lock is parent-recoverable, not support-ticket permanent. AH-4 blast-radius row retained for history; **policy locked here**. |
| **IAC-11** | Round-4 UX (E/G/I) | See [`p2b-smoke-fixes.md`](p2b-smoke-fixes.md) § Round 4 — password copy (E), PIN `maxLength` audit (G), child-session independence copy (I). | UX acceptance for next smoke; method-agnostic strength + accurate child-login framing. |

### Supersession map (quick reference)

| Prior locked item | Superseded by |
|---|---|
| AH-4 (PIN soft-lock, never hard account lock) | **IAC-10** (layered + parent-unlock hard cap) |
| `Student.learnerProfileId @unique` (p2 schema) | **IAC-2** (`@@unique([adminUserId, learnerProfileId])`) |
| Claim always creates new `LearnerProfile` | **IAC-3** (attach-to-existing-first interstitial) |
| Round-3 `@` strip / "not starting with @" copy | **IAC-7** (`username@familyid` required) |
| "AccountHolder = student for adults" (spine shorthand) | **IAC-5** (AccountHolder owns LearnerProfile; self via `isSelfLearner`) |

### P2a / Phase-3 wiring notes (executors)

- **Claim transaction (BLOCKER-P2-R1 / C1):** extend atomic steps for attach-existing + IAC-2 uniqueness; concurrent attach → 409 on `@@unique([adminUserId, learnerProfileId])`.
- **Consent stubs:** seeding (IAC-9) lands with Phase-3 models; P2b placeholder panel remains until `ConsentRecord` exists.
- **Observability:** extend `clm=` / `ahx=` events for interstitial branch (`attach_existing` vs `create_child` vs `connect_self`) and family-id assignment (`family_id_assigned`).

---

*End of design document.*
