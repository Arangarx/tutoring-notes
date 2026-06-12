/**
 * @jest-environment jsdom
 */

/**
 * Gate A6 safe-slice coverage: production `audioSegments[]` path and
 * JSXGraph embeddable rendering in replay (mirrors admin + share pages).
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WhiteboardReplay from "@/components/whiteboard/WhiteboardReplay";
import {
  DEFAULT_GRAPH_BBOX,
  serializeGraphStateJson,
} from "@/lib/whiteboard/graph-state";
import { GRAPH_EMBED_LINK } from "@/lib/whiteboard/insert-asset";
import { toExcalidraw } from "@/lib/whiteboard/excalidraw-adapter";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";

const warmJsxGraphModuleMock = jest.fn();
jest.mock("@/components/whiteboard/GraphEmbeddable", () => {
  const actual = jest.requireActual<
    typeof import("@/components/whiteboard/GraphEmbeddable")
  >("@/components/whiteboard/GraphEmbeddable");
  return {
    ...actual,
    warmJsxGraphModule: (...args: unknown[]) => warmJsxGraphModuleMock(...args),
    GraphEmbeddable: function MockGraphEmbeddable(props: {
      readOnly?: boolean;
    }) {
      return (
        <div
          data-testid="mock-graph-embeddable"
          data-read-only={props.readOnly ? "true" : "false"}
        />
      );
    },
  };
});

type ExcalidrawPropsCapture = {
  validateEmbeddable?: (url: string) => true | undefined;
  renderEmbeddable?: (element: unknown) => React.ReactNode;
  excalidrawAPI?: (api: unknown) => void;
};

const excalidrawPropsRef: { current: ExcalidrawPropsCapture | null } = {
  current: null,
};

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  Excalidraw: function MockExcalidraw(props: ExcalidrawPropsCapture) {
    excalidrawPropsRef.current = props;
    React.useEffect(() => {
      props.excalidrawAPI?.({
        updateScene: jest.fn(),
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
    return <div data-testid="mock-replay-excalidraw" />;
  },
  restoreElements: (rough: unknown[]) => rough,
}));
jest.mock("@excalidraw/excalidraw/index.css", () => ({}), { virtual: true });

const originalFetch = global.fetch;
const fetchMock = jest.fn();

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

const GRAPH_STATE_JSON = serializeGraphStateJson({
  bbox: DEFAULT_GRAPH_BBOX,
  expressions: ["sin(x)"],
});

const EVENTS_WITH_GRAPH = JSON.stringify({
  schemaVersion: 1,
  startedAt: "2026-06-11T10:00:00.000Z",
  durationMs: 5_000,
  events: [
    {
      type: "snapshot",
      t: 0,
      elements: [],
    },
    {
      type: "add",
      t: 500,
      element: {
        id: "graph-1",
        type: "graph",
        x: 40,
        y: 60,
        width: 400,
        height: 300,
        graphStateJson: GRAPH_STATE_JSON,
        clientId: "tutor",
      },
    },
  ],
});

const EMPTY_EVENTS = JSON.stringify({
  schemaVersion: 1,
  startedAt: "2026-06-11T10:00:00.000Z",
  durationMs: 0,
  events: [],
});

beforeEach(() => {
  warmJsxGraphModuleMock.mockClear();
  excalidrawPropsRef.current = null;
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("<WhiteboardReplay /> production audioSegments path", () => {
  it("mounts the custom player (Play + range) for multi-segment audioSegments", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(EMPTY_EVENTS, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb_a6/events"
        audioSegments={[
          {
            url: "/api/audio/admin/aud_seg1",
            mimeType: "audio/webm;codecs=opus",
            durationSeconds: 120,
          },
          {
            url: "/api/audio/admin/aud_seg2",
            mimeType: "audio/webm;codecs=opus",
            durationSeconds: 45,
          },
        ]}
      />
    );

    await screen.findByTestId("wb-replay");

    expect(screen.getByTestId("wb-replay-play-toggle")).toHaveTextContent(
      /play/i
    );
    expect(screen.getByTestId("wb-replay-global-seek")).toBeInTheDocument();

    const audio = screen.getByTestId(
      "wb-replay-audio"
    ) as HTMLAudioElement;
    expect(audio.controls).toBe(false);
    expect(audio.getAttribute("src")).toBe("/api/audio/admin/aud_seg1");
    expect(audio.style.display).toBe("none");
  });

  it("prefers audioSegments over deprecated audioBlobUrl when both are set", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(EMPTY_EVENTS, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb_a6/events"
        audioSegments={[
          {
            url: "/api/audio/admin/from_segments",
            mimeType: "audio/mp4",
            durationSeconds: 30,
          },
        ]}
        audioBlobUrl="/api/audio/admin/legacy_blob"
      />
    );

    await screen.findByTestId("wb-replay");

    const audio = screen.getByTestId(
      "wb-replay-audio"
    ) as HTMLAudioElement;
    expect(audio.getAttribute("src")).toBe("/api/audio/admin/from_segments");
  });

  it("shows audio loading hint until segment metadata is ready", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(EMPTY_EVENTS, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb_a6/events"
        audioSegments={[
          {
            url: "/api/audio/admin/aud_seg1",
            mimeType: "audio/webm;codecs=opus",
            durationSeconds: 60,
          },
        ]}
      />
    );

    await screen.findByTestId("wb-replay");
    expect(
      screen.getByText(/audio loading/i)
    ).toBeInTheDocument();

    const audio = screen.getByTestId(
      "wb-replay-audio"
    ) as HTMLAudioElement;
    fireEvent.loadedMetadata(audio);

    await waitFor(() => {
      expect(screen.queryByText(/audio loading/i)).not.toBeInTheDocument();
    });
  });

  it("still mounts replay UI when audioSegments is an empty array (events-only)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-06-11T10:00:00.000Z",
          durationMs: 2_000,
          events: [
            {
              type: "snapshot",
              t: 0,
              elements: [
                {
                  id: "line-1",
                  type: "freehand",
                  x: 0,
                  y: 0,
                  width: 50,
                  height: 50,
                  strokeColor: "#000",
                },
              ],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb_a6/events"
        audioSegments={[]}
      />
    );

    await screen.findByTestId("wb-replay");
    expect(screen.getByTestId("wb-replay-play-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-replay-audio")).not.toBeInTheDocument();
  });
});

describe("<WhiteboardReplay /> graph embeddable replay path", () => {
  it("warms JSXGraph and wires renderEmbeddable for graph elements", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(EVENTS_WITH_GRAPH, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb_graph/events"
        title="Graph replay"
      />
    );

    await screen.findByTestId("wb-replay");
    await screen.findByTestId("mock-replay-excalidraw");

    expect(warmJsxGraphModuleMock).toHaveBeenCalledTimes(1);

    const props = excalidrawPropsRef.current;
    expect(props?.validateEmbeddable).toBe(validateExcalidrawEmbeddable);
    expect(typeof props?.renderEmbeddable).toBe("function");

    const excalGraphEl = toExcalidraw({
      id: "graph-1",
      type: "graph",
      x: 40,
      y: 60,
      width: 400,
      height: 300,
      graphStateJson: GRAPH_STATE_JSON,
    });

    expect(excalGraphEl.link).toBe(GRAPH_EMBED_LINK);
    expect(excalGraphEl.customData?.graphStateJson).toBe(GRAPH_STATE_JSON);

    const rendered = props!.renderEmbeddable!(excalGraphEl);
    const { getByTestId } = render(<>{rendered}</>);
    const embed = getByTestId("mock-graph-embeddable");
    expect(embed).toHaveAttribute("data-read-only", "true");
  });

  it("renderEmbeddable returns null for non-graph embeddables", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(EVENTS_WITH_GRAPH, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <WhiteboardReplay eventsBlobUrl="/api/whiteboard/wb_graph/events" />
    );

    await screen.findByTestId("mock-replay-excalidraw");

    const props = excalidrawPropsRef.current;
    expect(
      props!.renderEmbeddable!({
        link: "https://example.com/other",
        customData: { wbType: "iframe" },
      })
    ).toBeNull();
  });
});
