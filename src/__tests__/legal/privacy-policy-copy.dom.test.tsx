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

    expect(screen.getByText(/Last updated: September 16, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/24 months after the account is closed/i)).toBeNull();
    expect(screen.queryByText(/grade level/i)).toBeNull();
    expect(
      screen.getByText(/authenticated, session-scoped URLs served through/i)
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Automated retention schedules may be introduced in the future/i)
        .length
    ).toBeGreaterThanOrEqual(1);
    const tfaBullet = screen.getByText("Two-factor authentication.").closest("li");
    expect(tfaBullet).toHaveTextContent(/email one-time codes or an authenticator app/i);
    expect(tfaBullet).toHaveTextContent(/When SMS two-factor is enabled/);
    expect(tfaBullet).toHaveTextContent(/Twilio/);
    expect(tfaBullet).toHaveTextContent(/does not receive student session data/);
  });

  it("discloses live calendar sync and ICS polling honestly (B8)", () => {
    render(<PrivacyPage />);
    const body = document.body.textContent ?? "";

    expect(body).not.toMatch(/not live yet/i);
    expect(body).not.toMatch(/we do not currently create, update, delete, or watch calendar events/i);
    expect(body).toMatch(/calendar\.events\.owned/);
    expect(body).toMatch(/Google's, Apple's, and Microsoft's calendar services may fetch this feed/i);
    expect(body).toMatch(/first name/i);
    expect(body).toMatch(/opt in per student/i);
    expect(body).toMatch(/does not remove events that were already written to your Google Calendar/i);
  });
});
