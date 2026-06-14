# 2FA Remember-This-Device — smoke runbook

**Branch:** `auth/2fa-remember-device`
**Tip commit:** [`7e23f88`](https://github.com/Arangarx/tutoring-notes/commit/7e23f8826ed48266d3e00933b670861d9e36741e)
**Preview:** [auth/2fa-remember-device preview](https://tutoring-notes-git-auth-2fa-reme-afa2a4-arangarx-5209s-projects.vercel.app)
*(URL source: Vercel MCP `list_deployments` → `meta.branchAlias` for `auth/2fa-remember-device`; new deploy triggered by `7e23f88` push — wait for Vercel build to finish before smoking.)*

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

**Action:** Log out of the admin account. Navigate to `/login`, enter credentials for an admin with 2FA enrolled. On the TOTP verify screen (`/admin/settings/2fa/verify`), check the "Remember this device for 30 days" checkbox, enter the correct TOTP code, and click Verify.

**Expect:** Login succeeds and you land on `/admin`. No error shown. The `__Secure-mynk_admin_tfa_device` cookie is set (check DevTools → Application → Cookies; value is a long hex string, not the raw HMAC secret). No raw token appears in any network response body or console log.

**Ignore this run:** Cosmetic styling of the checkbox; the exact label text.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Subsequent login skip (trusted device)

**Action:** In the same browser where test 1 was run, log out of the admin account. Navigate to `/login`, enter credentials. Watch whether the TOTP verify screen appears.

**Expect:** The TOTP screen is **skipped** — you land directly on `/admin` without entering a code. The `twoFactorVerified` claim is present in the session (you can verify by checking that protected admin pages load without redirect).

**Ignore this run:** Any flash/redirect animation through the verify URL; minor latency.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Trusted device listed in 2FA settings

**Action:** After test 2 (while logged in on the trusted device), navigate to `/admin/settings/2fa`. Scroll to the "Trusted devices" section.

**Expect:** The current device appears in the list with a label (truncated user-agent) and a "Revoke" button. The device is marked as the current device. The "Forget all devices" button is visible.

**Ignore this run:** Exact label formatting; date/time display format.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. Per-device revocation

**Action:** On the `/admin/settings/2fa` trusted-devices section, click "Revoke" next to the current device. Confirm if prompted. Then log out and log back in.

**Expect:** The device is removed from the list immediately after clicking Revoke. On the next login, the TOTP verify screen reappears (skip no longer active). The device cookie is cleared.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. Forget-all devices

**Action:** Set up trust on the current device (see test 1). Navigate to `/admin/settings/2fa` and click "Forget all devices". Log out and log back in.

**Expect:** All devices are removed from the list. On the next login, the TOTP verify screen reappears for the current browser (no skip). If you happen to have a second trusted browser, it would also need to re-verify.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. Cross-device negative (trusted on device A ≠ skip on device B)

**Action:** Trust device A (test 1). In a different browser / incognito / device B, attempt to log in with the same admin credentials.

**Expect:** The TOTP verify screen **does appear** on device B — trust from device A does not carry over. Device B must enter its own TOTP code.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Sensitive op step-up — password change

**Action:** While logged in with a trusted device (TOTP skipped at login), navigate to `/admin/settings/profile` and attempt to change your password. The form should show a TOTP code field (only visible when 2FA is enrolled).

**Expect:** The password-change form prompts for a fresh TOTP code. Submitting the correct code + new password succeeds. Submitting without a TOTP code (or with an empty code) fails with an error message.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. Sensitive op step-up — rotate authenticator start

**Action:** While logged in with a trusted device, navigate to `/admin/settings/2fa` and click "Rotate authenticator". The UI should prompt for a current TOTP code before showing the new QR.

**Expect:** A TOTP input appears for "step-up" verification. Entering the correct code proceeds to the rotation flow. An empty or wrong code shows an error and does not advance.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9. Sensitive op step-up — regenerate backup codes

**Action:** While logged in with a trusted device, navigate to `/admin/settings/2fa` and click "Regenerate backup codes". A step-up TOTP prompt should appear.

**Expect:** Correct TOTP advances to the new backup codes display. Wrong/empty code shows an error.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 10. Sensitive op step-up — admin reset another user's 2FA

**Action:** While logged in as an ADMIN (not TUTOR), navigate to a target user's 2FA management section and attempt to reset their 2FA. A step-up TOTP prompt should appear for the acting admin.

**Expect:** Correct TOTP for the acting admin proceeds with reset. Wrong/empty code shows an error and does not reset the target's 2FA.

**Ignore this run:** This test requires an ADMIN-role account; skip if only a TUTOR account is available (note that in Notes).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 11. Sensitive op step-up — impersonation start (B1)

**Action:** While logged in with a trusted device (TOTP was skipped at login), navigate to the admin dev-tools or test-accounts panel. Attempt to start impersonation of a test account. A TOTP code input should appear in the UI before impersonation fires.

**Expect:** The impersonation modal/inline prompt collects a fresh TOTP code. Correct code starts impersonation. Empty or wrong code shows an error without starting impersonation. A trusted-device cookie does NOT satisfy impersonation step-up.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 12. Cascade revocation — password change clears all trusted devices

**Action:** Set up trust on the current device (test 1). Change the password (with TOTP step-up, test 7). After a successful password change, log out and attempt to log back in.

**Expect:** The TOTP verify screen reappears — the password change cascaded a revoke-all, so the trusted device was cleared.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 13. Fail-closed: DB unavailable during skip check → TOTP prompt shown

**Action:** *(Simulated / note-only if Neon is always available.)* If you can temporarily disable DB connectivity (e.g. by temporarily providing a bad `DATABASE_URL`), attempt to log in on a device with a trusted-device cookie set.

**Expect:** The TOTP verify screen appears (fails closed to TOTP, not to access denied). No 500 error page.

**Ignore this run:** If DB cannot be simulated offline, skip with note "env constraint — simulated fail-closed verified by TD-8 unit test."

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

No cross-branch items for this feature. After merge to `v1-redesign` or `master`, re-run tests 1–2 and 11 to confirm skip and impersonation step-up survive the merge.

---

## Overall result

- [ ] PASS
- [ ] FAIL
