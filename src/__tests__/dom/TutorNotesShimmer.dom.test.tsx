/**
 * @jest-environment jsdom
 */

/**
 * Notes placeholder contract (Andrew 2026-10-12).
 *
 * While a note is pending or generating and the visible fields are empty,
 * each entry box shows the shared Skeleton primitive. The form-wide
 * `.tn-notes-generating-wrap` overlay must not cover the form.
 *
 * Motion over time is covered by Playwright `tests/integration/wb-notes-shimmer.spec.ts`.
 * This suite checks the render contract jsdom can see, plus a source guard that
 * the invisible-gradient tokens (`--surface-muted` / `--surface-hover`) and the
 * form-wide overlay class do not return.
 */

import fs from "node:fs";
import path from "node:path";

import React from "react";
import { render, screen } from "@testing-library/react";

import TutorNotesSection from "@/components/whiteboard/TutorNotesSection";

const SECTION_PATH = path.resolve(
  __dirname,
  "../../components/whiteboard/TutorNotesSection.tsx"
);
const SHIMMER_CSS_PATH = path.resolve(__dirname, "../../styles/tutor-notes-shimmer.css");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  getTutorNoteStatusAction: jest.fn(),
  regenerateNotesAction: jest.fn(),
  saveSessionNotesAction: jest.fn(),
  deleteWhiteboardSessionAndDataAction: jest.fn(),
}));

function renderGeneratingNotesSection() {
  render(
    <TutorNotesSection
      whiteboardSessionId="wbs-shimmer"
      studentId="stu-shimmer"
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
}

describe("P1-J8 — TutorNotesSection in-box placeholder contract", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("generating with empty fields: in-box skeleton, status copy, no form-wide wrap", () => {
    renderGeneratingNotesSection();

    const generating = screen.getByTestId("tutor-notes-generating");
    expect(generating).toHaveAttribute("aria-busy", "true");
    expect(generating).toHaveAttribute("data-note-phase", "generating");
    expect(generating.className).not.toContain("tn-notes-generating-wrap");
    expect(document.querySelector(".tn-notes-generating-wrap")).toBeNull();
    expect(screen.getByTestId("tutor-notes-status")).toHaveTextContent("Writing notes…");

    const skeletons = screen.getAllByTestId("tn-note-field-skeleton");
    expect(skeletons).toHaveLength(4);
    const topics = screen.getByLabelText("Topics covered");
    const topicsSkeleton = topics.parentElement?.querySelector(
      '[data-testid="tn-note-field-skeleton"]'
    );
    expect(topicsSkeleton).not.toBeNull();
    expect(topicsSkeleton?.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(
      0
    );
    expect(
      topicsSkeleton?.querySelector("[data-slot='skeleton']")?.className ?? ""
    ).toContain("bg-accent");
    expect(
      topicsSkeleton?.querySelector("[data-slot='skeleton']")?.className ?? ""
    ).toContain("motion-reduce:animate-none");

    expect(
      (screen.getByLabelText("Topics covered") as HTMLTextAreaElement).readOnly
    ).toBe(true);
    expect(screen.queryByTestId("wb-save-note")).not.toBeInTheDocument();
  });

  it("RED-BEFORE guard: form-wide overlay and undefined shimmer tokens stay out", () => {
    const src = fs.readFileSync(SECTION_PATH, "utf8");
    expect(src).toContain('from "@/components/ui/skeleton"');
    expect(src).not.toContain("tn-notes-generating-wrap");
    expect(src).not.toContain("--surface-muted");
    expect(src).not.toContain("--surface-hover");
    expect(src).toContain("motion-reduce:animate-none");
    expect(fs.existsSync(SHIMMER_CSS_PATH)).toBe(false);
  });
});
