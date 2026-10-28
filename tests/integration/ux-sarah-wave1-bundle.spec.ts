/**
 * UX Sarah wave-1 bundle — marketing wordmark, billing defaults/label,
 * known-issues scanability, overflow Sign out clearance.
 *
 * Run integration: npx playwright test tests/integration/ux-sarah-wave1-bundle.spec.ts --project=integration
 * Run chrome item:   npx playwright test tests/integration/ux-sarah-wave1-bundle.spec.ts --project=wb-regression --grep @wb-chrome
 */

import { test, expect } from "@playwright/test";
import {
  openTutorAndStudent,
  seedWbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

test.describe("UX Sarah wave-1 bundle", () => {
  test("A — authed tutor wordmark opens marketing home", async ({ page }) => {
    await page.goto("/admin/students", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin\/students/, { timeout: 15_000 });

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\?view=home/, { timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/?view=home"
    );
    await expect(page.getByRole("heading", { name: /Session notes that write themselves/i })).toBeVisible();
  });

  test("A — authed GET / still lands on role home", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Session notes that write themselves/i })).not.toBeVisible();
  });

  test("B — billing settings default rounding direction is up", async ({ page }) => {
    await page.goto("/admin/settings/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Rounding direction")).toHaveValue("up");
  });

  test("C — known issues section headings scan above body copy", async ({ page }) => {
    await page.goto("/admin/settings/known-issues", { waitUntil: "domcontentloaded" });
    const section = page.getByTestId("known-issues-recently-improved");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const metrics = await section.evaluate((root) => {
      const heading = root.querySelector<HTMLElement>(
        '[data-testid="known-issues-section-heading"]'
      );
      const bullet = root.querySelector<HTMLElement>("li");
      if (!heading || !bullet) return null;
      const headingStyle = getComputedStyle(heading);
      const bulletStyle = getComputedStyle(bullet);
      return {
        headingWeight: Number.parseInt(headingStyle.fontWeight, 10),
        bulletWeight: Number.parseInt(bulletStyle.fontWeight, 10),
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics!.headingWeight).toBeGreaterThan(metrics!.bulletWeight);
  });

  test(
    "D — student overflow Sign out is fully hittable when the menu is scrolled to the end",
    { tag: [TAG.WB_CHROME] },
    async ({ browser }) => {
      test.setTimeout(120_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentViewport: { width: 390, height: 844 },
        studentHasTouch: true,
        studentIsMobile: true,
        ensureFollow: false,
      });
      try {
        const { studentPage } = peers;
        await expect(studentPage.getByTestId("mynk-wb-chrome")).toBeVisible({
          timeout: 90_000,
        });

        const overflowBtn = studentPage.getByTestId("wb-student-topbar-overflow");
        await expect(overflowBtn).toBeVisible({ timeout: 30_000 });
        await overflowBtn.click();

        const dropdown = studentPage.getByTestId("wb-topbar-overflow-dropdown");
        await expect(dropdown).toBeVisible({ timeout: 10_000 });

        const scroll = dropdown.locator(".mynk-wb-menu-scroll__scroller");
        const signOut = dropdown.getByTestId("learner-sign-out");
        const cue = dropdown.getByTestId("wb-session-menu-more-below");

        // Not at the end: the menu scrolls, so the cue is present.
        const roomBelow = await scroll.evaluate(
          (el) => el.scrollHeight - el.scrollTop - el.clientHeight
        );
        expect(roomBelow, "session menu must scroll so the cue can show").toBeGreaterThan(4);
        await expect(cue).toBeVisible();

        await scroll.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await expect(cue).toHaveCount(0);

        // Last item (Sign out) sits fully inside the scroll box.
        const scrollBox = await scroll.boundingBox();
        const signOutBox = await signOut.boundingBox();
        expect(scrollBox).not.toBeNull();
        expect(signOutBox).not.toBeNull();
        expect(signOutBox!.y).toBeGreaterThanOrEqual(scrollBox!.y - 1);
        expect(signOutBox!.x).toBeGreaterThanOrEqual(scrollBox!.x - 1);
        expect(signOutBox!.x + signOutBox!.width).toBeLessThanOrEqual(
          scrollBox!.x + scrollBox!.width + 1
        );
        expect(signOutBox!.y + signOutBox!.height).toBeLessThanOrEqual(
          scrollBox!.y + scrollBox!.height + 1
        );

        // Center of Sign out hits Sign out — nothing covering it.
        const hit = await studentPage.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          const row = el?.closest('[data-testid="learner-sign-out"]');
          return {
            hitSignOut: row !== null && row !== undefined,
            testId:
              el?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
          };
        }, {
          x: signOutBox!.x + signOutBox!.width / 2,
          y: signOutBox!.y + signOutBox!.height / 2,
        });
        expect(hit.hitSignOut, `elementFromPoint hit ${hit.testId}`).toBe(true);
      } finally {
        await peers.close();
      }
    }
  );
});
