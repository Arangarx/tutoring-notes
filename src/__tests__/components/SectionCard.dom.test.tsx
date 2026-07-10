/**
 * @jest-environment jsdom
 *
 * Wave B dedupe — SectionCard realm prop preserves admin vs account contracts.
 * Oracle: data-realm on shadcn Card root + structural slots, not implementation constants.
 */

import { render, screen } from "@testing-library/react";

import { SectionCard } from "@/components/SectionCard";

describe("SectionCard", () => {
  test("exports a single SectionCard component (no legacy admin/account aliases)", () => {
    expect(SectionCard).toBeDefined();
    expect(typeof SectionCard).toBe("function");
  });

  test("admin realm renders shadcn card chrome with data-realm=admin", () => {
    render(
      <SectionCard realm="admin" title="Profile">
        <p>admin-body</p>
      </SectionCard>
    );

    const card = document.querySelector('[data-slot="card"][data-realm="admin"]');
    expect(card).not.toBeNull();
    expect(card).toHaveClass("border-border", "bg-card", "shadow-sm");

    const title = document.querySelector('[data-slot="card-title"]');
    expect(title).toHaveClass("text-lg", "font-semibold", "text-foreground");
    expect(title).toHaveTextContent("Profile");

    const content = document.querySelector('[data-slot="card-content"]');
    expect(content).toHaveClass("pt-4");
    expect(screen.getByText("admin-body")).toBeInTheDocument();
  });

  test("account realm renders shadcn card chrome with data-realm=account", () => {
    render(
      <SectionCard realm="account" title="Learners">
        <p>account-body</p>
      </SectionCard>
    );

    const card = document.querySelector('[data-slot="card"][data-realm="account"]');
    expect(card).not.toBeNull();
    expect(card).toHaveClass("border-border", "bg-card", "shadow-sm");

    const title = document.querySelector('[data-slot="card-title"]');
    expect(title).toHaveClass("text-lg", "font-semibold", "text-foreground");
    expect(title).toHaveTextContent("Learners");

    const content = document.querySelector('[data-slot="card-content"]');
    expect(content).toHaveClass("pt-4");
    expect(screen.getByText("account-body")).toBeInTheDocument();
  });

  test("admin and account realms produce distinct data-realm roots for the same title", () => {
    const { unmount: unmountAdmin } = render(
      <SectionCard realm="admin" title="Shared title">
        <span>admin</span>
      </SectionCard>
    );
    expect(document.querySelector('[data-realm="admin"]')).not.toBeNull();
    expect(document.querySelector('[data-realm="account"]')).toBeNull();
    unmountAdmin();

    render(
      <SectionCard realm="account" title="Shared title">
        <span>account</span>
      </SectionCard>
    );
    expect(document.querySelector('[data-realm="account"]')).not.toBeNull();
    expect(document.querySelector('[data-realm="admin"]')).toBeNull();
  });

  test("optional description, actions, contentClassName, and data-testid are forwarded", () => {
    render(
      <SectionCard
        realm="admin"
        title="Billing"
        description="Manage your plan"
        actions={<button type="button">Upgrade</button>}
        contentClassName="p-0"
        data-testid="billing-card"
      >
        <p>billing-body</p>
      </SectionCard>
    );

    expect(screen.getByTestId("billing-card")).toHaveAttribute("data-realm", "admin");
    expect(screen.getByText("Manage your plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade" })).toBeInTheDocument();

    const content = document.querySelector('[data-slot="card-content"]');
    // tailwind-merge: explicit p-0 wins over default pt-4 (admin list cards use contentClassName="p-0")
    expect(content).toHaveClass("p-0");
    expect(content).not.toHaveClass("pt-4");
  });
});
