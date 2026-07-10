/**
 * WS-B — live whiteboard tab-kill persist (SF-6).
 *
 * 1. Start ACTIVE session; draw 5 strokes over ~3s.
 * 2. context.close() — simulates tab kill (not window.stop()).
 * 3–4. Resume scene assertions depend on WS-D — fixme until hydrate lands.
 * 5. Assert WhiteboardEventBatch count ≥ 1 via test db-state helper.
 *
 * Run:
 *   npx playwright test tests/integration/wb-live-persist-tab-kill.spec.ts --project=integration
 */

import { test, expect } from "./fixtures";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

async function drawStrokes(
  page: import("@playwright/test").Page,
  count: number
) {
  await page.waitForTimeout(1_500);
  const canvas = page
    .locator('[data-testid="tutor-whiteboard-canvas-mount"] canvas')
    .first();
  await canvas.waitFor({ state: "visible", timeout: 60_000 });
  await page.keyboard.press("r");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Excalidraw canvas has no bounding box");
  for (let i = 0; i < count; i++) {
    await page.mouse.move(box.x + 80 + i * 60, box.y + 90);
    await page.mouse.down();
    await page.mouse.move(box.x + 140 + i * 60, box.y + 150);
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
}

async function fetchDbState(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/db-state`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as {
    batchCount: number;
    lastPersistedBatchSeq: number;
    lastPersistedToIndex: number;
    latestToEventIndex: number | null;
  };
}

test.describe("WS-B live persist — tab kill", { tag: [TAG.WB_RECORDING] }, () => {
  test("draw strokes → context.close → db-state shows event batches persisted", async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    await drawStrokes(page, 5);

    // Allow ~1s persist sidecar to flush at least one batch (poll — fixed sleep is flaky on slow CI).
    await expect
      .poll(
        async () => {
          const state = await fetchDbState(page, whiteboardSessionId);
          return state.batchCount;
        },
        { timeout: 60_000 }
      )
      .toBeGreaterThanOrEqual(1);

    const preKill = await fetchDbState(page, whiteboardSessionId);
    await context.close();

    const rosterContext = await browser.newContext();
    const rosterPage = await rosterContext.newPage();
    await rosterPage.goto(`/admin/students/${studentId}`, {
      waitUntil: "domcontentloaded",
    });

    const postKill = await fetchDbState(rosterPage, whiteboardSessionId);
    expect(postKill.batchCount).toBeGreaterThanOrEqual(1);
    expect(postKill.lastPersistedToIndex).toBeGreaterThanOrEqual(0);
    if (preKill.batchCount > 0) {
      expect(postKill.batchCount).toBeGreaterThanOrEqual(preKill.batchCount);
    }

    await rosterContext.close();
  });

  test.fixme(
    "WS-D: resume workspace after tab kill restores ≥5 stroke elements",
    async ({ browser }) => {
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`
      );
      await drawStrokes(page, 5);
      await page.waitForTimeout(2_500);
      await context.close();

      const resumeContext = await browser.newContext();
      const resumePage = await resumeContext.newPage();
      await resumePage.goto(`/admin/students/${studentId}`);
      // WS-D: click Resume on roster and assert recovered scene element count.
      void whiteboardSessionId;
      await resumeContext.close();
    }
  );
});
