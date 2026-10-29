/**
 * Tutor-facing English-only transcription notice.
 *
 * Visible before recording (waiting-room audio controls) and, once the
 * session is live, beside the recording pill. Students never see it.
 *
 * Not run in this change — the orchestrator runs red/green later.
 * On 54ef13b8 the notice testids and copy are absent, so both tutor
 * asserts fail.
 */

import { test, expect, type Locator } from "@playwright/test";
import {
  openTutorAndStudent,
  seedWbPendingLiveSyncSession,
  startSessionAsTutor,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const NOTICE = "Transcription currently supports English only.";

async function boxOf(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has a layout box`).not.toBeNull();
  return box!;
}

test.describe(
  "transcription language notice",
  { tag: [TAG.WB_RECORDING, TAG.WB_CHROME] },
  () => {
    test("tutor sees the English-only notice next to the audio control before recording; student does not", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const session = await seedWbPendingLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const tutorOverlay = peers.tutorPage.getByTestId("wb-waiting-overlay");
        await expect(tutorOverlay).toBeVisible({ timeout: 30_000 });

        const cluster = tutorOverlay.getByTestId("wb-waiting-audio-controls");
        const notice = cluster.getByTestId("wb-transcription-language-notice");
        const mic = cluster.getByTestId("wb-topbar-mic");
        await expect(notice).toBeVisible();
        await expect(notice).toHaveText(NOTICE);
        await expect(mic).toBeVisible();

        // notice is inside the audio-control cluster and stacked next to the mic
        const slack = 4;
        const clusterBox = await boxOf(cluster, "audio cluster");
        const noticeBox = await boxOf(notice, "waiting-room notice");
        const micBox = await boxOf(mic, "mic");
        expect(noticeBox.y).toBeGreaterThanOrEqual(clusterBox.y - slack);
        expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(
          clusterBox.y + clusterBox.height + slack
        );
        expect(noticeBox.x).toBeGreaterThanOrEqual(clusterBox.x - slack);
        expect(noticeBox.x + noticeBox.width).toBeLessThanOrEqual(
          clusterBox.x + clusterBox.width + slack
        );
        const gapBelowMic = noticeBox.y - (micBox.y + micBox.height);
        expect(gapBelowMic).toBeGreaterThanOrEqual(-slack);
        expect(gapBelowMic).toBeLessThan(32);
        const overlapsMicHorizontally =
          noticeBox.x < micBox.x + micBox.width &&
          noticeBox.x + noticeBox.width > micBox.x;
        expect(overlapsMicHorizontally).toBe(true);

        await expect(peers.studentPage.getByText(NOTICE)).toHaveCount(0);
        await expect(
          peers.studentPage.getByTestId("wb-transcription-language-notice")
        ).toHaveCount(0);

        await startSessionAsTutor(peers.tutorPage);

        const liveCluster = peers.tutorPage.getByTestId(
          "wb-tutor-recording-cluster"
        );
        const liveNotice = liveCluster.getByTestId(
          "wb-transcription-language-notice"
        );
        const pill = liveCluster.getByTestId("wb-recording-pill");
        await expect(liveNotice).toBeVisible();
        await expect(liveNotice).toHaveText(NOTICE);

        // next to the recording pill: contained in the cluster, small side gap, aligned midlines
        const liveClusterBox = await boxOf(liveCluster, "recording cluster");
        const liveNoticeBox = await boxOf(liveNotice, "live notice");
        const pillBox = await boxOf(pill, "recording pill");
        expect(liveNoticeBox.x).toBeGreaterThanOrEqual(liveClusterBox.x - slack);
        expect(liveNoticeBox.x + liveNoticeBox.width).toBeLessThanOrEqual(
          liveClusterBox.x + liveClusterBox.width + slack
        );
        expect(liveNoticeBox.y).toBeGreaterThanOrEqual(liveClusterBox.y - slack);
        expect(liveNoticeBox.y + liveNoticeBox.height).toBeLessThanOrEqual(
          liveClusterBox.y + liveClusterBox.height + slack
        );
        const sideGap = liveNoticeBox.x - (pillBox.x + pillBox.width);
        expect(sideGap).toBeGreaterThanOrEqual(-slack);
        expect(sideGap).toBeLessThan(16);
        const noticeMid = liveNoticeBox.y + liveNoticeBox.height / 2;
        const pillMid = pillBox.y + pillBox.height / 2;
        expect(Math.abs(noticeMid - pillMid)).toBeLessThan(6);

        await expect(
          peers.studentPage.getByTestId("wb-waiting-overlay")
        ).not.toBeVisible({ timeout: 30_000 });
        await expect(peers.studentPage.getByText(NOTICE)).toHaveCount(0);
        await expect(
          peers.studentPage.getByTestId("wb-transcription-language-notice")
        ).toHaveCount(0);
      } finally {
        await peers.close();
      }
    });
  }
);
