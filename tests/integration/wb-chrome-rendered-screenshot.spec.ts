import { test, expect } from "@playwright/test";
import path from "node:path";
import { seedWbLiveSyncSession, waitForWbE2eBridge } from "./whiteboard-live-sync.helpers";

/**
 * Captures a full-page PNG of the tutor live-board chrome for visual gate
 * against docs/brand-previews/whiteboard-session-shell-mock-2026-06-08.html.
 *
 * Run: npm run test:wb-playwright -- tests/integration/wb-chrome-rendered-screenshot.spec.ts
 */
test.describe("wb chrome rendered screenshot", () => {
  test("capture tutor workspace live board", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(
      `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId("mynk-wb-chrome")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(page, "tutor");

    // Pencil active ΓåÆ PP-06 props rail visible; eraser icon readable in strip
    await page.getByRole("button", { name: "Pencil (P)" }).click();

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outPath = path.join(
      process.cwd(),
      "docs",
      "brand-previews",
      `wb-chrome-p2-rendered-${stamp}.png`
    );

    await page.screenshot({ path: outPath, fullPage: true });
    test.info().attach("rendered-screenshot-path", {
      body: outPath,
      contentType: "text/plain",
    });

    await context.close();
  });
});
