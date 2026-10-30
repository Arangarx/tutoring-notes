/**
 * Org sales stage 4 — booking on the organization home, and the taught session.
 * Tag: @wb-presence
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { TAG } from "../test-tags";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { uploadReplayEvents } from "./wb-replay-harness.helpers";

const { applyWbRegressionLocalDatabaseEnv } = require("../../scripts/wb-regression-local-db.cjs");
applyWbRegressionLocalDatabaseEnv();

const prisma = new PrismaClient();

function uniq(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  if (!secret) throw new Error("NEXTAUTH_SECRET is required");
  return secret;
}

async function signIn(
  browser: Browser,
  admin: { id: string; email: string; displayName: string }
): Promise<{ context: BrowserContext; page: import("@playwright/test").Page }> {
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
  const page = await context.newPage();
  return { context, page };
}

async function seedAdmin(label: string, approvalStatus: "APPROVED" | "WAITLISTED" = "APPROVED") {
  return prisma.adminUser.create({
    data: {
      email: `${uniq(label)}@example.com`,
      role: "TUTOR",
      approvalStatus,
      emailVerifiedAt: new Date("2026-01-01"),
      displayName: label,
      isTestAccount: false,
    },
  });
}

async function seedOrg() {
  const owner = await seedAdmin("Owner Ada");
  const org = await prisma.organization.create({
    data: {
      name: `Org ${uniq("booking")}`,
      status: "active",
      timezone: "America/Denver",
      createdByOperatorId: "org-operator@example.com",
      members: { create: [{ adminUserId: owner.id, roles: ["owner"] }] },
    },
  });
  return { org, owner };
}

async function seedLearner(
  organizationId: string,
  createdByAdminUserId: string,
  allowLiveSession = true,
  names?: { givenName: string; familyName: string }
) {
  const givenName = names?.givenName ?? "Mary Ann";
  const familyName = names?.familyName ?? "Lee";
  const fullName = `${givenName} ${familyName}`;
  const parentEmail = `${uniq("parent-secret")}@example.com`;
  const ah = await prisma.accountHolder.create({
    data: { email: `${uniq("ah")}@example.com`, emailVerifiedAt: new Date() },
  });
  const profile = await prisma.learnerProfile.create({
    data: { accountHolderId: ah.id, displayName: fullName, isSelfLearner: false },
  });
  const student = await prisma.student.create({
    data: {
      name: fullName,
      adminUserId: null,
      organizationId,
      learnerProfileId: profile.id,
      parentEmail,
    },
  });
  await prisma.organizationLearner.create({
    data: {
      studentId: student.id,
      organizationId,
      givenName,
      familyName,
      createdByAdminUserId,
    },
  });
  await prisma.consentRecord.create({
    data: {
      learnerProfileId: profile.id,
      adminUserId: null,
      organizationId,
      version: 1,
      allowLiveSession,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ah.id,
      captureMethod: "electronic",
    },
  });
  return { student, profile, parentEmail, fullName };
}

async function openNewSession(page: import("@playwright/test").Page) {
  const form = page.getByTestId("schedule-create-form");
  const trigger = page.getByTestId("schedule-new-session");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press("Escape");
    await trigger.click({ timeout: 5_000, force: attempt > 0 });
    try {
      await expect(form).toBeVisible({ timeout: 3_000 });
      return;
    } catch {
      // A refresh after save can remount the dialog closed.
    }
  }
  await expect(form).toBeVisible();
}

async function seedMember(
  organizationId: string,
  label: string,
  roles: Array<"owner" | "admin" | "scheduler" | "instructor">
) {
  const admin = await seedAdmin(label);
  await prisma.organizationMember.create({
    data: { organizationId, adminUserId: admin.id, roles },
  });
  return admin;
}

test.describe("org booking calls the bridge @wb-presence", { tag: [TAG.ORG, TAG.WB_PRESENCE] }, () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("a scheduler books, changes, and cancels an org appointment without a parent email", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const scheduler = await seedMember(org.id, "Sam Scheduler", ["scheduler"]);
    const instructor = await seedMember(org.id, "Ida Instructor", ["instructor"]);
    const { student, parentEmail } = await seedLearner(org.id, owner.id);
    const { context, page } = await signIn(browser, scheduler);
    try {
      await page.goto(`/admin/organization/${org.id}`);
      expect(page.url(), "session cookie was rejected").not.toContain("/login");
      await expect(page.getByTestId("org-schedule-week")).toContainText("America/Denver");
      await expect(page.getByText(parentEmail)).toHaveCount(0);

      await page.getByTestId("schedule-new-session").click();
      await page.getByTestId("schedule-instructor").click();
      await page.getByRole("option", { name: "Ida Instructor" }).click();
      await page.locator("#schedule-subject").fill("Algebra");
      await page.locator("#schedule-start").fill("16:00");
      await page.getByTestId("schedule-save-session").click();
      await expect(page.getByTestId("schedule-create-form")).toBeHidden({ timeout: 30_000 });

      const created = await prisma.scheduledSession.findFirstOrThrow({
        where: { studentId: student.id, subject: "Algebra" },
      });
      const row = page.getByTestId(`org-appointment-${created.id}`);
      await expect(row).toContainText("Ida Instructor");
      await expect(row).toContainText("Mary Ann Lee");
      await expect(row).toContainText(/\d:\d{2}/);
      expect(created.adminUserId).toBe(instructor.id);

      await page.getByTestId(`org-appointment-edit-${created.id}`).click();
      await page.locator("#schedule-subject").fill("Changed algebra");
      await page.locator("#schedule-date").fill("2026-11-02");
      await page.getByTestId("schedule-save-session").click();
      await expect(page.getByTestId("schedule-edit-form")).toBeHidden({ timeout: 30_000 });
      await expect(row).toContainText("Changed algebra");
      await expect(page.getByText(parentEmail)).toHaveCount(0);

      await page.getByTestId(`org-appointment-edit-${created.id}`).click();
      await page.getByTestId("schedule-cancel-session").click();
      await expect(page.getByTestId(`org-appointment-${created.id}`)).toHaveCount(0, { timeout: 30_000 });
      expect(await prisma.scheduledSession.count({ where: { id: created.id } })).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("a removed, unapproved, or non-instructor choice leaves no appointment", async ({ browser }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const scheduler = await seedMember(org.id, "Sam Scheduler", ["scheduler"]);
    const removed = await seedMember(org.id, "Remy Instructor", ["instructor"]);
    const unapproved = await seedMember(org.id, "Una Instructor", ["instructor"]);
    const dropped = await seedMember(org.id, "Ned Instructor", ["instructor"]);
    const { student } = await seedLearner(org.id, owner.id);
    const { context, page } = await signIn(browser, scheduler);
    try {
      await page.goto(`/admin/organization/${org.id}`);
      await expect(page.getByTestId("schedule-new-session")).toBeVisible();

      await prisma.organizationMember.update({
        where: { organizationId_adminUserId: { organizationId: org.id, adminUserId: removed.id } },
        data: { removedAt: new Date() },
      });
      await prisma.adminUser.update({
        where: { id: unapproved.id },
        data: { approvalStatus: "WAITLISTED" },
      });
      await prisma.organizationMember.update({
        where: { organizationId_adminUserId: { organizationId: org.id, adminUserId: dropped.id } },
        data: { roles: ["scheduler"] },
      });

      for (const [name, subject] of [
        ["Remy Instructor", "Removed slot"],
        ["Una Instructor", "Unapproved slot"],
        ["Ned Instructor", "Role slot"],
      ] as const) {
        await page.getByTestId("schedule-new-session").click();
        await page.getByTestId("schedule-instructor").click();
        await page.getByRole("option", { name }).click();
        await page.locator("#schedule-subject").fill(subject);
        await page.locator("#schedule-start").fill("16:00");
        await page.getByTestId("schedule-save-session").click();
        await expect(page.getByTestId("schedule-save-error")).toContainText(
          "That instructor cannot take this appointment.",
          { timeout: 30_000 }
        );
        expect(
          await prisma.scheduledSession.count({ where: { studentId: student.id, subject } })
        ).toBe(0);
        const close = page.getByTestId("schedule-create-form").getByRole("button", { name: "Close" });
        await expect(close).toBeEnabled();
        await close.click();
      }
    } finally {
      await context.close();
    }
  });

  test("an end before the start does not appear, and an overlap warns but still appears", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const scheduler = await seedMember(org.id, "Sam Scheduler", ["scheduler"]);
    const instructor = await seedMember(org.id, "Ida Instructor", ["instructor"]);
    const { student } = await seedLearner(org.id, owner.id);
    const { context, page } = await signIn(browser, scheduler);
    try {
      await page.goto(`/admin/organization/${org.id}`);
      await openNewSession(page);
      await page.getByTestId("schedule-instructor").click();
      await page.getByRole("option", { name: "Ida Instructor" }).click();
      await page.locator("#schedule-subject").fill("Backwards");
      await page.locator("#schedule-start").fill("16:00");
      await expect(page.locator("#schedule-end")).toHaveValue("17:00");
      await page.locator("#schedule-end").fill("15:00");
      await expect(page.locator("#schedule-end")).toHaveValue("15:00");
      await page.getByTestId("schedule-save-session").click();
      const longConfirm = page.getByTestId("schedule-long-session-confirm");
      await expect(longConfirm).toBeVisible({ timeout: 30_000 });
      await expect(longConfirm).toContainText("23 hours, ending the next day");
      expect(
        await prisma.scheduledSession.count({ where: { studentId: student.id, subject: "Backwards" } })
      ).toBe(0);
      await expect(page.getByText("Backwards")).toHaveCount(0);
      await page.getByTestId("schedule-long-session-back").click();
      await expect(longConfirm).toBeHidden();
      const close = page.getByTestId("schedule-create-form").getByRole("button", { name: "Close" });
      await expect(close).toBeEnabled();
      await close.click();
      await expect(page.getByTestId("schedule-create-form")).toBeHidden();

      await openNewSession(page);
      await page.getByTestId("schedule-instructor").click();
      await page.getByRole("option", { name: "Ida Instructor" }).click();
      await page.locator("#schedule-subject").fill("Algebra");
      await page.locator("#schedule-start").fill("16:00");
      await page.getByTestId("schedule-save-session").click();
      await expect(page.getByTestId("schedule-create-form")).toBeHidden({ timeout: 30_000 });
      const first = await prisma.scheduledSession.findFirstOrThrow({
        where: { studentId: student.id, subject: "Algebra" },
      });
      await expect(page.getByTestId(`org-appointment-${first.id}`)).toBeVisible();

      await openNewSession(page);
      await page.getByTestId("schedule-instructor").click();
      await page.getByRole("option", { name: "Ida Instructor" }).click();
      await page.locator("#schedule-subject").fill("Geometry");
      await page.locator("#schedule-start").fill("16:30");
      await page.getByTestId("schedule-save-session").click();
      await expect(page.getByTestId("schedule-overlap-warning")).toBeVisible({ timeout: 30_000 });
      const second = await prisma.scheduledSession.findFirstOrThrow({
        where: { studentId: student.id, subject: "Geometry" },
      });
      await expect(page.getByTestId(`org-appointment-${second.id}`)).toContainText("Mary Ann Lee");
      await expect(page.getByTestId(`org-appointment-${second.id}`)).toContainText(instructor.displayName!);
      expect(second.startAt!.getTime()).toBeLessThan(first.endAt!.getTime());
    } finally {
      await context.close();
    }
  });

  test("the assigned instructor opens the review, and other staff are not found", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { org, owner } = await seedOrg();
    const scheduler = await seedMember(org.id, "Sam Scheduler", ["scheduler"]);
    const instructor = await seedMember(org.id, "Ida Instructor", ["instructor"]);
    const other = await seedMember(org.id, "Otto Instructor", ["instructor"]);
    const { student } = await seedLearner(org.id, owner.id);
    const session = await prisma.whiteboardSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://blob.example.com/org-booking-events.json",
        sessionPhase: "ACTIVE",
        endedAt: new Date(),
        durationSeconds: 120,
      },
    });
    await prisma.tutorNote.create({
      data: {
        sessionId: session.id,
        status: "done",
        content: JSON.stringify({
          topics: "Quadratic factoring",
          assessment: "",
          nextSteps: "",
          links: "",
        }),
        generatedAt: new Date(),
      },
    });
    await prisma.sessionRecording.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        whiteboardSessionId: session.id,
        blobUrl: "https://blob.example.com/org-booking-audio.webm",
        mimeType: "audio/webm",
        sizeBytes: 128,
        durationSeconds: 30,
      },
    });
    await prisma.transcriptChunk.create({
      data: {
        sessionId: session.id,
        chunkBlobUrl: "https://blob.example.com/org-booking-chunk.webm",
        recordingTimeOffsetMs: 0,
        transcript: "The student solved for x.",
        status: "done",
      },
    });
    const workspace = `/admin/students/${student.id}/whiteboard/${session.id}/workspace`;

    const instructorSession = await signIn(browser, instructor);
    try {
      await uploadReplayEvents({
        request: instructorSession.page.request,
        adminUserId: instructor.id,
        studentId: student.id,
        whiteboardSessionId: session.id,
      });
      await instructorSession.page.goto(workspace);
      await expect(instructorSession.page.getByTestId("wb-session-review-mode")).toBeVisible();
      await expect(instructorSession.page.locator("#wb-note-topics")).toHaveValue("Quadratic factoring");
      await expect(instructorSession.page.getByTestId("wb-review-transcript")).toContainText(
        "The student solved for x."
      );
      await instructorSession.page.getByTestId("wb-review-enter-replay").click();
      await expect(instructorSession.page.getByTestId("wb-replay-play-toggle")).toBeVisible({
        timeout: 20_000,
      });
      await expect(instructorSession.page.getByTestId("wb-replay-audio")).toBeAttached();
    } finally {
      await instructorSession.context.close();
    }

    for (const stranger of [scheduler, other]) {
      const guest = await signIn(browser, stranger);
      try {
        await guest.page.goto(workspace);
        await expect(guest.page.getByRole("heading", { name: "Not found" })).toBeVisible();
      } finally {
        await guest.context.close();
      }
    }
  });

  test("the assigned instructor sees their taught session on the organization home, and another instructor does not @wb-presence", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedMember(org.id, "Ida Instructor", ["instructor"]);
    const other = await seedMember(org.id, "Otto Instructor", ["instructor"]);
    const { student, parentEmail } = await seedLearner(org.id, owner.id);
    const session = await prisma.whiteboardSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://blob.example.com/org-taught-list-events.json",
        sessionPhase: "ACTIVE",
        endedAt: new Date(),
        durationSeconds: 120,
      },
    });

    const instructorSession = await signIn(browser, instructor);
    try {
      await instructorSession.page.goto(`/admin/organization/${org.id}`);
      expect(instructorSession.page.url(), "session cookie was rejected").not.toContain("/login");
      const link = instructorSession.page.getByTestId(`org-taught-session-${session.id}`);
      await expect(link).toBeVisible();
      await expect(link).toHaveText("Mary Ann Lee");
      await expect(link).not.toContainText(parentEmail);
      await expect(instructorSession.page.getByText(parentEmail)).toHaveCount(0);
    } finally {
      await instructorSession.context.close();
    }

    const otherSession = await signIn(browser, other);
    try {
      await otherSession.page.goto(`/admin/organization/${org.id}`);
      expect(otherSession.page.url(), "session cookie was rejected").not.toContain("/login");
      await expect(otherSession.page.getByTestId(`org-taught-session-${session.id}`)).toHaveCount(0);
      await expect(otherSession.page.getByText(parentEmail)).toHaveCount(0);
    } finally {
      await otherSession.context.close();
    }
  });

  test("live start is refused when consent is off, and in-person start activates", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedMember(org.id, "Ida Instructor", ["instructor"]);
    const { student } = await seedLearner(org.id, owner.id, false);
    const appointment = await prisma.scheduledSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        date: new Date("2026-10-20T00:00:00.000Z"),
        startTime: "16:00",
        endTime: "17:00",
        startAt: new Date("2026-10-20T22:00:00.000Z"),
        endAt: new Date("2026-10-20T23:00:00.000Z"),
        plannedDurationMinutes: 60,
        subject: "Algebra",
      },
    });
    const { context, page } = await signIn(browser, instructor);
    try {
      await page.goto(`/admin/organization/${org.id}`);
      await page.getByTestId(`open-scheduled-room-${appointment.id}`).click();
      await page.waitForURL(/\/whiteboard\/[^/]+\/workspace/);
      const sessionId = page.url().match(/whiteboard\/([^/]+)\/workspace/)?.[1];
      if (!sessionId) throw new Error("workspace url missing session id");

      await expect(page.getByTestId("wb-session-mode-live")).toHaveCount(0);
      await expect(page.getByTestId("wb-session-mode-in-person")).toBeVisible();
      await expect(page.getByTestId("wb-session-mode-in-person")).toHaveAttribute("aria-pressed", "true");

      let rewrite = true;
      await page.route("**/*", async (route) => {
        const request = route.request();
        const body = request.postData() ?? "";
        if (
          rewrite &&
          request.method() === "POST" &&
          body.includes(sessionId) &&
          body.includes("IN_PERSON")
        ) {
          rewrite = false;
          await route.continue({ postData: body.replace("IN_PERSON", "LIVE") });
          return;
        }
        await route.continue();
      });

      const liveResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          (response.request().postData() ?? "").includes(sessionId)
      );
      await page.getByTestId("wb-start-session").click();
      await liveResponse;
      const afterLive = await prisma.whiteboardSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(afterLive.sessionPhase).toBe("PENDING");

      await page.unroute("**/*");
      const inPersonResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          (response.request().postData() ?? "").includes("IN_PERSON")
      );
      await page.getByTestId("wb-start-session").click();
      await inPersonResponse;
      const afterInPerson = await prisma.whiteboardSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(afterInPerson.sessionPhase).toBe("ACTIVE");
      expect(afterInPerson.sessionMode).toBe("IN_PERSON");
    } finally {
      await context.close();
    }
  });
});

