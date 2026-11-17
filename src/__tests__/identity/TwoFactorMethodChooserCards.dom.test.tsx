/**
 * @jest-environment jsdom
 *
 * Email 2FA chooser: available mail stays the default; unavailable mail
 * is disabled and authenticator is the suggested option.
 */

import { render, screen, within } from "@testing-library/react";

import { TwoFactorMethodChooserCards } from "@/app/admin/settings/2fa/TwoFactorMethodChooserCards";

const noop = () => {};

function renderChooser(emailEnrollmentAvailable: boolean) {
  render(
    <TwoFactorMethodChooserCards
      onChooseEmail={noop}
      onChooseTotp={noop}
      onChooseSms={noop}
      smsEnrollmentAvailable={false}
      emailEnrollmentAvailable={emailEnrollmentAvailable}
      loading={false}
    />
  );
}

describe("TwoFactorMethodChooserCards — email availability", () => {
  it("keeps email as the enabled default when mail can send", () => {
    renderChooser(true);
    const email = screen.getByTestId("tfa-choose-email");
    const button = within(email).getByRole("button");
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("Set up with email");
    expect(email).toHaveTextContent(/Default — we send a 6-digit code/i);
    expect(screen.getByTestId("tfa-choose-totp")).not.toHaveTextContent(/Suggested —/i);
  });

  it("disables email and suggests the authenticator when mail cannot send", () => {
    renderChooser(false);
    const email = screen.getByTestId("tfa-choose-email");
    const button = within(email).getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Email not available");
    expect(email).toHaveTextContent(/Not available yet —/i);

    const totp = screen.getByTestId("tfa-choose-totp");
    expect(totp).toHaveTextContent(/Suggested —/i);
    expect(within(totp).getByRole("button")).toBeEnabled();
    expect(within(totp).getByRole("button")).toHaveTextContent(/authenticator/i);
  });
});
