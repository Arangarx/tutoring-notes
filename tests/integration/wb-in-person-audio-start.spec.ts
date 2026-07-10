/**
 * P1-WB-10 — IN_PERSON audio starts on Start without a remote peer.
 *
 * Prod defaults (`NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT` unset): without
 * `inPersonMode` FSM wiring, the recorder sits in armed/awaiting_first_participant
 * and captures zero tutor:mic audio. Run on wb-in-person-unmasked for the true gate.
 *
 * Run:
 *   npx playwright test tests/integration/wb-in-person-audio-start.spec.ts --project=wb-in-person-unmasked
 *   npx playwright test tests/integration/wb-in-person-audio-start.spec.ts --project=wb-regression
 */

import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import {
  seedWbPendingLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

const VAD_METER_HIGH = 0.5;
const VAD_METER_LOW = 0;

async function injectVadOverrides(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
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

async function setVadTestMeterLevel(
  page: import("@playwright/test").Page,
  level: number
) {
  await page.evaluate((lvl) => {
    (window as unknown as { __VAD_TEST_METER_LEVEL__?: number }).__VAD_TEST_METER_LEVEL__ =
      lvl;
  }, level);
}

async function driveVadSilenceCut(page: import("@playwright/test").Page) {
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

test.describe(
  "IN_PERSON audio start without student join",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("Start with no student → Recording pill, no autopause banner, tutor:mic SessionRecording", async ({
      browser,
    }) => {
      test.setTimeout(300_000);

      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const session = await seedWbPendingLiveSyncSession({ sessionMode: "IN_PERSON" });

      const tutorCtx = await browser.newContext({
        storageState: "tests/integration/.auth/tutor.json",
        viewport: { width: 1280, height: 900 },
        permissions: ["microphone"],
      });

      try {
        const tutorPage = await tutorCtx.newPage();
        await injectVadOverrides(tutorPage);

        await tutorPage.goto(
          `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await waitForWbE2eBridge(tutorPage, "tutor");
        await expect(tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible({
          timeout: 10_000,
        });
        await expect(tutorPage.getByTestId("wb-waiting-overlay")).toHaveAttribute(
          "data-session-mode",
          "IN_PERSON",
          { timeout: 5_000 }
        );

        const startBtn = tutorPage.getByTestId("wb-start-session");
        await expect(startBtn).toBeEnabled({ timeout: 10_000 });
        await startBtn.click();
        await expect(tutorPage.getByTestId("wb-waiting-overlay")).not.toBeVisible({
          timeout: 60_000,
        });

        const recordingPill = tutorPage.getByTestId("wb-recording-pill");
        await expect(recordingPill).toBeVisible({ timeout: 15_000 });
        await expect(recordingPill).toContainText("Recording", { timeout: 15_000 });
        await expect(recordingPill).not.toContainText(/Solo rehearsal|Waiting for student/i);

        await expect(tutorPage.getByTestId("wb-recording-autopause-banner")).toHaveCount(0);

        await tutorPage.waitForTimeout(2_000);
        await driveVadSilenceCut(tutorPage);

        await tutorPage.getByTestId("wb-end-session").click();
        const confirmBtn = tutorPage.getByTestId("wb-end-session-confirm-yes");
        if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await confirmBtn.click();
        }

        await expect(tutorPage.getByTestId("wb-session-review-mode")).toBeVisible({
          timeout: 120_000,
        });

        const recordings = await fetchRecordingCount(tutorPage, session.whiteboardSessionId);
        expect(recordings.count).toBeGreaterThanOrEqual(1);
        expect(recordings.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(1);

        const prisma = new PrismaClient();
        try {
          const rows = await prisma.sessionRecording.findMany({
            where: { whiteboardSessionId: session.whiteboardSessionId },
            select: { streamId: true },
          });
          expect(rows.length).toBeGreaterThanOrEqual(1);
          expect(rows.some((r) => r.streamId === "tutor:mic")).toBe(true);
        } finally {
          await prisma.$disconnect();
        }
      } finally {
        await tutorCtx.close();
      }
    });
  }
);
