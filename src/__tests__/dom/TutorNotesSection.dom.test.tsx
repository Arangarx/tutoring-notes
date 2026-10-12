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

const ALGEBRA = JSON.stringify({
  topics: "Algebra factoring",
  assessment: "Solid grasp of basics",
  nextSteps: "Practice mixed problems",
  links: "",
});

function renderNotes(
  status: string,
  content: string | null,
  opts?: { isPartial?: boolean }
) {
  render(
    <TutorNotesSection
      whiteboardSessionId="wbs-1"
      studentId="stu-1"
      hasAudio={true}
      initialNote={{
        found: true,
        status,
        content,
        isPartial: opts?.isPartial ?? false,
        error: status === "failed" ? "upstream" : null,
        generatedAt: null,
      }}
    />
  );
}

function topicsValue(): string {
  return (screen.getByLabelText("Topics covered") as HTMLTextAreaElement).value;
}

describe("TutorNotesSection loading state", () => {
  it("pending with draft text shows the text and no placeholder", () => {
    renderNotes("pending", ALGEBRA);

    expect(topicsValue()).toBe("Algebra factoring");
    expect(screen.getByTestId("tutor-notes-generating")).toHaveAttribute(
      "data-note-phase",
      "pending"
    );
    expect(screen.getByTestId("tutor-notes-generating").className).not.toContain(
      "tn-notes-generating-wrap"
    );
    expect(screen.queryByTestId("tn-note-field-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("tutor-notes-status")).toHaveTextContent(
      "Preparing your notes..."
    );
    expect(
      (screen.getByLabelText("Topics covered") as HTMLTextAreaElement).readOnly
    ).toBe(true);
    expect(screen.queryByTestId("wb-save-note")).not.toBeInTheDocument();
  });

  it("generating with stored text clears the box and shows the in-box skeleton", () => {
    renderNotes("generating", ALGEBRA);

    expect(topicsValue()).toBe("");
    expect(screen.getByTestId("tutor-notes-generating")).toHaveAttribute(
      "data-note-phase",
      "generating"
    );
    expect(screen.getByTestId("tutor-notes-generating").className).not.toContain(
      "tn-notes-generating-wrap"
    );
    expect(screen.getAllByTestId("tn-note-field-skeleton")).toHaveLength(4);
    expect(screen.getByTestId("tutor-notes-status")).toHaveTextContent("Writing notes…");
    expect(
      (screen.getByLabelText("Topics covered") as HTMLTextAreaElement).readOnly
    ).toBe(true);
    expect(screen.queryByTestId("wb-save-note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tutor-notes-content")).not.toBeInTheDocument();
  });

  it("empty pending and generating fields show an in-box skeleton, not a form-wide wrap", () => {
    const { unmount } = render(
      <TutorNotesSection
        whiteboardSessionId="wbs-empty-pending"
        studentId="stu-1"
        hasAudio={true}
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
    expect(screen.getByTestId("tutor-notes-generating")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByTestId("tutor-notes-generating").className).not.toContain(
      "tn-notes-generating-wrap"
    );
    expect(screen.getAllByTestId("tn-note-field-skeleton").length).toBeGreaterThan(0);
    expect(
      (screen.getByLabelText("Topics covered") as HTMLTextAreaElement).readOnly
    ).toBe(true);
    expect(screen.queryByTestId("wb-save-note")).not.toBeInTheDocument();
    unmount();

    renderNotes("generating", null);
    expect(topicsValue()).toBe("");
    expect(screen.getAllByTestId("tn-note-field-skeleton").length).toBeGreaterThan(0);
    expect(screen.getByTestId("tutor-notes-generating").className).not.toContain(
      "tn-notes-generating-wrap"
    );
    expect(screen.getByTestId("tutor-notes-status")).toHaveTextContent("Writing notes…");
  });

  it("a failed replacement shows the stored text and no skeleton", () => {
    renderNotes("failed", ALGEBRA);

    expect(topicsValue()).toBe("Algebra factoring");
    expect(screen.queryByTestId("tn-note-field-skeleton")).not.toBeInTheDocument();
    expect(document.querySelector(".tn-notes-generating-wrap")).toBeNull();
    expect(screen.getByTestId("tutor-notes-error")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-save-note")).not.toBeInTheDocument();
  });

  it("renders editable form only after generation completes", () => {
    renderNotes(
      "done",
      JSON.stringify({
        topics: "Quadratics",
        assessment: "",
        nextSteps: "",
        links: "",
      })
    );

    expect(screen.queryByTestId("tutor-notes-generating")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tn-note-field-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("tutor-notes-content")).toBeInTheDocument();
    expect(topicsValue()).toBe("Quadratics");
    expect(screen.getByTestId("wb-save-note")).not.toBeDisabled();
  });

  it("partial notes show the text and Save, with no skeleton", () => {
    renderNotes("partial", ALGEBRA, { isPartial: true });

    expect(topicsValue()).toBe("Algebra factoring");
    expect(screen.queryByTestId("tn-note-field-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("wb-save-note")).not.toBeDisabled();
    expect(screen.getByText("Partial transcript")).toBeInTheDocument();
  });

  it("disables save when all note fields are empty", () => {
    renderNotes(
      "done",
      JSON.stringify({
        topics: "",
        assessment: "",
        nextSteps: "",
        links: "",
      })
    );

    expect(
      noteFieldsAreEmpty({
        topics: "",
        assessment: "",
        nextSteps: "",
        links: "",
      })
    ).toBe(true);
    expect(screen.getByTestId("wb-save-note")).toBeDisabled();
  });
});
