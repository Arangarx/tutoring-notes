/**
 * A4 / WS-N-PAGEHIDE — how much audio survives when the tab dies mid-segment.
 *
 * Spec (user-observable): after the tab dies during a recording, the recovered draft
 * (what the "We recovered N:NN of audio" banner offers) covers the audio up to within a
 * small bound of the moment of the kill. Three real failure modes, each its own test:
 *
 *   1. Hard kill (no JS runs at all — renderer crash / OOM / OS kill).
 *      Property: loss <= one slice + slack.
 *   2. Tab goes hidden (app switch / lock screen), stays alive briefly, then is killed.
 *      Property: loss is bounded by the hidden->kill window + slack — NOT by the slice.
 *   3. Graceful close (navigate away / close tab). The document is torn down before the
 *      encoder can hand over its partial slice, so the accepted property is the same as
 *      (1): loss <= one slice + slack. This test documents that bound.
 *
 * Oracle (independent of app internals):
 *   - Start time of the open segment = wall-clock of the browser's own
 *     `MediaRecorder.prototype.start` call (hooked via addInitScript).
 *   - Kill / hidden times = Node wall-clock (same host clock as the page).
 *   - Recovered audio length = the browser decoding the draft's bytes with
 *     `decodeAudioData` (real sample count, not the row's `estimatedDurationSec`).
 *   - Audio lost = (kill - segment start) - decoded length. Bounds are literals in this file.
 *
 * Hard-kill surrogate: CDP `Page.setWebLifecycleState({state:"frozen"})` stops ALL JS in
 * the page (so no flush can run, exactly like a crash), then `page.close()`, then a NEW
 * page in the SAME context reads IndexedDB (same pattern as
 * wb-tab-kill-audio-durability.spec.ts). `Page.crash` was tried first and takes the whole
 * browser context down, so the draft cannot be read afterwards.
 *
 * Red-before (pre-fix hook, 30s MediaRecorder timeslice): no chunk exists 14-16s into a
 * segment, so every test below finds NO draft at all. The MediaRecorder timeslice is
 * printed in each failure message so a stale bundle cannot masquerade as the pre-fix hook.
 *
 * Run:
 *   npx playwright test tests/integration/wb-recording-draft-durability.spec.ts --project=wb-regression --workers=1
 */

import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TUTOR_MIC = "tutor:mic";

/** One draft slice, the loss unit the spec accepts for a kill that runs no code. */
const SLICE_SEC = 5;
/** Encoder / IDB scheduling + clock slack. Not a coordinate: tolerance on a relation. */
const SLACK_SEC = 2.5;
/** Tab hidden, then killed this long after (page is alive in between). */
const HIDDEN_TO_KILL_MS = 1_500;

type StartRecord = { at: number; audio: boolean; timeslice: number | null };
type HookedPage = { __mrStarts?: StartRecord[] };

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
        timeslice: typeof args[0] === "number" ? args[0] : null,
      });
      return orig.apply(this, args);
    };
  });
}

async function readLastAudioRecorderStart(page: Page): Promise<StartRecord | null> {
  return page.evaluate(() => {
    const starts = (window as unknown as HookedPage).__mrStarts ?? [];
    const audio = starts.filter((s) => s.audio);
    return audio.length ? audio[audio.length - 1] : null;
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
async function waitForOpenSegmentAge(page: Page, ageMs: number): Promise<StartRecord> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const start = await readLastAudioRecorderStart(page);
    if (start !== null && Date.now() - start.at >= ageMs) return start;
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
async function freezeCloseAndReopen(
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

function lossMessage(
  what: string,
  lostSec: number,
  elapsedSec: number,
  draft: { decodedSec: number; chunkCount: number },
  timeslice: number | null
) {
  return `${what}: lost ${lostSec.toFixed(1)}s of ${elapsedSec.toFixed(1)}s (decoded ${draft.decodedSec.toFixed(1)}s, chunks=${draft.chunkCount}, MediaRecorder timeslice=${timeslice}ms)`;
}

test.describe(
  "A4 WS-N-PAGEHIDE recording draft survives a mid-segment tab death",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("hard kill (frozen then closed) 16s into a segment loses at most one slice plus slack", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const page = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      const segment = await waitForOpenSegmentAge(page, 16_000);
      const { killedAt, reader } = await freezeCloseAndReopen(context, page);
      const draft = await decodeDraftSeconds(reader, whiteboardSessionId);

      const elapsedSec = (killedAt - segment.at) / 1000;
      expect(
        draft.found,
        `no recoverable draft ${elapsedSec.toFixed(1)}s into the segment (MediaRecorder timeslice=${segment.timeslice}ms)`
      ).toBe(true);
      const lostSec = elapsedSec - draft.decodedSec;
      expect(
        lostSec,
        lossMessage("hard kill", lostSec, elapsedSec, draft, segment.timeslice)
      ).toBeLessThanOrEqual(SLICE_SEC + SLACK_SEC);

      await context.close();
    });

    test("tab hidden then killed: loss is bounded by the hidden-to-kill window, not by the slice", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const page = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      // ~4s past a slice boundary: a timeslice-only draft is ~4s behind at this moment.
      const segment = await waitForOpenSegmentAge(page, 14_000);

      // App switch / lock screen: the page goes hidden but stays alive for a moment.
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const hiddenAt = Date.now();
      await page.waitForTimeout(HIDDEN_TO_KILL_MS); // the requested partial slice lands here

      const { killedAt, reader } = await freezeCloseAndReopen(context, page);
      const draft = await decodeDraftSeconds(reader, whiteboardSessionId);

      const elapsedSec = (killedAt - segment.at) / 1000;
      const hiddenToKillSec = (killedAt - hiddenAt) / 1000;
      expect(
        draft.found,
        `no recoverable draft ${elapsedSec.toFixed(1)}s into the segment (MediaRecorder timeslice=${segment.timeslice}ms)`
      ).toBe(true);
      const lostSec = elapsedSec - draft.decodedSec;
      // Property: only what happened after the tab went hidden can be lost.
      expect(
        lostSec,
        lossMessage(
          `hidden ${hiddenToKillSec.toFixed(1)}s before kill`,
          lostSec,
          elapsedSec,
          draft,
          segment.timeslice
        )
      ).toBeLessThanOrEqual(hiddenToKillSec + SLACK_SEC - 1);

      await context.close();
    });

    test("graceful close (navigate away) 14s into a segment loses at most one slice plus slack", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const context = await browser.newContext();
      await hookMediaRecorderStarts(context);

      const page = await openWorkspaceAndStartRecording(context, studentId, whiteboardSessionId);
      const segment = await waitForOpenSegmentAge(page, 14_000);
      const killedAt = Date.now();
      // Leave the workspace: pagehide + visibilitychange fire, and the workspace does not
      // re-mount (so no new recording overwrites the draft row). The partial slice cannot
      // be flushed in time, so the accepted bound is one slice (this documents it).
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      const draft = await decodeDraftSeconds(page, whiteboardSessionId);

      const elapsedSec = (killedAt - segment.at) / 1000;
      expect(
        draft.found,
        `no recoverable draft after navigating away (MediaRecorder timeslice=${segment.timeslice}ms)`
      ).toBe(true);
      const lostSec = elapsedSec - draft.decodedSec;
      expect(
        lostSec,
        lossMessage("graceful close", lostSec, elapsedSec, draft, segment.timeslice)
      ).toBeLessThanOrEqual(SLICE_SEC + SLACK_SEC);

      await context.close();
    });
  }
);
