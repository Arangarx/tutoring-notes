/**
 * Shared harness for "the tab dies mid-recording" Playwright specs
 * (`wb-recording-draft-durability`, `wb-recording-draft-recovery`).
 *
 * Oracles here are independent of app internals: the open segment's start is the wall-clock of the
 * browser's own `MediaRecorder.prototype.start` call (hooked via an init script), the kill time is
 * Node wall-clock, and audio length is the browser decoding real bytes with `decodeAudioData`.
 *
 * Hard-kill surrogate: CDP `Page.setWebLifecycleState({state:"frozen"})` stops ALL JS in the page
 * (so no flush can run, exactly like a crash), then `page.close()`. A NEW page in the SAME context
 * is what the tutor "reopens" (same origin IndexedDB). `Page.crash` was tried and takes the whole
 * browser context down, so the draft cannot be read afterwards.
 */

import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const TUTOR_MIC = "tutor:mic";

export type StartRecord = { at: number; audio: boolean; timeslice: number | null };
type HookedPage = { __mrStarts?: StartRecord[] };

/** Record every MediaRecorder.start() wall-clock so the test knows when the open segment began. */
export async function hookMediaRecorderStarts(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as HookedPage & {
      MediaRecorder?: typeof MediaRecorder;
      __VAD_CUT_DISABLED?: boolean;
    };
    // A VAD cut mid-wait would swap the segment under test for a fresh one.
    w.__VAD_CUT_DISABLED = true;
    w.__mrStarts = [];
    const Proto = w.MediaRecorder?.prototype;
    if (!Proto) return;
    const orig = Proto.start;
    Proto.start = function (this: MediaRecorder, ...args: [number?]) {
      w.__mrStarts!.push({
        at: Date.now(),
        audio: this.stream.getAudioTracks().length > 0,
        timeslice: typeof args[0] === "number" ? args[0] : null,
      });
      return orig.apply(this, args);
    };
  });
}

export async function readLastAudioRecorderStart(page: Page): Promise<StartRecord | null> {
  return page.evaluate(() => {
    const starts = (window as unknown as HookedPage).__mrStarts ?? [];
    const audio = starts.filter((s) => s.audio);
    return audio.length ? audio[audio.length - 1] : null;
  });
}

/** Read the draft row from IDB on a page that has NOT mounted the workspace (no new draft). */
export async function decodeDraftSeconds(
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
export async function waitForOpenSegmentAge(page: Page, ageMs: number): Promise<StartRecord> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const start = await readLastAudioRecorderStart(page);
    if (start !== null && Date.now() - start.at >= ageMs) return start;
    await page.waitForTimeout(100);
  }
  throw new Error(`open segment never reached age ${ageMs}ms`);
}

export async function openWorkspaceAndStartRecording(
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
    .poll(async () => (await readLastAudioRecorderStart(page)) !== null, {
      timeout: 60_000,
      intervals: [250],
    })
    .toBe(true);
  return page;
}

/**
 * Hard kill: freeze the page (all JS stops, like a crash — no pagehide/visibility handler
 * can run), close it, and return a fresh page in the same context to read IndexedDB.
 * Returns the wall-clock moment of the freeze.
 */
export async function freezeCloseAndReopen(
  context: BrowserContext,
  page: Page
): Promise<{ killedAt: number; reader: Page }> {
  const cdp = await context.newCDPSession(page);
  const killedAt = Date.now();
  await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
  await page.close({ runBeforeUnload: false });
  const reader = await context.newPage();
  await reader.goto("/login", { waitUntil: "domcontentloaded" });
  return { killedAt, reader };
}
