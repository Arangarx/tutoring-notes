/**
 * Item 5 — the shortcuts panel closes on outside click and Escape.
 *
 * Run:
 *   npx playwright test tests/integration/wb-shortcut-help-dismiss.spec.ts --project=wb-regression --workers=1
 */

import { expect, test } from "./fixtures";
import { TAG } from "../test-tags";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";

test.describe("whiteboard shortcut help dismisses", { tag: [TAG.WB_CHROME] }, () => {
  test("closes on canvas click and Escape, stays open for an inside click, and the button still toggles", async ({
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
    await waitForWbE2eBridge(page, "tutor");

    const button = page.getByTestId("wb-shortcut-help");
    const panel = page.getByTestId("wb-shortcut-help-panel");
    const canvas = page.getByTestId("tutor-whiteboard-canvas-mount");

    await button.click();
    await expect(panel).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");

    await button.click();
    await expect(panel).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await button.click();
    await expect(panel).toBeVisible();
    await canvas.click();
    await expect(panel).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await button.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
    await page.keyboard.press("Space");
    await expect(panel).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await button.click();
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    await page.mouse.click(panelBox!.x + 16, panelBox!.y + 16);
    await expect(panel).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
