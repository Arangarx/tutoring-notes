# Admin/Tutor 2FA — "Remember This Device" (30-day trusted device)

> **Branch:** `auth/2fa-remember-device` (off `v1-redesign`)  
> **Authored:** 2026-06-13 (planning pass — no production code modified)  
> **Scope:** Admin/tutor NextAuth realm only (`AdminUser` / `AdminUser2FA`). AccountHolder and LearnerProfile realms are out of scope (they have their own session models).  
> **Parent infra:** Identity Phase 1 TOTP (`AdminUser2FA`, `verifyTotpCode`, middleware `twoFactorVerified` gate)

### Rev 2 — 5-axis fixes folded (2026-06-13)

Amended per [`2fa-remember-device-5axis-2026-06-13.md`](2fa-remember-device-5axis-2026-06-13.md) (verdict NEEDS-REVISION → ready-to-build):

| ID | Change |
|---|---|
| **B1** | §6 — `startImpersonation` added to sensitive-op step-up table + UI; test TD-14 |
| **B2** | §4 — `tryTrustedDeviceLoginSkip`: best-effort `lastUsedAt`; try-catch around `mintTwoFactorVerifiedSession` → return `false` on throw; tests TD-8 / TD-18 |
| **B3** | §6 — `verifyTotpStepUp` calls `check2faVerifyRateLimit(adminId)` first (shared bucket with `verifyTotpCode`); tests TD-10 / TD-11 / TD-15 |
| **SF-1** | §1 — HMAC secret **rotation** ops note for `PLATFORM-ASSUMPTIONS.md` |
| **SF-2** | §2 — inline comment in `buildAdminTfaDeviceCookie` documenting `SameSite=Lax` (OAuth) |
| **SF-3** | §7 — `trusted_device_rejected` promoted to **required** with `reason=` enum |
| **SF-4** | §7 — `device_evicted` log includes `tfa=<evictedDeviceId>` |
| **SF-5** | §7 — step-up logs bind `tfa=<AdminUser2FA.id>` |
| **SF-6** | §8 — five new tests TD-15–TD-19 (rate limit, cap eviction, missing secret, `isCurrent`, mint throw) |

### Rev 3 — Impersonation step-up removed (2026-06-14)

Decision (Andrew, 2026-06-14): B1 (impersonation TOTP step-up) reverted.

**Rationale:** Impersonation is hard-restricted to `isTestAccount=true` test shells (server-side guard in `assertIsRealAdmin()` + `isTestAccount` target check — it cannot assume real tutor/parent/learner identities). This makes it a low-stakes dev/operator tool rather than a high-privilege identity takeover. Requiring a fresh TOTP code nagged the admin on every smoke/dev cycle with no meaningful security gain for a test-only path.

**What changed:**
- `startImpersonation` signature reverted to `(targetUserId: string)` — no `totpCode` param.
- `ImpersonateButton.tsx` (B1-added client TOTP prompt) removed; callers rewired to the pre-B1 `<form action={startImpersonation.bind(null, id)}>` pattern.
- TD-14 test removed from `admin-trusted-device.test.ts`; `impersonation-b.test.ts` updated to match new signature.
- Step-up listed as `startImpersonation` in §6 acceptance criteria is struck — the **other four** ops (password change, rotate start, backup-code regen, self/other 2FA reset) remain fully intact.

**If real-account impersonation is ever built:** MANDATORY step-up MUST be reinstated as the first gate. See backlog item **BL-IMP-REAL** (`docs/BACKLOG.md`).

---

## Summary

After a successful TOTP (or backup-code) verification at login, the tutor/admin may opt in to **"Remember this device for 30 days."** The app mints a high-entropy HttpOnly cookie bound to a new `AdminTrustedDevice` DB row (HMAC-hashed token at rest). On subsequent logins from that browser, a server-side skip check validates cookie + row and calls the existing `mintTwoFactorVerifiedSession()` so the user bypasses the `/admin/settings/2fa/verify` prompt. Trusted-device state buys past the **login 2FA gate only** — sensitive security settings (password change, 2FA rotation/reset/regen, disabling 2FA) require a **fresh inline TOTP** on every invocation, independent of trusted-device cookies or session `twoFactorVerified`. Revocation is server-tracked (`revokedAt`) with a management UI in 2FA settings. Implementation is **additive only**: extend `verifyTotpCode`, add a small `admin-trusted-device.ts` helper module, one Prisma model, and page-level skip hooks — no rewrites of `auth-options.ts` JWT shape beyond optional `twoFactorStepUpAt` if the executor chooses session-based step-up (inline-code approach preferred; see §6).

---

## ⛔ HARD CONSTRAINT — non-negotiable

