import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { loginTutorWithPassword } from "./tutor-2fa-login.helpers";
import { TEST_ADMIN } from "../../visual/helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

function uniqueSignupEmail(): string {
  return `pw-allowlist-signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

async function seedAllowlistEmail(email: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const normalized = email.trim().toLowerCase();
  try {
    const operator = await prisma.adminUser.findUnique({
      where: { email: TEST_ADMIN.email },
      select: { id: true },
    });
    if (!operator) {
      throw new Error(`Harness operator ${TEST_ADMIN.email} is missing.`);
    }
    await prisma.tutorEmailAllowlist.upsert({
      where: { email: normalized },
      create: {
        email: normalized,
        createdByAdminId: operator.id,
      },
      update: {
        createdByAdminId: operator.id,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupSignup(email: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const normalized = email.trim().toLowerCase();
  try {
    await prisma.tutorEmailAllowlist.deleteMany({ where: { email: normalized } });
    const admin = await prisma.adminUser.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    if (!admin) return;
    await prisma.adminUserEmailToken.deleteMany({ where: { adminUserId: admin.id } });
    await prisma.adminUser.delete({ where: { id: admin.id } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("P1-ID-ALLOWLIST — pre-approved tutor signup", () => {
  test.use({ storageState: EMPTY_STATE });

  test("allowlisted credentials signup does not land on pending-approval", async ({
    page,
  }) => {
    const email = uniqueSignupEmail();
    const password = "AllowlistSignup!99";
    await seedAllowlistEmail(email);

    try {
      await page.goto("/signup");
      await page.locator("#signup-email").waitFor({ state: "visible", timeout: 30_000 });
      await page.locator("#signup-email").fill(email);
      await page.locator("#signup-password").fill(password);
      await page.locator("#signup-password-confirm").fill(password);
      await page.getByRole("button", { name: /create account/i }).click();

      await page.waitForURL(/\/verify-tutor-email/, { timeout: 30_000 });
      await expect(page.getByTestId("tutor-verify-email-form")).toBeVisible();

      await loginTutorWithPassword(page, { email, password });

      await page.waitForURL(
        (url) => !url.pathname.includes("/admin/pending-approval"),
        { timeout: 30_000 }
      );
      await expect(page).not.toHaveURL(/\/admin\/pending-approval/);
      await expect(page.getByText("Account pending approval")).not.toBeVisible();
    } finally {
      await cleanupSignup(email);
    }
  });

  test("unknown email signup still lands on pending-approval after login", async ({
    page,
  }) => {
    const email = uniqueSignupEmail();
    const password = "WaitlistSignup!99";

    try {
      await page.goto("/signup");
      await page.locator("#signup-email").waitFor({ state: "visible", timeout: 30_000 });
      await page.locator("#signup-email").fill(email);
      await page.locator("#signup-password").fill(password);
      await page.locator("#signup-password-confirm").fill(password);
      await page.getByRole("button", { name: /create account/i }).click();

      await page.waitForURL(/\/verify-tutor-email/, { timeout: 30_000 });
      await loginTutorWithPassword(page, { email, password });
      await page.waitForURL(/\/admin\/pending-approval/, { timeout: 30_000 });
      await expect(page.getByText("Account pending approval")).toBeVisible();
    } finally {
      await cleanupSignup(email);
    }
  });
});
