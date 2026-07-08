import { type Page, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  loginHarnessAdmin,
  expectAdminDashboard,
  resolveRoleRefreshAdminId,
  ROLE_REFRESH_ADMIN,
} from "./jwt-role-refresh.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

/** Fixed impersonation target — isTestAccount=true TUTOR shell. */
export const IMPERSONATION_TARGET = {
  email: "playwright-impersonation-target@test.local",
  displayName: "Playwright Impersonation Target",
} as const;

export type ImpersonationTargetFixture = {
  targetUserId: string;
  email: string;
};

export type ImpersonationLogSnapshot = {
  id: string;
  adminUserId: string;
  impersonatedUserId: string;
  startedAt: Date;
  endedAt: Date | null;
};

/** Idempotent seed for the impersonation target test account. */
export async function seedImpersonationTarget(): Promise<ImpersonationTargetFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash("unused-test-account-no-login", 10);

  try {
    const user = await prisma.adminUser.upsert({
      where: { email: IMPERSONATION_TARGET.email },
      create: {
        email: IMPERSONATION_TARGET.email,
        passwordHash,
        displayName: IMPERSONATION_TARGET.displayName,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: true,
      },
      update: {
        displayName: IMPERSONATION_TARGET.displayName,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: true,
      },
      select: { id: true, email: true },
    });

    return { targetUserId: user.id, email: user.email };
  } finally {
    await prisma.$disconnect();
  }
}

/** Close any open impersonation rows for harness admin + target (test isolation). */
export async function closeOpenImpersonationLogs(
  adminUserId: string,
  impersonatedUserId: string
): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    await prisma.impersonationLog.updateMany({
      where: {
        adminUserId,
        impersonatedUserId,
        endedAt: null,
      },
      data: { endedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function readLatestImpersonationLog(
  adminUserId: string,
  impersonatedUserId: string
): Promise<ImpersonationLogSnapshot | null> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return prisma.impersonationLog.findFirst({
      where: { adminUserId, impersonatedUserId },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        adminUserId: true,
        impersonatedUserId: true,
        startedAt: true,
        endedAt: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function loginHarnessAdminForImpersonation(page: Page): Promise<string> {
  await loginHarnessAdmin(page);
  await expectAdminDashboard(page);
  return resolveRoleRefreshAdminId();
}

export async function startImpersonationFromDashboard(
  page: Page,
  targetEmail: string
): Promise<void> {
  const row = page
    .locator("li")
    .filter({ hasText: targetEmail })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Log in as" }).click();
  await expectImpersonatingTutorWorkspace(page, targetEmail);
}

export async function expectImpersonationBanner(
  page: Page,
  targetEmail: string
): Promise<void> {
  await expect(
    page.getByText(`You are signed in as ${targetEmail} (test account).`, {
      exact: false,
    })
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Exit impersonation" })
  ).toBeVisible();
}

export async function expectImpersonatingTutorWorkspace(
  page: Page,
  targetEmail: string
): Promise<void> {
  await page.waitForURL(
    (url) => url.pathname.startsWith("/admin/students"),
    { timeout: 30_000 }
  );
  await expect(
    page.getByRole("heading", { name: "Students" })
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Admin dashboard" })
  ).not.toBeVisible();
  await expectImpersonationBanner(page, targetEmail);
}

export async function expectNoFresh2faChallenge(page: Page): Promise<void> {
  const pathname = new URL(page.url()).pathname;
  expect(pathname).not.toMatch(/^\/admin\/settings\/2fa\/(verify|setup)/);
  await expect(
    page.getByRole("heading", { name: "Two-Factor Verification" })
  ).not.toBeVisible();
}

export async function expectSessionIdentity(
  page: Page,
  expected: {
    email: string;
    isImpersonating?: boolean;
    role?: string;
  }
): Promise<void> {
  const sessionResp = await page.request.get("/api/auth/session");
  expect(sessionResp.ok()).toBe(true);
  const body = await sessionResp.json();
  expect(body.user?.email).toBe(expected.email);
  if (expected.isImpersonating !== undefined) {
    expect(Boolean(body.user?.isImpersonating)).toBe(expected.isImpersonating);
  }
  if (expected.role !== undefined) {
    expect(body.user?.role).toBe(expected.role);
  }
}

export async function exitImpersonationViaBanner(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Exit impersonation" }).click();
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 30_000 });
  await expectAdminDashboard(page);
  await expectNoFresh2faChallenge(page);
}

export async function exitImpersonationViaNavSignOut(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Admin" }).getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 30_000 });
  await expectAdminDashboard(page);
  await expectNoFresh2faChallenge(page);
}

export { ROLE_REFRESH_ADMIN, expectAdminDashboard };
