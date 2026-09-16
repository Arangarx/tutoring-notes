import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_ADMIN } from "../visual/helpers";

test.describe("Calendar OAuth connect stub", () => {
  test.describe.configure({ mode: "serial" });

  test("Connect starts Google OAuth with calendar scopes", async ({ page }) => {
    const prisma = new PrismaClient();
    try {
      const admin = await prisma.adminUser.findUnique({
        where: { email: TEST_ADMIN.email },
      });
      if (admin) {
        await prisma.oAuthCalendarConnection.deleteMany({
          where: { adminUserId: admin.id, provider: "google" },
        });
      }
    } finally {
      await prisma.$disconnect();
    }

    await page.goto("/admin/settings/integrations");
    await page.waitForLoadState("networkidle");

    const connectLink = page.locator('a[href="/api/auth/calendar/connect"]');
    await expect(connectLink).toBeVisible();

    const href = await connectLink.getAttribute("href");
    expect(href).toBe("/api/auth/calendar/connect");

    const response = await page.request.get("/api/auth/calendar/connect", {
      maxRedirects: 0,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);

    const location = response.headers()["location"] ?? "";
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("calendar.events.owned");
    expect(location).not.toContain("calendar.readonly");
  });

  test("connected state shows live sync copy when connection is seeded", async ({ page }) => {
    const prisma = new PrismaClient();
    try {
      const admin = await prisma.adminUser.findUnique({
        where: { email: TEST_ADMIN.email },
      });
      expect(admin).not.toBeNull();
      await prisma.oAuthCalendarConnection.deleteMany({
        where: { adminUserId: admin!.id, provider: "google" },
      });
      await prisma.oAuthCalendarConnection.create({
        data: {
          provider: "google",
          refreshToken: "playwright-seed-refresh",
          email: "seeded-calendar@example.com",
          adminUserId: admin!.id,
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
