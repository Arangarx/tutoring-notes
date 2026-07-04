import { test, expect } from "./fixtures";
import { readLocalEnv } from "../utils/read-dotenv";
import {
  openTutorAndStudent,
  seedWbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";

/**
 * WS-A — VAD + per-speaker transcription lanes + replay-mix invariant.
 * Steps 1–2 + red-before cases: solo tutor path (Part 1).
 * Steps 3, 5, 5b: hermetic relay two-party (Part 2 A3+A4).
 */

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

/** Above injectVadOverrides threshold (0.15) — forces "speech" in VAD tick. */
const VAD_METER_HIGH = 0.5;
/** Below threshold — forces silence accumulation toward a boundary cut. */
const VAD_METER_LOW = 0;

async function injectVadOverrides(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_MIN_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_SILENCE_HOLD_MS_OVERRIDE?: number;
      __VAD_SILENCE_RMS_THRESHOLD_OVERRIDE?: number;
      __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number;
      __VAD_CUT_DISABLED?: boolean;
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

/**
 * Drive speak → silence → speak → silence via the test-only meter seam so
 * ≥2 VAD boundary cuts fire (VAD_MIN=1s, SILENCE_HOLD=800ms in overrides).
 */
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

async function fetchTranscriptChunks(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/transcript-chunks`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as {
    count: number;
    byStream: Record<string, number>;
    rows: Array<{ streamId: string; speakerId: string | null; status: string }>;
    tutorNoteStatus: string | null;
  };
}

type OutboxRowSnapshot = {
  streamId: string;
  transcriptionOnly?: boolean;
  blobRemoteUrl: string | null;
};

async function listOutboxRowsForSession(
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
    return all.filter((r) => (r as { sessionId?: string }).sessionId === wbsid);
  }, sessionId);
}

test.describe("wb VAD + incremental SessionRecording (WS-A A1+A2)", () => {
  test("speak → silence → speak yields ≥2 mixdown uploads and mid-session DB rows", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for VAD durability integration."
    );

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await injectVadOverrides(page);

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    // Let recording + meter RAF start, then drive two silence-boundary cuts.
    await page.waitForTimeout(2_000);
    await driveTwoVadSilenceCuts(page);

    await expect
      .poll(
        async () => {
          const mid = await fetchRecordingCount(page, whiteboardSessionId);
          return mid.count;
        },
        { timeout: 120_000, intervals: [500, 1000, 2000] }
      )
      .toBeGreaterThanOrEqual(2);

    const mid = await fetchRecordingCount(page, whiteboardSessionId);
    expect(mid.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("red-before: VAD cut disabled → recording count stays below 2", async ({ page }) => {
    test.setTimeout(180_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for VAD durability integration."
    );

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await page.addInitScript(() => {
      const w = window as unknown as {
        __VAD_CUT_DISABLED?: boolean;
        __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
        __VAD_TEST_METER_LEVEL__?: number;
      };
      w.__VAD_CUT_DISABLED = true;
      w.__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 9999;
      w.__VAD_TEST_METER_LEVEL__ = 0.5;
    });

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    await page.waitForTimeout(2_000);
    await driveTwoVadSilenceCuts(page);
    await page.waitForTimeout(5_000);

    const mid = await fetchRecordingCount(page, whiteboardSessionId);
    expect(mid.count).toBeLessThan(2);
  });

  test("red-before: SESSION_SAFETY_MAX_SECONDS override still hard-stops", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for VAD durability integration."
    );

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await page.addInitScript(() => {
      (
        window as unknown as { __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number }
      ).__SESSION_SAFETY_MAX_SECONDS_OVERRIDE = 8;
    });

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    await page.waitForTimeout(12_000);

    const panelHidden = await page
      .getByTestId("audio-record-controls")
      .isHidden()
      .catch(() => true);
    const reviewVisible = await page
      .getByTestId("wb-session-review-mode")
      .isVisible()
      .catch(() => false);
    expect(panelHidden || reviewVisible).toBeTruthy();
  });
});

test.describe("wb per-speaker transcription + replay-mix (WS-A A3+A4)", () => {
  test("student speaks → transcriptionOnly upload; End → chunks + replay is mixdown-only", async ({
    browser,
  }) => {
    test.setTimeout(420_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for per-speaker durability integration."
    );

    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await injectVadOverrides(peers.tutorPage);
      await injectVadOverrides(peers.studentPage);

      await peers.tutorPage.waitForTimeout(2_000);
      await driveTwoVadSilenceCuts(peers.tutorPage);

      await expect
        .poll(
          async () => {
            const mid = await fetchRecordingCount(
              peers.tutorPage,
              session.whiteboardSessionId
            );
            return mid.byStream["tutor:mic"] ?? 0;
          },
          { timeout: 120_000, intervals: [500, 1000, 2000] }
        )
        .toBeGreaterThanOrEqual(1);

      const midMixdown = await fetchRecordingCount(
        peers.tutorPage,
        session.whiteboardSessionId
      );

      await peers.studentPage.waitForTimeout(5_000);
      await peers.tutorPage.waitForTimeout(3_000);

      const outboxRows = await listOutboxRowsForSession(
        peers.tutorPage,
        session.whiteboardSessionId
      );
      const studentTxRows = outboxRows.filter(
        (r) =>
          r.transcriptionOnly === true &&
          /^student:peer-.+:mic$/.test(r.streamId) &&
          typeof r.blobRemoteUrl === "string" &&
          r.blobRemoteUrl.length > 0
      );
      expect(studentTxRows.length).toBeGreaterThanOrEqual(1);

      const mixdownUploadCount = midMixdown.byStream["tutor:mic"] ?? 0;

      await peers.tutorPage.getByTestId("wb-end-session").click();
      const confirmBtn = peers.tutorPage.getByTestId("wb-end-session-confirm-yes");
      if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      await expect(peers.tutorPage.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 180_000,
      });

      await expect
        .poll(
          async () => {
            const tx = await fetchTranscriptChunks(
              peers.tutorPage,
              session.whiteboardSessionId
            );
            return tx.tutorNoteStatus;
          },
          { timeout: 240_000 }
        )
        .toMatch(/^(done|partial)$/);

      const tx = await fetchTranscriptChunks(
        peers.tutorPage,
        session.whiteboardSessionId
      );
      expect(tx.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(1);
      const perSpeakerStreamIds = Object.keys(tx.byStream).filter((id) =>
        id.startsWith("speaker:")
      );
      expect(perSpeakerStreamIds.length).toBeGreaterThanOrEqual(1);

      const replay = await fetchRecordingCount(
        peers.tutorPage,
        session.whiteboardSessionId
      );
      // Replay set is mixdown-only; count may grow between mid-session snapshot and End.
      expect(replay.count).toBeGreaterThanOrEqual(mixdownUploadCount);
      expect(replay.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(mixdownUploadCount);
      for (const streamId of Object.keys(replay.byStream)) {
        expect(streamId).toBe("tutor:mic");
      }
    } finally {
      await peers.close();
    }
  });
});
