# usemynk.com brand-domain cutover — executor briefing (OPS + small repo)

> **Recommended model: Composer 2.5** (well-patterned OPS runbook: DNS/Vercel/Google Console steps Andrew performs by hand, plus a few repo/doc/env updates with clear file:line anchors. No novel architecture.)
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh Composer chat, your instructions are below — start by reading `AGENTS.md` and the files in **Read first**, then walk Andrew through the steps in order. **Do not flip production `NEXTAUTH_URL` or DNS until the cutover window** (see **Cutover ordering**). No further confirmation needed to begin prep work (OAuth pre-registration, repo doc updates on a branch).

## Workspace + branch discipline

- **Repo:** `tutoring-notes` (this workspace).
- **This briefing’s doc-only branch** (already landed or in flight): `docs/usemynk-cutover-bootstrapper` — bootstrapper + BACKLOG pointer only.
- **Cutover execution branch** (when Andrew schedules the milestone): create e.g. `ops/usemynk-domain-cutover` off current `master`; repo changes below commit there; Andrew runs dashboard/DNS steps in parallel; **smoke on `https://usemynk.com` before merge**.
- **Do not smoke OAuth/login changes on `tutoring-notes.vercel.app` after `NEXTAUTH_URL` has been flipped to `usemynk.com`** — that host will no longer match session cookies.
- Per `AGENTS.md` merging convention: branch → push → Andrew smokes → `git merge --no-ff` to `master` (no PR required for solo pilot).

## Objective

Point the brand primary domain **`usemynk.com`** at the **current** Vercel production deployment (today: default host **`tutoring-notes.vercel.app`**, no custom domain on the project yet), update public-origin env (`NEXTAUTH_URL`), Google OAuth authorized domain + redirect URIs, and a small set of repo artifacts (`security.txt`, platform docs). **Outcome:** tutors and Sarah use `https://usemynk.com` as the canonical app URL; `tutoring-notes.vercel.app` may remain reachable as a Vercel alias until explicitly removed.

## Owner / status

| Field | Value |
|-------|--------|
| **Owner** | Andrew (DNS, Vercel, Google Cloud Console); Composer (repo edits, smoke script, verification commands) |
| **Status** | Ready for **Phase 0 pre-register** anytime; **Phase 1 cutover** is a scheduled milestone (not blocking SEC-1) |
| **Prereqs** | Cloudflare access for `usemynk.com` DNS; Vercel project admin; Google Cloud OAuth client admin; cutover window outside Sarah’s live session |

## Read first (ground truth)

| Doc / file | Why |
|------------|-----|
| [`docs/DEPLOY.md`](../DEPLOY.md) | `NEXTAUTH_URL` semantics (`:22`) |
| [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) | §4.3 Google OAuth, §5.1 whiteboard relay CSP, §5.5 NextAuth domain (`:247-249`) |
| [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) | Consent screen stays **Mortensen Apps** + `www.mortensenapps.com` policy URLs (`:36-50`); authorized domains today |
| [`docs/GOOGLE-OAUTH-VERIFICATION.md`](../GOOGLE-OAUTH-VERIFICATION.md) | Testing mode; adding domain ≠ full re-verification for `gmail.send` |
| [`docs/MYNK-BRAND-CAPTURE-CHECKLIST.md`](../MYNK-BRAND-CAPTURE-CHECKLIST.md) | **`usemynk.com` registered via Cloudflare Registrar** (`:13-21`) — DNS UI is **Cloudflare**, not assumed generic registrar |
| [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md) | Gmail vs NextAuth Google callbacks (`:409-414`) |
| [`public/.well-known/security.txt`](../../public/.well-known/security.txt) | Canonical URL today (`:13`) |
| [`src/app/api/auth/gmail/connect/route.ts`](../../src/app/api/auth/gmail/connect/route.ts) | `redirectUri` built from `NEXTAUTH_URL` (`:36-37`) |
| [`src/middleware.ts`](../../src/middleware.ts) | CSP emitted site-wide (`:31-33`, `:41`) |
| [`src/lib/security/csp.ts`](../../src/lib/security/csp.ts) | `connect-src` origins — relay only, not Google OAuth (`:176-201`) |

