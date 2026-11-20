/**
 * Drive the recorder's voice-activity segmenter from a test: short VAD windows plus a test-controlled meter level
 * (`__VAD_TEST_METER_LEVEL__`), so a speech → silence cut closes one real segment in about two seconds.
 */
import type { BrowserContext, Page } from "@playwright/test";

export const VAD_METER_HIGH = 0.5;
export const VAD_METER_LOW = 0;

function applyVadOverrides(): void {
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
}

/**
 * Short VAD windows for the next navigation, and for every document already open.
 * addInitScript does not reach a page that has already loaded; those pages read
 * the overrides live, so the same function is evaluated immediately.
 */
export async function injectVadOverrides(target: Page | BrowserContext) {
  await target.addInitScript(applyVadOverrides);
  const pages = "pages" in target ? target.pages() : [target];
  for (const page of pages) {
    if (page.isClosed()) continue;
    await page.evaluate(applyVadOverrides);
  }
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

/** Two silence cuts, so a recording that starts in speech holds three segments. */
export async function driveTwoVadSilenceCuts(page: Page) {
  await driveVadSilenceCut(page);
  await driveVadSilenceCut(page);
}
