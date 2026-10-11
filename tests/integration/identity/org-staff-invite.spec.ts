import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { generateRawToken, hashToken } from "@/lib/crypto/session-tokens";
import { readHarnessMailUrl } from "@/lib/playwright-harness-mail";
import { TEST_ADMIN } from "../../visual/helpers";
import {
  TEST_2FA_TUTOR,
  generateTotpCode,
  loginTutorWithPassword,
  seedEnrolled2faTutor,
  submitTotpOnVerifyPage,
  waitFor2faVerifyChallenge,
} from "./tutor-2fa-login.helpers";

const OPERATOR_STATE = "tests/integration/.auth/tutor.json";
const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

const SIGNUP_PASSWORD = "SignupWaitlist!99";

function uniqueEmail(prefix: string): string {
  return `pw-org-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

function uniqueName(): string {
  return `PW Org ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`;
}

async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function waitForHarnessMail(
  kind: "tutor-verify" | "org-invite",
  email: string
): Promise<URL> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const raw = readHarnessMailUrl(kind, email);
    if (raw) return new URL(raw);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No ${kind} link was written for the invited teacher.`);
}

async function createOrgAsOperator(page: Page, name: string): Promise<string> {
  await page.goto("/admin/orgs");
  await page.locator("#org-name").fill(name);
  await page.locator("#org-owner-email").fill(TEST_ADMIN.email);
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/admin\/orgs\/[0-9a-f-]{36}$/i, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByTestId("org-invite-limit")).toHaveText(
    "Staff can send 25 invitations a day."
  );
  return new URL(page.url()).pathname.split("/").pop() ?? "";
}

async function sendStaffInvite(
  page: Page,
  organizationId: string,
  email: string,
  roleLabel: "Instructor" | "Scheduler"
): Promise<URL> {
  await page.goto(`/admin/organization/${organizationId}`);
  await expect(page.getByTestId("org-invite-form")).toBeVisible();
  const form = page.getByTestId("org-invite-form");
  await form.locator("#org-invite-email").fill(email);
  if (roleLabel === "Scheduler") {
    await form.getByRole("checkbox", { name: "Scheduler" }).click();
    await form.getByRole("checkbox", { name: "Instructor" }).click();
  }
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByTestId("org-invites").getByText(email)).toBeVisible({
    timeout: 30_000,
  });
  return waitForHarnessMail("org-invite", email);
}

function invitePath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

