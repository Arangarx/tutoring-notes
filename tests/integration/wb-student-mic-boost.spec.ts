import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  loginLearnerInContext,
  readEncryptionKeyFromHash,
  seedWbLiveSyncSession,
  waitForTutorStudentConnected,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import {
  STORAGE_LEARNER_MIC_GAIN_KEY_PREFIX,
} from "../../src/lib/recording/storage";
import { TAG } from "../test-tags";

/**
 * WS-M — student self-boost on live-A/V publish path.
 *
 * SCOPE CAVEAT: this spec validates gain persistence and mute/toggle UI
 * behavior only. It CANNOT verify that the tutor actually hears boosted
 * audio or that student mute produces tutor-side silence — a two-device
 * real-hardware smoke is required before merge to master.
 *
 * Run: npm run test:wb-playwright -- tests/integration/wb-student-mic-boost.spec.ts --workers=1
 */
test.describe("student mic boost (WS-M)", { tag: [TAG.WB_AV] }, () => {
  test("waiting overlay shows boost slider; gain change + mute do not drop mic", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();

    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone", "camera"],
    });

    const learnerAuthFile = path.join(
      process.cwd(),
      "tests",
      "integration",
      ".auth",
      "learner.json"
    );
    const learnerStorageState = fs.existsSync(learnerAuthFile)
      ? learnerAuthFile
      : undefined;

    const studentContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ["microphone", "camera"],
      ...(learnerStorageState ? { storageState: learnerStorageState } : {}),
    });
    if (!learnerStorageState) {
      await loginLearnerInContext(
        studentContext,
        session.learnerHandle,
        session.learnerPin
      );
    }

    const tutorPage = await tutorContext.newPage();
    const studentPage = await studentContext.newPage();
    try {
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(
        tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });
      await waitForWbE2eBridge(tutorPage, "tutor");

      const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

      await studentPage.goto(
        `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(
        studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });
      await waitForWbE2eBridge(studentPage, "student");

      await expect(
        studentPage.getByTestId("wb-waiting-overlay")
      ).toBeVisible({ timeout: 60_000 });

      const micToggle = studentPage
        .getByTestId("wb-waiting-overlay")
        .getByTestId("wb-topbar-mic-toggle");
      await micToggle.click();

      const micSettings = studentPage
        .getByTestId("wb-waiting-overlay")
        .getByTestId("wb-topbar-mic-settings");
      await expect(micSettings).toBeVisible({ timeout: 10_000 });
      await micSettings.click();

      const popover = studentPage
        .getByTestId("wb-waiting-overlay")
        .locator(".mynk-wb-mic-popover");
      const gainSlider = popover.getByTestId("mic-gain-slider");
      await expect(gainSlider).toBeVisible({ timeout: 5_000 });
      await expect(popover.getByTestId("recording-chime-enabled")).toHaveCount(0);

      await gainSlider.fill("2");
      await expect(gainSlider).toHaveValue("2");

      const gainKey = `${STORAGE_LEARNER_MIC_GAIN_KEY_PREFIX}${session.learnerProfileId}`;
      await expect
        .poll(async () => studentPage.evaluate((k) => localStorage.getItem(k), gainKey))
        .toBe("2");

      await waitForTutorStudentConnected(tutorPage);

      await micToggle.click();
      await expect(micToggle).toHaveClass(/mynk-wb-tb-btn--mic-off/);
      await micToggle.click();
      await expect(micToggle).not.toHaveClass(/mynk-wb-tb-btn--mic-off/);

      await expect(
        studentPage.getByTestId("wb-waiting-overlay")
      ).toBeVisible();
    } finally {
      await studentPage.close().catch(() => {});
      await tutorPage.close().catch(() => {});
      await studentContext.close();
      await tutorContext.close();
    }
  });
});
