import { expect, test } from "@playwright/test";

import { seedUnenrolled2faTutor, loginTutorWithPassword } from "./tutor-2fa-login.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

const smsEnrollmentConfigured =
  Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()) &&
  Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()) &&
  Boolean(process.env.TWILIO_FROM_NUMBER?.trim());

test.describe("SMS A2P consent — setup phone collect @identity", () => {
  test.use({ storageState: EMPTY_STATE });

  test("consent checkbox gates Send code on first-time SMS setup", async ({ page }) => {
    test.skip(!smsEnrollmentConfigured, "TWILIO_* env required for SMS enrollment UI");

    await seedUnenrolled2faTutor();

    await loginTutorWithPassword(page, {
      email: "playwright-tfa-enroll@test.local",
      password: "TwofaEnrollPw!789",
    });

    await page.waitForURL(/\/admin\/settings\/2fa\/setup/, { timeout: 30_000 });
    await page.getByTestId("tfa-choose-sms").getByRole("button", { name: /text message/i }).click();

    const sendButton = page.getByRole("button", { name: "Send code" });
    await expect(sendButton).toBeDisabled();
    await expect(page.getByTestId("sms-a2p-consent")).not.toBeChecked();

    await page.getByTestId("sms-a2p-consent").click();
    await expect(page.getByTestId("sms-a2p-consent")).toBeChecked();
    await page.getByPlaceholder("(555) 123-4567").fill("5551234567");
    await expect(sendButton).toBeEnabled();
  });
});
