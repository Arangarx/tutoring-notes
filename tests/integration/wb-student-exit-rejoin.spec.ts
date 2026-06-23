import { test, expect } from "@playwright/test";
import {
  openTutorAndStudent,
  seedWbLiveSyncSession,
  waitForTutorStudentConnected,
} from "./whiteboard-live-sync.helpers";

/**
 * Student Exit → same-link rejoin must recover tutor presence + student connected state.
 *
 * Run: npm run test:wb-playwright -- tests/integration/wb-student-exit-rejoin.spec.ts
 */
test.describe("student exit and rejoin", () => {
  test("fresh join — no student excalidraw reload guard while connected", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await waitForTutorStudentConnected(peers.tutorPage);
      await expect(peers.studentPage.getByTestId("wb-student-sync-pill")).toHaveText(
        /^Connected$/i,
        { timeout: 60_000 }
      );
      await expect(
        peers.studentPage.getByTestId("student-excalidraw-loading-guard")
      ).not.toBeVisible();
    } finally {
      await peers.close();
    }
  });

  test("exit then rejoin same URL — tutor sync pill + student not waiting", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await peers.studentPage.getByTestId("wb-student-exit").click();
      await expect(peers.studentPage.getByRole("status")).toHaveText(
        /you left the session/i,
        { timeout: 15_000 }
      );

      await expect(peers.tutorPage.getByTestId("wb-sync-pill")).not.toBeVisible({
        timeout: 30_000,
      });

      await peers.studentPage.getByTestId("wb-student-rejoin").click();
      await expect(
        peers.studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });

      await waitForTutorStudentConnected(peers.tutorPage);

      await expect(peers.studentPage.getByTestId("wb-student-sync-pill")).toHaveText(
        /^Connected$/i,
        { timeout: 60_000 }
      );
      await expect(peers.studentPage.getByTestId("wb-student-timer")).not.toHaveText(
        /\(waiting\)/i,
        { timeout: 60_000 }
      );
      await expect(
        peers.studentPage.getByTestId("student-excalidraw-loading-guard")
      ).not.toBeVisible();
    } finally {
      await peers.close();
    }
  });
});
