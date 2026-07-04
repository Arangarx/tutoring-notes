/**
 * WS-L — replay scrubber drop must seek to dropped position (not t=0).
 *
 * Covers single-segment and multi-segment (VAD) sessions. Asserts DOM/controller
 * position mapping in a real browser; audio element currentTime is the oracle.
 *
 * Requires BLOB_READ_WRITE_TOKEN (same as other recording integration specs).
 *
 * Run:
 *   npx playwright test tests/integration/wb-replay-scrub-seek.spec.ts --project=wb-regression --workers=1
 */

import { test, expect } from "./fixtures";
import { readLocalEnv } from "../utils/read-dotenv";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const VAD_METER_HIGH = 0.5;
const VAD_METER_LOW = 0;

async function injectVadOverrides(page: import("@playwright/test").Page) {
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

async function setVadTestMeterLevel(
  page: import("@playwright/test").Page,
  level: number
) {
  await page.evaluate((lvl) => {
    (window as unknown as { __VAD_TEST_METER_LEVEL__?: number }).__VAD_TEST_METER_LEVEL__ =
      lvl;
  }, level);
}

async function driveTwoVadSilenceCuts(page: import("@playwright/test").Page) {
  await setVadTestMeterLevel(page, VAD_METER_HIGH);
  await page.waitForTimeout(1_200);
  await setVadTestMeterLevel(page, VAD_METER_LOW);
  await page.waitForTimeout(1_000);
  await setVadTestMeterLevel(page, VAD_METER_HIGH);
  await page.waitForTimeout(1_200);
  await setVadTestMeterLevel(page, VAD_METER_LOW);
  await page.waitForTimeout(1_000);
}

async function muteReplayAudioWhenPresent(page: import("@playwright/test").Page) {
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

async function openReplayAndWaitForAudioReady(
  page: import("@playwright/test").Page
) {
  await muteReplayAudioWhenPresent(page);
  await page.getByTestId("wb-review-enter-replay").click();
  await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        '[data-testid="wb-replay-audio"]'
      ) as HTMLAudioElement | null;
      return el != null && Number.isFinite(el.duration) && el.duration > 0;
    },
    { timeout: 90_000 }
  );
}

/** Drag custom scrubber thumb to `ratio` ∈ (0,1) along the track. */
async function scrubToRatio(
  page: import("@playwright/test").Page,
  ratio: number
) {
  const track = page.getByTestId("wb-replay-global-seek");
  await expect(track).toBeVisible();
  const box = await track.boundingBox();
  expect(box).not.toBeNull();
  const thumbRadius = 8;
  const travel = Math.max(box!.width - thumbRadius * 2, 1);
  const x = box!.x + thumbRadius + travel * ratio;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y);
  await page.mouse.up();
  await page.waitForTimeout(600);
}

type ReplayPositionOracle = {
  audioCurrentTime: number;
  audioDuration: number;
  elapsedLabel: string;
  scrubberValue: number;
  scrubberMax: number;
};

async function readReplayPositionOracle(
  page: import("@playwright/test").Page
): Promise<ReplayPositionOracle> {
  return page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="wb-replay-audio"]'
    ) as HTMLAudioElement | null;
    const elapsedEl = document.querySelector(
      ".mynk-wb-replay-timeline__elapsed"
    );
    const elapsedLabel = elapsedEl?.textContent?.trim() ?? "";
    const thumb = document.querySelector(
      '[data-testid="wb-replay-global-seek-thumb"]'
    ) as HTMLElement | null;
    const track = document.querySelector(
      '[data-testid="wb-replay-global-seek"]'
    ) as HTMLElement | null;
    let scrubberValue = 0;
    let scrubberMax = 1;
    if (thumb && track) {
      const trackRect = track.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();
      const travel = Math.max(trackRect.width - 16, 1);
      scrubberValue =
        ((thumbRect.left + thumbRect.width / 2 - trackRect.left - 8) / travel) *
        scrubberMax;
    }
    const parts = elapsedLabel.split("/").map((s) => s.trim());
    const parseClock = (s: string) => {
      const bits = s.split(":").map(Number);
      if (bits.length === 3) return bits[0]! * 3600 + bits[1]! * 60 + bits[2]!;
      if (bits.length === 2) return bits[0]! * 60 + bits[1]!;
      return Number(bits[0]) || 0;
    };
    if (parts.length === 2) {
      scrubberValue = parseClock(parts[0]!) * 1000;
      scrubberMax = parseClock(parts[1]!) * 1000;
    }
    return {
      audioCurrentTime: el?.currentTime ?? 0,
      audioDuration: el?.duration ?? 0,
      elapsedLabel,
      scrubberValue,
      scrubberMax: Math.max(scrubberMax, 1),
    };
  });
}

async function recordEndEnterReplay(
  page: import("@playwright/test").Page,
  studentId: string,
  whiteboardSessionId: string,
  opts?: { multiSegment?: boolean }
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
    await page.waitForTimeout(5_000);
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

test.describe("WS-L replay scrub seek", { tag: [TAG.WB_RECORDING] }, () => {
  test("single-segment: scrub drop to ~75% lands near 75% (not t=0)", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for integration recording."
    );

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await recordEndEnterReplay(page, studentId, whiteboardSessionId);
    await openReplayAndWaitForAudioReady(page);

    const playBtn = page.getByTestId("wb-replay-play-toggle");
    if ((await playBtn.textContent())?.includes("Pause")) {
      await playBtn.click();
    }

    await scrubToRatio(page, 0.75);

    const oracle = await readReplayPositionOracle(page);
    expect(oracle.scrubberMax).toBeGreaterThan(1_000);
    const targetMs = oracle.scrubberMax * 0.75;
    const scrubRatio = oracle.scrubberValue / oracle.scrubberMax;

    expect(
      scrubRatio,
      `Scrubber should land near 75% (got ${(scrubRatio * 100).toFixed(1)}%, label=${oracle.elapsedLabel})`
    ).toBeGreaterThan(0.55);
    expect(
      scrubRatio,
      `Scrubber should not collapse to 0 (label=${oracle.elapsedLabel})`
    ).toBeGreaterThan(0.1);

    if (oracle.audioDuration > 0) {
      const audioRatio = oracle.audioCurrentTime / oracle.audioDuration;
      expect(
        audioRatio,
        `Audio currentTime should be near scrub target, not 0 (ct=${oracle.audioCurrentTime}, dur=${oracle.audioDuration})`
      ).toBeGreaterThan(0.35);
      expect(oracle.audioCurrentTime).toBeLessThan(oracle.audioDuration);
    }

    void targetMs;
  });

  test("multi-segment VAD: scrub drop to ~75% lands near 75% (not t=0)", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for integration recording."
    );

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await recordEndEnterReplay(page, studentId, whiteboardSessionId, {
      multiSegment: true,
    });
    await openReplayAndWaitForAudioReady(page);

    const playBtn = page.getByTestId("wb-replay-play-toggle");
    if ((await playBtn.textContent())?.includes("Pause")) {
      await playBtn.click();
    }

    await scrubToRatio(page, 0.75);

    const oracle = await readReplayPositionOracle(page);
    const scrubRatio = oracle.scrubberValue / oracle.scrubberMax;

    expect(
      scrubRatio,
      `Multi-segment scrub should land near 75%, not 0 (label=${oracle.elapsedLabel})`
    ).toBeGreaterThan(0.55);

    if (oracle.audioDuration > 0) {
      expect(
        oracle.audioCurrentTime,
        "Multi-segment: audio must not reset to t=0 after scrub drop"
      ).toBeGreaterThan(0.5);
    }
  });
});
