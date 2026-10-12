/**
 * Org sales stage 5 — removal and suspension pills, the three end choices,
 * notes after removal, and a late segment after End it now.
 * Tags: @wb-chrome @wb-presence
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import { TAG } from "../test-tags";
import {
  loginLearnerInContext,
  readEncryptionKeyFromHash,
} from "./whiteboard-live-sync.helpers";

const { applyWbRegressionLocalDatabaseEnv } = require("../../scripts/wb-regression-local-db.cjs");
applyWbRegressionLocalDatabaseEnv();

const prisma = new PrismaClient();
const PIN = "482916";
const TUTOR_SENTENCE =
  "This session will end soon because you are no longer part of the organization that set up this tutoring.";
const STUDENT_SENTENCE =
  "This session will end soon. The organization that set up this tutoring has changed who teaches it.";
const SUSPENSION_SENTENCE =
  "This session will end soon because the organization that set up this tutoring has had its account suspended.";
const NO_NOTES_WARNING =
  "No notes will come from this session. Ending it does not give the time back. After the free pilot, that time still counts as time used.";

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
): Promise<{ context: BrowserContext; page: Page }> {
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

async function seedAdmin(label: string, email?: string) {
  return prisma.adminUser.create({
    data: {
      email: email ?? `${uniq(label)}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
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
      name: `Org ${uniq("removal")}`,
      status: "active",
      timezone: "America/Denver",
      statusChangedAt: new Date(),
      createdByOperatorId: "org-operator@example.com",
      members: { create: [{ adminUserId: owner.id, roles: ["owner"] }] },
    },
  });
  return { org, owner };
}

async function seedLearner(organizationId: string, createdByAdminUserId: string) {
  const familyId = uniq("fam").replace(/[^a-z0-9]/g, "").slice(-16);
  const username = uniq("child").replace(/[^a-z0-9]/g, "").slice(-12);
  const ah = await prisma.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
      familyId,
    },
  });
  const profile = await prisma.learnerProfile.create({
    data: {
      accountHolderId: ah.id,
      displayName: "Mary Ann Lee",
      isSelfLearner: false,
      accessMode: "child_pin_required",
    },
  });
  const student = await prisma.student.create({
    data: {
      name: "Mary Ann Lee",
      adminUserId: null,
      organizationId,
      learnerProfileId: profile.id,
      parentEmail: `${uniq("parent")}@example.com`,
    },
  });
  await prisma.organizationLearner.create({
    data: {
      studentId: student.id,
      organizationId,
      givenName: "Mary Ann",
      familyName: "Lee",
      createdByAdminUserId,
    },
  });
  await prisma.learnerCredential.create({
    data: {
      learnerProfileId: profile.id,
      accountHolderId: ah.id,
      username,
      secretHash: await bcrypt.hash(PIN, 10),
    },
  });
  await prisma.consentRecord.create({
    data: {
      learnerProfileId: profile.id,
      adminUserId: null,
      organizationId,
      version: 1,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ah.id,
      captureMethod: "electronic",
    },
  });
  return { student, profile, handle: `${username}@${familyId}` };
}

async function seedInstructor(organizationId: string, removedAt: Date | null = null) {
  const instructor = await seedAdmin("Instructor Ira");
  await prisma.organizationMember.create({
    data: {
      organizationId,
      adminUserId: instructor.id,
      roles: ["instructor"],
      removedAt,
    },
  });
  return instructor;
}

async function seedLiveSession(input: {
  adminUserId: string;
  studentId: string;
  learnerProfileId: string;
  endedAt?: Date | null;
  topics?: string;
  noteStatus?: "DRAFT" | "READY";
}) {
  const now = new Date();
  const note = await prisma.sessionNote.create({
    data: {
      studentId: input.studentId,
      date: new Date("2026-10-01T00:00:00.000Z"),
      topics: input.topics ?? "Fractions on the board",
      homework: "",
      assessment: "Steady",
      nextSteps: "Practice",
      linksJson: "[]",
      status: input.noteStatus ?? "DRAFT",
    },
  });
  const session = await prisma.whiteboardSession.create({
    data: {
      adminUserId: input.adminUserId,
      studentId: input.studentId,
      consentAcknowledged: true,
      eventsBlobUrl: "https://blob.vercel-storage.com/events.json",
      sessionPhase: "ACTIVE",
      startedAt: now,
      lastActiveAt: now,
      activatedAt: now,
      endedAt: input.endedAt ?? null,
      noteId: note.id,
    },
  });
  await prisma.tutorNote.create({
    data: {
      sessionId: session.id,
      status: "done",
      content: JSON.stringify({
        topics: input.topics ?? "Fractions on the board",
        assessment: "Steady",
        nextSteps: "Practice",
        links: "",
      }),
    },
  });
  await prisma.sessionParticipant.create({
    data: {
      whiteboardSessionId: session.id,
      learnerProfileId: input.learnerProfileId,
      joinedAt: now,
    },
  });
  const consent = await prisma.consentRecord.findFirst({
    where: { learnerProfileId: input.learnerProfileId },
    orderBy: { version: "desc" },
  });
  if (consent) {
    await prisma.sessionConsentSnapshot.create({
      data: {
        whiteboardSessionId: session.id,
        allowLiveSession: true,
        allowAudioRecording: consent.allowAudioRecording,
        allowWhiteboardRecording: consent.allowWhiteboardRecording,
        allowNoteSending: consent.allowNoteSending,
        consentRecordId: consent.id,
        consentRecordVersion: consent.version,
      },
    });
  }
  return { session, note };
}

async function expectSentenceInsideChrome(page: Page, chromeTestId: string, sentence: string) {
  const chrome = page.getByTestId(chromeTestId);
  const pill = chrome.getByTestId("wb-org-force-end-pill");
  const text = pill.getByTestId("wb-org-force-end-pill-text");
  await expect(chrome).toBeVisible({ timeout: 45_000 });
  await expect(text).toHaveText(sentence, { timeout: 20_000 });
  const chromeBox = await chrome.boundingBox();
  const pillBox = await pill.boundingBox();
  const textBox = await text.boundingBox();
  expect(chromeBox).toBeTruthy();
  expect(pillBox).toBeTruthy();
  expect(textBox).toBeTruthy();
  if (!chromeBox || !pillBox || !textBox) return;
  expect(pillBox.x).toBeGreaterThanOrEqual(chromeBox.x - 2);
  expect(pillBox.y).toBeGreaterThanOrEqual(chromeBox.y - 2);
  expect(pillBox.x + pillBox.width).toBeLessThanOrEqual(chromeBox.x + chromeBox.width + 2);
  expect(pillBox.y + pillBox.height).toBeLessThanOrEqual(chromeBox.y + chromeBox.height + 2);
  expect(textBox.x).toBeGreaterThanOrEqual(pillBox.x - 2);
  expect(textBox.y).toBeGreaterThanOrEqual(pillBox.y - 2);
  expect(textBox.x + textBox.width).toBeLessThanOrEqual(pillBox.x + pillBox.width + 2);
  expect(textBox.y + textBox.height).toBeLessThanOrEqual(pillBox.y + pillBox.height + 2);
  const clipped = await text.evaluate((el) => {
    const node = el as HTMLElement;
    return node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2;
  });
  expect(clipped).toBe(false);
}

test.describe("org removal and suspension", { tag: [TAG.WB_CHROME, TAG.WB_PRESENCE] }, () => {
  test.setTimeout(120_000);

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("removal Let it finish shows the tutor and student sentences", async ({ browser }) => {
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id);
    const learner = await seedLearner(org.id, owner.id);
    const { session } = await seedLiveSession({
      adminUserId: instructor.id,
      studentId: learner.student.id,
      learnerProfileId: learner.profile.id,
    });

    const ownerSession = await signIn(browser, owner);
    await ownerSession.page.goto(`/admin/organization/${org.id}`);
    await ownerSession.page.getByTestId(`org-remove-${instructor.id}`).click();
    await expect(ownerSession.page.getByTestId("org-session-end-warning")).toBeVisible();
    await expect(ownerSession.page.getByTestId("org-let-it-finish")).toBeVisible();
    await expect(ownerSession.page.getByTestId("org-end-it-now")).toBeVisible();
    await expect(ownerSession.page.getByTestId("org-session-end-warning")).not.toContainText(
      "no notes"
    );
    await ownerSession.page.getByTestId("org-let-it-finish").click();
    await expect
      .poll(async () => {
        const member = await prisma.organizationMember.findUnique({
          where: {
            organizationId_adminUserId: { organizationId: org.id, adminUserId: instructor.id },
          },
          select: { removedAt: true },
        });
        return member?.removedAt != null;
      })
      .toBe(true);
    await ownerSession.context.close();

    const tutor = await signIn(browser, instructor);
    await tutor.page.goto(
      `/admin/students/${learner.student.id}/whiteboard/${session.id}/workspace`
    );
    await expectSentenceInsideChrome(tutor.page, "tutor-whiteboard-canvas-mount", TUTOR_SENTENCE);
    const encryptionKey = await readEncryptionKeyFromHash(tutor.page);
    await tutor.context.close();

    const studentContext = await browser.newContext();
    await loginLearnerInContext(studentContext, learner.handle, PIN);
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/join/${session.id}#k=${encodeURIComponent(encryptionKey)}`);
    await expectSentenceInsideChrome(
      studentPage,
      "student-whiteboard-canvas-mount",
      STUDENT_SENTENCE
    );
    await studentContext.close();
  });

  test("suspension Let it finish shows the proposed suspension sentence", async ({ browser }) => {
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id);
    const learner = await seedLearner(org.id, owner.id);
    const { session } = await seedLiveSession({
      adminUserId: instructor.id,
      studentId: learner.student.id,
      learnerProfileId: learner.profile.id,
    });
    const operatorRow = await prisma.adminUser.upsert({
      where: { email: "playwright@test.local" },
      update: {
        approvalStatus: "APPROVED",
        emailVerifiedAt: new Date("2026-01-01"),
        isTestAccount: false,
        displayName: "Playwright Operator",
      },
      create: {
        email: "playwright@test.local",
        role: "TUTOR",
        approvalStatus: "APPROVED",
        emailVerifiedAt: new Date("2026-01-01"),
        displayName: "Playwright Operator",
        isTestAccount: false,
      },
    });

    const operatorSession = await signIn(browser, operatorRow);
    await operatorSession.page.goto(`/admin/orgs/${org.id}`);
    await operatorSession.page.getByTestId("org-suspend").click();
    await expect(operatorSession.page.getByTestId("org-session-end-warning")).toBeVisible();
    await expect(
      operatorSession.page.getByRole("button", { name: "End it now, and no notes", exact: true })
    ).toBeVisible();
    await expect(operatorSession.page.getByText(NO_NOTES_WARNING)).toBeVisible();
    await operatorSession.page.getByTestId("org-let-it-finish").click();
    await expect
      .poll(async () => {
        const row = await prisma.organization.findUnique({
          where: { id: org.id },
          select: { status: true },
        });
        return row?.status;
      })
      .toBe("suspended");
    await operatorSession.context.close();

    const tutor = await signIn(browser, instructor);
    await tutor.page.goto(
      `/admin/students/${learner.student.id}/whiteboard/${session.id}/workspace`
    );
    await expectSentenceInsideChrome(
      tutor.page,
      "tutor-whiteboard-canvas-mount",
      SUSPENSION_SENTENCE
    );
    await tutor.context.close();
  });

  test("a removed instructor can open and finalize the note inside seven days, and cannot draw", async ({
    browser,
  }) => {
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id, new Date());
    const learner = await seedLearner(org.id, owner.id);
    const endedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 60 * 1000);
    const { session } = await seedLiveSession({
      adminUserId: instructor.id,
      studentId: learner.student.id,
      learnerProfileId: learner.profile.id,
      endedAt,
      topics: "Inside the seven days",
    });
    const tutor = await signIn(browser, instructor);
    const notes = await tutor.page.goto(`/admin/students/${learner.student.id}/notes`);
    expect(notes?.status()).not.toBe(404);
    await expect(tutor.page.getByText("Inside the seven days")).toBeVisible();
    await tutor.page.goto(
      `/admin/students/${learner.student.id}/whiteboard/${session.id}/workspace`
    );
    await expect(tutor.page.getByTestId("wb-session-review-mode")).toBeVisible();
    await expect(tutor.page.getByTestId("tutor-whiteboard-canvas-mount")).toHaveCount(0);
    await tutor.page.getByTestId("wb-save-note").click();
    await expect(tutor.page.getByTestId("wb-save-note-confirmation")).toBeVisible();
    await tutor.page.goto(`/admin/students/${learner.student.id}/notes`);
    await expect(tutor.page.getByText("Status: READY")).toBeVisible();
    await tutor.context.close();
  });

  test("past seven days the note stays visible and save leaves DRAFT", async ({ browser }) => {
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id, new Date());
    const learner = await seedLearner(org.id, owner.id);
    const endedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 60 * 1000);
    const { session, note } = await seedLiveSession({
      adminUserId: instructor.id,
      studentId: learner.student.id,
      learnerProfileId: learner.profile.id,
      endedAt,
      topics: "Past the seven days",
    });
    const tutor = await signIn(browser, instructor);
    const notes = await tutor.page.goto(`/admin/students/${learner.student.id}/notes`);
    expect(notes?.status()).not.toBe(404);
    await expect(tutor.page.getByText("Past the seven days")).toBeVisible();
    await expect(tutor.page.getByText("Status: DRAFT")).toBeVisible();
    await tutor.page.goto(
      `/admin/students/${learner.student.id}/whiteboard/${session.id}/workspace`
    );
    await expect(tutor.page.getByTestId("wb-session-review-mode")).toBeVisible();
    await tutor.page.getByTestId("wb-save-note").click();
    await tutor.page.goto(`/admin/students/${learner.student.id}/notes`);
    await expect(tutor.page.getByText("Past the seven days")).toBeVisible();
    await expect(tutor.page.getByText("Status: DRAFT")).toBeVisible();
    const stored = await prisma.sessionNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(stored.status).toBe("DRAFT");
    await tutor.context.close();
  });

  test("End it now still accepts a segment inside the upload window", async ({ browser }) => {
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id);
    const learner = await seedLearner(org.id, owner.id);
    const { session } = await seedLiveSession({
      adminUserId: instructor.id,
      studentId: learner.student.id,
      learnerProfileId: learner.profile.id,
    });

    const tutor = await signIn(browser, instructor);
    await tutor.page.goto(
      `/admin/students/${learner.student.id}/whiteboard/${session.id}/workspace`
    );
    await expect(tutor.page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 45_000,
    });
    await tutor.page.evaluate(async (sessionId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("tutoring-notes-upload-outbox", 1);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore("rows", { keyPath: "id" });
          store.createIndex("by_session", "sessionId", { unique: false });
          store.createIndex("by_session_stream", ["sessionId", "streamId"], { unique: false });
          store.createIndex("by_session_stream_segment", ["sessionId", "streamId", "segmentId"], {
            unique: true,
          });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("rows", "readwrite");
        tx.objectStore("rows").put({
          id: `late-${sessionId}`,
          sessionId,
          streamId: "tutor:mic",
          segmentId: `seg-${sessionId}`,
          blobLocalRef: null,
          blobRemoteUrl: "https://blob.vercel-storage.com/e2e-org-late-segment.webm",
          mimeType: "audio/webm",
          sizeBytes: 4,
          audioStartedAtMs: Date.now() - 1000,
          durationSeconds: 1,
          registerOk: true,
          attempts: 0,
          lastError: null,
          createdAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, session.id);

    const ownerSession = await signIn(browser, owner);
    await ownerSession.page.goto(`/admin/organization/${org.id}`);
    await ownerSession.page.getByTestId(`org-remove-${instructor.id}`).click();
    await ownerSession.page.getByTestId("org-end-it-now").click();
    await expect
      .poll(async () => {
        const row = await prisma.whiteboardSession.findUnique({
          where: { id: session.id },
          select: { endedAt: true },
        });
        return row?.endedAt != null;
      })
      .toBe(true);
    await ownerSession.context.close();

    const stamped = await prisma.whiteboardSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stamped.endedAt).not.toBeNull();
    const endedAt = stamped.endedAt!.toISOString();

    await tutor.page.getByTestId("wb-end-session").click();
    await tutor.page.getByTestId("wb-end-session-confirm-yes").click();
    await expect
      .poll(
        async () => {
          return prisma.sessionRecording.count({ where: { whiteboardSessionId: session.id } });
        },
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);

    const after = await prisma.whiteboardSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.endedAt!.toISOString()).toBe(endedAt);
    await tutor.context.close();
  });

  test("End it now, and no notes shows the proposed warning and finalize leaves DRAFT", async ({
    browser,
  }) => {
    const { org, owner } = await seedOrg();
    const instructor = await seedInstructor(org.id);
    const learner = await seedLearner(org.id, owner.id);
    const { session, note } = await seedLiveSession({
      adminUserId: instructor.id,
      studentId: learner.student.id,
      learnerProfileId: learner.profile.id,
      topics: "No notes from this session",
    });

    const ownerSession = await signIn(browser, owner);
    await ownerSession.page.goto(`/admin/organization/${org.id}`);
    await ownerSession.page.getByTestId(`org-remove-${instructor.id}`).click();
    await expect(
      ownerSession.page.getByRole("button", { name: "End it now, and no notes", exact: true })
    ).toBeVisible();
    await expect(ownerSession.page.getByText(NO_NOTES_WARNING)).toBeVisible();
    await ownerSession.page
      .getByRole("button", { name: "End it now, and no notes", exact: true })
      .click();
    await expect
      .poll(async () => {
        const row = await prisma.whiteboardSession.findUnique({
          where: { id: session.id },
          select: { endedAt: true, notesForbidden: true },
        });
        return row?.notesForbidden === true && row.endedAt != null;
      })
      .toBe(true);
    await ownerSession.context.close();

    const tutor = await signIn(browser, instructor);
    const notes = await tutor.page.goto(`/admin/students/${learner.student.id}/notes`);
    expect(notes?.status()).not.toBe(404);
    await expect(tutor.page.getByText("No notes from this session")).toBeVisible();
    await expect(tutor.page.getByRole("button", { name: "Mark ready" })).toHaveCount(0);
    await tutor.page.goto(
      `/admin/students/${learner.student.id}/whiteboard/${session.id}/workspace`
    );
    await expect(tutor.page.getByTestId("wb-session-review-mode")).toBeVisible();
    await tutor.page.getByTestId("wb-save-note").click();
    await tutor.page.goto(`/admin/students/${learner.student.id}/notes`);
    await expect(tutor.page.getByText("No notes from this session")).toBeVisible();
    await expect(tutor.page.getByText("Status: DRAFT")).toBeVisible();
    const stored = await prisma.sessionNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(stored.status).toBe("DRAFT");
    await tutor.context.close();
  });
});
