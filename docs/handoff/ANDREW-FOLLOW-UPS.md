# Andrew follow-ups — drop-in checklist

> **For you when you're back after a gap.** Agents keep this current. Code work continues without waiting on these unless a row says "blocks code."

**Last refreshed:** 2026-09-17 (Tyson Connect: Console URIs added; Connect uses tab host — `NEXTAUTH_URL` unchanged)  
**Canonical priorities:** [`docs/BACKLOG.md`](../BACKLOG.md) § Release priorities (option B)  
**Living orchestrator state:** [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md)  
**Calendar wave plan:** [`CALENDAR-WAVE-PLAN.md`](CALENDAR-WAVE-PLAN.md)

---

## Do these when you have 15–30 minutes (Google Cloud Console)

**Andrew-only.** Check in this order (blast radius first):

| Order | Action | Why |
|-------|--------|-----|
| **1 — Clients** | [Credentials / OAuth clients](https://console.cloud.google.com/apis/credentials) — how many clients; do Sign-In, Gmail connect, and Calendar connect share one client? | `gmail.send` already verified 2026-05-30 on the Mortensen Apps client — scope changes may affect other apps under the umbrella |
| **2 — Verification Center** | Per-check status (Home, Branding, Privacy, App functionality, Data access, Minimum scopes) | Determines whether calendar resubmit is a narrow scope fix or other fronts still open |
| **3 — Audience** | Publishing status (expect In production), user cap, unverified-user quota consumed | |
| **4 — Branding** | Registered app name, homepage, privacy, terms URLs (mortensenapps.com umbrella) | |
| **5 — Data access / scopes** | Confirm **selected** sensitive scopes (not just picker availability). Target for resubmit: **`calendar.events.owned`** + `userinfo.email` — drop `calendar.events` / `calendar.readonly` in the implementation wave | Picker confirmed `calendar.events.owned` 2026-09-11; Calendar API **enabled** (picker banner: "Only scopes for enabled APIs are listed below") |
| **6 — Redirect URIs** | **Done for Tyson retry** (2026-09-17 screenshot): prod + `tutoring-notes.vercel.app` + localhost + `preview.usemynk.com` for Sign-In / Gmail / Calendar. Leave `NEXTAUTH_URL`. Connect now uses allowlisted request host. | Tyson item 7 |
| **7 — Search Console** | [`usemynk.com`](https://search.google.com/search-console) verified; re-submit branding if pending ([`LEGAL-SYNC.md`](../LEGAL-SYNC.md)) | Before verification resubmit |

**Submit Google Calendar verification only after** real event write (create/edit/delete) is on a crawlable URL with Source Account Impact in the tutor's Google Calendar UI — **not** the old connect+stub demo. See [`CALENDAR-WAVE-PLAN.md`](CALENDAR-WAVE-PLAN.md) demo requirements.

**Tyson Connect (2026-09-17):** Console redirect URIs include `preview.usemynk.com`. **Do not change `NEXTAUTH_URL`.** After the tab-host Connect deploy, he retries on https://preview.usemynk.com. Also add Authorized JavaScript origin `https://preview.usemynk.com` if missing.

**Paste status here when done** (agents fold into BACKLOG/STATE):

```
Clients (count / shared?): 
gmail.send still verified?: 
Verification Center: 
Audience: 
Selected calendar scopes: 
Sign-in + gmail + calendar callback URIs OK?: 
Search Console usemynk.com?: 
Notes:
```

---

## Tutor email allowlist — add pilot emails in operator UI (Andrew-only)

Pre-approved signup allowlist is on **`master`**. **Do not seed Sarah/Tyson emails from the repo** — add their real addresses on [`/admin/tutor-approvals`](/admin/tutor-approvals) under **Pre-approved emails**. They still confirm email (unless Google) and still set up 2FA; allowlist only skips the waitlist.

| # | Action | Why | Blocks code? |
|---|--------|-----|--------------|
| 1 | Add Sarah + Tyson emails via operator UI | Skip waitlist for pilot tutors | No |

---

## SMS 2FA (Twilio) — code on master, needs your account + env (Andrew-only)

SMS OTP is **on `master`** (fail-closed until Twilio is provisioned).

| # | Action | Why | Blocks code? |
|---|--------|-----|--------------|
| 1 | Twilio account + Programmable SMS-capable US number | Outbound OTP source | No — SMS card stays disabled until done |
| 2 | Vercel env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | All three required or SMS stays hidden | No for code; **yes for live SMS smoke** |

---

## Platform SMTP (Resend) — auth/system mail (Andrew-only)

Confirm-link, password reset, 2FA email OTP, parent/claim mail use **`sendPlatformMail`** only (env SMTP; fail-closed; never tutor Gmail). Until configured, live auth mail fails closed with an honest error.

| # | Action | Why | Blocks code? |
|---|--------|-----|--------------|
| 1 | Resend + verify `usemynk.com` DNS (SPF/DKIM) | Sending domain allowlist | No |
| 2 | Vercel: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=resend`, `SMTP_PASS=<key>`, `SMTP_FROM=noreply@usemynk.com` | Live confirm/reset/2FA-email/claim | No for merge; **yes for live auth-mail smoke** |

See [`docs/DEPLOY.md`](../DEPLOY.md).

---

## Privacy / Terms eyeball (Andrew-only)

After auth merge: read the **2FA + SMS** paragraphs on [`/privacy`](../src/app/privacy/page.tsx) and [`/terms`](../src/app/terms/page.tsx) for honesty vs shipped behavior (email default, SMS fail-closed, Twilio subprocessors). Calendar wave will require further legal updates — see [`CALENDAR-WAVE-PLAN.md`](CALENDAR-WAVE-PLAN.md).

---

## Background eyeballs (not merge-blocking)

| Item | Doc | Notes |
|------|-----|-------|
| Dedupe Wave A/B + tokens visual pass | [`DEDUPE-EYEBALL-LIST.md`](DEDUPE-EYEBALL-LIST.md) | Partial 2026-07-27 |
| Design-system gallery | BACKLOG § QUEUED | Not built |
| Neon scale-to-zero revisit | BACKLOG **NEON-SCALE-TO-ZERO-REVISIT** (§10) | 5-min suspend 2026-08-28 |

---

## What agents shipped on `master` (you do not re-smoke regressions)

| Priority | Work | Status |
|----------|------|--------|
| **#1** | Sign in with Google | **DONE** [`122bf761`](https://github.com/Arangarx/tutoring-notes/commit/122bf761) |
| **#1 remainder** | Calendar ICS + `calendar.events.owned` write | **OPEN** — [`CALENDAR-WAVE-PLAN.md`](CALENDAR-WAVE-PLAN.md) |
| **#2** | Student-detail Start / consent / claim | **DONE** [`f08d56b5`](https://github.com/Arangarx/tutoring-notes/commit/f08d56b5) |
| **#3** | Tutor signup / auth ship-ready | **DONE** [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca) |
| **#4** | Email OTP + 2FA chooser + SMS code + allowlist | **DONE** [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca) — your leftover: SMTP + Twilio + allowlist UI |
| **#5** | Native schedule CRUD | **DONE** [`1bbd9216`](https://github.com/Arangarx/tutoring-notes/commit/1bbd9216) |
| **#6** | Security MUST (Composer chunks) | Partial — full MUST backlog still open for strangers |
| **#7** | ProductEvent tutor funnel chunk 1 | **DONE** [`3e9cccf4`](https://github.com/Arangarx/tutoring-notes/commit/3e9cccf4) |

**Andrew-blocked / not agent-pickable:** invite-link product call (operator-invite vs open signup).

---

## One-liner "where are we?"

> Release track option B. Tutor-auth **merged** [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca). **Next orchestrator episode:** Andrew confirms calendar wave (**A**) vs security MUST pass (**B**) — see [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) HEAD. Your open work: platform SMTP, Twilio, Sarah/Tyson allowlist, Google Console (Clients first), Privacy/Terms eyeball, then calendar verification after the write wave ships.
