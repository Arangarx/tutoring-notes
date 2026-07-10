# Security Tier B Findings — 2026-06-11

Branch: `feat/security-tier-b`

---

## 🔍 Smoke / Review Checklist for Andrew

### Fixes already landed (verify in smoke):
1. **`/api/queues/chunk-transcribe` auth guard** — endpoint now requires `Bearer $CRON_SECRET` when `CRON_SECRET` is configured in Vercel env. Verify transcription still works end-to-end (the sweep/cron path is unaffected; the internal fire-and-forget call from `enqueueChunkTranscriptionAction` does NOT send a Bearer token — see **Decision needed** below).
2. **Forgot-password stale token cleanup** — old unused PASSWORD_RESET tokens for an account are now deleted before issuing a new one. Smoke: request password reset twice with the same email; confirm only the second link works.
3. **Upload error message sanitization** — upload routes return a generic `"Upload authorization failed"` instead of the raw exception message. Smoke: observe network tab on a rejected upload attempt.

### Decisions Andrew must make (deferred findings):
- **SHOULD-FIX-2 decision** — `enqueueChunkTranscriptionAction` in `src/lib/recording/chunk-transcribe-enqueue.ts` calls `/api/queues/chunk-transcribe` as a fire-and-forget without the Bearer token. Now that the endpoint guards with `CRON_SECRET`, these fire-and-forget calls will be **rejected 401 when CRON_SECRET is set in production**. Two options: (A) pass `CRON_SECRET` in the F&F fetch header (adds the secret to server-side fetch, never to the browser), or (B) accept that the cron/sweep backstop is the only path for now and disable the F&F until Vercel Queues is wired. Andrew needs to decide before merging to v1-redesign. See SHOULD-FIX-2 detail below.
- **Dependency vulnerabilities (SHOULD-FIX-4)** — `npm audit fix` is recommended after verifying peer-dep compatibility. See dep findings below.

---

## Findings by Severity

---

### BLOCKER findings: None

The auth boundary and session infrastructure are well-designed. No BLOCKERs identified.

---

### SHOULD-FIX findings

---

#### SHOULD-FIX-1: `/api/queues/chunk-transcribe` — Unauthenticated public endpoint ✅ FIXED

**File:** `src/app/api/queues/chunk-transcribe/route.ts`

**Risk:** The endpoint is a standard Next.js API route reachable by any HTTP client without credentials. An external actor could:
- POST arbitrary payloads causing DB lookup load (DoS)
- If a valid `(sessionId, chunkBlobUrl)` pair is somehow known, trigger re-transcription (OpenAI cost amplification at scale)

**Exploit sketch:** `curl -X POST https://usemynk.com/api/queues/chunk-transcribe -d '{"sessionId":"...","chunkBlobUrl":"..."}'` — no auth required, returns 200/500 without the guard.

**Fix applied:** Added a conditional `CRON_SECRET` bearer-token guard. Fail-open when `CRON_SECRET` is unset (backward-compat). **See the decision note above about the fire-and-forget caller.**

**Tests added:** `src/__tests__/security/chunk-transcribe-auth.test.ts` — 4 tests asserting 401 on missing/wrong token when secret is configured, pass-through when unset.

**⚠️ Decision needed (Andrew):** `enqueueChunkTranscriptionAction` in `src/lib/recording/chunk-transcribe-enqueue.ts` calls this endpoint without a Bearer token. With `CRON_SECRET` set in production, those calls will now return 401. The cron backstop (`/api/cron/transcribe-sweep`) will still pick up unprocessed chunks, so this won't lose data — but will increase latency for transcription. Options:
- **(A, recommended)** Add the Bearer token to the F&F `fetch()` call inside `enqueueChunkTranscriptionAction` (server-side only, never reaches the browser). Simple, one-line fix.
- **(B)** Accept that the cron sweep is the sole processing path until Vercel Queues is properly wired with HMAC signature verification.

---

#### SHOULD-FIX-2: `/api/auth/account-holder/forgot-password` — Stale reset tokens not revoked ✅ FIXED

**File:** `src/app/api/auth/account-holder/forgot-password/route.ts`

**Risk:** Without revocation, multiple active PASSWORD_RESET tokens can accumulate for the same account. An attacker who can rotate IPs (bypassing the in-memory IP rate limit in middleware) can generate many valid 1-hour reset tokens. Each token independently allows a password reset — the effective attack window is larger than a single token's TTL.

**Exploit sketch:** Rotate through IPs, POST to `/api/auth/account-holder/forgot-password` many times with the same email → intercept any one of the resulting tokens from the email thread → reset password. The middleware allows 30 req/min per IP, but with IP rotation the attacker accumulates tokens indefinitely.

