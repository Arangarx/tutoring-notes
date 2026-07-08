/**

 * P1-WB-4 / WS-L — replay scrubber drop must seek to dropped position (not t=0).

 *

 * Behavior/contract oracles only:

 *   - Pre-scrub timeline total from elapsed label + HTMLAudioElement.duration

 *   - Target global ms = ratio × pre-scrub total (computed BEFORE scrub)

 *   - Post-scrub: elapsed label global ms + audio currentTime vs independent target

 *   - Multi-segment: recording-count API + replay-audio-timeline math for segment/local

 *

 * Requires BLOB_READ_WRITE_TOKEN (same as other recording integration specs).

 *

 * Run:

 *   npx playwright test tests/integration/wb-replay-scrub-seek.spec.ts --project=wb-regression --workers=1

 */



import { test, expect } from "./fixtures";

import {

  blobIntegrationEnabled,

  blobIntegrationSkipMessage,

} from "../helpers/blob-gate";

import {

  seedWbLiveSyncSession,

  waitForWbE2eBridge,

} from "./whiteboard-live-sync.helpers";

import { TAG } from "../test-tags";



const TEST_SECRET =

  process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";



const VAD_METER_HIGH = 0.5;

const VAD_METER_LOW = 0;



/** WS-L / WS-W regression sentinel — scrub must NOT park at t≈0. */

const NEAR_ZERO_AUDIO_SEC = 0.25;

const NEAR_ZERO_GLOBAL_MS = 500;



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



async function fetchRecordingCount(

  page: import("@playwright/test").Page,

  sessionId: string

) {

  const res = await page.request.get(

    `/api/test/whiteboard/${sessionId}/recording-count`,

    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }

  );

  expect(res.ok(), await res.text()).toBeTruthy();

  return (await res.json()) as { count: number; byStream: Record<string, number> };

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

  globalMs: number;

  totalMs: number;

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

    const parts = elapsedLabel.split("/").map((s) => s.trim());

    const parseClock = (s: string) => {

      const bits = s.split(":").map(Number);

      if (bits.length === 3) return bits[0]! * 3600 + bits[1]! * 60 + bits[2]!;

      if (bits.length === 2) return bits[0]! * 60 + bits[1]!;

      return Number(bits[0]) || 0;

    };

    let globalMs = 0;

    let totalMs = 1;

    if (parts.length === 2) {

      globalMs = parseClock(parts[0]!) * 1000;

      totalMs = parseClock(parts[1]!) * 1000;

    }

    return {

      audioCurrentTime: el?.currentTime ?? 0,

      audioDuration: el?.duration ?? 0,

      elapsedLabel,

      globalMs,

      totalMs: Math.max(totalMs, 1),

    };

  });

}



/** Independent pre-scrub baseline — read BEFORE any scrub interaction. */

async function readPreScrubTimelineBaseline(

  page: import("@playwright/test").Page

) {

  const oracle = await readReplayPositionOracle(page);

  expect(

    oracle.totalMs,

    `Timeline total must be known before scrub (label=${oracle.elapsedLabel})`

  ).toBeGreaterThan(1_000);

  expect(oracle.globalMs, "Replay should start at t≈0 before scrub").toBeLessThan(

    1_500

  );

  return {

    totalMs: oracle.totalMs,

    audioDurationSec: oracle.audioDuration,

    elapsedLabel: oracle.elapsedLabel,

  };

}



function computeIndependentTargetMs(totalMs: number, ratio: number): number {

  return Math.round(totalMs * ratio);

}



function assertNotNearZeroGlobal(

  observedGlobalMs: number,

  context: string

): void {

  expect(

    observedGlobalMs,

    `${context}: global position must NOT collapse to t≈0 (WS-L/WS-W regression)`

  ).toBeGreaterThan(NEAR_ZERO_GLOBAL_MS);

}



