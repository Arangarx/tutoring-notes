/**
 * WS-O — board tab strip overflow affordance (scroll controls + active-tab into view).
 *
 * Run:
 *   npx playwright test tests/integration/wb-board-tab-overflow.spec.ts --project=wb-regression --workers=1
 */

import { test, expect, type Page } from "@playwright/test";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
  clickBoardPageTab,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

async function loadTutorBoard(page: Page, session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>) {
  await page.goto(
    `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("mynk-wb-chrome")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({ timeout: 90_000 });
  await waitForWbE2eBridge(page, "tutor");
}

async function addBoards(page: Page, count: number) {
  const addBtn = page
    .getByTestId("wb-tutor-page-strip")
    .getByRole("button", { name: "Add board" });
  for (let i = 0; i < count; i++) {
    await addBtn.click();
    await expect(
      page
        .getByTestId("wb-tutor-page-strip")
        .getByRole("tab", { name: `Board ${i + 2}`, exact: true })
    ).toBeVisible({ timeout: 10_000 });
  }
}

/** Active tab's bounding box must lie inside the scroll container's client rect. */
async function assertActiveTabVisibleInStrip(page: Page) {
  const inView = await page.evaluate(() => {
    const strip = document.querySelector(".mynk-wb-board-tabs");
    const active = document.querySelector(".mynk-wb-board-tab-wrap--active");
    if (!strip || !active) return { ok: false, reason: "missing strip or active tab" };
    const stripRect = strip.getBoundingClientRect();
    const tabRect = active.getBoundingClientRect();
    const leftOk = tabRect.left >= stripRect.left - 1;
    const rightOk = tabRect.right <= stripRect.right + 1;
    return {
      ok: leftOk && rightOk,
      stripLeft: stripRect.left,
      stripRight: stripRect.right,
      tabLeft: tabRect.left,
      tabRight: tabRect.right,
    };
  });
  expect(inView.ok, JSON.stringify(inView)).toBe(true);
}

test.describe("WS-O board tab overflow", { tag: [TAG.WB_CHROME] }, () => {
  test("overflow affordance reaches last tab; active tab stays in strip viewport", async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 520, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    const tabStrip = page.getByTestId("wb-tutor-page-strip");
    await addBoards(page, 9);

    const overflow = await page.evaluate(() => {
      const el = document.querySelector(".mynk-wb-board-tabs");
      if (!el) return { hasOverflow: false };
      return {
        hasOverflow: el.scrollWidth > el.clientWidth + 1,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });
    expect(overflow.hasOverflow, "expected tab strip to overflow at narrow viewport").toBe(true);

    const scrollLeft = page.getByTestId("wb-board-tabs-scroll-left");
    const scrollRight = page.getByTestId("wb-board-tabs-scroll-right");

    // After adding boards the strip is scrolled to the end — scroll back to reach Board 1.
    for (let attempt = 0; attempt < 12; attempt++) {
      const atStart = await page.evaluate(() => {
        const el = document.querySelector(".mynk-wb-board-tabs");
        return el ? el.scrollLeft <= 1 : true;
      });
      if (atStart) break;
      if (await scrollLeft.isVisible()) {
        await scrollLeft.click();
        await page.waitForTimeout(200);
      }
    }

    await clickBoardPageTab(page, "tutor", "Board 1");
    await expect(
      tabStrip.getByRole("tab", { name: "Board 1", exact: true })
    ).toHaveAttribute("aria-selected", "true");

    const lastTab = tabStrip.getByRole("tab", { name: "Board 10", exact: true });
    for (let attempt = 0; attempt < 12; attempt++) {
      const box = await lastTab.boundingBox();
      const stripBox = await page.locator(".mynk-wb-board-tabs").boundingBox();
      if (box && stripBox && box.x + box.width <= stripBox.x + stripBox.width + 2) {
        break;
      }
      if (await scrollRight.isVisible()) {
        await scrollRight.click();
        await page.waitForTimeout(200);
      }
    }

    await clickBoardPageTab(page, "tutor", "Board 10");
    await expect(lastTab).toHaveAttribute("aria-selected", "true");
    await assertActiveTabVisibleInStrip(page);

    await context.close();
  });

  test("no scroll controls when only one board fits", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    await expect(page.getByTestId("wb-board-tabs-scroll-left")).not.toBeVisible();
    await expect(page.getByTestId("wb-board-tabs-scroll-right")).not.toBeVisible();

    await context.close();
  });
});
