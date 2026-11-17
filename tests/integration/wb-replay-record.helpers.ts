/**
 * Shared "record a real session, end it, land in review" helpers for the
 * replay specs (scrub-seek, start-position). One implementation of the VAD
 * override harness and the End flow, so a change to either is made once.
 */

import { expect, type Page } from "@playwright/test";
import { waitForWbE2eBridge } from "./whiteboard-live-sync.helpers";

const VAD_METER_HIGH = 0.5;
const VAD_METER_LOW = 0;

/** Shrink the VAD segmenter so a short test produces several tutor:mic segments. Call before page.goto. */
export async function injectVadOverrides(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_MIN_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_SILENCE_HOLD_MS_OVERRIDE?: number;
      __VAD_SILENCE_RMS_THRESHOLD_OVERRIDE?: number;
      __VAD_TEST_METER_LEVEL__?: number;
    };
    w.__VAD_MIN_SEGMENT_SECONDS_OVERRIDE = 1;
    w.__VAD_SILENCE_HOLD_MS_OVERRIDE = 800;
    w.__VAD_SILENCE_RMS_THRESHOLD_OVERRIDE = 0.15;
    w.__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 120;
    w.__VAD_TEST_METER_LEVEL__ = 0.5;
  });
}

async function setVadTestMeterLevel(page: Page, level: number) {
  await page.evaluate((lvl) => {
    (window as unknown as { __VAD_TEST_METER_LEVEL__?: number }).__VAD_TEST_METER_LEVEL__ = lvl;
  }, level);
}

/** Two silence cuts, so the recording holds three tutor:mic segments. */
export async function driveTwoVadSilenceCuts(page: Page) {
  await setVadTestMeterLevel(page, VAD_METER_HIGH);
  await page.waitForTimeout(1_200);
  await setVadTestMeterLevel(page, VAD_METER_LOW);
  await page.waitForTimeout(1_000);
  await setVadTestMeterLevel(page, VAD_METER_HIGH);
  await page.waitForTimeout(1_200);
  await setVadTestMeterLevel(page, VAD_METER_LOW);
  await page.waitForTimeout(1_000);
}

/**
 * Mute wb-replay-audio the moment it mounts. Headless Chrome can refuse
 * autoplay for unmuted media; position and time assertions stay real.
 */
export async function muteReplayAudioWhenPresent(page: Page) {
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
  });
}

/**
 * Open the workspace, record for a while, End the session, and wait for the
 * in-shell review's Replay button. `soloMs` is the idle recording time when
 * `multiSegment` is off.
 */
export async function recordEndEnterReplay(
  page: Page,
  studentId: string,
  whiteboardSessionId: string,
  opts?: { multiSegment?: boolean; soloMs?: number }
) {
  if (opts?.multiSegment) {
    await injectVadOverrides(page);
  }
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(page, "tutor");

  if (opts?.multiSegment) {
    await driveTwoVadSilenceCuts(page);
  } else {
    await page.waitForTimeout(opts?.soloMs ?? 5_000);
  }

  await page.getByTestId("wb-end-session").click();
  const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
  if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({
    timeout: 60_000,
  });
}
