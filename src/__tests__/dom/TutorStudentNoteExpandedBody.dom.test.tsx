/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import {
  TutorStudentNoteExpandedBody,
} from "@/components/notes/TutorStudentNoteExpandedBody";

describe("TutorStudentNoteExpandedBody (Phase 0d)", () => {
  const baseProps = {
    topics: "",
    homework: "",
    assessment: "",
    nextSteps: "",
    linksJson: "[]",
    recordings: [],
  };

  it("shows WB replay link from recording.whiteboardSessionId when note row lacks sessions", () => {
    render(
      <TutorStudentNoteExpandedBody
        {...baseProps}
        studentId="stu-42"
        whiteboardSessions={[]}
        recordings={[
          {
            id: "rec-9",
            mimeType: "audio/webm",
            durationSeconds: 8,
            whiteboardSessionId: "wb-from-rec",
          },
        ]}
      />
    );

    const link = screen.getByRole("link", {
      name: /watch the whiteboard recording/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "/admin/students/stu-42/whiteboard/wb-from-rec"
    );
  });

  it("shows whiteboard replay link when whiteboardSessions is non-empty", () => {
    render(
      <TutorStudentNoteExpandedBody
        {...baseProps}
        studentId="stu-42"
        whiteboardSessions={[{ id: "wb-sess-1" }]}
      />
    );

    const section = screen.getByTestId("tutor-note-wb-links");
    const link = within(section).getByRole("link", {
      name: /watch the whiteboard recording/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "/admin/students/stu-42/whiteboard/wb-sess-1"
    );
  });

  it("omits whiteboard replay link when no whiteboardSessions", () => {
    render(
      <TutorStudentNoteExpandedBody
        {...baseProps}
        studentId="stu-42"
        whiteboardSessions={[]}
      />
    );

    expect(screen.queryByTestId("tutor-note-wb-links")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /watch the whiteboard recording/i })
    ).toBeNull();
  });
});
