/**
 * Notes "View whiteboard" / "Watch whiteboard" must mount WhiteboardReplayInFrame,
 * not legacy WhiteboardReplay (old range scrubber + tiny board).
 *
 * Oracles:
 *   - `wb-replay-in-frame` present
 *   - legacy `wb-replay` absent
 *
 * Run:
 *   npx playwright test tests/integration/view-whiteboard-new-replay.spec.ts --project=wb-regression
 */

import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { resolveShareTokenForStudent } from "./share-page-audio-scrub.helpers";
import { TAG } from "../test-tags";

async function endSessionOnWorkspace(
  page: import("@playwright/test").Page,
  studentId: string,
  whiteboardSessionId: string
) {
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(page, "tutor");
  await page.waitForTimeout(3_000);
  await page.getByTestId("wb-end-session").click();
  const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
  if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 120_000,
  });
}

async function assertNewReplayStack(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("wb-replay")).toHaveCount(0);
  await expect(page.getByTestId("wb-replay-timeline-strip")).toBeVisible();
}

test.describe(
  "view whiteboard from notes — new in-frame replay",
  { tag: [TAG.WB_CHROME, TAG.WB_RECORDING] },
  () => {
    test("tutor note link ?surface=replay auto-enters WhiteboardReplayInFrame", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await endSessionOnWorkspace(page, studentId, whiteboardSessionId);

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace?surface=replay`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("wb-session-review-mode")).toHaveAttribute(
        "data-review-surface",
        "replay"
      );
      await assertNewReplayStack(page);
    });

    test("legacy standalone review URL redirects to workspace in-frame replay", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const prisma = new PrismaClient();
      const { studentId, whiteboardSessionId } = await (async () => {
        try {
          const session = await seedWbLiveSyncSession();
          await prisma.whiteboardSession.update({
            where: { id: session.whiteboardSessionId },
            data: {
              endedAt: new Date(Date.now() - 60_000),
              eventsBlobUrl: "https://pw.local/events-fixture.json",
            },
          });
          return {
            studentId: session.studentId,
            whiteboardSessionId: session.whiteboardSessionId,
          };
        } finally {
          await prisma.$disconnect();
        }
      })();

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(page).toHaveURL(
        new RegExp(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace\\?surface=replay`
        )
      );
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 30_000,
      });
    });

    test("parent share note View whiteboard opens WhiteboardReplayInFrame", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await endSessionOnWorkspace(page, studentId, whiteboardSessionId);
      const shareToken = await resolveShareTokenForStudent(studentId);

      await page.goto(`/s/${shareToken}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("share-wb-replay-links")).toBeVisible({
        timeout: 30_000,
      });

      await page
        .getByRole("link", { name: /view whiteboard/i })
        .first()
        .click();

      await expect(page).toHaveURL(
        new RegExp(`/s/${shareToken}/whiteboard/${whiteboardSessionId}`)
      );
      await assertNewReplayStack(page);
    });
  }
);
