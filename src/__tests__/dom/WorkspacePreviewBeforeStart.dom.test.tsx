/**
 * @jest-environment jsdom
 */

/**
 * DOM tests for `<WorkspacePreviousSessionPreview />` — the workspace
 * surface a tutor sees when reopening an already-ended whiteboard
 * session URL (Phase 1c, Pillar 4 Task 6).
 *
 * What this suite pins:
 *   - Loading state renders before the events fetch resolves.
 *   - On a successful fetch with non-empty events, the scene-paint
 *     engine is invoked: a painter is created, `applyAt` runs once
 *     at the FINAL frame timestamp, and the camera fitter is then
 *     constructed and `fit()` is called.
 *   - The "Start a new whiteboard session" affordance is always
 *     visible so the tutor can mint a fresh session in one click,
 *     regardless of preview load state.
 *   - Empty event log → empty card with snapshot fallback.
 *   - Fetch error → friendly error card, no stack trace, snapshot
 *     fallback when one exists.
 *
 * The Excalidraw canvas itself, the start-session modal, and the
 * scene-paint engine are mocked so this remains a focused
 * integration test of the preview shell wiring.
 */

import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";

// -----------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  Excalidraw: () => null,
  restoreElements: jest.fn((els: unknown[]) => els),
}));
jest.mock("@excalidraw/excalidraw/index.css", () => ({}), { virtual: true });

jest.mock("@/hooks/useExcalidrawThemeFromSystem", () => ({
  useExcalidrawThemeFromSystem: () => "light",
}));

jest.mock("@/app/admin/students/[id]/whiteboard/StartWhiteboardSession", () => ({
  StartWhiteboardSession: ({ studentId }: { studentId: string }) => (
    <button type="button" data-testid="start-new-wb-mock">
      Start whiteboard session for {studentId}
    </button>
  ),
}));

const mockExcalidrawApi = {
  updateScene: jest.fn(),
  getAppState: () => ({}),
} as const;

jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: function MockEx(props: Record<string, unknown>) {
    React.useEffect(() => {
      const cb = props.excalidrawAPI as
        | ((api: unknown) => void)
        | undefined;
      cb?.(mockExcalidrawApi);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="wb-mock-excalidraw-canvas" />;
  },
}));

const applyAtMock = jest.fn(
  (_timeMs: number, _opts?: Record<string, unknown>) => ({
    paintedElements: [{ id: "e1" }],
    newAssetUrls: [] as string[],
    scene: new Map(),
  })
);
const createScenePainterMock = jest.fn((_deps: unknown) => ({
  applyAt: applyAtMock,
  lastSceneElements: [] as readonly unknown[],
  registeredAssetUrls: new Set<string>(),
}));
const cameraFitMock = jest.fn(() => true);
const createCameraFitterMock = jest.fn((_deps: unknown) => ({
  fit: cameraFitMock,
  dispose: jest.fn(),
}));

jest.mock("@/lib/whiteboard/scene-paint", () => {
  const actual = jest.requireActual("@/lib/whiteboard/scene-paint");
  return {
    ...actual,
    createScenePainter: (deps: unknown) => createScenePainterMock(deps),
    createCameraFitter: (deps: unknown) => createCameraFitterMock(deps),
  };
});

// We DO NOT mock parseEventLogBySchema or maxEventTimestampMs — we
// want to exercise the real schema validator + timestamp math.

// -----------------------------------------------------------------
// fetch shim
// -----------------------------------------------------------------

const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  applyAtMock.mockClear();
  createScenePainterMock.mockClear();
  cameraFitMock.mockClear();
  createCameraFitterMock.mockClear();
  mockExcalidrawApi.updateScene.mockClear?.();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

function fakeResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        (init.headers ?? {})[name] ??
        (init.headers ?? {})[name.toLowerCase()] ??
        null,
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

import { WorkspacePreviousSessionPreview } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WorkspacePreviousSessionPreview";

const baseProps = {
  whiteboardSessionId: "wb_old_42",
  studentId: "stu_99",
  studentName: "Andrew Student1",
  startedAtIso: "2026-05-10T18:00:00.000Z",
  endedAtIso: "2026-05-10T18:45:00.000Z",
  durationSeconds: 45 * 60,
  eventsProxyUrl: "/api/whiteboard/wb_old_42/events",
  snapshotProxyUrl: "/api/whiteboard/wb_old_42/snapshot",
  reviewHref: "/admin/students/stu_99/whiteboard/wb_old_42",
} as const;

