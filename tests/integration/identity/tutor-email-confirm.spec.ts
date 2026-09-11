import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { hashToken, EMAIL_TOKEN_TTL_MS_24H } from "@/lib/crypto/session-tokens";
import { generateRawToken } from "@/lib/crypto/session-tokens";
import { loginTutorWithPassword } from "./tutor-2fa-login.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

test.describe("P1-ID-EVF — tutor confirm-link", () => {
  test.use({ storageState: EMPTY_STATE });

  test("seeded hashed token + GET /verify-email?type=admin lands on /login?verified=1", async ({
    page,
  }) => {
    assertLocalDatabaseUrlForHarness();
    const prisma = new PrismaClient();
    const email = `pw-evf-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const password = "ConfirmLink!99";
    const raw = generateRawToken();

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const admin = await prisma.adminUser.create({
        data: {
          email,
          passwordHash,
          displayName: "PW Confirm Tutor",
          role: "TUTOR",
          approvalStatus: "WAITLISTED",
          isTestAccount: false,
          emailVerifiedAt: null,
        },
        select: { id: true },
      });
      await prisma.adminUserEmailToken.create({
        data: {
          adminUserId: admin.id,
          tokenHash: hashToken(raw),
          purpose: "SIGNUP_VERIFY",
          expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS_24H),
        },
      });

      await page.goto(`/verify-email?type=admin&token=${encodeURIComponent(raw)}`);
      await page.waitForURL(/\/login\?verified=1/, { timeout: 30_000 });
      await expect(page.getByText(/email confirmed/i)).toBeVisible();

      const refreshed = await prisma.adminUser.findUnique({
        where: { id: admin.id },
        select: { emailVerifiedAt: true },
      });
      expect(refreshed?.emailVerifiedAt).not.toBeNull();

      await loginTutorWithPassword(page, { email, password });
      await page.waitForURL(/\/admin\/pending-approval/, { timeout: 30_000 });
      await expect(page.getByText("Account pending approval")).toBeVisible();
    } finally {
      await prisma.adminUser.deleteMany({ where: { email } });
      await prisma.$disconnect();
    }
  });

  test("replay of a consumed in-TTL token still lands on /login?verified=1", async ({
    page,
  }) => {
    assertLocalDatabaseUrlForHarness();
    const prisma = new PrismaClient();
    const email = `pw-evf-replay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const raw = generateRawToken();
    const now = new Date();

    try {
      const admin = await prisma.adminUser.create({
        data: {
          email,
          passwordHash: await bcrypt.hash("ReplayLink!99", 10),
          displayName: "PW Confirm Replay",
          role: "TUTOR",
          approvalStatus: "WAITLISTED",
          isTestAccount: false,
          emailVerifiedAt: now,
        },
        select: { id: true },
      });
      await prisma.adminUserEmailToken.create({
        data: {
          adminUserId: admin.id,
          tokenHash: hashToken(raw),
          purpose: "SIGNUP_VERIFY",
          expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS_24H),
          consumedAt: now,
        },
      });

      await page.goto(`/verify-email?type=admin&token=${encodeURIComponent(raw)}`);
      await page.waitForURL(/\/login\?verified=1/, { timeout: 30_000 });
    } finally {
      await prisma.adminUser.deleteMany({ where: { email } });
      await prisma.$disconnect();
    }
  });

  test("resend form round-trips: same copy for unknown vs unverified; unverified gets a token", async ({
    page,
  }) => {
    assertLocalDatabaseUrlForHarness();
    const prisma = new PrismaClient();
    const unverifiedEmail = `pw-evf-resend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const unknownEmail = `pw-evf-resend-unknown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;

    try {
      const admin = await prisma.adminUser.create({
        data: {
          email: unverifiedEmail,
          passwordHash: await bcrypt.hash("ResendLink!99", 10),
          displayName: "PW Confirm Resend",
          role: "TUTOR",
          approvalStatus: "WAITLISTED",
          isTestAccount: false,
          emailVerifiedAt: null,
        },
        select: { id: true },
      });

      async function submitResend(email: string): Promise<string> {
        await page.goto("/verify-tutor-email");
        await expect(page.getByTestId("tutor-verify-email-form")).toBeVisible();
        await page.locator("#tutor-verify-email").fill(email);
        await page.getByRole("button", { name: /resend confirmation email/i }).click();
        const status = page.getByRole("status");
        await expect(status).toBeVisible({ timeout: 15_000 });
        return (await status.textContent()) ?? "";
      }

      const unknownCopy = await submitResend(unknownEmail);
      const unverifiedCopy = await submitResend(unverifiedEmail);
      expect(unknownCopy).toBe(unverifiedCopy);
      expect(unknownCopy).toMatch(/if that email needs confirmation/i);

      expect(await prisma.adminUser.findUnique({ where: { email: unknownEmail } })).toBeNull();
      expect(
        await prisma.adminUserEmailToken.count({
          where: {
            adminUserId: admin.id,
            purpose: "SIGNUP_VERIFY",
            consumedAt: null,
          },
        })
      ).toBe(1);
    } finally {
      await prisma.adminUser.deleteMany({ where: { email: unverifiedEmail } });
      await prisma.$disconnect();
    }
  });
});
