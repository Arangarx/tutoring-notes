/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import TutorNotesSection, {
  noteFieldsAreEmpty,
} from "@/components/whiteboard/TutorNotesSection";
import {
  getTutorNoteStatusAction,
  regenerateNotesAction,
  saveSessionNotesAction,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";

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

  it("a failed note with no stored content keeps an empty editable form and the error", () => {
    renderNotes("failed", null);

    const topics = screen.getByLabelText("Topics covered") as HTMLTextAreaElement;
    expect(topics.value).toBe("");
    expect(topics.readOnly).toBe(false);
    expect(screen.getByTestId("tutor-notes-error")).toHaveTextContent(
      /Note generation failed/i
    );
    expect(screen.getByTestId("wb-regenerate-notes")).toBeInTheDocument();
    expect(screen.getByTestId("wb-save-note")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-delete-session")).not.toBeInTheDocument();
    fireEvent.change(topics, { target: { value: "Factoring practiced by hand" } });
    expect(topicsValue()).toBe("Factoring practiced by hand");
    expect(screen.getByTestId("wb-save-note")).not.toBeDisabled();
  });

  it("a timed-out note keeps an empty editable form and the timeout notice", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-06T15:00:00Z"));
    renderNotes("pending", null);
    await act(async () => {
      jest.setSystemTime(new Date("2026-10-06T15:06:00Z"));
      jest.advanceTimersByTime(4_000);
    });
    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
    const topics = screen.getByLabelText("Topics covered") as HTMLTextAreaElement;
    expect(topics.value).toBe("");
    expect(topics.readOnly).toBe(false);
    expect(screen.getByTestId("wb-regenerate-notes")).toBeInTheDocument();
    expect(screen.getByTestId("wb-save-note")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-delete-session")).not.toBeInTheDocument();
    fireEvent.change(topics, { target: { value: "Factoring practiced by hand" } });
    expect(topicsValue()).toBe("Factoring practiced by hand");
    expect(screen.getByTestId("wb-save-note")).not.toBeDisabled();
    jest.useRealTimers();
  });

  it("a failed replacement shows the stored text and no skeleton", () => {
    renderNotes("failed", ALGEBRA);

    expect(topicsValue()).toBe("Algebra factoring");
    expect(screen.queryByTestId("tn-note-field-skeleton")).not.toBeInTheDocument();
    expect(document.querySelector(".tn-notes-generating-wrap")).toBeNull();
    expect(screen.getByTestId("tutor-notes-error")).toBeInTheDocument();
    expect(screen.getByTestId("wb-save-note")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-delete-session")).not.toBeInTheDocument();
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


describe("TutorNotesSection skipped notes (consent wave C2: notes off settles the card)", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("a skipped note shows the one-line reason and nothing that spins, edits or regenerates", () => {
    renderNotes("skipped", null);

    expect(screen.getByTestId("tutor-notes-skipped")).toHaveTextContent("Notes are off for this session");
    expect(screen.queryByTestId("tutor-notes-generating")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tn-note-field-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tutor-notes-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tutor-notes-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wb-regenerate-notes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wb-save-note")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Topics covered")).not.toBeInTheDocument();
  });

  it("a skipped note is not polled (the poll continues only for pending/generating)", async () => {
    jest.useFakeTimers();
    renderNotes("skipped", null);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(getTutorNoteStatusAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("tutor-notes-skipped")).toBeInTheDocument();
  });

  it.each(["done", "partial", "failed"])("only a skipped note renders the skipped line (status %s does not)", (status) => {
    renderNotes(status, ALGEBRA);
    expect(screen.queryByTestId("tutor-notes-skipped")).not.toBeInTheDocument();
  });

  it.each(["pending", "generating"])("an in-flight note (%s) is not shown as skipped", (status) => {
    renderNotes(status, null);
    expect(screen.queryByTestId("tutor-notes-skipped")).not.toBeInTheDocument();
    expect(screen.getByTestId("tutor-notes-generating")).toBeInTheDocument();
  });
});

describe("TutorNotesSection regenerate clears the earlier Save confirmation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("after Save then Regenerate, '✓ Saved — visible to parent' is gone while regeneration runs and after it fails", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    (saveSessionNotesAction as jest.Mock).mockResolvedValue({ ok: true, noteId: "n1" });
    // Regeneration is refused (for example notes were turned off), so the card stays on the old draft.
    (regenerateNotesAction as jest.Mock).mockResolvedValue({ ok: false, error: "Notes are off for this session" });

    render(
      <TutorNotesSection
        whiteboardSessionId="wbs-regen"
        studentId="stu-1"
        hasAudio={true}
        onSaved={jest.fn()}
        initialNote={{
          found: true,
          status: "done",
          content: ALGEBRA,
          isPartial: false,
          error: null,
          generatedAt: null,
        }}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("wb-save-note"));
    });
    expect(screen.getByTestId("wb-save-note-confirmation")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("wb-regenerate-notes"));
    });

    expect(regenerateNotesAction).toHaveBeenCalledWith("wbs-regen");
    // The old draft is still on screen (regeneration failed), yet the confirmation for the replaced draft is gone.
    expect(topicsValue()).toBe("Algebra factoring");
    expect(screen.queryByTestId("wb-save-note-confirmation")).not.toBeInTheDocument();
  });
});