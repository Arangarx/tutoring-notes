/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import TutorNotesSection, {
  noteFieldsAreEmpty,
} from "@/components/whiteboard/TutorNotesSection";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  getTutorNoteStatusAction: jest.fn(),
  regenerateNotesAction: jest.fn(),
  saveSessionNotesAction: jest.fn(),
  deleteWhiteboardSessionAndDataAction: jest.fn(),
}));

describe("TutorNotesSection loading state", () => {
  it("renders skeleton shimmer while notes are generating", () => {
    render(
      <TutorNotesSection
        whiteboardSessionId="wbs-1"
        studentId="stu-1"
        hasAudio={true}
        initialNote={{
          found: true,
          status: "generating",
          content: null,
          isPartial: false,
          error: null,
          generatedAt: null,
        }}
      />
    );

    expect(screen.getByTestId("tutor-notes-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("tutor-notes-content")).not.toBeInTheDocument();
  });

  it("renders editable form only after generation completes", () => {
    render(
      <TutorNotesSection
        whiteboardSessionId="wbs-1"
        studentId="stu-1"
        hasAudio={true}
        initialNote={{
          found: true,
          status: "done",
          content: JSON.stringify({
            topics: "Quadratics",
            assessment: "",
            nextSteps: "",
            links: "",
          }),
          isPartial: false,
          error: null,
          generatedAt: null,
        }}
      />
    );

    expect(screen.queryByTestId("tutor-notes-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("tutor-notes-content")).toBeInTheDocument();
    expect(screen.getByTestId("wb-save-note")).not.toBeDisabled();
  });

  it("disables save when all note fields are empty", () => {
    render(
      <TutorNotesSection
        whiteboardSessionId="wbs-1"
        studentId="stu-1"
        hasAudio={true}
        initialNote={{
          found: true,
          status: "done",
          content: JSON.stringify({
            topics: "",
            assessment: "",
            nextSteps: "",
            links: "",
          }),
          isPartial: false,
          error: null,
          generatedAt: null,
        }}
      />
    );

    expect(noteFieldsAreEmpty({
      topics: "",
      assessment: "",
      nextSteps: "",
      links: "",
    })).toBe(true);
    expect(screen.getByTestId("wb-save-note")).toBeDisabled();
  });
});
