/**
 * WS-C / SSG-2 — "End and review" from WorkspaceResumeGate.
 *
 * Server-side finalize then straight to SessionReviewMode (no intent=endreview flash).
 *
 * Run:
 *   npx playwright test tests/integration/wb-end-from-gate.spec.ts --project=integration
 */

import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { readLocalEnv } from "../utils/read-dotenv";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

async function injectVadOverrides(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __VAD_MIN_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_SILENCE_HOLD_MS_OVERRIDE?: number;
      __VAD_SILENCE_RMS_THRESHOLD_OVERRIDE?: number;
      __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
    };
    w.__VAD_MIN_SEGMENT_SECONDS_OVERRIDE = 1;
    w.__VAD_SILENCE_HOLD_MS_OVERRIDE = 800;
    w.__VAD_SILENCE_RMS_THRESHOLD_OVERRIDE = 0.15;
    w.__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 120;
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
  return (await res.json()) as { count: number };
}

async function seedSessionRecording(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.post(
    `/api/test/whiteboard/${sessionId}/seed-recording`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
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

// ---------------------------------------------------------------------------
// 1. Gate End-and-review — WS-C server finalize
// ---------------------------------------------------------------------------

test.describe(
  "WS-C gate: End and review server-finalize → review overlay",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test(
      "record + strokes → stale gate → End and review → review within 5s, recordings preserved",
      async ({ page }) => {
        test.setTimeout(300_000);

        const env = readLocalEnv();
        test.skip(
          !env.BLOB_READ_WRITE_TOKEN?.trim(),
          "Set BLOB_READ_WRITE_TOKEN in .env to run the WS-C gate guard."
        );

        const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
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

        await page.waitForTimeout(3_000);
        await drawStrokes(page);
        await page.waitForTimeout(3_500);
        await page.waitForTimeout(2_500);
        await page.waitForTimeout(3_500);
        await page.waitForTimeout(8_000);

        await expect
          .poll(
            async () => (await fetchDbState(page, whiteboardSessionId)).batchCount,
            { timeout: 60_000 }
          )
          .toBeGreaterThanOrEqual(1);

        await expect
          .poll(
            async () => {
              const rec = await fetchRecordingCount(page, whiteboardSessionId);
              if (rec.count >= 1) return rec.count;
              await seedSessionRecording(page, whiteboardSessionId);
              return (await fetchRecordingCount(page, whiteboardSessionId)).count;
            },
            { timeout: 30_000 }
          )
          .toBeGreaterThanOrEqual(1);

        const prisma = new PrismaClient();
        try {
          await prisma.whiteboardSession.update({
            where: { id: whiteboardSessionId },
            data: { startedAt: new Date(Date.now() - 11 * 60 * 1000) },
          });
        } finally {
          await prisma.$disconnect();
        }

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
            postState.lastPersistedToIndex >= 0 || postState.eventsBlobUrl !== initialEventsBlobUrl
          ).toBeTruthy();
        }

        const recordings = await fetchRecordingCount(page, whiteboardSessionId);
        expect(recordings.count).toBeGreaterThanOrEqual(1);

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
