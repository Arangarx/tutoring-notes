# 5-Axis Adversarial Reliability Review  
## Admin/Tutor 2FA — "Remember This Device" (30-day trusted device)

> **Plan reviewed:** `docs/handoff/2fa-remember-device-plan-2026-06-13.md`  
> **Branch:** `auth/2fa-remember-device`, tip commit `b079a1d`  
> **Reviewed against:** plan doc + `src/lib/two-factor-session.ts`, `src/app/admin/settings/2fa/actions.ts`, `src/auth-options.ts`, `setup/page.tsx`, `verify/page.tsx`, `prisma/schema.prisma`, `src/lib/account-holder-session.ts`, `src/middleware.ts`, `src/app/admin/settings/profile/actions.ts`, `src/lib/admin-routing.ts`  
> **Reviewer:** adversarial subagent (read-only; no code written)  
> **Date:** 2026-06-13

---

## Axis 1 — Correctness & Completeness

**Score: YELLOW — 1 blocker, 1 should-fix**

### Login entry points coverage

The middleware (L195–212) gates all non-exempt `/admin/*` on `twoFactorVerified` in the JWT. The only exempt paths are `/admin/settings/2fa/setup`, `/admin/settings/2fa/verify`, and `/admin/pending-approval` (`admin-routing.ts` L101–109). The plan's two call sites (setup page and verify page) correctly cover both nodes where an unverified session is funneled:

- **Setup page path** (enrolled user, `!twoFactorVerified`) — skip fires before `redirect("/admin/settings/2fa/verify")` (plan §4, setup/page.tsx L34–36). ✓  
- **Verify page path** (direct nav or setup-page redirect) — skip fires before form render (plan §4, verify/page.tsx L28–32). ✓  
- **Test accounts / impersonation / env admin** — all three are in the exemption list (plan §4 "Exemptions"). Verified against middleware L202 (`!isTestAccount && !isImpersonating && !isEnvAdmin`) and auth-options.ts L133–136. ✓  
- **Google OAuth + Credentials login** — both set `twoFactorVerified = false` on fresh JWT (auth-options.ts L133–136, L150). Skip fires correctly on next page load regardless of provider. ✓  
- **Playwright harness** — `isPlaywrightHarnessActive()` short-circuits `twoFactorVerified=true` at jwt callback; the skip never fires. ✓  

### Missing entry point: impersonation start — **BLOCKER B1**

The plan's §6 step-up table includes `adminResetTwoFactor` (for acting admin resetting another user's 2FA) but does **not** include **starting an impersonation session** (`mintImpersonationSession` in `src/lib/impersonation.ts`). After this feature ships, a user who logs in via trusted-device skip — never entering a TOTP code in the current session — can immediately impersonate any other tutor. Impersonation grants full access to that tutor's students, recordings, whiteboard sessions, and notes.

Impersonation is the highest-privilege action in the app, yet it is not in the step-up list. The plan step-gates "admin reset another user's 2FA" (arguably less severe — it forces re-enrollment, a recoverable action); there is no principled reason to omit impersonation. See `assertIsAdmin()` in the impersonation action — it only checks `role === ADMIN`, not that a fresh TOTP was entered.

**Resolution:** Add `startImpersonation` (or its triggering server action) to §6's step-up table with the same treatment as `adminResetTwoFactor`. Wire `verifyTotpStepUp` before `mintImpersonationSession`.

### Additive migration claim

Confirmed: adding `AdminTrustedDevice` model + `trustedDevices AdminTrustedDevice[]` on `AdminUser` requires only a new table migration (FK lives on `AdminTrustedDevice.adminUserId`). No existing columns are renamed or dropped. The schema follows the established `LearnerDeviceSession` pattern almost exactly (`tokenHash @unique`, `expiresAt`, `revokedAt`, `deviceInfo`). Migration is genuinely additive. ✓

### `confirmTotpEnrollment` flow — no interference

