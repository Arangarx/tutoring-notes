import { expect, test } from "@playwright/test";

import { PrismaClient } from "@prisma/client";

import { seedUnclaimedClaimInvite } from "./claim-wizard.helpers";

const PARENT_STATE = "tests/integration/.auth/parent.json";

test.describe("child invite rejected when the adult claims it for themselves", () => {
  test.use({ storageState: PARENT_STATE });

  test("I'll be taking the lessons myself explains the invitation is for a child", async ({
    page,
  }) => {
    const invite = await seedUnclaimedClaimInvite({
      inviteTargetKind: "child_learner",
    });

    await page.goto(`/claim/${invite.rawToken}`);
    await expect(page.getByTestId("claim-interstitial")).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole("radio", { name: "I'll be taking the lessons myself" })
      .check();
    await page.getByRole("button", { name: "Connect learner" }).click();

    const mismatch = page.locator("#claim-interstitial-error");
    await expect(mismatch).toHaveText(
      "This invitation is for a child's account. Ask the tutor for a self-learner invite if you will be taking the lessons yourself.",
      { timeout: 15_000 }
    );
    await expect(mismatch).not.toContainText("Something went wrong");

    const prisma = new PrismaClient();
    try {
      const row = await prisma.studentClaimInvite.findUnique({
        where: { id: invite.inviteId },
        select: { claimedAt: true },
      });
      expect(row?.claimedAt).toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });
});