const NON_EMPTY_LOG = JSON.stringify({
  schemaVersion: 1,
  startedAt: "2026-05-10T18:00:00.000Z",
  durationMs: 60_000,
  events: [
    {
      type: "create",
      tMs: 1_000,
      element: {
        id: "el_1",
        type: "rectangle",
        x: 0,
        y: 0,
        w: 100,
        h: 100,
      },
    },
  ],
});

describe("<WorkspacePreviousSessionPreview />", () => {
  it("renders the Start-new-session affordance immediately, even before fetch resolves", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    render(<WorkspacePreviousSessionPreview {...baseProps} />);
    expect(screen.getByTestId("start-new-wb-mock")).toBeInTheDocument();
    expect(screen.getByText(/loading previous session/i)).toBeInTheDocument();
  });

  it("on success: paints final frame via scene-paint engine and fits camera", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(NON_EMPTY_LOG, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<WorkspacePreviousSessionPreview {...baseProps} />);

    await waitFor(() => {
      expect(createScenePainterMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(applyAtMock).toHaveBeenCalledTimes(1);
    });

    // Final frame == max(durationMs, max event tMs) == 60_000
    const firstCall = applyAtMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0]).toBe(60_000);

    await waitFor(() => {
      expect(createCameraFitterMock).toHaveBeenCalledTimes(1);
    });
    expect(cameraFitMock).toHaveBeenCalledTimes(1);

    // Excalidraw mounted (the in-test mock renders this testid).
    expect(
      await screen.findByTestId("wb-mock-excalidraw-canvas")
    ).toBeInTheDocument();
    // Start-new affordance still present.
    expect(screen.getByTestId("start-new-wb-mock")).toBeInTheDocument();
  });

  it("empty events log → empty-state card + snapshot fallback link, never invokes painter", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-05-10T18:00:00.000Z",
          durationMs: 0,
          events: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(<WorkspacePreviousSessionPreview {...baseProps} />);

    const empty = await screen.findByTestId("wb-preview-empty");
    expect(empty).toHaveTextContent(/nothing was drawn/i);
    expect(screen.getByRole("link", { name: /open last snapshot/i })).toHaveAttribute(
      "href",
      baseProps.snapshotProxyUrl
    );
    expect(createScenePainterMock).not.toHaveBeenCalled();
    expect(applyAtMock).not.toHaveBeenCalled();
    // Start-new affordance still present.
    expect(screen.getByTestId("start-new-wb-mock")).toBeInTheDocument();
  });

  it("fetch error → friendly error card + Start-new still works (no stack trace)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse("server exploded", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      })
    );

    render(<WorkspacePreviousSessionPreview {...baseProps} />);

    const errCard = await screen.findByTestId("wb-preview-error");
    expect(errCard).toHaveTextContent(/could not load previous session/i);
    expect(errCard).toHaveTextContent(/status 502/i);
    // Must not surface the raw error name / stack.
    expect(errCard).not.toHaveTextContent(/at .*\(/);
    expect(createScenePainterMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("start-new-wb-mock")).toBeInTheDocument();
    // Snapshot fallback link present when a snapshot URL is provided.
    expect(
      screen.getByRole("link", { name: /open last snapshot/i })
    ).toHaveAttribute("href", baseProps.snapshotProxyUrl);
  });

  it("error path with no snapshot URL hides the fallback link gracefully", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse("nope", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      })
    );

    render(
      <WorkspacePreviousSessionPreview
        {...baseProps}
        snapshotProxyUrl={null}
      />
    );

    const errCard = await screen.findByTestId("wb-preview-error");
    expect(errCard).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /open last snapshot/i })
    ).not.toBeInTheDocument();
  });

  it("renders an 'Open full replay' link to the review surface", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    render(<WorkspacePreviousSessionPreview {...baseProps} />);
    const replayLink = screen.getByRole("link", { name: /open full replay/i });
    expect(replayLink).toHaveAttribute("href", baseProps.reviewHref);
  });
});
