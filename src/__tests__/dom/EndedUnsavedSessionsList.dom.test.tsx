/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { EndedUnsavedSessionsList } from "@/app/admin/students/[id]/whiteboard/EndedUnsavedSessionsList";

const studentId = "stu-test-1";
const sessions = [
  {
    id: "wbs-ended-aaa",
    startedAt: new Date("2026-06-01T10:00:00.000Z"),
    endedAt: new Date("2026-06-01T11:00:00.000Z"),
  },
  {
    id: "wbs-ended-bbb",
    startedAt: new Date("2026-06-02T10:00:00.000Z"),
    endedAt: new Date("2026-06-02T12:00:00.000Z"),
  },
];

describe("EndedUnsavedSessionsList", () => {
  it("renders Review affordance linking to workspace review route", () => {
    render(
      <EndedUnsavedSessionsList
        studentId={studentId}
        sessions={sessions}
        totalCount={sessions.length}
      />
    );

    expect(screen.getByRole("heading", { name: "Ended — needs review" })).toBeInTheDocument();

    const reviewLinks = screen.getAllByRole("link", { name: "Review" });
    expect(reviewLinks).toHaveLength(2);
    for (const link of reviewLinks) {
      expect(link).toHaveAttribute(
        "href",
        expect.stringMatching(
          new RegExp(`^/admin/students/${studentId}/whiteboard/wbs-ended-`)
        )
      );
      expect(link).toHaveAttribute("href", expect.stringContaining("/workspace"));
    }

    expect(screen.queryByRole("link", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /End/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing sessions ended in the last 30 days/i)).toBeInTheDocument();
  });

  it("shows older-not-shown footnote when total exceeds displayed sessions", () => {
    render(
      <EndedUnsavedSessionsList
        studentId={studentId}
        sessions={sessions}
        totalCount={5}
      />
    );

    expect(screen.getByText(/\+3 older not shown/i)).toBeInTheDocument();
  });

  it("returns null when there are no sessions", () => {
    const { container } = render(
      <EndedUnsavedSessionsList studentId={studentId} sessions={[]} totalCount={0} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