## Decision / sequencing (SEC-1 independence)

- **SEC-1 ships on `tutoring-notes.vercel.app`.** This cutover does **not** block SEC-1 branch work, merge, or smoke.
- **Cheap overlap (do now, ~15 min):** In Google Cloud Console, **pre-register** `usemynk.com` as an **Authorized domain** and add **redirect URIs** for the new host **without** changing DNS or `NEXTAUTH_URL`. Zero user impact; avoids cutover-day surprise.
- **Cutover milestone (later):** Vercel custom domain + DNS + SSL verify → add redirect URIs if not done → flip Production `NEXTAUTH_URL` → repo `security.txt` + `PLATFORM-ASSUMPTIONS` → smoke → Sarah comms.
- **Do not** change OAuth consent screen **privacy/terms/homepage** URLs — they remain `https://www.mortensenapps.com/*` per [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) `:44-47`. Product domain change does **not** change canonical legal source.

### Andrew-confirm (if anything drifted since brand capture)

| Item | Expected from repo docs | Action if different |
|------|-------------------------|-------------------|
| DNS host for `usemynk.com` | **Cloudflare** (Registrar + DNS) per [`docs/MYNK-BRAND-CAPTURE-CHECKLIST.md`](../MYNK-BRAND-CAPTURE-CHECKLIST.md) `:13-21` | If nameservers/registrar moved, substitute the correct dashboard in all **[Andrew-manual]** steps |
| Vercel project name | **`tutoring-notes`** (default URL `tutoring-notes.vercel.app` per [`public/.well-known/security.txt`](../../public/.well-known/security.txt) `:13`) | Confirm in Vercel dashboard before adding domains |
| Production `NEXTAUTH_URL` today | **`https://tutoring-notes.vercel.app`** (expected) | Vercel → Project → Settings → Environment Variables → **Production** — record actual value before cutover |

---

## Pre-flight checklist (Andrew confirms before Phase 1)

- [ ] **Cloudflare login** can edit DNS for `usemynk.com` (and Registrar renewal is current).
- [ ] **Vercel** team/project access for `tutoring-notes`; no other production cutover in flight.
- [ ] **Google Cloud Console** access to the shared **Mortensen Apps** OAuth client (same `GOOGLE_CLIENT_ID` as production).
- [ ] **Production `NEXTAUTH_URL`** noted from Vercel (see table above).
- [ ] **Sarah / pilot window:** no live tutoring session during `NEXTAUTH_URL` flip (invalidates cookies — re-login required). Prefer a known-quiet block.
- [ ] **SEC-1:** if merged, confirm whether `/api/auth/callback/google` redirect is already in Console; if not, include in pre-register + cutover lists.
- [ ] **Rollback plan understood** (see **Rollback**): can revert `NEXTAUTH_URL` + keep DNS if needed.

---

## Phase 0 — Pre-register OAuth (anytime, no DNS)

Do this **before** cutover day so the first Google login on `usemynk.com` works.

### Step 0.1 — Authorized domain

**[Andrew-manual: Google Cloud Console]**

