/**
 * @jest-environment jsdom
 *
 * Calendar titles are first name + last initial. Terms must not describe a
 * removed per-student full-name opt-in, and must agree with Privacy on that point.
 */

import { render, screen } from "@testing-library/react";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

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

function bodyText(): string {
  return document.body.textContent ?? "";
}

describe("terms calendar title honesty", () => {
  it("does not offer a per-student full-name opt-in and states first name + last initial", () => {
    render(<TermsPage />);
    const body = bodyText();
    expect(body).not.toMatch(/opt in per student/i);
    expect(body).toMatch(/first name and last initial/i);
    expect(screen.getByText(/Last updated: October 6, 2026/i)).toBeInTheDocument();
  });

  it("agrees with the privacy policy on calendar titles", () => {
    const { unmount } = render(<TermsPage />);
    const terms = bodyText();
    unmount();
    render(<PrivacyPage />);
    const privacy = bodyText();

    expect(terms).not.toMatch(/opt in per student/i);
    expect(privacy).not.toMatch(/opt in per student/i);
    expect(terms).toMatch(/first name and last initial/i);
    expect(privacy).toMatch(/first name and last initial/i);
    expect(terms).toMatch(/Tutoring — Maya R\./);
    expect(privacy).toMatch(/Tutoring — Maya R\./);
  });
});
