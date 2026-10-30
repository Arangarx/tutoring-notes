/**
 * Org sales stage 4 — booking on the organization home, and the taught session.
 * Tag: @wb-presence
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { TAG } from "../test-tags";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { uploadReplayEvents } from "./wb-replay-harness.helpers";
import { expectReasonUnderControl } from "./entry-reason.helpers";

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
  admin: { id: string; email: string; displayName: string | null }
): Promise<{ context: BrowserContext; page: import("@playwright/test").Page }> {
  const token = await encode({
    token: {
      sub: admin.id,
      email: admin.email,
      name: admin.displayName ?? admin.email,
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
      await expect(instructorSession.page.getByTestId("wb-review-transcript")).not.toBeVisible();
      await instructorSession.page.getByRole("button", { name: "Show transcript" }).click();
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

  // --- Org UX W4: the reason is on screen wherever the control is ---------------------

  async function seedHourAheadAppointment(adminUserId: string, studentId: string) {
    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return prisma.scheduledSession.create({
      data: {
        adminUserId,
        studentId,
        date: startAt,
        startTime: "16:00",
        endTime: "17:00",
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
        plannedDurationMinutes: 60,
        subject: "Algebra",
      },
    });
  }

  test("online sessions off: Open room is reachable on the org home and the Schedule, each with the reason under it", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedMember(org.id, "Ida Instructor", ["instructor"]);
    const { student } = await seedLearner(org.id, owner.id, false);
    const appointment = await seedHourAheadAppointment(instructor.id, student.id);
    const expected =
      "Live sessions are off in Mary Ann Lee's privacy settings. You can still open the room in person.";

    const { context, page } = await signIn(browser, instructor);
    try {
      for (const route of [`/admin/organization/${org.id}`, "/admin/schedule"]) {
        await page.goto(route);
        expect(page.url(), "session cookie was rejected").not.toContain("/login");
        const button = page.getByTestId(`open-scheduled-room-${appointment.id}`);
        // Reachable: online-off blocks ONLINE only (Decision 5).
        await expect(button, route).toBeEnabled();
        await expectReasonUnderControl(
          button,
          page.getByTestId(`open-scheduled-room-reason-${appointment.id}`),
          expected
        );
      }
    } finally {
      await context.close();
    }
  });

  test("no consent record: Open room is off with the reason under it, in person included", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedMember(org.id, "Ida Instructor", ["instructor"]);
    const { student, profile } = await seedLearner(org.id, owner.id, true);
    await prisma.consentRecord.deleteMany({ where: { learnerProfileId: profile.id } });
    const appointment = await seedHourAheadAppointment(instructor.id, student.id);

    const { context, page } = await signIn(browser, instructor);
    try {
      await page.goto(`/admin/organization/${org.id}`);
      expect(page.url(), "session cookie was rejected").not.toContain("/login");
      const button = page.getByTestId(`open-scheduled-room-${appointment.id}`);
      await expect(button).toBeDisabled();
      // Both modes are closed, so the in-person hint must not appear.
      await expectReasonUnderControl(
        button,
        page.getByTestId(`open-scheduled-room-reason-${appointment.id}`),
        "The parent hasn't finished privacy preferences yet."
      );

      // Showing the page opened nothing (the server-side refusal is table-tested in jest:
      // session-entry-parity.integration.test.ts drives the bridge and Start directly).
      expect(
        await prisma.whiteboardSession.count({ where: { scheduledSessionId: appointment.id } })
      ).toBe(0);
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


/**
 * W3: an org appointment shows on the assigned instructor's Schedule and ICS feed.
 * Oracles are seeded ids and strings. Appointments are seeded for today, in the
 * browser's own zone, so the Month day detail and the Agenda both list them.
 */
