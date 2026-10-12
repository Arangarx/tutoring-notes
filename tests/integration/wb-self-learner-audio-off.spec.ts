/**
 * A self-learner who turned audio recording off cannot get a live audio
 * recording. The refusal is the existing in-person audio-consent banner.
 * The consent row's allowAudioRecording is the independent oracle.
 *
 * Run:
 *   npx playwright test tests/integration/wb-self-learner-audio-off.spec.ts --project=wb-regression --workers=1
 */

import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { seedTestAdmin } from "../visual/helpers";

const { applyWbRegressionLocalDatabaseEnv } = require("../../scripts/wb-regression-local-db.cjs");

test.describe("self-learner audio recording off", { tag: [TAG.WB_RECORDING] }, () => {
  test("in-person workspace shows the existing audio-off banner", async ({ page }) => {
    test.setTimeout(120_000);

    applyWbRegressionLocalDatabaseEnv();
    const adminUserId = await seedTestAdmin();
    const prisma = new PrismaClient();
    const marker = `self-audio-off-${Date.now()}`;

    try {
      const accountHolder = await prisma.accountHolder.create({
        data: {
          email: `${marker}@test.local`,
          emailVerifiedAt: new Date(),
          isSelfLearner: true,
        },
      });
      const profile = await prisma.learnerProfile.create({
        data: {
          accountHolderId: accountHolder.id,
          displayName: marker,
          isSelfLearner: true,
        },
      });
      const student = await prisma.student.create({
        data: {
          name: marker,
          adminUserId,
          learnerProfileId: profile.id,
        },
      });
      await prisma.consentRecord.create({
        data: {
          learnerProfileId: profile.id,
          adminUserId,
          version: 1,
          allowLiveSession: true,
          allowAudioRecording: false,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
          setByAccountHolderId: accountHolder.id,
          captureMethod: "electronic",
        },
      });

      await page.goto(`/admin/students/${student.id}`, { waitUntil: "domcontentloaded" });
      const start = page
        .getByTestId("student-ready-to-teach-banner")
        .getByTestId("start-whiteboard-session-btn");
      await expect(start).toBeVisible({ timeout: 20_000 });
      await expect(start).toBeEnabled({ timeout: 20_000 });
      await start.click();

      await expect(page.getByTestId("wb-waiting-overlay")).toBeVisible({ timeout: 90_000 });
      await page.getByTestId("wb-session-mode-in-person").click();

      const banner = page.getByTestId("wb-audio-consent-banner");
      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(banner).toContainText("Audio not recorded");
      await expect(banner).toContainText("parent has not allowed session audio");

      const record = await prisma.consentRecord.findFirst({
        where: { learnerProfileId: profile.id, adminUserId },
        orderBy: { version: "desc" },
      });
      expect(record?.allowAudioRecording).toBe(false);

      const session = await prisma.whiteboardSession.findFirst({
        where: { studentId: student.id },
        orderBy: { startedAt: "desc" },
        include: { consentSnapshot: true },
      });
      expect(session?.consentSnapshot?.allowAudioRecording).toBe(false);
      expect(session?.consentSnapshot?.consentRecordId).toBe(record?.id);
    } finally {
      await prisma.$disconnect();
    }
  });
});
