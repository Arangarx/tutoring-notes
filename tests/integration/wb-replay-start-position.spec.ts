/**
 * SMOKE-UX-1 / launch plan A4 — opening an ended session's review must start
 * replay audio at position 0, never at (or jumping to) the END of the recording.
 *
 * Spec (user-observable, not derived from the hook):
 *   - After the tutor taps "Replay session", audio playback BEGINS (a real
 *     `playing` event on the <audio> element) with currentTime < 1.0 s.
 *   - The global seek scrubber reads near the start while the audio is near the
 *     start (it never runs ahead of the audio), then ADVANCES with it and is not
 *     parked at max. This is what Andrew sees on screen.
 *   - Audio keeps playing in real time from there (not parked, not ended).
 *   - Same on RE-OPEN (hide replay → Replay session again).
 *   - Same for a multi-segment payload and for the single concat master.
 *   - A clip of any length starts, including clips right around the 0.5 s window.
 *
 * Oracle: wb-replay-audio-trace.helpers.ts — a page-level tracer of the audio
 * element's own events/currentTime and the scrubber's aria values, installed
 * before the app loads and independent of the controller's state.
 *
 * Engines: the `wb-regression` project runs Chromium only (no WebKit project covers it).
 * Playwright's WebKit on Windows cannot load a plain WAV blob at all (media error 4), so
 * these cases are not run on WebKit; Safari playback stays a hardware row.
 *
 * Run:
 *   npx playwright test tests/integration/wb-replay-start-position.spec.ts --project=wb-regression --workers=1
 */

import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { withPrisma } from "../helpers/consent-db-oracle";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import {
  recordEndEnterReplay,
  recordedSecondsInDb,
  seedEndedSessionWithAudioClip,
} from "./wb-replay-record.helpers";
import {
  buildSineWav,
  hideReplay,
  installReplayAudioTrace,
  openReplayAndAssertStartsAtZero,
  readTrace,
  replayAudioSrcKind,
  START_MAX_SEC,
  type StartOracleOptions,
} from "./wb-replay-audio-trace.helpers";
import { TAG } from "../test-tags";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

/**
 * Long enough to tell start from end. The active audio element can be a single
 * VAD segment (about 3 s), so the per-segment floor is START_MAX_SEC plus margin;
 * the recording as a whole is held to the larger floor below.
 */
const MIN_TOTAL_RECORDING_SEC = 5;
/** Real-time advance window after playback begins (long clips). */
const ADVANCE_WAIT_MS = 1_200;
/** Window that covers a whole sub-second clip. */
const SHORT_CLIP_WAIT_MS = 1_200;

const longClip = (totalRecordingSec: number): StartOracleOptions => ({
  advances: true,
  advanceWaitMs: ADVANCE_WAIT_MS,
  totalRecordingSec,
  minTotalRecordingSec: MIN_TOTAL_RECORDING_SEC,
});

const shortClip: StartOracleOptions = { advances: false, advanceWaitMs: SHORT_CLIP_WAIT_MS };

/** Reload the ended session so the review payload is rebuilt from the DB. */
async function reloadIntoReview(page: Page, studentId: string, sessionId: string) {
  await page.goto(`/admin/students/${studentId}/whiteboard/${sessionId}/workspace`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({ timeout: 60_000 });
}

/**
 * The post-End ffmpeg concat may persist a master (or not, e.g. no ffmpeg in the harness).
 * Give it a bounded chance to land so it cannot overwrite the null we write next.
 */
async function settleConcat(sessionId: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const row = await withPrisma((p) =>
      p.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { concatBlobUrl: true },
      })
    );
    if (row?.concatBlobUrl) return;
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