test.describe("org appointments on the instructor Schedule", { tag: [TAG.ORG, TAG.WB_PRESENCE] }, () => {
  const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** An instructor whose Schedule is displayed in this machine's zone. */
  async function seedInstructor(
    organizationId: string,
    label: string,
    roles: Array<"owner" | "admin" | "scheduler" | "instructor"> = ["instructor"]
  ) {
    const admin = await seedMember(organizationId, label, roles);
    await prisma.adminUser.update({ where: { id: admin.id }, data: { tutorTimezone: LOCAL_TZ } });
    return admin;
  }

  async function seedToday(adminUserId: string, studentId: string, subject: string, hour: number) {
    const now = new Date();
    const startAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0);
    return prisma.scheduledSession.create({
      data: {
        adminUserId,
        studentId,
        date: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
        startTime: `${String(hour).padStart(2, "0")}:00`,
        endTime: `${String(hour + 1).padStart(2, "0")}:00`,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
        plannedDurationMinutes: 60,
        subject,
      },
    });
  }

  async function seedFeedToken(adminUserId: string): Promise<string> {
    const token = uniq("w3-feed").replace(/[^a-z0-9]/gi, "");
    await prisma.calendarFeedToken.create({ data: { adminUserId, token } });
    return token;
  }

  async function readFeed(
    page: import("@playwright/test").Page,
    token: string
  ): Promise<{ text: string; uids: string[] }> {
    const response = await page.request.get(`/api/calendar/ics/${token}`);
    expect(response.status()).toBe(200);
    const text = (await response.text()).replace(/\r\n[ \t]/g, "");
    const uids = [...text.matchAll(/^UID:(.+)@usemynk\.com\r?$/gm)].map((match) => match[1]).sort();
    return { text, uids };
  }

  async function openSchedule(
    browser: Browser,
    admin: { id: string; email: string; displayName: string | null },
    viewport?: { width: number; height: number }
  ) {
    const session = await signIn(browser, {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName ?? admin.email,
    });
    if (viewport) await session.page.setViewportSize(viewport);
    await session.page.goto("/admin/schedule");
    expect(session.page.url(), "session cookie was rejected").not.toContain("/login");
    await expect(session.page.getByTestId("schedule-page")).toBeVisible();
    return session;
  }

  const rowFor = (page: import("@playwright/test").Page, id: string) =>
    page.locator(`[data-session-id="${id}"]`);

  async function showAgenda(page: import("@playwright/test").Page) {
    await page.getByTestId("schedule-agenda-tab").click();
    await expect(page.getByTestId("schedule-agenda-row").first()).toBeVisible();
  }

  async function agendaIds(page: import("@playwright/test").Page): Promise<string[]> {
    await showAgenda(page);
    const ids = await page
      .getByTestId("schedule-agenda-row")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-session-id") ?? ""));
    return ids.sort();
  }

  test("a scheduler-booked appointment appears on the instructor's Schedule with the organization badge", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id, "Ida Instructor");
    const learner = await seedLearner(org.id, owner.id);
    const appointment = await seedToday(instructor.id, learner.student.id, "Algebra", 10);

    const { context, page } = await openSchedule(browser, instructor);
    try {
      // Month day detail (today is selected by default).
      const monthRow = rowFor(page, appointment.id);
      await expect(monthRow).toContainText(learner.fullName);
      await expect(monthRow.getByTestId("org-badge")).toHaveText(`via ${org.name}`);

      await showAgenda(page);
      const agendaRow = rowFor(page, appointment.id);
      await expect(agendaRow).toContainText(learner.fullName);
      await expect(agendaRow.getByTestId("org-badge")).toHaveText(`via ${org.name}`);
    } finally {
      await context.close();
    }
  });

  test("the instructor cannot edit or delete an org appointment from Schedule", async ({ browser }) => {
    test.setTimeout(180_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id, "Ida Instructor");
    const ownerInstructor = await seedInstructor(org.id, "Olive Owner", ["owner", "instructor"]);
    const learner = await seedLearner(org.id, owner.id);

    for (const actor of [instructor, ownerInstructor]) {
      const personalStudent = await prisma.student.create({
        data: { name: `Pat ${uniq("personal")}`, adminUserId: actor.id },
      });
      const orgRow = await seedToday(actor.id, learner.student.id, "Algebra", 10);
      const personalRow = await seedToday(actor.id, personalStudent.id, "Chemistry", 12);

      const { context, page } = await openSchedule(browser, actor);
      try {
        for (const view of ["month", "agenda"] as const) {
          if (view === "agenda") await showAgenda(page);
          const org$ = rowFor(page, orgRow.id);
          await expect(org$).toBeVisible();
          await expect(org$.getByRole("button", { name: "Edit" })).toHaveCount(0);
          await expect(org$.getByTestId("schedule-edit-session")).toHaveCount(0);
          await expect(org$.getByTestId("schedule-start-session")).toHaveCount(0);
          await expect(org$.getByTestId(`open-scheduled-room-${orgRow.id}`)).toBeVisible();

          const personal$ = rowFor(page, personalRow.id);
          await expect(personal$.getByRole("button", { name: "Edit" })).toBeVisible();
          await expect(personal$.getByTestId("schedule-start-session")).toBeVisible();
        }
      } finally {
        await context.close();
      }
    }
  });

  test("another instructor's Schedule does not show it", async ({ browser }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id, "Ida Instructor");
    const rival = await seedInstructor(org.id, "Otto Rival");
    const learner = await seedLearner(org.id, owner.id);
    const subject = `Secret ${uniq("subject")}`;
    const appointment = await seedToday(instructor.id, learner.student.id, subject, 10);

    const mine = await openSchedule(browser, instructor);
    try {
      await expect(rowFor(mine.page, appointment.id)).toBeVisible();
    } finally {
      await mine.context.close();
    }

    const theirs = await openSchedule(browser, rival);
    try {
      await theirs.page.getByTestId("schedule-agenda-tab").click();
      await expect(theirs.page.getByText("No upcoming sessions scheduled.")).toBeVisible();
      const html = await theirs.page.content();
      expect(html).not.toContain(appointment.id);
      expect(html).not.toContain(learner.fullName);
      expect(html).not.toContain(subject);
      expect(html).not.toContain(org.name);
    } finally {
      await theirs.context.close();
    }
  });

  test("a removed instructor's Schedule and feed lose org rows", async ({ browser }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id, "Ida Instructor");
    const learner = await seedLearner(org.id, owner.id);
    const personalStudent = await prisma.student.create({
      data: { name: `Pat ${uniq("personal")}`, adminUserId: instructor.id },
    });
    const orgRow = await seedToday(instructor.id, learner.student.id, "Algebra", 10);
    const personalRow = await seedToday(instructor.id, personalStudent.id, "Chemistry", 12);
    const token = await seedFeedToken(instructor.id);

    const { context, page } = await openSchedule(browser, instructor);
    try {
      await expect(rowFor(page, orgRow.id)).toBeVisible();
      expect((await readFeed(page, token)).uids).toEqual([orgRow.id, personalRow.id].sort());

      await prisma.organizationMember.update({
        where: {
          organizationId_adminUserId: { organizationId: org.id, adminUserId: instructor.id },
        },
        data: { removedAt: new Date() },
      });

      await page.goto("/admin/schedule");
      await expect(rowFor(page, personalRow.id)).toBeVisible();
      await expect(rowFor(page, orgRow.id)).toHaveCount(0);
      expect(await page.content()).not.toContain(learner.fullName);
      expect((await readFeed(page, token)).uids).toEqual([personalRow.id]);
    } finally {
      await context.close();
    }
  });

  test("the ICS feed and the Schedule list the same appointments", async ({ browser }) => {
    test.setTimeout(120_000);
    const first = await seedOrg();
    const second = await seedOrg();
    const instructor = await seedInstructor(first.org.id, "Ida Instructor");
    await prisma.organizationMember.create({
      data: { organizationId: second.org.id, adminUserId: instructor.id, roles: ["instructor"] },
    });
    const rival = await seedInstructor(first.org.id, "Otto Rival");
    const learnerFirst = await seedLearner(first.org.id, first.owner.id);
    const learnerSecond = await seedLearner(second.org.id, second.owner.id);
    const learnerRival = await seedLearner(first.org.id, first.owner.id);
    const personalStudent = await prisma.student.create({
      data: { name: `Pat ${uniq("personal")}`, adminUserId: instructor.id },
    });
    const a = await seedToday(instructor.id, learnerFirst.student.id, "Algebra", 9);
    const b = await seedToday(instructor.id, learnerSecond.student.id, "Biology", 11);
    const c = await seedToday(instructor.id, personalStudent.id, "Chemistry", 13);
    const distractor = await seedToday(rival.id, learnerRival.student.id, "Drama", 15);
    const token = await seedFeedToken(instructor.id);
    const seeded = [a.id, b.id, c.id].sort();

    const { context, page } = await openSchedule(browser, instructor);
    try {
      const scheduleIds = await agendaIds(page);
      const feed = await readFeed(page, token);
      expect(scheduleIds).toEqual(seeded);
      expect(feed.uids).toEqual(seeded);
      expect(feed.uids).not.toContain(distractor.id);
    } finally {
      await context.close();
    }
  });

  test("the feed never carries the learner's parent email, brief, or surname", async ({ browser }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id, "Ida Instructor");
    const marker = uniq("feed").replace(/[^a-z0-9]/gi, "").slice(-8);
    const learner = await seedLearner(org.id, owner.id, true, {
      givenName: `Gale${marker}`,
      familyName: `Surnamezz${marker}`,
    });
    const brief = `brief-secret-${marker}`;
    await prisma.organizationLearner.update({
      where: { studentId: learner.student.id },
      data: { brief },
    });
    const appointment = await seedToday(instructor.id, learner.student.id, "Algebra", 10);
    const token = await seedFeedToken(instructor.id);

    const { context, page } = await openSchedule(browser, instructor);
    try {
      const feed = await readFeed(page, token);
      expect(feed.uids).toEqual([appointment.id]);
      expect(feed.text).toContain(`SUMMARY:Tutoring — Gale${marker} S.`);
      expect(feed.text).not.toContain(learner.parentEmail);
      expect(feed.text).not.toContain(brief);
      expect(feed.text).not.toContain(`Surnamezz${marker}`);
    } finally {
      await context.close();
    }
  });

  test("the personal booking picker never lists an org learner", async ({ browser }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id, "Ida Instructor");
    const learner = await seedLearner(org.id, owner.id);
    const personalName = `Pat ${uniq("personal")}`;
    await prisma.student.create({ data: { name: personalName, adminUserId: instructor.id } });
    await seedToday(instructor.id, learner.student.id, "Algebra", 10);

    const { context, page } = await openSchedule(browser, instructor);
    try {
      await page.getByTestId("schedule-new-session").first().click();
      await expect(page.getByTestId("schedule-create-form")).toBeVisible();
      await page.locator("#schedule-student").click();
      const options = page.getByRole("option");
      await expect(options.filter({ hasText: personalName })).toHaveCount(1);
      const labels = (await options.allInnerTexts()).map((text) => text.trim());
      expect(labels).toEqual([personalName]);
      expect(labels.join("|")).not.toContain(learner.fullName);
    } finally {
      await context.close();
    }
  });

  test("reassigning an appointment moves it between instructors' Schedules", async ({ browser }) => {
    test.setTimeout(180_000);
    const { org, owner } = await seedOrg();
    const scheduler = await seedMember(org.id, "Sam Scheduler", ["scheduler"]);
    const ada = await seedInstructor(org.id, "Ada Reassign");
    const bea = await seedInstructor(org.id, "Bea Reassign");
    const learner = await seedLearner(org.id, owner.id);
    const appointment = await seedToday(ada.id, learner.student.id, "Algebra", 10);

    const staff = await signIn(browser, scheduler);
    try {
      await staff.page.goto(`/admin/organization/${org.id}`);
      expect(staff.page.url(), "session cookie was rejected").not.toContain("/login");
      await staff.page.getByTestId(`org-appointment-edit-${appointment.id}`).click();
      await staff.page.getByTestId("schedule-instructor").click();
      await staff.page.getByRole("option", { name: "Bea Reassign" }).click();
      await staff.page.getByTestId("schedule-save-session").click();
      await expect(staff.page.getByTestId("schedule-edit-form")).toBeHidden({ timeout: 30_000 });
      await expect
        .poll(async () => (await prisma.scheduledSession.findUniqueOrThrow({ where: { id: appointment.id } })).adminUserId)
        .toBe(bea.id);
    } finally {
      await staff.context.close();
    }

    const adaView = await openSchedule(browser, ada);
    try {
      await expect(rowFor(adaView.page, appointment.id)).toHaveCount(0);
      expect(await adaView.page.content()).not.toContain(learner.fullName);
    } finally {
      await adaView.context.close();
    }

    const beaView = await openSchedule(browser, bea);
    try {
      await expect(rowFor(beaView.page, appointment.id)).toContainText(learner.fullName);
    } finally {
      await beaView.context.close();
    }
  });

  test("the org badge shares a line with the learner name", async ({ browser }) => {
    test.setTimeout(120_000);
    const { org, owner } = await seedOrg();
    await prisma.organization.update({
      where: { id: org.id },
      data: { name: "Westside Community Learning Center" },
    });
    const instructor = await seedInstructor(org.id, "Ida Instructor");
    const learner = await seedLearner(org.id, owner.id, true, {
      givenName: "Mary Ann",
      familyName: "Lee-Robertson",
    });
    const appointment = await seedToday(instructor.id, learner.student.id, "Algebra", 10);

    const { context, page } = await openSchedule(browser, instructor);
    try {
      for (const view of ["month", "agenda"] as const) {
        if (view === "agenda") await showAgenda(page);
        const row = rowFor(page, appointment.id);
        const name = await row.getByTestId("schedule-session-name").boundingBox();
        const badge = await row.getByTestId("org-badge").boundingBox();
        if (!name || !badge) throw new Error(`name or badge missing in ${view} view`);
        // Same line: midline of the badge ≈ midline of the learner name.
        const nameMid = name.y + name.height / 2;
        const badgeMid = badge.y + badge.height / 2;
        expect(Math.abs(nameMid - badgeMid), `${view} midline gap`).toBeLessThanOrEqual(4);
        // And the badge sits beside the name, not under it.
        expect(badge.x).toBeGreaterThanOrEqual(name.x + name.width - 1);
      }
    } finally {
      await context.close();
    }
  });

  const NARROW_SCHEDULE_WIDTH = 320;
  /** Badge stays on the learner-name line from here up. */
  const SAME_LINE_WIDTHS = [375, 414, 768, 1280] as const;
  const LONG_LEARNER = { givenName: "Mary Ann", familyName: "Lee-Robertson" } as const;
  const LONG_ORG_NAME = "Westside Community Learning Center for Extended Academic Partnerships";
  const SHORT_ORG_NAME = "Lab";

  async function expectNoHorizontalOverflow(page: Page, label: string) {
    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scroll.scrollWidth, `${label} page has no horizontal overflow`).toBeLessThanOrEqual(
      scroll.clientWidth + 1
    );
  }

  /** Full text is painted: the element's scroll width does not exceed its client width. */
  async function expectTextFullyVisible(locator: Locator, label: string) {
    const fit = await locator.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(fit.scrollWidth, label).toBeLessThanOrEqual(fit.clientWidth);
  }

  async function expectBadgeOnOwnLine(page: Page, row: Locator, label: string) {
    const name = row.getByTestId("schedule-session-name");
    const badge = row.getByTestId("org-badge");
    await name.scrollIntoViewIfNeeded();
    const nameBox = await name.boundingBox();
    const badgeBox = await badge.boundingBox();
    const rowBox = await row.boundingBox();
    if (!nameBox || !badgeBox || !rowBox) throw new Error(`${label} name, badge, or row missing`);

    await expectTextFullyVisible(name, `${label} learner name is not truncated`);
    await expectTextFullyVisible(badge, `${label} organization badge text is fully visible`);

    // Badge box is inside the row box.
    expect(badgeBox.x, `${label} badge left inside the row`).toBeGreaterThanOrEqual(rowBox.x - 1);
    expect(badgeBox.y, `${label} badge top inside the row`).toBeGreaterThanOrEqual(rowBox.y - 1);
    expect(badgeBox.x + badgeBox.width, `${label} badge right inside the row`).toBeLessThanOrEqual(
      rowBox.x + rowBox.width + 1
    );
    expect(badgeBox.y + badgeBox.height, `${label} badge bottom inside the row`).toBeLessThanOrEqual(
      rowBox.y + rowBox.height + 1
    );
    // Own line: the badge starts at or below the name's bottom edge.
    expect(badgeBox.y, `${label} badge is on its own line`).toBeGreaterThanOrEqual(
      nameBox.y + nameBox.height - 1
    );
    await expectNoHorizontalOverflow(page, label);
  }

  async function expectBadgeSharesNameLine(row: Locator, label: string) {
    const name = row.getByTestId("schedule-session-name");
    const badge = row.getByTestId("org-badge");
    await name.scrollIntoViewIfNeeded();
    const nameBox = await name.boundingBox();
    const badgeBox = await badge.boundingBox();
    if (!nameBox || !badgeBox) throw new Error(`${label} name or badge missing`);
    const nameMid = nameBox.y + nameBox.height / 2;
    const badgeMid = badgeBox.y + badgeBox.height / 2;
    expect(Math.abs(nameMid - badgeMid), `${label} badge midline ≈ name midline`).toBeLessThanOrEqual(4);
  }

  /**
   * Visual lines of the label, grouped by distinct line tops.
   * `via` and the organization name are separate text nodes, so a raw
   * client-rect count is not a line count. Each line's corners must lie
   * inside the badge's rounded rectangle: the used radius (specified radius
   * clamped to half the box) is the corner inset. A flat shrink of
   * radius*0.3 sits inside this badge's vertical padding and rejects an
   * unclipped moderate radius.
   */
  async function expectBadgeLabelInside(badge: Locator, label: string) {
    const fit = await badge.evaluate((el) => {
      const textEl = el.querySelector("span");
      if (!(textEl instanceof HTMLElement)) throw new Error("organization badge has no label");
      const badgeRect = el.getBoundingClientRect();
      const specified = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const used = Math.min(specified, badgeRect.width / 2, badgeRect.height / 2);
      const range = document.createRange();
      range.selectNodeContents(textEl);
      const lines: Array<{ left: number; right: number; top: number; bottom: number }> = [];
      for (const rect of range.getClientRects()) {
        const sameLine = lines.find((line) => Math.abs(line.top - rect.top) < 1);
        if (!sameLine) {
          lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
          continue;
        }
        sameLine.left = Math.min(sameLine.left, rect.left);
        sameLine.right = Math.max(sameLine.right, rect.right);
        sameLine.bottom = Math.max(sameLine.bottom, rect.bottom);
      }
      const slack = 1;
      const pointInside = (x: number, y: number) => {
        const innerLeft = badgeRect.left + used;
        const innerRight = badgeRect.right - used;
        const innerTop = badgeRect.top + used;
        const innerBottom = badgeRect.bottom - used;
        const cx = Math.min(Math.max(x, innerLeft), innerRight);
        const cy = Math.min(Math.max(y, innerTop), innerBottom);
        const dx = x - cx;
        const dy = y - cy;
        return dx * dx + dy * dy <= (used + slack) * (used + slack);
      };
      let outside = 0;
      for (const line of lines) {
        const corners: Array<[number, number]> = [
          [line.left, line.top],
          [line.right, line.top],
          [line.left, line.bottom],
          [line.right, line.bottom],
        ];
        for (const [x, y] of corners) {
          if (!pointInside(x, y)) outside += 1;
        }
      }
      return { lineCount: lines.length, outside, used, height: badgeRect.height };
    });
    expect(fit.outside, `${label} organization badge text is clipped by the radius`).toBe(0);
    expect(
      fit.used,
      `${label} wrapped organization badge uses a moderate radius`
    ).toBeLessThan(fit.height / 2 - 1);
    return fit.lineCount;
  }

  /**
   * A short label on the shared name line keeps the Badge pill.
   * Oracle: the computed radius of the plain Badge on the synced row.
   */
  async function expectShortBadgePillRadius(syncedRow: Locator, shortRow: Locator, label: string) {
    const orgBadge = shortRow.getByTestId("org-badge");
    const pill = syncedRow.locator("[data-slot='badge']", { hasText: "Synced" });
    await orgBadge.scrollIntoViewIfNeeded();
    const org = await orgBadge.evaluate((el) => ({
      radius: Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
      height: el.getBoundingClientRect().height,
    }));
    const pillCount = await pill.count();
    if (pillCount > 0) {
      const pillRadius = await pill.first().evaluate(
        (el) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
      );
      expect(org.radius, `${label} short organization badge uses the pill radius`).toBeCloseTo(
        pillRadius,
        0
      );
      return;
    }
    expect(
      org.radius,
      `${label} short organization badge radius is at least half its height`
    ).toBeGreaterThanOrEqual(org.height / 2 - 1);
  }

  /** A short label stays content-width: narrower than the title line it sits in. */
  async function expectShortBadgeContentWidth(row: Locator, label: string) {
    const badge = row.getByTestId("org-badge");
    await badge.scrollIntoViewIfNeeded();
    const badgeBox = await badge.boundingBox();
    const lineBox = await badge.locator("..").boundingBox();
    const rowBox = await row.boundingBox();
    if (!badgeBox || !lineBox || !rowBox) throw new Error(`${label} badge, title line, or row missing`);
    expect(badgeBox.width, `${label} badge width <= row width`).toBeLessThanOrEqual(rowBox.width + 1);
    expect(
      badgeBox.width,
      `${label} short organization badge is content-width`
    ).toBeLessThan(lineBox.width * 0.75);
  }

  async function expectSyncedBadgeInsideRow(row: Locator, label: string) {
    const sync = row.getByText("Synced", { exact: true });
    await expect(sync).toBeVisible();
    const syncBox = await sync.boundingBox();
    const rowBox = await row.boundingBox();
    if (!syncBox || !rowBox) throw new Error(`${label} sync badge or row missing`);
    expect(syncBox.x, `${label} sync badge left inside the row`).toBeGreaterThanOrEqual(rowBox.x - 1);
    expect(syncBox.y, `${label} sync badge top inside the row`).toBeGreaterThanOrEqual(rowBox.y - 1);
    expect(syncBox.x + syncBox.width, `${label} sync badge stays inside the row`).toBeLessThanOrEqual(
      rowBox.x + rowBox.width + 1
    );
    expect(syncBox.y + syncBox.height, `${label} sync badge bottom inside the row`).toBeLessThanOrEqual(
      rowBox.y + rowBox.height + 1
    );
  }

  async function expectNameKeepsVisibleWidth(row: Locator, label: string) {
    const name = row.getByTestId("schedule-session-name");
    const nameBox = await name.boundingBox();
    const lineBox = await name.locator("..").boundingBox();
    if (!nameBox || !lineBox) throw new Error(`${label} name or title line missing`);
    const truncated = await name.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    if (!truncated) return;
    expect(nameBox.width, `${label} truncated name keeps a visible width`).toBeGreaterThanOrEqual(
      lineBox.width * 0.25
    );
  }

  test("narrow schedule rows put the organization badge on its own line and show both names", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { org, owner } = await seedOrg();
    await prisma.organization.update({ where: { id: org.id }, data: { name: LONG_ORG_NAME } });
    const instructor = await seedInstructor(org.id, "Ida Instructor");
    const learner = await seedLearner(org.id, owner.id, true, LONG_LEARNER);
    expect(learner.fullName).toBe("Mary Ann Lee-Robertson");
    const appointment = await seedToday(instructor.id, learner.student.id, "Algebra", 10);
    await prisma.scheduledSession.update({
      where: { id: appointment.id },
      data: { googleEventId: `evt-${appointment.id}` },
    });
    const shortOrg = await seedOrg();
    await prisma.organization.update({
      where: { id: shortOrg.org.id },
      data: { name: SHORT_ORG_NAME },
    });
    await prisma.organizationMember.create({
      data: { organizationId: shortOrg.org.id, adminUserId: instructor.id, roles: ["instructor"] },
    });
    const shortLearner = await seedLearner(shortOrg.org.id, shortOrg.owner.id, true, {
      givenName: "Ann",
      familyName: "Lee",
    });
    const shortAppointment = await seedToday(instructor.id, shortLearner.student.id, "Geometry", 11);

    const { context, page } = await openSchedule(browser, instructor);
    try {
      await page.evaluate(() => document.fonts.ready);
      for (const view of ["month", "agenda"] as const) {
        if (view === "agenda") await showAgenda(page);
        const row = rowFor(page, appointment.id);
        const shortRow = rowFor(page, shortAppointment.id);
        const name = row.getByTestId("schedule-session-name");
        const badge = row.getByTestId("org-badge");

        await page.setViewportSize({ width: NARROW_SCHEDULE_WIDTH, height: 812 });
        const narrow = `${view} @ ${NARROW_SCHEDULE_WIDTH}px`;
        await name.scrollIntoViewIfNeeded();
        await expect(name).toHaveText(learner.fullName);
        await expect(badge).toHaveText(`via ${LONG_ORG_NAME}`);
        await expect(name).toHaveAttribute("title", learner.fullName);
        await expectBadgeOnOwnLine(page, row, narrow);
        const longBadgeBox = await badge.boundingBox();
        const longRowBox = await row.boundingBox();
        if (!longBadgeBox || !longRowBox) throw new Error(`${narrow} long badge or row missing`);
        expect(longBadgeBox.width, `${narrow} badge width <= row width`).toBeLessThanOrEqual(
          longRowBox.width + 1
        );

        await shortRow.getByTestId("org-badge").scrollIntoViewIfNeeded();
        await expect(shortRow.getByTestId("org-badge")).toHaveText(`via ${SHORT_ORG_NAME}`);
        await expectShortBadgeContentWidth(shortRow, narrow);

        const lineCount = await expectBadgeLabelInside(badge, narrow);
        expect(lineCount, `${narrow} long organization badge wraps to two lines`).toBeGreaterThanOrEqual(2);

        for (const width of SAME_LINE_WIDTHS) {
          await page.setViewportSize({ width, height: 812 });
          const label = `${view} @ ${width}px`;
          await name.scrollIntoViewIfNeeded();
          await expectBadgeSharesNameLine(row, label);
          await expectNameKeepsVisibleWidth(row, label);
          await expectSyncedBadgeInsideRow(row, label);
          await expectNoHorizontalOverflow(page, label);
          if (width === 375 || width === 1280) {
            await expectShortBadgePillRadius(row, shortRow, label);
          }
        }
      }
    } finally {
      await context.close();
    }
  });
});
