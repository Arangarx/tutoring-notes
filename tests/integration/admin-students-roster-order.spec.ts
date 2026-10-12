/**
 * Tutor student list — the roster is the first thing on the page.
 * The desktop "Add a learner" card sits below the list. "Add learner" in the
 * search toolbar scrolls that card into view and focuses the invite email.
 *
 * Project: integration (admin pages). Not a whiteboard test — do not enroll
 * in wb-regression.
 *
 * Run:
 *   npx playwright test tests/integration/admin-students-roster-order.spec.ts --project=integration --workers=1
 */
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { seedTestAdmin } from "../visual/helpers";

const { applyWbRegressionLocalDatabaseEnv } = require("../../scripts/wb-regression-local-db.cjs");
applyWbRegressionLocalDatabaseEnv();

test.describe("tutor student list — add card below the roster", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("student link sits above the add card; Add learner brings the invite email into view", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const adminId = await seedTestAdmin();
    const prisma = new PrismaClient();
    const stamp = `${Date.now()}`;
    const student = await prisma.student.create({
      data: {
        name: `Roster Order ${stamp}`,
        adminUserId: adminId,
        parentEmail: `roster-order-${stamp}@test.local`,
      },
      select: { id: true },
    });

    try {
      await page.goto("/admin/students", { waitUntil: "domcontentloaded" });

      const studentLink = page.locator(`a[href="/admin/students/${student.id}"]`);
      await expect(studentLink).toBeVisible({ timeout: 15_000 });

      // Desktop invite form's card — independent of document order.
      const addCard = page
        .locator("#desktop-inviteEmail")
        .locator("xpath=ancestor::*[@data-slot='card'][1]");
      await expect(addCard).toBeVisible();

      const studentBox = await studentLink.boundingBox();
      const cardBox = await addCard.boundingBox();
      expect(studentBox, "student link box").not.toBeNull();
      expect(cardBox, "add card box").not.toBeNull();

      // Vertically: the student list is above the add card (list top < card top).
      expect(
        studentBox!.y,
        "student link must sit above the add card (list top < card top)",
      ).toBeLessThan(cardBox!.y);

      await page.getByRole("button", { name: "Add learner", exact: true }).click();

      await expect(addCard).toBeInViewport();
      const inviteEmail = page.locator("#desktop-inviteEmail");
      await expect(inviteEmail).toBeVisible();
      await expect(inviteEmail).toBeFocused();
    } finally {
      await prisma.student.delete({ where: { id: student.id } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });
});
