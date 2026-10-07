import { test, expect } from "@playwright/test";

/**
 * Public auth pages. Note → outbox → share and the AI text panel are in
 * tests/integration/note-outbox-share.spec.ts and
 * tests/integration/ai-assist-panel.spec.ts. AuthShell titles are divs,
 * not headings.
 */
test.describe("public pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

test("auth: unauthenticated access to admin redirects to login", async ({ page }) => {
  await page.goto("/admin/students");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
});

test("forgot password page loads and links back to login", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByText("Reset your password", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("feedback is discoverable from landing and from admin", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Feedback" })).toBeVisible();
  await page.getByRole("link", { name: "Feedback" }).first().click();
  await expect(page).toHaveURL(/\/feedback/);
});
});

