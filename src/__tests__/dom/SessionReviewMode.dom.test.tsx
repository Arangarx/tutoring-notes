/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionReviewMode } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/SessionReviewMode";

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    mode: "system" as const,
    resolvedTheme: "light" as const,
    setMode: jest.fn(),
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock(
  "@/components/whiteboard/replay/WhiteboardReplayInFrame",
  () => ({
    WhiteboardReplayInFrame: ({
      onHideReplay,
    }: {
      onHideReplay?: () => void;
    }) => (
      <div data-testid="mock-wb-replay-in-frame">
        Replay
        <button type="button" data-testid="wb-replay-hide" onClick={onHideReplay}>
          Hide replay
        </button>
      </div>
    ),
  })
);

jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/ReviewBoardThumbnail",
  () => ({
    ReviewBoardThumbnail: () => <div data-testid="mock-board-thumbnail" />,
  })
);

const loadSessionReviewPayload = jest.fn();

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  loadSessionReviewPayload: (...args: unknown[]) =>
    loadSessionReviewPayload(...args),
  saveSessionNotesAction: jest.fn(),
  getTutorNoteStatusAction: jest.fn(),
  regenerateNotesAction: jest.fn(),
  deleteWhiteboardSessionAndDataAction: jest.fn(),
}));

const basePayload = {
  studentName: "Alex",
  startedAtIso: "2026-06-01T10:00:00.000Z",
  endedAtIso: "2026-06-01T10:30:00.000Z",
  durationSeconds: 1800,
  hasAudio: true,
  eventCount: 5,
  eventsProxyUrl: "/api/whiteboard/wbs-1/events",
  snapshotProxyUrl: null,
  audioSegments: [
    {
      url: "/api/audio/admin/a1",
      mimeType: "audio/webm",
      durationSeconds: 60,
    },
  ],
  initialNote: {
    found: true,
    status: "done" as const,
    content: JSON.stringify({
      topics: "Algebra",
      assessment: "Good",
      nextSteps: "Practice",
      links: "",
    }),
    isPartial: false,
    error: null,
    generatedAt: "2026-06-01T10:31:00.000Z",
  },
};

beforeEach(() => {
  loadSessionReviewPayload.mockReset();
  loadSessionReviewPayload.mockResolvedValue(basePayload);
});

describe("SessionReviewMode unified surface", () => {
  it("defaults to prominent notes with WB top bar and replay CTA", async () => {
    render(
      <SessionReviewMode whiteboardSessionId="wbs-1" studentId="stu-1" />
    );
    expect(await screen.findByTestId("wb-session-review-mode")).toBeInTheDocument();
    expect(screen.getByTestId("wb-review-wb-topbar")).toBeInTheDocument();
    expect(screen.getByTestId("wb-theme-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("wb-review-notes-prominent")).toBeInTheDocument();
    expect(screen.getByTestId("wb-review-hero-layout")).toBeInTheDocument();
    expect(await screen.findByTestId("wb-review-enter-replay")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-wb-replay-in-frame")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-start-new-session")).not.toBeInTheDocument();
  });

  it("pins replay CTA with a flex-constrained thumbnail wrap in hero board column", async () => {
    render(
      <SessionReviewMode whiteboardSessionId="wbs-1" studentId="stu-1" />
    );
    await screen.findByTestId("wb-review-enter-replay");

    const boardColumn = screen
      .getByTestId("wb-review-board-thumbnail-wrap")
      .parentElement;
    expect(boardColumn).toHaveClass("wb-review-board-column");

    const thumbnailWrap = screen.getByTestId("wb-review-board-thumbnail-wrap");
    expect(thumbnailWrap).toHaveClass("wb-review-board-thumbnail-wrap");

    const replayCta = screen.getByTestId("wb-review-enter-replay");
    expect(replayCta).toHaveClass("wb-review-board-cta");
    expect(thumbnailWrap.compareDocumentPosition(replayCta)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("enters replay with animated state class without dirty confirm", async () => {
    render(
      <SessionReviewMode whiteboardSessionId="wbs-1" studentId="stu-1" />
    );
    await screen.findByTestId("wb-review-enter-replay");
    fireEvent.change(screen.getByLabelText(/Topics covered/i), {
      target: { value: "Edited topic" },
    });
    fireEvent.click(screen.getByTestId("wb-review-enter-replay"));
    await waitFor(() => {
      expect(screen.getByTestId("mock-wb-replay-in-frame")).toBeInTheDocument();
    });
    const root = screen.getByTestId("wb-session-review-mode");
    expect(root).toHaveClass("wb-session-review-root--replay-active");
    expect(screen.getByTestId("wb-replay-persist-wrapper")).toHaveClass(
      "wb-review-replay-pane--visible"
    );
    expect(screen.getByTestId("wb-review-notes-docked")).toBeInTheDocument();
    expect(screen.getByLabelText(/Topics covered/i)).toHaveValue("Edited topic");
    expect(screen.queryByTestId("wb-review-dirty-confirm")).not.toBeInTheDocument();
  });

  it("returns to hero via Hide replay with edits preserved", async () => {
    render(
      <SessionReviewMode whiteboardSessionId="wbs-1" studentId="stu-1" />
    );
    await screen.findByTestId("wb-review-enter-replay");
    fireEvent.change(screen.getByLabelText(/Topics covered/i), {
      target: { value: "Docked edit" },
    });
    fireEvent.click(screen.getByTestId("wb-review-enter-replay"));
    await screen.findByTestId("mock-wb-replay-in-frame");
    fireEvent.click(screen.getByTestId("wb-replay-hide"));
    expect(screen.getByTestId("wb-review-notes-prominent")).toBeInTheDocument();
    expect(screen.getByLabelText(/Topics covered/i)).toHaveValue("Docked edit");
    expect(screen.queryByTestId("wb-replay-back-to-notes")).not.toBeInTheDocument();
  });

  it("shows no recording message when no audio and no events", async () => {
    loadSessionReviewPayload.mockResolvedValue({
      ...basePayload,
      hasAudio: false,
      eventCount: 0,
      audioSegments: [],
    });
    render(
      <SessionReviewMode whiteboardSessionId="wbs-1" studentId="stu-1" />
    );
    expect(await screen.findByTestId("wb-review-no-recording")).toHaveTextContent(
      "No recording available"
    );
  });
});
