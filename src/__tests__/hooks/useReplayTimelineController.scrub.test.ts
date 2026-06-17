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

// ---------------------------------------------------------------------------
// BUG A — first play with unresolved duration must NOT snap to end
// ---------------------------------------------------------------------------
describe("Bug A — first play does not snap to end when resolvedMaxMs=0", () => {
  /**
   * RED-BEFORE / GREEN-AFTER
   *
   * When audioTimeline.totalMs = 0 (no stored durationSeconds) AND the event
   * log has durationMs = 0 / no events, computeScrubberMax returns 1 ms
   * (the minimum fallback). The play loop's apply() callback previously
   * checked  ms >= cap  unconditionally — so at el.currentTime=0.001 s the
   * computed globalMs (= Math.floor(0.001*1000) = 1 ms) satisfies 1 >= 1,
   * immediately firing the end-cap and stopping playback.
   *
   * Fix: guard with  resolvedMaxMsRef.current > 0  so the end-cap is skipped
   * while the audio duration has not yet been measured (onMetadataLoaded).
   * The onEnded handler independently catches the real end-of-stream.
   */
  it("does not fire end-cap when scrubberMax=1ms and resolvedMaxMs=0 (metadata not yet loaded)", async () => {
    // Return a log with durationMs=0 and no events so totalMs collapses to 1.
    const savedFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-01-01T00:00:00.000Z",
          durationMs: 0,
          events: [],
        }),
    }) as unknown as typeof fetch;

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
      get: () => (srcAttr ? new URL(srcAttr, "http://localhost").href : ""),
      set: (v: string) => {
        srcAttr = v;
      },
    });
    audio.getAttribute = jest.fn((name: string) =>
      name === "src" ? srcAttr : null
    ) as typeof audio.getAttribute;
    audio.load = jest.fn();
    audio.play = jest.fn().mockResolvedValue(undefined);
    // pause() fires the 'pause' event synchronously (real-Chrome behaviour).
    audio.pause = jest.fn(() => {
      audio.dispatchEvent(new Event("pause"));
    });
    Object.defineProperty(audio, "paused", {
      configurable: true,
      get: () => true,
    });

    const applySceneAtRef = { current: jest.fn() };
    const { result, unmount } = renderHook(() => {
      const ref = useRef(applySceneAtRef.current);
      // durationSeconds=0 → audioTimeline.totalMs=0 → resolvedMaxMs starts 0
      const segments = useMemo(
        () => [
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm",
            durationSeconds: 0,
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
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // Confirm the degenerate state: scrubberMax collapses to 1 ms.
    expect(result.current.scrubberMax).toBe(1);

    // Simulate 1 ms of playback — exactly the value that previously tripped
    // the end-cap (ms = Math.floor(0.001 * 1000) = 1, 1 >= cap=1 was true).
    currentTime = 0.001;

    // Fire 'play' DOM event → starts the rAF loop → apply() is called.
    act(() => {
      audio.dispatchEvent(new Event("play"));
    });

    // BUG A (before fix): end-cap fires → playing=false, isAtEnd=true.
    // FIX (after):  resolvedMaxMsRef.current=0 skips the cap → still playing.
    expect(result.current.playing).toBe(true);
    expect(result.current.isAtEnd).toBe(false);

    unmount();
    audio.remove();
    global.fetch = savedFetch;
  });
});