**2FA / auth work is ADDITIVE ONLY.**

| Allowed | Forbidden |
|---|---|
| New Prisma model + migration | Renaming/dropping `AdminUser2FA` columns |
| New `src/lib/admin-trusted-device.ts` helpers | Rewriting `auth-options.ts` provider/callback structure |
| Extend `verifyTotpCode` signature + `TwoFactorVerifyForm` checkbox | Replacing middleware 2FA gate with a different mechanism |
| Page-level skip call in `setup/page.tsx` + `verify/page.tsx` | Moving 2FA verification into client-only logic |
| New server actions for revoke/list | Removing existing `twoFactorVerified` JWT claim |

Existing patterns to **reuse verbatim** where possible:

- Token generation + HMAC: `src/lib/crypto/session-tokens.ts` (`generateRawToken`, `hmacToken`)
- Cookie builders: mirror `buildAhSessionCookie` / `clearAhSessionCookie` in `src/lib/account-holder-session.ts`
- Session mint after verify: `mintTwoFactorVerifiedSession()` in `src/lib/two-factor-session.ts`
- Logging prefix: `[tfa] tfa=<rowId> adminUserId=<id> action=<action>` (AGENTS.md § Conventions)

---

## 1. Data model — `AdminTrustedDevice`

### Prisma model (additive migration)

Name **`AdminTrustedDevice`** (not bare `TrustedDevice`) — the repo already has `LearnerDeviceSession` for the child realm; admin-scoped naming prevents cross-realm confusion and matches `AdminUser2FA`.

```prisma
/// Trusted-browser record for admin/tutor 2FA login skip (30-day).
/// ADDITIVE ONLY — no existing columns renamed or dropped.
model AdminTrustedDevice {
  id          String    @id @default(uuid())
  adminUserId String
  adminUser   AdminUser @relation(fields: [adminUserId], references: [id], onDelete: Cascade)

  /// HMAC-SHA-256(rawToken, ADMIN_TFA_DEVICE_HMAC_SECRET). Raw token NEVER stored or logged.
  tokenHash   String    @unique

  /// Truncated User-Agent (max 128 chars on write) for device list UI.
  deviceLabel String?

  createdAt   DateTime  @default(now())
  lastUsedAt  DateTime  @default(now())
  /// Fixed 30-day absolute expiry from creation (no sliding renewal — see §2 rationale).
  expiresAt   DateTime
  revokedAt   DateTime?

  @@index([adminUserId])
  @@index([adminUserId, revokedAt])
}
```

Add to `AdminUser`:

```prisma
trustedDevices AdminTrustedDevice[]
```

### Field justification

| Field | Why |
|---|---|
| `id` | Stable row id for per-device revoke + log correlation (`tfa=<id>`) |
| `adminUserId` | FK; `onDelete: Cascade` so deleting an admin removes trust rows (same as `AdminUser2FA`) |
| `tokenHash` | HMAC of cookie value; `@unique` for O(1) lookup; keyed hash prevents forgery if DB is read without secret |
| `deviceLabel` | Optional UA snapshot for "Chrome on Windows" list in settings — not used for auth decisions |
| `createdAt` | Audit / UI "first trusted" |
| `lastUsedAt` | Updated on each successful skip; UI "last used" + anomaly review |
| `expiresAt` | **Fixed 30-day TTL from mint** — industry default; simpler than AH sliding renewal; user re-checks TOTP monthly |
| `revokedAt` | Soft revoke (nullable) — preserves audit trail; matches `AccountHolderSession` / `LearnerDeviceSession` pattern |

### Caps and cleanup

- **Max 10 active devices per `adminUserId`** (non-revoked, unexpired). On mint when at cap: revoke oldest by `lastUsedAt` (log `action=device_evicted` with `tfa=<evictedDeviceId>` — see §7).
- Optional cron/CLI later — not Phase-1 acceptance; expired rows are rejected at lookup time.

### Env var (new)

`ADMIN_TFA_DEVICE_HMAC_SECRET` — dedicated HMAC secret (same pattern as `AH_SESSION_HMAC_SECRET` / `LEARNER_SESSION_HMAC_SECRET`). Add to `src/lib/env.ts` as optional-in-dev / required-in-prod (fail-closed on skip/mint when unset in prod). Document in `docs/PLATFORM-ASSUMPTIONS.md` in the implementation commit.

**Secret rotation (ops):** Rotating `ADMIN_TFA_DEVICE_HMAC_SECRET` instantly invalidates **all** existing trusted-device rows — stored `tokenHash` values were computed with the old secret, so no cookie will match after rotation. All users are silently demoted to TOTP-required on their next login (no error surfaced to the user). This is expected fail-closed behavior; document explicitly in `PLATFORM-ASSUMPTIONS.md`: *"Rotating this secret invalidates all existing trusted-device tokens; all users will be prompted for TOTP on their next login. Plan a maintenance window or notify users if rotating."*

