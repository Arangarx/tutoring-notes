/**
 * Stage 6 student page: one column, main button order, setup and deletion
 * cards, coming-soon audio, the reminder dialog, the header overflow, and
 * Account & sharing.
 *
 *   npx playwright test tests/integration/admin-student-detail-stage6.spec.ts --project=integration --workers=1
 */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { TAG } from "../test-tags";
import { seedTestAdmin } from "../visual/helpers";
import { openManualNoteForm } from "./open-manual-note-form";

const COMING_SOON =
  "Recording and uploading audio here is coming soon. For now, record during a whiteboard session.";
const SHARE_SENTENCE =
  "The family signs in to open this link. You can revoke or regenerate it anytime.";
const REMINDER =
  "The notes and the lesson replay are already in the family's account. This email only reminds them.";
const DELETION = "This student's account is being deleted. Sessions are off.";

function beforeInvite(name: string): string {
  return `${name} needs an account before you can start a session. Open Account & sharing to send an invite to ${name}, or to their parent if ${name} is a minor.`;
}

function selfLearner(name: string): string {
  return `${name} needs to set up their account before you can start a session. Open Account & sharing and send the invite. Once they accept and finish privacy preferences, Start session turns on.`;
}

function parentSentence(name: string): string {
  return `Parent must claim this student before sessions can start. Open Account & sharing, create a claim link, and share it with ${name}'s parent. After they claim the account and set privacy preferences, you can start whiteboard sessions.`;
}

async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function linkProfile(
  prisma: PrismaClient,
  studentId: string,
  studentName: string
): Promise<string> {
  const suffix = studentId.replace(/-/g, "").slice(0, 12);
  const accountHolder = await prisma.accountHolder.create({
    data: {
      email: `pw-stage6-${suffix}@test.local`,
      displayName: "Stage 6 Parent",
      familyId: `s6fam${suffix}`,
      emailVerifiedAt: new Date("2026-01-01"),
    },
    select: { id: true },
  });
  const profile = await prisma.learnerProfile.create({
    data: {
      accountHolderId: accountHolder.id,
      displayName: studentName,
      accessMode: "child_pin_required",
    },
    select: { id: true },
  });
  await prisma.student.update({
    where: { id: studentId },
    data: { learnerProfileId: profile.id },
  });
  return profile.id;
}

async function seedReadyStudent(adminUserId: string, name: string): Promise<string> {
  return withPrisma(async (prisma) => {
    const student = await prisma.student.create({
      data: { name, adminUserId, parentEmail: "stage6-ready@test.local" },
      select: { id: true },
    });
    const learnerProfileId = await linkProfile(prisma, student.id, name);
    const accountHolder = await prisma.learnerProfile.findUniqueOrThrow({
      where: { id: learnerProfileId },
      select: { accountHolderId: true },
    });
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
  });
}

async function seedOpenSession(adminUserId: string, studentId: string): Promise<void> {
  await withPrisma((prisma) =>
    prisma.whiteboardSession.create({
      data: {
        adminUserId,
        studentId,
        eventsBlobUrl: "https://pw.local/stage6-events.json",
      },
    })
  );
}

async function seedUpcoming(adminUserId: string, studentId: string): Promise<string> {
  const start = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return withPrisma(async (prisma) => {
    const row = await prisma.scheduledSession.create({
      data: {
        adminUserId,
        studentId,
        date: start,
        startTime: "15:00",
        endTime: "16:00",
        startAt: start,
        endAt: end,
        plannedDurationMinutes: 60,
        subject: "Stage 6 lesson",
      },
      select: { id: true },
    });
    return row.id;
  });
}

async function seedUnclaimed(
  adminUserId: string,
  name: string,
  kind: "self_learner" | "child_learner" | "none"
): Promise<string> {
  return withPrisma(async (prisma) => {
    const student = await prisma.student.create({
      data: {
        name,
        adminUserId,
        parentEmail: `${name.toLowerCase().replace(/\s+/g, "-")}@test.local`,
      },
      select: { id: true },
    });
    if (kind !== "none") {
      await prisma.studentClaimInvite.create({
        data: {
          studentId: student.id,
          adminUserId,
          tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          inviteTargetKind: kind,
        },
      });
    }
    return student.id;
  });
}

