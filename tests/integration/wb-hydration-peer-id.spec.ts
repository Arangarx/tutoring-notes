/**
 * Waiting-room tiles must not hydrate a different peer id than the server
 * HTML. The local tile's data-peer-id is minted from sessionStorage on the
 * client and from a fresh id on the server. React then logs
 * "A tree hydrated but some attributes ... didn't match" and can remount
 * the waiting-room overlay.
 *
 * Oracle: browser console / pageerror, not the peer-id formula. The
 * mismatch is logged after the overlay is visible, so the check waits
 * briefly for that message. After mount the tile shows a real id.
 */
import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

import { TAG } from "../test-tags";
import {
  loginLearnerInContext,
  readEncryptionKeyFromHash,
  seedWbPendingLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";

const HYDRATION_PATTERN = /hydrat|did not match|didn't match/i;

function watchHydration(page: Page): string[] {
  const hits: string[] = [];
  const consider = (text: string) => {
    if (HYDRATION_PATTERN.test(text)) hits.push(text.slice(0, 500));
  };
  page.on("console", (msg: ConsoleMessage) => consider(msg.text()));
  page.on("pageerror", (err) => consider(err.message));
  return hits;
}

async function expectNoHydrationMismatch(page: Page, hits: string[]): Promise<void> {
  await page.waitForTimeout(2_000);
  expect(hits, hits.join("\n")).toEqual([]);
}

test.describe("waiting-room peer id hydration", { tag: [TAG.WB_CHROME, TAG.WB_AV] }, () => {
  test("tutor workspace and student join log no hydration mismatch", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbPendingLiveSyncSession();

    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone", "camera"],
    });
    const studentCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ["microphone", "camera"],
    });

    try {
      await loginLearnerInContext(studentCtx, session.learnerHandle, session.learnerPin);

      const tutorPage = await tutorCtx.newPage();
      const tutorHydration = watchHydration(tutorPage);
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await expect(tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible({
        timeout: 30_000,
      });
      await expectNoHydrationMismatch(tutorPage, tutorHydration);
      const tutorPeer = tutorPage.locator("[data-peer-id]").first();
      await expect(tutorPeer).toBeVisible();
      await expect(tutorPeer).not.toHaveAttribute("data-peer-id", "pending");

      await waitForWbE2eBridge(tutorPage, "tutor");
      const encryptionKey = await readEncryptionKeyFromHash(tutorPage);
      const studentPage = await studentCtx.newPage();
      const studentHydration = watchHydration(studentPage);
      await studentPage.goto(`/join/${session.whiteboardSessionId}#k=${encryptionKey}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await expect(studentPage.getByTestId("wb-waiting-overlay")).toBeVisible({
        timeout: 30_000,
      });
      await expectNoHydrationMismatch(studentPage, studentHydration);
      const studentPeer = studentPage.locator("[data-peer-id]").first();
      await expect(studentPeer).toBeVisible();
      await expect(studentPeer).not.toHaveAttribute("data-peer-id", "pending");
    } finally {
      await tutorCtx.close();
      await studentCtx.close();
    }
  });
});
