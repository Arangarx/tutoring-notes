/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";

import { ParentJoinGapCallout } from "@/components/account/ParentJoinGapCallout";

describe("ParentJoinGapCallout", () => {
  it("renders honest gap copy and student login link", () => {
    render(<ParentJoinGapCallout />);
    expect(screen.getByTestId("parent-join-gap-callout")).toBeInTheDocument();
    expect(
      screen.getByText(/You can join live sessions for your child/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You do not need their PIN/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Live sessions need the child's own login/)
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /student login page/i })).toHaveAttribute(
      "href",
      "/students/login"
    );
  });

  it("links to setup when setupLoginHref is provided", () => {
    render(
      <ParentJoinGapCallout setupLoginHref="/account/children/abc#child-login" />
    );
    expect(
      screen.getByRole("link", { name: /set up this child's login/i })
    ).toHaveAttribute("href", "/account/children/abc#child-login");
  });
});