---

## 2. Cookie specification

| Property | Value |
|---|---|
| **Cookie name (dev)** | `mynk_admin_tfa_device` |
| **Cookie name (prod)** | `__Secure-mynk_admin_tfa_device` |
| **Prefix rule** | Prod uses `__Secure-` prefix (requires `Secure` flag) — stricter than `mynk_ah_session` because this cookie is a long-lived trust credential on the admin origin |
| **Value** | `generateRawToken()` — 64 hex chars (256 bits) |
| **httpOnly** | `true` |
| **secure** | `true` in production; omitted in local dev |
| **sameSite** | `Lax` — matches NextAuth session cookie (`two-factor-session.ts` uses `lax`; admin login is top-level navigation) |
| **path** | `/` |
| **maxAge** | `30 * 24 * 60 * 60` seconds (aligned with `expiresAt`) |

### Helpers (new file `src/lib/admin-trusted-device.ts`)

Mirror `account-holder-session.ts`:

- `export const ADMIN_TFA_DEVICE_COOKIE` — resolves dev vs prod name
- `buildAdminTfaDeviceCookie(rawToken, expiresAt, isDev)` → Set-Cookie string. **Must include an inline comment** explaining why `SameSite=Lax` (not `Strict`): *"SameSite=Lax is required — admin logins may complete via Google OAuth redirect; Strict would suppress this cookie on the callback and force TOTP despite a valid trusted device."* (`buildAhSessionCookie` uses `Strict` because the AH realm has no OAuth — do not copy that pattern here.)
- `clearAdminTfaDeviceCookie(isDev)` → Max-Age=0
- `mintAdminTrustedDevice(adminUserId, userAgent?)` → `{ rawToken, deviceId, expiresAt }`
- `validateAdminTrustedDevice(rawToken, adminUserId)` → `{ deviceId } | null` (fail-closed). On every non-success path, emit required `trusted_device_rejected` log with `reason=` (see §7).
- `revokeAdminTrustedDevice(deviceId, adminUserId)` — sets `revokedAt`
- `revokeAllAdminTrustedDevices(adminUserId)` — bulk revoke

**Not signed with NEXTAUTH_SECRET** — separate HMAC secret + DB row, same defense-in-depth as AH/learner sessions. The cookie is **not** a JWT; forgery requires the HMAC secret.

**No plaintext token egress** — raw token exists only in Set-Cookie response and client cookie store; never logged, never in DB, never in QR/external URLs.

---

## 3. "Remember this device" checkbox at verify time

### UI

**File:** `src/app/admin/settings/2fa/verify/TwoFactorVerifyForm.tsx`

- Add checkbox (default **unchecked**): "Remember this device for 30 days"
- Helper text: "Skip the verification code on this browser when you sign in again. Don't use on shared computers."
- Pass `rememberDevice: boolean` to server action on submit

### Server action change

**File:** `src/app/admin/settings/2fa/actions.ts` — extend `verifyTotpCode`:

```typescript
export async function verifyTotpCode(
  codeInput: string,
  opts?: { rememberDevice?: boolean }
): Promise<VerifyTotpResult>
```

**After** successful TOTP/backup validation and **after** `mintTwoFactorVerifiedSession()`:

1. If `opts?.rememberDevice === true`:
   - Read `User-Agent` from `headers()` (truncate to 128 chars)
   - Call `mintAdminTrustedDevice(adminUserId, userAgent)`
   - Set cookie via `cookies().set(...)` using same attribute rules as §2
   - Log: `[tfa] tfa=<deviceId> adminUserId=<id> action=device_trusted`
2. If `rememberDevice` is false: do **not** clear an existing trust cookie (user may have trusted previously); only mint new trust when explicitly opted in.

**Backup-code path:** allow remember-device on backup-code verify too (user proved possession); log `action=device_trusted type=backup` if useful for audit.

**Enrollment confirm (`confirmTotpEnrollment`):** do **not** offer remember-device on first enroll — user is already in a verified flow; optional follow-up only on `/verify` at login.

---

## 4. 2FA gate skip — where the branch lives

### Problem

`src/middleware.ts` L195–212 gates on JWT `twoFactorVerified` and **cannot query the DB** (edge constraint, same comment at L204). Trusted-device validation is server-side + DB-backed.

### Solution — page-level skip (do NOT add DB calls to middleware)

New exported helper:

