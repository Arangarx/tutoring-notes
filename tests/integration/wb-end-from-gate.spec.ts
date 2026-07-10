/**
 * WS-C / SSG-2 / WS-N4 — "End and review" from WorkspaceResumeGate.
 *
 * Server-side finalize then straight to SessionReviewMode (no intent=endreview flash).
 * WS-N4: outbox-only segments (blobRemoteUrl set, SessionRecording count 0) must
 * survive gate End via extraSegments.
 *
 * Run:
 *   npx playwright test tests/integration/wb-end-from-gate.spec.ts --project=wb-regression
 */

import { test, expect } from "./fixtures";
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

type OutboxRowSnapshot = {
  streamId: string;
  segmentId: string;
  transcriptionOnly?: boolean;
  blobRemoteUrl: string | null;
  sizeBytes: number;
};

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

/** Block mid-session registerWhiteboardSessionAudioSegmentAction (WS-N4 orphan oracle). */
function installMidSessionRegisterBlock(
  context: import("@playwright/test").BrowserContext,
  opts: { block: boolean }
) {
  return context.route("**/admin/students/**", async (route, request) => {
    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      await route.continue();
      return;
    }
    const body = request.postData() ?? "";
    const looksLikeMidSessionRegister =
      body.includes("blobUrl") &&
      body.includes("mimeType") &&
      body.includes("sizeBytes") &&
      !body.includes("extraSegments");
    if (opts.block && looksLikeMidSessionRegister) {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:{"ok":false,"error":"e2e blocked mid-session register (WS-N4)"}\n`,
      });
      return;
    }
    await route.continue();
  });
}

async function fetchDbState(page: import("@playwright/test").Page, sessionId: string) {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/db-state`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as {
    endedAt: string | null;
    eventsBlobUrl: string | null;
    batchCount: number;
    lastPersistedToIndex: number;
  };
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

async function drawStrokes(page: import("@playwright/test").Page) {
  const canvas = page
    .locator('[data-testid="tutor-whiteboard-canvas-mount"] canvas')
    .first();
  await canvas.waitFor({ state: "visible", timeout: 60_000 });
  await page.keyboard.press("r");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Excalidraw canvas has no bounding box");
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(box.x + 90 + i * 75, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 160 + i * 75, box.y + 170);
    await page.mouse.up();
  }
}

async function seedStaleSession() {
  const session = await seedWbLiveSyncSession();
  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.update({
      where: { id: session.whiteboardSessionId },
      data: { startedAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
  } finally {
    await prisma.$disconnect();
  }
  return session;
}

test.describe(
  "WS-N4 gate: outbox-only segments survive End and review",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test(
      "VAD segments uploaded but not mid-session registered → gate End → SessionRecording + replay",
      async ({ browser }) => {
        test.setTimeout(300_000);

        test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

        const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

        const context = await browser.newContext();
        const page = await context.newPage();
        const registerBlock = { block: true };
        await installMidSessionRegisterBlock(context, registerBlock);

        const preState = await fetchDbState(page, whiteboardSessionId);
        const initialEventsBlobUrl = preState.eventsBlobUrl;

        await injectVadOverrides(page);
        await page.goto(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });

        await page.waitForTimeout(2_000);
        await drawStrokes(page);
        await driveTwoVadSilenceCuts(page);
        await page.waitForTimeout(2_000);

        await expect
          .poll(
            async () => (await fetchDbState(page, whiteboardSessionId)).batchCount,
            { timeout: 60_000 }
          )
          .toBeGreaterThanOrEqual(1);

        let expectedSegmentCount = 0;
        await expect
          .poll(
            async () => {
              const rows = await listTutorMicOutboxRows(page, whiteboardSessionId);
              const uploaded = rows.filter((r) => r.blobRemoteUrl);
              expectedSegmentCount = uploaded.length;
              return uploaded.length;
            },
            { timeout: 60_000, intervals: [500, 1000, 2000] }
          )
          .toBeGreaterThanOrEqual(1);

        const preEndRecordings = await fetchRecordingCount(page, whiteboardSessionId);
        expect(
          preEndRecordings.count,
          "WS-N4 oracle: mid-session register blocked — SessionRecording must stay 0"
        ).toBe(0);

        const prisma = new PrismaClient();
        try {
          await prisma.whiteboardSession.update({
            where: { id: whiteboardSessionId },
            data: { startedAt: new Date(Date.now() - 11 * 60 * 1000) },
          });
        } finally {
          await prisma.$disconnect();
        }

        registerBlock.block = false;

        await page.goto(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await page.waitForLoadState("networkidle");

        const gateDialog = page.getByTestId("wb-resume-gate");
        await expect(gateDialog).toBeVisible({ timeout: 30_000 });

        const endAndReviewBtn = page.getByTestId("wb-resume-gate-end-and-review");
        await expect(endAndReviewBtn).toBeVisible({ timeout: 5_000 });
        await endAndReviewBtn.click();

        await expect(page).not.toHaveURL(/intent=endreview/, { timeout: 5_000 });
        await expect(page.getByTestId("wb-waiting-overlay")).not.toBeVisible();
        await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).not.toBeVisible();
        await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
          timeout: 30_000,
        });

        const postState = await fetchDbState(page, whiteboardSessionId);
        expect(postState.endedAt).toBeTruthy();
        if (initialEventsBlobUrl && postState.eventsBlobUrl) {
          expect(
            postState.lastPersistedToIndex >= 0 ||
              postState.eventsBlobUrl !== initialEventsBlobUrl
          ).toBeTruthy();
        }

        await expect
          .poll(
            async () => {
              const rec = await fetchRecordingCount(page, whiteboardSessionId);
              return rec.byStream["tutor:mic"] ?? 0;
            },
            { timeout: 60_000, intervals: [1000, 2000, 3000] }
          )
          .toBeGreaterThanOrEqual(expectedSegmentCount);

        const recordings = await fetchRecordingCount(page, whiteboardSessionId);
        expect(
          recordings.count,
          "SessionRecording must survive outbox-only gate End-and-review"
        ).toBeGreaterThanOrEqual(Math.max(1, expectedSegmentCount));
        expect(Object.keys(recordings.byStream)).toEqual(["tutor:mic"]);
        expect(recordings.byStream["tutor:mic"] ?? 0).toBe(recordings.count);
        expect(
          recordings.distinctBlobUrlCount,
          `duplicate blobUrl persistence (distinct=${recordings.distinctBlobUrlCount}, count=${recordings.count}, blobUrls=${JSON.stringify(recordings.blobUrls)})`
        ).toBe(recordings.count);

        const eventsRes = await page.request.get(
          `/api/whiteboard/${whiteboardSessionId}/events`
        );
        expect(eventsRes.ok()).toBeTruthy();
        const eventsBody = (await eventsRes.json()) as { events?: unknown[] };
        expect(Array.isArray(eventsBody.events) ? eventsBody.events.length : 0).toBeGreaterThan(0);

        await page.getByRole("button", { name: /Replay session/i }).click();
        await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
          timeout: 60_000,
        });

        await context.close();
      }
    );
  }
);

