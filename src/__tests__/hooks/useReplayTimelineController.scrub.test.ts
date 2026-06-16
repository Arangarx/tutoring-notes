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
