/**
 * P1-WB-8 / WS-S — review overlay content honesty across 3 End paths.
 *
 * Contract: overlay affordances must agree with persisted SessionRecording rows
 * (`GET /api/test/whiteboard/{id}/recording-count`).
 *   - Seeded (VAD-driven audio): recording-count >= 1 ↔ replay CTA visible.
 *   - No user-driven VAD: pre-End outbox empty; post-End affordance ↔ recording-count.
 *
 * Paths: in-live (workspace End), gate (resume gate End-and-review), roster.
 *
 * Run:
 *   npx playwright test tests/integration/wb-review-overlay-3paths.spec.ts --project=wb-regression
 */

import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

const VAD_METER_HIGH = 0.5;
const VAD_METER_LOW = 0;

type RecordingCountPayload = {
  count: number;
  byStream: Record<string, number>;
};

type WbDbStatePayload = {
  batchCount: number;
  lastPersistedToIndex: number;
  latestToEventIndex: number | null;
};

async function injectVadOverrides(page: Page) {
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

async function setVadTestMeterLevel(page: Page, level: number) {
  await page.evaluate((lvl: number) => {
    (window as unknown as { __VAD_TEST_METER_LEVEL__?: number }).__VAD_TEST_METER_LEVEL__ =
      lvl;
  }, level);
}

async function driveTwoVadSilenceCuts(page: Page) {
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
  page: Page,
  sessionId: string
): Promise<RecordingCountPayload> {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/recording-count`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as RecordingCountPayload;
}

async function fetchWbDbState(
  page: Page,
  sessionId: string
): Promise<WbDbStatePayload> {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/db-state`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as WbDbStatePayload;
}

function sessionHasPersistedBoardEvents(dbState: WbDbStatePayload): boolean {
  return (
    dbState.batchCount > 0 ||
    dbState.lastPersistedToIndex >= 0 ||
    (dbState.latestToEventIndex ?? -1) >= 0
  );
}

async function makeSessionStale(whiteboardSessionId: string) {
  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.update({
      where: { id: whiteboardSessionId },
      data: { startedAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function loadWorkspace(page: Page, studentId: string, whiteboardSessionId: string) {
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
}

async function endInLive(page: Page) {
  await page.getByTestId("wb-end-session").click();
  await expect(page.getByTestId("wb-end-session-confirm")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByTestId("wb-end-session-confirm-yes").click();
}

async function endViaGate(page: Page, studentId: string, whiteboardSessionId: string) {
  await makeSessionStale(whiteboardSessionId);
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("wb-resume-gate")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("wb-resume-gate-end-and-review").click();
}

async function endViaRoster(page: Page, studentId: string) {
  await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  const endAndReviewBtn = page.getByTestId("roster-end-and-review").first();
  await expect(endAndReviewBtn).toBeVisible({ timeout: 10_000 });
  await endAndReviewBtn.click();
}

async function waitForReviewOverlay(page: Page) {
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("wb-waiting-overlay")).not.toBeVisible();
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).not.toBeVisible();
}

async function countUploadedTutorMicOutbox(page: Page, sessionId: string): Promise<number> {
  return page.evaluate(async (wbsid: string) => {
    const DB_NAME = "tutoring-notes-upload-outbox";
    const STORE = "rows";
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!db.objectStoreNames.contains(STORE)) {
      db.close();
      return 0;
    }
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const all = await new Promise<
      { sessionId?: string; streamId: string; blobRemoteUrl: string | null }[]
    >((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return all.filter(
      (r) =>
        r.sessionId === wbsid && r.streamId === "tutor:mic" && r.blobRemoteUrl
    ).length;
  }, sessionId);
}

/**
 * UI ↔ DB honesty oracle — non-empty: persisted rows exist AND replay CTA is shown.
 */
async function assertOverlayHonestNonEmpty(page: Page, sessionId: string) {
  await expect
    .poll(
      async () => (await fetchRecordingCount(page, sessionId)).count,
      { timeout: 90_000, intervals: [1000, 2000, 3000] }
    )
    .toBeGreaterThanOrEqual(1);

  const rec = await fetchRecordingCount(page, sessionId);
  expect(rec.count, "P1-WB-8: SessionRecording rows must exist after seeded End").toBeGreaterThanOrEqual(
    1
  );
  expect(
    rec.byStream["tutor:mic"] ?? 0,
    "P1-WB-8: seeded audio must be tutor:mic mixdown"
  ).toBeGreaterThanOrEqual(1);

  await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("wb-review-no-recording")).not.toBeVisible();
  await expect(page.getByTestId("wb-review-no-audio-note")).not.toBeVisible();
}

async function assertPreEndNoUserDrivenVad(page: Page, sessionId: string) {
  const preUploaded = await countUploadedTutorMicOutbox(page, sessionId);
  expect(
    preUploaded,
    "P1-WB-8: no user-driven VAD — outbox must have zero uploaded tutor:mic segments before End"
  ).toBe(0);
}

/**
 * Post-End UI ↔ DB agreement (Option B honesty):
 *   - count >= 1 → full replay CTA, no empty-state, no no-audio note.
 *   - count === 0 + persisted board events → replay CTA + explicit no-audio note.
 *   - count === 0 + no board events → honest empty-state.
 */
async function assertOverlayAffordanceMatchesDb(page: Page, sessionId: string) {
  const rec = await fetchRecordingCount(page, sessionId);
  if (rec.count >= 1) {
    await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("wb-review-no-recording")).not.toBeVisible();
    await expect(page.getByTestId("wb-review-no-audio-note")).not.toBeVisible();
  } else {
    expect(rec.count).toBe(0);
    const dbState = await fetchWbDbState(page, sessionId);
    const hasBoardEvents = sessionHasPersistedBoardEvents(dbState);
    if (hasBoardEvents) {
      await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({
        timeout: 30_000,
      });
      const noAudioNote = page.getByTestId("wb-review-no-audio-note");
      await expect(noAudioNote).toBeVisible({ timeout: 30_000 });
      await expect(noAudioNote).toContainText(
        "No audio was recorded for this session."
      );
      await expect(page.getByTestId("wb-review-no-recording")).not.toBeVisible();
    } else {
      const emptyState = page.getByTestId("wb-review-no-recording");
      await expect(emptyState).toBeVisible({ timeout: 30_000 });
      await expect(emptyState).toContainText(
        "Nothing was recorded for this session."
      );
      await expect(page.getByTestId("wb-review-enter-replay")).not.toBeVisible();
      await expect(page.getByTestId("wb-review-no-audio-note")).not.toBeVisible();
    }
  }
}

async function driveSeededAudioCapture(page: Page, sessionId: string) {
  await injectVadOverrides(page);
  await page.waitForTimeout(2_000);
  await driveTwoVadSilenceCuts(page);
  await page.waitForTimeout(2_000);

  await expect
    .poll(
      async () => {
        const rows = await page.evaluate(async (wbsid: string) => {
          const DB_NAME = "tutoring-notes-upload-outbox";
          const STORE = "rows";
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const tx = db.transaction(STORE, "readonly");
          const store = tx.objectStore(STORE);
          const all = await new Promise<
            { sessionId?: string; streamId: string; blobRemoteUrl: string | null }[]
          >((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          db.close();
          return all.filter(
            (r) =>
              r.sessionId === wbsid &&
              r.streamId === "tutor:mic" &&
              r.blobRemoteUrl
          ).length;
        }, sessionId);
        return rows;
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] }
    )
    .toBeGreaterThanOrEqual(1);
}

test.describe(
  "P1-WB-8 — review overlay content honesty (WS-S)",
  { tag: [TAG.WB_RECORDING, TAG.WB_CHROME] },
  () => {
    test.describe("in-live End path", () => {
      test("seeded VAD audio — overlay replay CTA agrees with recording-count >= 1", async ({
        page,
      }) => {
        test.setTimeout(300_000);
        test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

        const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
        await loadWorkspace(page, studentId, whiteboardSessionId);
        await driveSeededAudioCapture(page, whiteboardSessionId);

        await endInLive(page);
        await waitForReviewOverlay(page);
        await assertOverlayHonestNonEmpty(page, whiteboardSessionId);

        await page.getByTestId("wb-review-enter-replay").click();
        await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
          timeout: 60_000,
        });
      });

      test("no user-driven VAD — overlay affordance honestly matches recording-count", async ({
        page,
      }) => {
        test.setTimeout(180_000);
        test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

        const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
        await loadWorkspace(page, studentId, whiteboardSessionId);
        await page.waitForTimeout(1_500);
        await assertPreEndNoUserDrivenVad(page, whiteboardSessionId);

        await endInLive(page);
        await waitForReviewOverlay(page);
        await assertOverlayAffordanceMatchesDb(page, whiteboardSessionId);
      });
    });

    test.describe("gate End path", () => {
      test("seeded VAD audio — overlay replay CTA agrees with recording-count >= 1", async ({
        page,
      }) => {
        test.setTimeout(300_000);
        test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

        const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
        await loadWorkspace(page, studentId, whiteboardSessionId);
        await driveSeededAudioCapture(page, whiteboardSessionId);

        await endViaGate(page, studentId, whiteboardSessionId);
        await waitForReviewOverlay(page);
        await assertOverlayHonestNonEmpty(page, whiteboardSessionId);
      });

      // WS-T #9 — gate-only End (no live mount) intermittently crashes with
      // "Whiteboard hit an error: IDB object store not found" before the review
      // overlay can mount (fragile-CORE whiteboard IDB). Un-fixme when the IDB
      // lifecycle fix lands (design-first + Andrew go).
      test.fixme(
        "no user-driven VAD — overlay affordance honestly matches recording-count",
        async ({ page }) => {
          test.setTimeout(180_000);
          test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

          const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
          await makeSessionStale(whiteboardSessionId);
          await page.goto(
            `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await page.waitForLoadState("networkidle");
          await expect(page.getByTestId("wb-resume-gate")).toBeVisible({
            timeout: 30_000,
          });
          await assertPreEndNoUserDrivenVad(page, whiteboardSessionId);

          await page.getByTestId("wb-resume-gate-end-and-review").click();
          await waitForReviewOverlay(page);
          await assertOverlayAffordanceMatchesDb(page, whiteboardSessionId);
        }
      );
    });

    test.describe("roster End path", () => {
      test("seeded VAD audio — overlay replay CTA agrees with recording-count >= 1", async ({
        page,
      }) => {
        test.setTimeout(300_000);
        test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

        const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
        await loadWorkspace(page, studentId, whiteboardSessionId);
        await driveSeededAudioCapture(page, whiteboardSessionId);

        await endViaRoster(page, studentId);
        await waitForReviewOverlay(page);
        await assertOverlayHonestNonEmpty(page, whiteboardSessionId);
      });

      test(
        "no user-driven VAD — overlay affordance honestly matches recording-count",
        async ({ page }) => {
          test.setTimeout(180_000);
          test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

          const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
          await loadWorkspace(page, studentId, whiteboardSessionId);
          await page.waitForTimeout(1_500);
          await assertPreEndNoUserDrivenVad(page, whiteboardSessionId);
          await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle");

          await endViaRoster(page, studentId);
          await waitForReviewOverlay(page);
          await assertOverlayAffordanceMatchesDb(page, whiteboardSessionId);
        }
      );
    });
  }
);
