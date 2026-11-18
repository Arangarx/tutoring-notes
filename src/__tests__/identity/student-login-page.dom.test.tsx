/**
 * @jest-environment jsdom
 *
 * Student sign-in must not tell the child that a handle is a parent-mode
 * account. A mismatch payload shows the same alert as a wrong PIN.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StudentsLoginPage from "@/app/students/login/page";

jest.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({
    mode: "system" as const,
    resolvedTheme: "light" as const,
    setMode: jest.fn(),
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/students/login",
}));

const GENERIC_ALERT = "That username or PIN isn't right. Try again!";
const PARENT_MODE_SENTENCE =
  "This account doesn't use a PIN login. Ask a parent/guardian to sign in instead.";

async function submitHandle(handle: string, pin: string) {
  const user = userEvent.setup();
  render(<StudentsLoginPage />);
  await user.click(screen.getByLabelText("Username"));
  await user.type(screen.getByLabelText("Username"), handle);
  await user.click(screen.getByLabelText("PIN"));
  await user.type(screen.getByLabelText("PIN"), pin);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("student login page — parent-mode handles", () => {
  it("shows the generic wrong-PIN alert when the server reports access_mode_mismatch", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({
        error: "access_mode_mismatch",
        message: "This account does not use PIN login. Ask your parent/guardian to sign in.",
      }),
    } as Response);

    await submitHandle("parentkid@family", "654321");

    await waitFor(() => {
      expect(screen.getByText(GENERIC_ALERT)).toBeInTheDocument();
    });
    expect(screen.queryByText(PARENT_MODE_SENTENCE)).not.toBeInTheDocument();
    expect(screen.queryByText(/does not use PIN login/i)).not.toBeInTheDocument();
  });
});
