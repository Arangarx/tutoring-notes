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

  it("renders visible form with shimmer overlay while notes are generating", () => {

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

    // Generating container is visible — NOT the old skeleton bars
    expect(screen.getByTestId("tutor-notes-generating")).toBeInTheDocument();
    expect(screen.queryByTestId("tutor-notes-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tutor-notes-content")).not.toBeInTheDocument();

    // Form fields ARE in the DOM (visible with shimmer overlay on top)
    expect(screen.getByLabelText("Topics covered")).toBeInTheDocument();
    expect(screen.getByLabelText("Assessment")).toBeInTheDocument();

    // aria-busy on the generating container
    expect(screen.getByTestId("tutor-notes-generating")).toHaveAttribute("aria-busy", "true");

    // Textareas are read-only during generating
    const textarea = screen.getByLabelText("Topics covered") as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);

    // Save button NOT rendered during generating
    expect(screen.queryByTestId("wb-save-note")).not.toBeInTheDocument();

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

    // Done: content container visible; generating container NOT present
    expect(screen.queryByTestId("tutor-notes-generating")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tutor-notes-skeleton")).not.toBeInTheDocument();

    expect(screen.getByTestId("tutor-notes-content")).toBeInTheDocument();

    // Save enabled when at least one field has content
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


