import { test, expect } from "@playwright/test";

type CaptureDeferWindow = Window & {
  __TN_PW_CLIENT_SHA__?: string;
  __TN_PW_RELOAD_REQUESTED__?: boolean;
  __TN_CAPTURE_DEFER__?: {
    setCaptureDeferActive: (id: string, active: boolean) => void;
    isCaptureDeferred: () => boolean;
  };
};

/**
 * Deploy-freshness defer: version poll detects mismatch, defers reload during
 * live capture, then reloads when defer registry clears.
 *
 * Uses Playwright route mocking for /api/version and the __TN_PW_CLIENT_SHA__
 * init-script seam (NEXT_PUBLIC_PLAYWRIGHT_TEST=1) so the poll runs in dev.
 */
test.describe("deploy freshness capture defer", () => {
  test("poll defers reload during capture and reloads when defer clears", async ({
    page,
  }) => {
    const clientSha = "pw-deploy-freshness-client-sha-0001";
    const remoteSha = "pw-deploy-freshness-remote-sha-0002";

    await page.addInitScript((sha) => {
      (window as CaptureDeferWindow).__TN_PW_CLIENT_SHA__ = sha;
    }, clientSha);

    await page.route("**/api/version", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sha: remoteSha, shortSha: remoteSha.slice(0, 7) }),
      });
    });

    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    await page.waitForFunction(() => {
      const w = window as CaptureDeferWindow;
      return Boolean(w.__TN_CAPTURE_DEFER__);
    });

    await page.evaluate(() => {
      (window as CaptureDeferWindow).__TN_CAPTURE_DEFER__!.setCaptureDeferActive("pw-test", true);
    });

    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForTimeout(500);

    const reloadRequested = await page.evaluate(
      () => (window as CaptureDeferWindow).__TN_PW_RELOAD_REQUESTED__ === true,
    );
    expect(reloadRequested).toBe(false);

    await expect(
      page.getByText("A new version is ready — it'll apply automatically when your session ends."),
    ).toBeVisible({ timeout: 5_000 });

    await page.evaluate(() => {
      (window as CaptureDeferWindow).__TN_CAPTURE_DEFER__!.setCaptureDeferActive("pw-test", false);
    });

    await page.waitForFunction(
      () => (window as CaptureDeferWindow).__TN_PW_RELOAD_REQUESTED__ === true,
      undefined,
      { timeout: 5_000 },
    );
  });
});
