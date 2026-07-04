/**
 * WS-E E5 (BUG-6) — roughness style must commit to Excalidraw appState so new
 * freedraw strokes use the selected roughness (captureUpdate IMMEDIATELY).
 *
 * Red-before: without captureUpdate, drawn element roughness stays at default (0).
 * Green-after: element roughness matches the UI-selected value (2 = Cartoon).
 *
 * Run:
 *   npx playwright test tests/integration/wb-roughness-style.spec.ts --project=integration --workers=1
 */

import { test, expect } from "./fixtures";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

test.describe("WS-E E5 roughness style", { tag: [TAG.WB_RECORDING] }, () => {
  test("Cartoon roughness via UI → freedraw stroke inherits roughness=2", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(page, "tutor");

    await page.getByRole("button", { name: "Pencil (P)" }).click();

    const trigger = page.getByTestId("wb-props-compact-trigger");
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click();

    const panel = page.getByTestId("wb-props-panel");
    await expect(panel).toBeVisible({ timeout: 3_000 });

    await panel.getByTestId("wb-more-styles-btn").click();
    await panel.getByRole("button", { name: "Cartoon", exact: true }).click();

    const canvas = page
      .locator('[data-testid="tutor-whiteboard-canvas-mount"] canvas')
      .first();
    await canvas.waitFor({ state: "visible", timeout: 60_000 });

    const box = await canvas.boundingBox();
    if (!box) throw new Error("Excalidraw canvas has no bounding box");

    const x0 = box.x + box.width * 0.35;
    const y0 = box.y + box.height * 0.4;
    const x1 = box.x + box.width * 0.55;
    const y1 = box.y + box.height * 0.55;

    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 8 });
    await page.mouse.up();

    await page.waitForTimeout(500);

    const roughness = await page.evaluate(() => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              getElements: () => Array<{ type?: string; roughness?: number }>;
            }
          >;
        }
      ).__TN_WB_E2E__?.tutor;
      if (!bridge?.getElements) {
        throw new Error("E2E bridge missing getElements for tutor");
      }
      const drawTypes = new Set(["freedraw", "line", "draw"]);
      const drawn = bridge
        .getElements()
        .filter((el) => el.type && drawTypes.has(el.type));
      if (drawn.length === 0) {
        throw new Error("No draw stroke found in scene after freedraw");
      }
      const last = drawn[drawn.length - 1]!;
      return last.roughness;
    });

    expect(roughness).toBe(2);
  });
});
