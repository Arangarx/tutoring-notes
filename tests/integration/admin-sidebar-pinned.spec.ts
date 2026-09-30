import { expect, test } from "@playwright/test";

test("admin side nav stays the height of the window while the content column scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/admin/students");

  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav).toBeVisible();

  const scrollRegion = page.locator("[data-admin-scroll-region]");
  await expect(page.locator("footer")).toHaveCount(1);
  await expect(scrollRegion.locator("footer")).toBeVisible();

  await scrollRegion.evaluate((el) => {
    const spacer = document.createElement("div");
    spacer.dataset.testid = "admin-scroll-spacer";
    spacer.style.height = "1600px";
    el.appendChild(spacer);
    el.scrollTop = 700;
  });

  const box = await nav.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  // Pinned to the window: top flush, bottom flush. Content scroll does not move it.
  expect(box!.y).toBeLessThanOrEqual(2);
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport!.height - 2);
  expect(await scrollRegion.evaluate((el) => el.scrollTop)).toBeGreaterThan(600);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
