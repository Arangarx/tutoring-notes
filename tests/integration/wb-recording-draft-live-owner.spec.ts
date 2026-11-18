/**
 * A second tab must not recover a draft that a live recorder still owns.
 *
 * Spec: tab A is recording. Tab B opens the same workspace. Tab A's draft stays (same segment id),
 * and no SessionRecording row appears — the mount scan must not enqueue the partial and clear it.
 * The live recorder holds a Web Lock for that segment; tab death is what releases it.
 *
 * Oracle: `SessionRecording` count (`/api/test/whiteboard/:id/recording-count`) plus the draft row's
 * segment id still present in IndexedDB. Tab B's microphone is never granted, so tab B cannot
 * start its own recorder and overwrite the row; the only thing that could clear it is the scan.
 *
 * Red-before: the scan enqueues whatever draft it finds, including this live one.
 *
 * Run:
 *   npx playwright test tests/integration/wb-recording-draft-live-owner.spec.ts --project=wb-regression --workers=1
 */

import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";
import {
  TUTOR_MIC,
  fetchRecordingCount,
  hookMediaRecorderStarts,
  openWorkspaceAndStartRecording,
} from "../helpers/recording-draft-kill";

async function readDraftIdentity(
  page: Page,
  wbsid: string
): Promise<{ found: boolean; segmentId: string | null; chunkCount: number }> {
  return page.evaluate(
    async ({ wbsid: id, streamId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("tutoring-notes-recording-draft");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!db.objectStoreNames.contains("drafts")) {
        db.close();
        return { found: false, segmentId: null, chunkCount: 0 };
      }
      const row = await new Promise<{ segmentId?: string; chunkCount?: number } | undefined>(
        (resolve, reject) => {
          const req = db
            .transaction("drafts", "readonly")
            .objectStore("drafts")
            .get(`${id}:${streamId}`);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }
      );
      db.close();
      if (!row?.segmentId) return { found: false, segmentId: null, chunkCount: 0 };
      return { found: true, segmentId: row.segmentId, chunkCount: row.chunkCount ?? 0 };
    },
    { wbsid, streamId: TUTOR_MIC }
  );
}

test.describe(
  "a live recording's draft is not recovered by another tab",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("tab B opening the same session does not clear tab A's draft or create a SessionRecording", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const tabA = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      let segmentId: string | null = null;
      await expect
        .poll(
          async () => {
            const draft = await readDraftIdentity(tabA, whiteboardSessionId);
            segmentId = draft.segmentId;
            return draft.found && draft.chunkCount > 0;
          },
          { timeout: 30_000, intervals: [500] }
        )
        .toBe(true);
      expect(segmentId).toEqual(expect.any(String));

      // Nothing has stopped, so the server has no audio yet.
      expect(
        (await fetchRecordingCount(tabA, whiteboardSessionId)).byStream[TUTOR_MIC] ?? 0
      ).toBe(0);

      const tabB = await context.newPage();
      await tabB.addInitScript(() => {
        const md = navigator.mediaDevices;
        if (!md) return;
        // Never start tab B's own recorder. The scan still runs on mount.
        md.getUserMedia = () => new Promise(() => {});
      });
      await tabB.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tabB.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      // Long enough that a scan which enqueued the live draft would have cleared it and, once
      // the outbox uploaded, created a SessionRecording row.
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const count =
          (await fetchRecordingCount(tabB, whiteboardSessionId)).byStream[TUTOR_MIC] ?? 0;
        const draft = await readDraftIdentity(tabA, whiteboardSessionId);
        expect(count, "live draft was enqueued as a SessionRecording").toBe(0);
        expect(draft.found, "live draft was cleared").toBe(true);
        expect(draft.segmentId).toBe(segmentId);
        await tabB.waitForTimeout(2_000);
      }

      await context.close();
    });
  }
);