**Note:** The legacy tutor realm (`src/lib/password-reset.ts`) already revokes old tokens correctly (`deleteMany` before `create`). This fix aligns the AH realm with the same pattern.

**Fix applied:** Added `db.accountHolderEmailToken.deleteMany({ where: { accountHolderId, purpose: "PASSWORD_RESET", consumedAt: null } })` before creating the new token.

**Tests added:** `src/__tests__/security/forgot-password-token-revocation.test.ts` — 4 tests verifying cleanup order, correct scope, and anti-enumeration preservation.

---

#### SHOULD-FIX-3: Upload routes expose raw exception messages to clients ✅ FIXED

**Files:** `src/app/api/upload/audio/route.ts`, `src/app/api/upload/blob/route.ts`

**Risk:** When `handleUpload` throws, the raw exception message (e.g., `"Missing studentId in clientPayload."`, `"Invalid or expired join link."`) was returned verbatim in the response body. This reveals internal API structure and parameter names to unauthenticated callers.

**Exploit sketch:** POST an invalid payload to `/api/upload/blob` and observe the error message — it describes internal parameter names and code paths.

**Fix applied:** Both routes now return `"Upload authorization failed. Please try again."` while logging the real exception server-side. The `debugId` (opaque correlation ID) is preserved for prod debugging.

**Test updated:** `src/__tests__/api/upload-audio-route.test.ts` — updated assertion to verify the generic message appears and the internal detail does not.

**Tests added:** `src/__tests__/security/upload-error-sanitization.test.ts` — 2 tests across both upload routes verifying the generic message and absence of internal detail.

---

#### SHOULD-FIX-4: Dependency vulnerabilities (prod-affecting)

**File:** `package.json` / `package-lock.json`

**`npm audit` summary:** 28 vulnerabilities (20 moderate, 8 high). Pre-existing; not introduced by this branch.

**Prod-relevant high-severity items:**

| Package | CVE / Advisory | Severity | Path | Notes |
|---|---|---|---|---|
| `effect` < 3.20.0 | GHSA-38f7-945m-qr2g | **HIGH** | `@prisma/config` → `prisma` | AsyncLocalStorage context lost/contaminated under concurrent Prisma fiber load. Risk: DB context cross-contamination on concurrent requests in serverless. |
| `defu` ≤ 6.1.4 | GHSA-737v-mqg7-c878 | **HIGH** | `@prisma/config` → `prisma` | Prototype pollution via `__proto__` key. Risk: property injection if attacker controls Prisma config input (indirect, low exploit probability). |
| `flatted` ≤ 3.4.1 | GHSA-rf6f-7fwh-wjgh | **HIGH** | Indirect (check `npm audit` tree) | Prototype pollution via `parse()`. |
| `ws` 8.0.0–8.20.0 | GHSA-58qx-3vcg-4xpx | **MODERATE** | `engine.io-client` (socket.io / whiteboard relay client) | Uninitialized memory disclosure. Risk: whiteboard relay connection could leak server memory in crafted WebSocket frames. |
| `brace-expansion` | GHSA-f886-m6hf-6m8v | **MODERATE** | `@typescript-eslint` (dev only) | DoS via zero-step sequence. Dev dependency — no prod impact. |

**Recommendation (deferred — do after branch smoke, not overnight):**

```bash
npm audit fix --dry-run   # inspect what would change
npm audit fix             # run if no breaking peer-dep changes
npx next build            # verify build still passes
npx jest --no-coverage    # verify test suite
```

Do NOT use `--force` — it has historically produced breaking peer-dep conflicts in this repo (Tier A lesson, commit `8cdbe58`).

---

### NICE-TO-HAVE findings

---

#### NICE-1: CSP `unsafe-inline` + `unsafe-eval` in `script-src`

**File:** `src/lib/security/csp.ts`

**Finding:** `script-src 'self' 'unsafe-inline' 'unsafe-eval'` is intentionally permissive. This is documented in the CSP builder's JSDoc ("required by Next.js hydration + the Excalidraw runtime"). `unsafe-eval` enables eval-based XSS escalation if an injection point exists elsewhere.

**Status:** Accepted risk, documented in `src/lib/security/csp.ts`. The `frame-ancestors 'none'` directive mitigates clickjacking. Tightening requires nonce-based CSP infrastructure — out of scope for V1.

---

#### NICE-2: `/api/waitlist` has no durable per-identity rate limit

**File:** `src/app/api/waitlist/route.ts`

**Finding:** The waitlist endpoint relies only on the generic in-memory IP bucket (30 req/min). An attacker with many IPs could spam arbitrary emails into the waitlist. No sensitive data is written; risk is operational noise. The `upsert` is idempotent.

**Status:** Acceptable at pilot scale. Add a durable email-keyed throttle (same pattern as `checkAhLoginRateLimit`) before large-scale launch.

---