// ---------------------------------------------------------------------------
// 2. Gate Cancel and delete
// ---------------------------------------------------------------------------

test.describe(
  "Cancel and delete from resume gate",
  { tag: [TAG.WB_CHROME] },
  () => {
    test("gate shows → Cancel and delete → confirm → session deleted", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const { studentId, whiteboardSessionId } = await seedStaleSession();

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForLoadState("networkidle");

      const gateDialog = page.getByTestId("wb-resume-gate");
      await expect(gateDialog).toBeVisible({ timeout: 30_000 });

      const deleteBtn = page.getByTestId("wb-resume-gate-cancel-delete");
      await deleteBtn.click();

      const confirmDialog = page.getByTestId("wb-resume-gate-cancel-delete-confirm");
      await expect(confirmDialog).toBeVisible({ timeout: 8_000 });
      await page.getByTestId("wb-resume-gate-cancel-delete-confirm-yes").click();

      await page.waitForURL(`**/admin/students/${studentId}`, { timeout: 20_000 });

      const prisma = new PrismaClient();
      try {
        const gone = await prisma.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
        });
        expect(gone).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    });
  }
);

// ---------------------------------------------------------------------------
// 3. Gate Resume
// ---------------------------------------------------------------------------

test.describe(
  "Resume from gate — live board mounts, session stays open",
  { tag: [TAG.WB_CHROME] },
  () => {
    test("gate shows → Resume → live canvas, endedAt null", async ({ page }) => {
      test.setTimeout(120_000);

      const { studentId, whiteboardSessionId } = await seedStaleSession();

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("wb-resume-gate")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("wb-resume-gate-resume").click();

      await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await expect(page.getByTestId("wb-session-review-mode")).not.toBeVisible();

      const prisma = new PrismaClient();
      try {
        const session = await prisma.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
          select: { endedAt: true },
        });
        expect(session?.endedAt).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    });
  }
);
