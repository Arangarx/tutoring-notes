/**
 * @jest-environment jsdom
 *
 * Email verification codes are sent when the step is reached.
 * The button on that step is Resend, not a first Send.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TwoFactorVerifyForm } from "@/app/admin/settings/2fa/verify/TwoFactorVerifyForm";
import { sendLoginEmailOtp } from "@/app/admin/settings/2fa/actions";

jest.mock("@/app/admin/settings/2fa/actions", () => ({
  sendLoginEmailOtp: jest.fn(),
  sendLoginSmsOtp: jest.fn(),
  verifyEmailOtpCode: jest.fn(),
  verifySmsOtpCode: jest.fn(),
  verifyTotpCode: jest.fn(),
}));

describe("TwoFactorVerifyForm email code", () => {
  beforeEach(() => {
    jest.mocked(sendLoginEmailOtp).mockReset();
    jest.mocked(sendLoginEmailOtp).mockResolvedValue({
      ok: true,
      maskedEmail: "t***t@gmail.com",
    });
  });

  it("shows Resend when a login email code was already issued, without sending again", () => {
    render(
      <TwoFactorVerifyForm
        callbackUrl="/admin"
        method="EMAIL_OTP"
        initialEmailCodeSent
        initialMaskedEmail="t***t@gmail.com"
      />
    );

    expect(screen.getByRole("button", { name: "Resend code" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send verification code" })).toBeNull();
    expect(sendLoginEmailOtp).not.toHaveBeenCalled();
  });

  it("sends an email code when the user switches onto the email step", async () => {
    const user = userEvent.setup();
    render(<TwoFactorVerifyForm callbackUrl="/admin" method="TOTP" />);

    await user.click(screen.getByRole("button", { name: "Email me a code instead" }));

    expect(sendLoginEmailOtp).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Resend code" })).toBeTruthy();
  });
});
