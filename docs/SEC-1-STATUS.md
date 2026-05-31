# SEC-1 Admin Impersonation + Test-Account Isolation — Status

> **Design doc:** [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](handoff/sec-1-impersonation-design-2026-05-30.md)
> **Branch:** `feat/sec-1-foundation`

## Dispatch status

| Dispatch | Scope | Status | Branch |
|---|---|---|---|
| **A — Foundation** | Schema + auth changes + impersonation.ts partial | ✅ Done | `feat/sec-1-foundation` (merged to master) |
| **B — Actions + banner** | `startImpersonation()`, `exitImpersonation()`, `ImpersonationBanner` | ✅ Done | `feat/sec-1-impersonation-runtime` |
| **C — Dashboard UI** | Admin page "Test accounts" section + "Log in as" button | ⬜ Pending | — |

---

## Dispatch A — Done

### Files changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | `AdminUser.passwordHash String?`, `AdminUser.isTestAccount Boolean @default(false)`, new `ImpersonationLog` model |
| `prisma/migrations/20260530120000_sec1_foundation/migration.sql` | Additive migration (see Blocker #5) |
| `src/lib/auth-db.ts` | `verifyPassword` null-safe; `createTestAccount` helper |
| `src/auth-options.ts` | Conditional `GoogleProvider`; updated `authorize()`; `signIn`, `jwt`, `session` callbacks |
| `src/types/next-auth.d.ts` | *(new)* Session + JWT type augmentation |
| `src/lib/impersonation.ts` | *(new)* `ImpersonationForbiddenError`, `assertIsRealAdmin()`, `mintImpersonationSession()`, `mintAdminSession()` |
| `src/__tests__/auth-sec1.test.ts` | *(new)* 7 Dispatch A blocker unit tests |
| `docs/SEC-1-STATUS.md` | *(this file)* |
| `.gitignore` | `scripts/seed-admin-google.sql` added |
| `scripts/seed-admin-google.sql` | *(gitignored)* Manual seed SQL for real-admin row + test1 flip |
| `AGENTS.md` | `imp=` log prefix registered |
| `docs/RECORDER-LIFECYCLE.md` | `imp=` log prefix registered |
| `docs/PLATFORM-ASSUMPTIONS.md` | Google OAuth CSP note (no change needed — OAuth uses browser redirects) |

### Blocker acceptance gates (Dispatch A)

| # | Blocker | Test | Status |
|---|---|---|---|
| 1 | `isTestAccount=true` blocks credentials login | `auth-sec1.test.ts` "Blocker #1" | ✅ |
| 2 | `verifyPassword(plain, null)` → `false`, no throw | `auth-sec1.test.ts` "Blocker #2" | ✅ |
| 3 | Google `signIn` rejects unknown email | `auth-sec1.test.ts` "Blocker #3" | ✅ |
| 4 | Google `signIn` rejects test-account email | `auth-sec1.test.ts` "Blocker #4" | ✅ |
| 5 | Migration is additive: no `DROP COLUMN`, correct DDL | `auth-sec1.test.ts` "Blocker #5" | ✅ |
| 6 | `assertIsRealAdmin()` throws `ImpersonationForbiddenError` for test account | `auth-sec1.test.ts` "Blocker #6" | ✅ |
| 7 | `GOOGLE_CLIENT_ID/SECRET` absent → `GoogleProvider` skipped gracefully | `auth-sec1.test.ts` "Blocker #7" | ✅ |

---

## Dispatch B — Done

### Files changed

| File | Change |
|---|---|
| `src/app/admin/actions/impersonate.ts` | *(new)* `startImpersonation()` + `exitImpersonation()` server actions |
| `src/components/ImpersonationBanner.tsx` | *(new)* Amber banner rendered when `isImpersonating=true` |
| `src/app/admin/layout.tsx` | Wire `ImpersonationBanner` in (conditional on `isImpersonating`) |
| `src/app/admin/TestAccountsSection.tsx` | *(new)* Interim B trigger: lists test accounts + "Log in as" buttons |
| `src/app/admin/page.tsx` | Import + render `TestAccountsSection` (bottom of dashboard) |
| `src/__tests__/impersonation-b.test.ts` | *(new)* 8 Dispatch B blocker + privilege-escalation unit tests |
| `docs/SEC-1-STATUS.md` | *(this file)* Dispatch B marked done, B smoke checklist added |

### Blocker acceptance gates (Dispatch B)

| # | Blocker | Test | Status |
|---|---|---|---|
| 8 | Banner present when impersonating | smoke: visit `/admin` as impersonated session → amber banner shows `<testEmail>` | ⬜ Smoke pending |
| 9 | Exit restores admin session | `impersonation-b.test.ts` "exitImpersonation closes log and restores admin" | ✅ Unit |
| 10 | `startImpersonation()` called as test account → Forbidden | `impersonation-b.test.ts` "Blocker #10" | ✅ Unit |
| 11 | Password login rejected for test account | `impersonation-b.test.ts` "Blocker #11" | ✅ Unit |

Additional privilege-escalation negatives tested:
- Already-impersonating session → blocked (isTestAccount=true scope)
- Targeting a non-test-account → rejected
- Idempotency: existing open log row → re-mints without creating a second row

---

## Smoke checklist for Preview (Dispatch B)

### One-time setup: create a throwaway test account (DO NOT use test1)

**IMPORTANT:** Do NOT flip `arangarx+test1@gmail.com` to `isTestAccount=true` yet — that is PART 2 of the seed SQL, which runs only after B is smoke-proven (see Sequencing guard below).

Instead, create a **throwaway test account** for B smoke testing using the `createTestAccount` helper. Run this snippet once against Neon (e.g. via `psql` or the Neon SQL editor):

```sql
-- Create a throwaway test account for Dispatch B smoke.
-- Use a fake email — this account has no password and cannot log in via credentials.
-- Replace 'throwaway-b-smoke@example.com' with any dummy email you like.
INSERT INTO "AdminUser" (id, email, "passwordHash", "isTestAccount", "displayName", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'throwaway-b-smoke@example.com',
  NULL,
  true,
  'B Smoke Test Account',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;
```

Or use the `createTestAccount` helper from a Node script:
```ts
import { createTestAccount } from "@/lib/auth-db";
await createTestAccount("throwaway-b-smoke@example.com", "B Smoke Test Account");
```

### Smoke steps (Dispatch B)

- [ ] Vercel preview deploys without build errors
- [ ] `npx tsc --noEmit` clean on branch
- [ ] `npx eslint` no new errors on changed files
- [ ] `npx jest src/__tests__/impersonation-b.test.ts` — all tests green
- [ ] **Throwaway test account created** (see above; NOT test1)
- [ ] Log in as real admin (password or Google OAuth)
- [ ] `/admin` dashboard shows "Test accounts (interim)" section with throwaway account listed
- [ ] Click "Log in as" for the throwaway account
  - [ ] Redirects to `/admin`
  - [ ] **Amber banner appears** with throwaway email + "Exit impersonation" button (Blocker #8)
  - [ ] Can browse admin pages normally as the test account (students list, settings, etc.)
  - [ ] `ImpersonationLog` row created in DB with `endedAt=null`
- [ ] Click "Exit impersonation"
  - [ ] Redirects to `/admin`
  - [ ] **Amber banner is gone** (Blocker #9)
  - [ ] Real admin email shown in nav/session
  - [ ] `ImpersonationLog` row has `endedAt` populated
- [ ] Attempt credentials login as throwaway account (any password) → rejected (Blocker #11)
- [ ] `arangarx+test1@gmail.com` credentials login with its real password → still accepted (regression guard — test1 NOT yet flipped)

### test1 guard (confirm UNTOUCHED after B smoke)

- [ ] `SELECT email, "isTestAccount", "passwordHash" IS NOT NULL as has_hash FROM "AdminUser" WHERE email = 'arangarx+test1@gmail.com';`
  - Expected: `isTestAccount = false`, `has_hash = true`
  - If this shows `isTestAccount = true` — STOP, something went wrong. test1 password login is now blocked.

---

## Andrew prep steps — ORDER MATTERS

```
(a) [BEFORE smoke] Add Google redirect URI(s) in Google Cloud Console:
      Production: https://<your-production-domain>/api/auth/callback/google
      Localhost:  http://localhost:<devport>/api/auth/callback/google (optional, Q4=A)
    The existing Gmail /api/auth/gmail/callback redirect stays unchanged.

(b) [After Dispatch A merges to master + Vercel auto-deploys + Neon migration applied]
    Run PART 1 of scripts/seed-admin-google.sql against Neon production.
    This upserts Andrew's real admin row. His existing password login continues
    to work — passwordHash is LEFT UNCHANGED on conflict.

(c) [After (b)] Verify Google login works at the Vercel preview URL.
    Navigate to /login → "Sign in with Google" → should authenticate as Andrew.
    Password login should ALSO still work (constraint #3 preserved).

(d) [ONLY after Dispatch B ships + impersonation flow is smoke-verified]
    Run PART 2 of scripts/seed-admin-google.sql to flip test1 to isTestAccount=true.
    DO NOT run Part 2 before Dispatch B — test1's password login dies before
    "Log in as" exists and Andrew would be locked out.
```

---

## Smoke checklist for Preview (Dispatch A)

- [ ] Vercel preview deploys without build errors
- [ ] `npx tsc --noEmit` clean on branch
- [ ] `npx eslint` no new errors on changed files  
- [ ] `npx jest src/__tests__/auth-sec1.test.ts` — all 7 blockers green
- [ ] Credentials login still works for existing admin (real hash → bcrypt compare → success)
- [ ] Login with wrong password → rejected (no regression)
- [ ] Login page loads with "Sign in with Google" button visible (Google creds set in Vercel env)
  - [ ] Google OAuth flow completes for `arangarx@gmail.com` (after step (b) above)
  - [ ] Google OAuth rejects a stranger Google account

---

## CSP / platform assumption notes

- Google OAuth uses **browser redirects** (not XHR) — no `connect-src` change needed.
- The `/api/auth/callback/google` redirect URI must be added to Google Cloud Console
  (see prep step (a) above). No code change required.
- The existing Gmail OAuth `OAuthEmailConnection` flow is unrelated and unaffected.
- Both flows share the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` credentials.

---

## Sequencing guard

**Do not run `scripts/seed-admin-google.sql` PART 2 (test1 flip) until Dispatch B
impersonation is smoke-verified.** Converting test1 to `isTestAccount=true` kills its
password login permanently. If "Log in as" doesn't exist yet, there is no way into
that account and Andrew loses the ability to test the impersonation flow from the
admin side.

The guard is also encoded in large `!!!` comments in the seed SQL itself.
