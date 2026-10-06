/**
 * Shift + rectangle/ellipse — Excalidraw native aspect lock (no app handler).
 * Oracle: drawn shape width ≈ height when Shift held during drag.
 */

import { test, expect } from "./fixtures";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

async function dragOnCanvasWithShift(
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

  await page.keyboard.down("Shift");
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
}

function aspectRatioFromBridge(
  page: import("@playwright/test").Page,
  type: "rectangle" | "ellipse"
): Promise<number> {
  return page.evaluate((shapeType) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<
          string,
          {
            getElements: () => Array<{
              type?: string;
              width?: number;
              height?: number;
            }>;
          }
        >;
      }
    ).__TN_WB_E2E__?.tutor;
    if (!bridge?.getElements) {
      throw new Error("E2E bridge missing getElements for tutor");
    }
    const shapes = bridge
      .getElements()
      .filter((el) => el.type === shapeType);
    if (shapes.length === 0) {
      throw new Error(`No ${shapeType} found in scene after draw`);
    }
    const last = shapes[shapes.length - 1]!;
    const w = last.width ?? 0;
    const h = last.height ?? 0;
    if (!(w > 0 && h > 0)) throw new Error("Shape has non-positive dimensions");
    return w / h;
  }, type);
}

test.describe("Shift square/circle (native Excalidraw)", { tag: [TAG.WB_STROKES] }, () => {
  test("Shift+rectangle drag yields equal width and height", async ({ page }) => {
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

    await page.getByRole("button", { name: /Shapes/i }).click();
    await page
      .locator(".mynk-wb-shapes-dropdown")
      .getByRole("menuitem", { name: /Rectangle/i })
      .click();

    await dragOnCanvasWithShift(
      page,
      "tutor",
      { xFrac: 0.25, yFrac: 0.3 },
      { xFrac: 0.55, yFrac: 0.62 }
    );
    await page.waitForTimeout(400);

    const ratio = await aspectRatioFromBridge(page, "rectangle");
    expect(ratio).toBeGreaterThan(0.92);
    expect(ratio).toBeLessThan(1.08);
  });

  test("Shift+ellipse drag yields equal width and height", async ({ page }) => {
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

    await page.getByRole("button", { name: /Shapes/i }).click();
    await page
      .locator(".mynk-wb-shapes-dropdown")
      .getByRole("menuitem", { name: /Ellipse/i })
      .click();

    await dragOnCanvasWithShift(
      page,
      "tutor",
      { xFrac: 0.3, yFrac: 0.35 },
      { xFrac: 0.58, yFrac: 0.68 }
    );
    await page.waitForTimeout(400);

    const ratio = await aspectRatioFromBridge(page, "ellipse");
    expect(ratio).toBeGreaterThan(0.92);
    expect(ratio).toBeLessThan(1.08);
  });
});
