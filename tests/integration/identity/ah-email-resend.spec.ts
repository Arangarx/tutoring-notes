import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

test.describe("P1-ID-AHX — account-holder resend confirmation", () => {
  test.use({ storageState: EMPTY_STATE });

  test("unverified login shows resend control; resend creates SIGNUP_VERIFY token", async ({
    page,
  }) => {
    assertLocalDatabaseUrlForHarness();
    const prisma = new PrismaClient();
    const email = `pw-ah-resend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const password = "AhResend!99";

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const holder = await prisma.accountHolder.create({
        data: {
          email,
          passwordHash,
          displayName: "PW AH Resend",
          emailVerifiedAt: null,
        },
        select: { id: true },
      });

      await page.goto("/account/login");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();

      await expect(page.getByText(/please verify your email first/i)).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("button", { name: /resend confirmation email/i }).click();
      await expect(page.getByRole("status")).toContainText(/if that email needs confirmation/i, {
        timeout: 15_000,
      });

      expect(
        await prisma.accountHolderEmailToken.count({
          where: {
            accountHolderId: holder.id,
            purpose: "SIGNUP_VERIFY",
            consumedAt: null,
          },
        })
      ).toBe(1);
    } finally {
      await prisma.accountHolder.deleteMany({ where: { email } });
      await prisma.$disconnect();
    }
  });
});
