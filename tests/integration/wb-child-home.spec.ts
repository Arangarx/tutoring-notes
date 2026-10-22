/**
 * Child home on /join: own ended-session note + replay, empty upcoming copy,
 * a PIN change that still leaves the parent reset in place, and consent the
 * child can tighten but only a parent can restore.
 */

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TAG } from "../test-tags";
import { TEST_PARENT, seedParentAccountHolder } from "./identity/identity.helpers";
import { loginLearnerInContext } from "./whiteboard-live-sync.helpers";
import { uploadHarnessBlob, uploadReplayEvents } from "./wb-replay-harness.helpers";
import { readHarnessMailUrl } from "@/lib/playwright-harness-mail";
import { seedTestAdmin } from "../visual/helpers";

const CURRENT_PIN = "482916";
const NEXT_PIN = "159357";
const WRONG_PIN = "739184";
const PARENT_RESET_PIN = "999888";

function suffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function seedChildLogin(opts: {
  accountHolderId: string;
  familyId: string;
  displayName: string;
  withEndedNote?: { topics: string; status?: "DRAFT" | "READY" | "SENT" };
  /**
   * Default true. A real Save to notes does not create a ShareLink;
   * only an explicit false reproduces that shape.
   */
  withShareLink?: boolean;
  /**
   * When false, the session snapshot freezes whiteboard recording off.
   * Omit to leave the record's allowWhiteboardRecording true and no snapshot.
   */
  allowWhiteboardRecording?: boolean;
  /** Use this tutor so the Playwright tutor session can upload the event log. */
  tutorAdminUserId?: string;
}) {
  const prisma = new PrismaClient();
  const id = suffix();
  const username = `ch${id}`.replace(/[^a-z0-9]/g, "").slice(0, 12);
  try {
    const tutor = opts.tutorAdminUserId
      ? { id: opts.tutorAdminUserId }
      : await prisma.adminUser.create({
          data: {
            email: `pw-child-home-tutor-${id}@test.local`,
            role: "TUTOR",
            approvalStatus: "APPROVED",
            emailVerifiedAt: new Date("2026-01-01"),
          },
          select: { id: true },
        });
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: opts.accountHolderId,
        displayName: opts.displayName,
        accessMode: "child_pin_required",
        isSelfLearner: false,
      },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        name: opts.displayName,
        adminUserId: tutor.id,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });
    await prisma.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: opts.accountHolderId,
        username,
        secretHash: await bcrypt.hash(CURRENT_PIN, 10),
      },
    });
    await prisma.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: tutor.id,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: opts.accountHolderId,
        captureMethod: "electronic",
      },
    });

    let noteTopics: string | null = null;
    let whiteboardSessionId: string | null = null;
    if (opts.withEndedNote) {
      noteTopics = opts.withEndedNote.topics;
      const note = await prisma.sessionNote.create({
        data: {
          studentId: student.id,
          date: new Date("2026-06-01T00:00:00Z"),
          topics: noteTopics,
          homework: "",
          assessment: "",
          nextSteps: "",
          linksJson: "[]",
          status: opts.withEndedNote.status ?? "READY",
        },
        select: { id: true },
      });
      const session = await prisma.whiteboardSession.create({
        data: {
          adminUserId: tutor.id,
          studentId: student.id,
          noteId: note.id,
          endedAt: new Date("2026-06-01T01:00:00Z"),
          eventsBlobUrl: "https://example.invalid/child-home-events.json",
        },
        select: { id: true },
      });
      whiteboardSessionId = session.id;
      if (opts.withShareLink !== false) {
        await prisma.shareLink.create({
          data: {
            studentId: student.id,
            token: `child-home-${id}`,
          },
        });
      }
      if (opts.allowWhiteboardRecording === false) {
        await prisma.sessionConsentSnapshot.create({
          data: {
            whiteboardSessionId: session.id,
            allowLiveSession: true,
            allowAudioRecording: true,
            allowWhiteboardRecording: false,
            allowNoteSending: true,
          },
        });
      }
    }

    return {
      learnerProfileId: profile.id,
      studentId: student.id,
      tutorId: tutor.id,
      handle: `${username}@${opts.familyId}`,
      noteTopics,
      whiteboardSessionId,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function familyIdFor(accountHolderId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const parent = await prisma.accountHolder.findUniqueOrThrow({
      where: { id: accountHolderId },
      select: { familyId: true },
    });
    if (parent.familyId) return parent.familyId;
    const familyId = `chfam${suffix()}`.replace(/[^a-z0-9]/g, "").slice(0, 16);
    await prisma.accountHolder.update({
      where: { id: accountHolderId },
      data: { familyId },
    });
    return familyId;
  } finally {
    await prisma.$disconnect();
  }
}

