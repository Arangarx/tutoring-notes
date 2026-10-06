/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TwoFactorManageView } from "@/app/admin/settings/2fa/TwoFactorManageView";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/app/admin/settings/2fa/actions", () => ({
  rotateTotpStart: jest.fn(),
  rotateTotpConfirm: jest.fn(),
  regenerateBackupCodes: jest.fn(),
  adminResetTwoFactor: jest.fn(),
  listTrustedDevices: jest.fn().mockResolvedValue({ ok: true, devices: [] }),
  revokeTrustedDevice: jest.fn(),
  revokeAllTrustedDevices: jest.fn(),
  sendLoginEmailOtp: jest.fn(),
  sendLoginSmsOtp: jest.fn(),
  startMethodChangeStepUp: jest.fn().mockResolvedValue({ ok: true }),
  startEmailOtpMethodChange: jest.fn(),
  resendEmailOtpMethodChange: jest.fn(),
  confirmEmailOtpMethodChange: jest.fn(),
  startSmsOtpMethodChange: jest.fn(),
  resendSmsOtpMethodChange: jest.fn(),
  confirmSmsOtpMethodChange: jest.fn(),
  startTotpMethodChange: jest.fn(),
  confirmTotpMethodChange: jest.fn(),
  abandonMethodChange: jest.fn(),
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
});

function consentPrecedesPhone() {
  const consent = screen.getByTestId("sms-a2p-consent");
  const phone = screen.getByLabelText("Phone number");
  const position = consent.compareDocumentPosition(phone);
  expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe("SMS phone + consent on the change-method screen", () => {
  it("puts the consent checkbox above the phone field", async () => {
    const user = userEvent.setup();
    render(
      <TwoFactorManageView
        method="TOTP"
        enrolledAt="2026-01-01T00:00:00.000Z"
        remainingBackupCodes={8}
        isAdmin={false}
        userId="admin-1"
        smsEnrollmentAvailable
      />
    );

    await user.click(screen.getByRole("button", { name: "Change method" }));
    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Set up with text message" }));

    expect(screen.getByTestId("sms-phone-consent-form")).toBeInTheDocument();
    consentPrecedesPhone();
  });
});
