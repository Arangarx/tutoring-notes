/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { WhiteboardReplayInFrame } from "@/components/whiteboard/replay/WhiteboardReplayInFrame";

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    mode: "system" as const,
    resolvedTheme: "light" as const,
    setMode: jest.fn(),
  }),
}));

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  Excalidraw: () => <div data-testid="mock-excalidraw" />,
}));
jest.mock("@excalidraw/excalidraw/index.css", () => ({}), { virtual: true });

const originalFetch = global.fetch;
const fetchMock = jest.fn();

const sampleLog = {
  schemaVersion: 1,
  startedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 5000,
  events: [
    {
      type: "add",
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

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(sampleLog),
  });
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("WhiteboardReplayInFrame", () => {
  it("mounts replay chrome testids after load", async () => {
    render(
      <WhiteboardReplayInFrame
        eventsBlobUrl="/api/whiteboard/wbs-test/events"
        audioSegments={[
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm",
            durationSeconds: 10,
          },
        ]}
        whiteboardSessionId="wbs-test"
        studentName="Test Student"
        onHideReplay={() => undefined}
      />
    );

    expect(await screen.findByTestId("wb-replay-in-frame")).toBeInTheDocument();
    expect(screen.getByTestId("wb-replay-play-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("wb-replay-global-seek")).toBeInTheDocument();
    expect(screen.getByTestId("wb-replay-global-seek-thumb")).toBeInTheDocument();
    expect(screen.getByTestId("mynk-wb-chrome-replay")).toBeInTheDocument();
    expect(screen.getByTestId("wb-replay-tool-strip")).toBeInTheDocument();
    expect(screen.getByTestId("wb-replay-hide")).toHaveTextContent(
      "Pause and hide replay"
    );
    await waitFor(() => {
      expect(screen.getByTestId("wb-replay-play-toggle")).toHaveTextContent("Pause");
    });

    // Replay records audio + whiteboard only — no live A/V cluster on review surface.
    expect(screen.queryByTestId("av-controls")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/No live A\/V participants yet/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Microphone \(disabled during replay\)/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Camera \(disabled during replay\)/i)
    ).not.toBeInTheDocument();
  });

  /**
   * RED-BEFORE / GREEN-AFTER — in-shell replay stays mounted; hero↔replay toggles
   * via CSS. entryPaintDoneRef must reset when leaving replay so a second
   * "Replay session" click auto-starts from 0 again.
   */
  it("re-enters replay with auto-play from 0 after hide and second activate", async () => {
    const { rerender } = render(
      <WhiteboardReplayInFrame
        embedded
        isReviewActive
        eventsBlobUrl="/api/whiteboard/wbs-test/events"
        audioSegments={[
          {
            url: "/api/audio/admin/rec-1",
            mimeType: "audio/webm",
            durationSeconds: 10,
          },
        ]}
        whiteboardSessionId="wbs-test"
        studentName="Test Student"
        onHideReplay={() => undefined}
      />
    );

    await screen.findByTestId("wb-replay-in-frame");
    await waitFor(() => {
      expect(screen.getByTestId("wb-replay-play-toggle")).toHaveTextContent(
        "Pause"
      );
    });

    // Simulate return-to-hero (replay pane hidden, component stays mounted).
    await act(async () => {
      rerender(
        <WhiteboardReplayInFrame
          embedded
          isReviewActive={false}
          eventsBlobUrl="/api/whiteboard/wbs-test/events"
          audioSegments={[
            {
              url: "/api/audio/admin/rec-1",
              mimeType: "audio/webm",
              durationSeconds: 10,
            },
          ]}
          whiteboardSessionId="wbs-test"
          studentName="Test Student"
          onHideReplay={() => undefined}
        />
      );
    });

    expect(screen.getByTestId("wb-replay-play-toggle")).toHaveTextContent(
      "Play"
    );

    // Second "Replay session" click — isReviewActive true again.
    await act(async () => {
      rerender(
        <WhiteboardReplayInFrame
          embedded
          isReviewActive
          eventsBlobUrl="/api/whiteboard/wbs-test/events"
          audioSegments={[
            {
              url: "/api/audio/admin/rec-1",
              mimeType: "audio/webm",
              durationSeconds: 10,
            },
          ]}
          whiteboardSessionId="wbs-test"
          studentName="Test Student"
          onHideReplay={() => undefined}
        />
      );
    });

    // BUG (unfixed): entryPaintDoneRef still true → stays paused at Play.
    await waitFor(() => {
      expect(screen.getByTestId("wb-replay-play-toggle")).toHaveTextContent(
        "Pause"
      );
    });
  });
});
