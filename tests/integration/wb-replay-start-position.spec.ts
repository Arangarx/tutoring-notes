/**
 * SMOKE-UX-1 / launch plan A4 — opening an ended session's review must start
 * replay audio at position 0, never at (or jumping to) the END of the recording.
 *
 * Spec (user-observable, not derived from the hook):
 *   - After the tutor taps "Replay session", audio playback BEGINS (a real
 *     `playing` event on the <audio> element) with currentTime < 1.0 s.
 *   - It then ADVANCES in real time from there (it is not parked or ended).
 *   - Same on RE-OPEN (hide replay → Replay session again).
 *   - Same for a multi-segment payload and for the single concat master.
 *
 * Oracle: the audio element's own currentTime / paused / ended, observed by a
 * page-level tracer (events + currentTime setter + play()) that is installed
 * before the app loads and knows nothing about the controller's state. The
 * recording is ~10 s so "near the end" is clearly distinguishable from "start".
 *
 * Run:
 *   npx playwright test tests/integration/wb-replay-start-position.spec.ts --project=wb-regression --workers=1
 */

import { test, expect } from "./fixtures";
import type { Page, TestInfo } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { recordEndEnterReplay } from "./wb-replay-record.helpers";
import { TAG } from "../test-tags";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

/** Playback must begin this close to the start. */
const START_MAX_SEC = 1.0;
/** The recording must be long enough that "near the end" is distinguishable from "start". */
const MIN_RECORDING_SEC = 5;
/** Real-time advance window after playback begins. */
const ADVANCE_WAIT_MS = 2_000;

type TraceRow = {
  t: number;
  ev: string;
  ct: number | string;
  dur: number | string;
  paused: boolean;
  seeking: boolean;
  rs: number;
  extra?: string;
};

/** Installs the independent audio tracer. Call before the first navigation. */
async function installReplayAudioTrace(page: Page) {
  await page.addInitScript(() => {
    const rows: TraceRow[] = [];
    const t0 = performance.now();
    const w = window as unknown as {
      __replayAudioTrace: TraceRow[];
      __replayTraceNow: () => number;
    };
    w.__replayAudioTrace = rows;
    w.__replayTraceNow = () => Math.round(performance.now() - t0);

    type TraceRow = {
      t: number;
      ev: string;
      ct: number | string;
      dur: number | string;
      paused: boolean;
      seeking: boolean;
      rs: number;
      extra?: string;
    };
    const num = (n: number) => (Number.isFinite(n) ? n : String(n));
    const isReplayAudio = (n: unknown): n is HTMLAudioElement =>
      n instanceof HTMLAudioElement &&
      n.getAttribute("data-testid") === "wb-replay-audio";
    const snap = (el: HTMLAudioElement, ev: string, extra?: string) => {
      rows.push({
        t: Math.round(performance.now() - t0),
        ev,
        ct: num(el.currentTime),
        dur: num(el.duration),
        paused: el.paused,
        seeking: el.seeking,
        rs: el.readyState,
        extra,
      });
    };

    const ctDesc = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "currentTime"
    )!;
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      configurable: true,
      enumerable: ctDesc.enumerable,
      get() {
        return ctDesc.get!.call(this);
      },
      set(v: number) {
        if (isReplayAudio(this)) snap(this, "SET_currentTime", String(v));
        ctDesc.set!.call(this, v);
      },
    });
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (isReplayAudio(this)) {
        // Headless autoplay policy: muting changes loudness only, never position.
        this.muted = true;
        snap(this, "CALL_play");
      }
      return origPlay.call(this);
    };
    const origPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      if (isReplayAudio(this)) snap(this, "CALL_pause");
      return origPause.call(this);
    };

    for (const ev of [
      "loadstart",
      "emptied",
      "loadedmetadata",
      "durationchange",
      "seeking",
      "seeked",
      "play",
      "playing",
      "pause",
      "ended",
      "error",
    ]) {
      document.addEventListener(
        ev,
        (e) => {
          if (isReplayAudio(e.target)) snap(e.target, ev);
        },
        true
      );
    }
    setInterval(() => {
      const el = document.querySelector('[data-testid="wb-replay-audio"]');
      if (isReplayAudio(el)) snap(el, "sample");
    }, 100);
  });
}