test.describe("organization staff invites", () => {
  test.use({ storageState: OPERATOR_STATE });

  test("operator sees one sentence when the owner has no verified account", async ({ page }) => {
    const missing = uniqueEmail("missing-owner");
    const unverified = uniqueEmail("unverified-owner");
    await withPrisma(async (prisma) => {
      await prisma.adminUser.create({
        data: {
          email: unverified,
          passwordHash: await bcrypt.hash(SIGNUP_PASSWORD, 10),
          displayName: "PW Unverified Owner",
          role: "TUTOR",
          approvalStatus: "WAITLISTED",
          isTestAccount: false,
          emailVerifiedAt: null,
        },
      });
    });

    try {
      await page.goto("/admin/orgs");
      await page.locator("#org-name").fill(uniqueName());
      await page.locator("#org-owner-email").fill(missing);
      await page.getByRole("button", { name: "Create organization" }).click();
      const missingAlert = page.getByTestId("org-create-error");
      await expect(missingAlert).toHaveText(
        "That person does not have a verified teaching account."
      );
      const missingText = (await missingAlert.textContent()) ?? "";

      await page.locator("#org-name").fill(uniqueName());
      await page.locator("#org-owner-email").fill(unverified);
      await page.getByRole("button", { name: "Create organization" }).click();
      await expect(page.getByTestId("org-create-error")).toHaveText(missingText);
      await expect(page.getByTestId("org-create-error")).not.toContainText(/unverified|no account/i);
    } finally {
      await withPrisma((prisma) => prisma.adminUser.deleteMany({ where: { email: unverified } }));
    }
  });

  test("a brand-new teacher confirms email and accepts the invitation", async ({ page }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail("new-teacher");
    const orgName = uniqueName();
    let organizationId = "";

    try {
      organizationId = await createOrgAsOperator(page, orgName);
      const inviteUrl = await sendStaffInvite(page, organizationId, email, "Instructor");
      expect(inviteUrl.pathname.startsWith("/org-invite/")).toBe(true);

      await page.context().clearCookies();
      await page.goto(invitePath(inviteUrl));
      await expect(page.getByTestId("org-invite-org-name")).toHaveText(orgName);
      await expect(page.getByTestId("org-invite-role")).toHaveText("Instructor");
      await expect(page.getByTestId("org-invite-email")).toHaveText(email);

      const signInHref = await page.getByTestId("org-invite-sign-in").getAttribute("href");
      const createHref = await page.getByTestId("org-invite-create-account").getAttribute("href");
      expect(signInHref ?? "").toMatch(/^\/login\?/);
      expect(createHref ?? "").toMatch(/^\/signup\?/);
      expect(signInHref).not.toContain("/account");
      expect(createHref).not.toContain("/account");
      expect(decodeURIComponent(signInHref ?? "")).toContain(email);
      expect(decodeURIComponent(createHref ?? "")).toContain(email);

      await page.getByTestId("org-invite-create-account").click();
      await expect(page.locator("#signup-email")).toHaveValue(email);
      await page.locator("#signup-password").fill(SIGNUP_PASSWORD);
      await page.locator("#signup-password-confirm").fill(SIGNUP_PASSWORD);
      await page.getByRole("button", { name: /create account/i }).click();
      await page.waitForURL(/\/verify-tutor-email/, { timeout: 30_000 });

      const verifyUrl = await waitForHarnessMail("tutor-verify", email);
      expect(verifyUrl.searchParams.get("returnTo")).toBe(inviteUrl.pathname);
      await page.goto(`${verifyUrl.pathname}${verifyUrl.search}`);
      await page.waitForURL(/\/login\?/, { timeout: 30_000 });
      expect(decodeURIComponent(page.url())).toContain(inviteUrl.pathname);
      await expect(page.locator("#email")).toHaveValue(email);

      await page.locator("#password").fill(SIGNUP_PASSWORD);
      await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
      await page.waitForURL(new RegExp(`/org-invite/`), { timeout: 30_000 });
      await page.getByTestId("org-invite-accept").click();
      await page.waitForURL(/\/org-invite\/accepted/, { timeout: 30_000 });

      await withPrisma(async (prisma) => {
        const member = await prisma.organizationMember.findFirst({
          where: { organizationId, adminUser: { email } },
          select: { roles: true, approvedViaOrg: true, adminUser: { select: { approvalStatus: true } } },
        });
        expect(member?.roles).toEqual(["instructor"]);
        expect(member?.approvedViaOrg).toBe(false);
        expect(member?.adminUser.approvalStatus).toBe("WAITLISTED");
      });
    } finally {
      await withPrisma(async (prisma) => {
        if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
        await prisma.adminUser.deleteMany({ where: { email } });
      });
    }
  });

  test("an existing teacher sees both doors, the wrong-account message, then the staff home without an invite form", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const orgName = uniqueName();
    let organizationId = "";
    const seeded = await seedEnrolled2faTutor();

    try {
      organizationId = await createOrgAsOperator(page, orgName);
      const inviteUrl = await sendStaffInvite(page, organizationId, TEST_2FA_TUTOR.email, "Scheduler");
      const inviteRow = page
        .getByTestId("org-invites")
        .getByRole("listitem")
        .filter({ hasText: TEST_2FA_TUTOR.email });
      await expect(inviteRow).toContainText("Scheduler");
      await expect(inviteRow).not.toContainText("Instructor");

      await page.goto(invitePath(inviteUrl));
      await expect(page.getByTestId("org-invite-role")).toHaveText("Scheduler");
      const wrong = page.getByTestId("org-invite-wrong-account");
      await expect(wrong).toContainText(TEST_ADMIN.email);
      await expect(wrong).toContainText(TEST_2FA_TUTOR.email);
      await expect(wrong).toContainText("Sign out, then sign in with the invited email.");
      await expect(page.getByTestId("org-invite-accept")).toHaveCount(0);
      await expect(page.getByTestId("org-invite-sign-in")).toHaveCount(0);

      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL(/\/org-invite\//, { timeout: 30_000 });
      await expect(page.getByTestId("org-invite-sign-in")).toBeVisible();
      await expect(page.getByTestId("org-invite-create-account")).toBeVisible();
      const createHref = await page.getByTestId("org-invite-create-account").getAttribute("href");
      expect(createHref ?? "").toMatch(/^\/signup\?/);
      expect(createHref).not.toContain("/account");

      await page.getByTestId("org-invite-sign-in").click();
      await expect(page.locator("#email")).toHaveValue(TEST_2FA_TUTOR.email);
      await page.locator("#password").fill(TEST_2FA_TUTOR.password);
      await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
      await page.waitForURL(/\/org-invite\//, { timeout: 30_000 });
      await page.getByTestId("org-invite-accept").click();
      await page.waitForURL(/\/org-invite\/accepted/, { timeout: 30_000 });

      await page.goto(`/admin/organization/${organizationId}`);
      await waitFor2faVerifyChallenge(page);
      await submitTotpOnVerifyPage(page, generateTotpCode(TEST_2FA_TUTOR.totpSecret));
      await page.waitForURL(
        (url) => url.pathname === `/admin/organization/${organizationId}`,
        { timeout: 30_000 }
      );
      await expect(page.getByTestId("org-staff-home")).toBeVisible();
      await expect(page.getByTestId("org-members")).toContainText(TEST_2FA_TUTOR.email);
      const memberRow = page
        .getByTestId("org-members")
        .getByRole("listitem")
        .filter({ hasText: TEST_2FA_TUTOR.email });
      await expect(memberRow).toContainText("Scheduler");
      await expect(page.getByTestId("org-invite-form")).toHaveCount(0);
      await expect(page.getByTestId("org-activate")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Organizations", exact: true })).toHaveCount(0);

      await page.context().clearCookies();
      await page.goto(invitePath(inviteUrl));
      await expect(page.getByTestId("org-invite-reason")).toHaveText(
        "This invitation has already been used."
      );
      await expect(page.getByTestId("org-invite-sign-in")).toHaveCount(0);
      expect(seeded.adminUserId).toBeTruthy();
    } finally {
      await withPrisma(async (prisma) => {
        if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
      });
    }
  });

  test("revoking an invitation shows the revoked reason to the holder", async ({ page }) => {
    const email = uniqueEmail("revoke");
    const orgName = uniqueName();
    let organizationId = "";

    try {
      organizationId = await createOrgAsOperator(page, orgName);
      const inviteUrl = await sendStaffInvite(page, organizationId, email, "Instructor");
      await page.getByTestId("org-revoke-invite").click();
      await expect(page.getByTestId("org-invites").getByText(email)).toHaveCount(0);

      await page.context().clearCookies();
      await page.goto(invitePath(inviteUrl));
      await expect(page.getByTestId("org-invite-reason")).toHaveText("This invitation was revoked.");
      await expect(page.getByTestId("org-invite-org-name")).toHaveText(orgName);
      await expect(page.getByTestId("org-invite-email")).toHaveText(email);
      await expect(page.getByText(/account/i)).toHaveCount(0);
    } finally {
      await withPrisma(async (prisma) => {
        if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
      });
    }
  });

  test("a removed inviter cannot complete the invitation", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("removed-inviter");
    const orgName = uniqueName();
    let organizationId = "";

    await withPrisma(async (prisma) => {
      await prisma.adminUser.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(SIGNUP_PASSWORD, 10),
          displayName: "PW Removed Inviter Target",
          role: "TUTOR",
          approvalStatus: "APPROVED",
          isTestAccount: false,
          emailVerifiedAt: new Date("2026-01-01"),
        },
      });
    });

    try {
      organizationId = await createOrgAsOperator(page, orgName);
      const inviteUrl = await sendStaffInvite(page, organizationId, email, "Instructor");
      await withPrisma((prisma) =>
        prisma.organizationMember.updateMany({
          where: { organizationId, roles: { has: "owner" } },
          data: { removedAt: new Date() },
        })
      );

      await page.context().clearCookies();
      await page.goto(invitePath(inviteUrl));
      await page.getByTestId("org-invite-sign-in").click();
      await expect(page.locator("#email")).toHaveValue(email);
      await page.locator("#password").fill(SIGNUP_PASSWORD);
      await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
      await page.waitForURL(/\/org-invite\//, { timeout: 30_000 });
      await page.getByTestId("org-invite-accept").click();
      await page.waitForURL(/\/org-invite\/unavailable/, { timeout: 30_000 });
      await expect(page.getByText("Invitation unavailable")).toBeVisible();
      await expect(page.getByText("This invitation can't be accepted.")).toBeVisible();

      await withPrisma(async (prisma) => {
        expect(
          await prisma.organizationMember.count({
            where: { organizationId, adminUser: { email } },
          })
        ).toBe(0);
        const invite = await prisma.organizationInvite.findFirst({
          where: { organizationId, email },
          select: { acceptedAt: true },
        });
        expect(invite?.acceptedAt).toBeNull();
      });
    } finally {
      await withPrisma(async (prisma) => {
        if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
        await prisma.adminUser.deleteMany({ where: { email } });
      });
    }
  });

  test("activating lists people who joined while pending and does not approve them", async ({
    page,
  }) => {
    const email = uniqueEmail("waitlist");
    const orgName = uniqueName();
    let organizationId = "";
    let adminUserId = "";

    await withPrisma(async (prisma) => {
      const owner = await prisma.adminUser.findUnique({
        where: { email: TEST_ADMIN.email },
        select: { id: true },
      });
      if (!owner) throw new Error("Playwright operator is missing from the local database.");
      const invitee = await prisma.adminUser.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(SIGNUP_PASSWORD, 10),
          displayName: "PW Pending Teacher",
          role: "TUTOR",
          approvalStatus: "WAITLISTED",
          isTestAccount: false,
          emailVerifiedAt: new Date("2026-01-01"),
        },
        select: { id: true },
      });
      adminUserId = invitee.id;
      const org = await prisma.organization.create({
        data: {
          name: orgName,
          timezone: "America/Denver",
          status: "pending",
          dailyInviteCap: 25,
          createdByOperatorId: owner.id,
          members: {
            create: [
              { adminUserId: owner.id, roles: ["owner"] },
              { adminUserId: invitee.id, roles: ["instructor"], approvedViaOrg: false },
            ],
          },
        },
        select: { id: true },
      });
      organizationId = org.id;
    });

    try {
      await page.goto(`/admin/orgs/${organizationId}`);
      await expect(page.getByTestId("org-status")).toContainText("pending");
      await expect(page.getByTestId("org-waitlist")).toHaveCount(0);
      await page.getByTestId("org-activate").click();
      const row = page.getByTestId(`org-waitlist-row-${adminUserId}`);
      await expect(row).toBeVisible({ timeout: 30_000 });
      await expect(row).toContainText(email);

      await withPrisma(async (prisma) => {
        const user = await prisma.adminUser.findUnique({
          where: { id: adminUserId },
          select: { approvalStatus: true },
        });
        expect(user?.approvalStatus).toBe("WAITLISTED");
      });

      await row.getByTestId("tutor-approve-button").click();
      await expect(page.getByText("No one is waiting for approval.")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId(`org-waitlist-row-${adminUserId}`)).toHaveCount(0);

      await withPrisma(async (prisma) => {
        const user = await prisma.adminUser.findUnique({
          where: { id: adminUserId },
          select: { approvalStatus: true },
        });
        expect(user?.approvalStatus).toBe("APPROVED");
      });
    } finally {
      await withPrisma(async (prisma) => {
        if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
        await prisma.adminUser.deleteMany({ where: { email } });
      });
    }
  });
});

