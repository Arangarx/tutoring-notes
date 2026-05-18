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

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  Excalidraw: function MockExcalidraw(props: {
    excalidrawAPI?: (api: unknown) => void;
  }) {
    React.useEffect(() => {
      props.excalidrawAPI?.({
        updateScene: updateSceneMock,
        addFiles: jest.fn(),
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

/** Rectangle at (−40,−28)+30×20 → bbox center (−25, −18); Phase 0e deterministic camera. */
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

describe("WhiteboardReplay initial viewport (Phase 0e)", () => {
  let gbcrSpy: jest.SpyInstance;

  beforeEach(() => {
    updateSceneMock.mockClear();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(fakeResponse(EVENT_LOG_JSON));

    const viewportRect = new DOMRectReadOnly(0, 0, 800, 600);
    gbcrSpy = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.hasAttribute("data-replay-viewport-metrics")) {
          return viewportRect as DOMRect;
        }
        return new DOMRect(0, 0, 640, 480);
      });
  });

  afterEach(() => {
    gbcrSpy.mockRestore();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("centers scrollX/scrollY from bbox math via updateScene", async () => {
    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb-vp-fit/events"
        title="Viewport test"
      />
    );

    await screen.findByTestId("wb-replay");

    await waitFor(() => {
      expect(updateSceneMock.mock.calls.length).toBeGreaterThan(1);
    });

    type AppCrop = {
      scrollX?: number;
      scrollY?: number;
      zoom?: { value: number };
    };

    const appStates = updateSceneMock.mock.calls
      .map((call) => (call[0] as { appState?: AppCrop }).appState)
      .filter(
        (
          app
        ): app is AppCrop & {
          scrollX: number;
          scrollY: number;
        } =>
          !!app &&
          typeof app.scrollX === "number" &&
          typeof app.scrollY === "number"
      );

    expect(appStates.some((app) => app.zoom?.value === 1)).toBe(true);

    const expectedSx = 800 / 2 - (-25); // −40 + width/2
    const expectedSy = 600 / 2 - (-18); // −28 + height/2
    expect(
      appStates.some(
        (app) =>
          Math.abs(app.scrollX - expectedSx) < 1e-6 &&
          Math.abs(app.scrollY - expectedSy) < 1e-6
      )
    ).toBe(true);
  });

  /**
   * Regression: share-replay route reproduced a layout race where
   * `getBoundingClientRect()` returned 0×0 on the synchronous first attempt
   * (Excalidraw hadn't measured yet). Camera math then returned null and
   * the canvas stayed at default position. We now retry on rAF until a
   * non-zero measurement lands.
   */
  it("retries on requestAnimationFrame when initial measurement is zero", async () => {
    let measurementCalls = 0;
    gbcrSpy.mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-replay-viewport-metrics")) {
        measurementCalls += 1;
        // First call (synchronous attempt) returns 0×0 → null fit, no scroll.
        // Second call (rAF retry) returns real dimensions → fit succeeds.
        if (measurementCalls === 1) return new DOMRectReadOnly(0, 0, 0, 0);
        return new DOMRectReadOnly(0, 0, 800, 600);
      }
      return new DOMRect(0, 0, 640, 480);
    });

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb-vp-retry/events"
        title="Viewport race test"
      />
    );

    await screen.findByTestId("wb-replay");

    type AppCrop = {
      scrollX?: number;
      scrollY?: number;
      zoom?: { value: number };
    };

    await waitFor(() => {
      const fits = updateSceneMock.mock.calls
        .map((call) => (call[0] as { appState?: AppCrop }).appState)
        .filter(
          (app): app is AppCrop & { scrollX: number; scrollY: number } =>
            !!app &&
            typeof app.scrollX === "number" &&
            typeof app.scrollY === "number"
        );
      expect(fits.length).toBeGreaterThan(0);
    });

    expect(measurementCalls).toBeGreaterThanOrEqual(2);
  });
});

describe("WhiteboardReplay timeline-driven viewport events (Phase 5 task 8 tier-c-lite)", () => {
  let gbcrSpy: jest.SpyInstance;

  beforeEach(() => {
    updateSceneMock.mockClear();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;

    const viewportRect = new DOMRectReadOnly(0, 0, 800, 600);
    gbcrSpy = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.hasAttribute("data-replay-viewport-metrics")) {
          return viewportRect as DOMRect;
        }
        return new DOMRect(0, 0, 640, 480);
      });
  });

  afterEach(() => {
    gbcrSpy.mockRestore();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("applies a t=0 viewport event on initial paint (no camera-fit)", async () => {
    // No-audio replay starts at the final frame, so applySceneAt finds
    // any viewport ≤ finalClockMs. With a viewport at t=0 and an event at
    // t=500, the latest one ≤ initialT is the t=0 viewport.
    const log = {
      schemaVersion: 1,
      startedAt: "2026-05-17T19:00:00Z",
      durationMs: 1_000,
      events: [
        { type: "viewport", t: 0, panX: 999, panY: -777, zoom: 0.5 },
        {
          type: "snapshot",
          t: 500,
          elements: [
            {
              id: "rect-tl",
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
    };
    fetchMock.mockResolvedValue(fakeResponse(JSON.stringify(log)));

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb-vp-t0/events"
        title="t=0 viewport"
      />
    );

    await screen.findByTestId("wb-replay");

    type AppCrop = {
      scrollX?: number;
      scrollY?: number;
      zoom?: { value: number };
    };

    await waitFor(() => {
      const apps = updateSceneMock.mock.calls
        .map((c) => (c[0] as { appState?: AppCrop }).appState)
        .filter((a): a is AppCrop => !!a);
      expect(
        apps.some(
          (a) =>
            a.scrollX === 999 &&
            a.scrollY === -777 &&
            a.zoom?.value === 0.5
        )
      ).toBe(true);
    });

    // Camera-fit's bbox-centered scrollX (≈825) must NOT have been pushed.
    const apps = updateSceneMock.mock.calls
      .map((c) => (c[0] as { appState?: AppCrop }).appState)
      .filter((a): a is AppCrop => !!a);
    expect(apps.some((a) => a.scrollX === 825 && a.scrollY === 318)).toBe(false);
  });

  it("falls back to camera-fit when log has no viewport events", async () => {
    fetchMock.mockResolvedValue(fakeResponse(EVENT_LOG_JSON));

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb-vp-none/events"
        title="No viewport events"
      />
    );

    await screen.findByTestId("wb-replay");

    type AppCrop = {
      scrollX?: number;
      scrollY?: number;
      zoom?: { value: number };
    };

    await waitFor(() => {
      const fits = updateSceneMock.mock.calls
        .map((c) => (c[0] as { appState?: AppCrop }).appState)
        .filter(
          (a): a is AppCrop & { scrollX: number; scrollY: number } =>
            !!a &&
            typeof a.scrollX === "number" &&
            typeof a.scrollY === "number"
        );
      const expectedSx = 800 / 2 - -25;
      const expectedSy = 600 / 2 - -18;
      expect(
        fits.some(
          (a) =>
            Math.abs(a.scrollX - expectedSx) < 1e-6 &&
            Math.abs(a.scrollY - expectedSy) < 1e-6
        )
      ).toBe(true);
    });
  });
});
