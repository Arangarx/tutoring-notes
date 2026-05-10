/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import WhiteboardReplay from "@/components/whiteboard/WhiteboardReplay";

jest.mock("@/hooks/useExcalidrawThemeFromSystem", () => ({
  useExcalidrawThemeFromSystem: () => "light",
}));

const updateSceneMock = jest.fn();
const scrollToContentMock = jest.fn();

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  Excalidraw: function MockExcalidraw(props: {
    excalidrawAPI?: (api: unknown) => void;
  }) {
    React.useEffect(() => {
      props.excalidrawAPI?.({
        updateScene: updateSceneMock,
        addFiles: jest.fn(),
        scrollToContent: scrollToContentMock,
        getAppState: jest.fn(() => ({
          scrollX: 0,
          scrollY: 0,
          zoom: { value: 1 },
        })),
        refresh: jest.fn(),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="mock-replay-viewport-excalidraw" />;
  },
  restoreElements: (rough: unknown[]) => rough,
}));
jest.mock("@excalidraw/excalidraw/index.css", () => ({}), { virtual: true });

const originalFetch = global.fetch;
const fetchMock = jest.fn();

const EVENT_LOG_JSON = JSON.stringify({
  schemaVersion: 1,
  startedAt: "2026-05-09T10:00:00.000Z",
  durationMs: 800,
  events: [
    {
      type: "snapshot",
      t: 0,
      elements: [
        {
          id: "rect-vp-1",
          type: "rectangle",
          x: -40,
          y: -28,
          width: 30,
          height: 20,
          strokeColor: "#000",
        },
      ],
    },
  ],
});

function fakeResponse(body: string, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => null,
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

beforeEach(() => {
  updateSceneMock.mockClear();
  scrollToContentMock.mockClear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(fakeResponse(EVENT_LOG_JSON));
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("WhiteboardReplay initial viewport fit (Phase 0d)", () => {
  it("calls scrollToContent after layout settles (RAF ×2 + delayed refit)", async () => {
    const rafFns: FrameRequestCallback[] = [];
    const origRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      rafFns.push(cb);
      return rafFns.length;
    }) as typeof window.requestAnimationFrame;
    try {
      render(
        <WhiteboardReplay
          eventsBlobUrl="/api/whiteboard/wb-vp-fit/events"
          title="Viewport test"
        />
      );

      await screen.findByTestId("wb-replay");

      await waitFor(() => {
        expect(updateSceneMock.mock.calls.length).toBeGreaterThan(0);
      });

      expect(scrollToContentMock).not.toHaveBeenCalled();

      let guard = 0;
      while (rafFns.length > 0 && guard++ < 40) {
        const cb = rafFns.shift()!;
        cb(performance.now());
      }

      await waitFor(() => expect(scrollToContentMock.mock.calls.length).toBeGreaterThanOrEqual(1));

      await new Promise((r) => setTimeout(r, 200));

      expect(scrollToContentMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(scrollToContentMock.mock.calls[0]?.[0]).toBeUndefined();
      expect(scrollToContentMock.mock.calls.at(-1)?.[0]).toBeUndefined();
      for (const call of scrollToContentMock.mock.calls) {
        expect(call[1]).toEqual({
          fitToContent: true,
          animate: false,
        });
      }
    } finally {
      window.requestAnimationFrame = origRaf;
    }
  });
});
