# P2b smoke fixes — held Sonnet pass (scope blob)

> **Status:** ACCUMULATING during Andrew real-hardware smoke (2026-06-01). NOT yet dispatched.
> **Branch to fix:** `identity-p2b-ui` @ `cd7555b` (off `v1-redesign`). Re-smoke on preview after fixes.
> **Key finding:** child auth backend is **VERIFIED WORKING** (`pooky`/`121212` logs in successfully). Every issue below is UX / redirect / policy — **not** crypto/storage. PINs are bcrypt-hashed (not decryptable); a weak one was *guessed* via dictionary, not reversed.
> **Tier:** `claude-4.6-sonnet-medium-thinking` (auth surfaces). Gates: `tsc` + `next build` + `test:regression` + identity suites green; add tests for @-strip, redirect-origin, weak-PIN reject, lockout tiers.

## Findings + fixes

1. **Username `@` papercut** (likely root cause of Sveta "incorrect" + `testchild1` lockout). Setup success screen (`src/app/claim/[token]/setup/CredentialSetupForm.tsx`) renders `@{finalUsername}` — the decorative `@` gets typed at login. Login (`src/app/api/auth/learner/login/route.ts`) normalizes `trim().toLowerCase()` but does **not** strip `@`, so `@pooky` ≠ stored `pooky` → "incorrect." **FIX:** (a) display username plainly (no misleading `@`) on the success screen + hand-off; (b) login normalization strips a leading `@` + trims (defensive, both forms resolve).

2. **`/join` 404 after successful child login.** `src/app/students/login/page.tsx` redirects to `returnTo ?? "/join"` on success, but **no `/join` route exists** on the branch → successful login dead-ends in 404. **FIX:** add a minimal authenticated `/join` placeholder gated by `getLearnerSession()` ("You're signed in, [name] — your tutor will start the session here"). Full live-session join wiring stays a later phase.

3. **Redirect-origin sweep.** AccountHolder/learner/claim handlers build in-app redirects from `getPublicBaseUrl()` (fixed prod `NEXTAUTH_URL`). On a **preview**, those redirects bounce the user to the **prod** domain (which lacks the code) → 404 (e.g. `/verify-email` → `${prod}/account/dashboard`). **FIX:** same-deployment redirects use `req.nextUrl.origin`; reserve `getPublicBaseUrl()` for email-link bodies only. Sweep all account-holder/learner/claim route handlers.

4. **Email-link preview base.** `src/lib/public-url.ts` `getPublicBaseUrl()` uses `NEXTAUTH_URL` (prod) for email links → preview-smoke verification/reset links point at prod (no code there). **FIX:** when `VERCEL_ENV === 'preview'`, prefer the deployment's own `VERCEL_URL` for email links; keep `NEXTAUTH_URL` on production (host-header-injection-safe). Do NOT switch email links to request host (reintroduces injection risk).

5. **Password strength — both realms.** Currently min-8 only; `/setup` is min-6 (inconsistency). **FIX:** zxcvbn red/yellow/green meter + **server-enforced** min score, **no forced composition rules**, standardize length floor to **10** across tutor signup/setup/reset **and** AccountHolder signup/reset. One shared validator + one shared password-strength field component (no duplicated logic). Child PIN excluded (own model).

6. **Weak-PIN blocklist at child setup.** 6-digit PINs are low-entropy; a trivial one (`121212`) was dictionary-guessable. **FIX:** reject obvious PINs at child credential setup (`123456`, `111111`, `121212`, sequential/repeated patterns). Kid-appropriate; no adult composition rules. Online rate-limiting remains the primary brute-force defense.

7. **Child-login autofill clobber.** `src/app/students/login/page.tsx` username field uses `autoComplete="username"`, PIN uses `autoComplete="current-password"` → a parent's saved email/password autofills into the child login. **FIX:** `autoComplete="off"` (+ non-suggestive `name`/`id`) on the child username + PIN fields.

8. **Show/hide PIN toggle** on child login + credential setup (kids need to see what they type).

9. **Gentler soft-lockout for child PIN** (`src/lib/learner-pin-rate-limit.ts`). 3 fails → 30s is too harsh for kids; once tripped, even a correct PIN is rejected (cooldown checked before verify). **FIX:** more free attempts before the first short cooldown; never hard-lock (keep AH-4); clearer copy so a correct post-wait entry isn't met with a scary "locked out" message.

10. **Username hand-off.** After setup, clearly surface the child's **exact** username ("signs in with username: **pooky**") + the child-login URL, so parents/kids know precisely what to enter.

## Out of scope (still deferred)
Phase-3 consent models + the consent panel; full `/join` live-session wiring; AccountHolder 2FA (Phase 6); child email-upgrade (P2c).
