import { test, expect } from "./fixtures";
import { readLocalEnv } from "../utils/read-dotenv";
import {
  seedTestAdmin,
  seedTestStudent,
  seedOpenWhiteboardSession,
} from "../visual/helpers";

/**
 * Phase 0c acceptance — full stack (workspace → Blob upload → admin replay).
 * Requires `BLOB_READ_WRITE_TOKEN` in `.env` (same as Blob-dependent smokes).
 */
test.describe("whiteboard recording integration", () => {
  test("tutor records 30s solo session → ends → admin replay route shows stroke events and audio scrubber", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for integration recording (Vercel Blob upload + register)."
    );

    const adminUserId = await seedTestAdmin();
    const { studentId } = await seedTestStudent(adminUserId);
    const whiteboardSessionId = await seedOpenWhiteboardSession({
      adminUserId,
      studentId,
    });

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page).toHaveURL(/\/workspace$/);
    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    await page.getByTestId("wb-start-recording").click();

    const canvas = page
      .locator('[data-testid="tutor-whiteboard-canvas-mount"] canvas')
      .first();
    await canvas.waitFor({ state: "visible", timeout: 60_000 });

    await page.keyboard.press("r");
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("Excalidraw canvas has no bounding box");
    }
    for (let i = 0; i < 3; i++) {
      const x0 = box.x + 90 + i * 75;
      const y0 = box.y + 100;
      const x1 = box.x + 160 + i * 75;
      const y1 = box.y + 170;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      await page.mouse.move(x1, y1);
      await page.mouse.up();
    }

    await page.waitForTimeout(5_000);

    await page.getByTestId("wb-end-session").click();

    await page.waitForURL(
      (u) =>
        u.pathname ===
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`,
      { timeout: 120_000 }
    );

    const eventsRes = await page.request.get(
      `/api/whiteboard/${whiteboardSessionId}/events`
    );
    expect(eventsRes.ok(), await eventsRes.text()).toBeTruthy();
    const eventsBody = (await eventsRes.json()) as { events?: unknown[] };
    expect(eventsBody.events?.length ?? 0).toBeGreaterThan(0);

    await expect(page.getByTestId("wb-replay")).toBeVisible();
    await expect(page.getByTestId("wb-replay-audio")).toBeVisible();

    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="wb-replay-audio"]'
        ) as HTMLAudioElement | null;
        return (
          el != null && Number.isFinite(el.duration) && el.duration > 0
        );
      },
      { timeout: 90_000 }
    );
  });
});
