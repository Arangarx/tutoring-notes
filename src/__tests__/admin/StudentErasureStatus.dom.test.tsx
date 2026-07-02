/**
 * @jest-environment jsdom
 *
 * ER-4 — pending-erasure UI renders from real derived state.
 */

import { render, screen } from "@testing-library/react";

import {
  StudentErasurePendingBadge,
  StudentErasurePendingBanner,
} from "@/components/admin/StudentErasureStatus";

describe("StudentErasurePendingBadge", () => {
  it("renders nothing when erasure state is none", () => {
    const { container } = render(
      <StudentErasurePendingBadge state={{ kind: "none" }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders Pending erasure badge during grace (LP tombstonedAt path)", () => {
    render(
      <StudentErasurePendingBadge
        state={{
          kind: "pending_grace",
          purgeEligibleAt: "2026-07-08T12:00:00.000Z",
        }}
      />
    );
    expect(screen.getByTestId("student-erasure-badge")).toHaveTextContent(
      /pending erasure/i
    );
  });

  it("renders Deleted badge after purge", () => {
    render(<StudentErasurePendingBadge state={{ kind: "purged" }} />);
    expect(screen.getByTestId("student-erasure-badge")).toHaveTextContent(
      /deleted/i
    );
  });
});

describe("StudentErasurePendingBanner", () => {
  it("renders nothing when erasure state is none", () => {
    const { container } = render(
      <StudentErasurePendingBanner state={{ kind: "none" }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders suspended-access banner with grace countdown when pending", () => {
    render(
      <StudentErasurePendingBanner
        state={{
          kind: "pending_grace",
          purgeEligibleAt: "2099-01-01T12:00:00.000Z",
        }}
      />
    );
    const banner = screen.getByTestId("student-erasure-banner");
    expect(banner).toHaveTextContent(/pending erasure/i);
    expect(banner).toHaveTextContent(/access suspended/i);
    expect(banner).toHaveTextContent(/cannot start new sessions/i);
  });

  it("renders post-purge deleted banner", () => {
    render(<StudentErasurePendingBanner state={{ kind: "purged" }} />);
    expect(screen.getByTestId("student-erasure-banner")).toHaveTextContent(
      /permanently removed/i
    );
  });
});
