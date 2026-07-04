/**
 * WS-N — tutor:mic enqueue-at-cut survives tab-kill (N1/N2/N3).
 *
 * Teeth test: stub /api/upload/audio with controllable delay so VAD-cut
 * segments are still uploading when context.close() simulates tab-kill.
 * After resume, durable IDB outbox rows must exist; worker drain + End must
 * register segments server-side.
 *
 * Run:
 *   npx playwright test tests/integration/wb-tab-kill-audio-durability.spec.ts --project=wb-regression
 */

import { test, expect } from "./fixtures";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

const VAD_METER_HIGH = 0.5;
const VAD_METER_LOW = 0;

type OutboxRowSnapshot = {
  streamId: string;
  segmentId: string;
  transcriptionOnly?: boolean;
  blobRemoteUrl: string | null;
  blobLocalRef?: Blob | null;
  sizeBytes: number;
};

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

async function listTutorMicOutboxRows(
  page: import("@playwright/test").Page,
  sessionId: string
): Promise<OutboxRowSnapshot[]> {
  return page.evaluate(async (wbsid) => {
    const DB_NAME = "tutoring-notes-upload-outbox";
    const STORE = "rows";
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const all = await new Promise<OutboxRowSnapshot[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as OutboxRowSnapshot[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return all.filter(
      (r) =>
        (r as { sessionId?: string }).sessionId === wbsid &&
        r.streamId === "tutor:mic" &&
        r.transcriptionOnly !== true
    );
  }, sessionId);
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

function installControllableUploadStub(
  context: import("@playwright/test").BrowserContext,
  opts: { block: boolean; delayMs: number }
) {
  let uploadSeq = 0;
  return context.route("**/api/upload/audio**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    if (opts.block) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "upload blocked for tab-kill test" }),
      });
      return;
    }
    if (opts.delayMs > 0) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
    uploadSeq += 1;
    // Let the real handleUpload mint a token when BLOB is configured;
    // fall back to a minimal JSON body for environments without Blob.
    try {
      await route.continue();
    } catch {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: `https://test.public.blob.vercel-storage.com/wb-tab-kill-${uploadSeq}.webm`,
        }),
      });
    }
  });
}

test.describe(
  "WS-N tab-kill tutor:mic outbox durability",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("VAD-cut segments durable in IDB through tab-kill → resume drain → End registers", async ({
      browser,
    }) => {
      test.setTimeout(300_000);

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

      const context = await browser.newContext();
      const page = await context.newPage();
      await injectVadOverrides(page);

      const stubOpts = { block: true, delayMs: 0 };
      await installControllableUploadStub(context, stubOpts);

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      await page.waitForTimeout(2_000);
      await driveTwoVadSilenceCuts(page);

      // Allow onstop → enqueue-at-cut to land in IDB (uploads are blocked).
      await page.waitForTimeout(1_500);

      const preKillRows = await listTutorMicOutboxRows(page, whiteboardSessionId);
      // RED-BEFORE (pre-N1): 0 rows — segments only enqueue after upload completes.
      // GREEN-AFTER (N1): ≥1 row with blobLocalRef bytes at cut.
      expect(
        preKillRows.length,
        `pre-kill tutor:mic outbox rows (need ≥1 durable-at-cut): ${JSON.stringify(preKillRows.map((r) => ({ segmentId: r.segmentId, hasRemote: !!r.blobRemoteUrl, sizeBytes: r.sizeBytes })))}`
      ).toBeGreaterThanOrEqual(1);
      expect(preKillRows.some((r) => r.sizeBytes > 0)).toBe(true);

      const preKillSegmentCount = preKillRows.length;
      // Tab-kill: close page only — same BrowserContext keeps origin IDB.
      await page.close();

      const resumePage = await context.newPage();
      await injectVadOverrides(resumePage);
      stubOpts.block = false;
      stubOpts.delayMs = 50;

      await resumePage.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(resumePage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      const postResumeRows = await listTutorMicOutboxRows(
        resumePage,
        whiteboardSessionId
      );
      expect(postResumeRows.length).toBeGreaterThanOrEqual(preKillSegmentCount);

      // Unblock worker drain — rows should acquire blobRemoteUrl.
      await expect
        .poll(
          async () => {
            const rows = await listTutorMicOutboxRows(resumePage, whiteboardSessionId);
            return rows.filter((r) => r.blobRemoteUrl).length;
          },
          { timeout: 60_000, intervals: [500, 1000, 2000] }
        )
        .toBeGreaterThanOrEqual(preKillSegmentCount);

      await resumePage.getByTestId("wb-end-session").click();
      const confirmBtn = resumePage.getByTestId("wb-end-session-confirm-yes");
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();

      await expect
        .poll(
          async () => {
            const counts = await fetchRecordingCount(resumePage, whiteboardSessionId);
            return counts.byStream["tutor:mic"] ?? 0;
          },
          { timeout: 120_000, intervals: [1000, 2000, 3000] }
        )
        .toBeGreaterThanOrEqual(preKillSegmentCount);

      const final = await fetchRecordingCount(resumePage, whiteboardSessionId);
      expect(final.count).toBeGreaterThanOrEqual(preKillSegmentCount);
      expect(final.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(preKillSegmentCount);

      await context.close();
    });
  }
);
