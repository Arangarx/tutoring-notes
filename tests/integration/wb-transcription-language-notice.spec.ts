/**
 * Tutor-facing English-only transcription notice.
 *
 * Visible in the waiting room, under the mic/camera controls, before
 * Start. Not shown on the live session bar. Students never see it.
 *
 * Not run in this change — the orchestrator runs red/green later.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
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

/** Notice box sits inside the card box (equal-slack containment, not a fixed offset). */
function expectBoxInside(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
  slack: number
) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - slack);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - slack);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + slack);
  expect(inner.y + inner.height).toBeLessThanOrEqual(
    outer.y + outer.height + slack
  );
}

async function expectNoticeInsideCardAndViewport(page: Page, slack: number) {
  const overlay = page.getByTestId("wb-waiting-overlay");
  const card = overlay.locator(".mynk-wtr-card");
  const notice = overlay.getByTestId("wb-transcription-language-notice");
  await notice.scrollIntoViewIfNeeded();
  const noticeBox = await boxOf(notice, "waiting-room notice");
  const cardBox = await boxOf(card, "waiting-room card");
  // not clipped by the card
  expectBoxInside(noticeBox, cardBox, slack);
  const viewport = page.viewportSize();
  expect(viewport, "viewport is set").not.toBeNull();
  // not clipped by the viewport after scroll
  expectBoxInside(
    noticeBox,
    { x: 0, y: 0, width: viewport!.width, height: viewport!.height },
    slack
  );
}

test.describe(
  "transcription language notice",
  { tag: [TAG.WB_RECORDING, TAG.WB_CHROME] },
  () => {
    test("tutor sees the English-only notice under the mic before recording; student does not", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const session = await seedWbPendingLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const tutorOverlay = peers.tutorPage.getByTestId("wb-waiting-overlay");
        await expect(tutorOverlay).toBeVisible({ timeout: 30_000 });
        await expect(tutorOverlay).toHaveAttribute("data-role", "tutor");

        const cluster = tutorOverlay.getByTestId("wb-waiting-audio-controls");
        const notice = cluster.getByTestId("wb-transcription-language-notice");
        const mic = cluster.getByTestId("wb-topbar-mic");
        const controls = cluster.locator(".mynk-wtr-av-controls");
        await expect(notice).toBeVisible();
        await expect(notice).toHaveText(NOTICE);
        await expect(mic).toBeVisible();

        // stacked under the mic, and centered on the mic/camera row
        const slack = 4;
        const noticeBox = await boxOf(notice, "waiting-room notice");
        const micBox = await boxOf(mic, "mic");
        const controlsBox = await boxOf(controls, "mic/camera row");
        const gapBelowMic = noticeBox.y - (micBox.y + micBox.height);
        expect(gapBelowMic).toBeGreaterThanOrEqual(-slack);
        expect(gapBelowMic).toBeLessThan(32);
        const overlapsMicHorizontally =
          noticeBox.x < micBox.x + micBox.width &&
          noticeBox.x + noticeBox.width > micBox.x;
        expect(overlapsMicHorizontally).toBe(true);
        const noticeMid = noticeBox.x + noticeBox.width / 2;
        const controlsMid = controlsBox.x + controlsBox.width / 2;
        expect(Math.abs(noticeMid - controlsMid)).toBeLessThan(6);

        const studentOverlay = peers.studentPage.getByTestId("wb-waiting-overlay");
        await expect(studentOverlay).toBeVisible({ timeout: 30_000 });
        await expect(studentOverlay).toHaveAttribute("data-role", "student");
        await expect(
          studentOverlay.getByTestId("wb-waiting-overlay-student-heading")
        ).toBeVisible();
        await expect(peers.studentPage.getByText(NOTICE)).toHaveCount(0);
        await expect(
          peers.studentPage.getByTestId("wb-transcription-language-notice")
        ).toHaveCount(0);

        await startSessionAsTutor(peers.tutorPage);

        await expect(peers.tutorPage.getByTestId("wb-recording-pill")).toBeVisible({
          timeout: 30_000,
        });
        await expect(
          peers.tutorPage.getByTestId("wb-transcription-language-notice")
        ).toHaveCount(0);
        await expect(peers.tutorPage.getByText(NOTICE)).toHaveCount(0);

        await expect(studentOverlay).not.toBeVisible({ timeout: 30_000 });
        await expect(
          peers.studentPage.getByTestId("wb-student-topbar")
        ).toBeVisible();
        await expect(
          peers.studentPage.getByTestId("student-whiteboard-canvas-mount")
        ).toBeVisible();
        await expect(peers.studentPage.getByText(NOTICE)).toHaveCount(0);
        await expect(
          peers.studentPage.getByTestId("wb-transcription-language-notice")
        ).toHaveCount(0);
      } finally {
        await peers.close();
      }
    });

    test("tutor waiting-room notice stays inside the card at phone width", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const session = await seedWbPendingLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await peers.tutorPage.setViewportSize({ width: 390, height: 844 });
        const tutorOverlay = peers.tutorPage.getByTestId("wb-waiting-overlay");
        await expect(tutorOverlay).toBeVisible({ timeout: 30_000 });
        const notice = tutorOverlay.getByTestId(
          "wb-transcription-language-notice"
        );
        await expect(notice).toBeVisible();
        await expect(notice).toHaveText(NOTICE);
        await expectNoticeInsideCardAndViewport(peers.tutorPage, 4);
      } finally {
        await peers.close();
      }
    });
  }
);
