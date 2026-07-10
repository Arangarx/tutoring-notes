/**
 * @jest-environment jsdom
 *
 * Wave B dedupe — AppHeader realm prop preserves account vs student contracts.
 * Oracle: data-app-header-realm + structural landmarks, not implementation constants.
 */

import { render, screen } from "@testing-library/react";

import { AppHeader } from "@/components/AppHeader";

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    mode: "system" as const,
    resolvedTheme: "light" as const,
    setMode: jest.fn(),
  }),
}));

jest.mock("@/components/account/AccountSignOutButton", () => ({
  AccountSignOutButton: () => (
    <button type="button" data-testid="account-sign-out">
      Sign out
    </button>
  ),
}));

describe("AppHeader", () => {
  test("account realm renders nav chrome with optional email and sign-out", () => {
    render(<AppHeader realm="account" userEmail="parent@example.com" />);

    const nav = document.querySelector('[data-app-header-realm="account"]');
    expect(nav).not.toBeNull();
    expect(nav?.tagName).toBe("NAV");
    expect(nav).toHaveClass("border-b", "bg-card/60", "backdrop-blur-sm");

    expect(screen.getByLabelText("View home page")).toBeInTheDocument();
    expect(screen.getByText("parent@example.com")).toHaveClass(
      "hidden",
      "truncate",
      "text-sm",
      "text-muted-foreground"
    );
    expect(screen.getByTestId("account-sign-out")).toBeInTheDocument();
  });

  test("student realm renders header with student-page-shell-header test id", () => {
    render(
      <AppHeader
        realm="student"
        actions={<button type="button">Preferences</button>}
      />
    );

    const header = screen.getByTestId("student-page-shell-header");
    expect(header).toHaveAttribute("data-app-header-realm", "student");
    expect(header).toHaveClass("border-b", "bg-card", "py-1.5");
    expect(screen.getByLabelText("Mynk home")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preferences" })).toBeInTheDocument();
  });

  test("account and student realms produce distinct data-app-header-realm roots", () => {
    const { unmount: unmountAccount } = render(<AppHeader realm="account" />);
    expect(document.querySelector('[data-app-header-realm="account"]')).not.toBeNull();
    expect(document.querySelector('[data-app-header-realm="student"]')).toBeNull();
    unmountAccount();

    render(<AppHeader realm="student" />);
    expect(document.querySelector('[data-app-header-realm="student"]')).not.toBeNull();
    expect(document.querySelector('[data-app-header-realm="account"]')).toBeNull();
  });
});