`confirmTotpEnrollment` (actions.ts L194–214) already calls `mintTwoFactorVerifiedSession()`, setting `twoFactorVerified=true` in the cookie before the RSC re-render. When the setup page re-renders post-confirm, `session.user.twoFactorVerified` will be `true`, so the plan's skip guard (`if (isConfirmed && !session.user.twoFactorVerified)`) never fires during enrollment. No interference. ✓

### CallbackUrl preservation gap (pre-existing, not introduced by this feature)

The middleware clears all search params when redirecting to setup (`setupUrl.search = ""`; middleware L207–210). The original callbackUrl is already lost before the skip fires on the setup page. The plan's `redirect("/admin")` on a setup-page skip (§4 pseudocode) is consistent with the pre-existing behavior. The verify page's `redirect(safeReturnTo(callbackUrl))` would fall back to `/admin` for the same reason. This is a pre-existing UX gap, not introduced by this feature, but should be noted.

---

## Axis 2 — Failure Modes & Resilience

**Score: YELLOW — 1 blocker**

### DB error during skip — **BLOCKER B2 (partial)**

The plan states "On any failure: return `false` (caller shows normal verify UI)" (§4, step 4) and test TD-8 covers `DB throw during validate → skip returns false`. This is good specification. However, the plan's `tryTrustedDeviceLoginSkip` pseudocode (§4, step 3) performs **three sequential operations** after a successful validation:

1. Update `lastUsedAt`  
2. Call `mintTwoFactorVerifiedSession(currentToken)` — sets a new session cookie  
3. Log `login_skipped_via_trusted_device`  
4. Return `true`  

If `mintTwoFactorVerifiedSession` **throws** (e.g., `NEXTAUTH_SECRET` missing, cookie store error), the plan's fail-closed clause says "return false" but there is no explicit try-catch around step 3.2 in the pseudocode. The consequence of an uncaught throw is a **500 crash on the setup/verify page** rather than a graceful fallback to the TOTP form.

Compare: in `verifyTotpCode` (actions.ts L329–349), `mintTwoFactorVerifiedSession` is explicitly wrapped in try-catch with `console.error` and a comment — "If session minting fails (e.g. in test env), log but don't fail the verify." The same protection must be explicit in `tryTrustedDeviceLoginSkip`.

Note also: if `mintTwoFactorVerifiedSession` succeeds (cookie is already set) but the `lastUsedAt` update **then** throws, the cookie is valid and the user has a working session — returning `false` here would show the TOTP form again even though the user is actually logged in. The plan should specify that the `lastUsedAt` update is best-effort and failure does NOT prevent the skip from completing.

**Resolution:** The plan must explicitly specify that inside `tryTrustedDeviceLoginSkip`, `mintTwoFactorVerifiedSession` is wrapped in try-catch → on catch, return `false` (fail-closed crash prevention). The `lastUsedAt` update is best-effort: a failure there should be logged but NOT cause `tryTrustedDeviceLoginSkip` to return `false` after the session cookie is already set.

### Cookie present, row missing/expired/revoked

`validateAdminTrustedDevice` checks: hash lookup (missing → `null`), `adminUserId` match, `revokedAt IS NULL`, `expiresAt > now`. All cases return `null` → skip returns `false` → TOTP form shown. Correct fail-closed behavior. ✓

### Clock skew on expiry

Cookie `maxAge` and DB `expiresAt` are written in the **same server action** (`mintAdminTrustedDevice`), so they are computed from the same `new Date()` call with millisecond alignment. No meaningful clock skew between cookie and DB row. ✓ However: DB `expiresAt` is the ground truth (checked on every skip). If Neon DB is in a different timezone-zone than the edge (extremely unlikely but possible with a clock drift), the expiry check might fire up to a few seconds early/late. Not a blocker; document as acceptable.

### Token-hash secret missing or rotated — **SHOULD-FIX SF-1**

The plan correctly specifies fail-closed when `ADMIN_TFA_DEVICE_HMAC_SECRET` is unset (§1 env var spec: "fail-closed on skip/mint when unset in prod"). ✓

