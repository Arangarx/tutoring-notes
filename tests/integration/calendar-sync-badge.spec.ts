/**
 * Calendar sync badge copy — connected / synced / pending / needs-reconnect.
 *
 * Run:
 *   npx playwright test tests/integration/calendar-sync-badge.spec.ts --project=integration
 */

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { TEST_ADMIN, seedTestAdmin, seedTestStudent } from "../visual/helpers";

test.describe("Calendar sync badges @wb-chrome", () => {
  test.describe.configure({ mode: "serial" });

  test(`${TAG.WB_CHROME} shows synced, pending, and reconnect badge text`, async ({ page }) => {
    const adminUserId = await seedTestAdmin();
    const { studentId } = await seedTestStudent(adminUserId);
    const prisma = new PrismaClient();

    const stamp = Date.now();
    const subjectSynced = `PW-SYNC-OK-${stamp}`;
    const subjectPending = `PW-SYNC-PEND-${stamp}`;
    const subjectReconnect = `PW-SYNC-RECON-${stamp}`;

    try {
      await prisma.scheduledSession.deleteMany({ where: { adminUserId } });
      await prisma.oAuthCalendarConnection.deleteMany({
        where: { adminUserId, provider: "google" },
      });

      await prisma.oAuthCalendarConnection.create({
        data: {
          provider: "google",
          refreshToken: "pw-refresh",
          email: "pw-calendar@test.local",
          adminUserId,
          reconnectRequiredAt: null,
        },
      });

      const base = {
        adminUserId,
        studentId,
        date: new Date("2026-12-15T12:00:00.000Z"),
        startTime: "10:00",
        endTime: "11:00",
        plannedDurationMinutes: 60,
        subject: "placeholder",
        notes: "",
      };

      await prisma.scheduledSession.create({
        data: { ...base, subject: subjectSynced, googleEventId: "google-ev-1" },
      });
      await prisma.scheduledSession.create({
        data: { ...base, subject: subjectPending, googleEventId: null },
      });

      await page.goto("/admin/schedule");
      await page.waitForLoadState("networkidle");
      await page.getByTestId("schedule-agenda-tab").click();

      const syncedRow = page.getByTestId("schedule-agenda-row").filter({ hasText: subjectSynced });
      const pendingRow = page.getByTestId("schedule-agenda-row").filter({ hasText: subjectPending });
      await expect(syncedRow.locator('[data-slot="badge"]').filter({ hasText: "Synced" })).toBeVisible();
      await expect(
        pendingRow.locator('[data-slot="badge"]').filter({ hasText: "Not synced yet" })
      ).toBeVisible();

      await prisma.oAuthCalendarConnection.updateMany({
        where: { adminUserId, provider: "google" },
        data: { reconnectRequiredAt: new Date() },
      });
      await prisma.scheduledSession.create({
        data: { ...base, subject: subjectReconnect, googleEventId: null },
      });

      await page.reload();
      await page.waitForLoadState("networkidle");
      await page.getByTestId("schedule-agenda-tab").click();

      const reconnectRow = page
        .getByTestId("schedule-agenda-row")
        .filter({ hasText: subjectReconnect });
      await expect(
        reconnectRow.locator('[data-slot="badge"]').filter({ hasText: "Reconnect Google" })
      ).toBeVisible();
    } finally {
      await prisma.$disconnect();
    }
  });
});
