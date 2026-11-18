/**
 * A4 / WS-N-PAGEHIDE — how much audio survives when the tab dies mid-segment.
 *
 * Spec (user-observable): after the tab dies during a recording, the recovered draft
 * (what the "We recovered N:NN of audio" banner offers) covers the audio up to within a
 * small bound of the moment of the kill. Three real failure modes, each its own test:
 *
 *   1. Hard kill (no JS runs at all — renderer crash / OOM / OS kill).
 *      Property: loss <= one slice + slack.
 *   2. Tab goes hidden (app switch / lock screen), stays alive briefly, then is killed.
 *      Property: loss is bounded by the hidden->kill window + slack — NOT by the slice.
 *   3. Graceful close (navigate away / close tab). The document is torn down before the
 *      encoder can hand over its partial slice, so the accepted property is the same as
 *      (1): loss <= one slice + slack. This test documents that bound.
 *
 * Oracle (independent of app internals):
 *   - Start time of the open segment = wall-clock of the browser's own
 *     `MediaRecorder.prototype.start` call (hooked via addInitScript).
 *   - Kill / hidden times = Node wall-clock (same host clock as the page).
 *   - Recovered audio length = the browser decoding the draft's bytes with
 *     `decodeAudioData` (real sample count, not the row's `estimatedDurationSec`).
 *   - Audio lost = (kill - segment start) - decoded length. Bounds are literals in this file.
 *
 * Hard-kill surrogate: CDP `Page.setWebLifecycleState({state:"frozen"})` stops ALL JS in
 * the page (so no flush can run, exactly like a crash), then `page.close()`, then a NEW
 * page in the SAME context reads IndexedDB (same pattern as
 * wb-tab-kill-audio-durability.spec.ts). `Page.crash` was tried first and takes the whole
 * browser context down, so the draft cannot be read afterwards.
 *
 * Red-before: pre-fix hook (30s MediaRecorder timeslice) -> no chunk exists 14-19.5s into a
 * segment, so every test finds NO draft at all; a 10s timeslice -> the two "just before a
 * boundary" tests lose ~9.5s (> 7.5s bound). The MediaRecorder timeslice is printed in each
 * failure message so a stale bundle cannot masquerade as the swapped hook.
 *
 * Run:
 *   npx playwright test tests/integration/wb-recording-draft-durability.spec.ts --project=wb-regression --workers=1
 */

import { test, expect } from "./fixtures";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";
import {
  decodeDraftSeconds,
  freezeCloseAndReopen,
  hookMediaRecorderStarts,
  openWorkspaceAndStartRecording,
  waitForOpenSegmentAge,
} from "../helpers/recording-draft-kill";

/** One draft slice, the loss unit the spec accepts for a kill that runs no code. */
const SLICE_SEC = 5;
/** Encoder / IDB scheduling + clock slack. Not a coordinate: tolerance on a relation. */
const SLACK_SEC = 2.5;
/**
 * Kill sample points, chosen JUST BEFORE a 5s slice boundary (5, 10, 15, 20s...) so the test
 * has teeth against a longer timeslice: a 5s slice loses ~4.5s here and passes, a 10s slice
 * loses ~9.5s and a 30s slice has no chunk at all, both of which fail the 7.5s bound.
 */
const HARD_KILL_SEGMENT_AGE_MS = 19_500;
const GRACEFUL_CLOSE_SEGMENT_AGE_MS = 19_000;
/** Tab hidden, then killed this long after (page is alive in between). */
const HIDDEN_TO_KILL_MS = 1_500;

function lossMessage(
  what: string,
  lostSec: number,
  elapsedSec: number,
  draft: { decodedSec: number; chunkCount: number },
  timeslice: number | null
) {
  return `${what}: lost ${lostSec.toFixed(1)}s of ${elapsedSec.toFixed(1)}s (decoded ${draft.decodedSec.toFixed(1)}s, chunks=${draft.chunkCount}, MediaRecorder timeslice=${timeslice}ms)`;
}

test.describe(
  "A4 WS-N-PAGEHIDE recording draft survives a mid-segment tab death",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("hard kill (frozen then closed) just before a slice boundary loses at most one slice plus slack", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const page = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      const segment = await waitForOpenSegmentAge(page, HARD_KILL_SEGMENT_AGE_MS);
      const { killedAt, reader } = await freezeCloseAndReopen(context, page);
      const draft = await decodeDraftSeconds(reader, whiteboardSessionId);

      const elapsedSec = (killedAt - segment.at) / 1000;
      expect(
        draft.found,
        `no recoverable draft ${elapsedSec.toFixed(1)}s into the segment (MediaRecorder timeslice=${segment.timeslice}ms)`
      ).toBe(true);
      const lostSec = elapsedSec - draft.decodedSec;
      expect(
        lostSec,
        lossMessage("hard kill", lostSec, elapsedSec, draft, segment.timeslice)
      ).toBeLessThanOrEqual(SLICE_SEC + SLACK_SEC);

      await context.close();
    });

    test("tab hidden then killed: loss is bounded by the hidden-to-kill window, not by the slice", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const page = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      // ~4s past a slice boundary: a timeslice-only draft is ~4s behind at this moment.
      const segment = await waitForOpenSegmentAge(page, 14_000);

      // App switch / lock screen: the page goes hidden but stays alive for a moment.
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const hiddenAt = Date.now();
      await page.waitForTimeout(HIDDEN_TO_KILL_MS); // the requested partial slice lands here

      const { killedAt, reader } = await freezeCloseAndReopen(context, page);
      const draft = await decodeDraftSeconds(reader, whiteboardSessionId);

      const elapsedSec = (killedAt - segment.at) / 1000;
      const hiddenToKillSec = (killedAt - hiddenAt) / 1000;
      expect(
        draft.found,
        `no recoverable draft ${elapsedSec.toFixed(1)}s into the segment (MediaRecorder timeslice=${segment.timeslice}ms)`
      ).toBe(true);
      const lostSec = elapsedSec - draft.decodedSec;
      // Property: only what happened after the tab went hidden can be lost.
      expect(
        lostSec,
        lossMessage(
          `hidden ${hiddenToKillSec.toFixed(1)}s before kill`,
          lostSec,
          elapsedSec,
          draft,
          segment.timeslice
        )
      ).toBeLessThanOrEqual(hiddenToKillSec + SLACK_SEC - 1);

      await context.close();
    });

    test("graceful close (navigate away) just before a slice boundary loses at most one slice plus slack", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const page = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      const segment = await waitForOpenSegmentAge(page, GRACEFUL_CLOSE_SEGMENT_AGE_MS);
      const killedAt = Date.now();
      // Leave the workspace: pagehide + visibilitychange fire, and the workspace does not
      // re-mount (so no new recording overwrites the draft row). The partial slice cannot
      // be flushed in time, so the accepted bound is one slice (this documents it).
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      const draft = await decodeDraftSeconds(page, whiteboardSessionId);

      const elapsedSec = (killedAt - segment.at) / 1000;
      expect(
        draft.found,
        `no recoverable draft after navigating away (MediaRecorder timeslice=${segment.timeslice}ms)`
      ).toBe(true);
      const lostSec = elapsedSec - draft.decodedSec;
      expect(
        lostSec,
        lossMessage("graceful close", lostSec, elapsedSec, draft, segment.timeslice)
      ).toBeLessThanOrEqual(SLICE_SEC + SLACK_SEC);

      await context.close();
    });
  }
);
