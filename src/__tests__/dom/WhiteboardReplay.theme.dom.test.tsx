/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import WhiteboardReplay from "@/components/whiteboard/WhiteboardReplay";

jest.mock("@/hooks/useExcalidrawThemeFromSystem", () => ({
  useExcalidrawThemeFromSystem: () => "dark",
}));

const updateSceneMock = jest.fn();
const themePropSpy = jest.fn();

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  Excalidraw: function MockExcalidraw(props: {
    excalidrawAPI?: (api: unknown) => void;
    theme?: string;
  }) {
    themePropSpy(props.theme);
    React.useEffect(() => {
      props.excalidrawAPI?.({
        updateScene: updateSceneMock,
        addFiles: jest.fn(),
        scrollToContent: jest.fn(),
        getAppState: jest.fn(() => ({
          scrollX: 12,
          scrollY: -5,
          zoom: { value: 1 },
        })),
        refresh: jest.fn(),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="mock-replay-excalidraw" />;
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
          id: "rect-theme-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 80,
          height: 40,
          strokeColor: "#fff",
        },
      ],
    },
  ],
});

function fakeResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const status = init.status ?? 200;
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

beforeEach(() => {
  updateSceneMock.mockClear();
  themePropSpy.mockClear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(fakeResponse(EVENT_LOG_JSON));
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("WhiteboardReplay dark theme (post-2026-05-09 play-turns-white fix)", () => {
  it("passes dark theme via the Excalidraw `theme` prop when system hook is dark", async () => {
    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb-theme-test/events"
        title="Theme test"
      />
    );

    await screen.findByTestId("wb-replay");

    expect(screen.queryByText(/Loading whiteboard recording/i)).toBeNull();
    expect(screen.queryByText(/Preparing whiteboard replay engine/i)).toBeNull();

    await waitFor(() => {
      expect(themePropSpy).toHaveBeenCalled();
    });

    // Excalidraw must receive theme="dark" via prop.
    const themePropCalls = themePropSpy.mock.calls.map(
      (c) => c[0] as string | undefined
    );
    expect(themePropCalls.some((t) => t === "dark")).toBe(true);
  });

  /**
   * Regression (Andrew repro 2026-05-09): pushing `viewBackgroundColor`
   * via `updateScene` causes Excalidraw to reset its background when
   * elements transition empty→non-empty in view mode. Canvas was
   * correctly dark on initial paint, then the first stroke arriving
   * flipped the background to white and kept it white.
   *
   * Fix: NEVER push `viewBackgroundColor` via `updateScene`. Theme is
   * driven entirely by the `theme` prop on `<Excalidraw />`. The
   * workspace canvas works correctly with this pattern.
   */
  it("never pushes viewBackgroundColor via updateScene", async () => {
    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb-theme-tick/events"
        title="No-bg-push regression"
      />
    );

    await screen.findByTestId("wb-replay");

    await waitFor(() => {
      expect(updateSceneMock.mock.calls.length).toBeGreaterThan(0);
    });

    type ScenePayload = {
      appState?: { theme?: string; viewBackgroundColor?: string };
      elements?: unknown[];
    };
    const calls = updateSceneMock.mock.calls.map(
      (call) => call[0] as ScenePayload
    );

    for (const p of calls) {
      expect(p.appState?.viewBackgroundColor).toBeUndefined();
    }

    // Sanity: still pushed at least one scene with elements.
    const hadScenePush = calls.some((p) => Array.isArray(p.elements));
    expect(hadScenePush).toBe(true);
  });
});
