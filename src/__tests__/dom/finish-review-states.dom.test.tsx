/**
 * @jest-environment jsdom
 *
 * Finish review stays available when note generation failed, timed out, or
 * finished with no content. Oracle: the control is in the document and its
 * href is the student detail page — not a coordinate or a class name.
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import TutorNotesSection from "@/components/whiteboard/TutorNotesSection";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  getTutorNoteStatusAction: jest.fn(async () => ({ found: false })),
  regenerateNotesAction: jest.fn(),
  saveSessionNotesAction: jest.fn(),
  deleteWhiteboardSessionAndDataAction: jest.fn(),
}));

const STUDENT = "stu-finish";

function expectFinishReview() {
  const link = screen.getByTestId("wb-finish-review");
  expect(link).toHaveTextContent("Finish review");
  expect(link).toHaveAttribute("href", `/admin/students/${STUDENT}`);
}

describe("Finish review in note-generation failure states", () => {
  it("stays available when generation failed", () => {
    render(
      <TutorNotesSection
        whiteboardSessionId="wbs-failed"
        studentId={STUDENT}
        hasAudio
        showFinishReview
        initialNote={{
          found: true,
          status: "failed",
          content: null,
          isPartial: false,
          error: "upstream",
          generatedAt: null,
        }}
      />
    );
    expect(screen.getByTestId("tutor-notes-error")).toHaveTextContent(
      /Note generation failed/i
    );
    expectFinishReview();
  });

  it("stays available when the note is done but empty", () => {
    render(
      <TutorNotesSection
        whiteboardSessionId="wbs-empty"
        studentId={STUDENT}
        hasAudio={false}
        showFinishReview
        initialNote={{
          found: true,
          status: "done",
          content: null,
          isPartial: false,
          error: null,
          generatedAt: null,
        }}
      />
    );
    expect(screen.getByText(/content is empty/i)).toBeInTheDocument();
    expectFinishReview();
  });

  it("stays available after generation times out", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-06T15:00:00Z"));
    render(
      <TutorNotesSection
        whiteboardSessionId="wbs-timeout"
        studentId={STUDENT}
        hasAudio
        showFinishReview
        initialNote={{
          found: true,
          status: "pending",
          content: null,
          isPartial: false,
          error: null,
          generatedAt: null,
        }}
      />
    );
    await act(async () => {
      jest.setSystemTime(new Date("2026-10-06T15:06:00Z"));
      jest.advanceTimersByTime(4_000);
    });
    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
    expectFinishReview();
    jest.useRealTimers();
  });
});
