/**
 * Drive the recorder's voice-activity segmenter from a test: short VAD windows plus a test-controlled meter level
 * (`__VAD_TEST_METER_LEVEL__`), so a speech → silence cut closes one real segment in about two seconds.
 */
import type { BrowserContext, Page } from "@playwright/test";

export const VAD_METER_HIGH = 0.5;
export const VAD_METER_LOW = 0;

/** Must run before the page loads (init script, on one page or on every page of a context). */
export async function injectVadOverrides(target: Page | BrowserContext) {
  await target.addInitScript(() => {
    const w = window as unknown as {
      __VAD_MIN_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_SILENCE_HOLD_MS_OVERRIDE?: number;
      __VAD_SILENCE_RMS_THRESHOLD_OVERRIDE?: number;
      __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_TEST_METER_LEVEL__?: number;
    };
    w.__VAD_MIN_SEGMENT_SECONDS_OVERRIDE = 1;
    w.__VAD_SILENCE_HOLD_MS_OVERRIDE = 800;
    w.__VAD_SILENCE_RMS_THRESHOLD_OVERRIDE = 0.15;
    w.__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 120;
    w.__VAD_TEST_METER_LEVEL__ = 0.5;
  });
}

export async function setVadTestMeterLevel(page: Page, level: number) {
  await page.evaluate((lvl) => {
    (window as unknown as { __VAD_TEST_METER_LEVEL__?: number }).__VAD_TEST_METER_LEVEL__ = lvl;
  }, level);
}

/** Speech then silence: one segment boundary. */
export async function driveVadSilenceCut(page: Page) {
  await setVadTestMeterLevel(page, VAD_METER_HIGH);
  await page.waitForTimeout(1_200);
  await setVadTestMeterLevel(page, VAD_METER_LOW);
  await page.waitForTimeout(1_000);
}
