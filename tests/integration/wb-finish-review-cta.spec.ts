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
import { PrismaClient } from "@prisma/client";

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

async function seedEndedNote(note: {
  status: string;
  content: string | null;
  error?: string | null;
}) {
  const session = await seedWbLiveSyncSession();
  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.update({
      where: { id: session.whiteboardSessionId },
      data: { endedAt: new Date() },
    });
    await prisma.tutorNote.create({
      data: {
        sessionId: session.whiteboardSessionId,
        status: note.status,
        content: note.content,
        error: note.error ?? null,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  return session;
}

async function expectFinishReviewLeaves(
  page: import("@playwright/test").Page,
  studentId: string
) {
  const finish = page.getByTestId("wb-finish-review");
  await expect(finish).toBeVisible();
  await expect(finish).toHaveText("Finish review");
  await finish.click();
  await page.waitForURL(`**/admin/students/${studentId}`, { timeout: 15_000 });
  expect(page.url()).not.toContain("/whiteboard/");
}

test.describe("Finish review when notes did not generate", { tag: [TAG.WB_CHROME] }, () => {
  test("failed generation still offers Finish review", async ({ page }) => {
    test.setTimeout(120_000);
    const { studentId, whiteboardSessionId } = await seedEndedNote({
      status: "failed",
      content: null,
      error: "upstream",
    });
    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId("tutor-notes-error")).toBeVisible({ timeout: 30_000 });
    await expectFinishReviewLeaves(page, studentId);
  });

  test("empty generated notes still offer Finish review", async ({ page }) => {
    test.setTimeout(120_000);
    const { studentId, whiteboardSessionId } = await seedEndedNote({
      status: "done",
      content: null,
    });
    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByText(/content is empty/i)).toBeVisible({ timeout: 30_000 });
    await expectFinishReviewLeaves(page, studentId);
  });

  test("timed-out generation still offers Finish review", async ({ page }) => {
    test.setTimeout(120_000);
    const { studentId, whiteboardSessionId } = await seedEndedNote({
      status: "pending",
      content: null,
    });
    await page.clock.install({ time: new Date("2026-10-06T15:00:00Z") });
    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId("tutor-notes-section")).toBeVisible({ timeout: 30_000 });
    await page.clock.fastForward(5 * 60_000 + 5_000);
    await expect(page.getByText(/taking longer than expected/i)).toBeVisible({
      timeout: 15_000,
    });
    await expectFinishReviewLeaves(page, studentId);
  });
});
