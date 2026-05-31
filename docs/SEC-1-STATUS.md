# SEC-1 Admin Impersonation + Test-Account Isolation — Status

> **Design doc:** [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](handoff/sec-1-impersonation-design-2026-05-30.md)
> **Branch:** `feat/sec-1-foundation`

## Dispatch status

| Dispatch | Scope | Status | Branch |
|---|---|---|---|
| **A — Foundation** | Schema + auth changes + impersonation.ts partial | ✅ Done | `feat/sec-1-foundation` |
| **B — Actions + banner** | `startImpersonation()`, `exitImpersonation()`, `ImpersonationBanner` | ⬜ Pending | — |
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
