/**
 * @jest-environment jsdom
 *
 * Wave B dedupe — PageShell realm prop preserves admin/account/student/share contracts.
 * Oracle: data-page-shell-realm + page-title variant markers, not implementation constants.
 */

import { render, screen } from "@testing-library/react";

import { PageShell } from "@/components/PageShell";

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

describe("PageShell", () => {
  test("admin realm renders page title block and optional sidebar widths", () => {
    render(
      <PageShell
        realm="admin"
        title="Dashboard"
        description="Overview"
        eyebrow="← Back"
        actions={<button type="button">Action</button>}
        sidebar={<nav aria-label="settings">Settings rail</nav>}
        sidebarWidth="narrow"
      >
        <p>admin-body</p>
      </PageShell>
    );

    const root = document.querySelector('[data-page-shell-realm="admin"]');
    expect(root).toHaveClass("flex", "flex-col", "gap-8");

    const titleBlock = document.querySelector('[data-page-title-variant="page"]');
    expect(titleBlock).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toHaveClass(
      "heading",
      "text-3xl",
      "font-normal"
    );
    expect(screen.getByText("Overview")).toHaveClass("max-w-2xl", "text-base", "text-muted-foreground");
    expect(screen.getByText("← Back")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();

    const aside = document.querySelector("aside");
    expect(aside).toHaveClass("md:w-[180px]");
    expect(screen.getByText("admin-body")).toBeInTheDocument();
  });

  test("account realm wraps AppHeader account + page title in max-w-4xl main", () => {
    render(
      <PageShell realm="account" title="Family" userEmail="parent@example.com">
        <p>account-body</p>
      </PageShell>
    );

    expect(document.querySelector('[data-page-shell-realm="account"]')).toHaveClass(
      "min-h-screen",
      "bg-background"
    );
    expect(document.querySelector('[data-app-header-realm="account"]')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Family" })).toBeInTheDocument();
    expect(screen.getByText("account-body")).toBeInTheDocument();

    const main = document.querySelector("main");
    expect(main).toHaveClass("mx-auto", "max-w-4xl", "px-4", "py-8");
  });

  test("student realm renders AppHeader student without page title block", () => {
    render(
      <PageShell realm="student" actions={<span data-testid="student-actions">prefs</span>}>
        <p>student-body</p>
      </PageShell>
    );

    expect(document.querySelector('[data-page-shell-realm="student"]')).toHaveClass(
      "min-h-[100dvh]",
      "flex",
      "flex-col"
    );
    expect(screen.getByTestId("student-page-shell-header")).toBeInTheDocument();
    expect(document.querySelector('[data-page-title-variant="page"]')).toBeNull();
    expect(screen.getByText("student-body")).toBeInTheDocument();
    expect(screen.getByTestId("student-actions")).toBeInTheDocument();
  });

  test("share realm renders share title variant inside max-w-[860px] shell", () => {
    render(
      <PageShell
        realm="share"
        studentName="Alex"
        subtitle="Session notes"
        headerAction={<button type="button">Browse all</button>}
      >
        <p>share-body</p>
      </PageShell>
    );

    const root = document.querySelector('[data-page-shell-realm="share"]');
    expect(root?.tagName).toBe("MAIN");
    expect(root).toHaveClass("min-h-dvh", "bg-background");

    const titleBlock = document.querySelector('[data-page-title-variant="share"]');
    expect(titleBlock).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Alex" })).toHaveClass(
      "text-[22px]",
      "font-bold",
      "md:text-[26px]"
    );
    expect(screen.getByText("Session notes")).toHaveClass("text-sm", "text-muted-foreground");
    expect(screen.getByRole("button", { name: "Browse all" })).toBeInTheDocument();
    expect(screen.getByText("share-body")).toBeInTheDocument();
  });

  test("each realm produces a distinct data-page-shell-realm root", () => {
    const realms = [
      <PageShell key="admin" realm="admin" title="A">
        <span>admin</span>
      </PageShell>,
      <PageShell key="account" realm="account" title="A">
        <span>account</span>
      </PageShell>,
      <PageShell key="student" realm="student">
        <span>student</span>
      </PageShell>,
      <PageShell key="share" realm="share" studentName="A" subtitle="s">
        <span>share</span>
      </PageShell>,
    ] as const;

    for (const node of realms) {
      const { unmount } = render(node);
      const realm = node.props.realm;
      expect(document.querySelector(`[data-page-shell-realm="${realm}"]`)).not.toBeNull();
      for (const other of ["admin", "account", "student", "share"]) {
        if (other !== realm) {
          expect(document.querySelector(`[data-page-shell-realm="${other}"]`)).toBeNull();
        }
      }
      unmount();
    }
  });
});
