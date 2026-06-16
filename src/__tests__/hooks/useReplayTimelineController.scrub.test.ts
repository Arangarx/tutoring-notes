/**
 * @jest-environment jsdom
 */

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  restoreElements: jest.fn((els: unknown[]) => els),
}));
jest.mock("@excalidraw/excalidraw/index.css", () => ({}), { virtual: true });

import { renderHook, act, waitFor } from "@testing-library/react";
import { useRef, useMemo } from "react";
import { useReplayTimelineController } from "@/hooks/useReplayTimelineController";

const sampleLog = {
  schemaVersion: 1,
  startedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 10_000,
  events: [
    {
      type: "add" as const,
      t: 1000,
      element: {
        id: "r1",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: "#000",
        version: 1,
        versionNonce: 1,
        isDeleted: false,
      },
    },
  ],
};

const originalFetch = global.fetch;

function mockAudioElement() {
  const audio = document.createElement("audio");
  document.body.appendChild(audio);
  let currentTime = 0;
  let srcAttr = "";
  Object.defineProperty(audio, "currentTime", {
    configurable: true,
    get: () => currentTime,
    set: (v: number) => {
      currentTime = v;
    },
  });
  Object.defineProperty(audio, "src", {
    configurable: true,
    get: () =>
      srcAttr ? new URL(srcAttr, "http://localhost").href : "",
    set: (v: string) => {
      srcAttr = v;
    },
  });
  audio.getAttribute = jest.fn((name: string) =>
    name === "src" ? srcAttr : null
  ) as typeof audio.getAttribute;
  audio.load = jest.fn();
  audio.play = jest.fn().mockResolvedValue(undefined);
  audio.pause = jest.fn();
  Object.defineProperty(audio, "paused", {
    configurable: true,
    get: () => true,
  });
  return {
    audio,
    getCurrentTime: () => currentTime,
    cleanup: () => audio.remove(),
  };
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(sampleLog),
  }) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("useReplayTimelineController scrub audio seek", () => {
  it("sets audio currentTime on scrub commit and play resumes from that position", async () => {
    const { audio, getCurrentTime, cleanup } = mockAudioElement();
    const applySceneAtRef = { current: jest.fn() };

    const { result, unmount } = renderHook(() => {
      const ref = useRef(applySceneAtRef.current);
      // Stable reference prevents the initialize-audio reset block from
      // firing on every re-render (effectiveSegments dep would change each
      // render if the array is an inline literal).
      const segments = useMemo(
        () => [{ url: "/api/audio/admin/rec-1", mimeType: "audio/webm", durationSeconds: 10 }],
        []
      );
      return useReplayTimelineController({
        eventsBlobUrl: "/api/whiteboard/wbs-test/events",
        audioSegments: segments,
        applySceneAtRef: ref,
      });
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
    });

    act(() => {
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    act(() => {
      result.current.handleScrubPointerDown();
      result.current.handleScrubChange(5000);
      result.current.handleScrubPointerUp(5000);
    });

    expect(getCurrentTime()).toBeCloseTo(5, 1);

    act(() => {
      result.current.play();
    });

    expect(getCurrentTime()).toBeCloseTo(5, 1);
    expect(audio.play).toHaveBeenCalled();

    unmount();
    cleanup();
  });
});

describe("paused-seek currentTime retry on canplay (Fix A item 2)", () => {
  /**
   * RED-BEFORE / GREEN-AFTER for the paused-seek retry.
   *
   * When el.currentTime = seekSec throws (readyState < HAVE_METADATA), the
   * old applySeek catch only registered a canplay retry for autoplay=true.
   * A paused scrub (autoplay=false) had NO retry, so if canplay fired before
   * play() was called the position was silently lost.
   *
   * Fix: register a one-shot canplay/loadedmetadata listener for BOTH
   * autoplay cases so the position always sticks.
   */
  it("re-applies seek position via one-shot canplay listener when setter throws during paused scrub", async () => {
    let readyState = 0;
    let currentTime = 0;
    const audio2 = document.createElement("audio");
    document.body.appendChild(audio2);

    Object.defineProperty(audio2, "readyState", {
      configurable: true,
      get: () => readyState,
    });
    Object.defineProperty(audio2, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (v: number) => {
        if (readyState < 1)
          throw new DOMException(
            "Not enough data",
            "InvalidStateError"
          );
        currentTime = v;
      },
    });
    let srcAttr2 = "";
    Object.defineProperty(audio2, "src", {
      configurable: true,
      get: () =>
        srcAttr2 ? new URL(srcAttr2, "http://localhost").href : "",
      set: (v: string) => {
        srcAttr2 = v;
      },
    });
    audio2.getAttribute = jest.fn((name: string) =>
      name === "src" ? srcAttr2 : null
    ) as typeof audio2.getAttribute;
    audio2.load = jest.fn();
    audio2.play = jest.fn().mockResolvedValue(undefined);
    audio2.pause = jest.fn();
    Object.defineProperty(audio2, "paused", {
      configurable: true,
      get: () => true,
    });

    const applySceneAtRef2 = { current: jest.fn() };
    const { result, unmount } = renderHook(() => {
      const ref = useRef(applySceneAtRef2.current);
      const segments = useMemo(
        () => [
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm",
            durationSeconds: 10,
          },
        ],
        []
      );
      return useReplayTimelineController({
        eventsBlobUrl: "/api/whiteboard/wbs-test/events",
        audioSegments: segments,
        applySceneAtRef: ref,
      });
    });

    act(() => {
      result.current.audioRef.current = audio2;
      audio2.src = "/api/audio/admin/rec-1";
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // Scrub to 5 s while readyState=0 — setter throws, so the position is
    // NOT applied synchronously.
    act(() => {
      result.current.handleScrubPointerDown();
      result.current.handleScrubChange(5000);
      result.current.handleScrubPointerUp(5000);
    });
    // currentTime still 0 because setter threw
    expect(currentTime).toBe(0);

    // Browser finishes buffering — canplay fires BEFORE the user presses Play.
    readyState = 1;
    act(() => {
      audio2.dispatchEvent(new Event("canplay"));
    });

    // After fix: one-shot listener applied seekSec ≈ 5.
    // Before fix: no listener for autoplay=false → currentTime stays 0 → FAILS.
    expect(currentTime).toBeCloseTo(5, 1);

    // Play should resume from the scrubbed position.
    act(() => {
      result.current.play();
    });
    expect(currentTime).toBeCloseTo(5, 1);
    expect(audio2.play).toHaveBeenCalled();

    unmount();
    audio2.remove();
  });
});

describe("WebM duration-fix race (scrub → durationchange → play)", () => {
  /**
   * Regression test: proves the root cause of the 3rd-repeat audio-reset
   * bug. When the WebM duration-fix sets currentTime = 1e101 then the user
   * scrubs to 5 s, a subsequent durationchange must NOT reset to 0.
   *
   * This test is RED on unfixed code and GREEN after Fix 1.
   */
  it("durationchange after user scrub does not reset currentTime to 0", async () => {
    const { audio, getCurrentTime, cleanup } = mockAudioElement();

    // Simulate Infinity duration (Chrome WebM streaming container default).
    let mockDuration = Infinity;
    Object.defineProperty(audio, "duration", {
      configurable: true,
      get: () => mockDuration,
    });

    const applySceneAtRef = { current: jest.fn() };

    const { result, unmount } = renderHook(() => {
      const ref = useRef(applySceneAtRef.current);
      // Stable reference prevents the initialize-audio reset block from
      // firing on every re-render due to a new array reference each render.
      const segments = useMemo(
        () => [{ url: "/api/audio/admin/rec-1", mimeType: "audio/webm", durationSeconds: 10 }],
        []
      );
      return useReplayTimelineController({
        eventsBlobUrl: "/api/whiteboard/wbs-test/events",
        audioSegments: segments,
        applySceneAtRef: ref,
      });
    });

    // Set audioRef BEFORE waiting, so the WebM fix effect sees it when
    // replayExcaliRestoreReady becomes true and fires the effect.
    act(() => {
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    // Wait for both load states.
    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // Simulate loadedmetadata: Infinity duration → WebM fix sets currentTime = 1e101.
    act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
    });
    // The fix should have seeked to the sentinel value.
    expect(getCurrentTime()).toBe(1e101);

    // User scrubs to 5 s.
    act(() => {
      result.current.handleScrubPointerDown();
      result.current.handleScrubChange(5000);
      result.current.handleScrubPointerUp(5000);
    });
    expect(getCurrentTime()).toBeCloseTo(5, 0);

    // Browser finishes scanning → durationchange fires with real duration.
    // BUG (unfixed): this resets currentTime to 0. Fixed: no-op because
    // cancelPendingFix() was called inside applySeek().
    act(() => {
      mockDuration = 10;
      audio.dispatchEvent(new Event("durationchange"));
    });

    // Must still be ~5 s, NOT 0.
    expect(getCurrentTime()).toBeCloseTo(5, 0);

    // Play from the scrubbed position.
    act(() => {
      result.current.play();
    });
    expect(getCurrentTime()).toBeCloseTo(5, 0);
    expect(audio.play).toHaveBeenCalled();

    unmount();
    cleanup();
  });
});

describe("pendingPlayRef — no pause() abort on seek-with-play", () => {
  /**
   * Verifies the single-source-of-truth play/pause fix.
   *
   * Scenario: audio is playing, user scrubs.
   *  1. handleScrubPointerDown pauses the element → `pause` DOM event fires.
   *  2. handleScrubPointerUp commits the seek → el.play() is called.
   *  3. While play() promise is pending, another `pause` DOM event fires
   *     (stale — fired by the scrub-pause in step 1 that propagated late).
   *
   * Without the guard, onPause responds to the stale event, calls loop.pause(),
   * and fighting play() aborts it (AbortError). With the guard, onPause is
   * suppressed while pendingPlayRef.current=true.
   */
  it("suppresses stale pause DOM event while play() is pending (no abort)", async () => {
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    let currentTime = 0;
    let srcAttr = "";
    let isPaused = true;

    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (v: number) => { currentTime = v; },
    });
    Object.defineProperty(audio, "src", {
      configurable: true,
      get: () => (srcAttr ? new URL(srcAttr, "http://localhost").href : ""),
      set: (v: string) => { srcAttr = v; },
    });
    Object.defineProperty(audio, "paused", {
      configurable: true,
      get: () => isPaused,
    });
    audio.getAttribute = jest.fn((name: string) =>
      name === "src" ? srcAttr : null
    ) as typeof audio.getAttribute;
    audio.load = jest.fn();

    // play() returns a never-resolving promise to simulate in-flight play.
    let resolvePlay!: () => void;
    audio.play = jest.fn(() => new Promise<void>((res) => { resolvePlay = res; }));
    audio.pause = jest.fn(() => {
      isPaused = true;
      audio.dispatchEvent(new Event("pause"));
    });

    const applySceneAtRef = { current: jest.fn() };
    const { result, unmount } = renderHook(() => {
      const ref = useRef(applySceneAtRef.current);
      const segments = useMemo(
        () => [{ url: "/api/audio/admin/rec-1", mimeType: "audio/webm", durationSeconds: 10 }],
        []
      );
      return useReplayTimelineController({
        eventsBlobUrl: "/api/whiteboard/wbs-test/events",
        audioSegments: segments,
        applySceneAtRef: ref,
      });
    });

    // Set audioRef BEFORE waitFor so the play-loop effect registers event
    // listeners on the audio element when replayExcaliRestoreReady becomes true.
    act(() => {
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // Initiate seek+play directly (mimics the user pressing Play at 3 s).
    // seek(3000, {play:true}) → setPlaying(true) + startPlay(el) → el.play().
    // The pending play() promise is in-flight; playing state is now true.
    isPaused = false;
    currentTime = 3;
    act(() => {
      result.current.seek(3000, { play: true });
    });

    // playing=true was set by seek; play() promise is unresolved (pendingPlayRef=true).
    expect(result.current.playing).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);

    // Stale pause event fires WHILE play() is still in-flight (not resolved).
    // This simulates the scrub-pause event arriving late — the key race condition.
    // With the pendingPlayRef guard, onPause returns early and does NOT flip
    // playing to false or call loop.pause().
    act(() => {
      audio.dispatchEvent(new Event("pause"));
    });

    // playing must remain true — stale pause was suppressed.
    expect(result.current.playing).toBe(true);

    // Resolve the play promise → pendingPlayRef clears.
    await act(async () => {
      resolvePlay();
      await Promise.resolve();
    });

    // Simulate the real play DOM event Chrome fires once playback starts.
    isPaused = false;
    act(() => {
      audio.dispatchEvent(new Event("play"));
    });
    expect(result.current.playing).toBe(true);
    expect(currentTime).toBeCloseTo(3, 0);

    unmount();
    audio.remove();
  });
});

describe("FIX 1 — apply re-entrancy guard (no stack overflow at end-of-stream)", () => {
  /**
   * RED-BEFORE / GREEN-AFTER for the recursive-pause bug.
   *
   * Without isApplyingRef guard:
   *   loop-apply(ms >= cap)
   *     → el.pause()          — fires "pause" synchronously (real Chrome behaviour)
   *     → onPause()           — setPlaying(false) + loop.pause()
   *     → loop.pause()        — trailing applyOnce(force=true)
   *     → apply(ms)           — re-enters! → stack overflow
   *
   * Also:  apply → loop.pause() directly → applyOnce → apply → … (second cycle)
   *
   * With isApplyingRef guard both cycles are broken.
   */
  it("does not throw RangeError when audio.pause() fires synchronously inside apply at cap", async () => {
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    let currentTime = 0;
    let srcAttr = "";
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (v: number) => { currentTime = v; },
    });
    Object.defineProperty(audio, "src", {
      configurable: true,
      get: () => (srcAttr ? new URL(srcAttr, "http://localhost").href : ""),
      set: (v: string) => { srcAttr = v; },
    });
    audio.getAttribute = jest.fn((name: string) =>
      name === "src" ? srcAttr : null
    ) as typeof audio.getAttribute;
    audio.load = jest.fn();
    audio.play = jest.fn().mockResolvedValue(undefined);
    // Simulate real-browser behaviour: pause() fires the 'pause' event synchronously.
    audio.pause = jest.fn(() => {
      audio.dispatchEvent(new Event("pause"));
    });
    // Audio reports as "playing" so onPause fires when pause() is called.
    Object.defineProperty(audio, "paused", {
      configurable: true,
      get: () => false,
    });

    const applySceneAtRef = { current: jest.fn() };
    const { result, unmount } = renderHook(() => {
      const ref = useRef(applySceneAtRef.current);
      const segments = useMemo(
        () => [{ url: "/api/audio/admin/rec-1", mimeType: "audio/webm", durationSeconds: 10 }],
        []
      );
      return useReplayTimelineController({
        eventsBlobUrl: "/api/whiteboard/wbs-test/events",
        audioSegments: segments,
        applySceneAtRef: ref,
      });
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    act(() => {
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    // Set currentTime to a value far beyond any scrubberMax so every apply()
    // call immediately hits the ms >= cap branch.
    currentTime = 99999; // seconds — 99 999 000 ms, far beyond 10 s durationMs

    // Fire the 'play' event: this starts the rAF loop which calls apply().
    // Without the guard, this would cause a RangeError immediately because
    // apply → el.pause → onPause → loop.pause → applyOnce → apply → …
    expect(() => {
      act(() => {
        audio.dispatchEvent(new Event("play"));
      });
    }).not.toThrow();

    // After the guard kicks in, isAtEnd should be set and playing should be false.
    expect(result.current.playing).toBe(false);

    unmount();
    audio.remove();
  });
});