test.describe("organization staff sign-in landing", () => {
  test.use({ storageState: EMPTY_STATE });

  test("sign-in from /login lands a scheduler on the organization and an instructor on the student list", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seeded = await seedEnrolled2faTutor();
    const orgName = uniqueName();
    let organizationId = "";

    organizationId = await withPrisma(async (prisma) => {
      await prisma.organizationMember.deleteMany({
        where: { adminUserId: seeded.adminUserId },
      });
      const owner = await prisma.adminUser.findUnique({
        where: { email: TEST_ADMIN.email },
        select: { id: true },
      });
      if (!owner) throw new Error("Playwright operator is missing from the local database.");
      const org = await prisma.organization.create({
        data: {
          name: orgName,
          timezone: "America/Denver",
          status: "active",
          dailyInviteCap: 25,
          createdByOperatorId: owner.id,
          members: {
            create: [
              { adminUserId: owner.id, roles: ["owner"] },
              { adminUserId: seeded.adminUserId, roles: ["scheduler"] },
            ],
          },
        },
        select: { id: true },
      });
      return org.id;
    });

    try {
      // /login with no callback query uses the form default, /admin.
      await page.goto("/login");
      const loginUrl = new URL(page.url());
      expect(loginUrl.pathname).toBe("/login");
      expect(loginUrl.searchParams.has("callbackUrl")).toBe(false);
      await page.locator("#email").fill(TEST_2FA_TUTOR.email);
      await page.locator("#password").fill(TEST_2FA_TUTOR.password);
      await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
      await waitFor2faVerifyChallenge(page);
      await submitTotpOnVerifyPage(page, generateTotpCode(TEST_2FA_TUTOR.totpSecret));
      await page.waitForURL(
        (url) => url.pathname === `/admin/organization/${organizationId}`,
        { timeout: 30_000 }
      );
      expect(new URL(page.url()).pathname).toBe(`/admin/organization/${organizationId}`);

      await withPrisma((prisma) =>
        prisma.organizationMember.updateMany({
          where: { organizationId, adminUserId: seeded.adminUserId },
          data: { roles: ["instructor"] },
        })
      );
      await page.context().clearCookies();

      await page.goto("/login");
      const instructorLogin = new URL(page.url());
      expect(instructorLogin.pathname).toBe("/login");
      expect(instructorLogin.searchParams.has("callbackUrl")).toBe(false);
      await page.locator("#email").fill(TEST_2FA_TUTOR.email);
      await page.locator("#password").fill(TEST_2FA_TUTOR.password);
      await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
      await waitFor2faVerifyChallenge(page);
      await submitTotpOnVerifyPage(page, generateTotpCode(TEST_2FA_TUTOR.totpSecret));
      await page.waitForURL((url) => url.pathname === "/admin/students", { timeout: 30_000 });
      expect(new URL(page.url()).pathname).toBe("/admin/students");
    } finally {
      await withPrisma(async (prisma) => {
        if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
      });
    }
  });
});