const PARENT_RESTORED = "Your parent turned this back on.";
/** Bytes stored in the harness. A successful fetch must return this exact body. */
const AUDIO_MARKER = "learner-replay-audio-oracle-v1";

async function attachReplayAudio(args: {
  request: APIRequestContext;
  adminUserId: string;
  studentId: string;
  whiteboardSessionId: string;
}): Promise<{ recordingId: string }> {
  const blobUrl = await uploadHarnessBlob({
    request: args.request,
    pathname: `audio/${args.adminUserId}/${args.studentId}/pw-learner-replay.webm`,
    body: AUDIO_MARKER,
    contentType: "audio/webm",
    clientPayload: { kind: "audio", studentId: args.studentId },
  });
  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.update({
      where: { id: args.whiteboardSessionId },
      data: { concatBlobUrl: blobUrl, concatDurationSeconds: 3 },
    });
    const recording = await prisma.sessionRecording.create({
      data: {
        adminUserId: args.adminUserId,
        studentId: args.studentId,
        whiteboardSessionId: args.whiteboardSessionId,
        blobUrl,
        mimeType: "audio/webm",
        sizeBytes: AUDIO_MARKER.length,
        durationSeconds: 3,
      },
      select: { id: true },
    });
    return { recordingId: recording.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function stampLearnerSessions(
  learnerProfileId: string,
  data: { revokedAt?: Date; expiresAt?: Date }
): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.learnerDeviceSession.updateMany({
      where: { learnerProfileId },
      data,
    });
  } finally {
    await prisma.$disconnect();
  }
}

function consentRow(page: Page, testId: string) {
  return page.getByTestId(testId).locator("xpath=ancestor::div[contains(@class,'rounded-[10px]')][1]");
}

