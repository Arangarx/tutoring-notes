# Session Wrong-Identity Fix — Design + Ratify Questions (P0)

> **Design date:** 2026-06-05
> **Branch:** `v1-redesign` (HEAD `f985f71` at authoring)
> **Status:** **AWAITING-ANDREW-RATIFY**
> **Authored by:** Composer-authored from Opus scope blob + Sonnet investigation
> **Deliverable type:** Design / ratify document only — no production code, no migrations applied
> **Prerequisite reads:**
> 1. [`docs/handoff/identity-phase2-auth-session-design-2026-06-01.md`](identity-phase2-auth-session-design-2026-06-01.md) — AccountHolder realm, connect-link identity interstitial (P2 acceptance)
> 2. [`src/lib/public-url.ts`](../../src/lib/public-url.ts) — `getPublicBaseUrl()` vs `getRequestBaseUrl()`
> 3. [`src/lib/account-holder-session.ts`](../../src/lib/account-holder-session.ts) — cookie build, session create/revoke
> 4. [`src/lib/server-session.ts`](../../src/lib/server-session.ts) — server-component session resolution
> 5. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) — P0 investigation context (do not edit as part of fix dispatch)

---

## Executive summary

A P0 investigation found that an AccountHolder (parent) session can resolve to the **wrong account** during the tutor-initiated claim flow. Observed repro: tutor created parent Account A and verified email; created parent Account B and verified email (most recent); opened a claim link — the claim identity interstitial showed **A's** identity, not B's.

**Severity:** Same person, same browser, two of their own accounts — **not** cross-user or cross-device. The primary root cause is **preview-only** (Vercel per-deployment URL vs branch-alias domain split). Production is safe today because it has a single stable canonical domain. A secondary cause is environment-agnostic but timing-dependent (Set-Cookie on a cross-site redirect under `SameSite=Strict`).

This document captures root cause, fix options with tradeoffs, and **four ratify questions** for Andrew. The orchestrator will dispatch execution once Andrew replies **"ratify defaults"** or picks per question.

---

## Root cause

### RC-A — Vercel preview URL domain split (primary, preview-only)

On Vercel preview deployments, the signup API builds the verify-email link from `getPublicBaseUrl()` ([`signup/route.ts:107`](../../src/app/api/auth/account-holder/signup/route.ts)), which returns the per-deployment `VERCEL_URL` ([`public-url.ts:20-25`](../../src/lib/public-url.ts)) — a **different cookie domain** than the stable branch-alias URL the user actually browses on.

When parent B verifies email, B's `mynk_ah_session` cookie is deposited on the `VERCEL_URL` domain. Parent A's older cookie (from a direct login on the branch-alias domain) persists on the branch-alias domain untouched. Returning to the branch-alias claim link reads A's cookie.

Claim invite links are relative: [`claim-invites/route.ts:90`](../../src/app/api/students/[studentId]/claim-invites/route.ts) returns `/claim/<token>`, resolved against whatever host the tutor's browser is on — so the tutor and parent can operate on different effective cookie stores on preview.

**Production impact:** None today — single canonical domain means one cookie jar.

### RC-B — Set-Cookie on a cross-site redirect (secondary, any env, timing-dependent)

