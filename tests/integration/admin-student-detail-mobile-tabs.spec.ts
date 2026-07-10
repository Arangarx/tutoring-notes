/**
 * ADMIN-STUDENT-DETAIL-MOBILE-DISCOVER — phone bottom tabs must be discoverable;
 * Notes tab reveals the notes panel (relational visibility oracles).
 *
 * Run:
 *   npx playwright test tests/integration/admin-student-detail-mobile-tabs.spec.ts --project=integration
 */

import { test, expect } from "@playwright/test";
import { TAG } from "../test-tags";
import { seedTestAdmin, seedTestStudent } from "../visual/helpers";

const PHONE_VIEWPORT = { width: 390, height: 844 };

test.describe("Admin student detail — mobile tabs", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test(
    "phone Notes tab reveals notes panel and bottom nav stays in viewport",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByRole("heading", { name: "Playwright Student" })).toBeVisible({
        timeout: 15_000,
      });

      const mobileTabs = page.getByTestId("student-detail-mobile-tabs");
      await expect(mobileTabs).toBeVisible();

      // Bottom tab bar anchored in viewport — not clipped off-screen.
      const navMetrics = await mobileTabs.evaluate((nav) => {
        const rect = nav.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          viewportHeight: window.innerHeight,
        };
      });
      expect(navMetrics.bottom).toBeLessThanOrEqual(navMetrics.viewportHeight + 2);
      expect(navMetrics.top).toBeGreaterThan(navMetrics.viewportHeight * 0.82);

      await expect(page.getByTestId("student-detail-tab-parent")).toHaveText(/Parent/i);
      await expect(page.getByTestId("student-detail-panel-session")).toBeVisible();
      await expect(page.getByTestId("student-detail-panel-notes")).toBeHidden();

      await page.getByTestId("student-detail-tab-notes").click();
      const notesPanel = page.getByTestId("student-detail-panel-notes");
      await expect(notesPanel).toBeVisible();
      await expect(notesPanel.getByTestId("new-note-form")).toBeVisible();
      await expect(page.getByTestId("student-detail-panel-session")).toBeHidden();
    }
  );

  test(
    "phone session escape hatch opens notes panel",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByRole("heading", { name: "Playwright Student" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("student-detail-tab-session")).toHaveAttribute(
        "aria-selected",
        "true"
      );

      const sessionPanel = page.getByTestId("student-detail-panel-session");
      await expect(sessionPanel.getByTestId("session-tab-escape-hatches")).toBeVisible();
      await sessionPanel.getByTestId("session-escape-view-notes").click();

      await expect(page.getByTestId("student-detail-tab-notes")).toHaveAttribute(
        "aria-selected",
        "true"
      );
      const notesPanel = page.getByTestId("student-detail-panel-notes");
      await expect(notesPanel).toBeVisible();
      await expect(notesPanel.getByTestId("new-note-form")).toBeVisible();
    }
  );
});