But the plan does **not document** that **rotating** `ADMIN_TFA_DEVICE_HMAC_SECRET` instantly invalidates ALL existing trusted-device rows — because the stored hashes were computed with the old secret. The new secret produces different hashes; no DB row will match any cookie. All users are silently demoted to TOTP-required on next login without any obvious error. This is acceptable behavior but is a **non-obvious ops footgun** unless it is documented in `docs/PLATFORM-ASSUMPTIONS.md`.

**Resolution (SF-1):** In the implementation commit that adds `ADMIN_TFA_DEVICE_HMAC_SECRET` to `PLATFORM-ASSUMPTIONS.md` (already required by §1), add an explicit note: "Rotating this secret invalidates all existing trusted-device tokens; all users will be prompted for TOTP on their next login. Plan a maintenance window or notify users if rotating."

### Race: revoke vs. concurrent login

Two concurrent trusted-device skip attempts from the same cookie → both validate the same row, both call `mintTwoFactorVerifiedSession`. Benign: both succeed, both write `lastUsedAt`. No corruption. ✓

Revoke from Device B racing concurrent skip on Device A: the skip on Device A reads BEFORE `revokedAt` is set → skip succeeds, user gets one more session. TOCTOU inherent in any revocable-token scheme. Blast radius is one extra session of non-sensitive-op access. Not a blocker. ✓

---

## Axis 3 — Security / Abuse

**Score: RED — 1 blocker, 2 should-fixes**

### `verifyTotpStepUp` missing rate-limit protection — **BLOCKER B3**

This is the most critical finding in the review.

The plan's §6 pseudocode for `verifyTotpStepUp` is:

```typescript
export async function verifyTotpStepUp(
  adminUserId: string,
  codeInput: string
): Promise<{ ok: true } | { ok: false; error: string }>
```

There is **no rate-limit call** specified before TOTP/backup validation.

The existing `verifyTotpCode` (actions.ts L263–269) calls `check2faVerifyRateLimit(adminId)` **before** any TOTP/backup computation specifically to prevent brute-force timing attacks and to stop enumeration before bcrypt/TOTP runs. The rate limit is keyed on `adminUserId` and is durable across Vercel cold starts (via `AuthThrottle` DB table, schema.prisma L963–976).

If `verifyTotpStepUp` omits this rate limit, an attacker with a compromised session (e.g., via stolen NextAuth session cookie, or a trusted-device cookie stolen alongside it) can brute-force the TOTP code for sensitive operations. 10^6 possible TOTP codes ÷ unlimited attempts = trivially exploitable in under a minute even with network latency.

**Resolution:** The plan must explicitly specify that `verifyTotpStepUp` calls `check2faVerifyRateLimit(adminId)` as its first operation, before any TOTP/backup logic. The shared rate-limit bucket is intentional — step-up brute-force counts against the same per-user rate limit as login verification. Test TD-10/TD-11 must be updated to also assert the rate limit is checked (mock `check2faVerifyRateLimit` and verify it is called).

### Cookie theft blast radius

