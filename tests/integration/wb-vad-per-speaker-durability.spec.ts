import { test, expect } from "./fixtures";
import { readLocalEnv } from "../utils/read-dotenv";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";

/**
 * WS-A Part 1 (A1+A2) — VAD silence-boundary segmentation + incremental
 * SessionRecording register. Steps 3, 5, 5b deferred to WS-A Part 2 (A3).
 *
 * Primary path uses solo tutor workspace (same harness as recording-end-to-end)
 * so VAD init-script overrides apply before first paint. Relay two-party
 * coverage remains in the full `test:wb-sync` gate.
 */

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

async function injectVadOverrides(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_MIN_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_SILENCE_HOLD_MS_OVERRIDE?: number;
      __VAD_SILENCE_RMS_THRESHOLD_OVERRIDE?: number;
      __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number;
      __VAD_CUT_DISABLED?: boolean;
    };
    w.__VAD_MIN_SEGMENT_SECONDS_OVERRIDE = 1;
    w.__VAD_SILENCE_HOLD_MS_OVERRIDE = 800;
    w.__VAD_SILENCE_RMS_THRESHOLD_OVERRIDE = 0.15;
    w.__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 120;
  });
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

    await page.waitForTimeout(3_000);
    await page.waitForTimeout(3_500);
    await page.waitForTimeout(2_500);
    await page.waitForTimeout(3_500);
    await page.waitForTimeout(8_000);

    const mid = await fetchRecordingCount(page, whiteboardSessionId);
    expect(mid.count).toBeGreaterThanOrEqual(2);
    expect(mid.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(2);
  });

  test.fixme("student transcriptionOnly upload — WS-A Part 2 (A3)", async () => {});

  test.fixme("TranscriptChunk rows for tutor:mic + per-speaker — WS-A Part 2 (A3)", async () => {});

  test.fixme(
    "replay mix excludes transcriptionOnly rows — WS-A Part 2 (A3) step 5b",
    async () => {}
  );

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
      };
      w.__VAD_CUT_DISABLED = true;
      w.__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 9999;
    });

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    await page.waitForTimeout(3_000);
    await page.waitForTimeout(3_500);
    await page.waitForTimeout(2_500);
    await page.waitForTimeout(3_500);
    await page.waitForTimeout(8_000);

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
