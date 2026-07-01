/**
 * @jest-environment jsdom
 *
 * CC-2 CredentialSetupForm enforcement — T8 skip affordance removal.
 */

import { render, screen } from "@testing-library/react";

import { CredentialSetupForm } from "@/app/claim/[token]/setup/CredentialSetupForm";

describe("CredentialSetupForm — CC-2 enforcement (T8)", () => {
  const baseProps = {
    rawToken: "token-abc",
    learnerProfileId: "lpr-1",
    studentName: "Alex",
  };

  test("T8: hides Set up later link when enforcementEnabled", () => {
    render(<CredentialSetupForm {...baseProps} enforcementEnabled={true} />);

    expect(screen.queryByRole("link", { name: /set up later/i })).not.toBeInTheDocument();
  });

  test("shows Set up later link when enforcement is off", () => {
    render(<CredentialSetupForm {...baseProps} enforcementEnabled={false} />);

    expect(screen.getByRole("link", { name: /set up later/i })).toHaveAttribute(
      "href",
      "/account/dashboard"
    );
  });
});
