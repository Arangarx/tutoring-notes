# SEC-1 Admin Impersonation + Test-Account Isolation — Status

> **Design doc:** [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](handoff/sec-1-impersonation-design-2026-05-30.md)
> **Branch (Dispatch C):** `feat/sec-1-admin-dashboard`

## Dispatch status

| Dispatch | Scope | Status | Branch |
|---|---|---|---|
| **A — Foundation** | Schema + auth changes + impersonation.ts partial | ✅ Done | `feat/sec-1-foundation` (merged to master) |
| **B — Actions + banner** | `startImpersonation()`, `exitImpersonation()`, `ImpersonationBanner` | ✅ Done | `feat/sec-1-impersonation-runtime` (merged) |
| **C — Dashboard + routing** | Real-admin dashboard, post-login routing, retire interim trigger | ✅ Done | `feat/sec-1-admin-dashboard` |

---

## Routing model (Dispatch C)

| Session | Lands on | Tutor paths (`/admin/students`, `/admin/outbox`) |
|---|---|---|
| Real DB admin, not impersonating | `/admin` (minimal dashboard + Test accounts) | **Blocked** → redirect to `/admin` |
| Impersonating (`isImpersonating=true`) | `/admin/students` (via redirect from `/admin` or after Log in as) | Allowed |
| Legacy env-only admin (`sub=admin`) | `/admin/students` (unchanged) | Allowed |
| Unauthenticated | `/login` | N/A |

**Actions:** `startImpersonation` → `/admin/students`; `exitImpersonation` → `/admin`. Login default `callbackUrl` → `/admin`.

**Nav:** Real-admin-home sessions hide Students / Outbox links; Settings + operator links remain.

**Logging:** `[imp] route=… mode=…` on admin-home vs tutor redirects and middleware blocks.

---

## Dispatch C — Done

### Files changed

| File | Change |
|---|---|
| `src/lib/admin-routing.ts` | *(new)* Session mode + tutor-path guard helpers |
| `src/middleware.ts` | Redirect real-admin-home away from tutor-only paths |
| `src/app/admin/page.tsx` | Minimal real-admin dashboard; tutor sessions → `/admin/students` |
| `src/app/admin/AdminTestAccountsPanel.tsx` | *(new)* Test accounts + Log in as (`assertIsRealAdmin`) |
| `src/app/admin/TestAccountsSection.tsx` | **Removed** (interim B trigger retired) |
| `src/app/admin/layout.tsx` | Pass `sessionMode` to `AdminNav` |
| `src/components/AdminNav.tsx` | Hide tutor links for real-admin-home |
| `src/app/admin/actions/impersonate.ts` | `startImpersonation` redirect → `/admin/students` |
| `src/app/login/page.tsx` | Default post-login `callbackUrl` → `/admin` |
| `src/__tests__/admin-routing.test.ts` | *(new)* Routing requirement tests |
| `src/__tests__/impersonation-c.test.ts` | *(new)* Blockers #12–#13 + admin-home routing |
| `src/__tests__/impersonation-b.test.ts` | Start redirect expectation → `/admin/students` |
| `docs/SEC-1-STATUS.md` | *(this file)* |

### Blocker acceptance gates (Dispatch C)

| # | Blocker | Test | Status |
|---|---|---|---|
| 12 | "Log in as" not available while impersonating | `impersonation-c.test.ts` — `AdminTestAccountsPanel` + `assertIsRealAdmin` | ✅ Unit |
| 13 | List only `isTestAccount=true` | `impersonation-c.test.ts` — `findMany` where filter | ✅ Unit |

---

## Smoke checklist for Preview (Dispatch C — full SEC-1)

### One-time setup

Same as Dispatch B: ensure at least one `isTestAccount=true` row exists (throwaway or test1 **only after** Part 2 seed when ready). Real admin password + Google OAuth unchanged (R1).

### Smoke steps

- [ ] Vercel preview builds cleanly
- [ ] `npx tsc --noEmit` clean on branch
- [ ] `npx eslint` no new errors on changed files
- [ ] `npx jest src/__tests__/auth-sec1.test.ts src/__tests__/impersonation-b.test.ts src/__tests__/impersonation-c.test.ts src/__tests__/admin-routing.test.ts` — all green
- [ ] **Real admin** — password login → lands on **`/admin`** (minimal dashboard, **not** students list)
- [ ] Dashboard lists only test accounts; **no** Students/Outbox in nav (Settings still visible)
- [ ] Direct visit `/admin/students` as real admin → redirected to `/admin`
- [ ] **Log in as** throwaway test account → **`/admin/students`** + amber banner
- [ ] Browse tutor workspace (student list, whiteboard) as impersonated user
- [ ] **Exit impersonation** → **`/admin`** dashboard, banner gone, test accounts + Log in as visible again
- [ ] While impersonating: `/admin` redirects to `/admin/students`; no Log in as on dashboard (cannot nest impersonation)
- [ ] Credentials login as test account still rejected (Blocker #11 regression)
- [ ] `arangarx+test1@gmail.com` still `isTestAccount=false` if Part 2 seed not run yet

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
| `src/app/admin/TestAccountsSection.tsx` | *(removed in C)* Interim B trigger |
| `src/app/admin/page.tsx` | *(replaced in C)* |
| `src/__tests__/impersonation-b.test.ts` | *(new)* 8 Dispatch B blocker + privilege-escalation unit tests |
| `docs/SEC-1-STATUS.md` | *(this file)* Dispatch B marked done, B smoke checklist added |

### Blocker acceptance gates (Dispatch B)

| # | Blocker | Test | Status |
|---|---|---|---|
| 8 | Banner present when impersonating | smoke: visit tutor view as impersonated session → amber banner | ⬜ Smoke |
| 9 | Exit restores admin session | `impersonation-b.test.ts` "exitImpersonation closes log and restores admin" | ✅ Unit |
| 10 | `startImpersonation()` called as test account → Forbidden | `impersonation-b.test.ts` "Blocker #10" | ✅ Unit |
| 11 | Password login rejected for test account | `impersonation-b.test.ts` "Blocker #11" | ✅ Unit |

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

(d) [ONLY after Dispatch B + C smoked + impersonation flow verified]
    Run PART 2 of scripts/seed-admin-google.sql to flip test1 to isTestAccount=true.
    DO NOT run Part 2 before impersonation is proven — test1's password login dies before
    "Log in as" exists and Andrew would be locked out.
```

---

## CSP / platform assumption notes

- Google OAuth uses **browser redirects** (not XHR) — no `connect-src` change needed.
- The `/api/auth/callback/google` redirect URI must be added to Google Cloud Console
  (see prep step (a) above). No code change required.
- The existing Gmail OAuth `OAuthEmailConnection` flow is unrelated and unaffected.
- Both flows share the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` credentials.

---

## Sequencing guard

**Do not run `scripts/seed-admin-google.sql` PART 2 (test1 flip) until Dispatch B + C
impersonation is smoke-verified.** Converting test1 to `isTestAccount=true` kills its
password login permanently. If "Log in as" doesn't exist yet, there is no way into
that account and Andrew loses the ability to test the impersonation flow from the
admin side.

The guard is also encoded in large `!!!` comments in the seed SQL itself.
