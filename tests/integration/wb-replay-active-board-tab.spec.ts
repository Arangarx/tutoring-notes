/**
 * WS-E E4 (BUG-5) — replay board tab strip reflects which board was active
 * at the scrubbed timeline position (page-switch WBEvents).
 *
 * Run:
 *   npx playwright test tests/integration/wb-replay-active-board-tab.spec.ts --project=integration --workers=1
 */

import { test, expect } from "./fixtures";
import {
  clickBoardPageTab,
  drawTestStrokeOnRole,
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { readLocalEnv } from "../utils/read-dotenv";
import { TAG } from "../test-tags";

type EventsBody = {
  events?: Array<{ t: number; type: string; pageId?: string }>;
  durationMs?: number;
};

async function assertReplayBoardTabSelected(
  page: import("@playwright/test").Page,
  boardLabel: string,
  selected: boolean
) {
  const tab = page
    .getByTestId("wb-replay-board-tabs")
    .getByRole("tab", { name: boardLabel, exact: true });
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await expect(tab).toHaveAttribute(
    "aria-selected",
    selected ? "true" : "false"
  );
}

test.describe("WS-E E4 replay active board tab", { tag: [TAG.WB_RECORDING] }, () => {
  test("scrub timeline updates active replay board tab (2 boards)", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for integration recording."
    );

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(page, "tutor");

    await page.waitForTimeout(2_000);

    const board1Stroke = `e4-b1-${Date.now()}`;
    await drawTestStrokeOnRole(page, "tutor", board1Stroke, 40, 40, 120, 120);

    await page.waitForTimeout(1_500);

    await page
      .getByTestId("wb-tutor-page-strip")
      .getByRole("button", { name: "Add board" })
      .click();
    await expect(
      page
        .getByTestId("wb-tutor-page-strip")
        .getByRole("tab", { name: "Board 2", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(1_500);

    const board2Stroke = `e4-b2-${Date.now()}`;
    await drawTestStrokeOnRole(page, "tutor", board2Stroke, 180, 180, 280, 280);

    await page.waitForTimeout(1_500);

    await clickBoardPageTab(page, "tutor", "Board 1");
    await page.waitForTimeout(1_500);
    await clickBoardPageTab(page, "tutor", "Board 2");
    await page.waitForTimeout(1_500);

    await page.getByTestId("wb-end-session").click();
    const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
    if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({
      timeout: 60_000,
    });

    const eventsRes = await page.request.get(
      `/api/whiteboard/${whiteboardSessionId}/events`
    );
    expect(eventsRes.ok(), await eventsRes.text()).toBeTruthy();
    const eventsBody = (await eventsRes.json()) as EventsBody;
    const switches = (eventsBody.events ?? []).filter(
      (e) => e.type === "page-switch"
    );
    expect(switches.length).toBeGreaterThanOrEqual(2);

    const firstSwitchT = switches[0]!.t;
    const lastSwitchT = switches[switches.length - 1]!.t;
    expect(lastSwitchT).toBeGreaterThan(firstSwitchT);

    await page.getByTestId("wb-review-enter-replay").click();
    await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("wb-replay-board-tabs")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page
        .getByTestId("wb-replay-board-tabs")
        .getByRole("tab", { name: "Board 2", exact: true })
    ).toBeVisible();

    const playBtn = page.getByTestId("wb-replay-play-toggle");
    if ((await playBtn.textContent())?.includes("Pause")) {
      await playBtn.click();
    }

    const seekSlider = page.getByTestId("wb-replay-global-seek");
    await expect(seekSlider).toBeVisible();

    await seekSlider.focus();
    await page.keyboard.press("Home");
    await page.waitForTimeout(400);
    await assertReplayBoardTabSelected(page, "Board 1", true);
    await assertReplayBoardTabSelected(page, "Board 2", false);

    await seekSlider.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(400);
    await assertReplayBoardTabSelected(page, "Board 2", true);
    await assertReplayBoardTabSelected(page, "Board 1", false);
  });
});