// ---------------------------------------------------------------------------
// BUG B — scrub drag must NOT storm audio currentTime on every onChange
// ---------------------------------------------------------------------------
describe("Bug B — scrub drag writes audio currentTime exactly once (on pointer-up)", () => {
  /**
   * RED-BEFORE / GREEN-AFTER
   *
   * Previously handleScrubChange called seek() on every onChange during drag,
   * which propagated to loadSegmentAt → applySeek → el.currentTime = seekSec.
   * A three-step drag produced 3 (or 4) currentTime writes, thrashing the
   * audio decoder and preventing reseeking until pointer-up settled.
   *
   * Fix: handleScrubChange for the audio path now only updates UI state
   * (globalMs + applySceneAtRef).  The single audio seek is committed in
   * handleScrubPointerUp → seek() → loadSegmentAt → applySeek.
   */
  it("writes el.currentTime only once (pointer-up), not on each onChange during drag", async () => {
    let currentTime = 0;
    let currentTimeWriteCount = 0;
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    let srcAttr = "";

    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (v: number) => {
        currentTimeWriteCount++;
        currentTime = v;
      },
    });
    Object.defineProperty(audio, "src", {
      configurable: true,
      get: () => (srcAttr ? new URL(srcAttr, "http://localhost").href : ""),
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

    const applySceneAtRef = { current: jest.fn() };
    const { result, unmount } = renderHook(() => {
      const ref = useRef(applySceneAtRef.current);
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
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // Reset write count — discard any writes that occurred during setup.
    currentTimeWriteCount = 0;

    // Simulate a multi-step drag: pointer-down + 3 onChange moves + pointer-up.
    act(() => {
      result.current.handleScrubPointerDown();
      result.current.handleScrubChange(1000); // drag move 1
      result.current.handleScrubChange(3000); // drag move 2
      result.current.handleScrubChange(5000); // drag move 3
      result.current.handleScrubPointerUp(5000); // release → single audio seek
    });

    // BUG B (before fix): 3–4 currentTime writes (one per onChange + pointer-up).
    // FIX (after): exactly 1 write — the pointer-up seek.
    expect(currentTimeWriteCount).toBe(1);
    expect(currentTime).toBeCloseTo(5, 1); // landed at 5 s

    // Scene preview must have been called on each drag step (visual feedback)
    // plus once from the pointer-up seek: at minimum 4 calls total.
    expect(applySceneAtRef.current.mock.calls.length).toBeGreaterThanOrEqual(4);

    // Existing seek-then-play contract still holds: play() resumes from 5 s.
    act(() => {
      result.current.play();
    });
    expect(currentTime).toBeCloseTo(5, 1);
    expect(audio.play).toHaveBeenCalled();

    unmount();
    audio.remove();
  });
});

// ---------------------------------------------------------------------------
// Fix 1 — resolvedMaxMs / scrubberMax update when WebM duration resolves
// ---------------------------------------------------------------------------
describe("Eager WebM duration resolution — resolvedMaxMs / scrubberMax updated on durationchange", () => {
  /**
   * RED-BEFORE / GREEN-AFTER
   *
   * When durationSeconds is null / 0 in the DB, audioTimeline.totalMs = 0 and
   * resolvedMaxMs stays 0.  The WebM fix's onDurationChange used to have no
   * callback to the controller, so even after Chrome scanned the file and
   * fired durationchange with the real duration (~94741 ms), scrubberMax
   * remained at the 1 ms fallback.
   *
   * Fix: attachWebmDurationFix now accepts onDurationResolved; the controller
   * passes a callback that calls setResolvedMaxMs with the measured duration.
   * After durationchange, scrubberMax must be >= the measured duration.
   */
  it("updates scrubberMax after durationchange resolves Infinity → finite (storedDuration=0)", async () => {
    const savedFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-01-01T00:00:00.000Z",
          durationMs: 0,
          events: [],
        }),
    }) as unknown as typeof fetch;

    let mockDuration: number = Infinity;
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    let currentTime = 0;
    let srcAttr = "";

    Object.defineProperty(audio, "duration", {
      configurable: true,
      get: () => mockDuration,
    });
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (v: number) => {
        currentTime = v;
      },
    });
    Object.defineProperty(audio, "src", {
      configurable: true,
      get: () => (srcAttr ? new URL(srcAttr, "http://localhost").href : ""),
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

    const applySceneAtRef = { current: jest.fn() };
    const { result, unmount } = renderHook(() => {
      const ref = useRef(applySceneAtRef.current);
      const segments = useMemo(
        () => [
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm;codecs=opus",
            durationSeconds: 0,
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
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // BUG state: storedDuration=0 → scrubberMax collapses to 1 ms.
    expect(result.current.scrubberMax).toBe(1);

    // WebM fix fires on loadedmetadata (Infinity duration → seek 1e101).
    act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
    });
    // Duration still Infinity → scrubberMax still 1.
    expect(result.current.scrubberMax).toBe(1);

    // Chrome finishes scanning → durationchange fires with real duration.
    act(() => {
      mockDuration = 94.741;
      audio.dispatchEvent(new Event("durationchange"));
    });

    // FIX: scrubberMax must now reflect the measured duration (~94741 ms).
    // BUG (unfixed): scrubberMax stays 1, every scrub maps to localMs=0.
    await waitFor(() => {
      expect(result.current.scrubberMax).toBeGreaterThan(90_000);
    });

    unmount();
    audio.remove();
    global.fetch = savedFetch;
  });
});

