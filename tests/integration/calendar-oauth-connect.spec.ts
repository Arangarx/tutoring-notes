import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { seedTestAdmin } from "../visual/helpers";

test.describe("Calendar OAuth connect stub @wb-chrome", () => {
  test.describe.configure({ mode: "serial" });

  test(`${TAG.WB_CHROME} Connect starts Google OAuth with calendar scopes`, async ({ page }) => {
    const adminUserId = await seedTestAdmin();
    const prisma = new PrismaClient();
    try {
      await prisma.oAuthCalendarConnection.deleteMany({
        where: { adminUserId, provider: "google" },
      });
      const oauthCount = await prisma.oAuthCalendarConnection.count({
        where: { adminUserId, provider: "google" },
      });
      expect(oauthCount).toBe(0);
    } finally {
      await prisma.$disconnect();
    }

    await page.goto("/admin/settings/integrations");
    await page.waitForLoadState("networkidle");

    const connectLink = page.locator('a[href*="/api/auth/calendar/connect"]');
    await expect(connectLink).toBeVisible();

    const href = await connectLink.getAttribute("href");
    expect(href).toContain("/api/auth/calendar/connect");
    expect(href).toContain(encodeURIComponent("/admin/settings/integrations"));

    const response = await page.request.get("/api/auth/calendar/connect", {
      maxRedirects: 0,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);

    const location = response.headers()["location"] ?? "";
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("calendar.events.owned");
    expect(location).not.toContain("calendar.readonly");
    const origin = new URL(page.url()).origin;
    expect(location).toContain(
      encodeURIComponent(`${origin}/api/auth/calendar/callback`)
    );
  });

  test(`${TAG.WB_CHROME} schedule Connect href returns to /admin/schedule`, async ({ page }) => {
    await page.goto("/admin/schedule");
    await page.waitForLoadState("networkidle");
    const connectLink = page.locator('a[href*="/api/auth/calendar/connect"]');
    await expect(connectLink).toBeVisible();
    const href = await connectLink.getAttribute("href");
    expect(href).toContain(encodeURIComponent("/admin/schedule"));
    expect(href).not.toContain(encodeURIComponent("/admin/settings/integrations"));
  });

  test(`${TAG.WB_CHROME} connected state shows live sync copy when connection is seeded`, async ({
    page,
  }) => {
    const adminUserId = await seedTestAdmin();
    const prisma = new PrismaClient();
    try {
      await prisma.oAuthCalendarConnection.deleteMany({
        where: { adminUserId, provider: "google" },
      });
      await prisma.oAuthCalendarConnection.create({
        data: {
          provider: "google",
          refreshToken: "playwright-seed-refresh",
          email: "seeded-calendar@example.com",
          adminUserId,
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    await page.goto("/admin/settings/integrations");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/sync to your Google Calendar/i).first()
    ).toBeVisible();
    await expect(page.getByText("seeded-calendar@example.com")).toBeVisible();
    await expect(page.getByTestId("calendar-ics-feed-section")).toBeVisible();
    await expect(page.getByText(/webcal/i).first()).toBeVisible();
  });
});
