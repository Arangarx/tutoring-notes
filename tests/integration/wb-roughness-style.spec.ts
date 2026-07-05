/**
 * WS-R — roughness / edge-sharpness chrome visibility + rectangle roughness wiring.
 *
 * Independent oracle: DOM presence of style controls must match the active tool.
 * Pencil (freedraw) uses perfect-freehand — roughness is a visual no-op; controls
 * must be absent. Rectangle roughness is real; data-model assertion is valid there.
 *
 * Replaces the false-green WS-E spec that asserted element.roughness on freedraw.
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

async function openStrokePropsMoreStyles(page: import("@playwright/test").Page) {
  const trigger = page.getByTestId("wb-props-compact-trigger");
  await expect(trigger).toBeVisible({ timeout: 5_000 });
  await trigger.click();

  const panel = page.getByTestId("wb-props-panel");
  await expect(panel).toBeVisible({ timeout: 3_000 });
  await panel.getByTestId("wb-more-styles-btn").click();
  return panel;
}

async function dragOnCanvas(
  page: import("@playwright/test").Page,
  role: "tutor" | "student",
  from: { xFrac: number; yFrac: number },
  to: { xFrac: number; yFrac: number }
) {
  const canvas = page
    .locator(`[data-testid="${role}-whiteboard-canvas-mount"] canvas`)
    .first();
  await canvas.waitFor({ state: "visible", timeout: 60_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Excalidraw canvas has no bounding box");

  const x0 = box.x + box.width * from.xFrac;
  const y0 = box.y + box.height * from.yFrac;
  const x1 = box.x + box.width * to.xFrac;
  const y1 = box.y + box.height * to.yFrac;

  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
}

test.describe("WS-R roughness chrome visibility", { tag: [TAG.WB_RECORDING] }, () => {
  test("pencil active — roughness and edge-sharpness controls absent from DOM", async ({
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
    const panel = await openStrokePropsMoreStyles(page);

    await expect(panel.getByTestId("wb-roughness-section")).toHaveCount(0);
    await expect(panel.getByTestId("wb-roundness-section")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Cartoon", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Sharp", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Round", exact: true })).toHaveCount(0);
  });

  test("rectangle active — roughness visible; Cartoon → drawn rectangle roughness=2", async ({
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

    const shapesTrigger = page.getByRole("button", { name: /Shapes/i });
    await shapesTrigger.click();
    await page
      .locator(".mynk-wb-shapes-dropdown")
      .getByRole("menuitem", { name: /Rectangle/i })
      .click();

    const panel = await openStrokePropsMoreStyles(page);
    await expect(panel.getByTestId("wb-roughness-section")).toBeVisible();
    await panel.getByRole("button", { name: "Cartoon", exact: true }).click();

    await dragOnCanvas(page, "tutor", { xFrac: 0.3, yFrac: 0.35 }, { xFrac: 0.55, yFrac: 0.55 });
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
      const rects = bridge.getElements().filter((el) => el.type === "rectangle");
      if (rects.length === 0) {
        throw new Error("No rectangle found in scene after draw");
      }
      return rects[rects.length - 1]!.roughness;
    });

    expect(roughness).toBe(2);
  });

  // TODO(WS-R selection): selection-tool gating by selected element type deferred —
  // no selected-element types surfaced in chrome state without onChange appState plumbing.
  test("selection tool — stroke props chrome hidden (current behavior)", async ({ page }) => {
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

    await page.getByRole("button", { name: "Select (V)" }).click();
    await expect(page.getByTestId("wb-props-compact-trigger")).toHaveCount(0);
  });
});