Stolen `mynk_admin_tfa_device` cookie + stolen NextAuth session cookie: attacker skips TOTP gate and has full tutor/admin session access for up to 30 days (or until device revocation). Bounded by:
- httpOnly + Secure on both cookies — XSS cannot steal them
- SameSite=Lax — CSRF from external sites blocked for top-level navigations (GET); POST-via-form CSRF is still possible without CSRF tokens, but NextAuth already handles CSRF for its own endpoints
- 30-day fixed TTL (no sliding renewal — plan's §1 rationale)
- Server-side revocation via settings
- Password change / 2FA rotation cascades → all devices invalidated
- Sensitive-op step-up still required ✓

The stolen-cookies scenario is roughly equivalent blast radius to a stolen NextAuth session cookie alone — the trusted-device cookie on its own grants nothing without a valid session. Acceptable for a 30-day "remember me" feature.

### Token entropy and secret-egress compliance

`generateRawToken()` = 64 hex chars (256 bits) from `src/lib/crypto/session-tokens.ts`. ✓  
Only `tokenHash = HMAC-SHA-256(rawToken, ADMIN_TFA_DEVICE_HMAC_SECRET)` is stored. ✓  
Raw token exists only in the `Set-Cookie` response header and the browser's httpOnly cookie jar. Never in DB, never in logs. ✓  
No third-party URL constructed with the token (unlike the 2FA QR hard-won lesson). ✓

### Forgery protection

`validateAdminTrustedDevice` does DB lookup by `tokenHash`. Without the HMAC secret, an attacker cannot pre-compute a valid hash. With 256-bit random token space, brute-force against the DB is not practical. Tampered cookie → no DB row → `null` (TD-6). ✓

### `rotateTotpConfirm` — trusted devices NOT revoked on start, only on confirm

The plan's cascade table (§5) shows `rotateTotpConfirm` revokes all trusted devices. The existing `rotateTotpConfirm` (actions.ts L448–513) does NOT revoke trusted devices. This is correct per the plan — the cascade is planned to be added as part of Step 5. ✓ (just confirming the plan covers it)

However: **`rotateTotpStart`** generates a new secret in `pendingTotpSecretEnc`. Trusted devices are NOT revoked at rotation-start, only at rotation-confirm. This is correct: if the user abandons the rotation, their old authenticator and trusted devices should remain valid. ✓

### SameSite=Lax — confirmed appropriate — **SHOULD-FIX SF-2**

The plan correctly chooses `Lax`. Reason: Google OAuth is configured in `auth-options.ts` (L20–34) as an admin login provider. The trusted-device cookie must be sent on the OAuth redirect callback (a top-level GET), which `Strict` would block. `Lax` is the minimum correct choice.

However: the **`buildAhSessionCookie`** equivalent (account-holder-session.ts L218–227) uses `SameSite=Strict`. The AH realm does not use OAuth, so `Strict` works there. The plan should document this distinction so future maintainers don't "fix" the admin trusted-device cookie to `Strict` and break Google OAuth logins with trusted devices.

**Resolution (SF-2):** Add a comment in `buildAdminTfaDeviceCookie` explaining why `Lax` (not `Strict`): "SameSite=Lax is required — admin logins may complete via Google OAuth redirect; Strict would suppress this cookie on the callback and force TOTP despite a valid trusted device."

### Step-up list completeness audit

| Sensitive action | In plan §6? | Gap? |
|---|---|---|
| `changePassword` | ✓ | — |
| `rotateTotpStart` | ✓ | — |
| `rotateTotpConfirm` | ✓ (via new-device code) | — |
| `regenerateBackupCodes` | ✓ | — |
| `adminResetTwoFactor` (self) | ✓ | — |
| `adminResetTwoFactor` (other user) | ✓ | — |
| **`startImpersonation`** | ❌ | **BLOCKER B1** (see Axis 1) |
| "add trusted device" (remember checkbox) | N/A — protected by TOTP at verify time | ✓ |
| Email change | No email-change action found in codebase | N/A |

---

## Axis 4 — Observability

**Score: YELLOW — 2 should-fixes**

### `trusted_device_rejected` is marked "Optional debug" — **SHOULD-FIX SF-3**

Plan §7 lists `trusted_device_rejected` as "Optional debug: expired / revoked / wrong user / bad HMAC (no token values)". This should be **required, not optional**.

When Sarah (or any tutor) files a support ticket: "I keep getting the 2FA prompt even though I checked 'remember me'", the only way to debug this in prod is:

1. Find `login_skipped_via_trusted_device` for that `adminUserId` — if absent, the skip failed.
2. Find the rejection cause (expired? revoked by password change? bad HMAC because secret was rotated?).

Without `trusted_device_rejected`, step 2 is blind. You can't distinguish "cookie expired", "row revoked", "HMAC mismatch", or "no cookie present". The log contains no token values (compliant with secret-egress rules) and is negligible in volume (fires only on skip failures). There is no cost to making it required.

**Resolution (SF-3):** Promote `trusted_device_rejected` from "Optional debug" to a required log transition, fired in `validateAdminTrustedDevice` on every non-success path (missing row, wrong userId, expired, revoked, HMAC error). Include `reason=<notfound|wrong_user|expired|revoked|hmac_error>` in the log line. No token values.

### `device_evicted` log missing evicted device ID — **SHOULD-FIX SF-4**

Plan §7 logs `action=device_evicted` when the 10-device cap is hit and the oldest device is purged. The log line should include `tfa=<evictedDeviceId>` (the `id` of the evicted row) so a user's device-management audit trail is coherent. Without the device ID, you know a device was evicted but cannot determine which one from logs alone. All other device lifecycle events include `tfa=<deviceId>`.

**Resolution (SF-4):** `device_evicted` log line format: `[tfa] tfa=<evictedDeviceId> adminUserId=<id> action=device_evicted`.

### Step-up log `tfa=` binding — **SHOULD-FIX SF-5**

The plan's §7 `step-up-success`/`step-up-fail` logs do not specify what `tfa=<X>` should bind to. The existing `tfa` convention uses `tfa=<AdminUser2FA.id>` (the enrollment row, not the backup code or trusted device row). For step-up validation, `tfa=<AdminUser2FA.id>` is the correct anchor — it correlates step-up events to the enrollment audit trail (`enroll-confirm`, `verify-success`, `rotate-confirm`).

**Resolution (SF-5):** Specify in §7 that step-up logs use `tfa=<AdminUser2FA.id>` (the 2FA enrollment row ID), consistent with all other `tfa=` log lines.

### Overall observability coverage for "why did/didn't it skip?"

If `trusted_device_rejected` is made required (SF-3), the following prod-debugging queries are possible:

- "Skip succeeded?" → grep `login_skipped_via_trusted_device adminUserId=<id>`
- "Skip failed, why?" → grep `trusted_device_rejected adminUserId=<id> reason=<...>`
- "When was device trusted?" → grep `device_trusted adminUserId=<id>`
- "Was device revoked?" → grep `device_revoked tfa=<id>`
- "Did a password change kill all devices?" → grep `all_devices_revoked adminUserId=<id>`

This is sufficient for prod debugging. ✓ (pending SF-3)

---

## Axis 5 — Testability

**Score: YELLOW — 1 should-fix, multiple gaps**

### Test quality assessment — TD-1 through TD-13

| Test | Assessment |
|---|---|
| TD-1: `mintAdminTrustedDevice` stores only `tokenHash` | Solid. Directly tests the secret-egress rule. Must use an independent oracle (e.g., verify the created row's `tokenHash` equals `hmacToken(knownToken, knownSecret)` and does NOT equal the raw token). |
| TD-2: validate happy path | Solid. |
| TD-3: expired row → null | Solid. Should use a fixed `expiresAt` set in the past, not `Date.now() - 1`. |
| TD-4: revoked row → null | Solid. |
| TD-5: wrong adminUserId → null | Solid. Proves cookie not portable across accounts. |
| TD-6: tampered cookie → null | Solid. |
| TD-7: skip success calls `mintTwoFactorVerifiedSession` and logs | ⚠️ **Weak** — asserting the mock was called is necessary but not sufficient. The test should also assert `tryTrustedDeviceLoginSkip` returns `true` AND that `cookies().set(SESSION_COOKIE, ...)` was called (or the equivalent mock of `mintTwoFactorVerifiedSession`'s side effect). |
| TD-8: DB throw → fail-closed | ✓ Validates B2. Must mock the DB throw from inside `validateAdminTrustedDevice` AND separately from inside `mintTwoFactorVerifiedSession` to confirm both paths return `false`. |
| TD-9: `verifyTotpCode` with `rememberDevice: true` sets cookie + creates row | Solid. |
| TD-10: `changePassword` without TOTP → rejected | Solid. |
| TD-11: `rotateTotpStart` rejected without step-up despite `twoFactorVerified=true` | Solid. |
| TD-12: `revokeAllTrustedDevices` → subsequent skip fails | Solid. |
| TD-13: `changePassword` success revokes all devices | Solid. |

### Missing tests — **SHOULD-FIX SF-6**

1. **Rate limit on `verifyTotpStepUp`** (tied to B3): No test asserts `check2faVerifyRateLimit(adminId)` is called before TOTP validation in `verifyTotpStepUp`. This is the most critical missing test — without it, the rate-limit requirement in B3 could be omitted by an executor without failing tests.

2. **10-device cap enforcement and oldest-eviction**: No test for `mintAdminTrustedDevice` at 10 active devices → oldest is evicted. Should assert exactly 10 active rows post-mint and that `device_evicted` was logged.

3. **HMAC secret missing → fail-closed**: No test for when `ADMIN_TFA_DEVICE_HMAC_SECRET` is `undefined`. Both `mintAdminTrustedDevice` and `validateAdminTrustedDevice` must return `false`/throw cleanly — not leak undefined behavior. Should use a describe block that deletes `process.env.ADMIN_TFA_DEVICE_HMAC_SECRET`.

4. **`isCurrent` flag in `listTrustedDevices`**: No test that `isCurrent=true` is returned for the device whose cookie is in the current request, and `isCurrent=false` for others. This is security-relevant: if `isCurrent` is computed by comparing hashes and the hash comparison has a bug, the "(this device)" label is wrong.

5. **`mintTwoFactorVerifiedSession` throw in skip → fail-closed**: To validate B2, add a test where `validateAdminTrustedDevice` succeeds but `mintTwoFactorVerifiedSession` throws → `tryTrustedDeviceLoginSkip` must return `false`, not propagate the exception.

**Resolution (SF-6):** Add the five tests above. Tests 1 and 5 directly validate BLOCKERs B3 and B2 respectively — they must be in the test file before the branch is considered acceptance-ready.

### Device-only behavior (correctly flagged for manual smoke)

The plan correctly defers these to hardware smoke (§9):
- Cookie is `httpOnly` and `Secure` in prod (browser devtools verification)
- `__Secure-` prefix enforced only on HTTPS origins
- Skip fires across actual sign-out / sign-in cycle in real browser

These cannot be verified in jest/jsdom. The smoke checklist in §9 is appropriate. ✓

---

## Consolidated BLOCKER List

> **BLOCKERs must be resolved in the plan before build begins. An executor following this plan as-written will produce code that is missing these properties.**

### B1 — Impersonation start missing from step-up list (§6)

**Impact:** High severity. A tutor/admin who uses trusted-device skip to bypass TOTP at login can immediately start impersonating another user without ever entering a TOTP code. Impersonation is the highest-privilege action in the app (grants full tutor session as target user).

**Required resolution:** Add `startImpersonation` to §6's step-up table. The corresponding server action (in `src/lib/impersonation.ts` or its call site in the admin UI) must call `verifyTotpStepUp` before `mintImpersonationSession`. Update §8 test list to add: "Impersonation start rejected without step-up even when `twoFactorVerified=true` via trusted-device skip."

---

### B2 — `tryTrustedDeviceLoginSkip` must explicitly wrap `mintTwoFactorVerifiedSession` in try-catch

**Impact:** Medium severity. If `mintTwoFactorVerifiedSession` throws (e.g., `NEXTAUTH_SECRET` missing, `cookies()` store error), the plan's current pseudocode causes the setup/verify page to **crash with a 500** rather than gracefully falling back to the TOTP form. This is a reliability failure on the critical post-login path.

**Required resolution:** §4 pseudocode must explicitly specify:
```
3. On validation success:
   3.1. Best-effort: update lastUsedAt (log error, do not abort if DB write fails here)
   3.2. try { mintTwoFactorVerifiedSession(currentToken); } catch (e) { 
         log "[tfa] tfa=<deviceId> adminUserId=<id> action=trusted_device_skip_mint_failed";
         return false;  // fail-closed: user sees TOTP form
       }
   3.3. Log login_skipped_via_trusted_device
   3.4. Return true
```
Also update test TD-8 to assert this path specifically.

---

### B3 — `verifyTotpStepUp` must call `check2faVerifyRateLimit(adminId)` before any TOTP/backup validation

**Impact:** High severity. Without the rate limit, an attacker with a compromised session (stolen session cookie or trusted-device cookie) can brute-force the TOTP code for sensitive operations. The existing `verifyTotpCode` (actions.ts L263–269) defends against exactly this attack vector. `verifyTotpStepUp` must share the same per-user rate-limit bucket.

**Required resolution:** §6 pseudocode for `verifyTotpStepUp` must include as its first operation:
```typescript
const rl = await check2faVerifyRateLimit(adminUserId);
if (!rl.allowed) {
  return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.` };
}
```
Update §8 test TD-10 and TD-11 to also assert the rate limit is checked (mock `check2faVerifyRateLimit` and verify it was called before any TOTP validation).

---

## Consolidated SHOULD-FIX List

> **Should-fix items should be folded into the plan and executor acceptance criteria before build. They are not architectural blockers but will produce materially inferior behavior if omitted.**

### SF-1 — HMAC secret rotation ops note in PLATFORM-ASSUMPTIONS

Add to §1 env var spec and the PLATFORM-ASSUMPTIONS.md entry: rotating `ADMIN_TFA_DEVICE_HMAC_SECRET` silently invalidates all existing trusted-device rows; all users will be prompted for TOTP on their next login. This is expected behavior but is a non-obvious operational footgun.

### SF-2 — Document SameSite=Lax rationale in `buildAdminTfaDeviceCookie`

Add inline comment explaining why `Lax` not `Strict`: Google OAuth callback (top-level GET redirect from Google back to the app) must carry this cookie. Without this comment, a future maintainer may silently "upgrade" to `Strict` and break trusted-device skip for OAuth admin logins.

### SF-3 — Promote `trusted_device_rejected` from "Optional debug" to required log

See Axis 4. This is the key observability signal for support tickets about the skip not firing. Required format: `[tfa] tfa=<deviceId|"unknown"> adminUserId=<id> action=trusted_device_rejected reason=<notfound|wrong_user|expired|revoked|hmac_error>`. Emit from `validateAdminTrustedDevice` on every non-success path.

### SF-4 — `device_evicted` log must include `tfa=<evictedDeviceId>`

See Axis 4. All device lifecycle logs use `tfa=<deviceId>`; eviction should too.

### SF-5 — Step-up logs must specify `tfa=<AdminUser2FA.id>` binding

See Axis 4. Consistent with all other `tfa=` conventions in the codebase.

### SF-6 — Five missing test cases

See Axis 5:
1. `verifyTotpStepUp` calls `check2faVerifyRateLimit` (validates B3)
2. `mintAdminTrustedDevice` at 10-device cap → oldest evicted
3. `ADMIN_TFA_DEVICE_HMAC_SECRET` missing → fail-closed on mint/validate
4. `isCurrent` flag correct in `listTrustedDevices`
5. `mintTwoFactorVerifiedSession` throw in skip → skip returns `false`, not 500 (validates B2)

---

## Overall Verdict

**NEEDS-REVISION**

The plan is architecturally sound and largely well-specified: the HMAC-at-rest token pattern, the page-level (not middleware) skip placement, the session-mint reuse, and the step-up guardrail framework are all correct. The additive migration claim is genuine. The secret-egress lesson from prior 2FA work is respected.

Three blockers prevent a clean build:

- **B1** (impersonation start unguarded) is a security gap that the plan's own §6 structure would leave exploitable by design.
- **B2** (mintTwoFactorVerifiedSession not try-caught in skip) is a reliability gap that turns an env misconfiguration into a page crash on the most common post-login path.
- **B3** (verifyTotpStepUp has no rate limit) is a brute-force vulnerability that directly undermines the step-up guardrail the plan is built around.

All three are straightforward plan-level amendments — no architectural redesign required. Once these three are addressed and the six should-fix items are folded into the executor scope, this plan is **READY-TO-BUILD**.

---

*End of review. File: `docs/handoff/2fa-remember-device-5axis-2026-06-13.md`*