function nextAuthSecret(): string {
  const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
  const line = raw.split(/\r?\n/).find((entry) => entry.startsWith("NEXTAUTH_SECRET="));
  if (!line) throw new Error("NEXTAUTH_SECRET is required");
  let secret = line.slice("NEXTAUTH_SECRET=".length).trim();
  if (
    (secret.startsWith('"') && secret.endsWith('"')) ||
    (secret.startsWith("'") && secret.endsWith("'"))
  ) {
    secret = secret.slice(1, -1);
  }
  return secret;
}

async function signIn(
  browser: Browser,
  admin: { id: string; email: string; displayName: string }
): Promise<{ context: BrowserContext; page: Page }> {
  const token = await encode({
    token: {
      sub: admin.id,
      email: admin.email,
      name: admin.displayName,
      role: "TUTOR",
      approvalStatus: "APPROVED",
      emailVerified: true,
      twoFactorVerified: true,
      isTestAccount: false,
      isImpersonating: false,
    },
    secret: nextAuthSecret(),
    maxAge: 60 * 60,
  });
  const context = await browser.newContext({
    storageState: {
      cookies: [
        {
          name: "next-auth.session-token",
          value: token,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure: false,
          expires: Math.floor(Date.now() / 1000) + 60 * 60,
        },
      ],
      origins: [],
    },
  });
  return { context, page: await context.newPage() };
}

