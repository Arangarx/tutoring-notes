# SMS A2P consent — executor plan

**Status:** Queued. Cut branch **after** `feat/calendar-wave` merges to `master`. Do **not** start in the main checkout while that wave owns the tree.  
**Why:** Twilio A2P 10DLC campaign review needs a real opt-in we actually collect. Today SMS 2FA is a phone field + Send code. Filing a campaign that describes a checkbox we do not have is a legal/honesty problem.  
**Andrew 2026-09-21:** do not defer; ship this next.

**Brand facts (do not invent others):** A2P Brand submitted as **Andrew Mortensen** (personal / sole prop). Product name in texts is **Mynk**. Sites: `https://usemynk.com` (app), `https://www.mortensenapps.com` (umbrella legal). Mortensen Apps is a domain, not an EIN entity. Purple Cow Unlimited has the EIN and is **not** this Brand.

---

## What exists today

- SMS body (`src/lib/otp-challenge.ts` `sendSmsOtpChallenge`):  
  - enroll: `Mynk: your two-factor setup code is ${code}. Expires in 10 minutes.`  
  - sign-in: `Mynk: your sign-in code is ${code}. Expires in 10 minutes.`  
  No STOP/HELP line.
- Phone collect: `TwoFactorSetupForm` `sms-phone` step and the change-method SMS path in `TwoFactorManageView` — phone + Send code, **no** consent checkbox.
- Canonical checkbox: `src/components/ui/checkbox.tsx` (`Checkbox` / `CheckboxField`). Reuse. For long legal copy, pass `labelClassName` to drop the `h-4` clip — do **not** fork a second checkbox.
- Privacy (`src/app/privacy/page.tsx`) names Twilio; does **not** say SMS opt-in data is not sold/shared for marketing.
- Terms (`src/app/terms/page.tsx`) names Twilio; missing program name, frequency, “Message and data rates may apply”, **HELP** / **STOP**, carrier-liability sentence.

---

## Phase-1 acceptance (all merge-blocking)

### C1 — One consent block, both SMS phone collects

Shared composition (one component) used on first-time setup **and** change-method. Required, **unchecked** by default. Copy must include, in user-visible text:

- Who texts: **Mynk** (Andrew Mortensen, operating as Mynk)
- What: one-time sign-in / setup codes only
- Frequency: only when you set up SMS 2FA or sign in (or change method) — not marketing, not a blast list
- “Msg & data rates may apply”
- “Reply HELP for help. Reply STOP to opt out.”
- Links to `/privacy` and `/terms` (same URLs we will put on the Twilio form: `https://usemynk.com/privacy`, `https://usemynk.com/terms`)
- Submit stays **Send code** (or equivalent); disabled until the box is checked

Server: `startSmsOtpEnrollment` and `startSmsOtpMethodChange` take an explicit `smsConsent === true` and **refuse** otherwise. UI-only gate is not enough.

### C2 — OTP bodies match what we will tell Twilio

Append a short opt-out clause to **both** real SMS strings, e.g. `Reply STOP to opt out.` so sample messages on the campaign are not fiction. Keep brand **Mynk**. No links, no phone numbers in the body. Update jest that asserts the body.

### C3 — Legal honesty (`docs/LEGAL-SYNC.md`)

Product-specific sections only (not umbrella-verbatim blocks). Update top-of-file sync date + in-UI Last updated.

**Privacy** must add wording to the effect of: we do not sell or share SMS opt-in data or personal information with third parties for marketing purposes. Name **Mynk** / the SMS 2FA program. Keep the existing Twilio subprocessor sentence honest.

**Terms** must add an SMS program paragraph: program name **Mynk two-factor texts**; description (OTP only); “Message and data rates may apply”; frequency as above; support contact already on the page; **HELP** and **STOP** in bold; link to privacy; carriers not liable for delayed or undelivered messages.

### C4 — Tests

- Jest: enroll/change-method without `smsConsent` does not call `sendSms`; with consent, send fires. Body contains `Mynk` + `STOP`.
- Playwright (`@wb-chrome` or identity-e2e — match existing 2FA specs): checkbox starts unchecked; Send code disabled; check then send is allowed. Same on change-method if that surface is already in Playwright; if not, add it or document `PLAYWRIGHT-GAP` + BACKLOG (silent omission forbidden).
- Legal DOM test: privacy contains the no-share-for-marketing sentence; terms contain STOP/HELP + rates.

### C5 — Twilio proof (Andrew after deploy)

Reviewers need a **public** screenshot of the live consent form (page is behind login). After preview/prod deploy: screenshot the checked-out consent block + the post-submit “we sent a code” state; put both in Drive **test plans** with “anyone with the link can view”; paste those URLs into the campaign **Opt-in method proof** field. Agents do not invent a public logged-out fake form unless Andrew asks.

### Out of scope

- Building Twilio START/HELP/STOP **webhooks** in-app. Use Twilio Console **Advanced Opt-out** on the messaging service (STOP/HELP auto-replies). Campaign keyword replies are configured there, not in Next.js.
- Changing A2P Brand off Andrew Mortensen.
- Enabling SMS for Tyson before this ships **and** the campaign is approved (card can stay fail-closed on missing Twilio env).
- BL-2FA-EMAIL-AVAIL / BL-SIGNUP-SMTP-LEAK — separate; do not piggyback unless trivial and already in the touched files.

---

## Sequencing

1. Wait for `feat/calendar-wave` `--no-ff` onto `master` (Andrew smoke + merge — other session).
2. Cut `feat/sms-a2p-consent` from `origin/master` in the **main checkout** (do not check out `master` there).
3. Implement C1–C4. Independent verifier. `test:regression` + `npx next build`.
4. Merge. Andrew: redeploy if needed, screenshot proof (C5), then finish the Twilio campaign form (paste block can be written in chat once C1–C3 are on a crawlable URL).

## Dispatch

Executor: `generalPurpose` `composer-2.5`. Verifier: separate agent (Sonnet if Grok can dispatch it). Fragile? No — 2FA setup UI + legal facades; not recorder/A/V/WB apply-path.
