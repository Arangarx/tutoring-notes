/**
 * WB-SHARE-REPLAY-VIEWPORT-PHONE — share replay on phone must not show a blank
 * blue canvas with bottom chrome off-screen. Viewport-locked shell + real
 * canvas height chain (relational oracles, not absolute pixel positions).
 *
 * Run:
 *   npx playwright test tests/integration/wb-share-replay-viewport-phone.spec.ts --project=wb-regression --workers=1
 */

import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { TEST_LEARNER } from "../visual/helpers";
import {
  drawTestStrokeOnRole,
  loginAccountHolderInContext,
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { resolveShareTokenForStudent } from "./share-page-audio-scrub.helpers";
import { TAG } from "../test-tags";

const PHONE_VIEWPORT = { width: 390, height: 844 };
const TEST_LEARNER_PARENT_AH_PASSWORD = "PlaywrightParentAh!456";

/** Minimum canvas host height as a fraction of viewport — catches 0×0 / collapsed shell. */
const MIN_CANVAS_HEIGHT_VIEWPORT_RATIO = 0.35;

async function loginOwningParentForShare(
  context: import("@playwright/test").BrowserContext
) {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(TEST_LEARNER_PARENT_AH_PASSWORD, 10);
    await prisma.accountHolder.update({
      where: { email: TEST_LEARNER.parentEmail },
      data: { passwordHash, emailVerifiedAt: new Date("2026-01-01") },
    });
  } finally {
    await prisma.$disconnect();
  }
  await loginAccountHolderInContext(
    context,
    TEST_LEARNER.parentEmail,
    TEST_LEARNER_PARENT_AH_PASSWORD
  );
}

async function muteReplayAudioWhenPresent(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const muteIfPresent = () => {
      const el = document.querySelector(
        '[data-testid="wb-replay-audio"]'
      ) as HTMLAudioElement | null;
      if (el && !el.dataset.mutedByTest) {
        el.muted = true;
        el.dataset.mutedByTest = "1";
      }
    };
    const obs = new MutationObserver(muteIfPresent);
    obs.observe(document.body, { childList: true, subtree: true });
    muteIfPresent();
  });
}

async function endSessionWithStroke(
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
  await page.waitForTimeout(2_000);

  const strokeId = `share-vp-${Date.now()}`;
  await drawTestStrokeOnRole(page, "tutor", strokeId, 80, 80, 200, 200);
  await page.waitForTimeout(1_500);

  await page.getByTestId("wb-end-session").click();
  const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
  if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 120_000,
  });
}

type ShareReplayLayoutMetrics = {
  viewportHeight: number;
  pageScrollHeight: number;
  canvasHeight: number;
  topBarBottom: number;
  footerTop: number;
  timelineBottom: number;
  pageStripBottom: number;
};

/** Relational layout oracle — canvas fills body between top bar and footer chrome. */
async function readShareReplayLayoutMetrics(
  page: import("@playwright/test").Page
): Promise<ShareReplayLayoutMetrics> {
  return page.evaluate(() => {
    const viewportHeight = window.innerHeight;
    const pageScrollHeight = document.documentElement.scrollHeight;
    const canvas = document.querySelector(
      ".wb-replay-canvas-host"
    ) as HTMLElement | null;
    const topBar = document.querySelector(
      ".mynk-wb-chrome[data-mode='replay'] .mynk-wb-topbar"
    ) as HTMLElement | null;
    const timeline = document.querySelector(
      '[data-testid="wb-replay-timeline-strip"]'
    ) as HTMLElement | null;
    const pageStrip = document.querySelector(
      '[data-testid="wb-replay-board-tabs"]'
    ) as HTMLElement | null;

    const canvasBox = canvas?.getBoundingClientRect();
    const topBarBox = topBar?.getBoundingClientRect();
    const timelineBox = timeline?.getBoundingClientRect();
    const pageStripBox = pageStrip?.getBoundingClientRect();

    const canvasHeight = canvasBox?.height ?? 0;
    const topBarBottom = topBarBox?.bottom ?? 0;
    const footerTop = Math.min(
      timelineBox?.top ?? viewportHeight,
      pageStripBox?.top ?? viewportHeight
    );

    return {
      viewportHeight,
      pageScrollHeight,
      canvasHeight,
      topBarBottom,
      footerTop,
      timelineBottom: timelineBox?.bottom ?? 0,
      pageStripBottom: pageStripBox?.bottom ?? 0,
    };
  });
}

test.describe(
  "WB-SHARE-REPLAY-VIEWPORT-PHONE share replay phone viewport",
  { tag: [TAG.WB_VIEWPORT, TAG.WB_CHROME] },
  () => {
    test("share replay at 390×844: viewport-locked shell, canvas height, footer in view", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      await page.setViewportSize(PHONE_VIEWPORT);

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await endSessionWithStroke(page, studentId, whiteboardSessionId);
      const shareToken = await resolveShareTokenForStudent(studentId);

      await loginOwningParentForShare(page.context());
      await muteReplayAudioWhenPresent(page);

      const response = await page.goto(
        `/s/${shareToken}/whiteboard/${whiteboardSessionId}`,
        { waitUntil: "domcontentloaded" }
      );
      expect(response?.status()).toBe(200);

      await expect(page.getByTestId("wb-share-replay-page")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByTestId("wb-replay-timeline-strip")).toBeVisible({
        timeout: 30_000,
      });

      // Wait for replay paint + layout settle (camera fitter rAF retries).
      await page.waitForTimeout(2_000);

      const metrics = await readShareReplayLayoutMetrics(page);

      // Page must not scroll — replay chrome is viewport-locked.
      expect(
        metrics.pageScrollHeight,
        "share replay page should not extend beyond viewport (no page scroll)"
      ).toBeLessThanOrEqual(metrics.viewportHeight + 4);

      expect(
        metrics.canvasHeight,
        "canvas host must have real height (not collapsed 0×0 shell)"
      ).toBeGreaterThan(
        metrics.viewportHeight * MIN_CANVAS_HEIGHT_VIEWPORT_RATIO
      );

      // Bottom chrome discoverable without scrolling.
      expect(
        metrics.timelineBottom,
        "timeline strip must sit within viewport"
      ).toBeLessThanOrEqual(metrics.viewportHeight + 2);
      expect(
        metrics.pageStripBottom,
        "board tab strip must sit within viewport"
      ).toBeLessThanOrEqual(metrics.viewportHeight + 2);

      // Relational oracle: canvas fills the body column between top bar and footer.
      const bodyColumnHeight = metrics.footerTop - metrics.topBarBottom;
      expect(bodyColumnHeight, "body column between chrome bars").toBeGreaterThan(
        200
      );
      expect(
        metrics.canvasHeight / bodyColumnHeight,
        `canvas should fill most of body column (canvas=${metrics.canvasHeight.toFixed(0)} body=${bodyColumnHeight.toFixed(0)})`
      ).toBeGreaterThan(0.75);
    });
  }
);
