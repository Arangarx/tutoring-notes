# 2FA Remember-This-Device — smoke runbook

**Branch:** `auth/2fa-remember-device`
**Tip commit:** `[f6a5f91](https://github.com/Arangarx/tutoring-notes/commit/f6a5f919318e6bde9a441f96718ae9e4f16c71d1)`
**Preview:** [auth/2fa-remember-device preview](https://tutoring-notes-git-auth-2fa-reme-afa2a4-arangarx-5209s-projects.vercel.app)
*(URL source: Vercel MCP `list_deployments` → `meta.branchAlias` for `auth/2fa-remember-device`; re-deploy triggered by skip-fix push.)*

---

## Scope

New feature: opt-in "Remember this device for 30 days" on the admin/tutor TOTP verify screen.
Covers: first-time trust opt-in, subsequent skip, expiry path, revocation (per-device + forget-all),
sensitive-op step-up for every gated action, and the cross-device negative (trusted on A ≠ skip on B).

**Prerequisites:**

- Admin account with TOTP 2FA enrolled (use a test account or the real admin account)
- Two different browsers or browser profiles (for cross-device negative test)
- `ADMIN_TFA_DEVICE_HMAC_SECRET` set in the deployed env (otherwise minting will throw and skip won't work)

---

### 1. First-time trust opt-in

*Re-test after skip-fix (trusted-device-check Route Handler added). Prior FAIL was due to missing `__Secure-` prefix on non-production cookie — now using `ADMIN_TFA_DEVICE_COOKIE` constant which is env-aware.*

**Action:** Log out of the admin account. Navigate to `/login`, enter credentials for an admin with 2FA enrolled. On the TOTP verify screen (`/admin/settings/2fa/verify`), check the "Remember this device for 30 days" checkbox, enter the correct TOTP code, and click Verify.

**Expect:** Login succeeds and you land on `/admin`. No error shown. The `mynk_admin_tfa_device` cookie is set in preview (no `__Secure-` prefix on Vercel preview; production would have `__Secure-mynk_admin_tfa_device`). Check DevTools → Application → Cookies; value is a long hex string. No raw token in response body or console.

**Ignore this run:** Cosmetic styling of the checkbox; the exact label text.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Subsequent login skip (trusted device)

*Re-test after skip-fix (Route Handler for trusted-device-check). Prior FAIL: cookies().set() threw in RSC render, silently swallowed, skip always returned false. Now fixed by moving the session re-mint into a Route Handler.*

**Action:** In the same browser where test 1 was run, log out of the admin account. Navigate to `/login`, enter credentials. Watch whether the TOTP verify screen appears.

**Expect:** The TOTP screen is **skipped** — you land directly on `/admin` without entering a code. The `twoFactorVerified` claim is present in the session (you can verify by checking that protected admin pages load without redirect).

**Ignore this run:** Any flash/redirect animation through `/api/auth/2fa/trusted-device-check`; minor latency.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Trusted device listed in 2FA settings

*Re-test after skip-fix. Prior FAIL was downstream of test 2 (skip never fired, so no trusted device was registered in the session).*

**Action:** After test 2 (while logged in on the trusted device), navigate to `/admin/settings/2fa`. Scroll to the "Trusted devices" section.

**Expect:** The current device appears in the list with a label (truncated user-agent) and a "Revoke" button. The device is marked as the current device. The "Forget all devices" button is visible.

**Ignore this run:** Exact label formatting; date/time display format.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Fixed (commit after c7519d3): (a) "this device" badge moved out of truncated `<p>` into a flex sibling so it wraps rather than clips at narrow widths; (b) dedup — `verifyTotpCode` now checks for an existing valid trusted-device cookie before minting a new row, preventing duplicate entries from re-login with "remember device" checked. Re-smoke both sub-issues.

---

### 4. Per-device revocation

**Action:** On the `/admin/settings/2fa` trusted-devices section, click "Revoke" next to the current device. Confirm if prompted. Then log out and log back in.

**Expect:** The device is removed from the list immediately after clicking Revoke. On the next login, the TOTP verify screen reappears (skip no longer active). The device cookie is cleared.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. Forget-all devices

**Action:** Set up trust on the current device (see test 1). Navigate to `/admin/settings/2fa` and click "Forget all devices". Log out and log back in.

**Expect:** All devices are removed from the list. On the next login, the TOTP verify screen reappears for the current browser (no skip). If you happen to have a second trusted browser, it would also need to re-verify.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. Cross-device negative (trusted on device A ≠ skip on device B)

**Action:** Trust device A (test 1). In a different browser / incognito / device B, attempt to log in with the same admin credentials.

**Expect:** The TOTP verify screen **does appear** on device B — trust from device A does not carry over. Device B must enter its own TOTP code.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Sensitive op step-up — password change

**Action:** While logged in with a trusted device (TOTP skipped at login), navigate to `/admin/settings/profile` and attempt to change your password. The form should show a TOTP code field (only visible when 2FA is enrolled).

**Expect:** The password-change form prompts for a fresh TOTP code. Submitting the correct code + new password succeeds. Submitting without a TOTP code (or with an empty code) fails with an error message.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. Sensitive op step-up — rotate authenticator start

**Action:** While logged in with a trusted device, navigate to `/admin/settings/2fa` and click "Rotate authenticator". The UI should prompt for a current TOTP code before showing the new QR.

**Expect:** A TOTP input appears for "step-up" verification. Entering the correct code proceeds to the rotation flow. An empty or wrong code shows an error and does not advance.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9. Sensitive op step-up — regenerate backup codes

**Action:** While logged in with a trusted device, navigate to `/admin/settings/2fa` and click "Regenerate backup codes". A step-up TOTP prompt should appear.

**Expect:** Correct TOTP advances to the new backup codes display. Wrong/empty code shows an error.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 10. Sensitive op step-up — admin reset another user's 2FA

**Action:** While logged in as an ADMIN (not TUTOR), navigate to a target user's 2FA management section and attempt to reset their 2FA. A step-up TOTP prompt should appear for the acting admin.

**Expect:** Correct TOTP for the acting admin proceeds with reset. Wrong/empty code shows an error and does not reset the target's 2FA.

**Ignore this run:** This test requires an ADMIN-role account; skip if only a TUTOR account is available (note that in Notes).

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Do we have backlogged a way for me to either easily find another Admin's uuid, or just provide a list of them right there to reset?**

---

### 11. Impersonation start — no TOTP prompt (step-up intentionally removed, Rev 3)

**Action:** While logged in with a trusted device (TOTP was skipped at login), navigate to the admin dev-tools or test-accounts panel. Click "Log in as" on a test account.

**Expect:** Impersonation starts **directly** — no TOTP code input or modal appears. You are taken to the tutor landing. This is expected: impersonation is hard-restricted to `isTestAccount=true` test shells and the TOTP step-up was intentionally removed (Rev 3, 2026-06-14). See `docs/BACKLOG.md` BL-IMP-REAL for when it returns.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 12. Cascade revocation — password change clears all trusted devices

**Action:** Set up trust on the current device (test 1). Change the password (with TOTP step-up, test 7). After a successful password change, log out and attempt to log back in.

**Expect:** The TOTP verify screen reappears — the password change cascaded a revoke-all, so the trusted device was cleared.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes: Fixed (commit after c7519d3): cascade now also clears the trusted-device cookie (belt-and-suspenders on top of the existing DB revocation). Root cause: `revokeAllAdminTrustedDevices` was called but the stale browser cookie could still trigger the route-handler skip path. Cookie is now cleared by the server action so the verify page never redirects to the skip route. Re-smoke: trust device → change password → log out → log in → TOTP screen should appear.**

---

### 13. Fail-closed: DB unavailable during skip check → TOTP prompt shown

**Action:** *(Simulated / note-only if Neon is always available.)* If you can temporarily disable DB connectivity (e.g. by temporarily providing a bad `DATABASE_URL`), attempt to log in on a device with a trusted-device cookie set.

**Expect:** The TOTP verify screen appears (fails closed to TOTP, not to access denied). No 500 error page.

**Ignore this run:** If DB cannot be simulated offline, skip with note "env constraint — simulated fail-closed verified by TD-8 unit test."

- [ ] PASS
- [ ] FAIL
- [x] SKIP

**Notes:**

---

---

### A. Change-password — browser save/update prompt via Credential Management API

**Action:** On `/admin/settings/profile`, open the Password section. Submit the change-password form with the correct current password, a **new strong password (≥ 10 chars, strength meter ≥ "Good")**, and (if 2FA enrolled) a fresh TOTP code. After the green "Password updated" banner appears, watch for Chrome's credential-save/update banner (address bar or top of page). In Chrome DevTools → Sources you can also verify that `navigator.credentials.store()` was called by setting a breakpoint in `credential-manager.ts`.

**Expect:** Chrome shows "Update saved password for [your email]?" (or equivalent save prompt) immediately after the success banner. The credential is stored under the existing email entry. The hidden username anchor (`<input type="email" name="username" autoComplete="username">`) is visible in DevTools → Elements **without** `aria-hidden` so the password manager sees it.

**Ignore this run:** Exact wording of the browser's credential-manager prompt — it varies by Chrome version. Chrome's GENERATE offer on the new-password field is best-effort (depends on Chrome's heuristic recognising the form structure); see item F notes.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### B. Reset-password — browser save prompt via Credential Management API

**Action:** Request a fresh password-reset link via `/forgot-password`. Click the link in the email (or copy the `?token=…` URL). On `/reset-password`, confirm DevTools → Elements shows the hidden username anchor (no `aria-hidden`). Enter a strong new password (≥ 10 chars, strength meter ≥ "Good"), confirm, and click Save password. Watch for Chrome's credential-save banner before or during the redirect to `/login?reset=1`.

**Expect:** Chrome shows "Save password for [your email]?" (or update prompt) before leaving the page. The username anchor is pre-populated with the reset email. The redirect to `/login?reset=1` completes normally. Login with the new password succeeds.

**Ignore this run:** Exact wording of the browser credential-save prompt. Chrome may show the banner slightly after redirect — that's acceptable as long as the credential is eventually stored.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### C. Change-password to a genuinely new strong password succeeds (no false must-differ)

**Action:** On `/admin/settings/profile`, attempt to change your password. Enter the correct **current** password in the current-password field. Enter a brand-new strong password (e.g. a passphrase not previously used) in both the new-password and confirm fields. Submit (with TOTP if enrolled).

**Expect:** The change succeeds with "Password updated" confirmation. No false "must be different from your current password" error appears even if a password manager pre-filled the current-password field with a strong auto-generated value that happens to differ from the stored credential. Root cause of the old bug: the plain-text equality check (`nextPass === current`) fired before bcrypt verification of the current-password field, so a password manager filling both fields with the same new strong value triggered a false positive. Now fixed by checking (a) bcrypt-verify current, then (b) bcrypt-compare new against stored hash.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### D. Reset-password with expired or used token shows Invalid-link state (no dead form)

**Action:** Obtain an expired or already-used reset token URL (e.g. re-use a token from a prior reset, or wait for a token to expire). Navigate directly to `/reset-password?token=<expired-or-used-token>`.

**Expect:** The page shows the **"Invalid link"** AuthShell state with the message "This reset link has expired or was already used." and a "Request a new link" link to `/forgot-password`. No password input fields are rendered (the dead form with no username anchor is not shown).

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [x] SKIP

**Notes:**

---

### E. Forgot-password token reset revokes trusted devices

**Action:** (1) Set up trust on a device (test 1). (2) Confirm the trusted-device cookie is set and the next login skips TOTP (test 2). (3) From any browser, go to `/forgot-password`, request a reset link for the same admin email, click the link, and complete the password reset with a new strong password. (4) In the original trusted browser, log out and attempt to log back in with the new password.

**Expect:** On step 4, the **TOTP verify screen reappears** — the forgot-password reset triggered `revokeAllAdminTrustedDevices`, so the trusted-device cookie from step 1 is no longer valid. Check the server logs for `[tfa] adminUserId=<id> action=password_reset_cascade count=1` (or count matching how many devices were trusted).

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

### F. New-password strength indicator + requirements (both forms, correct minimum)

**Action:** 
1. Navigate to `/admin/settings/profile` and click into the **New password** field. Verify the requirements hint ("Minimum 10 characters — strength meter must reach "Good" or better.") appears while the field is empty. Begin typing a password — the strength bar and label should update live. Try a short or common password (e.g. "abc123") and confirm the bar stays red/weak. Type a strong passphrase and confirm the bar reaches "Good" or "Strong".
2. Repeat on `/reset-password` (use a valid reset-link URL) — the same strength meter and requirements text should appear under the **New password** field.
3. On both forms, try submitting with a password that is fewer than 10 characters or too simple. Confirm the **server** returns an appropriate error (not a silent save).

**Expect:** Both forms show the live strength meter and "Minimum 10 characters" requirement text. The `minLength` HTML attribute on both new-password inputs is `10` (visible in DevTools → Elements). A weak or short password is rejected server-side with a clear message. A strong password (≥ 10 chars, zxcvbn score ≥ 2) is accepted.

**Ignore this run:** Exact colour of the strength bar segments (theme-dependent). Minor label wording differences between themes.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

---

No cross-branch items for this feature. After merge to `v1-redesign` or `master`, re-run tests 1–2 to confirm skip survives the merge.

---

## Overall result

- [ ] PASS
- [ ] FAIL