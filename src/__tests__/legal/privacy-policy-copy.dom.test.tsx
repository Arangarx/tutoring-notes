/**
 * @jest-environment jsdom
 *
 * SEC-POLICY-TRUTH interim — product privacy facade must not claim automation we lack.
 */

import { render, screen } from "@testing-library/react";
import PrivacyPage from "@/app/privacy/page";

jest.mock("next/link", () => {
  return function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

jest.mock("@/components/marketing/MarketingHeader", () => ({
  MarketingHeader: () => <div data-testid="marketing-header" />,
}));

describe("privacy policy copy (SEC-POLICY-TRUTH interim)", () => {
  it("shows updated date and truthful retention/audio wording", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Last updated: July 9, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/24 months after the account is closed/i)).toBeNull();
    expect(screen.queryByText(/grade level/i)).toBeNull();
    expect(
      screen.getByText(/authenticated, session-scoped URLs served through/i)
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Automated retention schedules may be introduced in the future/i)
        .length
    ).toBeGreaterThanOrEqual(1);
  });
});
