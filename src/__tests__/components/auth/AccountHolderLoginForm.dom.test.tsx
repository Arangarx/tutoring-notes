/**
 * @jest-environment jsdom
 *
 * Unit tests for AccountHolderLoginForm — shared login form used by
 * /account/login and /claim/[token] (ClaimAuthGate login panel).
 *
 * Covers error-code mapping from /api/auth/account-holder/login:
 *   - email_not_verified  → verify-email message (the 7b fix)
 *   - invalid_credentials → "Email or password is incorrect"
 *   - network failure     → "Couldn't reach Mynk"
 *   - generic server err  → credentials fallback message
 *
 * [playwright-on-fix: fix 7b — claim login email_not_verified mapping]
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AccountHolderLoginForm } from "@/components/auth/AccountHolderLoginForm";

// Mock next/navigation (required by next/link router context)
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

function renderForm(props: Partial<React.ComponentProps<typeof AccountHolderLoginForm>> = {}) {
  return render(<AccountHolderLoginForm returnTo="/account/dashboard" {...props} />);
}

async function fillAndSubmit(email = "test@example.com", password = "pw") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("AccountHolderLoginForm — error code mapping", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("email_not_verified → shows verify-email message (fix 7b)", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "email_not_verified" }),
    } as Response);

    renderForm();
    await fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText(/please verify your email first/i)
      ).toBeInTheDocument();
    });

    // Must NOT show the generic "something went wrong" message
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    // Must NOT show incorrect-credentials message
    expect(screen.queryByText(/email or password is incorrect/i)).not.toBeInTheDocument();
  });

  test("invalid_credentials from API → shows incorrect-credentials message", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_credentials" }),
    } as Response);

    renderForm();
    await fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText(/email or password is incorrect/i)
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/please verify your email first/i)).not.toBeInTheDocument();
  });

  test("generic server error → shows incorrect-credentials fallback (not verify-email)", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal_server_error" }),
    } as Response);

    renderForm();
    await fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText(/email or password is incorrect/i)
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/please verify your email first/i)).not.toBeInTheDocument();
  });

  test("network failure → shows connection error message", async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));

    renderForm();
    await fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText(/couldn't reach mynk/i)
      ).toBeInTheDocument();
    });
  });

  test("email_not_verified also surfaces in the claim context (forgotPasswordReturnTo set)", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "email_not_verified" }),
    } as Response);

    renderForm({
      returnTo: "/claim/abc123",
      forgotPasswordReturnTo: "/claim/abc123",
      submitLabel: "Sign in to connect Alice",
    });
    await fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText(/please verify your email first/i)
      ).toBeInTheDocument();
    });
  });

  test("onBack button renders and fires when provided", async () => {
    const onBack = jest.fn();
    renderForm({ onBack });
    const backBtn = screen.getByRole("button", { name: /back/i });
    expect(backBtn).toBeInTheDocument();
    await userEvent.setup().click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("Back button absent when onBack not provided", () => {
    renderForm();
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });
});
