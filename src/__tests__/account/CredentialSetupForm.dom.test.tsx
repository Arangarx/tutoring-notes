/**
 * @jest-environment jsdom
 *
 * Credential skip stays available when enforcement is on.
 * Deferring child login is independent of the consent gate (2a7b79af).
 */

import { render, screen } from "@testing-library/react";

import { CredentialSetupForm } from "@/app/claim/[token]/setup/CredentialSetupForm";

describe("CredentialSetupForm — skip stays available under enforcement", () => {
  const baseProps = {
    rawToken: "token-abc",
    learnerProfileId: "lpr-1",
    studentName: "Alex",
  };

  test("shows Set up later when enforcementEnabled", () => {
    render(<CredentialSetupForm {...baseProps} enforcementEnabled={true} />);

    expect(screen.getByRole("link", { name: /set up later/i })).toHaveAttribute(
      "href",
      "/account/dashboard"
    );
  });

  test("shows Set up later link when enforcement is off", () => {
    render(<CredentialSetupForm {...baseProps} enforcementEnabled={false} />);

    expect(screen.getByRole("link", { name: /set up later/i })).toHaveAttribute(
      "href",
      "/account/dashboard"
    );
  });
});