test.describe("Admin student detail — stage 6", () => {
  test(
    "the session card sits in one column inside the page",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedReadyStudent(adminUserId, "Column Layout Student");
      await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Column Layout Student" })).toBeVisible();

      const column = page.getByTestId("student-detail-column");
      const card = page.getByTestId("student-session-card");
      const notes = page.getByTestId("student-notes-link");
      await expect(column).toBeVisible();
      await expect(card).toBeVisible();
      await expect(notes).toBeVisible();

      const columnBox = await column.boundingBox();
      const cardBox = await card.boundingBox();
      const notesBox = await notes.boundingBox();
      expect(columnBox).not.toBeNull();
      expect(cardBox).not.toBeNull();
      expect(notesBox).not.toBeNull();

      // One column: the card is inside the page column, and Notes sits below it.
      expect(cardBox!.x).toBeGreaterThanOrEqual(columnBox!.x - 4);
      expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(columnBox!.x + columnBox!.width + 4);
      expect(cardBox!.y).toBeGreaterThanOrEqual(columnBox!.y - 4);
      expect(notesBox!.y).toBeGreaterThanOrEqual(cardBox!.y + cardBox!.height - 4);
      expect(Math.abs(notesBox!.x - cardBox!.x)).toBeLessThanOrEqual(8);
    }
  );

  test(
    "an open session makes Resume the main control, and the upcoming list stays",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedReadyStudent(adminUserId, "Resume Main Student");
      await seedOpenSession(adminUserId, studentId);
      const appointmentId = await seedUpcoming(adminUserId, studentId);

      await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
      const main = page.getByTestId("student-main-control");
      await expect(main.getByRole("link", { name: "Resume" })).toBeVisible();
      await expect(main.getByRole("button", { name: "Open room" })).toHaveCount(0);
      await expect(main.getByRole("button", { name: "Start session" })).toHaveCount(0);
      await expect(page.getByTestId("upcoming-sessions-card")).toBeVisible();
      await expect(page.getByTestId(`open-scheduled-room-${appointmentId}`)).toBeVisible();
    }
  );

  test(
    "an upcoming appointment and no open session makes Open room the main control",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedReadyStudent(adminUserId, "Open Room Main Student");
      const appointmentId = await seedUpcoming(adminUserId, studentId);

      await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
      const main = page.getByTestId("student-main-control");
      await expect(main.getByTestId(`open-scheduled-room-${appointmentId}`)).toBeVisible();
      await expect(main.getByRole("link", { name: "Resume" })).toHaveCount(0);
      await expect(main.getByRole("button", { name: "Start session" })).toHaveCount(0);
      await expect(page.getByTestId("upcoming-sessions-list")).toBeVisible();
    }
  );

  test(
    "with no open session, no appointment, and no card, Start session is the main control",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedReadyStudent(adminUserId, "Start Main Student");

      await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
      const main = page.getByTestId("student-main-control");
      await expect(main.getByRole("button", { name: "Start session" })).toBeVisible();
      await expect(page.getByTestId("upcoming-sessions-card")).toBeVisible();
      await expect(page.getByTestId("student-critical-card")).toHaveCount(0);
    }
  );

  test(
    "unclaimed child, unclaimed self-learner, and no invite yet show that card and no Start session",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const childId = await seedUnclaimed(adminUserId, "Casey Child", "child_learner");
      const selfId = await seedUnclaimed(adminUserId, "Sam Self", "self_learner");
      const noneId = await seedUnclaimed(adminUserId, "No Invite Yet", "none");

      await page.goto(`/admin/students/${childId}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("student-critical-card")).toContainText(parentSentence("Casey Child"));
      await expect(page.getByRole("button", { name: "Start session" })).toHaveCount(0);

      await page.goto(`/admin/students/${selfId}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("student-critical-card")).toContainText(selfLearner("Sam Self"));
      await expect(page.getByRole("button", { name: "Start session" })).toHaveCount(0);

      await page.goto(`/admin/students/${noneId}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("student-critical-card")).toContainText(beforeInvite("No Invite Yet"));
      await expect(page.getByTestId("create-claim-link-btn")).toHaveCount(0);
      await page.getByTestId("student-account-link").click();
      await expect(page.getByTestId("create-claim-link-btn")).toBeVisible();
      await expect(page.getByRole("button", { name: "Start session" })).toHaveCount(0);
    }
  );

  test(
    "pending erasure shows the deletion date, no tutor action, and no notes, share, or Start",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const purgeEligibleAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const studentId = await withPrisma(async (prisma) => {
        const ah = await prisma.accountHolder.create({
          data: {
            email: `stage6-erasure-${Date.now()}@test.local`,
            emailVerifiedAt: new Date(),
            familyId: `s6er-${Date.now()}`,
            tombstonedAt: new Date(),
          },
        });
        const lp = await prisma.learnerProfile.create({
          data: {
            accountHolderId: ah.id,
            displayName: "Erasure Stage 6",
            accessMode: "child_pin_required",
            tombstonedAt: new Date(),
          },
        });
        const student = await prisma.student.create({
          data: {
            name: "Erasure Stage 6 Student",
            adminUserId,
            learnerProfileId: lp.id,
          },
        });
        await prisma.erasureJob.create({
          data: {
            scopeKind: "learner_profile",
            scopeId: lp.id,
            status: "requested",
            requestedByPrincipal: `admin:${adminUserId}`,
            purgeEligibleAt: new Date(purgeEligibleAt),
          },
        });
        return student.id;
      });

      await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
      const card = page.getByTestId("student-critical-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText(DELETION);
      await expect(card.locator("time")).toHaveAttribute("datetime", purgeEligibleAt);
      await expect(card).not.toContainText(/contact your operator/i);
      await expect(card.getByRole("button")).toHaveCount(0);
      await expect(card.getByRole("link")).toHaveCount(0);
      await expect(page.getByTestId("student-notes-link")).toHaveCount(0);
      await expect(page.getByTestId("student-account-link")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Start session" })).toHaveCount(0);
      await expect(page.getByText(/share link/i)).toHaveCount(0);
    }
  );

  test(
    "Record and Upload are not operable, and the coming-soon sentence is shown",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedReadyStudent(adminUserId, "Notes Coming Soon Student");
      await page.goto(`/admin/students/${studentId}/notes`, { waitUntil: "domcontentloaded" });
      await openManualNoteForm(page);
      await expect(page.getByText(COMING_SOON)).toBeVisible();
      await expect(page.getByRole("tab", { name: "Record" })).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Upload audio" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Record$/ })).toHaveCount(0);
    }
  );

  test(
    "Email a reminder is a dialog on the Notes page",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedReadyStudent(adminUserId, "Reminder Dialog Student");
      await page.goto(`/admin/students/${studentId}/notes`, { waitUntil: "networkidle" });
      const reminder = page.getByTestId("email-reminder-button");
      await expect(reminder).toBeVisible();
      await reminder.click();
      const dialog = page.getByTestId("email-reminder-dialog");
      await expect(dialog.getByRole("heading", { name: "Email a reminder" })).toBeVisible();
      await expect(dialog).toContainText(REMINDER);
    }
  );

  test(
    "on desktop, Rename, Delete, and Outbox are inside the header overflow",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      const adminUserId = await seedTestAdmin();
      const studentId = await seedReadyStudent(adminUserId, "Overflow Menu Student");
      await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Overflow Menu Student" })).toBeVisible();

      const header = page.locator("header").filter({
        has: page.getByRole("heading", { name: "Overflow Menu Student" }),
      });
      // The student header has no Outbox control of its own. Outbox is in the overflow.
      await expect(header.getByRole("link", { name: "Outbox" })).toHaveCount(0);
      await expect(header.getByRole("button", { name: "Outbox" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Outbox" })).toHaveCount(0);

      const more = header.getByRole("button", { name: "More actions" });
      const menu = page.getByRole("dialog").filter({
        has: page.getByRole("button", { name: "Rename" }),
      });
      // The header button is in the server HTML. Click again once the client handler is live.
      await expect(async () => {
        if (!(await menu.isVisible())) await more.click();
        await expect(menu.getByRole("button", { name: "Rename" })).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 15_000 });
      await expect(menu.getByRole("button", { name: "Delete student" })).toBeVisible();
      await expect(menu.getByRole("link", { name: "Outbox" })).toBeVisible();
      await expect(header.getByRole("link", { name: "Outbox" })).toHaveCount(0);
      await expect(header.getByRole("button", { name: "Outbox" })).toHaveCount(0);
    }
  );

  test(
    "the personal owner opens Account & sharing and the page does not say the link works without an account",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedReadyStudent(adminUserId, "Share Sentence Student");
      await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("student-account-link").click();
      await expect(page).toHaveURL(new RegExp(`/admin/students/${studentId}/account$`));
      await expect(page.getByText(SHARE_SENTENCE)).toBeVisible();
      await expect(page.getByText("the link works without an account")).toHaveCount(0);
    }
  );

  test("the personal owner can go back from Account to the student", async ({ page }) => {
    const adminUserId = await seedTestAdmin();
    const studentId = await seedReadyStudent(adminUserId, "Account Back Student");
    await page.goto(`/admin/students/${studentId}/account`, { waitUntil: "domcontentloaded" });
    const back = page.getByRole("link", { name: "← Back to student" });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/admin/students/${studentId}$`));
  });

  test(
    "an organization instructor gets not found on the student page, Account & sharing, and the reminder dialog",
    { tag: [TAG.WB_CHROME] },
    async ({ browser }) => {
      const seeded = await withPrisma(async (prisma) => {
        const instructor = await prisma.adminUser.create({
          data: {
            email: `stage6-instructor-${Date.now()}@test.local`,
            role: "TUTOR",
            approvalStatus: "APPROVED",
            emailVerifiedAt: new Date("2026-01-01"),
            displayName: "Stage 6 Instructor",
          },
        });
        const org = await prisma.organization.create({
          data: {
            name: "Stage 6 School",
            status: "active",
            timezone: "America/Denver",
            createdByOperatorId: "stage6-operator@test.local",
            members: {
              create: [{ adminUserId: instructor.id, roles: ["instructor"] }],
            },
          },
        });
        const student = await prisma.student.create({
          data: {
            name: "Org Page Student",
            organizationId: org.id,
          },
        });
        await prisma.whiteboardSession.create({
          data: {
            adminUserId: instructor.id,
            studentId: student.id,
            endedAt: new Date(),
            eventsBlobUrl: "https://pw.local/stage6-org-events.json",
          },
        });
        return { instructor, studentId: student.id };
      });

      const { context, page } = await signIn(browser, {
        id: seeded.instructor.id,
        email: seeded.instructor.email,
        displayName: "Stage 6 Instructor",
      });
      try {
        await page.goto(`/admin/students/${seeded.studentId}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();

        await page.goto(`/admin/students/${seeded.studentId}/account`, {
          waitUntil: "domcontentloaded",
        });
        await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();

        await page.goto(`/admin/students/${seeded.studentId}/notes`, {
          waitUntil: "domcontentloaded",
        });
        await expect(page.getByRole("heading", { name: /Session notes/ })).toBeVisible();
        await expect(page.getByTestId("email-reminder-button")).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Email a reminder" })).toHaveCount(0);
      } finally {
        await context.close();
      }
    }
  );
});
