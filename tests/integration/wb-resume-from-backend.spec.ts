/**
 * WS-D — ACTIVE session resume hydrates from backend (no IDB prompt).
 *
 * 1. ACTIVE session; draw on p1 + p2; wait for server persist batches.
 * 2. Navigate away; re-open via Resume on gate.
 * 3. Assert no "Browser recovery (IndexedDB)" banner.
 * 4. Assert p2 elements visible after tab switch without IDB accept.
 * 5. Continue drawing; End; assert strokes in replay events.
 *
 * Run:
 *   npx playwright test tests/integration/wb-resume-from-backend.spec.ts --project=integration --workers=1
 */

import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import {
  clickBoardPageTab,
  drawTestStrokeOnRole,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

async function fetchDbState(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/db-state`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { batchCount: number };
}

async function makeSessionStale(whiteboardSessionId: string) {
  const prisma = new PrismaClient();
  try {
    const staleAt = new Date(Date.now() - 11 * 60 * 1000);
    await prisma.whiteboardSession.update({
      where: { id: whiteboardSessionId },
      data: {
        startedAt: staleAt,
        lastActiveAt: staleAt,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("WS-D resume from backend", { tag: [TAG.WB_RECORDING] }, () => {
  test("draw p1+p2 → leave → gate Resume → no IDB banner → p2 isolated → end replay", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(page, "tutor");

    const page1Stroke = `wsd-p1-${Date.now()}`;
    await drawTestStrokeOnRole(page, "tutor", page1Stroke, 50, 50, 150, 150);

    await page
      .getByTestId("wb-tutor-page-strip")
      .getByRole("button", { name: "Add board" })
      .click();
    await expect(
      page
        .getByTestId("wb-tutor-page-strip")
        .getByRole("tab", { name: "Board 2", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    const page2Stroke = `wsd-p2-${Date.now()}`;
    await drawTestStrokeOnRole(page, "tutor", page2Stroke, 200, 200, 320, 320);

    await expect
      .poll(
        async () => (await fetchDbState(page, whiteboardSessionId)).batchCount,
        { timeout: 60_000 }
      )
      .toBeGreaterThanOrEqual(1);

    await page.goto(`/admin/students/${studentId}`, {
      waitUntil: "domcontentloaded",
    });

    await makeSessionStale(whiteboardSessionId);

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await page.waitForLoadState("networkidle");

    const gate = page.getByTestId("wb-resume-gate");
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("wb-resume-gate-resume").click();
    await expect(gate).not.toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(page, "tutor");

    await expect(page.getByText("Browser recovery (IndexedDB)")).toHaveCount(0, {
      timeout: 5_000,
    });

    await clickBoardPageTab(page, "tutor", "Board 2");
    await expect
      .poll(
        async () => {
          const ids = await readSceneElementIds(page, "tutor");
          return ids.includes(page2Stroke);
        },
        { timeout: 30_000 }
      )
      .toBe(true);

    const postResumeP2 = await readSceneElementIds(page, "tutor");
    expect(postResumeP2).toContain(page2Stroke);
    expect(postResumeP2).not.toContain(page1Stroke);

    const postResumeStroke = `wsd-post-${Date.now()}`;
    await drawTestStrokeOnRole(
      page,
      "tutor",
      postResumeStroke,
      220,
      220,
      340,
      340
    );
    await page.waitForTimeout(2_000);

    await page.getByTestId("wb-end-session").click();
    const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
    if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
      timeout: 120_000,
    });

    const eventsRes = await page.request.get(
      `/api/whiteboard/${whiteboardSessionId}/events`
    );
    expect(eventsRes.ok(), await eventsRes.text()).toBeTruthy();
    const eventsBody = (await eventsRes.json()) as { events?: unknown[] };
    const eventsJson = JSON.stringify(eventsBody.events ?? []);
    expect(eventsJson).toContain(page1Stroke);
    expect(eventsJson).toContain(page2Stroke);
    expect(eventsJson).toContain(postResumeStroke);
  });
});
