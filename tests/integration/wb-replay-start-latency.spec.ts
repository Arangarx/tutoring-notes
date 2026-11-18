/**
 * SMOKE-UX-1 over real-world audio delivery — replay of a long WebM that has NO
 * duration header (what Chrome's MediaRecorder writes), served the way production
 * serves it: through a proxy with network latency and Range requests.
 *
 * The local harness serves instantly, so a race between the entry auto-play and
 * Chrome's end-of-file duration scan (the 1e101 hack in webm-duration-fix.ts) can
 * never open. These surrogates widen it:
 *   - a ~60 s WebM with the duration header stripped (ffmpeg `-live 1`);
 *   - every response slowed (first 300-800 ms, later ranges ~200 ms) and cut into
 *     small Range chunks, so Chrome reports interim growing durations while the scan
 *     is in flight;
 *   - a Range-stripped variant (200, no Accept-Ranges / Content-Range).
 *
 * Spec (same as wb-replay-start-position.spec.ts): playback begins near 0, the
 * scrubber starts near 0 and advances with it, nothing parks at the end — on first
 * open and on re-open. Oracle: wb-replay-audio-trace.helpers.ts (the audio
 * element's own events and the scrubber's aria values).
 *
 * Run:
 *   npx playwright test tests/integration/wb-replay-start-latency.spec.ts --project=wb-regression --workers=1
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { seedEndedSessionWithAudioClip } from "./wb-replay-record.helpers";
import {
  hideReplay,
  installReplayAudioTrace,
  openReplayAndAssertStartsAtZero,
  readTrace,
  replayAudioSrcKind,
  type StartOracleOptions,
  type TraceRow,
} from "./wb-replay-audio-trace.helpers";
import { TAG } from "../test-tags";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

const CLIP_SEC = 60;
/** Small chunks so one scan needs many round trips (each delayed). */
const RANGE_CHUNK_BYTES = 16 * 1024;

const longClip: StartOracleOptions = {
  advances: true,
  advanceWaitMs: 1_500,
  totalRecordingSec: CLIP_SEC,
  minTotalRecordingSec: 5,
};

/** ~60 s Opus-in-WebM with no Duration element, like a MediaRecorder blob. */
function buildHeaderlessWebm(sec: number): Buffer {
  const ffmpeg = require("ffmpeg-static") as string;
  const dir = mkdtempSync(path.join(tmpdir(), "pw-headerless-webm-"));
  const out = path.join(dir, "clip.webm");
  try {
    execFileSync(
      ffmpeg,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", `sine=frequency=330:duration=${sec}`,
        "-c:a", "libopus", "-b:a", "24k",
        // live muxing writes no Duration, no Cues: a streaming recording.
        "-f", "webm", "-live", "1", out,
      ],
      { stdio: "pipe" }
    );
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let cachedWebm: Buffer | undefined;
const headerlessWebm = () => (cachedWebm ??= buildHeaderlessWebm(CLIP_SEC));

/** Precondition: Chromium really sees this blob as having unknown duration. */
async function expectNoDurationHeader(page: Page, webm: Buffer) {
  const duration = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const a = document.createElement("audio");
    a.src = URL.createObjectURL(new Blob([bytes], { type: "audio/webm" }));
    await new Promise<void>((res) => {
      a.onloadedmetadata = () => res();
      setTimeout(res, 5_000);
    });
    return a.duration;
  }, webm.toString("base64"));
  expect(duration, "fixture must have no duration header (Infinity), or the test proves nothing").toBe(Infinity);
}

function durIsNonFinite(dur: number | string): boolean {
  if (typeof dur === "number") return !Number.isFinite(dur);
  return !Number.isFinite(Number(dur));
}

/** The replay element itself saw the headerless file: a non-finite `dur` before the settled one. */
function expectReplaySawHeaderlessDuration(rows: TraceRow[]) {
  let finalIdx = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    const d = rows[i]!.dur;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) {
      finalIdx = i;
      break;
    }
  }
  expect(finalIdx, "replay element must settle on a finite duration").toBeGreaterThan(0);
  expect(
    rows.slice(0, finalIdx).some((r) => durIsNonFinite(r.dur)),
    "replay element must have reported a non-finite duration before the final duration"
  ).toBe(true);
}

