/**
 * Independent oracle for "where does replay playback start" (SMOKE-UX-1).
 *
 * A page-level tracer, installed before the app loads, records the replay
 * <audio> element's own events and currentTime/play()/pause() calls, plus the
 * global seek scrubber's aria values. It knows nothing about the controller's
 * state, so a controller that parks the scrubber at the end while audio plays
 * from 0 (or the reverse) cannot hide behind its own bookkeeping.
 *
 * Shared by wb-replay-start-position.spec.ts and wb-replay-start-latency.spec.ts.
 */

import { expect, type Page, type TestInfo } from "@playwright/test";

/** Playback must begin this close to the start. */
export const START_MAX_SEC = 1.0;
/** The scrubber may run ahead of the audio's own fraction by at most this much. */
export const SCRUBBER_LEAD_MAX = 0.15;

export type TraceRow = {
  t: number;
  ev: string;
  ct: number | string;
  dur: number | string;
  paused: boolean;
  seeking: boolean;
  rs: number;
  /** Global seek scrubber aria-valuenow / aria-valuemax at this instant (absent until it mounts). */
  sv?: number;
  sm?: number;
  extra?: string;
};

/** Installs the independent tracer. Call before the first navigation. */
export async function installReplayAudioTrace(page: Page) {
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
      sv?: number;
      sm?: number;
      extra?: string;
    };
    const num = (n: number) => (Number.isFinite(n) ? n : String(n));
    const isReplayAudio = (n: unknown): n is HTMLAudioElement =>
      n instanceof HTMLAudioElement &&
      n.getAttribute("data-testid") === "wb-replay-audio";
    const snap = (el: HTMLAudioElement, ev: string, extra?: string) => {
      const slider = document.querySelector('[data-testid="wb-replay-global-seek"]');
      const sv = slider ? Number(slider.getAttribute("aria-valuenow")) : NaN;
      const sm = slider ? Number(slider.getAttribute("aria-valuemax")) : NaN;
      rows.push({
        t: Math.round(performance.now() - t0),
        ev,
        ct: num(el.currentTime),
        dur: num(el.duration),
        paused: el.paused,
        seeking: el.seeking,
        rs: el.readyState,
        sv: Number.isFinite(sv) ? sv : undefined,
        sm: Number.isFinite(sm) ? sm : undefined,
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

export async function traceNow(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as unknown as { __replayTraceNow: () => number }).__replayTraceNow()
  );
}

export async function readTrace(page: Page): Promise<TraceRow[]> {
  return page.evaluate(
    () => (window as unknown as { __replayAudioTrace: TraceRow[] }).__replayAudioTrace.slice()
  );
}

function formatTrace(rows: TraceRow[]): string {
  return rows
    .filter((r) => r.ev !== "sample")
    .map(
      (r) =>
        `${String(r.t).padStart(7)}ms ${r.ev.padEnd(16)} ct=${r.ct} dur=${r.dur} paused=${r.paused} seeking=${r.seeking} rs=${r.rs} scrub=${r.sv ?? "-"}/${r.sm ?? "-"}${r.extra ? ` ${r.extra}` : ""}`
    )
    .join("\n");
}

export async function attachTrace(page: Page, testInfo: TestInfo, label: string) {
  const text = formatTrace(await readTrace(page));
  await testInfo.attach(`audio-trace-${label}.txt`, { body: text, contentType: "text/plain" });
  console.log(`--- audio trace (${label}) ---\n${text}`);
}

/** A real `playing` event on the audio element after `sinceT` (playback actually began). */
export async function waitForPlayingEvent(page: Page, sinceT: number): Promise<TraceRow> {
  let playingRow: TraceRow | undefined;
  await expect
    .poll(
      async () => {
        const rows = await readTrace(page);
        playingRow = rows.find((r) => r.ev === "playing" && r.t >= sinceT);
        return playingRow !== undefined;
      },
      {
        message: "audio never began playing after replay was opened",
        timeout: 30_000,
        intervals: [100, 250, 500],
      }
    )
    .toBe(true)
    .catch(async (err) => {
      console.log(`--- audio trace at failure ---\n${formatTrace(await readTrace(page))}`);
      throw err;
    });
  return playingRow!;
}

const toNum = (v: number | string) => (typeof v === "number" ? v : NaN);

export type StartOracleOptions = {
  /**
   * The clip is long enough (several seconds) that "still playing" and "near the
   * end" are distinguishable after `advanceWaitMs`. False for sub-second clips,
   * which legitimately finish within the window.
   */
  advances: boolean;
  /** How long to watch playback after it begins. */
  advanceWaitMs: number;
  /**
   * Total recorded audio in seconds from an independent source (DB rows), so the
   * test is not tautological when the active segment is short. Optional.
   */
  totalRecordingSec?: number;
  /** Minimum total recorded seconds for start-vs-end to be distinguishable. */
  minTotalRecordingSec?: number;
};

/**
 * Assert the spec for one "tutor opens replay" interaction, from the trace after `sinceT`:
 *  1. playback began near 0, and no play/playing ever began elsewhere;
 *  2. the scrubber never ran ahead of the audio (it reads near the start while audio is
 *     near the start), so a scrubber parked at the cap cannot hide behind a healthy audio;
 *  3. for long clips: audio kept playing and advanced in real time, never `ended`, and the
 *     scrubber advanced too without sitting at max.
 */
export async function assertReplayStartedAtZero(
  page: Page,
  testInfo: TestInfo,
  label: string,
  sinceT: number,
  playingRow: TraceRow,
  opts: StartOracleOptions
) {
  await page.waitForTimeout(opts.advanceWaitMs);
  await attachTrace(page, testInfo, label);
  const after = (await readTrace(page)).filter((r) => r.t >= sinceT);

  if (opts.minTotalRecordingSec !== undefined) {
    expect(
      opts.totalRecordingSec ?? 0,
      `${label}: total recording must be long enough that start differs from end`
    ).toBeGreaterThanOrEqual(opts.minTotalRecordingSec);
  }

  // 1. Playback began near 0 — and never began from elsewhere.
  // A sub-second clip has no room for "near the start" to mean 1 s, so it is held to 0.3 s.
  const startMax = opts.advances ? START_MAX_SEC : 0.3;
  for (const s of after.filter((r) => r.ev === "playing" || r.ev === "play")) {
    expect(
      toNum(s.ct),
      `${label}: '${s.ev}' began at currentTime=${s.ct} (must be < ${startMax}s)`
    ).toBeLessThan(startMax);
  }

  // 2. Scrubber tracks the audio: never ahead of the audio's own fraction by more than the lead.
  const playingAt = playingRow.t;
  const withScrubber = after.filter(
    (r) =>
      r.t >= playingAt &&
      r.sv !== undefined &&
      r.sm !== undefined &&
      r.sm > 0 &&
      typeof r.ct === "number" &&
      typeof r.dur === "number" &&
      r.dur > 0
  );
  expect(withScrubber.length, `${label}: scrubber must be present while playing`).toBeGreaterThan(0);
  for (const r of withScrubber) {
    const scrubFrac = r.sv! / r.sm!;
    const audioFrac = Math.min(1, toNum(r.ct) / toNum(r.dur));
    expect(
      scrubFrac,
      `${label}: scrubber at ${r.sv}/${r.sm} (${(scrubFrac * 100).toFixed(0)}%) while audio is at ${r.ct}/${r.dur} on '${r.ev}' @${r.t}ms`
    ).toBeLessThanOrEqual(audioFrac + SCRUBBER_LEAD_MAX);
  }
  const firstScrub = withScrubber[0]!;
  expect(
    firstScrub.sv! / firstScrub.sm!,
    `${label}: scrubber right after playback began (${firstScrub.sv}/${firstScrub.sm})`
  ).toBeLessThan(SCRUBBER_LEAD_MAX + Math.min(1, toNum(firstScrub.ct) / toNum(firstScrub.dur)));

  if (!opts.advances) return;

  // 3. Long clip: never ended, audio and scrubber both advanced, nothing parked at the end.
  expect(
    after.filter((r) => r.ev === "ended").length,
    `${label}: audio fired 'ended' right after opening replay (parked at end)`
  ).toBe(0);
  const first = toNum(playingRow.ct);
  const last = after[after.length - 1]!;
  expect(last.paused, `${label}: audio is paused after ${opts.advanceWaitMs}ms (should be playing)`).toBe(false);
  expect(toNum(last.ct), `${label}: currentTime must advance (began ${first}, now ${last.ct})`).toBeGreaterThan(
    first + 0.5
  );
  expect(
    toNum(last.ct),
    `${label}: currentTime jumped ahead of real time (began ${first}, now ${last.ct})`
  ).toBeLessThan(first + opts.advanceWaitMs / 1000 + 3);
  const lastScrub = [...withScrubber].reverse()[0]!;
  expect(
    lastScrub.sv!,
    `${label}: scrubber must advance (was ${firstScrub.sv}, now ${lastScrub.sv})`
  ).toBeGreaterThan(firstScrub.sv!);
  expect(
    lastScrub.sv! / lastScrub.sm!,
    `${label}: scrubber is at the end (${lastScrub.sv}/${lastScrub.sm}) while audio plays`
  ).toBeLessThan(0.98);
}

/**
 * One "tutor taps Replay session" interaction on the in-shell review: click,
 * wait for the real `playing` event, then check the start-position spec.
 */
export async function openReplayAndAssertStartsAtZero(
  page: Page,
  testInfo: TestInfo,
  label: string,
  opts: StartOracleOptions
) {
  const tClick = await traceNow(page);
  await page.getByTestId("wb-review-enter-replay").click();
  await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({ timeout: 30_000 });
  const playingRow = await waitForPlayingEvent(page, tClick);
  await assertReplayStartedAtZero(page, testInfo, label, tClick, playingRow, opts);
}

export async function hideReplay(page: Page) {
  await page.getByTestId("wb-replay-hide").click();
  await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({ timeout: 10_000 });
}

export async function replayAudioSrcKind(page: Page): Promise<"concat" | "segments" | "none"> {
  const src = await page.evaluate(
    () => document.querySelector('[data-testid="wb-replay-audio"]')?.getAttribute("src") ?? ""
  );
  if (src.includes("/concat-audio")) return "concat";
  if (src.includes("/api/audio/")) return "segments";
  return "none";
}

/** A mono 8 kHz 16-bit PCM WAV of a quiet sine, `sec` seconds long. */
export function buildSineWav(sec: number): Buffer {
  const rate = 8000;
  const n = Math.round(rate * sec);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  }
  return buf;
}
