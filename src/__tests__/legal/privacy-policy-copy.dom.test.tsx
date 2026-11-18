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

    expect(screen.getByText(/Last updated: November 17, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/Last updated: October 12, 2026/i)).toBeNull();
    expect(screen.queryByText(/24 months after the account is closed/i)).toBeNull();
    expect(screen.queryByText(/grade level/i)).toBeNull();
    expect(
      screen.getByText(/authenticated, session-scoped URLs served through/i)
    ).toBeInTheDocument();
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/Automated retention schedules may be introduced in the future/i);
    expect(body).not.toMatch(/transcribed by OpenAI and the notes are drafted automatically/);
    expect(body).not.toMatch(
      /timestamped stroke logs, optional PDF \/ image inserts, and a session snapshot used for the parent replay surface/
    );
    expect(body).toContain(
      "That is not a general retention schedule for audio, transcripts, or notes."
    );
    expect(body).toContain(
      "When session notes are on, the saved audio is transcribed by OpenAI and the notes are drafted from it."
    );
    expect(body).toContain(
      "Whiteboard session data, when whiteboard recording is on:"
    );
    expect(body).toContain("Mynk completes that request within 30 days.");
    const tfaBullet = screen.getByText("Two-factor authentication.").closest("li");
    expect(tfaBullet).toHaveTextContent(/Teaching accounts require two-factor sign-in/);
    expect(tfaBullet).toHaveTextContent(/The code is emailed by default/);
    expect(tfaBullet).toHaveTextContent(/An authenticator app or a text message is a choice/);
    expect(tfaBullet).toHaveTextContent(/When SMS two-factor is enabled/);
    expect(tfaBullet).toHaveTextContent(/Twilio/);
    expect(tfaBullet).toHaveTextContent(/does not receive student session data/);
    expect(tfaBullet).toHaveTextContent(
      /do not sell or share SMS opt-in data or personal information with third parties for marketing purposes/i
    );
  });

  it("discloses live calendar sync and ICS polling honestly (B8)", () => {
    render(<PrivacyPage />);
    const body = document.body.textContent ?? "";

    expect(body).not.toMatch(/not live yet/i);
    expect(body).not.toMatch(/we do not currently create, update, delete, or watch calendar events/i);
    expect(body).toMatch(/calendar\.events\.owned/);
    expect(body).toMatch(/Google's, Apple's, and Microsoft's calendar services may fetch this feed/i);
    expect(body).toMatch(/first name and last initial/i);
    expect(body).not.toMatch(/opt in per student/i);
    expect(body).toMatch(/does not remove events that were already written to your Google Calendar/i);
  });
});