#### NICE-3: `SameSite=lax` on NextAuth JWT cookie

**File:** `src/lib/two-factor-session.ts`

**Finding:** The NextAuth session cookie uses `SameSite=lax` rather than `Strict`. This is required for OAuth callback flows (Google OAuth redirect returns to the app with the cookie). `Strict` would break the OAuth flow. `lax` still blocks cross-site POST, so CSRF on state-mutating forms is mitigated via NextAuth's CSRF token mechanism.

**Status:** By design. No change needed.

---

#### NICE-4: Session TTLs are long (30d AH, 90d Learner)

**Finding:** AccountHolder sessions slide to 30 days; learner device sessions to 90 days. A stolen session cookie provides a long attack window.

**Status:** Intentional UX decision (children's devices need persistent sessions). Mitigated by: DB-backed revocation (instant on parent action), tombstone check, per-device revocation API. No change recommended for V1.

---

## What Was Verified Clean (Not Findings)

| Area | Result |
|---|---|
| Auth boundary: HMAC-keyed session tokens | ✅ 256-bit random tokens, HMAC-SHA-256 stored, never plaintext in DB |
| Session fixation prevention | ✅ Fresh token created on every login |
| Session revocation | ✅ DB-backed, immediately revocable; tombstone check on every request |
| Cookie attributes | ✅ HttpOnly ✓, SameSite=Strict ✓ (AH/Learner), Secure in prod ✓, Path=/ ✓ |
| Duplicate-cookie handling (Q3-A) | ✅ Reverse-order candidate iteration; both session realms |
| Open-redirect guards | ✅ `/api/auth/clear-stale-session?then=` validates `then.startsWith('/')` |
| AccountHolder login rate limiting | ✅ Durable per-email (IAC-11) + IP-based in middleware |
| Learner PIN lockout | ✅ Soft + hard tiers, durable `LearnerLoginThrottle` table |
| 2FA gate in middleware | ✅ JWT `twoFactorVerified` gate; test accounts + impersonation exempt |
| IDOR on whiteboard routes | ✅ `assertOwnsWhiteboardSession` on every route |
| IDOR on student routes | ✅ `assertOwnsStudent` / `canAccessStudentRow` guard |
| IDOR on learner profile routes | ✅ `assertOwnsLearnerProfile` with tombstone check |
| Secret egress / TOTP QR | ✅ TOTP secrets AES-256-GCM encrypted at rest; QR generated server-side (no external QR API) |
| Password reset flow (legacy tutor realm) | ✅ Stale tokens cleaned before creating new one |
| Password reset atomicity | ✅ Bulk session revocation in same transaction |
| Share-link auth wall | ✅ `assertCanAccessShareLink` / `checkApiShareAccess` dual-path; revocation check in all modes |
| Whiteboard join token | ✅ Expiry + revocation + session-scope path check |
| Anti-enumeration (login, signup, forgot-password) | ✅ All three endpoints return identical responses regardless of account existence |
| CSP `frame-ancestors 'none'` | ✅ Clickjacking protection active |
| HSTS | ✅ `max-age=63072000; includeSubDomains; preload` |
| X-Frame-Options DENY | ✅ |
| X-Content-Type-Options nosniff | ✅ |
| Referrer-Policy strict-origin-when-cross-origin | ✅ |
| Blob storage URLs | ✅ All private (no public Blob URLs for student content); always proxied through auth'd route |
| Cron endpoint auth | ✅ `verifyCronSecret` fail-closed (returns 401 when CRON_SECRET is unset) |
| Zod validation | ✅ Used on chunk-transcribe payload, whiteboard math route, and AH signup |
| Token entropy | ✅ `crypto.randomBytes(32)` = 256 bits for session tokens; email tokens same |
| Admin role check in middleware | ✅ NextAuth JWT gate for `/admin/*` routes |

---

## Tsc / ESLint / Jest Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| ESLint (changed files) | ✅ Clean (no new errors) |
| New security tests | ✅ 16 new tests, all pass |
| Pre-existing failures (baseline) | ⚠️ 4 suites / 4–13 tests fail on `v1-redesign` baseline — pre-existing, not introduced by this branch: `auth.test.ts` (DB connectivity), `password-reset.test.ts` (password strength constant mismatch), `identity-2fa-management.test.ts` (file content assertion), `identity/identity-p2a.test.ts` (DB connectivity) |

---

## Finding Counts

| Severity | Total | Fixed | Deferred |
|---|---|---|---|
| BLOCKER | 0 | — | — |
| SHOULD-FIX | 4 | 3 | 1 (SHOULD-FIX-4 deps — manual step) |
| NICE-TO-HAVE | 4 | 0 | 4 (documented accepted risks) |

**SHOULD-FIX-1 decision needed:** See the fire-and-forget caller note under SHOULD-FIX-1 above.
