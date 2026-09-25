/**
 * @jest-environment jsdom
 *
 * Unit tests for TwoFactorSetupForm — SMS chooser enable/disable state and
 * phone-collection enrollment step wiring.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TwoFactorSetupForm } from "@/app/admin/settings/2fa/setup/TwoFactorSetupForm";

const mockStartSmsOtpEnrollment = jest.fn();
const mockStartEmailOtpEnrollment = jest.fn();
const mockStartTotpEnrollment = jest.fn();
const mockConfirmTotpEnrollment = jest.fn();
const mockClearPostEnrollCookie = jest.fn();
const mockConfirmEmailOtpEnrollment = jest.fn();
const mockResendEmailOtpEnrollment = jest.fn();
const mockConfirmSmsOtpEnrollment = jest.fn();
const mockResendSmsOtpEnrollment = jest.fn();

jest.mock("@/app/admin/settings/2fa/actions", () => ({
  startSmsOtpEnrollment: (...args: unknown[]) => mockStartSmsOtpEnrollment(...args),
  startEmailOtpEnrollment: (...args: unknown[]) => mockStartEmailOtpEnrollment(...args),
  startTotpEnrollment: (...args: unknown[]) => mockStartTotpEnrollment(...args),
  confirmTotpEnrollment: (...args: unknown[]) => mockConfirmTotpEnrollment(...args),
  clearPostEnrollCookie: (...args: unknown[]) => mockClearPostEnrollCookie(...args),
  confirmEmailOtpEnrollment: (...args: unknown[]) => mockConfirmEmailOtpEnrollment(...args),
  resendEmailOtpEnrollment: (...args: unknown[]) => mockResendEmailOtpEnrollment(...args),
  confirmSmsOtpEnrollment: (...args: unknown[]) => mockConfirmSmsOtpEnrollment(...args),
  resendSmsOtpEnrollment: (...args: unknown[]) => mockResendSmsOtpEnrollment(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

function smsCardButton() {
  return within(screen.getByTestId("tfa-choose-sms")).getByRole("button");
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
});

describe("TwoFactorSetupForm — SMS chooser enable state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStartSmsOtpEnrollment.mockResolvedValue({
      ok: true,
      maskedPhone: "+1•••••1234",
    });
  });

  test("smsEnrollmentAvailable=false disables SMS card with 'SMS not available' label", () => {
    render(<TwoFactorSetupForm smsEnrollmentAvailable={false} />);

    const button = smsCardButton();
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("SMS not available");
  });

  test("smsEnrollmentAvailable=true enables SMS card and opens phone collection on click", async () => {
    const user = userEvent.setup();
    render(<TwoFactorSetupForm smsEnrollmentAvailable={true} />);

    const button = smsCardButton();
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("Set up with text message");

    await user.click(button);

    expect(screen.getByPlaceholderText("(555) 123-4567")).toBeInTheDocument();
    expect(screen.getByTestId("sms-a2p-consent")).toBeInTheDocument();
  });

  test("phone collect step calls startSmsOtpEnrollment and shows code-entry with masked phone", async () => {
    const user = userEvent.setup();
    render(<TwoFactorSetupForm smsEnrollmentAvailable={true} />);

    await user.click(smsCardButton());
    await user.type(screen.getByPlaceholderText("(555) 123-4567"), "5551234567");
    const sendButton = screen.getByRole("button", { name: "Send code" });
    expect(sendButton).toBeDisabled();

    await user.click(screen.getByTestId("sms-a2p-consent"));
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);

    await waitFor(() => {
      expect(mockStartSmsOtpEnrollment).toHaveBeenCalledWith("5551234567", true);
    });

    await waitFor(() => {
      expect(screen.getByText(/we sent a 6-digit code to/i)).toBeInTheDocument();
      expect(screen.getByText("+1•••••1234")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
    });
  });
});