test.describe(
  "replay auto-start position (SMOKE-UX-1)",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("right after End: first open and re-open start at ~0 and advance (several-second recording)", async ({
      page,
    }, testInfo) => {
      test.setTimeout(300_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await installReplayAudioTrace(page);
      await recordEndEnterReplay(page, studentId, whiteboardSessionId, { soloMs: 10_000 });

      const totalSec = await recordedSecondsInDb(whiteboardSessionId);
      await openReplayAndAssertStartsAtZero(page, testInfo, "after-end first open", longClip(totalSec));
      testInfo.annotations.push({
        type: "payload",
        description: await replayAudioSrcKind(page),
      });
      await hideReplay(page);
      await openReplayAndAssertStartsAtZero(page, testInfo, "after-end re-open", longClip(totalSec));
    });

    test("multi-segment payload (no concat master): first open and re-open start at ~0 and advance", async ({
      page,
    }, testInfo) => {
      test.setTimeout(360_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await installReplayAudioTrace(page);
      await recordEndEnterReplay(page, studentId, whiteboardSessionId, {
        multiSegment: true,
      });

      // Drop any concat master so review builds the per-segment payload.
      await settleConcat(whiteboardSessionId);
      const segmentCount = await withPrisma(async (p) => {
        await p.whiteboardSession.update({
          where: { id: whiteboardSessionId },
          data: { concatBlobUrl: null, concatDurationSeconds: null },
        });
        return p.sessionRecording.count({ where: { whiteboardSessionId } });
      });
      expect(segmentCount, "VAD harness should produce several segments").toBeGreaterThanOrEqual(2);
      const totalSec = await recordedSecondsInDb(whiteboardSessionId);

      await reloadIntoReview(page, studentId, whiteboardSessionId);
      await openReplayAndAssertStartsAtZero(page, testInfo, "segments first open", longClip(totalSec));
      const playingSegDur = (await readTrace(page))
        .map((r) => r.dur)
        .findLast((d): d is number => typeof d === "number" && Number.isFinite(d) && d > 0);
      expect(
        playingSegDur,
        "playing segment must be long enough that its own start differs from its end"
      ).toBeGreaterThanOrEqual(START_MAX_SEC + 0.5);
      expect(await replayAudioSrcKind(page)).toBe("segments");
      await hideReplay(page);
      await openReplayAndAssertStartsAtZero(page, testInfo, "segments re-open", longClip(totalSec));
    });

    // Seeded finite-duration PCM clips: no WebM duration scan, no mic needed.
    // 0.3 s is below the 0.5 s window (start and "near the end" are the same place);
    // 0.5 s and 0.6 s sit on and just past the boundary; 8 s is a long clip whose start
    // is clearly distinct from its end. "concat" serves the same clip through the single
    // canonical concat-master URL.
    const SEEDED_CASES: { clipSec: number; payload: "segments" | "concat" }[] = [
      { clipSec: 0.3, payload: "segments" },
      { clipSec: 0.5, payload: "segments" },
      { clipSec: 0.6, payload: "segments" },
      { clipSec: 8, payload: "segments" },
      { clipSec: 8, payload: "concat" },
    ];
    for (const { clipSec, payload } of SEEDED_CASES) {
      test(`seeded ${clipSec}s finite-duration clip, ${payload} payload: first open and re-open start playing at ~0`, async ({
        page,
      }, testInfo) => {
        test.setTimeout(180_000);
        assertLocalDatabaseUrlForHarness();

        const session = await seedEndedSessionWithAudioClip(page, {
          clip: buildSineWav(clipSec),
          contentType: "audio/wav",
          fileExt: "wav",
          clipSec,
          payload,
        });
        await installReplayAudioTrace(page);
        await page.goto(
          `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({ timeout: 60_000 });

        const opts = clipSec <= 1 ? shortClip : longClip(clipSec);
        await openReplayAndAssertStartsAtZero(page, testInfo, `${clipSec}s first open`, opts);
        await hideReplay(page);
        await openReplayAndAssertStartsAtZero(page, testInfo, `${clipSec}s re-open`, opts);
        expect(await replayAudioSrcKind(page), "payload under test").toBe(payload);
      });
    }
  }
);
