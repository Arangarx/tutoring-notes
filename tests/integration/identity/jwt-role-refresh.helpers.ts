import { type BrowserContext, type Page, expect } from "@playwright/test";
import { PrismaClient, type AdminRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { decode, encode } from "next-auth/jwt";

import { readLocalEnv } from "../../utils/read-dotenv";
import { encryptTotpSecret } from "@/lib/crypto/totp-secret";
import { generateBackupCodes, storeBackupCodes } from "@/lib/two-factor-db";
import {
  generateTotpCode,
  loginTutorWithPassword,
  waitFor2faVerifyChallenge,
  submitTotpOnVerifyPage,
} from "./tutor-2fa-login.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

/** Harness ADMIN — 2FA bypass via WB_E2E_HARNESS + playwright-erasure-admin@test.local */
export const ROLE_REFRESH_ADMIN = {
  email: "playwright-erasure-admin@test.local",
  password: "ErasureAdminPw!789",
  displayName: "Playwright Erasure Admin",
} as const;

const SESSION_COOKIE_NAME = "next-auth.session-token";
const ROLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function uniqSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureTotpEncryptionKey(): void {
  if (process.env.TOTP_ENCRYPTION_KEY) return;
  const env = readLocalEnv();
  if (env.TOTP_ENCRYPTION_KEY) {
    process.env.TOTP_ENCRYPTION_KEY = env.TOTP_ENCRYPTION_KEY;
    return;
  }
  throw new Error(
    "TOTP_ENCRYPTION_KEY is required to seed ephemeral 2FA admin (set in .env for local harness)."
  );
}

function nextAuthSecret(): string {
  const fromEnv = process.env.NEXTAUTH_SECRET ?? readLocalEnv().NEXTAUTH_SECRET;
  if (!fromEnv) {
    throw new Error("NEXTAUTH_SECRET is required for JWT role-refresh harness helpers.");
  }
  return fromEnv;
}

/**
 * Rewind `_roleCheckedAt` in the session JWT so the next `getServerSession`
 * call runs the role-refresh block (shipped throttle is 5 min — too long for e2e).
 * Test-only seam: does not change production auth code.
 */
export async function expireJwtRoleRefreshThrottle(
  context: BrowserContext
): Promise<void> {
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) {
    throw new Error("No next-auth session cookie — login before expiring role-refresh throttle.");
  }

  const secret = nextAuthSecret();
  const payload = await decode({ token: sessionCookie.value, secret });
  if (!payload || typeof payload !== "object") {
    throw new Error("Failed to decode next-auth session JWT.");
  }

  const staleCheckedAt = Date.now() - ROLE_REFRESH_INTERVAL_MS - 60_000;
  const refreshed = await encode({
    token: { ...payload, _roleCheckedAt: staleCheckedAt },
    secret,
  });

  await context.addCookies([
    {
      ...sessionCookie,
      value: refreshed,
    },
  ]);
}

export async function updateAdminUserRole(
  adminUserId: string,
  role: AdminRole
): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    await prisma.adminUser.update({
      where: { id: adminUserId },
      data: { role },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function deleteAdminUser(adminUserId: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    await prisma.adminUser2FA.deleteMany({ where: { adminUserId } });
    await prisma.adminUser.delete({ where: { id: adminUserId } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Resolve harness ADMIN id (seeded in auth.setup via seedTestAdminWithRole). */
export async function resolveRoleRefreshAdminId(): Promise<string> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const row = await prisma.adminUser.findUnique({
      where: { email: ROLE_REFRESH_ADMIN.email },
      select: { id: true },
    });
    if (!row) {
      throw new Error(
        `Missing ${ROLE_REFRESH_ADMIN.email} — run integration-setup (auth.setup.ts) first.`
      );
    }
    return row.id;
  } finally {
    await prisma.$disconnect();
  }
}

export async function loginHarnessAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#email").fill(ROLE_REFRESH_ADMIN.email);
  await page.locator("#password").fill(ROLE_REFRESH_ADMIN.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/admin") &&
      !url.pathname.startsWith("/admin/settings/2fa") &&
      url.pathname !== "/admin/pending-approval",
    { timeout: 30_000 }
  );
}

export async function expectAdminDashboard(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Admin dashboard" })
  ).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/admin");
}

export async function expectTutorWorkspaceLanding(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.pathname.startsWith("/admin/students"),
    { timeout: 15_000 }
  );
  await expect(
    page.getByRole("heading", { name: "Admin dashboard" })
  ).not.toBeVisible();
}

export async function expectUnauthenticatedAdminRedirect(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.pathname === "/login",
    { timeout: 15_000 }
  );
  await expect(page.locator("#email")).toBeVisible();
}

/** Ephemeral real admin (2FA enrolled) for account-deleted fail-closed — isolated from shared fixtures. */
export async function seedEphemeralAdminForDeletion(): Promise<{
  adminUserId: string;
  email: string;
  password: string;
  totpSecret: string;
}> {
  assertLocalDatabaseUrlForHarness();
  ensureTotpEncryptionKey();

  const suffix = uniqSuffix();
  const email = `pw-role-refresh-del-${suffix}@test.local`;
  const password = "RoleRefreshDelPw!456";
  const totpSecret = "JBSWY3DPEHPK3PXP";

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        displayName: `Role Refresh Delete ${suffix}`,
        role: "ADMIN",
        approvalStatus: "APPROVED",
        isTestAccount: false,
      },
      select: { id: true },
    });

    await prisma.adminUser2FA.deleteMany({ where: { adminUserId: user.id } });
    const totpSecretEnc = encryptTotpSecret(totpSecret);
    const twoFa = await prisma.adminUser2FA.create({
      data: { adminUserId: user.id, totpSecretEnc },
      select: { id: true },
    });
    const backup = await generateBackupCodes();
    await storeBackupCodes(
      twoFa.id,
      backup.map((c) => ({ hash: c.hash }))
    );

    return { adminUserId: user.id, email, password, totpSecret };
  } finally {
    await prisma.$disconnect();
  }
}

export async function loginEphemeralAdminWith2fa(
  page: Page,
  creds: { email: string; password: string; totpSecret: string }
): Promise<void> {
  await loginTutorWithPassword(page, creds);
  await waitFor2faVerifyChallenge(page);
  const code = generateTotpCode(creds.totpSecret);
  await submitTotpOnVerifyPage(page, code);
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/admin") &&
      !url.pathname.startsWith("/admin/settings/2fa") &&
      url.pathname !== "/admin/pending-approval",
    { timeout: 30_000 }
  );
}
