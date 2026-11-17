/**
 * Signed-out pilot limits. Same sentences as Settings → Known issues.
 *
 * Run:
 *   npx playwright test tests/integration/public-limits.spec.ts --project=wb-regression --workers=1
 */

import { expect, test } from "@playwright/test";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

test.describe("Public limits — what Mynk does today", () => {
  test.use({ storageState: EMPTY_STATE });

  test("a signed-out visitor can read the pilot limits, linked from home, features, and signup", async ({
    page,
  }) => {
    await page.goto("/limits", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 1, name: "What Mynk does today" })
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);

    const list = page.getByTestId("product-today-list");
    const roadmap = page.getByTestId("known-issues-roadmap-section");
    const pageCopy = page.getByTestId("known-issues-roadmap");
    await expect(list).toContainText(
      "Session notes and transcription support English only."
    );
    await expect(list).not.toContainText("Spanish");
    await expect(roadmap).toContainText(
      "Spanish support for automatic notes is next, then more languages."
    );
    await expect(roadmap).not.toContainText(/Spanish is available/i);
    await expect(pageCopy).not.toContainText("tutor settings");
    await expect(pageCopy).not.toContainText("Smoother automatic updates");
    await expect(pageCopy).not.toContainText("Richer billing");
    await expect(pageCopy).not.toContainText("Continued polish");
    await expect(pageCopy).not.toContainText("PDF boards — occasional stray mark");
    await expect(pageCopy).not.toContainText("Empty review screen");
    await expect(pageCopy).not.toContainText("working on a fix");
    await expect(pageCopy).not.toContainText("We're on it");
    await expect(pageCopy).not.toContainText("Replays start from the beginning");
    await expect(pageCopy).not.toContainText(/calculus/i);
    await expect(list).toContainText(/approved by Mynk/i);
    await expect(list).toContainText(/accept the invite/i);
    await expect(list).toContainText(/privacy settings/i);
    await expect(list).toContainText(/online or in person/i);
    await expect(list).toContainText("Chrome");
    await expect(list).toContainText("Edge");
    await expect(list).toContainText("Safari");
    await expect(list).toContainText(/phone/i);
    await expect(list).toContainText(/\bfree\b/i);
    await expect(list).not.toContainText(/Spanish is available/i);
    await expect(list).not.toContainText(/approved instantly/i);

    for (const path of ["/", "/features", "/signup"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const link = page.getByRole("link", { name: "What Mynk does today" }).first();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", "/limits");
    }
  });

  test("a signed-out visitor is sent to login for the settings copy", async ({ page }) => {
    await page.goto("/admin/settings/known-issues", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("product-today-list")).toHaveCount(0);
    await expect(page.getByTestId("known-issues-roadmap")).toHaveCount(0);
  });
});