// ---------------------------------------------------------------------------
// LOADED-RECORDING SEEK: scrub must reach the right position when both
// storedTotal=0 AND measuredTotal=0 (WebM scan was aborted by play())
// ---------------------------------------------------------------------------
describe("Loaded recording seek — storedTotal=0, measuredTotal=0, el.duration=Infinity (WebM scan aborted)", () => {
  /**
   * RED-BEFORE / GREEN-AFTER
   *
   * Regression: hard-refresh a stored recording whose durationSeconds is null
   * in the DB.  The user clicks Play, which triggers the position-correction
   * guard in play() — it sees el.currentTime=Infinity (set by the 1e101 WebM
   * scan hack) and corrects it to 0.  That correction aborts Chrome's
   * end-of-file scan, so durationchange with a finite value never fires and
   * onDurationResolved is never called → resolvedMaxMsRef.current stays 0.
   *
   * When the user then scrubs to e.g. ms=53460, seek() calls
   * globalMsToSegmentLocal(53460, {totalMs:0}, undefined).  The old code
   * returned localMs = Math.min(53460, totalMs=0) = 0.  Audio sought to 0.
   *
   * Fix: globalMsToSegmentLocal returns localMs = globalMs (passthrough) for
   * the single-segment case when cap (= effective or totalMs) is 0.  The
   * audio element safely clamps out-of-range currentTime to its actual
   * duration.
   *
   * This test keeps el.duration=Infinity throughout (the el.duration fallback
   * path does NOT fire) so the only fix path exercised is the passthrough in
   * globalMsToSegmentLocal.
   */
  it("sets currentTime to scrubbed position (not 0) when storedTotal=0, measuredTotal=0, el.duration=Infinity", async () => {
    const savedFetch = global.fetch;
    // durationMs=60000 drives totalMs ≥ 53460 so the user can scrub there.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-01-01T00:00:00.000Z",
          durationMs: 60_000,
          events: [],
        }),
    }) as unknown as typeof fetch;

    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    let currentTime = 0;
    let srcAttr = "";

    // el.duration stays Infinity — the WebM scan was aborted; Chrome never
    // resolved a finite duration.
    Object.defineProperty(audio, "duration", {
      configurable: true,
      get: () => Infinity,
    });
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
    audio.pause = jest.fn();
    Object.defineProperty(audio, "paused", {
      configurable: true,
      get: () => true,
    });

    const { result, unmount } = renderHook(() => {
      const ref = useRef(jest.fn());
      // durationSeconds=0 → storedTotal=0 → audioTimeline.totalMs=0.
      const segments = useMemo(
        () => [
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm;codecs=opus",
            durationSeconds: 0,
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
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // scrubberMax must be ≥ 53460 (driven by log.durationMs=60000).
    expect(result.current.scrubberMax).toBeGreaterThanOrEqual(53460);

    // Simulate: user played the audio to 21 seconds then paused.
    // el.currentTime reflects playback position; el.duration is still Infinity.
    currentTime = 21.007;

    // User scrubs to ~53.46 s — the exact value from Andrew's console log.
    const scrubMs = 53460;
    act(() => {
      result.current.handleScrubPointerDown();
      result.current.handleScrubChange(scrubMs);
      result.current.handleScrubPointerUp(scrubMs);
    });

    // BEFORE fix: globalMsToSegmentLocal returned localMs=Math.min(53460,0)=0
    //             → el.currentTime set to 0.  FAILS: expected > 50.
    // AFTER fix:  passthrough → localMs=53460 → el.currentTime ≈ 53.46.
    expect(currentTime).toBeGreaterThan(50);
    expect(currentTime).toBeLessThan(60);

    // Play must resume from the scrubbed position, not reset to 0.
    act(() => {
      result.current.play();
    });
    expect(currentTime).toBeGreaterThan(50);
    expect(audio.play).toHaveBeenCalled();

    unmount();
    audio.remove();
    global.fetch = savedFetch;
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — scrub pointer-up maps proportionally after duration resolves
// ---------------------------------------------------------------------------
describe("Scrub pointer-up uses resolved duration for proportional mapping (storedTotal=0)", () => {
  /**
   * RED-BEFORE / GREEN-AFTER
   *
   * When storedTotal=0 AND measuredTotal=0 (not yet resolved), every scrub
   * collapses to localMs=0 ("always seeks to 0").  After Fix 1 populates
   * resolvedMaxMsRef, a subsequent scrub should map proportionally into the
   * real audio duration.
   */
  it("seeks to proportional localMs (~half duration) after durationchange resolves (not 0)", async () => {
    const savedFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-01-01T00:00:00.000Z",
          durationMs: 0,
          events: [],
        }),
    }) as unknown as typeof fetch;

    let mockDuration: number = Infinity;
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    let currentTime = 0;
    let srcAttr = "";

    Object.defineProperty(audio, "duration", {
      configurable: true,
      get: () => mockDuration,
    });
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (v: number) => {
        currentTime = v;
      },
    });
    Object.defineProperty(audio, "src", {
      configurable: true,
      get: () => (srcAttr ? new URL(srcAttr, "http://localhost").href : ""),
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

    const { result, unmount } = renderHook(() => {
      const ref = useRef(jest.fn());
      const segments = useMemo(
        () => [
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm;codecs=opus",
            durationSeconds: 0,
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
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // Resolve duration via loadedmetadata + durationchange.
    act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
      mockDuration = 94.741;
      audio.dispatchEvent(new Event("durationchange"));
    });

    await waitFor(() => {
      expect(result.current.scrubberMax).toBeGreaterThan(90_000);
    });

    // Scrub to the halfway point of the resolved scrubberMax.
    const halfMs = Math.round(result.current.scrubberMax / 2);
    act(() => {
      result.current.handleScrubPointerDown();
      result.current.handleScrubChange(halfMs);
      result.current.handleScrubPointerUp(halfMs);
    });

    // localMs must be proportional (~half of 94.741 s ≈ 47 s).
    // BUG (unfixed): currentTime = 0 because measuredTotal was 0 at scrub time.
    // FIX: resolvedMaxMsRef.current = ~94741 → localMs ≈ 47.37 s.
    expect(currentTime).toBeGreaterThan(40);
    expect(currentTime).toBeLessThan(55);

    unmount();
    audio.remove();
    global.fetch = savedFetch;
  });
});

// ---------------------------------------------------------------------------
// Fix 3 — first play with Infinity currentTime corrects before calling play()
// ---------------------------------------------------------------------------
describe("First play with Infinity currentTime does not snap to end", () => {
  /**
   * RED-BEFORE / GREEN-AFTER
   *
   * Chrome's WebM fix sets el.currentTime = 1e101 which is reported back as
   * Infinity.  If the user clicks play before durationchange fires, calling
   * el.play() from Infinity snaps Chrome to the end of the file (observed:
   * AbortError → audio_seeked_event currentTime=94.741 → onEnded fires).
   *
   * Fix: before calling startPlay() in play(), guard !Number.isFinite(el.currentTime)
   * and set el.currentTime = localMs/1000 (= 0 at fresh entry) first.
   */
  it("corrects currentTime to 0 before play() when WebM fix set it to Infinity", async () => {
    const savedFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-01-01T00:00:00.000Z",
          durationMs: 0,
          events: [],
        }),
    }) as unknown as typeof fetch;

    // Manually start with currentTime=Infinity to simulate the 1e101 hack
    // result in Chrome (jsdom doesn't clamp 1e101 to Infinity, so we inject
    // it directly via the getter).
    let currentTime: number = Infinity;
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
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
      get: () => (srcAttr ? new URL(srcAttr, "http://localhost").href : ""),
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

    const applySceneAtRef = { current: jest.fn() };
    const { result, unmount } = renderHook(() => {
      const ref = useRef(applySceneAtRef.current);
      const segments = useMemo(
        () => [
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm;codecs=opus",
            durationSeconds: 0,
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
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // currentTime is Infinity (WebM fix in progress).
    expect(currentTime).toBe(Infinity);

    // User clicks play before durationchange fires.
    act(() => {
      result.current.play();
    });

    // FIX: currentTime must have been corrected to a finite value (0 at fresh entry).
    // BUG (unfixed): currentTime stays Infinity, el.play() snaps to end.
    expect(Number.isFinite(currentTime)).toBe(true);
    expect(currentTime).toBe(0);

    // play() must have been called.
    expect(audio.play).toHaveBeenCalled();

    // Must NOT be at end.
    expect(result.current.isAtEnd).toBe(false);

    unmount();
    audio.remove();
    global.fetch = savedFetch;
  });
});

// ---------------------------------------------------------------------------
// LOADED-RECORDING SEEK: storedTotal=0, measuredTotal=0, el.duration=FINITE
// ---------------------------------------------------------------------------
describe("Loaded recording seek — storedTotal=0, measuredTotal=0, el.duration=21s finite", () => {
  /**
   * RED-BEFORE / GREEN-AFTER
   *
   * Hard-refresh a stored recording whose durationSeconds is null in the DB.
   * Chrome has partially resolved el.duration to a finite value (21s via
   * progressive download buffering) but onDurationResolved has NOT fired
   * (resolvedMaxMs remains 0).  The user played to ~21s then scrubs to 53.46s.
   *
   * Before fix (seek): effectiveMeasured = elDurationMs = 21000.  seek() passes
   *   21000 to globalMsToSegmentLocal which clamps localMs = min(53460, 21000) = 21000.
   *   el.currentTime is set to 21s — not the intended 53.46s. FAILS: expected > 50.
   *
   * Before fix (play): play()'s position-sync reads resolvedMaxMsRef=21000,
   *   computes intendedSec=21s, and moves el.currentTime backwards from 53.46 to 21.
   *
   * Fix (seek): when measured=0, always pass undefined to globalMsToSegmentLocal
   *   (passthrough — let the audio element do its own range-clamping).  Eagerly
   *   update resolvedMaxMsRef AND queue setResolvedMaxMs from el.duration so the
   *   play-loop and scrubberMax stay accurate.
   * Fix (play): add alreadyAtTarget guard — skip position-sync when el.currentTime
   *   is already within 0.5s of the controller's globalMs target (atMs).  This
   *   prevents moving el.currentTime backwards from a valid scrubbed position when
   *   resolvedMaxMs underestimates the true audio length.
   */
  it("sets currentTime to scrubbed position (not clamped to el.duration) when storedTotal=0, el.duration=21s finite", async () => {
    const savedFetch = global.fetch;
    // durationMs=60000 ensures scrubberMax >= 53460 so the scrub target is valid.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-01-01T00:00:00.000Z",
          durationMs: 60_000,
          events: [],
        }),
    }) as unknown as typeof fetch;

    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    let currentTime = 0;
    let srcAttr = "";

    // el.duration is finite (21s) — Chrome resolved it via progressive
    // download buffering, but onDurationResolved has NOT fired (resolvedMaxMs=0).
    // The actual recording may be longer; we only have 21s of metadata so far.
    Object.defineProperty(audio, "duration", {
      configurable: true,
      get: () => 21,
    });
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
    audio.pause = jest.fn();
    Object.defineProperty(audio, "paused", {
      configurable: true,
      get: () => true,
    });

    const { result, unmount } = renderHook(() => {
      const ref = useRef(jest.fn());
      // durationSeconds=0 → storedTotal=0 → audioTimeline.totalMs=0
      const segments = useMemo(
        () => [
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm;codecs=opus",
            durationSeconds: 0,
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
      result.current.audioRef.current = audio;
      audio.src = "/api/audio/admin/rec-1";
    });

    await waitFor(() => {
      expect(result.current.loadState.kind).toBe("ready");
      expect(result.current.replayExcaliRestoreReady).toBe(true);
    });

    // scrubberMax must be >= 53460 (driven by log.durationMs=60000).
    expect(result.current.scrubberMax).toBeGreaterThanOrEqual(53460);

    // Simulate: user played the audio to ~21s then paused.
    // el.duration=21 is the partially-buffered duration reported by Chrome.
    currentTime = 21.007;

    // User scrubs to ~53.46s.  onDurationResolved has NOT fired (measuredTotal=0)
    // but el.duration=21 is finite — the exact scenario from the console evidence.
    const scrubMs = 53460;
    act(() => {
      result.current.handleScrubPointerDown();
      result.current.handleScrubChange(scrubMs);
      result.current.handleScrubPointerUp(scrubMs);
    });

    // BEFORE fix: seek() passes elDurationMs=21000 to globalMsToSegmentLocal
    //             → localMs = min(53460, 21000) = 21000 → el.currentTime = 21s.
    //             FAILS: expected > 50.
    // AFTER fix:  passthrough → localMs = 53460 → el.currentTime ≈ 53.46s.
    expect(currentTime).toBeGreaterThan(50);
    expect(currentTime).toBeLessThan(60);

    // Play must resume from the scrubbed position.  play()'s position-sync
    // must NOT move el.currentTime backwards from 53.46s to intendedSec=21s
    // (the clamped value derived from resolvedMaxMs=21000).
    act(() => {
      result.current.play();
    });
    expect(currentTime).toBeGreaterThan(50);
    expect(audio.play).toHaveBeenCalled();

    unmount();
    audio.remove();
    global.fetch = savedFetch;
  });
});
