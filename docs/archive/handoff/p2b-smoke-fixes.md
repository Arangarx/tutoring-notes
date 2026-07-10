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

11. **Auto-copy claim link on "Create claim link"** (tutor student detail, `ClaimInviteSection`). Currently shown for manual copy; Andrew accidentally sent the wrong link. **FIX:** auto-copy to clipboard on create + a "Copied!" confirmation; label which student each link belongs to so links can't be mis-sent.

12. **Device list/count live-refresh.** Revoke relies on a full page reload and the device count doesn't stay current. **FIX:** refresh the list/count on revoke (optimistic update or `router.refresh()`) so it reflects state without a manual reload. Polish.

13. **Verify-link "expired/invalid" UX for already-verified / existing account.** Tokens are single-use + 24h (not actually fast-expiring). An existing account hits the anti-enumeration path (gets a "you already have an account" email, no new token); a re-clicked/used token shows "expired." **FIX:** friendlier copy distinguishing "this link was already used / your account is already active → just log in" from a genuinely expired link, WITHOUT weakening anti-enumeration. Not a security hole (verify essentially auto-logs-in anyway, per Andrew's check).

14. **Child-login session-context clarity.** Parent felt they had to log out to do the child login (separate cookies — `mynk_ah_session` vs `mynk_learner_session` — so it's NOT actually required). **FIX:** on the dashboard / child-login hand-off, clarify "send your child to the student login — you don't need to log out." Ties to #10.

## Clarifications surfaced in smoke (NOT bugs — no code change, may improve copy)
- **`NEXT_PUBLIC_CLAIM_INVITES_ENABLED` needs a fresh deploy to take effect** — `NEXT_PUBLIC_*` vars are inlined at **build** time, so changing the env var alone does nothing until a redeploy (hence "had to redeploy to get Create claim link to show up"). Expected Vercel/Next behavior; consider documenting in `PLATFORM-ASSUMPTIONS.md`.
- **Two device sessions for one kid in one browser** isn't reproducible: `createLearnerSession` re-uses the existing `mynk_learner_session` cookie if present, and one browser jar holds one learner cookie — so logging a second kid in the same jar replaces the first. Need two real devices / separate cookie jars to see two `LearnerDeviceSession` rows. Testing-mechanics, not a bug.
- **"Revoke → next request fails" couldn't be smoked** because `/join` 404s (see #2). Testable once the `/join` placeholder lands.

## Out of scope (still deferred)
Phase-3 consent models + the consent panel; full `/join` live-session wiring; AccountHolder 2FA (Phase 6); child email-upgrade (P2c).

---

## Round 3 — smoke findings (Andrew 2026-06-02)

Branch HEAD at dispatch: `f4e4097` (off `identity-p2b-ui`). Items are lettered A–J per the dispatch scope.

### A. Password-reset flow broken — no usable reset link (FAIL #9) — HIGHEST

**Diagnosis:** The `forgot-password` POST route (`src/app/api/auth/account-holder/forgot-password/route.ts`) creates a `PASSWORD_RESET` token and calls `stubSendAccountHolderEmail`. The stub logs only `link=${payload.actionUrl}` on a single line. On Vercel's log viewer, the token URL (64-char hex) can make the line exceed the visible preview width, causing Andrew to miss it — or the account may not have been email-verified (`emailVerifiedAt IS NULL`), in which case the guard `if (row && row.emailVerifiedAt && !row.tombstonedAt)` prevents token creation entirely and no log is emitted.

**Security A3 VERIFIED (read both routes):** The `forgot-password` route does NOT mutate `AccountHolder.passwordHash` — it only creates a token row. The hash is mutated ONLY in `reset-password` POST, and ONLY inside a DB transaction that first validates the token is unexpired, unconsumed, and of type `PASSWORD_RESET`. No P0 found.

**Planned fixes:**
1. Update `stubSendAccountHolderEmail` to log the full email text body prominently (separate log line per non-blank body line), not just the `actionUrl`. This ensures the reset URL is unmissable in Vercel function logs.
2. The reset URL construction and `getPublicBaseUrl()` preview handling are already correct (fixed in prior rounds). No change needed there.
3. Reset tokens are already single-use (`consumedAt`) + TTL'd (1 hour). Anti-enumeration preserved (always 200). No change needed.

### B. Claim "already signed in" skips interstitial (FAIL #1)

**Diagnosis:** `src/app/claim/[token]/page.tsx` already contains the session-check logic, but it builds a `new Request("http://localhost/", ...)` manually rather than using the shared `getAccountHolderSessionFromHeaders()` from `src/lib/server-session.ts`. The shared helper uses `cookies()` from `next/headers` (more reliable in RSC context than `headers().get("cookie")`), which is the idiomatic Next.js App Router approach. If the inline manual path differs subtly in behavior (e.g., cookie name casing, serialization of `cookies()` vs `headers()`), the session could read as null while `getAccountHolderSessionFromHeaders()` would succeed.

**Planned fix:** Update `src/lib/server-session.ts` to use `cookies()` from `next/headers` (idiomatic RSC cookie access), and refactor `claim/[token]/page.tsx` to call `getAccountHolderSessionFromHeaders()` instead of inline manual cookie parsing.

### C. Child login autofills parent credentials (FAIL #4)

**Diagnosis:** `autoComplete="off"` is already set + non-login field names (`learner-username`, `learner-pin`), but Chrome/Edge ignore `autocomplete="off"` on `type="password"` fields and sometimes on text fields when they are adjacent.

**Planned fix:** Add `data-lpignore="true"` + `data-1p-ignore` attributes and the `readOnly`-until-focus trick (removes `readOnly` in `onFocus`) to the username + PIN inputs on `src/app/students/login/page.tsx`. Apply same attributes to PIN fields in `CredentialSetupForm.tsx`.

### D. Show/hide PIN visual overlap (#5)

**Diagnosis:** Browser native password-reveal eye button (Chrome/Edge renders one on `type="password"` fields) overlaps with the custom "Show"/"Hide" text toggle that is `absolute right-3` inside the relative container.

**Planned fix:** Replace the text-only "Show"/"Hide" toggle with an icon-only SVG toggle button (eye-open / eye-closed inline SVG) consistently across child login + CredentialSetupForm PIN fields. Add `[type="password"]::-ms-reveal { display: none; }` CSS to suppress Edge's native reveal button.

### E. Password-strength copy reads as advice, not rejection (#8)

**Diagnosis:** `reset-password/page.tsx` and `ClaimAuthGate.tsx` (signup form) display "Password is too weak. Try a longer phrase or mix of words." The user asked for clearer rejection copy.

**Planned fix:** Change to "That password is too weak — add another word or two. Uncommon words are stronger." everywhere `password_too_weak` renders.

### F. Remove `@` clarification copy (#1 sub)

**Diagnosis:** `CredentialSetupForm.tsx` done-state shows "enters their username (not starting with @)" — the `@` is no longer displayed anywhere in the setup flow (fixed in prior rounds), so the note is confusing.

**Planned fix:** Remove the parenthetical `(not starting with @)` clarification. The defensive `@`-strip in the login route stays unchanged.

### G. PIN field length cap

**Diagnosis:** The confirm-PIN field in `CredentialSetupForm.tsx` lacks `maxLength={6}`. The child login PIN field also lacks `maxLength`. `inputMode="numeric"` is present on login PIN but missing on confirm PIN.

**Planned fix:** Add `maxLength={6}` to confirm-PIN field in `CredentialSetupForm.tsx`. Add `maxLength={6}` to the PIN input in `students/login/page.tsx`.

### H. Weak-PIN retry: no button feedback (#7)

**Diagnosis:** `handleSubmit` in `CredentialSetupForm.tsx` calls `setBusy(true)` AFTER client-side PIN validation. So when the user retries a weak PIN, the button stays as "Set up login" with no in-progress feedback.

**Planned fix:** Move `setBusy(true)` + `setError(null)` to the top of `handleSubmit`, add `setBusy(false)` to early-return paths so the button briefly shows "Setting up…" even for client-side failures.

### I. Child-session clarity callout wording (#13)

**Diagnosis:** `account/dashboard/page.tsx` shows "you don't need to log out first. Your accounts are separate." — copy is accurate but the framing invites doubt ("log out? wait, what?").

**Planned fix:** Reword to "Your child signs in with their own username + PIN — it's a separate login from yours, so you can both be signed in at once."

### J. Device-count refresh (#11) — VERIFIED, no fix

**Diagnosis:** `src/app/account/children/[id]/devices/DeviceRevokeButtons.tsx` already calls `router.refresh()` after every revoke. This updates the device list/count in the acting tab without a manual reload. Verified correct.

**No code change.** Cross-tab live sync (revoke tab A → watch tab B) remains out of scope; backlogged.

---

## Round 4 — pending (from round-3 re-read, Andrew 2026-06-02)

> **Status:** **PENDING** — design **LOCKED** in [`identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) § IAC refinements — 2026-06-02 (**IAC-7**, **IAC-11**). Dispatch with **P2 multi-tutor + accessMode/family-id** build on `identity-p2b-ui`. **Supersedes** round-3 items **E**, **F**, and **I** where noted below.

### E. Password-strength copy — method-agnostic (supersedes round-3 E)

**Locked UX (Andrew 2026-06-02):**

- **On rejection:** headline **"That password is too weak."** + bullet list of suggestions:
  - Make it longer
  - Mix unrelated words, numbers, and symbols
  - Avoid common words and names
  - Or let a password manager generate one for you
- **Up front (not only on failure):** show requirements under the field — **minimum 10 characters** + strength meter must reach **"Good" or better** before submit.
- **Scope:** all adult-password surfaces — AccountHolder signup, forgot/reset, claim signup (`ClaimAuthGate`), tutor signup/setup/reset (shared validator component).

**Note:** round-3 E's single-sentence "add another word or two" copy is **superseded** by the above.

### F. `@` clarification — superseded by family-id (IAC-7)

Round-3 **F** removed "(not starting with @)" because `@` was decorative. **IAC-7** re-introduces `@` as the **required** separator in `username@familyid`. **Do not** re-apply round-3 F as written; round-4 child-login + credential-setup UX must teach the **full handle** (family id assigned lazily at first `child_pin_required` setup).

### G. PIN field length cap — audit ALL PIN inputs (extends round-3 G)

**Locked (Andrew 2026-06-02):** audit **every** PIN input across the app and apply consistently:

| Surface | File(s) (starting points) |
|---|---|
| Credential setup PIN + confirm | `src/app/claim/[token]/setup/CredentialSetupForm.tsx` |
| Child login PIN | `src/app/students/login/page.tsx` |
| Parent change-child-PIN | account children flow (`ChangePinForm` or equivalent) |

**Required attributes:** `maxLength={6}`, `inputMode="numeric"` on **all** PIN fields (round-3 G only partially covered setup confirm + login).

### I. Child-session copy — fully independent login (supersedes round-3 I)

**Locked framing (Andrew 2026-06-02):** child login is **fully independent** — own device, **`username@familyid` + PIN**, separate from the parent's AccountHolder account. **Drop** round-3 I wording *"you can both be signed in at once"* (implies parent session state matters). Copy must reflect **`accessMode`** (`child_pin_required` vs `account_holder_session` fast-follow).

**Surfaces:** account dashboard child hand-off, post-setup success screen, `/students/login` intro copy.

### Cross-reference

Full IAC ledger (IAC-1..IAC-11): [`identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) § IAC refinements — 2026-06-02. Spine: [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) decisions ledger + sub-pass tracker row **Identity P2 — multi-tutor…**.