type Delivery = {
  /** Serve Range requests as small 206 chunks (production-like). False: 200 with no range support. */
  ranged: boolean;
  firstDelayMs: number;
  laterDelayMs: number;
};

/** Serve `body` for every replay audio request with latency; returns the request log. */
async function serveWithLatency(page: Page, body: Buffer, mime: string, d: Delivery) {
  const log: string[] = [];
  let n = 0;
  await page.route(/\/api\/audio\/admin\/|\/concat-audio/, async (route) => {
    const i = n++;
    await new Promise((r) => setTimeout(r, i === 0 ? d.firstDelayMs : d.laterDelayMs));
    const range = route.request().headers()["range"];
    if (d.ranged) {
      const m = /bytes=(\d+)-(\d*)/.exec(range ?? "");
      const start = m ? Number(m[1]) : 0;
      const wanted = m && m[2] ? Number(m[2]) : body.length - 1;
      const end = Math.min(wanted, start + RANGE_CHUNK_BYTES - 1, body.length - 1);
      log.push(`#${i} ${range ?? "(no range)"} -> ${start}-${end}/${body.length}`);
      await route.fulfill({
        status: 206,
        headers: {
          "content-type": mime,
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${body.length}`,
          "content-length": String(end - start + 1),
        },
        body: body.subarray(start, end + 1),
      });
    } else {
      log.push(`#${i} ${range ?? "(no range)"} -> 200 full ${body.length}`);
      await route.fulfill({ status: 200, headers: { "content-type": mime }, body });
    }
  });
  return log;
}

const CASES: { name: string; delivery: Delivery; payload: "segments" | "concat" }[] = [
  {
    name: "ranged 206 chunks, first response 600 ms then 200 ms each",
    delivery: { ranged: true, firstDelayMs: 600, laterDelayMs: 200 },
    payload: "segments",
  },
  {
    name: "ranged 206 chunks, first response 300 ms then 200 ms each, concat master",
    delivery: { ranged: true, firstDelayMs: 300, laterDelayMs: 200 },
    payload: "concat",
  },
  {
    name: "Range stripped (200, no Accept-Ranges), 800 ms latency",
    delivery: { ranged: false, firstDelayMs: 800, laterDelayMs: 800 },
    payload: "segments",
  },
];

test.describe(
  "replay auto-start position over latency (SMOKE-UX-1 surrogate)",
  { tag: [TAG.WB_RECORDING] },
  () => {
    for (const { name, delivery, payload } of CASES) {
      test(`headerless ${CLIP_SEC}s WebM, ${name}: first open and re-open start at ~0 and advance`, async ({
        page,
      }, testInfo) => {
        test.setTimeout(240_000);
        assertLocalDatabaseUrlForHarness();

        const webm = headerlessWebm();
        await page.goto("about:blank");
        await expectNoDurationHeader(page, webm);

        const session = await seedEndedSessionWithAudioClip(page, {
          clip: webm,
          contentType: "audio/webm",
          fileExt: "webm",
          clipSec: CLIP_SEC,
          payload,
        });
        const log = await serveWithLatency(page, webm, "audio/webm", delivery);
        await installReplayAudioTrace(page);
        await page.goto(
          `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({ timeout: 60_000 });

        try {
          await openReplayAndAssertStartsAtZero(page, testInfo, "first open", longClip);
          expect(await replayAudioSrcKind(page), "payload under test").toBe(payload);
          await hideReplay(page);
          await openReplayAndAssertStartsAtZero(page, testInfo, "re-open", longClip);
          if (delivery.ranged) {
            expect(log.length, "ranged delivery must intercept more than one audio request").toBeGreaterThan(1);
          } else {
            expect(log.length, "Range-stripped delivery must intercept the audio request").toBeGreaterThanOrEqual(1);
          }
          expectReplaySawHeaderlessDuration(await readTrace(page));
        } finally {
          await testInfo.attach("audio-requests.txt", {
            body: log.join("\n"),
            contentType: "text/plain",
          });
          console.log(`--- audio requests (${log.length}) ---\n${log.slice(0, 40).join("\n")}`);
        }
      });
    }
  }
);
