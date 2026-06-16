/**
 * @jest-environment jsdom
 *
 * Regression test: ReviewBoardThumbnail must pass correct appState to
 * exportToCanvas so the exported PNG matches the live WB theme.
 *
 * Prior bug: viewBackgroundColor was set to EXCALIDRAW_BG_DARK_HEX (#121212)
 * when isDark=true. Excalidraw's THEME_FILTER (invert 93%+hue-rotate) then
 * inverted that dark bg to near-white (#dedede), producing near-invisible
 * strokes on a light background — exactly the "faint strokes on white"
 * symptom Andrew reported.
 *
 * Correct behaviour:
 *   • Dark theme  → exportWithDarkMode:true,  viewBackgroundColor:"#ffffff"
 *     (THEME_FILTER inverts white → near-black bg; inverts #1e293b ink → near-white strokes)
 *   • Light theme → exportWithDarkMode:false, viewBackgroundColor:"#ffffff"
 *     (no filter; white bg; #1e293b ink renders dark → correct)
 *
 * jsdom cannot execute canvas pixel operations, so we assert the OPTIONS
 * object passed to exportToCanvas rather than visual output.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ReviewBoardThumbnail } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/ReviewBoardThumbnail";

// ── Theme mock ────────────────────────────────────────────────────────────────

let mockedResolvedTheme: "light" | "dark" = "dark";

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    mode: "dark" as const,
    resolvedTheme: mockedResolvedTheme,
    setMode: jest.fn(),
  }),
}));

// ── Excalidraw mock ───────────────────────────────────────────────────────────

type ExportToCanvasArgs = {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  maxWidthOrHeight?: number;
  exportPadding?: number;
};

const exportToCanvasMock = jest.fn();

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  exportToCanvas: (...args: unknown[]) => exportToCanvasMock(...args),
  restoreElements: (els: unknown[]) => els,
}));

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const EVENT_LOG_WITH_ELEMENTS = JSON.stringify({
  schemaVersion: 1,
  startedAt: "2026-06-01T10:00:00.000Z",
  durationMs: 1000,
  events: [
    {
      type: "snapshot",
      t: 0,
      elements: [
        {
          id: "line-1",
          type: "freedraw",
          x: 10,
          y: 10,
          width: 50,
          height: 30,
          // Canonical Excalidraw ink: always stored as near-black.
          // Dark-mode display relies on THEME_FILTER to invert this.
          strokeColor: "#1e293b",
          points: [[0, 0], [10, 5], [20, 3]],
        },
      ],
    },
  ],
});

function fakeResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
  } as unknown as Response;
}

// ── Fake canvas returned from exportToCanvas ──────────────────────────────────

function makeFakeCanvas() {
  return {
    toDataURL: jest.fn(() => "data:image/png;base64,fakedata"),
  } as unknown as HTMLCanvasElement;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

const originalFetch = global.fetch;
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

beforeEach(() => {
  exportToCanvasMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(fakeResponse(EVENT_LOG_WITH_ELEMENTS));
  exportToCanvasMock.mockResolvedValue(makeFakeCanvas());
});

afterAll(() => {
  global.fetch = originalFetch;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ReviewBoardThumbnail — exportToCanvas appState for dark/light theme", () => {
  /**
   * RED-BEFORE: In the broken code, dark mode passed
   *   viewBackgroundColor: "#121212" + exportWithDarkMode: true.
   * The THEME_FILTER inverted the dark bg to near-white (#dedede),
   * resulting in near-invisible strokes on a white background.
   *
   * GREEN-AFTER: Dark mode must pass viewBackgroundColor: "#ffffff" (white)
   * so the THEME_FILTER inverts it to near-black.
   */
  it("dark theme: passes exportWithDarkMode=true, theme='dark', viewBackgroundColor='#ffffff'", async () => {
    mockedResolvedTheme = "dark";

    render(
      <ReviewBoardThumbnail
        eventsProxyUrl="/api/whiteboard/thumb-test/events"
        whiteboardSessionId="wbs-thumb-dark"
      />
    );

    await waitFor(() => {
      expect(exportToCanvasMock).toHaveBeenCalled();
    });

    // exportToCanvas is called with a single options object.
    const callArg = exportToCanvasMock.mock.calls[0]?.[0] as ExportToCanvasArgs;
    const { appState } = callArg;

    // exportWithDarkMode=true triggers THEME_FILTER which inverts #1e293b
    // ink to near-white and the white bg to near-black.
    expect(appState.exportWithDarkMode).toBe(true);

    // viewBackgroundColor MUST be white (not dark) — the THEME_FILTER will
    // invert it to near-black. Passing "#121212" here is the prior bug:
    // it would invert to near-white, making strokes nearly invisible.
    expect(appState.viewBackgroundColor).toBe("#ffffff");

    // theme in appState is overridden internally by exportWithDarkMode, but
    // we pass it for intent clarity — assert it's consistent.
    expect(appState.theme).toBe("dark");

    // exportBackground must be true so the background fill is rendered.
    expect(appState.exportBackground).toBe(true);

    // Thumbnail must eventually show as ready (not stuck on loading/error).
    await waitFor(() => {
      expect(screen.getByTestId("wb-review-board-thumbnail")).toBeInTheDocument();
    });
  });

  /**
   * Light mode: no THEME_FILTER; direct white background + dark strokes.
   */
  it("light theme: passes exportWithDarkMode=false, theme='light', viewBackgroundColor='#ffffff'", async () => {
    mockedResolvedTheme = "light";

    render(
      <ReviewBoardThumbnail
        eventsProxyUrl="/api/whiteboard/thumb-test-light/events"
        whiteboardSessionId="wbs-thumb-light"
      />
    );

    await waitFor(() => {
      expect(exportToCanvasMock).toHaveBeenCalled();
    });

    const callArg = exportToCanvasMock.mock.calls[0]?.[0] as ExportToCanvasArgs;
    const { appState } = callArg;

    expect(appState.exportWithDarkMode).toBe(false);
    expect(appState.viewBackgroundColor).toBe("#ffffff");
    expect(appState.theme).toBe("light");
    expect(appState.exportBackground).toBe(true);
  });
});