/**
 * LEAK-1: an instructor-only member who opens the org page must not learn
 * other instructors' appointments or learners. Oracles are seeded names.
 */
test.describe("instructor scoping on the org page", { tag: [TAG.ORG, TAG.WB_PRESENCE] }, () => {
  async function seedSplitRoster() {
    const token = uniq("scope").replace(/[^a-z0-9]/gi, "").slice(-10);
    const adaLearner = { givenName: `Zada${token}`, familyName: "Quin" };
    const beaLearner = { givenName: `Zeba${token}`, familyName: "Quinn" };
    const unaLearner = { givenName: `Zuna${token}`, familyName: "Quill" };
    const adaInstructorName = `TutorAda ${token}`;
    const beaInstructorName = `TutorBea ${token}`;
    const { org, owner } = await seedOrg();
    const instructorA = await seedMember(org.id, adaInstructorName, ["instructor"]);
    const instructorB = await seedMember(org.id, beaInstructorName, ["instructor"]);
    const learnerA = await seedLearner(org.id, owner.id, true, adaLearner);
    const learnerB = await seedLearner(org.id, owner.id, true, beaLearner);
    const unbooked = await seedLearner(org.id, owner.id, true, unaLearner);
    const appointment = {
      date: new Date("2026-10-20T00:00:00.000Z"),
      startTime: "16:00",
      endTime: "17:00",
      startAt: new Date("2026-10-20T22:00:00.000Z"),
      endAt: new Date("2026-10-20T23:00:00.000Z"),
      plannedDurationMinutes: 60,
    };
    await prisma.scheduledSession.create({
      data: {
        ...appointment,
        adminUserId: instructorA.id,
        studentId: learnerA.student.id,
        subject: "Algebra",
      },
    });
    await prisma.scheduledSession.create({
      data: {
        ...appointment,
        startTime: "18:00",
        endTime: "19:00",
        adminUserId: instructorB.id,
        studentId: learnerB.student.id,
        subject: "Geometry",
      },
    });
    return {
      org,
      owner,
      instructorA,
      instructorB,
      learnerA,
      learnerB,
      unbooked,
      adaInstructorName,
      beaInstructorName,
    };
  }

  async function openOrg(
    browser: Browser,
    admin: { id: string; email: string; displayName: string | null },
    path: string
  ) {
    const session = await signIn(browser, {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName ?? admin.email,
    });
    const response = await session.page.goto(path);
    expect(session.page.url(), "session cookie was rejected").not.toContain("/login");
    return { ...session, response };
  }

  test("an instructor sees only their own org appointments", async ({ browser }) => {
    test.setTimeout(120_000);
    const seeded = await seedSplitRoster();
    const { context, page } = await openOrg(
      browser,
      seeded.instructorA,
      `/admin/organization/${seeded.org.id}`
    );
    try {
      await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
      await expect(page.getByText(seeded.learnerA.fullName)).toBeVisible();
      await expect(page.getByText(seeded.learnerB.fullName)).toHaveCount(0);
      await expect(page.getByText(seeded.beaInstructorName)).toHaveCount(0);
      await expect(page.getByText(seeded.unbooked.fullName)).toHaveCount(0);
      await expect(page.getByTestId("schedule-new-session")).toHaveCount(0);
      const html = await page.content();
      expect(html).toContain(seeded.learnerA.fullName);
      expect(html).not.toContain(seeded.learnerB.fullName);
      expect(html).not.toContain(seeded.beaInstructorName);
      expect(html).not.toContain(seeded.unbooked.fullName);
    } finally {
      await context.close();
    }
  });

  test("an instructor gets no booking dialog or learner choices", async ({ browser }) => {
    test.setTimeout(120_000);
    const seeded = await seedSplitRoster();
    const { context, page } = await openOrg(
      browser,
      seeded.instructorA,
      `/admin/organization/${seeded.org.id}`
    );
    try {
      await expect(page.getByTestId("schedule-new-session")).toHaveCount(0);
      await expect(page.getByTestId("schedule-create-form")).toHaveCount(0);
      const html = await page.content();
      expect(html).not.toContain(seeded.unbooked.fullName);
      expect(html).not.toContain("<option");
    } finally {
      await context.close();
    }
  });

  test("an instructor gets nothing for another instructor's learner or an invalid id", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const seeded = await seedSplitRoster();
    const { context, page } = await openOrg(
      browser,
      seeded.instructorA,
      `/admin/organization/${seeded.org.id}?learner=${seeded.learnerA.student.id}`
    );
    try {
      await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
      await expect(page.getByText(seeded.learnerA.fullName)).toBeVisible();
      await expect(page.getByText(seeded.learnerB.fullName)).toHaveCount(0);
      const ownHtml = await page.content();
      expect(ownHtml).toContain(seeded.learnerA.fullName);
      expect(ownHtml).not.toContain(seeded.learnerB.fullName);

      const otherUrl = `/admin/organization/${seeded.org.id}?learner=${seeded.learnerB.student.id}`;
      const otherResponse = await page.goto(otherUrl);
      expect(otherResponse?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Not found" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
      await expect(page.getByText("No appointments yet.")).toBeVisible();
      const otherText = await page.locator("section[aria-label='Appointments']").innerText();
      const otherHtml = await page.content();
      expect(otherHtml).not.toContain(seeded.learnerA.fullName);
      expect(otherHtml).not.toContain(seeded.learnerB.fullName);
      expect(otherHtml).not.toContain(seeded.unbooked.fullName);
      expect(otherHtml).not.toContain(seeded.beaInstructorName);

      const invalidResponse = await page.goto(
        `/admin/organization/${seeded.org.id}?learner=not-a-learner-${uniq("missing")}`
      );
      expect(invalidResponse?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Not found" })).toHaveCount(0);
      await expect(page.getByText("No appointments yet.")).toBeVisible();
      const invalidText = await page.locator("section[aria-label='Appointments']").innerText();
      expect(invalidText).toBe(otherText);
      const invalidHtml = await page.content();
      expect(invalidHtml).not.toContain(seeded.learnerA.fullName);
      expect(invalidHtml).not.toContain(seeded.learnerB.fullName);

      const otherOrg = await seedOrg();
      const foreignToken = uniq("foreign").replace(/[^a-z0-9]/gi, "").slice(-8);
      const foreign = await seedLearner(otherOrg.org.id, otherOrg.owner.id, true, {
        givenName: `Zora${foreignToken}`,
        familyName: "Quo",
      });
      await prisma.scheduledSession.create({
        data: {
          adminUserId: seeded.instructorA.id,
          studentId: foreign.student.id,
          date: new Date("2026-10-20T00:00:00.000Z"),
          startTime: "16:00",
          endTime: "17:00",
          startAt: new Date("2026-10-20T22:00:00.000Z"),
          endAt: new Date("2026-10-20T23:00:00.000Z"),
          plannedDurationMinutes: 60,
          subject: "Foreign algebra",
        },
      });
      const foreignResponse = await page.goto(
        `/admin/organization/${seeded.org.id}?learner=${foreign.student.id}`
      );
      expect(foreignResponse?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Not found" })).toHaveCount(0);
      await expect(page.getByText("No appointments yet.")).toBeVisible();
      const foreignText = await page.locator("section[aria-label='Appointments']").innerText();
      expect(foreignText).toBe(invalidText);
      const foreignHtml = await page.content();
      expect(foreignHtml).not.toContain(foreign.fullName);
      expect(foreignHtml).not.toContain(foreign.parentEmail);
    } finally {
      await context.close();
    }
  });

  test("a staff member still sees every org appointment", async ({ browser }) => {
    test.setTimeout(120_000);
    const seeded = await seedSplitRoster();
    const { context, page } = await openOrg(
      browser,
      seeded.owner,
      `/admin/organization/${seeded.org.id}`
    );
    try {
      await expect(page.getByText(seeded.learnerA.fullName).first()).toBeVisible();
      await expect(page.getByText(seeded.learnerB.fullName).first()).toBeVisible();
      const html = await page.content();
      expect(html).toContain(seeded.learnerA.fullName);
      expect(html).toContain(seeded.learnerB.fullName);

      await page.goto(
        `/admin/organization/${seeded.org.id}?learner=${seeded.learnerB.student.id}`
      );
      await expect(page.getByText(seeded.learnerA.fullName).first()).toBeVisible();
      await expect(page.getByText(seeded.learnerB.fullName).first()).toBeVisible();

      await page.goto(
        `/admin/organization/${seeded.org.id}?learner=not-a-learner-${uniq("missing")}`
      );
      await expect(page.getByText(seeded.learnerA.fullName).first()).toBeVisible();
      await expect(page.getByText(seeded.learnerB.fullName).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
