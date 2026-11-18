/**
 * WS-B — audio recorded before a hard tab kill reaches the server after the tutor reopens.
 *
 * Spec (user-observable): the tutor's tab dies mid-recording (renderer crash / OS kill — no code
 * runs). The tutor reopens the session and does NOT have to do anything: the audio that was
 * recorded up to the last checkpoint is uploaded and attached to the session.
 *
 * Oracle (independent of app internals):
 *   - Server side: `SessionRecording` rows for the session (`/api/test/whiteboard/:id/recording-count`)
 *     and the real bytes of each row's blob, decoded by the browser (`decodeAudioData`) — not the
 *     draft row's own `estimatedDurationSec`.
 *   - Expected length: wall-clock of the browser's `MediaRecorder.start` (hooked) to the kill moment,
 *     minus the accepted loss bound (one 5s checkpoint slice + slack; same bound as
 *     wb-recording-draft-durability.spec.ts). Bounds are literals in this file.
 *   - VAD cuts are disabled and nothing ends the session, so a `tutor:mic` row that exists BEFORE End
 *     can only be the recovered pre-kill segment (a new segment stays open and is never registered).
 *
 * Red-before: the draft is only offered behind a Keep/Discard banner. Nobody clicks it, so no row ever
 * reaches the server (and a second unattended reload overwrites the single draft row for the stream).
 *
 * Run:
 *   npx playwright test tests/integration/wb-recording-draft-recovery.spec.ts --project=wb-regression --workers=1
 */

import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";
import {
  TUTOR_MIC,
  freezeCloseAndReopen,
  hookMediaRecorderStarts,
  openWorkspaceAndStartRecording,
  waitForOpenSegmentAge,
} from "../helpers/recording-draft-kill";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

/** One draft slice, the loss unit the spec accepts for a kill that runs no code. */
const SLICE_SEC = 5;
/** Encoder / IDB scheduling + clock slack. Tolerance on a relation, not a coordinate. */
const SLACK_SEC = 2.5;
/** The segment must be old enough that it has several checkpoints before the kill. */
const KILL_SEGMENT_AGE_MS = 14_000;

type RecordingCount = { count: number; byStream: Record<string, number>; blobUrls: string[] };

async function fetchRecordingCount(page: Page, sessionId: string): Promise<RecordingCount> {
  // A loaded dev server can reset a connection mid-poll (seen ECONNRESET in a full-suite run);
  // retry a few times so a transport blip is not read as "audio never arrived".
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await page.request.get(`/api/test/whiteboard/${sessionId}/recording-count`, {
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
      });
      expect(res.ok(), await res.text()).toBeTruthy();
      return (await res.json()) as RecordingCount;
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(750);
    }
  }
  throw lastErr;
}

/** Decode a stored blob's real duration in the browser (independent of any app-side estimate). */
async function decodedBlobSeconds(page: Page, blobUrl: string): Promise<number> {
  return page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) return -1;
    const bytes = await res.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 48_000);
    const decoded = await ctx.decodeAudioData(bytes);
    return decoded.duration;
  }, blobUrl);
}

