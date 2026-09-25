import { expect, test } from "@playwright/test";

import {
  TEST_EMAIL_2FA_ENROLL,
  TEST_EMAIL_2FA_TUTOR,
  seedEmailOtpEnrollChallenge,
  seedEmailOtpEnrolledTutor,
  submitEmailOtpOnSetupPage,
  submitEmailOtpOnVerifyPage,
} from "./tutor-email-2fa-login.helpers";
import {
  expectTutorAuthedLanding,
  loginTutorWithPassword,
  seedUnenrolled2faTutor,
  waitFor2faVerifyChallenge,
} from "./tutor-2fa-login.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };
const WRONG_CODE = "000000";

test.describe("Email OTP 2FA — enroll + login (chunk 1)", () => {
  test.use({ storageState: EMPTY_STATE });

  test("happy path: email-enrolled tutor login verify lands authed", async ({ page }) => {
    const { loginCode } = await seedEmailOtpEnrolledTutor();

    await loginTutorWithPassword(page, TEST_EMAIL_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    // The page issues the code. The control is a resend, not a first send.
    await expect(page.getByRole("button", { name: "Resend code" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send verification code" })).toHaveCount(0);
    await submitEmailOtpOnVerifyPage(page, loginCode);
    await expectTutorAuthedLanding(page);
  });

  test("security teeth: wrong email OTP stays on challenge", async ({ page }) => {
    await seedEmailOtpEnrolledTutor();

    await loginTutorWithPassword(page, TEST_EMAIL_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    await submitEmailOtpOnVerifyPage(page, WRONG_CODE);

    await expect(page).toHaveURL(/\/admin\/settings\/2fa\/verify/);
    await expect(page.getByText(/invalid or expired code/i)).toBeVisible({ timeout: 15_000 });
  });

  test("enroll default: unenrolled tutor sees first-class chooser with email default", async ({
    page,
  }) => {
    await seedUnenrolled2faTutor();

    await loginTutorWithPassword(page, {
      email: "playwright-tfa-enroll@test.local",
      password: "TwofaEnrollPw!789",
    });

    await page.waitForURL(/\/admin\/settings\/2fa\/setup/, { timeout: 30_000 });
    await expect(page.getByText(/by default we email/i)).toBeVisible();
    await expect(page.getByTestId("tfa-choose-email")).toBeVisible();
    await expect(page.getByTestId("tfa-choose-totp")).toBeVisible();
    await expect(page.getByTestId("tfa-choose-sms")).toBeVisible();
    await expect(page.getByTestId("tfa-choose-email")).toHaveClass(/border-primary/);
    await expect(page.getByRole("button", { name: "SMS not available" })).toBeDisabled();
  });

  test("enroll confirm: seeded email OTP completes setup and reaches students", async ({
    page,
  }) => {
    const { enrollCode } = await seedEmailOtpEnrollChallenge();

    await loginTutorWithPassword(page, TEST_EMAIL_2FA_ENROLL);
    await page.waitForURL(/\/admin\/settings\/2fa\/setup/, { timeout: 30_000 });

    await submitEmailOtpOnSetupPage(page, enrollCode);

    await expectTutorAuthedLanding(page);
    await page.goto("/admin/students");
    await expect(page).toHaveURL(/\/admin\/students/);
  });

  test("TOTP opt-in still works from setup page", async ({ page }) => {
    await seedUnenrolled2faTutor();

    await loginTutorWithPassword(page, {
      email: "playwright-tfa-enroll@test.local",
      password: "TwofaEnrollPw!789",
    });
    await page.waitForURL(/\/admin\/settings\/2fa\/setup/, { timeout: 30_000 });

    await page.getByTestId("tfa-choose-totp").getByRole("button", { name: /authenticator/i }).click();
    const qrImg = page.getByRole("img", { name: "TOTP QR code" });
    await expect(qrImg).toBeVisible({ timeout: 30_000 });
    await expect(qrImg).toHaveAttribute("src", /^data:image\/png;base64,/);
  });

  test("chooser email card starts email-sent enrollment step", async ({ page }) => {
    await seedUnenrolled2faTutor();

    await loginTutorWithPassword(page, {
      email: "playwright-tfa-enroll@test.local",
      password: "TwofaEnrollPw!789",
    });
    await page.waitForURL(/\/admin\/settings\/2fa\/setup/, { timeout: 30_000 });

    await page
      .getByTestId("tfa-choose-email")
      .getByRole("button", { name: /set up with email/i })
      .click();

    await expect(page.getByPlaceholder("000000")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/sent a 6-digit code/i)).toBeVisible();
  });

  test("email-enrolled confirmed tutor sees manage page not setup chooser", async ({ page }) => {
    const { loginCode } = await seedEmailOtpEnrolledTutor();

    await loginTutorWithPassword(page, TEST_EMAIL_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);
    await submitEmailOtpOnVerifyPage(page, loginCode);
    await expectTutorAuthedLanding(page);

    await page.goto("/admin/settings/2fa");
    await expect(page).toHaveURL(/\/admin\/settings\/2fa$/);
    await expect(page.getByRole("heading", { name: "Two-Factor Authentication" })).toBeVisible();
    await expect(page.getByText(/two-factor authentication is on/i)).toBeVisible();
    await expect(page.getByTestId("tfa-choose-email")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Set up Two-Factor Authentication" })).not.toBeVisible();
  });
});
