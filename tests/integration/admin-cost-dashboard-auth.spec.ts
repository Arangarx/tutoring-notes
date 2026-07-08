import { expect, test } from "@playwright/test";

/**
 * P1-WB-9 — admin cost dashboard auth boundary (`integration` project).
 *
 * Contract: TUTOR sessions are denied `/admin/cost`; ADMIN sessions see the
 * cost breakdown dashboard. Page guard is `assertAdminOrNotFound()` → 404 for
 * non-ADMIN (see `src/lib/impersonation.ts`).
 *
 * Auth seam: Playwright storageState from `auth.setup.ts` — tutor.json (TUTOR)
 * and erasure-admin.json (ADMIN via seedTestAdminWithRole).
 */
const TUTOR_STATE = "tests/integration/.auth/tutor.json";
const ADMIN_STATE = "tests/integration/.auth/erasure-admin.json";

const COST_DASHBOARD_PATH = "/admin/cost";

test.describe("P1-WB-9 — admin cost dashboard auth", () => {
  test.describe("TUTOR → denied", () => {
    test.use({ storageState: TUTOR_STATE });

    test("authenticated TUTOR receives 404 — cost breakdown not rendered", async ({
      page,
    }) => {
      const response = await page.goto(COST_DASHBOARD_PATH);

      expect(response?.status()).toBe(404);

      await expect(
        page.getByRole("heading", { name: "Cost observability" })
      ).not.toBeVisible();
      await expect(
        page.getByText("By cost source (this month)", { exact: true })
      ).not.toBeVisible();
      await expect(
        page.getByText("This month (estimated)", { exact: true })
      ).not.toBeVisible();
    });
  });

  test.describe("ADMIN → breakdown", () => {
    test.use({ storageState: ADMIN_STATE });

    test("authenticated ADMIN sees cost breakdown dashboard", async ({
      page,
    }) => {
      const response = await page.goto(COST_DASHBOARD_PATH);

      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Cost observability" })
      ).toBeVisible({ timeout: 15_000 });

      // Breakdown sections — present even when CostEvent rows are empty.
      await expect(
        page.getByText("This month (estimated)", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("By cost source (this month)", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("By tutor (this month)", { exact: true })
      ).toBeVisible();
    });
  });
});