async function openWorkspaceNoInteraction(
  page: Page,
  studentId: string,
  whiteboardSessionId: string
) {
  await page.goto(`/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({ timeout: 90_000 });
}

function lowerBoundSec(elapsedSec: number): number {
  return elapsedSec - (SLICE_SEC + SLACK_SEC);
}

test.describe(
  "WS-B recovered recording draft reaches the server after a hard tab kill",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("hard kill mid-recording, reopen with no clicks: the pre-kill audio is attached to the session", async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const page = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      const segment = await waitForOpenSegmentAge(page, KILL_SEGMENT_AGE_MS);
      const { killedAt, reader } = await freezeCloseAndReopen(context, page);
      const elapsedSec = (killedAt - segment.at) / 1000;

      // Nothing was uploaded before the kill (the only audio is the open, un-stopped segment).
      expect((await fetchRecordingCount(reader, whiteboardSessionId)).byStream[TUTOR_MIC] ?? 0).toBe(0);

      // The tutor reopens the session and touches nothing.
      await reader.close();
      const reopened = await context.newPage();
      await openWorkspaceNoInteraction(reopened, studentId, whiteboardSessionId);

      await expect
        .poll(
          async () =>
            (await fetchRecordingCount(reopened, whiteboardSessionId)).byStream[TUTOR_MIC] ?? 0,
          {
            timeout: 90_000,
            intervals: [1_000, 2_000],
            message: `no tutor:mic SessionRecording reached the server after reopen (killed ${elapsedSec.toFixed(1)}s into the segment)`,
          }
        )
        .toBeGreaterThanOrEqual(1);

      const { blobUrls } = await fetchRecordingCount(reopened, whiteboardSessionId);
      const durations = await Promise.all(blobUrls.map((u) => decodedBlobSeconds(reopened, u)));
      expect(
        Math.max(...durations),
        `recovered audio is too short: durations=${JSON.stringify(durations)}s of ${elapsedSec.toFixed(1)}s recorded before the kill`
      ).toBeGreaterThanOrEqual(lowerBoundSec(elapsedSec));

      await context.close();
    });

    test("two unattended hard kills in a row: both pre-kill segments reach the server (one draft row per stream must not lose the first)", async ({
      browser,
    }) => {
      test.setTimeout(360_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      // Segment 1, killed.
      const page1 = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      const segment1 = await waitForOpenSegmentAge(page1, KILL_SEGMENT_AGE_MS);
      const kill1 = await freezeCloseAndReopen(context, page1);
      const elapsed1Sec = (kill1.killedAt - segment1.at) / 1000;
      await kill1.reader.close();

      // Reopen #1 with no clicks. Segment 2 runs long enough to checkpoint over the stream's draft row,
      // then is killed before the tutor does anything.
      const page2 = await context.newPage();
      await openWorkspaceNoInteraction(page2, studentId, whiteboardSessionId);
      const segment2 = await waitForOpenSegmentAge(page2, KILL_SEGMENT_AGE_MS);
      const kill2 = await freezeCloseAndReopen(context, page2);
      const elapsed2Sec = (kill2.killedAt - segment2.at) / 1000;
      await kill2.reader.close();

      // Reopen #2, still no clicks.
      const page3 = await context.newPage();
      await openWorkspaceNoInteraction(page3, studentId, whiteboardSessionId);

      await expect
        .poll(
          async () =>
            (await fetchRecordingCount(page3, whiteboardSessionId)).byStream[TUTOR_MIC] ?? 0,
          {
            timeout: 120_000,
            intervals: [1_000, 2_000],
            message: `expected both pre-kill segments on the server (segment 1 ${elapsed1Sec.toFixed(1)}s, segment 2 ${elapsed2Sec.toFixed(1)}s)`,
          }
        )
        .toBeGreaterThanOrEqual(2);

      const { blobUrls } = await fetchRecordingCount(page3, whiteboardSessionId);
      const durations = (await Promise.all(blobUrls.map((u) => decodedBlobSeconds(page3, u)))).sort(
        (a, b) => a - b
      );
      const bounds = [lowerBoundSec(elapsed1Sec), lowerBoundSec(elapsed2Sec)].sort((a, b) => a - b);
      expect(
        durations.length,
        `recovered durations=${JSON.stringify(durations)}s`
      ).toBeGreaterThanOrEqual(2);
      // The two longest recovered rows each cover their segment (sorted pairing is order-independent).
      const topTwo = durations.slice(-2);
      expect(topTwo[0], `shorter recovered row, durations=${JSON.stringify(durations)}s`).toBeGreaterThanOrEqual(bounds[0]);
      expect(topTwo[1], `longer recovered row, durations=${JSON.stringify(durations)}s`).toBeGreaterThanOrEqual(bounds[1]);

      await context.close();
    });
  }
);
