/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionReviewMode } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/SessionReviewMode";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock(
  "@/components/whiteboard/replay/WhiteboardReplayInFrame",
  () => ({
    WhiteboardReplayInFrame: () => (
      <div data-testid="mock-wb-replay-in-frame">Replay</div>
    ),
  })
);

jest.mock("@/app/admin/students/[id]/whiteboard/StartWhiteboardSession", () => ({
  StartWhiteboardSession: ({ studentId }: { studentId: string }) => (
    <button type="button" data-testid="mock-start-new-session">
      Start new session ({studentId})
    </button>
  ),
}));

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
  it("defaults to prominent notes with replay CTA", async () => {
    render(
      <SessionReviewMode whiteboardSessionId="wbs-1" studentId="stu-1" />
    );
    expect(await screen.findByTestId("wb-session-review-mode")).toBeInTheDocument();
    expect(screen.getByTestId("wb-review-notes-prominent")).toBeInTheDocument();
    expect(screen.getByTestId("wb-review-hero-layout")).toBeInTheDocument();
    expect(await screen.findByTestId("wb-review-enter-replay")).toBeInTheDocument();
    expect(screen.getByTestId("wb-review-more-menu")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-wb-replay-in-frame")).not.toBeInTheDocument();
  });

  it("enters replay instantly without dirty confirm and keeps notes mounted", async () => {
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
    expect(screen.getByTestId("wb-review-notes-docked")).toBeInTheDocument();
    expect(screen.getByLabelText(/Topics covered/i)).toHaveValue("Edited topic");
    expect(screen.queryByTestId("wb-review-dirty-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wb-review-hero-layout")).not.toBeInTheDocument();
  });

  it("returns to hero with edits preserved", async () => {
    render(
      <SessionReviewMode whiteboardSessionId="wbs-1" studentId="stu-1" />
    );
    await screen.findByTestId("wb-review-enter-replay");
    fireEvent.change(screen.getByLabelText(/Topics covered/i), {
      target: { value: "Docked edit" },
    });
    fireEvent.click(screen.getByTestId("wb-review-enter-replay"));
    await screen.findByTestId("mock-wb-replay-in-frame");
    fireEvent.click(screen.getByTestId("wb-replay-back-to-notes"));
    expect(screen.getByTestId("wb-review-notes-prominent")).toBeInTheDocument();
    expect(screen.getByLabelText(/Topics covered/i)).toHaveValue("Docked edit");
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