function assertNotNearZeroAudio(

  audioCurrentTimeSec: number,

  context: string

): void {

  expect(

    audioCurrentTimeSec,

    `${context}: audio currentTime must NOT be t≈0 after scrub (WS-L/WS-W regression)`

  ).toBeGreaterThan(NEAR_ZERO_AUDIO_SEC);

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



test.describe("P1-WB-4 / WS-L replay scrub seek", { tag: [TAG.WB_RECORDING] }, () => {

  test("single-segment: scrub to ~45% lands at independent target ms (not t=0)", async ({

    page,

  }) => {

    test.setTimeout(300_000);



    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());



    const SCRUB_RATIO = 0.45;



    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    await recordEndEnterReplay(page, studentId, whiteboardSessionId);

    await openReplayAndWaitForAudioReady(page);



    const playBtn = page.getByTestId("wb-replay-play-toggle");

    if ((await playBtn.textContent())?.includes("Pause")) {

      await playBtn.click();

    }



    const baseline = await readPreScrubTimelineBaseline(page);

    const targetGlobalMs = computeIndependentTargetMs(

      baseline.totalMs,

      SCRUB_RATIO

    );

    const targetAudioSec = baseline.audioDurationSec * SCRUB_RATIO;

    const globalToleranceMs = Math.max(2_000, baseline.totalMs * 0.18);

    const audioToleranceSec = Math.max(2, baseline.audioDurationSec * 0.18);



    await scrubToRatio(page, SCRUB_RATIO);



    const oracle = await readReplayPositionOracle(page);



    assertNotNearZeroGlobal(

      oracle.globalMs,

      `single-segment scrub ratio=${SCRUB_RATIO}`

    );

    assertNotNearZeroAudio(

      oracle.audioCurrentTime,

      `single-segment scrub ratio=${SCRUB_RATIO}`

    );



    expect(

      Math.abs(oracle.globalMs - targetGlobalMs),

      `Elapsed global ms should be near independently computed target ` +

        `(observed=${oracle.globalMs}, target=${targetGlobalMs}, label=${oracle.elapsedLabel})`

    ).toBeLessThanOrEqual(globalToleranceMs);



    expect(

      Math.abs(oracle.audioCurrentTime - targetAudioSec),

      `Audio currentTime should match ratio×pre-scrub duration ` +

        `(observed=${oracle.audioCurrentTime}s, target=${targetAudioSec}s, ` +

        `preDur=${baseline.audioDurationSec}s)`

    ).toBeLessThanOrEqual(audioToleranceSec);



    expect(oracle.audioCurrentTime).toBeLessThan(oracle.audioDuration);

  });



  test("multi-segment VAD: scrub to ~75% lands at independent global target (not t=0)", async ({

    page,

  }) => {

    test.setTimeout(300_000);



    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());



    const SCRUB_RATIO = 0.75;



    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    await recordEndEnterReplay(page, studentId, whiteboardSessionId, {

      multiSegment: true,

    });



    const recCount = await fetchRecordingCount(page, whiteboardSessionId);

    const tutorMicSegments = recCount.byStream["tutor:mic"] ?? 0;

    expect(

      tutorMicSegments,

      "VAD harness should produce multiple tutor:mic segments"

    ).toBeGreaterThanOrEqual(2);



    await openReplayAndWaitForAudioReady(page);



    const playBtn = page.getByTestId("wb-replay-play-toggle");

    if ((await playBtn.textContent())?.includes("Pause")) {

      await playBtn.click();

    }



    const baseline = await readPreScrubTimelineBaseline(page);

    const targetGlobalMs = computeIndependentTargetMs(

      baseline.totalMs,

      SCRUB_RATIO

    );

    const globalToleranceMs = Math.max(2_500, baseline.totalMs * 0.2);



    await scrubToRatio(page, SCRUB_RATIO);



    const oracle = await readReplayPositionOracle(page);



    assertNotNearZeroGlobal(

      oracle.globalMs,

      `multi-segment scrub ratio=${SCRUB_RATIO}`

    );

    assertNotNearZeroAudio(

      oracle.audioCurrentTime,

      `multi-segment scrub ratio=${SCRUB_RATIO}`

    );



    expect(

      Math.abs(oracle.globalMs - targetGlobalMs),

      `Multi-segment global ms should land near independent target ` +

        `(observed=${oracle.globalMs}, target=${targetGlobalMs}, label=${oracle.elapsedLabel})`

    ).toBeLessThanOrEqual(globalToleranceMs);



    const observedRatio = oracle.globalMs / baseline.totalMs;

    expect(

      observedRatio,

      `Multi-segment scrub should land near ${SCRUB_RATIO * 100}%, not 0%`

    ).toBeGreaterThan(SCRUB_RATIO - 0.25);

  });



  test("multi-segment VAD: seek into later segment lands at intra-segment offset (not t=0 or boundary only)", async ({

    page,

  }) => {

    test.setTimeout(300_000);



    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());



    const SCRUB_RATIO = 0.85;



    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    await recordEndEnterReplay(page, studentId, whiteboardSessionId, {

      multiSegment: true,

    });



    const recCount = await fetchRecordingCount(page, whiteboardSessionId);

    const segmentCount = recCount.byStream["tutor:mic"] ?? recCount.count;

    expect(segmentCount).toBeGreaterThanOrEqual(2);



    await openReplayAndWaitForAudioReady(page);



    const playBtn = page.getByTestId("wb-replay-play-toggle");

    if ((await playBtn.textContent())?.includes("Pause")) {

      await playBtn.click();

    }



    const baseline = await readPreScrubTimelineBaseline(page);

    const targetGlobalMs = computeIndependentTargetMs(

      baseline.totalMs,

      SCRUB_RATIO

    );

    const pastFirstSegmentMs = baseline.totalMs / segmentCount;

    expect(

      targetGlobalMs,

      "85% scrub target must be past the first segment (later-segment seek)"

    ).toBeGreaterThan(pastFirstSegmentMs * 1.2);



    await scrubToRatio(page, SCRUB_RATIO);



    const oracle = await readReplayPositionOracle(page);



    assertNotNearZeroGlobal(

      oracle.globalMs,

      `later-segment scrub ratio=${SCRUB_RATIO}`

    );

    assertNotNearZeroAudio(

      oracle.audioCurrentTime,

      `later-segment scrub ratio=${SCRUB_RATIO}`

    );



    const globalToleranceMs = Math.max(3_000, baseline.totalMs * 0.22);

    expect(

      Math.abs(oracle.globalMs - targetGlobalMs),

      `Later-segment global ms near independent target ` +

        `(observed=${oracle.globalMs}, target=${targetGlobalMs})`

    ).toBeLessThanOrEqual(globalToleranceMs);



    expect(

      oracle.globalMs,

      "Global position must be past the first segment boundary"

    ).toBeGreaterThan(pastFirstSegmentMs);



    // Intra-segment: not parked at segment start (local t≈0).

    expect(

      oracle.audioCurrentTime,

      "Must not land at segment start boundary (local t≈0) for mid-timeline seek"

    ).toBeGreaterThan(0.4);

  });

});


