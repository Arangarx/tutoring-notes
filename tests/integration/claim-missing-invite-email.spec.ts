import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { TEST_ADMIN } from "../visual/helpers";

test("a learner with no email can be invited after the tutor sets one", async ({ page }) => {
  test.setTimeout(120_000);
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const inviteEmail = `missing-invite-${suffix}@example.com`;
  let studentId = "";
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { email: TEST_ADMIN.email },
      select: { id: true },
    });
    expect(admin, "playwright tutor must exist").not.toBeNull();
    const student = await prisma.student.create({
      data: {
        name: `No Email ${suffix}`,
        adminUserId: admin!.id,
        parentEmail: null,
        learnerProfileId: null,
      },
      select: { id: true },
    });
    studentId = student.id;

    await page.goto(`/admin/students/${studentId}`);
    const prompt = page.getByTestId("claim-missing-email-prompt").first();
    await expect(prompt).toBeVisible({ timeout: 20_000 });
    await expect(prompt).toContainText("no invitation email");

    await page.getByTestId("claim-invite-email-input").first().fill(inviteEmail);
    await page.getByTestId("create-claim-link-btn").first().click();
    await expect(page.getByText(/Share this link|copied to clipboard/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const row = await prisma.student.findUnique({
      where: { id: studentId },
      select: { parentEmail: true },
    });
    expect(row?.parentEmail).toBe(inviteEmail);
    const invite = await prisma.studentClaimInvite.findFirst({
      where: { studentId },
      select: { intendedEmail: true, claimedAt: true },
    });
    expect(invite?.intendedEmail).toBe(inviteEmail);
    expect(invite?.claimedAt).toBeNull();
  } finally {
    await prisma.$disconnect();
  }
});
