import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { generateRawToken, hashToken, CLAIM_INVITE_TTL_MS } from "@/lib/crypto/session-tokens";
import { TAG } from "../../test-tags";
import { ensureParentForClaimWizard } from "./claim-wizard.helpers";
import { TEST_PARENT } from "./identity.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

const PARENT_STATE = "tests/integration/.auth/parent.json";

test.describe("org learner claim", () => {
  test.use({ storageState: PARENT_STATE });
  test.describe.configure({ mode: "serial" });

  test(
    "same child already tied to the organization keeps one link and does not show already_linked_to_tutor",
    { tag: [TAG.WB_PRESENCE] },
    async ({ page }) => {
      const seeded = await seedOrgClaim({
        childName: `Ada ${Date.now().toString(36)}`,
        spareName: "",
        sameChild: true,
      });

      await page.goto(`/claim/${seeded.rawToken}`);
      await expect(page.getByTestId("claim-invite-for")).toContainText("Harbor Learning");
      await expect(page.getByTestId("claim-invite-for")).toContainText(seeded.childName);
      await expect(page.getByTestId("claim-party-name")).toHaveText("Harbor Learning");
      await expect(page.getByTestId("claim-interstitial")).toBeVisible();

      await page.getByRole("radio", { name: seeded.childName, exact: true }).check();
      await page.getByRole("button", { name: "Connect learner" }).click();
      await page.waitForURL(new RegExp(`/account/children/${seeded.profileId}$`), {
        timeout: 15_000,
      });

      await expect(page.getByText("already_linked_to_tutor")).toHaveCount(0);
      await expect(page.getByText("already connected to this tutor")).toHaveCount(0);

      const rows = await withPrisma((prisma) =>
        prisma.student.findMany({
          where: { organizationId: seeded.organizationId, learnerProfileId: seeded.profileId },
          select: { id: true },
        })
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(seeded.linkedStudentId);
      const spare = await withPrisma((prisma) =>
        prisma.student.findUnique({ where: { id: seeded.spareStudentId }, select: { id: true } })
      );
      expect(spare).toBeNull();
    }
  );

  test(
    "a different child with the same parent email stays, and the first learner stays",
    { tag: [TAG.WB_PRESENCE] },
    async ({ page }) => {
      const seeded = await seedOrgClaim({
        childName: `Ada ${Date.now().toString(36)}`,
        spareName: `Bea ${Date.now().toString(36)}`,
        sameChild: false,
      });

      await page.goto(`/claim/${seeded.rawToken}`);
      await expect(page.getByTestId("claim-invite-for")).toContainText(seeded.spareName);
      await page.getByRole("radio", { name: "Add a new child" }).check();
      await page.getByRole("button", { name: "Connect learner" }).click();
      await page.waitForURL(/\/claim\/.+\/setup/, { timeout: 15_000 });

      const names = await withPrisma(async (prisma) => {
        const rows = await prisma.student.findMany({
          where: { organizationId: seeded.organizationId },
          select: { name: true },
        });
        return rows.map((row) => row.name).sort();
      });
      expect(names).toEqual([seeded.childName, seeded.spareName].sort());
    }
  );

  test(
    "picking a different existing child keeps that child and the one already linked",
    { tag: [TAG.WB_PRESENCE] },
    async ({ page }) => {
      const seeded = await seedOrgClaim({
        childName: `Ada ${Date.now().toString(36)}`,
        spareName: `Bea ${Date.now().toString(36)}`,
        sameChild: false,
      });
      const otherName = `Cara ${Date.now().toString(36)}`;
      const otherProfileId = await withPrisma(async (prisma) => {
        const accountHolderId = await ensureParentForClaimWizard();
        const profile = await prisma.learnerProfile.create({
          data: {
            accountHolderId,
            displayName: otherName,
            isSelfLearner: false,
          },
          select: { id: true },
        });
        return profile.id;
      });

      await page.goto(`/claim/${seeded.rawToken}`);
      await expect(page.getByRole("radio", { name: "Add a new child" })).toBeVisible();
      await page.getByRole("radio", { name: otherName, exact: true }).check();
      await page.getByRole("button", { name: "Connect learner" }).click();
      await page.waitForURL(/\/claim\/.+\/setup/, { timeout: 15_000 });

      await expect(page.getByText("already_linked_to_tutor")).toHaveCount(0);

      const rows = await withPrisma((prisma) =>
        prisma.student.findMany({
          where: { organizationId: seeded.organizationId },
          select: { id: true, learnerProfileId: true },
        })
      );
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === seeded.linkedStudentId)?.learnerProfileId).toBe(
        seeded.profileId
      );
      expect(rows.find((row) => row.id === seeded.spareStudentId)?.learnerProfileId).toBe(
        otherProfileId
      );
    }
  );
});

async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedOrgClaim(input: {
  childName: string;
  spareName: string;
  sameChild: boolean;
}) {
  const spareName = input.sameChild ? input.childName : input.spareName;
  return withPrisma(async (prisma) => {
    const accountHolderId = await ensureParentForClaimWizard();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await prisma.adminUser.create({
      data: {
        email: `pw-org-claim-owner-${stamp}@test.local`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });
    const org = await prisma.organization.create({
      data: {
        name: "Harbor Learning",
        createdByOperatorId: "playwright@test.local",
        status: "active",
        dailyLearnerCap: 20,
        dailyClaimEmailCap: 30,
        members: { create: { adminUserId: owner.id, roles: ["owner"] } },
      },
      select: { id: true },
    });
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId,
        displayName: input.childName,
        isSelfLearner: false,
      },
      select: { id: true },
    });
    const linked = await prisma.student.create({
      data: {
        name: input.childName,
        adminUserId: null,
        organizationId: org.id,
        learnerProfileId: profile.id,
        parentEmail: TEST_PARENT.email,
        organizationLearner: {
          create: {
            organizationId: org.id,
            givenName: input.childName.split(" ")[0] ?? input.childName,
            familyName: input.childName.split(" ")[1] ?? "Learner",
            brief: "Already here",
            createdByAdminUserId: owner.id,
          },
        },
      },
      select: { id: true },
    });
    const spare = await prisma.student.create({
      data: {
        name: spareName,
        adminUserId: null,
        organizationId: org.id,
        learnerProfileId: null,
        parentEmail: TEST_PARENT.email,
        organizationLearner: {
          create: {
            organizationId: org.id,
            givenName: spareName.split(" ")[0] ?? spareName,
            familyName: spareName.split(" ")[1] ?? "Learner",
            brief: "Spare invite",
            createdByAdminUserId: owner.id,
          },
        },
      },
      select: { id: true },
    });
    const rawToken = generateRawToken();
    await prisma.studentClaimInvite.create({
      data: {
        studentId: spare.id,
        adminUserId: owner.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
        intendedEmail: TEST_PARENT.email,
        inviteTargetKind: "child_learner",
      },
    });
    return {
      rawToken,
      organizationId: org.id,
      profileId: profile.id,
      linkedStudentId: linked.id,
      spareStudentId: spare.id,
      childName: input.childName,
      spareName,
    };
  });
}
