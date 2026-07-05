import { test, expect } from "./fixtures";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import {
  seedWbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * Phase 0c acceptance — full stack (workspace → Blob upload → admin replay).
 * Requires `blobIntegrationEnabled()` (hermetic harness or real Blob token).
 *
 * Uses `seedWbLiveSyncSession` (not bare seedOpenWhiteboardSession) because it
 * creates the SessionConsentSnapshot row required for auto-start recording
 * (PRESARAH-1 always-on intent: recording starts automatically when consent is
 * present — there is no manual wb-start-recording button).
 */
test.describe("whiteboard recording integration", { tag: [TAG.WB_RECORDING] }, () => {
  test("tutor records solo session → ends → in-shell review shows stroke events and replay capability", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const { adminUserId, studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page).toHaveURL(/\/workspace$/);
    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    // Recording auto-starts (PRESARAH-1 always-on intent + consent present).
    // Give the MediaRecorder a moment to arm before drawing.
    await page.waitForTimeout(2_000);

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

    // End session — click the CTA, then confirm the dialog.
    await page.getByTestId("wb-end-session").click();
    const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
    if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // After session ends the shell flips to in-shell SessionReviewMode.
    await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
      timeout: 120_000,
    });

    const eventsRes = await page.request.get(
      `/api/whiteboard/${whiteboardSessionId}/events`
    );
    expect(eventsRes.ok(), await eventsRes.text()).toBeTruthy();
    const eventsBody = (await eventsRes.json()) as { events?: unknown[] };
    expect(eventsBody.events?.length ?? 0).toBeGreaterThan(0);

    // Verify the review mode loaded and has replay capability.
    await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({
      timeout: 30_000,
    });

    // Suppress unused-var warning — adminUserId captured from seed for audit trail.
    void adminUserId;
  });

  /**
   * In-shell SessionReviewMode replay — auto-starts from position 0.
   *
   * Regression gate: commit 3bc7a8e attempted to fix "replay jumps-to-end"
   * but the smoke still failed on real hardware. Root cause: seek(0,{play:true})
   * raced the WebM 1e101 duration-fix scan; Chrome parked currentTime at the
   * measured end before onDurationChange reset it. Fix: gate entry auto-play on
   * audioDurationSettled (only proceed after onDurationResolved fires).
   *
   * Tests the in-shell SessionReviewMode flow (wb-review-enter-replay →
   * wb-replay-in-frame) which is the primary review surface used by tutors.
   * Exercises BOTH first open AND re-open (hide → Replay session again).
   *
   * Requires blobIntegrationEnabled() for the Blob upload step.
   */
  test("in-shell SessionReviewMode replay auto-starts from position 0 (first open and re-open)", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const { adminUserId, studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    // ── Record a short session ────────────────────────────────────────────────

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    // Recording auto-starts (PRESARAH-1 always-on intent + consent present).
    await page.waitForTimeout(2_000);

    const canvas = page
      .locator('[data-testid="tutor-whiteboard-canvas-mount"] canvas')
      .first();
    await canvas.waitFor({ state: "visible", timeout: 60_000 });

    await page.keyboard.press("r");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Excalidraw canvas has no bounding box");
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(box.x + 90 + i * 75, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 160 + i * 75, box.y + 170);
      await page.mouse.up();
    }

    await page.waitForTimeout(6_000);

    // ── End session — click button + confirm dialog ───────────────────────────

    await page.getByTestId("wb-end-session").click();

    const confirmBtn2 = page.getByTestId("wb-end-session-confirm-yes");
    if (await confirmBtn2.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmBtn2.click();
    }

    // ── Wait for in-shell review mode ─────────────────────────────────────────
    // After confirming end-session the shell flips to SessionReviewMode
    // (URL stays at /workspace). Wait for the review surface to appear.

    await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
      timeout: 120_000,
    });

    // Wait for the review payload to load (wb-review-enter-replay button visible).
    await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({
      timeout: 60_000,
    });

    // ── Helper: mute wb-replay-audio as soon as it appears ───────────────────
    // Headless Chrome blocks autoplay for unmuted media elements without prior
    // user interaction. Mute via MutationObserver so the mute is applied before
    // the entry auto-play calls el.play(). The assertions on position/time are
    // still real — muting only enables headless playback.
    await page.evaluate(() => {
      const muteIfPresent = () => {
        const el = document.querySelector(
          '[data-testid="wb-replay-audio"]'
        ) as HTMLAudioElement | null;
        if (el && !el.dataset.mutedByTest) {
          el.muted = true;
          el.dataset.mutedByTest = "1";
        }
      };
      const obs = new MutationObserver(muteIfPresent);
      obs.observe(document.body, { childList: true, subtree: true });
      muteIfPresent();
      (window as { __testAudioObs?: MutationObserver }).__testAudioObs = obs;
    });

    // ── FIRST OPEN ────────────────────────────────────────────────────────────

    await page.getByTestId("wb-review-enter-replay").click();

    await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
      timeout: 30_000,
    });

    // Wait for the audio element to have a finite duration > 0. This confirms
    // the WebM scan has completed and audioDurationSettled is true in the hook.
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="wb-replay-audio"]'
        ) as HTMLAudioElement | null;
        return el != null && Number.isFinite(el.duration) && el.duration > 0;
      },
      { timeout: 90_000 }
    );

    // Give autoplay a moment to start advancing (entry effect fires after
    // audioDurationSettled becomes true, then startPlayWhenPositionReady
    // calls el.play() asynchronously).
    await page.waitForTimeout(1_500);

    // ── Assertions (first open) ───────────────────────────────────────────────
    // Oracle: the REQUIREMENT, not constants back-derived from the code.
    //   1. currentTime < 2 s  (near start, not at end)
    //   2. currentTime < duration - 2 s  (not parked at the end)
    //   3. currentTime is advancing  (playback is running)

    const firstOpenState = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="wb-replay-audio"]'
      ) as HTMLAudioElement | null;
      if (!el) return null;
      return { currentTime: el.currentTime, duration: el.duration };
    });

    expect(firstOpenState).not.toBeNull();
    const { currentTime: ct1, duration: dur1 } = firstOpenState!;

    expect(ct1, `First open: currentTime (${ct1}) must be near start, not end`).toBeLessThan(2);
    expect(ct1, `First open: currentTime (${ct1}) must not be near end (duration=${dur1})`).toBeLessThan(
      dur1 - 2
    );

    // Verify playback is advancing.
    await page.waitForTimeout(800);
    const ct1b = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="wb-replay-audio"]'
      ) as HTMLAudioElement | null;
      return el?.currentTime ?? -1;
    });
    expect(ct1b, `First open: currentTime must advance (was ${ct1}, now ${ct1b})`).toBeGreaterThan(
      ct1
    );

    // ── Hide replay and re-open ────────────────────────────────────────────────

    await page.getByTestId("wb-replay-hide").click();

    // Confirm we're back at the hero layout (wb-review-enter-replay visible again).
    await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({
      timeout: 10_000,
    });

    // ── SECOND OPEN (re-open case) ────────────────────────────────────────────

    await page.getByTestId("wb-review-enter-replay").click();

    await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
      timeout: 10_000,
    });

    // On re-open, audioDurationSettled is already true; entry effect fires
    // immediately and calls seek(0,{play:true}).
    await page.waitForTimeout(1_500);

    // ── Assertions (re-open) ─────────────────────────────────────────────────

    const secondOpenState = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="wb-replay-audio"]'
      ) as HTMLAudioElement | null;
      if (!el) return null;
      return { currentTime: el.currentTime, duration: el.duration };
    });

    expect(secondOpenState).not.toBeNull();
    const { currentTime: ct2, duration: dur2 } = secondOpenState!;

    expect(ct2, `Re-open: currentTime (${ct2}) must be near start, not end`).toBeLessThan(2);
    expect(ct2, `Re-open: currentTime (${ct2}) must not be near end (duration=${dur2})`).toBeLessThan(
      dur2 - 2
    );

    // Verify playback is advancing on re-open.
    await page.waitForTimeout(800);
    const ct2b = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="wb-replay-audio"]'
      ) as HTMLAudioElement | null;
      return el?.currentTime ?? -1;
    });
    expect(ct2b, `Re-open: currentTime must advance (was ${ct2}, now ${ct2b})`).toBeGreaterThan(
      ct2
    );

    // Cleanup observer.
    await page.evaluate(() => {
      (window as { __testAudioObs?: MutationObserver }).__testAudioObs?.disconnect();
    });

    void adminUserId;
  });
});
