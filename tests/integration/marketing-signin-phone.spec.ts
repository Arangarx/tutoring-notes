import { expect, test, type Page } from "@playwright/test";

/** Signed-out header. The integration project storageState is a tutor session. */
const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

const PHONE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const;

const SIGN_IN_MENU_LABELS = [
  "Tutor sign in",
  "Self learner / Parent sign in",
  "Child learner sign in",
] as const;

async function documentDoesNotScrollHorizontally(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect.soft(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe("Marketing homepage phone sign-in", () => {
  test.use({ storageState: EMPTY_STATE });

  test("sign-in menu labels and page stay inside a phone viewport", async ({
    page,
  }) => {
    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      const header = page.getByRole("banner");
      await expect(header).toBeVisible();

      // header contained
      const headerBox = await header.boundingBox();
      expect(headerBox).not.toBeNull();
      expect.soft(headerBox!.x).toBeGreaterThanOrEqual(0);
      expect
        .soft(headerBox!.x + headerBox!.width)
        .toBeLessThanOrEqual(viewport.width);

      // no horizontal scroll
      await documentDoesNotScrollHorizontally(page);

      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const menu = page.getByRole("menu", { name: "Sign in options" });
      await expect(menu).toBeVisible();

      // menu labels
      for (const label of SIGN_IN_MENU_LABELS) {
        await expect
          .soft(menu.getByRole("menuitem", { name: label, exact: true }))
          .toBeVisible();
      }
      await expect
        .soft(menu.getByRole("menuitem", { name: "Parent sign in", exact: true }))
        .toHaveCount(0);
      await expect
        .soft(
          menu.getByRole("menuitem", { name: "Student sign in", exact: true })
        )
        .toHaveCount(0);

      // menu contained
      const menuBox = await menu.boundingBox();
      expect(menuBox).not.toBeNull();
      expect.soft(menuBox!.x).toBeGreaterThanOrEqual(-2);
      expect
        .soft(menuBox!.x + menuBox!.width)
        .toBeLessThanOrEqual(viewport.width + 2);

      for (const label of SIGN_IN_MENU_LABELS) {
        const item = menu.getByRole("menuitem", { name: label, exact: true });
        if ((await item.count()) === 0) continue;
        const textFits = await item.evaluate(
          (el) =>
            el.scrollWidth <= el.clientWidth + 1 &&
            el.scrollHeight <= el.clientHeight + 1
        );
        expect.soft(textFits, `${label} is fully visible`).toBe(true);
      }

      await expect
        .soft(page.getByRole("link", { name: /Self learner \/ Parent/ }))
        .toHaveAttribute("href", "/account/login");

      await page.getByText("Why tutors choose Mynk").scrollIntoViewIfNeeded();
      // no horizontal scroll
      await documentDoesNotScrollHorizontally(page);
    }
  });
});
