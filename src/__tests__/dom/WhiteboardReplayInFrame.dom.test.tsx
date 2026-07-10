/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { WhiteboardReplayInFrame } from "@/components/whiteboard/replay/WhiteboardReplayInFrame";

const MEASURED_END_SEC = 10;

/**
 * WS-W: entry auto-play waits for WebM 1e101 duration scan. jsdom never
 * completes the scan natively — drive loadedmetadata → scan completion so
 * audioDurationSettled opens the entry gate (mirrors scrub.test.ts WS-W).
 */
function setupWebmDurationScanMocks(audio: HTMLAudioElement) {
  let mockDuration: number = Infinity;
  let currentTime = 0;
  let isSeeking = false;
  let completeScan: (() => void) | null = null;
  let isPaused = true;

  Object.defineProperty(audio, "duration", {
    configurable: true,
    get: () => mockDuration,
  });
  Object.defineProperty(audio, "seeking", {
    configurable: true,
    get: () => isSeeking,
  });
  Object.defineProperty(audio, "currentTime", {
    configurable: true,
    get: () => currentTime,
    set: (v: number) => {
      if (v === 1e101) {
        isSeeking = true;
        currentTime = v;
        completeScan = () => {
          currentTime = 0;
          isSeeking = false;
          mockDuration = MEASURED_END_SEC;
          audio.dispatchEvent(new Event("durationchange"));
          audio.dispatchEvent(new Event("seeked"));
        };
        return;
      }
      currentTime = v;
      isSeeking = false;
    },
  });
  Object.defineProperty(audio, "paused", {
    configurable: true,
    get: () => isPaused,
  });
  audio.play = jest.fn().mockImplementation(() => {
    isPaused = false;
    audio.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  audio.pause = jest.fn().mockImplementation(() => {
    isPaused = true;
    audio.dispatchEvent(new Event("pause"));
  });

  return {
    triggerLoadedMetadata: () => {
      act(() => {
        audio.dispatchEvent(new Event("loadedmetadata"));
      });
    },
    completeScanIfPending: () => {
      if (completeScan) {
        act(() => {
          completeScan?.();
        });
      }
    },
  };
}

async function completeWebmDurationScanForReplayTest() {
  const audio = (await screen.findByTestId(
    "wb-replay-audio"
  )) as HTMLAudioElement;
  const scan = setupWebmDurationScanMocks(audio);

  await waitFor(() => {
    scan.triggerLoadedMetadata();
    scan.completeScanIfPending();
    expect(screen.getByTestId("wb-replay-play-toggle")).toHaveTextContent(
      "Pause"
    );
  });
}

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
    const playToggle = screen.getByTestId("wb-replay-play-toggle");
    expect(playToggle).toBeInTheDocument();
    expect(playToggle).toHaveClass("mynk-wb-replay-play-btn");
    expect(screen.getByTestId("wb-replay-global-seek")).toBeInTheDocument();
    expect(screen.getByTestId("wb-replay-global-seek-thumb")).toBeInTheDocument();
    expect(screen.getByTestId("mynk-wb-chrome-replay")).toBeInTheDocument();
    expect(screen.getByTestId("wb-replay-tool-strip")).toBeInTheDocument();
    // Review surface (onHideReplay without override): honest "pause + return to notes".
    expect(screen.getByTestId("wb-replay-hide")).toHaveTextContent(
      "Pause and hide replay"
    );
    await completeWebmDurationScanForReplayTest();

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

  it("honors hideReplayLabel override for non-review surfaces", async () => {
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
        hideReplayLabel="Pause"
      />
    );

    expect(await screen.findByTestId("wb-replay-hide")).toHaveTextContent(
      "Pause"
    );
    expect(screen.getByTestId("wb-replay-hide")).toHaveAttribute(
      "title",
      "Pause"
    );
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
    await completeWebmDurationScanForReplayTest();

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
    // audioDurationResolvedByWebm is monotonic; no second WebM scan needed.
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

    await waitFor(() => {
      expect(screen.getByTestId("wb-replay-play-toggle")).toHaveTextContent(
        "Pause"
      );
    });
  });
});