test.describe("child home on /join", { tag: [TAG.WB_PRESENCE] }, () => {
  test("shows the child's ended note and replay, and says nothing is scheduled when upcoming is empty", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const id = suffix();
    const ownTopics = `Child home note ${id}`;
    const own = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Home child ${id}`,
      withEndedNote: { topics: ownTopics },
    });
    const otherTopics = `Other child note ${id}`;
    const other = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Other child ${id}`,
      withEndedNote: { topics: otherTopics },
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(context, own.handle, CURRENT_PIN);
      const page = await context.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });

      await expect(page).toHaveURL(/\/join\/?$/);
      await expect(page.locator(`[data-note-id]`).filter({ hasText: ownTopics })).toBeVisible({
        timeout: 15_000,
      });
      const replay = page.getByRole("link", { name: "Watch the whiteboard recording" });
      await expect(replay).toBeVisible();
      await expect(replay).toHaveAttribute(
        "href",
        `/join/notes/${own.whiteboardSessionId}/whiteboard`
      );
      await expect(page.getByTestId("upcoming-sessions-card")).toBeVisible();
      await expect(page.getByTestId("upcoming-sessions-empty")).toHaveText(
        "No upcoming sessions scheduled."
      );
      await expect(page.getByText(otherTopics)).toHaveCount(0);
    } finally {
      await context.close();
    }

    const otherContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(otherContext, other.handle, CURRENT_PIN);
      const page = await otherContext.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(otherTopics)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(ownTopics)).toHaveCount(0);
    } finally {
      await otherContext.close();
    }
  });

  test("shows Watch the whiteboard recording for a saved note with no share link", {
    tag: [TAG.WB_RECORDING],
  }, async ({ browser, page }) => {
    test.setTimeout(180_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const adminUserId = await seedTestAdmin();
    const id = suffix();
    const topics = `Saved note no share ${id}`;
    const child = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `No share child ${id}`,
      withEndedNote: { topics },
      withShareLink: false,
      tutorAdminUserId: adminUserId,
    });
    if (!child.whiteboardSessionId) throw new Error("expected an ended session");

    await uploadReplayEvents({
      request: page.request,
      adminUserId,
      studentId: child.studentId,
      whiteboardSessionId: child.whiteboardSessionId,
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(context, child.handle, CURRENT_PIN);
      const childPage = await context.newPage();
      await childPage.goto("/join", { waitUntil: "domcontentloaded" });
      await expect(childPage.getByText(topics)).toBeVisible({ timeout: 15_000 });
      const replay = childPage.getByRole("link", { name: "Watch the whiteboard recording" });
      await expect(replay).toBeVisible();
      await expect(replay).toHaveAttribute(
        "href",
        `/join/notes/${child.whiteboardSessionId}/whiteboard`
      );
      await replay.click();
      await expect(childPage).toHaveURL(
        new RegExp(`/join/notes/${child.whiteboardSessionId}/whiteboard$`)
      );
      await expect(childPage.getByTestId("wb-replay-in-frame")).toBeVisible({
        timeout: 60_000,
      });
    } finally {
      await context.close();
    }
  });

  test("learner replay is limited to that child and to sessions that allow whiteboard recording", {
    tag: [TAG.WB_RECORDING],
  }, async ({ browser }) => {
    test.setTimeout(180_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const id = suffix();
    const topics = `Owner replay ${id}`;
    const owner = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Replay owner ${id}`,
      withEndedNote: { topics },
      withShareLink: false,
    });
    const other = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Replay other ${id}`,
    });
    const deniedTopics = `Recording off ${id}`;
    const denied = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Denied child ${id}`,
      withEndedNote: { topics: deniedTopics },
      withShareLink: false,
      allowWhiteboardRecording: false,
    });
    if (!owner.whiteboardSessionId || !denied.whiteboardSessionId) {
      throw new Error("expected ended sessions");
    }
    const ownerUrl = `/join/notes/${owner.whiteboardSessionId}/whiteboard`;
    const deniedUrl = `/join/notes/${denied.whiteboardSessionId}/whiteboard`;

    const signedOut = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await signedOut.newPage();
      await page.goto(ownerUrl, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/students\/login/);
      await expect(page.getByTestId("wb-replay-in-frame")).toHaveCount(0);
    } finally {
      await signedOut.close();
    }

    const otherContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(otherContext, other.handle, CURRENT_PIN);
      const page = await otherContext.newPage();
      const response = await page.goto(ownerUrl, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(404);
      await expect(page.getByTestId("wb-replay-in-frame")).toHaveCount(0);
    } finally {
      await otherContext.close();
    }

    const deniedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(deniedContext, denied.handle, CURRENT_PIN);
      const page = await deniedContext.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByTestId("child-session-notes").getByText(deniedTopics)
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("link", { name: "Watch the whiteboard recording" })
      ).toHaveCount(0);
      const response = await page.goto(deniedUrl, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(404);
      await expect(page.getByTestId("wb-replay-in-frame")).toHaveCount(0);
    } finally {
      await deniedContext.close();
    }
  });

  test("DRAFT-linked ended session is 404 on the learner page and the replay APIs", {
    tag: [TAG.WB_RECORDING],
  }, async ({ browser, page }) => {
    test.setTimeout(180_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const adminUserId = await seedTestAdmin();
    const id = suffix();
    const child = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Draft replay ${id}`,
      withEndedNote: { topics: `Draft note ${id}`, status: "DRAFT" },
      withShareLink: false,
      tutorAdminUserId: adminUserId,
    });
    if (!child.whiteboardSessionId) throw new Error("expected an ended session");
    const sessionId = child.whiteboardSessionId;

    await uploadReplayEvents({
      request: page.request,
      adminUserId,
      studentId: child.studentId,
      whiteboardSessionId: sessionId,
    });
    const { recordingId } = await attachReplayAudio({
      request: page.request,
      adminUserId,
      studentId: child.studentId,
      whiteboardSessionId: sessionId,
    });

    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1280, height: 900 },
    });
    try {
      await loginLearnerInContext(context, child.handle, CURRENT_PIN);
      const childPage = await context.newPage();
      const pageResponse = await childPage.goto(
        `/join/notes/${sessionId}/whiteboard`,
        { waitUntil: "domcontentloaded" }
      );
      expect(pageResponse?.status()).toBe(404);
      await expect(childPage.getByTestId("learner-wb-replay-page")).toHaveCount(0);

      const events = await context.request.get(`/api/whiteboard/${sessionId}/public-events`);
      const concat = await context.request.get(
        `/api/whiteboard/${sessionId}/public-concat-audio`
      );
      const audio = await context.request.get(`/api/audio/${recordingId}`);
      expect(events.status()).toBe(404);
      expect(concat.status()).toBe(404);
      expect(audio.status()).toBe(404);
      expect(await events.text()).not.toContain("pw-replay-rect");
      expect(await concat.text()).not.toBe(AUDIO_MARKER);
      expect(await audio.text()).not.toBe(AUDIO_MARKER);
    } finally {
      await context.close();
    }
  });

  test("learner replay APIs deny strangers and serve the owning child's audio", {
    tag: [TAG.WB_RECORDING],
  }, async ({ browser, page }) => {
    test.setTimeout(180_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const adminUserId = await seedTestAdmin();
    const id = suffix();
    const owner = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Api owner ${id}`,
      withEndedNote: { topics: `Api owner note ${id}` },
      withShareLink: false,
      tutorAdminUserId: adminUserId,
    });
    const other = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Api other ${id}`,
      withEndedNote: { topics: `Api other note ${id}` },
      withShareLink: false,
      tutorAdminUserId: adminUserId,
    });
    const denied = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Api denied ${id}`,
      withEndedNote: { topics: `Api denied note ${id}` },
      withShareLink: false,
      tutorAdminUserId: adminUserId,
      allowWhiteboardRecording: false,
    });
    if (!owner.whiteboardSessionId || !other.whiteboardSessionId || !denied.whiteboardSessionId) {
      throw new Error("expected ended sessions");
    }

    await uploadReplayEvents({
      request: page.request,
      adminUserId,
      studentId: owner.studentId,
      whiteboardSessionId: owner.whiteboardSessionId,
    });
    const ownerAudio = await attachReplayAudio({
      request: page.request,
      adminUserId,
      studentId: owner.studentId,
      whiteboardSessionId: owner.whiteboardSessionId,
    });
    await uploadReplayEvents({
      request: page.request,
      adminUserId,
      studentId: denied.studentId,
      whiteboardSessionId: denied.whiteboardSessionId,
    });
    const deniedAudio = await attachReplayAudio({
      request: page.request,
      adminUserId,
      studentId: denied.studentId,
      whiteboardSessionId: denied.whiteboardSessionId,
    });
    const otherAudio = await attachReplayAudio({
      request: page.request,
      adminUserId,
      studentId: other.studentId,
      whiteboardSessionId: other.whiteboardSessionId,
    });

    const ownerEvents = `/api/whiteboard/${owner.whiteboardSessionId}/public-events`;
    const ownerConcat = `/api/whiteboard/${owner.whiteboardSessionId}/public-concat-audio`;
    const ownerRecording = `/api/audio/${ownerAudio.recordingId}`;
    const deniedEvents = `/api/whiteboard/${denied.whiteboardSessionId}/public-events`;
    const deniedConcat = `/api/whiteboard/${denied.whiteboardSessionId}/public-concat-audio`;
    const deniedRecording = `/api/audio/${deniedAudio.recordingId}`;

    const bare = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1280, height: 900 },
    });
    try {
      expect((await bare.request.get(ownerEvents)).status()).toBe(401);
      expect((await bare.request.get(ownerConcat)).status()).toBe(401);
      expect((await bare.request.get(ownerRecording)).status()).toBe(401);
    } finally {
      await bare.close();
    }

    const otherContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1280, height: 900 },
    });
    try {
      await loginLearnerInContext(otherContext, other.handle, CURRENT_PIN);
      expect((await otherContext.request.get(ownerEvents)).status()).toBe(404);
      expect((await otherContext.request.get(ownerConcat)).status()).toBe(404);
      expect((await otherContext.request.get(ownerRecording)).status()).toBe(404);
      expect((await otherContext.request.get(`/api/audio/${otherAudio.recordingId}`)).status()).toBe(
        200
      );
    } finally {
      await otherContext.close();
    }

    const deniedContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1280, height: 900 },
    });
    try {
      await loginLearnerInContext(deniedContext, denied.handle, CURRENT_PIN);
      expect((await deniedContext.request.get(deniedEvents)).status()).toBe(404);
      expect((await deniedContext.request.get(deniedConcat)).status()).toBe(404);
      expect((await deniedContext.request.get(deniedRecording)).status()).toBe(404);
    } finally {
      await deniedContext.close();
    }

    const revokedContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1280, height: 900 },
    });
    try {
      await loginLearnerInContext(revokedContext, owner.handle, CURRENT_PIN);
      await stampLearnerSessions(owner.learnerProfileId, { revokedAt: new Date() });
      expect((await revokedContext.request.get(ownerEvents)).status()).toBe(401);
      expect((await revokedContext.request.get(ownerConcat)).status()).toBe(401);
      expect((await revokedContext.request.get(ownerRecording)).status()).toBe(401);
    } finally {
      await revokedContext.close();
    }

    const expiredContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1280, height: 900 },
    });
    try {
      await loginLearnerInContext(expiredContext, owner.handle, CURRENT_PIN);
      await stampLearnerSessions(owner.learnerProfileId, {
        expiresAt: new Date(Date.now() - 60_000),
      });
      expect((await expiredContext.request.get(ownerEvents)).status()).toBe(401);
      expect((await expiredContext.request.get(ownerRecording)).status()).toBe(401);
    } finally {
      await expiredContext.close();
    }

    const ownerContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1280, height: 900 },
    });
    try {
      await loginLearnerInContext(ownerContext, owner.handle, CURRENT_PIN);
      const events = await ownerContext.request.get(ownerEvents);
      const concat = await ownerContext.request.get(ownerConcat);
      const audio = await ownerContext.request.get(ownerRecording);
      const foreign = await ownerContext.request.get(`/api/audio/${otherAudio.recordingId}`);
      expect(events.status()).toBe(200);
      expect(await events.text()).toContain("pw-replay-rect");
      expect(concat.status()).toBe(200);
      expect(await concat.text()).toBe(AUDIO_MARKER);
      expect(audio.status()).toBe(200);
      expect(await audio.text()).toBe(AUDIO_MARKER);
      expect(foreign.status()).toBe(404);
      expect(await foreign.text()).not.toBe(AUDIO_MARKER);
    } finally {
      await ownerContext.close();
    }
  });

  test("PIN change requires the current PIN, rejects a wrong one, and the parent can still reset", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const id = suffix();
    const child = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Pin child ${id}`,
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(context, child.handle, CURRENT_PIN);
      const page = await context.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await page.getByRole("button", { name: "Change PIN" }).click();
      await expect(page.getByTestId("child-current-pin")).toBeVisible();

      await page.getByTestId("child-current-pin").fill(WRONG_PIN);
      await page.getByTestId("child-new-pin").fill(NEXT_PIN);
      await page.getByTestId("child-confirm-pin").fill(NEXT_PIN);
      await page.getByTestId("child-pin-submit").click();
      await expect(page.getByTestId("child-pin-error")).toBeVisible({ timeout: 15_000 });

      await page.getByTestId("child-current-pin").fill(CURRENT_PIN);
      await page.getByTestId("child-new-pin").fill(NEXT_PIN);
      await page.getByTestId("child-confirm-pin").fill(NEXT_PIN);
      await page.getByTestId("child-pin-submit").click();
      await expect(page.getByTestId("child-pin-saved")).toBeVisible({ timeout: 15_000 });

      const mailed = readHarnessMailUrl("account-holder", TEST_PARENT.email);
      expect(mailed).toContain(`/account/children/${child.learnerProfileId}`);
    } finally {
      await context.close();
    }

    const parentContext = await browser.newContext({
      storageState: "tests/integration/.auth/parent.json",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const reset = await parentContext.request.patch(
        `/api/learner-profiles/${child.learnerProfileId}/credentials`,
        { data: { newPin: PARENT_RESET_PIN } }
      );
      expect(reset.ok()).toBe(true);
    } finally {
      await parentContext.close();
    }

    const relogin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(relogin, child.handle, PARENT_RESET_PIN);
      const page = await relogin.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(`Pin child ${id}`)).toBeVisible({ timeout: 15_000 });
    } finally {
      await relogin.close();
    }
  });

  test("child audio stays off until a parent restores it, and a parent-only limit does not say the parent turned it back on", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const id = suffix();
    const displayName = `Consent child ${id}`;
    const child = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName,
    });
    const audioSwitch = "child-consent-child-allowAudioRecording";

    const childContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(childContext, child.handle, CURRENT_PIN);
      const childPage = await childContext.newPage();
      await childPage.goto("/join", { waitUntil: "domcontentloaded" });
      await childPage.waitForLoadState("networkidle", { timeout: 15_000 });
      const audio = childPage.getByTestId(audioSwitch);
      await expect(audio).toBeChecked({ timeout: 15_000 });
      await audio.click();
      await expect(audio).not.toBeChecked({ timeout: 15_000 });

      await childPage.reload({ waitUntil: "domcontentloaded" });
      await childPage.waitForLoadState("networkidle", { timeout: 15_000 });
      await expect(childPage.getByTestId(audioSwitch)).not.toBeChecked({ timeout: 15_000 });

      await childPage.getByTestId(audioSwitch).click();
      await expect(childPage.getByText("Only a parent can turn this back on.")).toBeVisible({
        timeout: 15_000,
      });
      await expect(childPage.getByTestId(audioSwitch)).not.toBeChecked();
    } finally {
      await childContext.close();
    }

    const parentContext = await browser.newContext({
      storageState: "tests/integration/.auth/parent.json",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const parentPage = await parentContext.newPage();
      await parentPage.goto(`/account/children/${child.learnerProfileId}/consent`, {
        waitUntil: "domcontentloaded",
      });
      await parentPage.waitForLoadState("networkidle", { timeout: 15_000 });
      await expect(parentPage.getByText(`${displayName} turned these off`)).toBeVisible({
        timeout: 15_000,
      });
      const restore = parentPage.getByTestId("parent-restore-consent-child-off-allowAudioRecording");
      await expect(restore).toBeVisible();
      await expect(restore).not.toBeChecked();
      await restore.click();
      await parentPage.getByTestId("parent-consent-save-btn").click();
      await expect(parentPage.getByTestId("parent-consent-saved-alert")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await parentContext.close();
    }

    const restoredContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(restoredContext, child.handle, CURRENT_PIN);
      const restoredPage = await restoredContext.newPage();
      await restoredPage.goto("/join", { waitUntil: "domcontentloaded" });
      await restoredPage.waitForLoadState("networkidle", { timeout: 15_000 });
      await expect(restoredPage.getByTestId(audioSwitch)).toBeChecked({ timeout: 15_000 });
      await expect(restoredPage.getByText(PARENT_RESTORED)).toHaveCount(1);
      await expect(consentRow(restoredPage, audioSwitch).getByText(PARENT_RESTORED)).toBeVisible();
      await expect(
        consentRow(restoredPage, "child-consent-child-allowLiveSession").getByText(PARENT_RESTORED)
      ).toHaveCount(0);
      await expect(
        consentRow(restoredPage, "child-consent-child-allowWhiteboardRecording").getByText(
          PARENT_RESTORED
        )
      ).toHaveCount(0);
      await expect(
        consentRow(restoredPage, "child-consent-child-allowNoteSending").getByText(PARENT_RESTORED)
      ).toHaveCount(0);
    } finally {
      await restoredContext.close();
    }

    const limitContext = await browser.newContext({
      storageState: "tests/integration/.auth/parent.json",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const limitPage = await limitContext.newPage();
      await limitPage.goto(`/account/children/${child.learnerProfileId}/consent`, {
        waitUntil: "domcontentloaded",
      });
      await limitPage.waitForLoadState("networkidle", { timeout: 15_000 });
      const alwaysOff = limitPage.getByRole("checkbox", { name: "Always block audio recording" });
      await expect(alwaysOff).toBeVisible({ timeout: 15_000 });
      await alwaysOff.check();
      await limitPage.getByTestId("parent-consent-save-btn").click();
      await expect(limitPage.getByTestId("parent-consent-saved-alert")).toBeVisible({
        timeout: 15_000,
      });
      await alwaysOff.uncheck();
      await expect(limitPage.getByTestId("parent-consent-saved-alert")).toHaveCount(0);
      await limitPage.getByTestId("parent-consent-save-btn").click();
      await expect(limitPage.getByTestId("parent-consent-saved-alert")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await limitContext.close();
    }

    const clearedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(clearedContext, child.handle, CURRENT_PIN);
      const clearedPage = await clearedContext.newPage();
      await clearedPage.goto("/join", { waitUntil: "domcontentloaded" });
      await clearedPage.waitForLoadState("networkidle", { timeout: 15_000 });
      await expect(clearedPage.getByTestId(audioSwitch)).toBeChecked({ timeout: 15_000 });
      await expect(clearedPage.getByText(PARENT_RESTORED)).toHaveCount(0);
    } finally {
      await clearedContext.close();
    }
  });
});
