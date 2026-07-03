/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import TutorNotesSection from "@/components/whiteboard/TutorNotesSection";

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
  });
});
