/**
 * WS-N — tutor:mic enqueue-at-cut survives tab-kill (N1/N2/N3).
 *
 * Teeth test: stub /api/upload/blob with controllable delay so VAD-cut
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
  registerOk?: boolean;
};

async function injectVadOverrides(
  page: import("@playwright/test").Page,
  opts?: { defaultMeterLevel?: number; vadCutDisabled?: boolean }
) {
  const defaultMeterLevel = opts?.defaultMeterLevel ?? 0.5;
  const vadCutDisabled = opts?.vadCutDisabled ?? false;
  await page.addInitScript(
    ({ meter, cutDisabled }) => {
      const w = window as unknown as {
        __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
        __VAD_MIN_SEGMENT_SECONDS_OVERRIDE?: number;
        __VAD_SILENCE_HOLD_MS_OVERRIDE?: number;
        __VAD_SILENCE_RMS_THRESHOLD_OVERRIDE?: number;
        __VAD_TEST_METER_LEVEL__?: number;
        __VAD_CUT_DISABLED?: boolean;
      };
      w.__VAD_MIN_SEGMENT_SECONDS_OVERRIDE = 1;
      w.__VAD_SILENCE_HOLD_MS_OVERRIDE = 800;
      w.__VAD_SILENCE_RMS_THRESHOLD_OVERRIDE = 0.15;
      w.__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 120;
      w.__VAD_TEST_METER_LEVEL__ = meter;
      if (cutDisabled) {
        w.__VAD_CUT_DISABLED = true;
      }
    },
    { meter: defaultMeterLevel, cutDisabled: vadCutDisabled }
  );
}

async function freezeVadCapture(page: import("@playwright/test").Page) {
  await setVadTestMeterLevel(page, VAD_METER_LOW);
  await page.evaluate(() => {
    (window as unknown as { __VAD_CUT_DISABLED?: boolean }).__VAD_CUT_DISABLED = true;
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
  return (await res.json()) as {
    count: number;
    byStream: Record<string, number>;
    blobUrls: string[];
    distinctBlobUrlCount: number;
  };
}

function uniqueTutorMicSegmentIds(rows: OutboxRowSnapshot[]): string[] {
  return [...new Set(rows.map((r) => r.segmentId))];
}

function installControllableUploadStub(
  context: import("@playwright/test").BrowserContext,
  opts: { block: boolean; delayMs: number }
) {
  let uploadSeq = 0;
  return context.route("**/api/upload/blob**", async (route) => {
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

    test("tab-kill mid-register backlog → End yields exact-once tutor:mic rows (WS-N registerOk/finalize race teeth)", async ({
      browser,
    }) => {
      /**
       * P1-WB-6 / WS-T #1 teeth — `6799aa4` finalize/registerOk resurrection race.
       *
       * Oracle: `/api/test/whiteboard/{id}/recording-count` (persisted SessionRecording
       * rows + blobUrl dedupe) + post-End IDB outbox row count for the session.
       * Independent of upload-outbox internals — observes durable DB + IDB persistence
       * only.
       *
       * Corrected teeth (2026-07-05): pre-kill `expectedCount` is a survival floor,
       * NOT an exact post-resume ceiling — auto-resume after tab-kill legitimately
       * creates new VAD segments. Real duplication is `distinctBlobUrlCount < count`
       * (same blobUrl persisted twice). End-time re-add is `final.count > beforeEnd.count`
       * after drain + capture freeze. Ghost resurrection is non-empty post-End outbox.
       *
       * Red-before (pre-6799aa4): finalize/registerOk race leaves ghost outbox rows;
       * blobUrl dedupe fails when mid-session + End both register the same segment.
       */
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
      await page.waitForTimeout(1_500);

      // Freeze further VAD cuts so pre-kill segment cardinality is stable.
      await freezeVadCapture(page);
      await page.waitForTimeout(500);

      const preKillRows = await listTutorMicOutboxRows(page, whiteboardSessionId);
      const expectedSegmentIds = uniqueTutorMicSegmentIds(preKillRows);
      const expectedCount = expectedSegmentIds.length;
      expect(
        expectedCount,
        `pre-kill durable tutor:mic segments (need ≥2 for race teeth): ${JSON.stringify(preKillRows.map((r) => ({ segmentId: r.segmentId, sizeBytes: r.sizeBytes })))}`
      ).toBeGreaterThanOrEqual(2);
      expect(preKillRows.every((r) => r.sizeBytes > 0)).toBe(true);

      const preKillDb = await fetchRecordingCount(page, whiteboardSessionId);
      expect(
        preKillDb.count,
        "blocked uploads must leave zero SessionRecording rows before tab-kill"
      ).toBe(0);

      // Tab-kill while uploads blocked — segments durable at cut, mid-flight upload/register.
      await page.close();

      const resumePage = await context.newPage();
      // Silence + no VAD cuts on resume so auto-resumed recording cannot add segments
      // during the drain / beforeEnd measurement window.
      await injectVadOverrides(resumePage, {
        defaultMeterLevel: VAD_METER_LOW,
        vadCutDisabled: true,
      });
      stubOpts.block = false;
      stubOpts.delayMs = 50;

      await resumePage.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(resumePage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      await freezeVadCapture(resumePage);

      const preKillIdSet = new Set(expectedSegmentIds);

      // Full backlog drain — pre-kill rows uploaded and mid-registered.
      await expect
        .poll(
          async () => {
            const rows = await listTutorMicOutboxRows(resumePage, whiteboardSessionId);
            const matching = rows.filter((r) => preKillIdSet.has(r.segmentId));
            const uploaded = matching.filter((r) => r.blobRemoteUrl).length;
            const registered = matching.filter((r) => r.registerOk).length;
            return uploaded * 1000 + registered;
          },
          { timeout: 90_000, intervals: [300, 500, 1000] }
        )
        .toBe(expectedCount * 1000 + expectedCount);

      // Wait for mid-session registration to land in SessionRecording.
      await expect
        .poll(
          async () => {
            const counts = await fetchRecordingCount(resumePage, whiteboardSessionId);
            return counts.count;
          },
          { timeout: 90_000, intervals: [500, 1000, 2000] }
        )
        .toBeGreaterThanOrEqual(expectedCount);

      // Capture frozen — recording-count must stabilize before End snapshot.
      let stableCount = -1;
      await expect
        .poll(
          async () => {
            const a = await fetchRecordingCount(resumePage, whiteboardSessionId);
            await resumePage.waitForTimeout(1_500);
            const b = await fetchRecordingCount(resumePage, whiteboardSessionId);
            stableCount = b.count;
            return a.count === b.count ? b.count : -1;
          },
          { timeout: 45_000, intervals: [500, 1000, 2000] }
        )
        .toBeGreaterThanOrEqual(expectedCount);

      const beforeEnd = await fetchRecordingCount(resumePage, whiteboardSessionId);
      expect(beforeEnd.count).toBe(stableCount);
      expect(beforeEnd.count).toBeGreaterThanOrEqual(expectedCount);

      const endBtn = resumePage.getByTestId("wb-end-session");
      await expect(endBtn).toBeEnabled();
      await endBtn.click();
      const confirmBtn = resumePage.getByTestId("wb-end-session-confirm-yes");
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();

      await expect(resumePage.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 180_000,
      });

      await expect
        .poll(
          async () => {
            const counts = await fetchRecordingCount(resumePage, whiteboardSessionId);
            return counts.count;
          },
          { timeout: 120_000, intervals: [1000, 2000, 3000] }
        )
        .toBeGreaterThanOrEqual(expectedCount);

      const final = await fetchRecordingCount(resumePage, whiteboardSessionId);

      // 1. Survival — pre-kill segments not lost; tutor:mic only.
      expect(
        final.count,
        `SessionRecording rows must survive tab-kill (lost=${final.count < expectedCount})`
      ).toBeGreaterThanOrEqual(expectedCount);
      expect(Object.keys(final.byStream)).toEqual(["tutor:mic"]);
      expect(final.byStream["tutor:mic"] ?? 0).toBe(final.count);

      // 2. No duplicate persistence — each blobUrl at most once in DB.
      expect(
        final.distinctBlobUrlCount,
        `duplicate blobUrl persistence (distinct=${final.distinctBlobUrlCount}, count=${final.count}, blobUrls=${JSON.stringify(final.blobUrls)})`
      ).toBe(final.count);

      // 3. No End-time re-add of blobUrls already mid-registered before End.
      // Each beforeEnd blobUrl must appear exactly once in final (dedupe across
      // mid-session register + End extraSegments). Count may grow only by novel
      // blobUrls not present at the pre-End snapshot.
      for (const url of beforeEnd.blobUrls) {
        expect(
          final.blobUrls.filter((u) => u === url).length,
          `blobUrl re-persisted at End (mid-session+End dedupe broken): ${url}`
        ).toBe(1);
      }
      const novelBlobUrls = [
        ...new Set(final.blobUrls.filter((u) => !beforeEnd.blobUrls.includes(u))),
      ];
      expect(
        final.count,
        `End re-added existing rows (beforeEnd=${beforeEnd.count}, final=${final.count}, novel=${novelBlobUrls.length})`
      ).toBe(beforeEnd.count + novelBlobUrls.length);

      // 4. No resurrected ghost — finalize must drain outbox completely.
      const postEndOutbox = await listTutorMicOutboxRows(resumePage, whiteboardSessionId);
      expect(
        postEndOutbox,
        `post-End outbox must be empty — resurrection leaves ghost rows (pre-6799aa4): ${JSON.stringify(postEndOutbox.map((r) => ({ segmentId: r.segmentId, registerOk: r.registerOk })))}`
      ).toEqual([]);

      await context.close();
    });
  }
);
