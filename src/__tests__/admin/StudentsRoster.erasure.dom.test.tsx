/**
 * @jest-environment jsdom
 *
 * ER-4 — roster list shows pending-erasure badge from server-derived state.
 */

import { render, screen } from "@testing-library/react";

import { StudentsRoster } from "@/components/admin/StudentsRoster";

jest.mock("@/app/admin/students/actions", () => ({
  createStudent: jest.fn(),
}));

describe("StudentsRoster — erasure state", () => {
  it("shows no erasure badge for normal students", () => {
    render(
      <StudentsRoster
        students={[
          {
            id: "stu-1",
            name: "Jordan S.",
            createdAt: "2026-06-01T00:00:00.000Z",
            erasureState: { kind: "none" },
          },
        ]}
      />
    );
    expect(screen.queryByTestId("student-erasure-badge")).not.toBeInTheDocument();
    expect(screen.getByText("Jordan S.")).toBeInTheDocument();
  });

  it("shows Pending erasure badge when LP tombstonedAt drives pending state", () => {
    render(
      <StudentsRoster
        students={[
          {
            id: "stu-2",
            name: "Alex M.",
            createdAt: "2026-06-01T00:00:00.000Z",
            erasureState: {
              kind: "pending_grace",
              purgeEligibleAt: "2026-07-08T12:00:00.000Z",
            },
          },
        ]}
      />
    );
    expect(screen.getByTestId("student-erasure-badge")).toHaveTextContent(
      /pending erasure/i
    );
  });
});
