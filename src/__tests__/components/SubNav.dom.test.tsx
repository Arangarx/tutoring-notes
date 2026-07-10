/**
 * @jest-environment jsdom
 *
 * Wave B dedupe — SubNav realm prop preserves settings sidebar vs account child tabs.
 * Oracle: aria-label, data-realm, layout classes, link hrefs, active semantics — not impl constants.
 */

import { render, screen, within } from "@testing-library/react";

let mockPathname = "/admin/settings/profile";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("SubNav", () => {
  beforeEach(() => {
    mockPathname = "/admin/settings/profile";
  });

  test("legacy SettingsSubNav and AccountChildNav modules are removed (single SubNav canonical)", async () => {
    await expect(
      import("@/components/admin/SettingsSubNav")
    ).rejects.toThrow();
    await expect(
      import("@/app/account/children/[id]/AccountChildNav")
    ).rejects.toThrow();

    const { SubNav } = await import("@/components/SubNav");
    expect(SubNav).toBeDefined();
    expect(typeof SubNav).toBe("function");
  });

  describe("realm=admin-settings", () => {
    test("renders vertical settings sidebar with data-realm and Settings aria-label", async () => {
      const { SubNav } = await import("@/components/SubNav");
      render(<SubNav realm="admin-settings" />);

      const nav = screen.getByRole("navigation", { name: "Settings" });
      expect(nav).toHaveAttribute("data-realm", "admin-settings");
      expect(nav).toHaveClass("flex", "flex-col", "gap-0.5");
      expect(nav).not.toHaveClass("border-b");

      const links = within(nav).getAllByRole("link");
      expect(links).toHaveLength(5);
      expect(links.map((link) => link.textContent)).toEqual([
        "Profile",
        "Billing",
        "Email",
        "Known issues & roadmap",
        "Two-factor auth",
      ]);
    });

    test("marks active settings link with accent-soft pill styling", async () => {
      mockPathname = "/admin/settings/profile";
      const { SubNav } = await import("@/components/SubNav");
      render(<SubNav realm="admin-settings" />);

      const profile = screen.getByRole("link", { name: "Profile" });
      expect(profile).toHaveClass("bg-accent-soft", "text-accent-text");
      expect(profile).not.toHaveAttribute("aria-current");

      const billing = screen.getByRole("link", { name: "Billing" });
      expect(billing).toHaveClass("text-foreground");
      expect(billing).not.toHaveClass("bg-accent-soft");
    });

    test("treats nested settings paths as active for the parent link", async () => {
      mockPathname = "/admin/settings/2fa/setup";
      const { SubNav } = await import("@/components/SubNav");
      render(<SubNav realm="admin-settings" />);

      const twoFa = screen.getByRole("link", { name: "Two-factor auth" });
      expect(twoFa).toHaveClass("bg-accent-soft", "text-accent-text");
    });
  });

  describe("realm=account-child", () => {
    const learnerId = "learner-abc-123";

    test("renders horizontal tab strip with data-realm and Learner sections aria-label", async () => {
      mockPathname = `/account/children/${learnerId}`;
      const { SubNav } = await import("@/components/SubNav");
      render(<SubNav realm="account-child" learnerId={learnerId} />);

      const nav = screen.getByRole("navigation", { name: "Learner sections" });
      expect(nav).toHaveAttribute("data-realm", "account-child");
      expect(nav).toHaveClass(
        "overflow-x-auto",
        "overflow-y-hidden",
        "border-b",
        "border-border"
      );

      const tablist = nav.querySelector(":scope > div");
      expect(tablist).toHaveClass("flex", "min-w-max", "gap-1");

      const links = within(nav).getAllByRole("link");
      expect(links).toHaveLength(4);
      expect(links.map((link) => link.textContent)).toEqual([
        "Profile",
        "Notes",
        "Devices",
        "Privacy",
      ]);
    });

    test("builds learner-scoped hrefs from learnerId", async () => {
      mockPathname = `/account/children/${learnerId}/notes`;
      const { SubNav } = await import("@/components/SubNav");
      render(<SubNav realm="account-child" learnerId={learnerId} />);

      expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
        "href",
        `/account/children/${learnerId}`
      );
      expect(screen.getByRole("link", { name: "Notes" })).toHaveAttribute(
        "href",
        `/account/children/${learnerId}/notes`
      );
      expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute(
        "href",
        `/account/children/${learnerId}/devices`
      );
      expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
        "href",
        `/account/children/${learnerId}/consent`
      );
    });

    test("marks active tab with bottom border and aria-current=page", async () => {
      mockPathname = `/account/children/${learnerId}/devices`;
      const { SubNav } = await import("@/components/SubNav");
      render(<SubNav realm="account-child" learnerId={learnerId} />);

      const devices = screen.getByRole("link", { name: "Devices" });
      expect(devices).toHaveClass("border-accent", "text-accent-text");
      expect(devices).toHaveAttribute("aria-current", "page");

      const profile = screen.getByRole("link", { name: "Profile" });
      expect(profile).toHaveClass("border-transparent", "text-muted-foreground");
      expect(profile).not.toHaveAttribute("aria-current");
    });

    test("profile tab is active only on exact learner root, not nested sibling routes", async () => {
      mockPathname = `/account/children/${learnerId}/notes`;
      const { SubNav } = await import("@/components/SubNav");
      render(<SubNav realm="account-child" learnerId={learnerId} />);

      const profile = screen.getByRole("link", { name: "Profile" });
      expect(profile).not.toHaveClass("border-accent");
      expect(profile).not.toHaveAttribute("aria-current");

      const notes = screen.getByRole("link", { name: "Notes" });
      expect(notes).toHaveClass("border-accent", "text-accent-text");
      expect(notes).toHaveAttribute("aria-current", "page");
    });
  });
});