async function traceNow(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as unknown as { __replayTraceNow: () => number }).__replayTraceNow()
  );
}

async function readTrace(page: Page): Promise<TraceRow[]> {
  return page.evaluate(
    () => (window as unknown as { __replayAudioTrace: TraceRow[] }).__replayAudioTrace.slice()
  );
}

async function attachTrace(page: Page, testInfo: TestInfo, label: string) {
  const rows = await readTrace(page);
  const lines = rows
    .filter((r) => r.ev !== "sample")
    .map(
      (r) =>
        `${String(r.t).padStart(7)}ms ${r.ev.padEnd(16)} ct=${r.ct} dur=${r.dur} paused=${r.paused} seeking=${r.seeking} rs=${r.rs}${r.extra ? ` ${r.extra}` : ""}`
    );
  await testInfo.attach(`audio-trace-${label}.txt`, {
    body: lines.join("\n"),
    contentType: "text/plain",
  });
  console.log(`--- audio trace (${label}) ---\n${lines.join("\n")}`);
}

/**
 * One "tutor taps Replay session" interaction. Asserts the spec:
 * playback begins < START_MAX_SEC, never from elsewhere, then advances.
 */
async function openReplayAndAssertStartsAtZero(
  page: Page,
  testInfo: TestInfo,
  label: string
) {
  const tClick = await traceNow(page);
  await page.getByTestId("wb-review-enter-replay").click();
  await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({ timeout: 30_000 });

  // A real `playing` event after the click (playback actually began).
  let playingRow: TraceRow | undefined;
  await expect
    .poll(
      async () => {
        const rows = await readTrace(page);
        playingRow = rows.find((r) => r.ev === "playing" && r.t >= tClick);
        return playingRow !== undefined;
      },
      { timeout: 60_000, intervals: [100, 250, 500] }
    )
    .toBe(true);

  await page.waitForTimeout(ADVANCE_WAIT_MS);
  await attachTrace(page, testInfo, label);

  const rows = await readTrace(page);
  const after = rows.filter((r) => r.t >= tClick);
  const toNum = (v: number | string) => (typeof v === "number" ? v : NaN);

  const dur = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="wb-replay-audio"]') as HTMLAudioElement;
    return el.duration;
  });
  expect(
    dur,
    `${label}: recording must be several seconds so start vs end is distinguishable (duration=${dur})`
  ).toBeGreaterThan(MIN_RECORDING_SEC);

  // 1. Playback began near 0 — and no play/playing ever began from elsewhere.
  const starts = after.filter((r) => r.ev === "playing" || r.ev === "play");
  for (const s of starts) {
    expect(
      toNum(s.ct),
      `${label}: '${s.ev}' began at currentTime=${s.ct} (must be < ${START_MAX_SEC}s; duration=${dur})`
    ).toBeLessThan(START_MAX_SEC);
  }

  // 2. Never ended on its own just after opening.
  expect(
    after.filter((r) => r.ev === "ended").length,
    `${label}: audio fired 'ended' right after opening replay (parked at end)`
  ).toBe(0);

  // 3. Advances in real time from the start (not frozen, not parked).
  const first = toNum(playingRow!.ct);
  const last = after[after.length - 1]!;
  expect(last.paused, `${label}: audio is paused after ${ADVANCE_WAIT_MS}ms (should be playing)`).toBe(false);
  const lastCt = toNum(last.ct);
  expect(
    lastCt,
    `${label}: currentTime must advance (began ${first}, now ${lastCt})`
  ).toBeGreaterThan(first + 0.8);
  expect(
    lastCt,
    `${label}: currentTime jumped ahead of real time (began ${first}, now ${lastCt})`
  ).toBeLessThan(first + ADVANCE_WAIT_MS / 1000 + 3);
}

