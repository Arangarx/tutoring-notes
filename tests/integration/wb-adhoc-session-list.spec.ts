/**
 * An ad-hoc tutor start (the real Start whiteboard session control, with no
 * appointment seeded ahead of time) must show on the parent list and the
 * child list immediately.
 */

import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TAG } from "../test-tags";
import { seedTestAdmin } from "../visual/helpers";
import { seedParentAccountHolder } from "./identity/identity.helpers";
import { loginLearnerInContext } from "./whiteboard-live-sync.helpers";

test.describe("ad-hoc session on family lists", { tag: [TAG.WB_PRESENCE] }, () => {
  test("tutor Start shows the same upcoming row on the parent dashboard and the child join list", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const adminUserId = await seedTestAdmin();
    const accountHolderId = await seedParentAccountHolder();
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const username = `adhoc${suffix}`.toLowerCase();
    const pin = "AdhocPin!456";
    const prisma = new PrismaClient();
    let studentId = "";
    let familyId = "";
    try {
      const parent = await prisma.accountHolder.findUniqueOrThrow({
        where: { id: accountHolderId },
        select: { familyId: true },
      });
      familyId = parent.familyId ?? `pwparent${suffix}`.toLowerCase();
      if (!parent.familyId) {
        await prisma.accountHolder.update({
          where: { id: accountHolderId },
          data: { familyId },
        });
      }
      const profile = await prisma.learnerProfile.create({
        data: {
          accountHolderId,
          displayName: `Ad hoc child ${suffix}`,
          accessMode: "child_pin_required",
          isSelfLearner: false,
        },
        select: { id: true },
      });
      const student = await prisma.student.create({
        data: {
          name: `Ad hoc child ${suffix}`,
          adminUserId,
          learnerProfileId: profile.id,
        },
        select: { id: true },
      });
      studentId = student.id;
      await prisma.learnerCredential.create({
        data: {
          learnerProfileId: profile.id,
          accountHolderId,
          username,
          secretHash: await bcrypt.hash(pin, 10),
        },
      });
      await prisma.consentRecord.create({
        data: {
          learnerProfileId: profile.id,
          adminUserId,
          version: 1,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
          setByAccountHolderId: accountHolderId,
          captureMethod: "electronic",
        },
      });
      const alreadyBooked = await prisma.scheduledSession.count({
        where: { studentId },
      });
      expect(alreadyBooked).toBe(0);
    } finally {
      await prisma.$disconnect();
    }

    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const parentContext = await browser.newContext({
      storageState: "tests/integration/.auth/parent.json",
      viewport: { width: 1280, height: 900 },
    });
    const childContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    try {
      const tutorPage = await tutorContext.newPage();
      await tutorPage.goto(`/admin/students/${studentId}`, {
        waitUntil: "domcontentloaded",
      });
      const startBtn = tutorPage
        .getByTestId("student-ready-to-teach-banner")
        .getByTestId("start-whiteboard-session-btn");
      await expect(startBtn).toBeVisible();
      await expect(startBtn).toBeEnabled();
      await startBtn.click();
      await tutorPage.waitForURL(
        (url) => /\/whiteboard\/[^/]+\/workspace$/.test(url.pathname),
        { timeout: 45_000, waitUntil: "commit" }
      );
      const whiteboardSessionId = tutorPage.url().match(/\/whiteboard\/([^/]+)\/workspace/)?.[1];
      expect(whiteboardSessionId).toBeTruthy();

      const readPrisma = new PrismaClient();
      let scheduledSessionId: string | null = null;
      let subject = "";
      try {
        const whiteboard = await readPrisma.whiteboardSession.findUniqueOrThrow({
          where: { id: whiteboardSessionId! },
          select: { scheduledSessionId: true, studentId: true },
        });
        expect(whiteboard.studentId).toBe(studentId);
        scheduledSessionId = whiteboard.scheduledSessionId;
        expect(scheduledSessionId, "ad-hoc start links a ScheduledSession").toBeTruthy();
        const appointment = await readPrisma.scheduledSession.findUniqueOrThrow({
          where: { id: scheduledSessionId! },
          select: { subject: true, studentId: true },
        });
        expect(appointment.studentId).toBe(studentId);
        subject = appointment.subject;
        expect(subject).toBe("Tutoring session.");
      } finally {
        await readPrisma.$disconnect();
      }

      const rowId = `upcoming-session-row-${scheduledSessionId}`;
      const parentPage = await parentContext.newPage();
      await parentPage.goto("/account/dashboard", { waitUntil: "domcontentloaded" });
      const parentRow = parentPage.getByTestId(rowId);
      await expect(parentRow).toBeVisible({ timeout: 15_000 });
      await expect(parentRow).toContainText(subject);

      await loginLearnerInContext(childContext, `${username}@${familyId}`, pin);
      const childPage = await childContext.newPage();
      await childPage.goto("/join", { waitUntil: "domcontentloaded" });
      const childRow = childPage.getByTestId(rowId);
      await expect(childRow).toBeVisible({ timeout: 15_000 });
      await expect(childRow).toContainText(subject);
    } finally {
      await childContext.close();
      await parentContext.close();
      await tutorContext.close();
    }
  });
});
