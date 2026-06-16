/**
 * @jest-environment jsdom
 */

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  restoreElements: jest.fn((els: unknown[]) => els),
}));
jest.mock("@excalidraw/excalidraw/index.css", () => ({}), { virtual: true });

import { renderHook, act, waitFor } from "@testing-library/react";
import { useRef } from "react";
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
      return useReplayTimelineController({
        eventsBlobUrl: "/api/whiteboard/wbs-test/events",
        audioSegments: [
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm",
            durationSeconds: 10,
          },
        ],
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