async function hideReplay(page: Page) {
  await page.getByTestId("wb-replay-hide").click();
  await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({ timeout: 10_000 });
}

async function replayAudioSrcKind(page: Page): Promise<"concat" | "segments" | "none"> {
  const src = await page.evaluate(
    () => document.querySelector('[data-testid="wb-replay-audio"]')?.getAttribute("src") ?? ""
  );
  if (src.includes("/concat-audio")) return "concat";
  if (src.includes("/api/audio/")) return "segments";
  return "none";
}

async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Wait for the post-End ffmpeg concat to persist; returns its URL. */
async function waitForConcatPersisted(sessionId: string): Promise<string> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const row = await withPrisma((p) =>
      p.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { concatBlobUrl: true },
      })
    );
    if (row?.concatBlobUrl) return row.concatBlobUrl;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`concat master for ${sessionId} never persisted`);
}

/** Reload the ended session so the review payload is rebuilt from the DB. */
async function reloadIntoReview(page: Page, studentId: string, sessionId: string) {
  await page.goto(`/admin/students/${studentId}/whiteboard/${sessionId}/workspace`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({ timeout: 60_000 });
}

test.describe(
  "replay auto-start position (SMOKE-UX-1)",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("right after End: first open and re-open start at ~0 and advance (several-second recording)", async ({
      page,
    }, testInfo) => {
      test.setTimeout(300_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await installReplayAudioTrace(page);
      await recordEndEnterReplay(page, studentId, whiteboardSessionId, { soloMs: 10_000 });

      await openReplayAndAssertStartsAtZero(page, testInfo, "after-end first open");
      testInfo.annotations.push({
        type: "payload",
        description: await replayAudioSrcKind(page),
      });
      await hideReplay(page);
      await openReplayAndAssertStartsAtZero(page, testInfo, "after-end re-open");
    });

    test("multi-segment payload (no concat master): first open and re-open start at ~0 and advance", async ({
      page,
    }, testInfo) => {
      test.setTimeout(360_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await installReplayAudioTrace(page);
      await recordEndEnterReplay(page, studentId, whiteboardSessionId, {
        multiSegment: true,
      });

      // Let the real concat finish, then drop it so review builds the per-segment payload.
      await waitForConcatPersisted(whiteboardSessionId);
      const segmentCount = await withPrisma(async (p) => {
        await p.whiteboardSession.update({
          where: { id: whiteboardSessionId },
          data: { concatBlobUrl: null, concatDurationSeconds: null },
        });
        return p.sessionRecording.count({ where: { whiteboardSessionId } });
      });
      expect(segmentCount, "VAD harness should produce several segments").toBeGreaterThanOrEqual(2);

      await reloadIntoReview(page, studentId, whiteboardSessionId);
      await openReplayAndAssertStartsAtZero(page, testInfo, "segments first open");
      expect(await replayAudioSrcKind(page)).toBe("segments");
      await hideReplay(page);
      await openReplayAndAssertStartsAtZero(page, testInfo, "segments re-open");
    });

    test("concat master payload: first open and re-open start at ~0 and advance", async ({
      page,
    }, testInfo) => {
      test.setTimeout(360_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await installReplayAudioTrace(page);
      await recordEndEnterReplay(page, studentId, whiteboardSessionId, { soloMs: 10_000 });

      await waitForConcatPersisted(whiteboardSessionId);
      await reloadIntoReview(page, studentId, whiteboardSessionId);
      await openReplayAndAssertStartsAtZero(page, testInfo, "concat first open");
      expect(await replayAudioSrcKind(page)).toBe("concat");
      await hideReplay(page);
      await openReplayAndAssertStartsAtZero(page, testInfo, "concat re-open");
    });
  }
);
