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

describe("WhiteboardReplay dark theme (Phase 0c)", () => {
  it("applies dark theme + #121212 on updateScene after initial paint when system hook is dark", async () => {
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

    const lastPayload = updateSceneMock.mock.calls.at(-1)?.[0] as {
      appState?: { theme?: string; viewBackgroundColor?: string };
      elements?: unknown[];
    };

    expect(lastPayload?.appState?.theme).toBe("dark");
    expect(lastPayload?.appState?.viewBackgroundColor).toBe("#121212");
    expect(Array.isArray(lastPayload?.elements)).toBe(true);
    expect((lastPayload?.elements as unknown[]).length).toBeGreaterThan(0);
  });
});
