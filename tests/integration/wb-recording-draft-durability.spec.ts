/**
 * A4 / WS-N-PAGEHIDE — how much audio survives when the tab dies mid-segment.
 *
 * Spec (user-observable): after a tab kill, reload or crash during a recording, the
 * recovered draft (what the "We recovered N:NN of audio" banner offers) covers the
 * audio up to within a small bound of the moment of the kill.
 *
 * Oracle (independent of app internals):
 *   - Start time of the open segment = wall-clock of the browser's own
 *     `MediaRecorder.prototype.start` call (hooked via addInitScript).
 *   - Kill time = Node wall-clock (same host clock as the page).
 *   - Recovered audio length = the browser decoding the draft's bytes with
 *     `decodeAudioData` (real sample count, not the row's `estimatedDurationSec`).
 *   - Audio lost = (kill − segment start) − decoded length. Bound is a literal in this file.
 *
 * Red-before (pre-fix, 30s MediaRecorder timeslice): no chunk has been delivered 15s
 * into a segment, so the crash leaves NO draft at all.
 *
 * Run:
 *   npx playwright test tests/integration/wb-recording-draft-durability.spec.ts --project=wb-regression --workers=1
 */

import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TUTOR_MIC = "tutor:mic";

/**
 * Worst audio we accept losing to a HARD kill (no JS runs): one 5s timeslice plus
 * encoder/IDB scheduling slack. Spec number, not read from the implementation.
 */
const MAX_LOSS_AFTER_CRASH_SEC = 7.5;

/**
 * Worst audio we accept losing to a graceful close (pagehide / navigate-away): the
 * flush path must beat the timeslice bound. Kill is placed ~4s past a slice boundary,
 * so a timeslice-only implementation loses ~4s and fails this.
 */
const MAX_LOSS_AFTER_PAGEHIDE_SEC = 2.5;

type HookedPage = {
  __mrStarts?: { at: number; audio: boolean }[];
};

/** Record every MediaRecorder.start() wall-clock so the test knows when the open segment began. */
async function hookMediaRecorderStarts(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as HookedPage & { MediaRecorder?: typeof MediaRecorder };
    w.__mrStarts = [];
    const Proto = w.MediaRecorder?.prototype;
    if (!Proto) return;
    const orig = Proto.start;
    Proto.start = function (this: MediaRecorder, ...args: [number?]) {
      w.__mrStarts!.push({
        at: Date.now(),
        audio: this.stream.getAudioTracks().length > 0,
      });
      return orig.apply(this, args);
    };
  });
}

async function readLastAudioRecorderStart(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const starts = (window as unknown as HookedPage).__mrStarts ?? [];
    const audio = starts.filter((s) => s.audio);
    return audio.length ? audio[audio.length - 1].at : null;
  });
}

/** Read the draft row from IDB on a page that has NOT mounted the workspace (no new draft). */
async function decodeDraftSeconds(
  page: Page,
  wbsid: string
): Promise<{ found: boolean; decodedSec: number; chunkCount: number }> {
  return page.evaluate(
    async ({ wbsid: id, streamId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("tutoring-notes-recording-draft");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!db.objectStoreNames.contains("drafts")) {
        db.close();
        return { found: false, decodedSec: 0, chunkCount: 0 };
      }
      const row = await new Promise<
        { chunks: Blob[]; mimeType: string; chunkCount: number } | undefined
      >((resolve, reject) => {
        const req = db
          .transaction("drafts", "readonly")
          .objectStore("drafts")
          .get(`${id}:${streamId}`);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (!row || !row.chunks?.length) return { found: false, decodedSec: 0, chunkCount: 0 };
      const bytes = await new Blob(row.chunks, { type: row.mimeType }).arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 48_000);
      const decoded = await ctx.decodeAudioData(bytes);
      return { found: true, decodedSec: decoded.duration, chunkCount: row.chunks.length };
    },
    { wbsid, streamId: TUTOR_MIC }
  );
}

/**
 * Wait until the OPEN audio segment (latest MediaRecorder start) is `ageMs` old. Re-reads the
 * start each poll so a VAD rollover mid-wait just restarts the clock on the new segment.
 */
async function waitForOpenSegmentAge(page: Page, ageMs: number): Promise<number> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const start = await readLastAudioRecorderStart(page);
    if (start !== null && Date.now() - start >= ageMs) return start;
    await page.waitForTimeout(100);
  }
  throw new Error(`open segment never reached age ${ageMs}ms`);
}

async function openWorkspaceAndStartRecording(
  context: BrowserContext,
  studentId: string,
  whiteboardSessionId: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  // Solo recording auto-starts (NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT=1): wait for the
  // browser to have started an audio MediaRecorder.
  await expect
    .poll(() => readLastAudioRecorderStart(page), { timeout: 60_000, intervals: [250] })
    .not.toBeNull();
  return page;
}

test.describe(
  "A4 WS-N-PAGEHIDE recording draft survives a mid-segment tab death",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("renderer crash 16s into a segment leaves a recoverable draft within the loss bound", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const page = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      // Hard kill at segment start + 16s: no pagehide, no JS. Only what is already in IDB survives.
      const segmentStart = await waitForOpenSegmentAge(page, 16_000);
      const cdp = await context.newCDPSession(page);
      const killedAt = Date.now();
      await cdp.send("Page.crash").catch(() => undefined);
      await page.close({ runBeforeUnload: false }).catch(() => undefined);

      const reader = await context.newPage();
      await reader.goto("/login", { waitUntil: "domcontentloaded" });
      const draft = await decodeDraftSeconds(reader, whiteboardSessionId);

      const elapsedSec = (killedAt - segmentStart) / 1000;
      expect(
        draft.found,
        `no recoverable draft ${elapsedSec.toFixed(1)}s into the segment (pre-fix: 30s timeslice delivers nothing yet)`
      ).toBe(true);
      const lostSec = elapsedSec - draft.decodedSec;
      expect(
        lostSec,
        `lost ${lostSec.toFixed(1)}s of ${elapsedSec.toFixed(1)}s (decoded ${draft.decodedSec.toFixed(1)}s, chunks=${draft.chunkCount})`
      ).toBeLessThanOrEqual(MAX_LOSS_AFTER_CRASH_SEC);

      await context.close();
    });

    test("navigating away (pagehide) ~4s past a slice boundary loses less than a slice", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const page = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      // Slice boundaries fall every 5s from the segment start (and 30s pre-fix), so
      // start + 14s is ~4s past the last boundary: timeslice alone loses ~4s.
      const segmentStart = await waitForOpenSegmentAge(page, 14_000);
      const killedAt = Date.now();
      // Leave the workspace: pagehide + visibilitychange fire here, and the workspace
      // does not re-mount (so no new recording overwrites the draft row).
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      const draft = await decodeDraftSeconds(page, whiteboardSessionId);

      const elapsedSec = (killedAt - segmentStart) / 1000;
      expect(draft.found, "no recoverable draft after navigating away").toBe(true);
      const lostSec = elapsedSec - draft.decodedSec;
      expect(
        lostSec,
        `lost ${lostSec.toFixed(1)}s of ${elapsedSec.toFixed(1)}s (decoded ${draft.decodedSec.toFixed(1)}s, chunks=${draft.chunkCount})`
      ).toBeLessThanOrEqual(MAX_LOSS_AFTER_PAGEHIDE_SEC);

      await context.close();
    });
  }
);
