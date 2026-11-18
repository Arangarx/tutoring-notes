/**
 * Guards: a leftover audio draft is not uploaded when this reopen must not record.
 *
 * (a) Audio policy is none (in person, audio not allowed). Opening the workspace sends no
 *     upload and creates no SessionRecording row.
 * (b) The session has already ended. Opening it lands on review, with no upload and no row.
 *
 * Oracle: requests to `/api/upload/blob`, and `SessionRecording` count. The draft is planted
 * in IndexedDB with an ancient checkpoint, so a freshness skip cannot hide a scan that ran.
 *
 * These paths already refuse before enqueue (policy none returns early; an ended session
 * mounts review, not the live workspace). The tests are guards.
 *
 * Run:
 *   npx playwright test tests/integration/wb-recording-draft-recovery-guards.spec.ts --project=wb-regression --workers=1
 */

import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "./fixtures";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";
import { TUTOR_MIC, fetchRecordingCount } from "../helpers/recording-draft-kill";

async function plantStaleDraft(page: Page, sessionId: string) {
  await page.evaluate(
    async ({ sessionId: id, streamId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("tutoring-notes-recording-draft", 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains("drafts")) {
            req.result.createObjectStore("drafts", { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("drafts", "readwrite");
        tx.objectStore("drafts").put({
          key: `${id}:${streamId}`,
          sessionId: id,
          streamId,
          segmentId: "seg-guard",
          mimeType: "audio/webm",
          chunks: [new Blob(["draft-bytes"], { type: "audio/webm" })],
          chunkCount: 1,
          firstChunkMs: 1,
          lastChunkMs: 1,
          checkpointedAt: 1,
          estimatedDurationSec: 5,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { sessionId, streamId: TUTOR_MIC }
  );
}

function watchUploads(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/upload/blob")) urls.push(req.url());
  });
  return urls;
}

test.describe(
  "a leftover audio draft is not uploaded when recording is off",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("audio policy none: reopen does not upload and creates no SessionRecording", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession({
        sessionMode: "IN_PERSON",
      });
      const prisma = new PrismaClient();
      try {
        await prisma.sessionConsentSnapshot.update({
          where: { whiteboardSessionId },
          data: { allowAudioRecording: false },
        });

        await page.goto("/login", { waitUntil: "domcontentloaded" });
        await plantStaleDraft(page, whiteboardSessionId);
        const uploads = watchUploads(page);

        await page.goto(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(page.getByTestId("wb-audio-consent-banner")).toContainText("Audio not recorded", {
          timeout: 90_000,
        });

        // Stay at zero across the window a mount scan would have uploaded in.
        const noneDeadline = Date.now() + 12_000;
        while (Date.now() < noneDeadline) {
          const count =
            (await fetchRecordingCount(page, whiteboardSessionId)).byStream[TUTOR_MIC] ?? 0;
          expect(count, "a SessionRecording appeared with audio policy none").toBe(0);
          await page.waitForTimeout(1_500);
        }
        expect(uploads, "an upload started even though audio policy is none").toEqual([]);
      } finally {
        await prisma.$disconnect();
      }
    });

    test("ended session: reopen goes to review, with no upload and no SessionRecording", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const prisma = new PrismaClient();
      try {
        await prisma.whiteboardSession.update({
          where: { id: whiteboardSessionId },
          data: { endedAt: new Date() },
        });

        await page.goto("/login", { waitUntil: "domcontentloaded" });
        await plantStaleDraft(page, whiteboardSessionId);
        const uploads = watchUploads(page);

        await page.goto(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 90_000 });

        const endedDeadline = Date.now() + 12_000;
        while (Date.now() < endedDeadline) {
          const count =
            (await fetchRecordingCount(page, whiteboardSessionId)).byStream[TUTOR_MIC] ?? 0;
          expect(count, "a SessionRecording appeared for an ended session").toBe(0);
          await page.waitForTimeout(1_500);
        }
        expect(uploads, "an upload started for an ended session").toEqual([]);
      } finally {
        await prisma.$disconnect();
      }
    });
  }
);