[`verify-email/route.ts:90-92`](../../src/app/verify-email/route.ts) sets the session cookie on a `NextResponse.redirect` (307) response to a **cross-site navigation** (the email link click from the user's mail client). With `SameSite=Strict`, A's old cookie was **not sent** to `/verify-email`, so it stays in the browser store. In Edge and some Chromium builds, `Set-Cookie` on a redirect response may not be committed before the browser dispatches the follow-up same-site request → A's preserved cookie is sent to `/claim/<token>` and resolves A.

Additional edge: re-clicking an already-consumed verify link ([`verify-email/route.ts:48-52`](../../src/app/verify-email/route.ts)) redirects to `/account/login` with **no** `Set-Cookie` at all, leaving A active.

### Sub-issue — first-match cookie scan (server-component vs route-handler split)

[`buildRequestFromHeaders()`](../../src/lib/server-session.ts) (`server-session.ts:20-28`) joins all cookies into a string and builds a plain `Request`. [`getCookieFromRequest()`](../../src/lib/account-holder-session.ts) (`account-holder-session.ts:207-213`) then does a **first-match** linear scan on that string. Route handlers using `NextRequest` get the `@edge-runtime/cookies` Map API (**last value**). If two `mynk_ah_session` cookies ever reach the server (possible after RC-A), server components and route handlers can disagree on identity.

---

## 5-axis reliability-bar note

This is an auth/identity change — brief pass against the five axes:

| Axis | Relevance |
|---|---|
| **Data integrity** | Wrong identity on claim can bind learners to the wrong parent account — high integrity risk even though blast radius is same-browser today. |
| **Failure visibility** | Bug manifests as silent wrong identity on the interstitial; user may proceed without noticing until post-bind. Fix must make "signed in as X" reliably match the account just verified. |
| **Recovery** | Revocation on verify + correct cookie establishment gives a clean reset path; no DB repair needed for the stale-cookie case. |
| **Concurrency / timing** | RC-B is explicitly a redirect-timing race; the same-site intermediate page addresses ordering. |
| **Operational / env parity** | Preview-only RC-A must not lull us into skipping prod-safe patterns; fix should work on preview **and** production. |

BLOCKER for claim-flow acceptance: hardware repro below must pass before merge.

---

## Decisions for Andrew

Reply **"ratify defaults"** to accept all **RECOMMENDED** options, or specify per question (e.g. "Q1=A, Q2=B, Q3=default, Q4=default").

### Q1 — How to establish the session cleanly (RC-A + RC-B combined)

| Option | Description | Tradeoffs |
|---|---|---|
| **A — Same-site intermediate page** | `/verify-email` validates the token, then redirects to a same-site page on the **same host the user is on** (e.g. `/auth/verify-done`). That page establishes `mynk_ah_session` via a clean top-level same-site response (not on a cross-site redirect hop). | Fixes RC-B redirect-cookie timing. Sidesteps RC-A by always setting the cookie on the host the user is actually using. Small UX hop (one extra page load). |
| **B — Build verify link from `getRequestBaseUrl()`** | Use request Host at signup time instead of `getPublicBaseUrl()`. | Simpler diff, but **host-header-injection risk** — the existing `getPublicBaseUrl` comment exists precisely to avoid poisoning verification links from attacker-controlled Host. Unsafe as primary fix. |
| **C — Pin single canonical preview domain** | Force all preview traffic + email links to one stable alias. | Reduces RC-A on preview but does not fix RC-B timing; adds env/config ceremony; still vulnerable on any multi-domain setup. |

**RECOMMENDED: A** — Same-site intermediate page. B's injection surface disqualifies it as primary; C is incomplete without A or equivalent.

---

### Q2 — Defense-in-depth: session revocation

| Option | Description | Tradeoffs |
|---|---|---|
| **A — Revoke on email-verify only** | Call `revokeAllAccountHolderSessions(accountHolder.id)` before `createAccountHolderSession` on **email-verify** (fresh-account establishment). | Clean, low blast radius. Caps same-account stale sessions. Does **not** alone fix cross-account stale cookies (different account IDs) — pairs with Q1. |
| **B — Also revoke on every login** | Same revocation on password login. | Enforces single-active-session-per-account. **PRODUCT CALL:** logs the parent out of other devices (phone + laptop). |
| **C — None** | Skip revocation hygiene. | Leaves stale DB session rows; no mitigation for same-account multi-tab edge cases. |

**RECOMMENDED: A** — Revoke on verify only. Flag **B** as Andrew's product call if single-session enforcement is desired later.

---

### Q3 — Sub-issue: `buildRequestFromHeaders` cookie resolution

| Option | Description | Tradeoffs |
|---|---|---|
| **A — Map API, last value** | Read cookie directly via `cookies().get(AH_SESSION_COOKIE)` (Map API, last value) and pass the raw value to a slimmer validator; remove first-match vulnerability. | Pure correctness fix; aligns server components with route handlers. No product tradeoff. |

**RECOMMENDED: A** — Just do it.

---

### Q4 — `SameSite=Strict` → `Lax` timing

Andrew previously ratified relaxing to `Lax` (for legit email/SMS claim links opened in a fresh tab). Investigation shows **Lax does NOT fix this bug** and makes wrong-identity show **sooner** (Lax sends A's cookie on the first cross-site claim click).

| Option | Description | Tradeoffs |
|---|---|---|
| **A — Defer Lax until wrong-identity fix lands** | Keep `SameSite=Strict` through the Q1 fix; apply Lax as a **follow-on** once session establishment is reliable. | Legit fresh-tab claim links remain slightly harder until follow-on; avoids amplifying wrong-identity. |
| **B — Apply Lax now** | Ship Lax before or with partial fix. | Wrong-identity repro becomes easier; undermines interstitial trust. |

**RECOMMENDED: A** — Confirm defer-then-apply: **KEEP Strict until Q1 ships; THEN Lax** as safe follow-on for cross-tab claim links.

---

## Proposed execution plan (post-ratification)

Assumes defaults (Q1=A, Q2=A, Q3=A, Q4=A). Composer 2.5 dispatch on `v1-redesign`.

### Files touched (by decision)

| Decision | Files |
|---|---|
| **Q1-A** | New `src/app/auth/verify-done/route.ts` (or page + route handler); [`src/app/verify-email/route.ts`](../../src/app/verify-email/route.ts) — validate only, redirect to intermediate with one-time token or session-establishment nonce; [`src/lib/account-holder-session.ts`](../../src/lib/account-holder-session.ts) — helper to set cookie on same-site response |
| **Q2-A** | [`src/app/verify-email/route.ts`](../../src/app/verify-email/route.ts) or verify-done handler — call `revokeAllAccountHolderSessions` before `createAccountHolderSession` |
| **Q3-A** | [`src/lib/server-session.ts`](../../src/lib/server-session.ts) — stop building fake `Request`; read cookie via Map API; [`src/lib/account-holder-session.ts`](../../src/lib/account-holder-session.ts) — optional slim `validateAccountHolderSessionFromRawToken(raw: string)` |
| **Q4-A** | **No change in this PR** — document follow-on ticket for Lax after smoke pass |

### Tests

- Unit: cookie resolution uses last value when duplicate names present in joined header (regression for Q3).
- Unit/integration: verify-done sets cookie on same-origin GET (not on redirect from mail client).
- Integration: `revokeAllAccountHolderSessions` called before create on verify path.

### Smoke / hardware repro (must defeat)

On Vercel **preview** (branch alias + email verify link domain split):

1. Create parent Account A → verify email (direct login on branch alias if needed).
2. Create parent Account B → verify email (most recent).
3. Tutor mints claim link; open on branch alias.
4. **Assert:** identity interstitial shows **B**, not A.
5. Repeat with **fresh tab** (simulate email click) and **paste-over** (same tab) — both must show B.
6. Re-click consumed B verify link → assert no regression to A on subsequent claim.

Also run once on production-like single-domain local dev to confirm no regression.

### Merge gate

- `npx jest` green on touched tests.
- `npx next build` if route surface changes.
- Andrew hardware smoke on preview before `merge --no-ff` to master.

---

## What we are NOT doing tonight (and why)

**No code changes overnight.** Q1 has a security tradeoff (host-header injection vs intermediate page). Q2-B is a product call (multi-device logout). Q4 reverses a prior ratification pending new evidence. Andrew ratifies in the morning; orchestrator dispatches execution after confirmation.

---

## Ratification record

| Field | Value |
|---|---|
| **Awaiting** | Andrew — reply in orchestrator chat |
| **Quick path** | `"ratify defaults"` → Q1=A, Q2=A, Q3=A, Q4=A |
| **After ratify** | Orchestrator dispatches Composer 2.5 fix branch; no further design pass unless Andrew picks non-default options with new tradeoffs |

## RC-A follow-up — addressed by `fix/verify-email-host-align`

Branch `fix/verify-email-host-align` (off `v1-redesign`) ships the targeted RC-A fix with an injection-guard:

- **Approach**: `getRequestBaseUrlSafe(req: NextRequest)` in `src/lib/public-url.ts` reads the request host from `x-forwarded-host` / `host` headers, validates it against `ALLOWLISTED_HOST_PATTERNS` (project-scoped; team slug in Vercel preview pattern), and reflects it into the verify-email link. Unrecognised hosts fall back to `getPublicBaseUrl()` — never reflected. This is Q1=B from the design table, but with the host-header injection guard that the design doc noted was missing. The guard makes Q1=B safe while being simpler than the Q1=A intermediate-page approach (which is still in place for RC-B timing — both fixes coexist).
- **Files changed**: `src/lib/public-url.ts` (new `isHostAllowlisted`, `getRequestBaseUrlSafe`), `src/app/api/auth/account-holder/signup/route.ts` (use `getRequestBaseUrlSafe` for verify URL), `src/__tests__/public-url-allowlist.test.ts` (31 tests including injection-guard cases).
- **Platform assumption**: documented in `docs/PLATFORM-ASSUMPTIONS.md` §5.8.
- **CSP/middleware**: no change required — the fix only changes which host appears in an outgoing email link, not any network origin the browser loads.
- **Prod behavior**: unchanged — on production, the request host is `usemynk.com` (allowlisted), so `getRequestBaseUrlSafe` returns `https://usemynk.com`, identical to what `getPublicBaseUrl()` would have returned.
- **Password-reset / forgot-password**: unchanged — those routes keep `getPublicBaseUrl()` because there is no session-cookie alignment requirement for password-reset links.