test.describe("organization invite reasons do not reveal an account", () => {
  test.use({ storageState: EMPTY_STATE });

  test("expired and already-used invitations read the same with or without an account", async ({
    page,
  }) => {
    const existingEmail = uniqueEmail("reason-hit");
    const missingEmail = uniqueEmail("reason-miss");
    const orgName = uniqueName();
    let organizationId = "";

    const tokens = await withPrisma(async (prisma) => {
      const owner = await prisma.adminUser.findUnique({
        where: { email: TEST_ADMIN.email },
        select: { id: true },
      });
      if (!owner) throw new Error("Playwright operator is missing from the local database.");
      await prisma.adminUser.create({
        data: {
          email: existingEmail,
          passwordHash: await bcrypt.hash(SIGNUP_PASSWORD, 10),
          displayName: "PW Reason Hit",
          role: "TUTOR",
          approvalStatus: "APPROVED",
          isTestAccount: false,
          emailVerifiedAt: new Date("2026-01-01"),
        },
      });
      const org = await prisma.organization.create({
        data: {
          name: orgName,
          timezone: "America/Denver",
          status: "pending",
          dailyInviteCap: 25,
          createdByOperatorId: owner.id,
          members: { create: { adminUserId: owner.id, roles: ["owner"] } },
        },
        select: { id: true },
      });
      organizationId = org.id;
      const past = new Date(Date.now() - 60_000);
      const used = new Date();
      const expiredHit = generateRawToken();
      const expiredMiss = generateRawToken();
      const usedHit = generateRawToken();
      const usedMiss = generateRawToken();
      await prisma.organizationInvite.createMany({
        data: [
          {
            organizationId,
            email: existingEmail,
            roles: ["scheduler"],
            tokenHash: hashToken(expiredHit),
            expiresAt: past,
            invitedByAdminUserId: owner.id,
          },
          {
            organizationId,
            email: missingEmail,
            roles: ["scheduler"],
            tokenHash: hashToken(expiredMiss),
            expiresAt: past,
            invitedByAdminUserId: owner.id,
          },
          {
            organizationId,
            email: existingEmail,
            roles: ["admin"],
            tokenHash: hashToken(usedHit),
            expiresAt: new Date(Date.now() + 86_400_000),
            acceptedAt: used,
            invitedByAdminUserId: owner.id,
          },
          {
            organizationId,
            email: missingEmail,
            roles: ["admin"],
            tokenHash: hashToken(usedMiss),
            expiresAt: new Date(Date.now() + 86_400_000),
            acceptedAt: used,
            invitedByAdminUserId: owner.id,
          },
        ],
      });
      return { expiredHit, expiredMiss, usedHit, usedMiss };
    });

    try {
      async function reasonText(token: string): Promise<string> {
        await page.goto(`/org-invite/${token}`);
        const reason = page.getByTestId("org-invite-reason");
        await expect(reason).toBeVisible();
        await expect(page.getByTestId("org-invite-sign-in")).toHaveCount(0);
        await expect(page.getByTestId("org-invite-create-account")).toHaveCount(0);
        return (await reason.textContent()) ?? "";
      }

      const expiredHit = await reasonText(tokens.expiredHit);
      const expiredMiss = await reasonText(tokens.expiredMiss);
      expect(expiredHit).toBe("This invitation has expired.");
      expect(expiredMiss).toBe(expiredHit);

      const usedHit = await reasonText(tokens.usedHit);
      const usedMiss = await reasonText(tokens.usedMiss);
      expect(usedHit).toBe("This invitation has already been used.");
      expect(usedMiss).toBe(usedHit);

      await expect(page.getByTestId("org-invite-org-name")).toHaveText(orgName);
      await expect(page.getByTestId("org-invite-role")).toHaveText("Admin");
      await expect(page.getByTestId("org-invite-email")).toHaveText(missingEmail);
    } finally {
      await withPrisma(async (prisma) => {
        if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
        await prisma.adminUser.deleteMany({ where: { email: existingEmail } });
      });
    }
  });
});
