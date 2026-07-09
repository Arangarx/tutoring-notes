/**
 * SEC-ERASURE-TUTOR-GATE — Playwright integration tests.
 *
 * Proves that when a student is in pending-erasure grace or post-purge state,
 * the tutor-facing student detail page (/admin/students/[id]) renders only the
 * erasure banner + roster link, and NOT notes forms, share link affordances,
 * or session start controls.
 *
 * Uses the pre-seeded TEST_ADMIN tutor from auth.setup.ts (storageState).
 * Directly seeds Prisma data per-test; each test creates its own Student row
 * so tests are independent and don't race each other.
 *
 * Project: integration (not wb-regression — no relay needed).
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_ADMIN } from "../visual/helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

// ---------------------------------------------------------------------------
// Shared Prisma setup
// ---------------------------------------------------------------------------

async function getTestAdminId(): Promise<string> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.adminUser.findUniqueOrThrow({
      where: { email: TEST_ADMIN.email },
      select: { id: true },
    });
    return admin.id;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Create a student owned by the test admin + an active ErasureJob that
 * suspends tutor content access (grace period — tombstone set, no erasedAt).
 *
 * Returns the studentId for navigation.
 */
async function seedStudentInErasureGrace(adminId: string): Promise<{
  studentId: string;
  cleanup: () => Promise<void>;
}> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const ah = await prisma.accountHolder.create({
      data: {
        email: `er-gate-pw-${Date.now()}@test.local`,
        emailVerifiedAt: new Date(),
        familyId: `erfam-${Date.now()}`,
        tombstonedAt: new Date(),
      },
    });
    const lp = await prisma.learnerProfile.create({
      data: {
        accountHolderId: ah.id,
        displayName: "Playwright Erasure Student",
        accessMode: "child_pin_required",
        tombstonedAt: new Date(),
      },
    });
    const student = await prisma.student.create({
      data: {
        name: "PW Erasure Test Student",
        adminUserId: adminId,
        learnerProfileId: lp.id,
      },
    });
    const job = await prisma.erasureJob.create({
      data: {
        scopeKind: "learner_profile",
        scopeId: lp.id,
        status: "requested",
        requestedByAdminId: adminId,
        purgeEligibleAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const cleanup = async () => {
      const prismaCleanup = new PrismaClient();
      try {
        await prismaCleanup.erasureJob.deleteMany({ where: { id: job.id } });
        await prismaCleanup.student.deleteMany({ where: { id: student.id } });
        await prismaCleanup.learnerProfile.deleteMany({ where: { id: lp.id } });
        await prismaCleanup.accountHolder.deleteMany({ where: { id: ah.id } });
      } finally {
        await prismaCleanup.$disconnect();
      }
    };

    return { studentId: student.id, cleanup };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Create a student that is fully purged (erasedAt set, no active job).
 */
async function seedStudentPurged(adminId: string): Promise<{
  studentId: string;
  cleanup: () => Promise<void>;
}> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "PW Purged Test Student",
        adminUserId: adminId,
        erasedAt: new Date(),
      },
    });

    const cleanup = async () => {
      const prismaCleanup = new PrismaClient();
      try {
        await prismaCleanup.student.deleteMany({ where: { id: student.id } });
      } finally {
        await prismaCleanup.$disconnect();
      }
    };

    return { studentId: student.id, cleanup };
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("SEC-ERASURE-TUTOR-GATE — student detail page UX", () => {
  let adminId: string;

  test.beforeAll(async () => {
    adminId = await getTestAdminId();
  });

  test(
    "pending-erasure student detail shows banner and NO notes/share/start-session affordances",
    async ({ page }) => {
      test.setTimeout(30_000);

      const { studentId, cleanup } = await seedStudentInErasureGrace(adminId);
      try {
        await page.goto(`/admin/students/${studentId}`, {
          waitUntil: "domcontentloaded",
        });

        // Erasure suspended shell renders
        const suspendedShell = page.getByTestId("student-erasure-suspended-shell");
        await expect(suspendedShell, "suspended shell should be visible").toBeVisible({
          timeout: 10_000,
        });

        // Banner present — pending-erasure copy
        const banner = page.getByTestId("student-erasure-banner");
        await expect(banner).toBeVisible({ timeout: 5_000 });
        await expect(banner).toContainText(/pending erasure/i);

        // Roster link present
        const rosterLink = page.getByRole("link", { name: /back to roster/i });
        await expect(rosterLink).toBeVisible({ timeout: 5_000 });

        // --- Affordances that must NOT be visible ---

        // No notes form (textarea or note-entry section)
        await expect(
          page.locator('textarea[name="topics"]'),
          "notes topics textarea must not be present"
        ).not.toBeVisible();

        await expect(
          page.getByText(/new session note/i),
          "New session note heading must not be visible"
        ).not.toBeVisible();

        // No share link section
        await expect(
          page.getByText(/share link/i),
          "Share link section must not be visible"
        ).not.toBeVisible();

        // No whiteboard start affordance
        await expect(
          page.getByText(/start whiteboard session|start session/i),
          "Start session control must not be visible"
        ).not.toBeVisible();

        // No send update email section
        await expect(
          page.getByText(/send update email/i),
          "Send update email section must not be visible"
        ).not.toBeVisible();
      } finally {
        await cleanup();
      }
    }
  );

  test(
    "purged student detail shows deleted banner and NO content affordances",
    async ({ page }) => {
      test.setTimeout(30_000);

      const { studentId, cleanup } = await seedStudentPurged(adminId);
      try {
        await page.goto(`/admin/students/${studentId}`, {
          waitUntil: "domcontentloaded",
        });

        // Erasure suspended shell renders
        const suspendedShell = page.getByTestId("student-erasure-suspended-shell");
        await expect(suspendedShell, "suspended shell should be visible").toBeVisible({
          timeout: 10_000,
        });

        // Banner shows deleted copy
        const banner = page.getByTestId("student-erasure-banner");
        await expect(banner).toBeVisible({ timeout: 5_000 });
        await expect(banner).toContainText(/deleted/i);

        // No notes form
        await expect(
          page.locator('textarea[name="topics"]')
        ).not.toBeVisible();

        // No share link section
        await expect(
          page.getByText(/share link/i)
        ).not.toBeVisible();
      } finally {
        await cleanup();
      }
    }
  );

  test(
    "non-suspended student detail shows full affordances (regression guard)",
    async ({ page }) => {
      test.setTimeout(30_000);

      // Use the pre-seeded TEST_STUDENT from visual helpers to avoid creating
      // another row. Just visit /admin/students and pick any visible student.
      await page.goto("/admin/students", { waitUntil: "domcontentloaded" });

      // Find the first student link (there must be at least one from auth.setup.ts)
      const firstStudent = page.locator('a[href^="/admin/students/"]').first();
      await expect(firstStudent).toBeVisible({ timeout: 10_000 });
      await firstStudent.click();

      await page.waitForURL(/\/admin\/students\/[a-z0-9]+$/, { timeout: 10_000 });

      // No suspended shell — normal student detail
      await expect(
        page.getByTestId("student-erasure-suspended-shell")
      ).not.toBeVisible();

      // Notes section should be present
      await expect(
        page.getByText(/whiteboard session|notes & email|share link/i).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  );
});
