import { expect, test } from "@playwright/test";

import {
  TEST_SMS_2FA_MASKED_PHONE,
  TEST_SMS_2FA_TUTOR,
  seedSmsOtpEnrolledTutor,
  seedSmsOtpEnrolledTutorWithEmailFallback,
  submitSmsOtpOnVerifyPage,
} from "./tutor-sms-2fa-login.helpers";
import { submitEmailOtpOnVerifyPage } from "./tutor-email-2fa-login.helpers";
import {
  expectTutorAuthedLanding,
  loginTutorWithPassword,
  waitFor2faVerifyChallenge,
} from "./tutor-2fa-login.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };
const WRONG_CODE = "000000";

test.describe("SMS OTP 2FA — login + fallback (WS3)", () => {
  test.use({ storageState: EMPTY_STATE });

  test("happy path: SMS-enrolled tutor login verify lands authed", async ({ page }) => {
    const { loginCode } = await seedSmsOtpEnrolledTutor();

    await loginTutorWithPassword(page, TEST_SMS_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    // Seeded challenge — no SMS sender; skip send to avoid invalidating hash.
    await submitSmsOtpOnVerifyPage(page, loginCode);
    await expectTutorAuthedLanding(page);
  });

  test("security teeth: wrong SMS OTP stays on challenge", async ({ page }) => {
    await seedSmsOtpEnrolledTutor();

    await loginTutorWithPassword(page, TEST_SMS_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    await submitSmsOtpOnVerifyPage(page, WRONG_CODE);

    await expect(page).toHaveURL(/\/admin\/settings\/2fa\/verify/);
    await expect(page.getByText(/invalid or expired code/i)).toBeVisible({ timeout: 15_000 });
  });

  test("masked phone number is shown on the verify challenge, not the full number", async ({
    page,
  }) => {
    await seedSmsOtpEnrolledTutor();

    await loginTutorWithPassword(page, TEST_SMS_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    await expect(page.getByText(TEST_SMS_2FA_MASKED_PHONE)).toBeVisible();
    await expect(page.getByText(TEST_SMS_2FA_TUTOR.phoneE164)).not.toBeVisible();
  });

  test("SMS-enrolled tutor can still request an email code as fallback", async ({ page }) => {
    await seedSmsOtpEnrolledTutorWithEmailFallback();

    await loginTutorWithPassword(page, TEST_SMS_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    await expect(page.getByRole("button", { name: "Email me a code instead" })).toBeVisible();
    await page.getByRole("button", { name: "Email me a code instead" }).click();

    // That click sends a new code and retires the seed. Harness mail uses a fixed code.
    const { PLAYWRIGHT_HARNESS_EMAIL_OTP } = await import("@/lib/otp-challenge");
    await expect(page.getByRole("button", { name: "Resend code" })).toBeVisible();
    await submitEmailOtpOnVerifyPage(page, PLAYWRIGHT_HARNESS_EMAIL_OTP);
    await expectTutorAuthedLanding(page);
  });

  test("SMS-enrolled confirmed tutor sees manage page not setup chooser, method shown as text message", async ({
    page,
  }) => {
    const { loginCode } = await seedSmsOtpEnrolledTutor();

    await loginTutorWithPassword(page, TEST_SMS_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);
    await submitSmsOtpOnVerifyPage(page, loginCode);
    await expectTutorAuthedLanding(page);

    await page.goto("/admin/settings/2fa");
    await expect(page).toHaveURL(/\/admin\/settings\/2fa$/);
    await expect(page.getByRole("heading", { name: "Two-Factor Authentication" })).toBeVisible();
    await expect(page.getByText(/two-factor authentication is on/i)).toBeVisible();
    await expect(page.getByText(/text message codes/i)).toBeVisible();
    await expect(page.getByTestId("tfa-choose-email")).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Set up Two-Factor Authentication" })
    ).not.toBeVisible();
  });
});