```typescript
// src/lib/admin-trusted-device.ts
/**
 * If a valid trusted-device cookie exists for adminUserId, mint twoFactorVerified
 * session and return true. Otherwise return false.
 * Fail-closed on DB/HMAC errors.
 */
export async function tryTrustedDeviceLoginSkip(
  adminUserId: string,
  currentToken: Record<string, unknown>
): Promise<boolean>
```

Implementation:

1. Read `ADMIN_TFA_DEVICE_COOKIE` from `cookies()`
2. `validateAdminTrustedDevice(rawToken, adminUserId)` — checks hash lookup, `adminUserId` match, `revokedAt IS NULL`, `expiresAt > now`. On every non-success path, emit required `trusted_device_rejected` log (see §7).
3. On validation success:
   - **3.1 Best-effort `lastUsedAt` update** — fire-and-forget; if the DB write fails, `console.error` but **do not** abort the skip. A failed `lastUsedAt` write must never cause `return false` after the session cookie is already minted (otherwise the user sees the TOTP form while already logged in).
   - **3.2 Try-catch around session mint** — mirror `verifyTotpCode` (actions.ts L329–349):
     ```typescript
     try {
       await mintTwoFactorVerifiedSession(currentToken);
     } catch (e) {
       console.error("[tfa] trusted_device_skip_mint_failed", e);
       // Log: [tfa] tfa=<deviceId> adminUserId=<id> action=trusted_device_skip_mint_failed
       return false; // fail-closed: caller shows TOTP form, NOT a 500
     }
     ```
   - **3.3** Log: `[tfa] tfa=<deviceId> adminUserId=<id> action=login_skipped_via_trusted_device`
   - **3.4** Return `true`
4. On any other failure (missing cookie, validate returned null, mint threw): return `false` (caller shows normal verify UI). **Never propagate** `mintTwoFactorVerifiedSession` exceptions to the page.

### Call sites (exact insertion points)

| File | Insertion | When |
|---|---|---|
| `src/app/admin/settings/2fa/setup/page.tsx` | After `isConfirmed` check, **before** `redirect("/admin/settings/2fa/verify")` (L34–36) | Enrolled user hits middleware redirect to `/setup` → skip here avoids extra hop |
| `src/app/admin/settings/2fa/verify/page.tsx` | After session checks, **before** rendering `TwoFactorVerifyForm` (L28–32) | Direct navigation to `/verify` |

**Pattern at each call site:**

```typescript
if (!session.user.twoFactorVerified && session.user.id) {
  const cookieName = /* prod vs dev session cookie */;
  const sessionToken = cookieStore.get(cookieName)?.value;
  if (sessionToken) {
    const currentToken = await decode({ token: sessionToken, secret: NEXTAUTH_SECRET });
    if (currentToken) {
      const skipped = await tryTrustedDeviceLoginSkip(session.user.id, currentToken);
      if (skipped) {
        redirect(safeReturnTo(callbackUrl)); // verify page
        // or redirect("/admin") on setup page
      }
    }
  }
}
```

Extract duplicated decode logic into a small internal helper if needed — do not change `mintTwoFactorVerifiedSession` behavior.

### End-to-end login flow (enrolled user, trusted browser)

```
Password/OAuth login
  → jwt: twoFactorVerified=false
  → middleware: redirect /admin/settings/2fa/setup
  → setup page: isConfirmed=true
  → tryTrustedDeviceLoginSkip() = true
  → mintTwoFactorVerifiedSession()
  → redirect /admin (or callbackUrl)
```

### Exemptions (unchanged)

Trusted-device skip does **not** apply when:

- `isTestAccount === true`
- `isImpersonating === true`
- `sub === "admin"` (env-only admin — no 2FA support)
- User not enrolled (`isConfirmed === false`) — stays on setup form
- Playwright harness bypass (`WB_E2E_HARNESS`) — unchanged

---

## 5. Revocation — settings UI + server actions

### New server actions (`src/app/admin/settings/2fa/actions.ts`)

| Action | Behavior |
|---|---|
| `listTrustedDevices()` | Returns `{ id, deviceLabel, createdAt, lastUsedAt, expiresAt, isCurrent }[]` for current admin |
| `revokeTrustedDevice(deviceId)` | `revokedAt = now()` where `deviceId` + `adminUserId` match; if revoking current cookie's device, also `clearAdminTfaDeviceCookie` |
| `revokeAllTrustedDevices()` | Bulk revoke all for current admin + clear cookie |

Log: `action=device_revoked` (single) / `action=all_devices_revoked count=<n>` (bulk).

`isCurrent`: compare cookie raw token HMAC to row's `tokenHash`.

### UI (`TwoFactorManageView.tsx`)

New section below "Authentication status":

- **Trusted devices** — table: label, last used, expires, [Revoke] per row; mark "(this device)"
- **Forget all trusted devices** — confirm dialog → `revokeAllTrustedDevices()`

