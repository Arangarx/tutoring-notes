/**
 * Item 4 — modifier hints sit just above the bottom of the visible board.
 *
 * Phone viewport. Relational gaps only (visual-layout-oracles): a few pixels
 * above the short bottom bar, then at or above the open styles sheet, and
 * inside the visible canvas.
 *
 * Run:
 *   npx playwright test tests/integration/wb-modifier-hints-placement.spec.ts --project=wb-regression --workers=1
 */

import { expect, test } from "@playwright/test";
import { TAG } from "../test-tags";
import {
  openTutorAndStudent,
  seedWbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";

const GAP_MAX_PX = 12;

test.describe(
  "modifier hints follow the visible board bottom",
  { tag: [TAG.WB_CHROME] },
  () => {
    test("on a phone, hints sit just above the short bottom bar and above the open styles sheet", async ({
      browser,
    }) => {
      test.setTimeout(240_000);

      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentViewport: { width: 390, height: 844 },
        studentHasTouch: true,
        studentIsMobile: true,
        ensureFollow: false,
      });

      try {
        const page = peers.studentPage;
        await expect(page.getByTestId("mynk-wb-chrome")).toHaveAttribute(
          "data-layout",
          "narrow",
          { timeout: 15_000 }
        );

        const hints = page.getByTestId("wb-modifier-hints");
        const toolbar = page.getByTestId("wb-bottom-toolbar");
        const canvas = page.getByTestId("student-whiteboard-canvas-mount");
        await expect(hints).toBeVisible();
        await expect(toolbar).toBeVisible();
        await expect(canvas).toBeVisible();

        const short = await gapAndContainment(
          page,
          "[data-testid='wb-bottom-toolbar']",
          "[data-testid='student-whiteboard-canvas-mount']"
        );
        expect(short.gap).toBeGreaterThanOrEqual(-2);
        expect(short.gap).toBeLessThanOrEqual(GAP_MAX_PX);
        expect(short.insideCanvas).toBe(true);

        await toolbar.getByRole("button", { name: /^Styles$/i }).click();
        const sheet = page.getByTestId("wb-props-sheet");
        await expect(sheet).toHaveClass(/mynk-wb-action-sheet--open/);
        await sheet.getByTestId("wb-more-styles-btn").click();
        await expect(sheet.getByTestId("wb-more-styles-btn")).toHaveAttribute(
          "aria-expanded",
          "true"
        );

        await expect
          .poll(
            async () =>
              (
                await gapAndContainment(
                  page,
                  "[data-testid='wb-props-sheet']",
                  "[data-testid='student-whiteboard-canvas-mount']"
                )
              ).gap,
            { timeout: 5_000 }
          )
          .toBeGreaterThanOrEqual(-2);

        const open = await gapAndContainment(
          page,
          "[data-testid='wb-props-sheet']",
          "[data-testid='student-whiteboard-canvas-mount']"
        );
        expect(open.gap).toBeLessThanOrEqual(GAP_MAX_PX);
        expect(open.overlapsCover).toBe(false);
        expect(open.insideCanvas).toBe(true);
      } finally {
        await peers.close();
      }
    });

    test("on a desktop tutor board, hints sit above the page strip and inside the canvas", async ({
      page,
    }) => {
      test.setTimeout(180_000);

      const session = await seedWbLiveSyncSession();
      await page.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await expect(page.getByTestId("mynk-wb-chrome")).toHaveAttribute(
        "data-layout",
        "desktop"
      );

      const hints = page.getByTestId("wb-modifier-hints");
      const strip = page.locator(".mynk-wb-pagestrip");
      await expect(hints).toBeVisible();
      await expect(strip).toBeVisible();

      await expect
        .poll(
          async () =>
            (
              await gapAndContainment(
                page,
                ".mynk-wb-pagestrip",
                "[data-testid='tutor-whiteboard-canvas-mount']"
              )
            ).gap,
          { timeout: 5_000 }
        )
        .toBeGreaterThanOrEqual(-2);

      const placed = await gapAndContainment(
        page,
        ".mynk-wb-pagestrip",
        "[data-testid='tutor-whiteboard-canvas-mount']"
      );
      expect(placed.gap).toBeLessThanOrEqual(GAP_MAX_PX);
      expect(placed.overlapsCover).toBe(false);
      expect(placed.insideCanvas).toBe(true);
    });
  }
);

async function gapAndContainment(
  page: import("@playwright/test").Page,
  coverSelector: string,
  canvasSelector: string
) {
  return page.evaluate(
    ({ coverSelector: coverSel, canvasSelector: canvasSel }) => {
    const hints = document.querySelector("[data-testid='wb-modifier-hints']");
    const cover = document.querySelector(coverSel);
    const canvas = document.querySelector(canvasSel);
    if (!hints || !cover || !canvas) {
      return { gap: -999, overlapsCover: true, insideCanvas: false };
    }
    const h = hints.getBoundingClientRect();
    const c = cover.getBoundingClientRect();
    const board = canvas.getBoundingClientRect();
    const visibleBottom = Math.min(board.bottom, c.top);
    const gap = c.top - h.bottom;
    const overlapsCover = h.bottom > c.top + 1 && h.top < c.bottom - 1;
    const insideCanvas =
      h.top >= board.top - 2 &&
      h.bottom <= visibleBottom + 2 &&
      h.left >= board.left - 2 &&
      h.right <= board.right + 2;
    return { gap, overlapsCover, insideCanvas };
  },
    { coverSelector, canvasSelector }
  );
}
