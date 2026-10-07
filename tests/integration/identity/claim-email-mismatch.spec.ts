import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { TEST_PARENT } from "./identity.helpers";
import { seedUnclaimedClaimInvite } from "./claim-wizard.helpers";

const PARENT_STATE = "tests/integration/.auth/parent.json";
const INVITED = "invited.parent@example.com";

test.describe("wrong-account claim hides the full email", () => {
  test.use({ storageState: PARENT_STATE });

  test("shows a masked address, refuses the claim, and leaves the invite unclaimed", async ({
    page,
  }) => {
    const invite = await seedUnclaimedClaimInvite({
      intendedEmail: INVITED,
      parentEmail: INVITED,
      inviteTargetKind: "child_learner",
    });

    await page.goto(`/claim/${invite.rawToken}`);
    const mismatch = page.getByTestId("claim-email-mismatch");
    await expect(mismatch).toBeVisible({ timeout: 15_000 });
    await expect(mismatch).toContainText("i***@e***.com");
    await expect(mismatch).toContainText("p***@t***.local");
    await expect(mismatch).not.toContainText(INVITED);
    await expect(mismatch).not.toContainText(TEST_PARENT.email);

    const res = await page.request.post(`/api/claim/${invite.rawToken}/complete`, {
      data: { action: "create_child" },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "invite_email_mismatch" });

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
