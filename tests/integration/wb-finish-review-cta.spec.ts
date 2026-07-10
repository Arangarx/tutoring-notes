/**
 * Finish review CTA — Save stays on review URL; Finish review navigates to student detail.
 *
 * Run:
 *   npx playwright test tests/integration/wb-finish-review-cta.spec.ts --project=wb-regression
 */

import { test, expect } from "./fixtures";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

async function seedWskWatermarkCurrent(
  page: import("@playwright/test").Page,
  sessionId: string,
  chunkCount = 5
) {
  const res = await page.request.post(
    `/api/test/whiteboard/${sessionId}/seed-wsk-watermark`,
    {
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
      data: { chunkCount, pruneNonHarnessChunks: false },
    }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function sealSessionAndEnqueueNotes(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.post(
    `/api/test/whiteboard/${sessionId}/seal-and-enqueue-notes`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function fetchTutorNoteStatus(
  page: import("@playwright/test").Page,
  sessionId: string
): Promise<string | null> {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/transcript-chunks`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { tutorNoteStatus: string | null };
  return body.tutorNoteStatus;
}

test.describe(
  "Finish review CTA — post-save navigation",
  { tag: [TAG.WB_CHROME, TAG.WB_RECORDING] },
  () => {
    test("Save stays on review URL with chip; Finish review opens student detail", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await seedWskWatermarkCurrent(page, whiteboardSessionId, 5);
      await sealSessionAndEnqueueNotes(page, whiteboardSessionId);

      const reviewUrl = `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`;
      await page.goto(reviewUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 90_000,
      });

      await expect
        .poll(
          async () => (await fetchTutorNoteStatus(page, whiteboardSessionId)) === "done",
          { timeout: 30_000, intervals: [100, 200, 500] }
        )
        .toBe(true);

      await expect(page.getByTestId("tutor-notes-content")).toBeVisible({
        timeout: 30_000,
      });

      const finishReview = page.getByTestId("wb-finish-review");
      await expect(finishReview).toBeVisible();
      await expect(finishReview).toHaveText("Finish review");

      const topicsField = page.locator("#wb-note-topics");
      await topicsField.fill("Finish-review harness topic");

      await page.getByTestId("wb-save-note").click();

      await expect(page.getByTestId("wb-save-note-confirmation")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("wb-review-notes-saved")).toBeVisible();
      expect(page.url()).toContain(`/whiteboard/${whiteboardSessionId}/workspace`);

      await finishReview.click();
      await page.waitForURL(`**/admin/students/${studentId}`, { timeout: 15_000 });
      expect(page.url()).toMatch(
        new RegExp(`/admin/students/${studentId}(?:\\?.*)?$`)
      );
      expect(page.url()).not.toContain("/whiteboard/");
    });
  }
);
