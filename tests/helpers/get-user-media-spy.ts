/**
 * Consent wave C0 — `getUserMedia` spy (M1–M16, E15, E19).
 *
 * Injected with `context.addInitScript` BEFORE any page script runs, so a call
 * made during the first render is counted. Two modes:
 *
 *   "passthrough" (Chromium with the fake-media flags, `PW_FAKE_MEDIA_ARGS`):
 *       wraps the real `getUserMedia`; tracks are real, so RTP/`readyState`
 *       oracles work. M11/M12 and every Chromium `hasTouch` row use this.
 *
 *   "stub" (WebKit / iPhone 13, which has no fake-media flags — BL1):
 *       does NOT touch hardware. Records the constraints and returns a
 *       canvas-captured video stream (plus a silent WebAudio audio track when
 *       audio is requested), so the row asserts only "was the camera/mic
 *       requested, with what constraints". E15, M6 (spy-only), M10, M13.
 *
 * Reading the spy is independent of the app: it counts calls on the browser's
 * `navigator.mediaDevices`, not app state.
 */

import type { BrowserContext, Page } from "@playwright/test";

export type GetUserMediaMode = "passthrough" | "stub";

export type GetUserMediaCall = {
  /** Wall-clock ms (page `Date.now()`). */
  at: number;
  constraints: MediaStreamConstraints | null;
  wantsAudio: boolean;
  wantsVideo: boolean;
  /** Present once the call resolved; "rejected" when it threw. */
  outcome: "pending" | "granted" | "rejected";
  trackIds: string[];
};

export type GetUserMediaSnapshot = {
  calls: GetUserMediaCall[];
  audioCalls: number;
  videoCalls: number;
  /** `readyState` of every track handed out so far ("live" | "ended"). */
  tracks: { id: string; kind: string; readyState: string }[];
};

const SPY_KEY = "__consentGumSpy";

/** Install before navigation. Idempotent per context. */
export async function installGetUserMediaSpy(
  context: BrowserContext,
  mode: GetUserMediaMode
): Promise<void> {
  await context.addInitScript(
    ({ mode: m, key }: { mode: GetUserMediaMode; key: string }) => {
      const w = window as unknown as Record<string, unknown>;
      if (w[key]) return;
      const calls: GetUserMediaCall[] = [];
      const tracks: MediaStreamTrack[] = [];
      w[key] = { calls, tracks };

      // Playwright WebKit on some hosts exposes no `navigator.mediaDevices` at all. In stub mode the spy
      // installs a minimal one so the page under test can still ask for media and be counted.
      if (!navigator.mediaDevices && m === "stub") {
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: {
            getUserMedia: async () => emptyStreamLike(),
            enumerateDevices: async () => [],
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
          },
        });
      }
      const md = navigator.mediaDevices;
      if (!md) return;
      const original = md.getUserMedia?.bind(md);

      const wants = (v: unknown) => v === true || (typeof v === "object" && v !== null);

      // Playwright WebKit on Windows has no `MediaStream` constructor at all: hand back a minimal
      // stream-shaped object so the page can still ask for media, be counted, and carry on.
      function emptyStreamLike(): MediaStream {
        const list: MediaStreamTrack[] = [];
        return {
          id: "stub-stream",
          active: false,
          getTracks: () => list,
          getAudioTracks: () => [],
          getVideoTracks: () => [],
          addTrack: () => undefined,
          removeTrack: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        } as unknown as MediaStream;
      }

      function stubStream(c: MediaStreamConstraints): MediaStream {
        if (typeof MediaStream === "undefined") return emptyStreamLike();
        const stream = new MediaStream();
        // Each source is best-effort: a WebKit build without captureStream / WebAudio still
        // records the call; only the returned tracks degrade.
        if (wants(c.video)) {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 240;
            const g = canvas.getContext("2d");
            if (g) {
              g.fillStyle = "#336699";
              g.fillRect(0, 0, 320, 240);
            }
            for (const t of canvas.captureStream(5).getVideoTracks()) stream.addTrack(t);
          } catch {
            /* no canvas capture on this engine */
          }
        }
        if (wants(c.audio)) {
          try {
            const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (Ctx) {
              const ctx = new Ctx();
              const dest = ctx.createMediaStreamDestination();
              for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
            }
          } catch {
            /* no WebAudio destination on this engine */
          }
        }
        return stream;
      }

      md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const c = constraints ?? {};
        const call: GetUserMediaCall = {
          at: Date.now(),
          constraints: constraints ?? null,
          wantsAudio: wants(c.audio),
          wantsVideo: wants(c.video),
          outcome: "pending",
          trackIds: [],
        };
        calls.push(call);
        try {
          const stream =
            m === "stub" || !original ? stubStream(c) : await original(constraints);
          for (const t of stream.getTracks()) {
            tracks.push(t);
            call.trackIds.push(t.id);
          }
          call.outcome = "granted";
          return stream;
        } catch (err) {
          call.outcome = "rejected";
          throw err;
        }
      };
    },
    { mode, key: SPY_KEY }
  );
}

export async function readGetUserMediaSpy(page: Page): Promise<GetUserMediaSnapshot> {
  return page.evaluate((key: string) => {
    const spy = (window as unknown as Record<string, unknown>)[key] as
      | { calls: GetUserMediaCall[]; tracks: MediaStreamTrack[] }
      | undefined;
    if (!spy) throw new Error("getUserMedia spy not installed: call installGetUserMediaSpy before navigation");
    return {
      calls: spy.calls.map((c) => ({ ...c })),
      audioCalls: spy.calls.filter((c) => c.wantsAudio).length,
      videoCalls: spy.calls.filter((c) => c.wantsVideo).length,
      tracks: spy.tracks.map((t) => ({ id: t.id, kind: t.kind, readyState: t.readyState })),
    };
  }, SPY_KEY);
}