1. Open [Google Cloud Console → APIs & Services → OAuth consent screen → Branding](https://console.cloud.google.com/apis/credentials/consent) (project with **Mortensen Apps** app).
2. Under **Authorized domains**, **Add domain:** `usemynk.com`  
   - Enter **apex only** (`usemynk.com`), not `www.usemynk.com`, unless Google’s UI requires both (add `www` only if redirect URIs use `www`).
3. **Save.**

**Expected:** Domain list includes existing `tutoring-notes.vercel.app`, `mortensenapps.com`, and new `usemynk.com` (per [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) `:48-49` snapshot).

**Verify:** Branding tab shows `usemynk.com` without validation errors.

> **Re-verification:** Adding authorized domain + redirect URI for **non-sensitive** admin scopes (`openid email profile`) and existing **`gmail.send`** callback does **not** by itself require a new verification round while the app stays in **Testing** mode ([`docs/GOOGLE-OAUTH-VERIFICATION.md`](../GOOGLE-OAUTH-VERIFICATION.md)). Do **not** change registered privacy/terms URLs to `usemynk.com`.

### Step 0.2 — Redirect URIs (add; do not remove old yet)

**[Andrew-manual: Google Cloud Console → Credentials → OAuth 2.0 Client IDs]**

Select the client used by production (`GOOGLE_CLIENT_ID` in Vercel). Under **Authorized redirect URIs**, **add**:

| Purpose | Redirect URI |
|---------|----------------|
| Gmail connect (existing flow) | `https://usemynk.com/api/auth/gmail/callback` |
| NextAuth Google admin login (SEC-1) | `https://usemynk.com/api/auth/callback/google` |

**Keep** existing URIs on `tutoring-notes.vercel.app` until cutover is stable ([`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md) `:414`).

**Verify:** URI list shows both hosts for each path you use in production.

**Code anchor:** Gmail `redirectUri` is `${NEXTAUTH_URL}/api/auth/gmail/callback` — [`src/app/api/auth/gmail/connect/route.ts`](../../src/app/api/auth/gmail/connect/route.ts) `:36-37`; callback route uses same base — [`src/app/api/auth/gmail/callback/route.ts`](../../src/app/api/auth/gmail/callback/route.ts) `:36`.

---

## Phase 1 — Cutover (ordered)

### Cutover ordering (avoid breakage)

```text
1. Vercel: add usemynk.com (+ www) → wait Valid Configuration + SSL
2. DNS at Cloudflare → point to Vercel → wait resolve + SSL active on custom host
3. Smoke https://usemynk.com (pages only, OLD NEXTAUTH_URL still on vercel.app) — optional sanity
4. Google: confirm Phase 0 URIs/domains (if skipped, do now BEFORE step 5)
5. Vercel Production: NEXTAUTH_URL = https://usemynk.com → Redeploy
6. Repo: security.txt Canonical + PLATFORM-ASSUMPTIONS domain row → commit on cutover branch
7. Full smoke on https://usemynk.com (login, Gmail, whiteboard, upload, share link)
8. Sarah comms + bookmark; schedule vercel.app alias removal later if desired
```

**Critical:** Step **5** invalidates existing session cookies for all users ([`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) `:247-249`). Schedule off Sarah’s session.

**Preview env note:** Branch previews use per-host cookies. For preview OAuth testing, either keep preview `NEXTAUTH_URL` on the preview hostname **or** add that preview host’s callback URIs in Google (same client). Production cutover does **not** require changing Preview `NEXTAUTH_URL` unless you want previews on a `usemynk` subdomain — **default: leave Preview on `*.vercel.app`**.

---

### Step 1.1 — Add custom domains in Vercel

**[Andrew-manual: Vercel Dashboard]**

1. Project **`tutoring-notes`** → **Settings** → **Domains**.
2. **Add** `usemynk.com` (apex).
3. **Add** `www.usemynk.com` (recommended).
4. Set **`www.usemynk.com` → redirect to `usemynk.com`** (Vercel “Redirect to primary” / 308 to apex) so one canonical origin for `NEXTAUTH_URL`.

**Expected:** Vercel shows **Invalid Configuration** until DNS is correct, then **Valid Configuration** with certificate **Ready**.

**Verify:** Domains list shows both; apex is primary for redirects.

---

### Step 1.2 — DNS at Cloudflare

**[Andrew-manual: Cloudflare Dashboard → usemynk.com → DNS]**

Registrar is Cloudflare per brand capture; DNS records should be edited in **the same Cloudflare account** that holds the domain.

**Apex `usemynk.com` (choose one per Vercel’s Domains UI instructions):**

| Vercel instruction | Cloudflare record | Value |
|--------------------|-------------------|--------|
| **A record** (common) | `A` `@` | `76.76.21.21` (Vercel apex IP — **confirm current IP in Vercel Domains UI**; do not trust stale docs) |
| **ALIAS / CNAME flattening** | `CNAME` `@` | `cname.vercel-dns.com` (only if Vercel shows CNAME-at-apex for this project) |

**`www`:**

| Type | Name | Value |
|------|------|--------|
| `CNAME` | `www` | `cname.vercel-dns.com` (or the exact target Vercel displays) |

**Proxy status:** Cloudflare **orange cloud (proxied)** is OK for Vercel; if SSL handshake issues appear, try **DNS only (grey cloud)** temporarily for debugging.

**TTL:** Use **Auto** or **300s** during cutover; raise to **1h+** after stable.

**Propagation:** Often **minutes**; worst case **24–48h**. Use `dig usemynk.com` / [https://dnschecker.org](https://dnschecker.org) from multiple regions.

**Verify:**

- `dig usemynk.com` resolves to Vercel.
- Vercel Domains → **Valid Configuration**, certificate issued.
- Browser: `https://usemynk.com` loads the app (may still behave oddly for auth until step 1.5).

---

### Step 1.3 — CSP / Google OAuth (expect no code change)

Google OAuth (Gmail connect + NextAuth Google) uses **full-page navigations** to `https://accounts.google.com`, not `fetch()`/`iframe` to Google origins. Site CSP is built in [`src/lib/security/csp.ts`](../../src/lib/security/csp.ts) `:176-201` (`connect-src` includes relay + Vercel Blob, **not** `accounts.google.com`). Middleware applies it globally — [`src/middleware.ts`](../../src/middleware.ts) `:31-33`, `:41`.

**[repo change]** None expected for domain cutover.

**Verify (cutover smoke):**

1. DevTools → Network: **Connect Gmail** completes redirect chain without CSP console errors on `usemynk.com`.
2. If SEC-1 live: **Sign in with Google** admin path same check.
3. Whiteboard session: WebSocket to `WHITEBOARD_SYNC_URL` (e.g. `wss://wb.mortensenapps.com`) connects — CSP `connect-src` unchanged by app hostname ([`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) `:205-214`).

`next.config.ts` also sets CSP headers — keep middleware + config in sync if you ever add origins ([`next.config.ts`](../../next.config.ts) header comment `:33-34` mirrors `csp.ts`).

---

### Step 1.4 — Flip `NEXTAUTH_URL` (Production)

**[Andrew-manual: Vercel → Environment Variables → Production]**

| Variable | New value |
|----------|-----------|
| `NEXTAUTH_URL` | `https://usemynk.com` |

**Do not** change `NEXTAUTH_SECRET`. **Redeploy** production (empty commit or “Redeploy” in Vercel).

**Anchor:** [`docs/DEPLOY.md`](../DEPLOY.md) `:22`; [`.env.example`](../../.env.example) `:35-36`.

**Verify:**

- `https://usemynk.com/login` loads; password login works.
- Password reset email links (if SMTP configured) use `https://usemynk.com/...` host.
- Existing tab on `tutoring-notes.vercel.app` requires sign-in again after flip.

---

### Step 1.5 — Repo updates (Composer on cutover branch)

**[repo change]**

1. **`public/.well-known/security.txt`**
   - Update `Canonical:` to `https://usemynk.com/.well-known/security.txt` (`:13`).
   - Update body copy referencing production URL (`:17-18`) to include `https://usemynk.com` (keep mortensenapps umbrella sentence if still accurate).

2. **`docs/PLATFORM-ASSUMPTIONS.md`**
   - Quick reference **Domain** row (`:22`): note primary `https://usemynk.com`, legacy `tutoring-notes.vercel.app`.
   - §4.3 / §5.5 migration checks: mention cutover date if edited.

3. **Optional hygiene (same commit if touching):**
   - [`docs/DEPLOY.md`](../DEPLOY.md) examples still valid; add one line that production canonical is `usemynk.com` when cutover complete.
   - [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) **Operational snapshot** table (`:48-49`): add `usemynk.com` authorized domain when true — **do not** change consent screen policy URLs.

**Verify:** `curl -s https://usemynk.com/.well-known/security.txt` shows new `Canonical:` line.

---

## Smoke checklist — `https://usemynk.com` (after step 1.4–1.5)

Run on **desktop Chrome** (Sarah’s primary); add **iPhone Safari** spot-check if time.

| # | Check | Pass criteria |
|---|--------|----------------|
| 1 | **TLS + load** | Padlock valid; home/login renders |
| 2 | **Password login** | Tutor account signs in; session persists on refresh |
| 3 | **Google admin login** (if SEC-1 merged) | `Sign in with Google` → return to app logged in ([`sec-1-impersonation-design`](sec-1-impersonation-design-2026-05-30.md) `:410`) |
| 4 | **Connect Gmail** | Settings → Connect Gmail → consent → return without `redirect_uri_mismatch` |
| 5 | **Whiteboard relay** | Start WB session; student join or solo; no CSP WebSocket errors ([`csp.ts`](../../src/lib/security/csp.ts) `:68-70`) |
| 6 | **Recording upload** | Short record or upload; transcribe path reaches server (grep `rid=` if failure) |
| 7 | **Share link** | Open existing parent share URL; still resolves (token path, not hostname-dependent) |
| 8 | **security.txt** | `Canonical` and `Contact` correct |

**Failure triage:**

- `redirect_uri_mismatch` → Google redirect URI list / `NEXTAUTH_URL` typo / `http` vs `https`.
- Login loop → `NEXTAUTH_URL` mismatch with browser bar host.
- WB disconnect → CSP/env `WHITEBOARD_SYNC_URL`, not domain (unless env wrong on redeploy).

---

## Rollback

| Action | How | Blast radius |
|--------|-----|----------------|
| **Fast auth rollback** | Vercel Production `NEXTAUTH_URL` → `https://tutoring-notes.vercel.app`; redeploy | All users signed out again; Gmail OAuth works on vercel.app host |
| **DNS rollback** | Remove or repoint Cloudflare records; remove custom domain in Vercel | `usemynk.com` stops serving app; bookmarks break until restored |
| **Google** | Leave `usemynk.com` URIs in place (harmless) or remove after stable rollback | — |

**Keep** `tutoring-notes.vercel.app` on OAuth redirect URIs until Andrew explicitly retires that host.

---

## Legal / ops follow-ups (post-cutover)

| Item | Notes |
|------|--------|
| **LEGAL-SYNC quarterly review** | Re-confirm consent screen still uses `www.mortensenapps.com/privacy` + `/terms` ([`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) `:73-77`); product `/privacy` + `/terms` facades stay subordinate |
| **Sarah comms** | New bookmark `https://usemynk.com`; expect one re-login after cutover |
| **Resend / transactional email** | Sending from `@usemynk.com` is a **separate** milestone — see [`docs/BACKLOG.md`](../BACKLOG.md) (email-infrastructure / account-takeover rows); not required for app hostname cutover |
| **Optional later** | Redirect `tutoring-notes.vercel.app` → `usemynk.com` in Vercel; update marketing/socials |

---

## Done criteria / acceptance

- [ ] `https://usemynk.com` is **Valid Configuration** in Vercel with working SSL.
- [ ] Production `NEXTAUTH_URL` = `https://usemynk.com`.
- [ ] Google **Authorized domains** includes `usemynk.com`; redirect URIs include Gmail (+ Google admin if SEC-1 live) on `https://usemynk.com/...`.
- [ ] Smoke table above **all pass** on production.
- [ ] `public/.well-known/security.txt` `Canonical` points at `usemynk.com`.
- [ ] `docs/PLATFORM-ASSUMPTIONS.md` domain row updated.
- [ ] Sarah notified; no open production incident from session invalidation.

---

## Wrap-up (executor)

1. Post smoke results + Vercel deployment URL for `usemynk.com` in handoff chat.
2. List any **Andrew-confirm** deltas (registrar, Vercel project name, actual `NEXTAUTH_URL` before flip).
3. Do **not** remove `tutoring-notes.vercel.app` from Google or Vercel until Andrew approves a follow-up cleanup task.

## Stop conditions

- DNS registrar is **not** Cloudflare and Andrew has not provided replacement DNS access → stop after Phase 0 OAuth pre-register; document blocker.
- Vercel custom domain stuck **Invalid Configuration** > 24h → stop; collect Vercel DNS instructions + `dig` output; do not flip `NEXTAUTH_URL`.
- Google Console blocks `usemynk.com` authorized domain → capture screenshot/error; do not flip `NEXTAUTH_URL`.