Only visible when enrolled + session `twoFactorVerified` (same gate as rest of manage view).

### Automatic revocation (cascade)

| Event | Action |
|---|---|
| `changePassword` success | `revokeAllAdminTrustedDevices(adminId)` |
| `adminResetTwoFactor(targetId)` | `revokeAllAdminTrustedDevices(targetId)` |
| Self-reset 2FA (same action, `targetId === self`) | same |
| TOTP `rotateTotpConfirm` success | `revokeAllAdminTrustedDevices(adminId)` — rotation invalidates all trusts |
| `confirmTotpEnrollment` | N/A (no prior devices) |

**Sign-out:** NextAuth clears session cookie only; **trusted-device cookie intentionally persists** (that's the feature). User can revoke from settings or another device.

---

## 6. HARD GUARDRAIL — sensitive ops require fresh TOTP

Trusted device (and even login-time TOTP with remember checked) must **not** satisfy security-settings mutations.

### Threat model

`twoFactorVerified=true` in the JWT means "passed the login gate" — including via trusted-device skip without entering a code this session. Existing checks like `rotateTotpStart` (L371) only test `session.user.twoFactorVerified`, which is **insufficient** after this feature ships.

### Required approach — inline TOTP on sensitive actions

Add shared helper in `src/lib/two-factor-step-up.ts` (or inside `actions.ts` if small):

```typescript
/**
 * Validates a fresh TOTP or backup code for step-up.
 * Does NOT mint trusted device. Does NOT set remember-device.
 * Logs action=step-up-success | step-up-fail (tfa=<AdminUser2FA.id>).
 *
 * FIRST operation: check2faVerifyRateLimit(adminUserId) — same per-user
 * bucket as verifyTotpCode (AuthThrottle table). Step-up brute-force counts
 * against login-verify attempts intentionally.
 */
export async function verifyTotpStepUp(
  adminUserId: string,
  codeInput: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rl = await check2faVerifyRateLimit(adminUserId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }
  // ... then validateTotpOrBackup(adminUserId, codeInput)
}
```

Reuse validation logic from `verifyTotpCode` (extract shared internal `validateTotpOrBackup(adminId, code)` to avoid duplication). Import `check2faVerifyRateLimit` from the same module `verifyTotpCode` uses.

### Actions that MUST call step-up (exact list)

| Action | File | Current guard | Required change |
|---|---|---|---|
| **Change password** | `src/app/admin/settings/profile/actions.ts` → `changePassword` | `requireAdminSession()` only | Require `totpCode` form field; call `verifyTotpStepUp` before `updateAdminPassword` |
| **Rotate authenticator start** | `actions.ts` → `rotateTotpStart` | `twoFactorVerified` | Require `totpCode` param; step-up before generating new secret |
| **Rotate confirm** | `actions.ts` → `rotateTotpConfirm` | `twoFactorVerified` + new-device code | **Keep** — confirming with new authenticator code *is* step-up; document as sufficient |
| **Regenerate backup codes** | `actions.ts` → `regenerateBackupCodes` | `twoFactorVerified` | Require `totpCode` param + step-up |
| **Self-reset 2FA** | `actions.ts` → `adminResetTwoFactor` when `targetAdminUserId === actingAdminId` | page gate only | Require `totpCode` param + step-up before delete |
| **Admin reset another user's 2FA** | `adminResetTwoFactor` (other target) | `assertIsAdmin()` | Require acting admin `totpCode` + step-up (high privilege) |
| ~~**Start impersonation**~~ | ~~`src/lib/impersonation.ts` → `startImpersonation`~~ | ~~`assertIsAdmin()` only~~ | ~~**REMOVED Rev 3**~~ — impersonation is hard-restricted to `isTestAccount=true` test shells; step-up intentionally dropped as a dev-cycle QoL improvement (see Rev 3 note above). MUST return when real-account impersonation lands (BL-IMP-REAL). |

**NOT step-up gated (by design):**

- `verifyTotpCode` — this *is* the login verify
- `confirmTotpEnrollment` / `startTotpEnrollment` — initial enrollment flows
- `tryTrustedDeviceLoginSkip` — skip path never performs sensitive ops

### UI changes

- `ChangePasswordForm.tsx` — add TOTP code field (6-digit) above submit
- `TwoFactorManageView.tsx` — collect TOTP before Rotate / Regen / Self-reset buttons fire
- Admin-reset-another-user dialog — TOTP field for acting admin
- ~~Impersonation start UI/dialog — TOTP field for acting admin before `startImpersonation` fires~~ **REMOVED Rev 3**

**Trusted-device cookie state is irrelevant** — step-up always demands a code in the request body. A user who reached `twoFactorVerified=true` via trusted-device skip (never entered a code this session) must still pass step-up for the remaining rows in the table above (password change, rotate start, backup-code regen, self/other 2FA reset).

---

## 7. Logging (`tfa` prefix)

Extend existing convention (never log secrets or raw tokens):

| action | When |
|---|---|
| `device_trusted` | After mint + cookie set on verify with remember checked |
| `login_skipped_via_trusted_device` | `tryTrustedDeviceLoginSkip` success |
| `device_revoked` | Single device revoke |
| `all_devices_revoked` | Bulk revoke |
| `device_evicted` | Oldest device revoked due to 10-device cap — **must include evicted row id**: `[tfa] tfa=<evictedDeviceId> adminUserId=<id> action=device_evicted` |
| `trusted_device_rejected` | **Required** — emitted from `validateAdminTrustedDevice` on every non-success path (missing row, wrong userId, expired, revoked, HMAC error). Format: `[tfa] tfa=<deviceId or "unknown"> adminUserId=<id> action=trusted_device_rejected reason=<notfound or wrong_user or expired or revoked or hmac_error>`. No raw token values. |
| `trusted_device_skip_mint_failed` | `mintTwoFactorVerifiedSession` threw inside `tryTrustedDeviceLoginSkip` (§4 step 3.2) |
| `step-up-success` / `step-up-fail` | Sensitive op TOTP validation — bind `tfa=<AdminUser2FA.id>` (enrollment row id, same anchor as `enroll-confirm`, `verify-success`, `rotate-confirm`) |

Format: `[tfa] tfa=<deviceId|AdminUser2FA.id> adminUserId=<id> action=<action> [optional key=value]`

Register new actions in `AGENTS.md` § Conventions `tfa` bullet (implementation commit).

---

## 8. Tests (Jest — agent-runnable)

**New file:** `src/__tests__/identity/admin-trusted-device.test.ts`

Mock `db`, `cookies`, `headers` — follow patterns in `src/__tests__/identity-2fa.test.ts`.

| Test ID | Assertion |
|---|---|
| **TD-1** | `mintAdminTrustedDevice` persists only `tokenHash`, not raw token (grep created row data) |
| **TD-2** | `validateAdminTrustedDevice` returns device when hash matches and row valid |
| **TD-3** | Expired row (`expiresAt < now`) → validate returns null; skip returns false |
| **TD-4** | Revoked row (`revokedAt` set) → validate returns null |
| **TD-5** | Wrong `adminUserId` on validate → null (cookie not portable across accounts) |
| **TD-6** | Tampered cookie (random hex, no DB row) → null |
| **TD-7** | `tryTrustedDeviceLoginSkip` success: returns `true`, calls `mintTwoFactorVerifiedSession` (mock), and logs `login_skipped_via_trusted_device`. Assert mock session-cookie side effect (not just "mock was called"). |
| **TD-8** | Fail-closed paths return `false`, no uncaught throw: (a) DB throw during `validateAdminTrustedDevice` → skip returns `false`, no mint; (b) validate succeeds but `mintTwoFactorVerifiedSession` throws → skip returns `false`, logs `trusted_device_skip_mint_failed` (validates B2 mint path). |
| **TD-9** | `verifyTotpCode` with `rememberDevice: true` sets cookie + creates row |
| **TD-10** | `changePassword` with valid password but **no** / **wrong** `totpCode` → rejected. Mock `check2faVerifyRateLimit` and assert it is called before TOTP validation in the step-up path. |
| **TD-11** | `rotateTotpStart` rejected without step-up even when `twoFactorVerified=true` in mock session. Assert `check2faVerifyRateLimit` called before TOTP validation. |
| **TD-12** | `revokeAllTrustedDevices` sets `revokedAt` on all rows; subsequent skip fails |
| **TD-13** | `changePassword` success revokes all trusted devices (integration with mock db) |
| **TD-14** | `startImpersonation` rejected without step-up even when `twoFactorVerified=true` via trusted-device skip mock (validates B1) |
| **TD-15** | `verifyTotpStepUp` calls `check2faVerifyRateLimit(adminId)` as its **first** operation before any TOTP/backup logic (validates B3) |
| **TD-16** | `mintAdminTrustedDevice` at 10 active devices → oldest evicted by `lastUsedAt`; exactly 10 active rows post-mint; `device_evicted` logged with `tfa=<evictedDeviceId>` |
| **TD-17** | `ADMIN_TFA_DEVICE_HMAC_SECRET` undefined → `mintAdminTrustedDevice` and `validateAdminTrustedDevice` fail-closed (no undefined behavior) |
| **TD-18** | `mintTwoFactorVerifiedSession` throw in skip → `tryTrustedDeviceLoginSkip` returns `false`, does not propagate exception (validates B2; overlaps TD-8b) |
| **TD-19** | `listTrustedDevices` returns `isCurrent=true` for device matching request cookie hash, `false` for others |

**Extend:** `src/__tests__/identity-2fa.test.ts` — one test that setup/verify page source contains `tryTrustedDeviceLoginSkip` call (static guard, same style as existing enroll redirect tests).

**Schema test:** add `AdminTrustedDevice` field presence to `src/__tests__/identity-p2-schema.test.ts` or new `identity-tfa-trusted-device-schema.test.ts`.

---

## 9. Acceptance criteria (checkable)

### Trusted device — happy path

- [ ] Enrolled admin logs in on Browser A, verifies TOTP, checks "Remember this device"
- [ ] Sign out, sign in again on Browser A → lands on `/admin` (or intended destination) **without** TOTP prompt
- [ ] Sign in on Browser B (no trust cookie) → TOTP prompt shown
- [ ] Trust expires after 30 days (TD-3 unit + manual clock mock)

### Cookie + storage security

- [ ] Cookie is `httpOnly`, `Secure` in prod, `SameSite=Lax`, 30-day Max-Age
- [ ] DB row contains `tokenHash` only — TD-1 green
- [ ] No raw token in logs (grep test or manual log review)

### Revocation

- [ ] Per-device revoke in settings → next login requires TOTP on that browser
- [ ] "Forget all" → all rows revoked, cookie cleared
- [ ] Password change → all trusts revoked (TD-13)
- [ ] 2FA self-reset / rotation confirm → all trusts revoked

### Sensitive ops guardrail (BLOCKER acceptance gates)

- [ ] With valid trusted device + skipped login, **Rotate / Regen / Change password / Self-reset** still demand TOTP (TD-10, TD-11)
- [x] ~~**B1 — Impersonation:** With trusted-device skip (`twoFactorVerified=true` without entering TOTP this session), **start impersonation** still demands fresh TOTP step-up (TD-14)~~ **REMOVED Rev 3** — impersonation is test-only (`isTestAccount=true` hard guard); step-up returns when real-account impersonation lands (BL-IMP-REAL)
- [ ] **B3 — Rate limit:** `verifyTotpStepUp` enforces `check2faVerifyRateLimit` on the shared per-user bucket before TOTP validation (TD-15; TD-10/TD-11 also assert call order)
- [ ] Trusted-device skip does **not** bypass step-up for any remaining §6 table row (password change, rotate start, backup-code regen, self/other 2FA reset)

### Skip path resilience (BLOCKER acceptance gate)

- [ ] **B2 — Mint fail-closed:** When `validateAdminTrustedDevice` succeeds but `mintTwoFactorVerifiedSession` throws, `tryTrustedDeviceLoginSkip` returns `false` and the verify/setup page shows the TOTP form — **no 500** (TD-8b, TD-18)
- [ ] `lastUsedAt` DB failure after successful mint does not revert skip or show TOTP form again (best-effort only)
- [ ] `trusted_device_rejected` logged on every skip failure path with `reason=` (SF-3) — grep test or unit assertion

### Regression

- [ ] `npx jest --runInBand --testPathPatterns "identity-2fa|admin-trusted-device"` green
- [ ] `npx jest --runInBand --testPathPatterns "middleware-admin-routing"` green (2FA gate exemptions unchanged)
- [ ] `npx next build` exit 0
- [ ] Playwright harness login (`WB_E2E_HARNESS`) still bypasses 2FA unchanged

### Hardware (Andrew — post-implementation smoke)

- [ ] Login → verify → remember → sign out → sign in (no prompt)
- [ ] Settings → trusted devices list shows current device
- [ ] Revoke → sign in → prompt returns
- [ ] Change password with TOTP step-up field works
- [ ] Start impersonation with TOTP step-up field works (trusted-device skip must not bypass)

---

## 10. Adversarial / reliability notes (5-axis starter)

| Axis | Risk | Mitigation |
|---|---|---|
| **Cookie theft** | Stolen `mynk_admin_tfa_device` + active NextAuth session cookie → attacker skips TOTP until expiry/revoke | HttpOnly + Secure + SameSite=Lax; fixed 30d TTL; server-side revoke; password change / 2FA rotation revokes all; user education on shared machines; **does not** grant sensitive-op access without fresh TOTP |
| **DB compromise** | Leaked `tokenHash` rows | HMAC keyed with `ADMIN_TFA_DEVICE_HMAC_SECRET` — cannot forge cookies without secret (same as AH sessions) |
| **Fail-closed** | DB down during skip check | `tryTrustedDeviceLoginSkip` returns false → user sees normal TOTP prompt (TD-8) |
| **Fail-closed** | `mintTwoFactorVerifiedSession` throws during skip | try-catch → return false, log `trusted_device_skip_mint_failed` — no page 500 (TD-8b, TD-18) |
| **Brute-force** | Step-up TOTP without rate limit | `verifyTotpStepUp` calls `check2faVerifyRateLimit` first — shared bucket with login verify (TD-15) |
| **Ops footgun** | HMAC secret rotation | All trusted devices silently invalidated — documented in PLATFORM-ASSUMPTIONS (SF-1) |
| **Impersonation** | Trusted skip → immediate impersonate | `startImpersonation` in §6 step-up table (TD-14) |
| **Fail-closed** | HMAC secret missing in prod | Skip/mint throws or returns false; no bypass |
| **Revocation completeness** | Stale trust after password change | Cascade revoke on `changePassword` + 2FA reset/rotate |
| **Scope creep** | Trusted device used for step-up | Explicit inline TOTP on sensitive actions; rotate-confirm exception documented |
| **Middleware bypass** | Edge can't DB-check | Page-level skip only after session identity known; middleware still requires `twoFactorVerified` JWT |
| **Enumeration** | Device list reveals UA | Acceptable — owner-only, behind auth + 2FA gate |
| **Backup codes + remember** | Backup code + remember still creates trust | Acceptable — user proved factor possession; log `type=backup` |

**BLOCKER candidates for pre-merge review:**

1. **TD-B1:** Sensitive ops must not rely on `twoFactorVerified` alone post-ship.
2. **TD-B2:** No DB query added to `middleware.ts`.
3. **TD-B3:** Raw device token never in DB/logs/egress.
4. **TD-B4:** `ADMIN_TFA_DEVICE_HMAC_SECRET` documented in PLATFORM-ASSUMPTIONS.

---

## Build sequence (executor order)

```
Step 1 — Schema + migration
  • Add AdminTrustedDevice model + AdminUser relation
  • npx prisma migrate dev
  • Schema test

Step 2 — Core lib
  • src/lib/admin-trusted-device.ts (mint, validate, revoke, cookie builders)
  • src/lib/two-factor-step-up.ts (or extracted validate helper)
  • env.ts + PLATFORM-ASSUMPTIONS.md for ADMIN_TFA_DEVICE_HMAC_SECRET
  • Unit tests TD-1 – TD-8, TD-16 – TD-19

Step 3 — Login skip wiring
  • tryTrustedDeviceLoginSkip + calls in setup/page.tsx + verify/page.tsx
  • Tests TD-7, static page guards

Step 4 — Remember checkbox
  • Extend verifyTotpCode + TwoFactorVerifyForm
  • Tests TD-9

Step 5 — Revocation actions + UI
  • listTrustedDevices, revokeTrustedDevice, revokeAllTrustedDevices
  • TwoFactorManageView trusted-devices section
  • Cascade hooks on changePassword, adminResetTwoFactor, rotateTotpConfirm

Step 6 — Sensitive op step-up
  • verifyTotpStepUp (rate limit first) + wire changePassword, rotateTotpStart, regenerateBackupCodes, adminResetTwoFactor, startImpersonation
  • UI TOTP fields (incl. impersonation dialog)
  • Tests TD-10 – TD-15, TD-14 (impersonation)

Step 7 — Verification
  • Full jest identity suite
  • npx next build
  • Draft smokebook (optional docs/handoff/2fa-remember-device-smokebook-YYYY-MM-DD.md)

Step 8 — Andrew hardware smoke → merge --no-ff to v1-redesign after PASS
```

**Do not parallelize** with in-flight whiteboard replay work on the same branch.

---

## Open decisions for Andrew

1. **Prod cookie `__Secure-` prefix** — recommended above for long-lived trust credential; confirm vs plain `mynk_admin_tfa_device` + Secure flag only (AH pattern).
2. **Max devices (10)** — adjust if tutors use many machines.
3. **Backup code + remember device** — allowed in this plan; forbid if you want remember only after TOTP (not backup).

---

## Summary checklist (executor)

| # | Task | Owner |
|---|---|---|
| 1 | Prisma `AdminTrustedDevice` + migration | Agent |
| 2 | `admin-trusted-device.ts` + env secret | Agent |
| 3 | Page-level `tryTrustedDeviceLoginSkip` | Agent |
| 4 | Remember checkbox + `verifyTotpCode` extend | Agent |
| 5 | Revoke list/UI + cascades | Agent |
| 6 | Sensitive op step-up + UI fields | Agent |
| 7 | Jest suite TD-1 – TD-19 | Agent |
| 8 | `npx next build` | Agent |
| 9 | Hardware smoke | Andrew |
