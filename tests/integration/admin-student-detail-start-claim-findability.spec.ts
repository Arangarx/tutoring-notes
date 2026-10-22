/**
 * Admin student detail — Start / consent / claim findability (Priority #2).
 *
 * Run:
 *   npx playwright test tests/integration/admin-student-detail-start-claim-findability.spec.ts --project=integration
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { seedTestAdmin } from "../visual/helpers";

const VIEWPORT = { width: 1280, height: 800 };

async function linkStudentToFreshLearnerProfile(
  studentId: string,
  studentName: string,
  kind: "child" | "self_learner" = "child"
): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const suffix = studentId.replace(/-/g, "").slice(0, 12);
    const self = kind === "self_learner";
    const accountHolder = await prisma.accountHolder.create({
      data: {
        email: `pw-${self ? "self" : "parent"}-${suffix}@test.local`,
        displayName: self ? studentName : "Test Parent",
        familyId: `pwfam${suffix}`,
        emailVerifiedAt: new Date("2026-01-01"),
        isSelfLearner: self,
      },
      select: { id: true },
    });
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: accountHolder.id,
        displayName: studentName,
        accessMode: self ? "account_holder_session" : "child_pin_required",
        isSelfLearner: self,
      },
      select: { id: true },
    });
    await prisma.student.update({
      where: { id: studentId },
      data: { learnerProfileId: profile.id },
    });
    return profile.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedUnclaimedStudent(adminUserId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "Unclaimed Findability Student",
        adminUserId,
        parentEmail: "unclaimed-findability@test.local",
      },
      select: { id: true },
    });
    return student.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedClaimedWithoutConsent(adminUserId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "Claimed No Consent Student",
        adminUserId,
        parentEmail: "claimed-no-consent@test.local",
      },
      select: { id: true, name: true },
    });
    await linkStudentToFreshLearnerProfile(student.id, student.name);
    return student.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedClaimedSelfLearnerWithoutConsent(
  adminUserId: string
): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "Claimed Self-Learner No Consent",
        adminUserId,
        parentEmail: "self-learner-no-consent@test.local",
      },
      select: { id: true, name: true },
    });
    await linkStudentToFreshLearnerProfile(student.id, student.name, "self_learner");
    return student.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedEligibleStudent(adminUserId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "Eligible Start Student",
        adminUserId,
        parentEmail: "eligible-start@test.local",
      },
      select: { id: true, name: true },
    });
    const learnerProfileId = await linkStudentToFreshLearnerProfile(
      student.id,
      student.name
    );

    const accountHolder = await prisma.learnerProfile.findUnique({
      where: { id: learnerProfileId },
      select: { accountHolderId: true },
    });
    if (!accountHolder) {
      throw new Error(`LearnerProfile not found: ${learnerProfileId}`);
    }

    await prisma.consentRecord.create({
      data: {
        learnerProfileId,
        adminUserId,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: accountHolder.accountHolderId,
        captureMethod: "electronic",
      },
    });

    return student.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Admin student detail — Start / claim findability", () => {
  test.use({ viewport: VIEWPORT });

  test(
    "unclaimed student shows top claim banner and blocked Start callout without Start button",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedUnclaimedStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(
        page.getByRole("heading", { name: "Unclaimed Findability Student" })
      ).toBeVisible({ timeout: 15_000 });

      const card = page.getByTestId("student-critical-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText(
        "Unclaimed Findability Student needs an account before you can start a session. Open Account & sharing to send an invite to Unclaimed Findability Student, or to their parent if Unclaimed Findability Student is a minor."
      );
      await expect(card.getByTestId("create-claim-link-btn")).toHaveCount(0);
      await page.getByTestId("student-account-link").click();
      await expect(page.getByTestId("create-claim-link-btn")).toBeVisible();
      await expect(page.getByRole("button", { name: "Start session" })).toHaveCount(0);
    }
  );

  test(
    "claimed without consent shows privacy-preferences blocked callout and no Start button",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedClaimedWithoutConsent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(
        page.getByRole("heading", { name: "Claimed No Consent Student" })
      ).toBeVisible({ timeout: 15_000 });

      const card = page.getByTestId("student-session-card");
      await expect(card).toContainText("Start whiteboard session unavailable");
      await expect(card).toContainText(/privacy preferences are not complete/i);
      await expect(card).toContainText(/privacy preferences for this learner/i);
      await expect(card).toContainText(/Ask the parent/i);
      await expect(card).toContainText(/parent account/i);
      await expect(page.getByTestId("student-critical-card")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Start session" })).toHaveCount(0);
    }
  );

  test(
    "claimed self-learner without consent shows unavailable start in the session card",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedClaimedSelfLearnerWithoutConsent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(
        page.getByRole("heading", { name: "Claimed Self-Learner No Consent" })
      ).toBeVisible({ timeout: 15_000 });

      const card = page.getByTestId("student-session-card");
      await expect(card).toContainText("Start whiteboard session unavailable");
      await expect(card).toContainText(/privacy preferences are not complete/i);
      await expect(card).toContainText(/Manage → Privacy/i);
      await expect(card).not.toContainText(/Ask the parent/i);
      await expect(card).not.toContainText(/parent account/i);
    }
  );

  test(
    "eligible claimed student shows Start whiteboard session button",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedEligibleStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(
        page.getByRole("heading", { name: "Eligible Start Student" })
      ).toBeVisible({ timeout: 15_000 });

      await expect(page.getByTestId("student-critical-card")).toHaveCount(0);

      const startBtn = page.getByTestId("start-whiteboard-session-btn");
      await expect(startBtn).toBeVisible();
      await expect(startBtn).toHaveText(/Start session/i);
    }
  );
});
