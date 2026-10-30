import { expect, test, type Page } from "@playwright/test";
import { TAG } from "../../test-tags";
import { PrismaClient } from "@prisma/client";

import { TEST_ADMIN } from "../../visual/helpers";
import {
  TEST_2FA_TUTOR,
  generateTotpCode,
  seedEnrolled2faTutor,
  submitTotpOnVerifyPage,
  waitFor2faVerifyChallenge,
} from "./tutor-2fa-login.helpers";

const OPERATOR_STATE = "tests/integration/.auth/tutor.json";
const LEARNER_CAP_SENTENCE = "This organization has reached its learner limit for today.";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

function uniqueEmail(prefix: string): string {
  return `pw-org-learner-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
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

async function addLearner(
  page: Page,
  givenName: string,
  familyName: string,
  email: string
): Promise<void> {
  await page.getByTestId("org-learner-given").fill(givenName);
  await page.getByTestId("org-learner-family").fill(familyName);
  await page.getByTestId("org-learner-email").fill(email);
  await page.getByTestId("org-invite-for-parent").click();
  await page.getByTestId("org-learner-create").click();
}

test.describe("organization learner panel", { tag: [TAG.ORG, TAG.WB_PRESENCE] }, () => {
  test.use({ storageState: OPERATOR_STATE });

  test("owner sees the parent email, the learner cap sentence, and a scheduler does not", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const parentEmail = uniqueEmail("parent");
    const secondEmail = uniqueEmail("second");
    const givenName = "Ada";
    const familyName = `Lane${Math.random().toString(36).slice(2, 6)}`;
    const fullName = `${givenName} ${familyName}`;
    let organizationId = "";

    const seeded = await seedEnrolled2faTutor();

    try {
      organizationId = await withPrisma(async (prisma) => {
        const owner = await prisma.adminUser.findUnique({
          where: { email: TEST_ADMIN.email },
          select: { id: true },
        });
        if (!owner) throw new Error("Playwright operator is missing from the local database.");
        await prisma.organizationMember.deleteMany({
          where: { adminUserId: seeded.adminUserId },
        });
        const org = await prisma.organization.create({
          data: {
            name: `PW Learners ${Date.now()}`,
            timezone: "America/Denver",
            status: "active",
            dailyInviteCap: 25,
            dailyLearnerCap: 1,
            dailyClaimEmailCap: null,
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

      const schedulerMember = await withPrisma((prisma) =>
        prisma.organizationMember.findFirst({
          where: { organizationId, adminUserId: seeded.adminUserId, removedAt: null },
          select: { roles: true },
        })
      );
      expect(schedulerMember?.roles).toEqual(["scheduler"]);

      await page.goto(`/admin/organization/${organizationId}`);
      await expect(page.getByTestId("org-learner-panel")).toBeVisible();
      await addLearner(page, givenName, familyName, parentEmail);

      const records = page.getByTestId("org-learner-records");
      await expect(records.getByText(fullName)).toBeVisible({ timeout: 30_000 });
      await expect(records.getByText(parentEmail)).toBeVisible();

      await addLearner(page, "Bea", familyName, secondEmail);
      await expect(page.getByTestId("org-staff-error")).toHaveText(LEARNER_CAP_SENTENCE, {
        timeout: 30_000,
      });
      await expect(records.getByText(secondEmail)).toHaveCount(0);

      await page.context().clearCookies();
      await page.goto("/login");
      await page.locator("#email").fill(TEST_2FA_TUTOR.email);
      await page.locator("#password").fill(TEST_2FA_TUTOR.password);
      await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
      await waitFor2faVerifyChallenge(page);
      await submitTotpOnVerifyPage(page, generateTotpCode(TEST_2FA_TUTOR.totpSecret));
      await page.waitForURL((url) => !url.pathname.includes("/2fa"), { timeout: 30_000 });
      if (new URL(page.url()).pathname !== `/admin/organization/${organizationId}`) {
        await page.goto(`/admin/organization/${organizationId}`);
      }
      const cards = page.getByTestId("org-scheduler-cards");
      await expect(cards.getByText(fullName)).toBeVisible({ timeout: 30_000 });
      await expect(cards.getByText("Waiting on the family")).toBeVisible();
      await expect(page.getByText(parentEmail)).toHaveCount(0);
      await expect(page.getByTestId("org-learner-create")).toHaveCount(0);
    } finally {
      await withPrisma(async (prisma) => {
        if (organizationId) {
          await prisma.student.deleteMany({ where: { organizationId } });
          await prisma.organization.deleteMany({ where: { id: organizationId } });
        }
      });
    }
  });
});
