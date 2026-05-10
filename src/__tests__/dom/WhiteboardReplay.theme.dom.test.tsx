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

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  Excalidraw: function MockExcalidraw(props: {
    excalidrawAPI?: (api: unknown) => void;
  }) {
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
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(fakeResponse(EVENT_LOG_JSON));
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("WhiteboardReplay dark theme (Phase 0c + post-2026-05-09 play-turns-white fix)", () => {
  it("at least one updateScene call carries dark theme + #121212 background when system hook is dark", async () => {
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
      expect(updateSceneMock.mock.calls.length).toBeGreaterThan(0);
    });

    type ScenePayload = {
      appState?: { theme?: string; viewBackgroundColor?: string };
      elements?: unknown[];
    };

    const calls = updateSceneMock.mock.calls.map(
      (call) => call[0] as ScenePayload
    );

    // Theme effect / first-paint effect MUST push dark theme + bg at least once.
    const themeCallExists = calls.some(
      (p) =>
        p.appState?.theme === "dark" &&
        p.appState?.viewBackgroundColor === "#121212"
    );
    expect(themeCallExists).toBe(true);

    // Final scene call MUST carry the painted elements.
    const lastWithElements = [...calls]
      .reverse()
      .find((p) => Array.isArray(p.elements));
    expect(lastWithElements).toBeDefined();
    expect((lastWithElements!.elements as unknown[]).length).toBeGreaterThan(0);
  });

  /**
   * Regression: per-frame applySceneAt was pushing
   * appState.viewBackgroundColor on every audio rAF tick. Excalidraw
   * dropped the dark background mid-playback (Andrew repro 2026-05-09:
   * canvas dark on initial paint, hitting Play turned it white). Theme +
   * bg must come from the `theme` prop and the dedicated theme effect
   * only — NOT from per-frame scene paints.
   */
  it("per-frame scene paints do NOT push viewBackgroundColor", async () => {
    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb-theme-tick/events"
        title="Per-frame regression"
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

    // applySceneAt's own updateScene call must NOT carry
    // viewBackgroundColor (post-fix). It carries elements and at most a
    // scrollPreserve appState. The first-paint and theme-transition
    // effects DO push theme + viewBackgroundColor, but those are
    // one-time and not what triggered the play-turns-white regression.
    //
    // Concretely: at least one updateScene call must have elements
    // without viewBackgroundColor. Before the fix, every applySceneAt
    // call carried bg, so no such call would have existed.
    const cleanScenePaint = calls.some(
      (p) =>
        Array.isArray(p.elements) &&
        p.appState?.viewBackgroundColor === undefined
    );
    expect(cleanScenePaint).toBe(true);
  });
});
